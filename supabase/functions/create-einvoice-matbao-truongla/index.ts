import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * create-einvoice-matbao-truongla
 *
 * - Tên schema ưu tiên lấy từ bản build static (Render) gửi lên qua body.schema,
 *   giá trị này được nhúng lúc build từ REACT_APP_SUPABASE_SCHEMA.
 *   Thứ tự: body.schema > env của function (SCHEMA_NAME / REACT_APP_SUPABASE_SCHEMA / SUPABASE_SCHEMA / DB_SCHEMA) > "truongla".
 * - Đọc các biến cấu hình Mắt Bão (matbao_*) trong bảng tbl_config của schema đó.
 * - Đăng nhập Mắt Bão và gửi dữ liệu hóa đơn tới API create-invoice.
 *
 * Body hỗ trợ:
 *   { invoices: [ ...payload Mắt Bão... ], schema: "truongla" }
 *   [ ...payload Mắt Bão... ]                 // hoặc gửi thẳng mảng payload
 *   { endpoint, method, headers, body, schema } // tương thích proxy cũ (login/templates/download)
 */

const FUNCTION_NAME = "create-einvoice-matbao-truongla";
const DEFAULT_MATBAO_BASE_URL = "https://demo-api-hddt.matbao.in:11443";
const TOKEN_SAFETY_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = Number(Deno.env.get("MATBAO_REQUEST_TIMEOUT_MS") || 45000);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type DbConfig = Record<string, any>;

let cachedToken: { accessToken: string; expiredAt: number; baseUrl: string } | null = null;
let cachedBaseUrl: string | null = null;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const DEFAULT_SCHEMA = "truongla";
const SCHEMA_PATTERN = /^[a-z_][a-z0-9_]*$/i;

const sanitizeSchema = (raw: unknown) => {
  const value = String(raw ?? "").trim();
  if (!value || !SCHEMA_PATTERN.test(value)) return "";
  return value;
};

/**
 * Schema do bản build static trên Render gửi lên (nhúng từ REACT_APP_SUPABASE_SCHEMA)
 * được ưu tiên hơn biến môi trường của function.
 */
const getSchemaName = (requestedSchema?: unknown) =>
  sanitizeSchema(requestedSchema) ||
  sanitizeSchema(Deno.env.get("SCHEMA_NAME")) ||
  sanitizeSchema(Deno.env.get("REACT_APP_SUPABASE_SCHEMA")) ||
  sanitizeSchema(Deno.env.get("SUPABASE_SCHEMA")) ||
  sanitizeSchema(Deno.env.get("DB_SCHEMA")) ||
  DEFAULT_SCHEMA;

const normalizeBaseUrl = (raw?: string | null) => {
  const value = String(raw || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

const getBaseUrlCandidates = (dbConfig: DbConfig) => {
  const urls = [
    normalizeBaseUrl(dbConfig.matbao_base_url),
    normalizeBaseUrl(Deno.env.get("MATBAO_BASE_URL")),
    DEFAULT_MATBAO_BASE_URL,
  ].filter(Boolean);
  return [...new Set(urls)];
};

const fetchWithTimeout = async (url: string, init: RequestInit = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const readJson = async (res: Response): Promise<{ data: any | null; text: string }> => {
  const text = await res.text();
  try {
    return { data: JSON.parse(text), text };
  } catch {
    return { data: null, text };
  }
};

/** Đọc bảng tbl_config trong schema lấy từ client (Render build) hoặc env */
const loadConfig = async (requestedSchema?: unknown) => {
  const schema = getSchemaName(requestedSchema);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("REACT_APP_SUPABASE_URL") || "";
  const supabaseKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY") ||
    Deno.env.get("REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY") ||
    "";

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Thiếu SUPABASE_URL hoặc khóa Supabase (SERVICE_ROLE_KEY/ANON_KEY) để đọc tbl_config.");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { db: { schema } });
  const { data, error } = await supabase.from("tbl_config").select("*").limit(1).maybeSingle();

  if (error) {
    throw new Error(`Không đọc được tbl_config (schema ${schema}): ${error.message}`);
  }

  return { dbConfig: (data || {}) as DbConfig, schema };
};

/** Đăng nhập Mắt Bão, tự dò base URL hợp lệ trong tbl_config / env / mặc định */
const loginMatBao = async (dbConfig: DbConfig) => {
  const mst = dbConfig.matbao_mst || Deno.env.get("MATBAO_MST") || "";
  const username = dbConfig.matbao_username || Deno.env.get("MATBAO_USERNAME") || "";
  const password = dbConfig.matbao_password || Deno.env.get("MATBAO_PASSWORD") || "";

  if (!mst || !username || !password) {
    throw new Error("Thiếu matbao_mst / matbao_username / matbao_password trong tbl_config.");
  }

  const candidates = getBaseUrlCandidates(dbConfig);
  if (cachedBaseUrl) {
    const index = candidates.indexOf(cachedBaseUrl);
    if (index > 0) {
      candidates.splice(index, 1);
      candidates.unshift(cachedBaseUrl);
    }
  }

  const errors: string[] = [];

  for (const baseUrl of candidates) {
    try {
      const res = await fetchWithTimeout(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ MST: mst, TDNhap: username, MKhau: password }),
      });
      const { data, text } = await readJson(res);

      // Host không phải API (trả HTML/400 hoặc JSON lạ) => thử ứng viên kế tiếp
      if (!data || data.errorCode === undefined) {
        errors.push(`${baseUrl} -> HTTP ${res.status}: ${text.slice(0, 120)}`);
        continue;
      }

      if (data.errorCode !== 200 || !data.data?.accessToken) {
        throw new Error(data.message || `Đăng nhập Mắt Bão thất bại (mã ${data.errorCode ?? "?"}).`);
      }

      const expiredAtMs = new Date(data.data.expiredDate).getTime();
      cachedBaseUrl = baseUrl;
      cachedToken = {
        accessToken: data.data.accessToken,
        expiredAt: Number.isFinite(expiredAtMs) ? expiredAtMs : Date.now() + 30 * 60 * 1000,
        baseUrl,
      };

      console.log(`[${FUNCTION_NAME}] Đăng nhập Mắt Bão thành công qua ${baseUrl}`);
      return { token: cachedToken, loginResponse: data };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Đăng nhập Mắt Bão thất bại")) {
        throw err;
      }
      errors.push(`${baseUrl} -> ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`Không kết nối được API Mắt Bão. ${errors.join(" | ")}`);
};

const getAccessToken = async (dbConfig: DbConfig, forceRefresh = false) => {
  if (!forceRefresh && cachedToken && cachedToken.expiredAt > Date.now() + TOKEN_SAFETY_MS) {
    return cachedToken;
  }
  const { token } = await loginMatBao(dbConfig);
  return token;
};

/** Bổ sung các giá trị mặc định từ tbl_config nếu client chưa gửi */
const buildInvoicePayload = (input: unknown, dbConfig: DbConfig) => {
  const invoices = Array.isArray(input) ? input : [input];
  const khmshDon = dbConfig.matbao_khmshdon || Deno.env.get("MATBAO_KHMSHDON") || "";
  const khhDon = dbConfig.matbao_khhdon || Deno.env.get("MATBAO_KHHDON") || "";
  const loaiHDonRaw = dbConfig.matbao_loaihdon ?? Deno.env.get("MATBAO_LOAI_HDON");
  const hinhThucTT = dbConfig.matbao_hinhthuctt || Deno.env.get("MATBAO_HINHTHUC_TT") || "";

  const configuredLoaiHDon =
    loaiHDonRaw !== undefined && loaiHDonRaw !== null && loaiHDonRaw !== "" ? Number(loaiHDonRaw) : null;

  return invoices
    .filter((item) => item && typeof item === "object")
    .map((raw) => {
      const invoice = raw as Record<string, any>;
      const invoiceLoaiHDon =
        invoice.LoaiHDon !== undefined && invoice.LoaiHDon !== null && invoice.LoaiHDon !== ""
          ? Number(invoice.LoaiHDon)
          : 0;
      const loaiHDon = configuredLoaiHDon !== null && Number.isFinite(configuredLoaiHDon)
        ? configuredLoaiHDon
        : invoiceLoaiHDon;

      return {
        ...invoice,
        KHMSHDon: khmshDon || invoice.KHMSHDon || "1",
        KHHDon: khhDon || invoice.KHHDon || "C26TAT",
        LoaiHDon: Number.isFinite(loaiHDon) ? loaiHDon : 0,
        HTTToan: hinhThucTT || invoice.HTTToan || "TM/CK",
      };
    });
};

const createInvoiceOnMatBao = async (dbConfig: DbConfig, rawInvoices: unknown) => {
  const invoices = buildInvoicePayload(rawInvoices, dbConfig);
  if (invoices.length === 0) {
    throw new Error("Thiếu dữ liệu hóa đơn để tạo (invoices).");
  }

  let tokenInfo = await getAccessToken(dbConfig);

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchWithTimeout(`${tokenInfo.baseUrl}/api/invoice/create-invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenInfo.accessToken}`,
      },
      body: JSON.stringify(invoices),
    });

    const { data, text } = await readJson(res);
    if (!data) {
      throw new Error(`API Mắt Bão trả về dữ liệu không hợp lệ (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }

    const authFailed =
      res.status === 401 || res.status === 403 || data.errorCode === 401 || data.errorCode === 403;

    if (authFailed && attempt === 0) {
      cachedToken = null;
      tokenInfo = await getAccessToken(dbConfig, true);
      continue;
    }

    return { data, status: res.status };
  }

  throw new Error("Không thể xác thực với Mắt Bão để tạo hóa đơn.");
};

/** Tương thích proxy cũ: login / templates / download */
const forwardMatBaoRequest = async (dbConfig: DbConfig, reqBody: Record<string, any>) => {
  const endpoint = String(reqBody.endpoint || "");
  if (!endpoint) {
    throw new Error("Missing endpoint parameter");
  }

  if (endpoint.includes("/api/auth/login")) {
    const { loginResponse } = await loginMatBao(dbConfig);
    return { data: loginResponse, status: 200 };
  }

  const tokenInfo = await getAccessToken(dbConfig);
  const method = String(reqBody.method || "POST").toUpperCase();
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(reqBody.headers || {}),
    Authorization: `Bearer ${tokenInfo.accessToken}`,
  };

  const init: RequestInit = { method, headers };
  if (reqBody.body && method !== "GET" && method !== "HEAD") {
    init.body = typeof reqBody.body === "string" ? reqBody.body : JSON.stringify(reqBody.body);
  }

  const res = await fetchWithTimeout(`${tokenInfo.baseUrl}${cleanEndpoint}`, init);
  const { data, text } = await readJson(res);
  return data ? { data, status: res.status } : { data: { raw: text }, status: res.status };
};

const looksLikeInvoice = (value: any) =>
  value && typeof value === "object" && !Array.isArray(value) &&
  (value.KHMSHDon !== undefined || value.NMua_Ten !== undefined || value.DSHHDVu !== undefined);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return jsonResponse({ error: "Body JSON không hợp lệ." }, 400);
    }

    const requestedSchema = Array.isArray(body) ? undefined : body.schema;
    const { dbConfig, schema } = await loadConfig(requestedSchema);
    console.log(`[${FUNCTION_NAME}] Schema: ${schema}`);

    // Proxy tương thích (login/templates/download)
    if (!Array.isArray(body) && typeof body === "object" && body.endpoint) {
      const result = await forwardMatBaoRequest(dbConfig, body);
      return jsonResponse(result.data, result.status);
    }

    const rawInvoices = Array.isArray(body)
      ? body
      : looksLikeInvoice(body)
        ? body
        : body.invoices ?? body.payload ?? body.invoicePayload ?? body.data;

    if (!rawInvoices) {
      return jsonResponse({ error: "Thiếu dữ liệu hóa đơn (invoices)." }, 400);
    }

    const { data, status } = await createInvoiceOnMatBao(dbConfig, rawInvoices);
    return jsonResponse(data, status);
  } catch (err) {
    console.error(`[${FUNCTION_NAME}] Error:`, err);
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});