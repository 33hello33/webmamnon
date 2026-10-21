import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { endpoint, method = "POST", headers = {}, body } = payload;

    if (!endpoint) {
      return new Response(JSON.stringify({ error: "Missing endpoint parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 1. Khởi tạo Supabase client với schema truongla để truy vấn thông tin cấu hình nếu cần
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const schemaName = payload.schema || Deno.env.get("SUPABASE_SCHEMA") || "truongla";

    let dbConfig: Record<string, any> = {};
    if (supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
          db: { schema: schemaName },
        });

        // Lấy cấu hình từ tbl_config trong schema truongla
        const { data, error } = await supabase
          .from("tbl_config")
          .select("*")
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          dbConfig = data;
        }
      } catch (dbErr) {
        console.warn(`[matbao-proxy] Không thể đọc tbl_config từ schema ${schemaName}:`, dbErr);
      }
    }

    // 2. Xác định baseUrl mục tiêu của Mắt Bão:
    // Ưu tiên: payload.baseUrl > dbConfig.matbao_base_url > ENV > Default demo URL
    const targetBaseUrl =
      payload.baseUrl ||
      dbConfig.matbao_base_url ||
      Deno.env.get("MATBAO_BASE_URL") ||
      "https://demo-api-hddt.matbao.in:11443";

    const cleanBase = targetBaseUrl.replace(/\/+$/, "");
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const targetUrl = `${cleanBase}${cleanEndpoint}`;

    // 3. Nếu endpoint là /api/auth/login và body chưa có đủ tài khoản/mật khẩu, bổ sung từ dbConfig (schema truongla)
    let finalBody = body;
    if (endpoint.includes("/api/auth/login") && typeof body === "object" && body !== null) {
      finalBody = {
        MST: body.MST || dbConfig.matbao_mst || Deno.env.get("MATBAO_MST"),
        TDNhap: body.TDNhap || dbConfig.matbao_username || Deno.env.get("MATBAO_USERNAME"),
        MKhau: body.MKhau || dbConfig.matbao_password || Deno.env.get("MATBAO_PASSWORD"),
        ...body,
      };
    }

    const forwardHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };

    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers: forwardHeaders,
    };

    if (finalBody && fetchOptions.method !== "GET" && fetchOptions.method !== "HEAD") {
      fetchOptions.body = typeof finalBody === "string" ? finalBody : JSON.stringify(finalBody);
    }

    console.log(`[matbao-proxy] [Schema: ${schemaName}] Forwarding ${fetchOptions.method} request to: ${targetUrl}`);
    const response = await fetch(targetUrl, fetchOptions);

    const resContentType = response.headers.get("content-type") || "";
    if (resContentType.includes("application/json")) {
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } else {
      const text = await response.text();
      return new Response(text, {
        status: response.status,
        headers: { "Content-Type": resContentType || "text/plain", ...corsHeaders },
      });
    }
  } catch (err: any) {
    console.error("[matbao-proxy] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal Proxy Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
