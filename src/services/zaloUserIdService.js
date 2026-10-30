import axios from 'axios';
import { normalizePhoneNumber } from './zaloHelper';

/**
 * Dịch vụ tra cứu Zalo User ID theo số điện thoại.
 *
 * Zalo giới hạn số lần tìm kiếm theo SĐT (~30 lần / giờ). Module này:
 *  - Ghi nhận mọi lượt tìm vào localStorage để tự canh "hạn mức" theo cửa sổ trượt 60 phút.
 *  - Nhận diện phản hồi bị Zalo giới hạn (HTTP 429 / nội dung lỗi) để tạm nghỉ có kiểm soát.
 *  - Cache kết quả tra cứu theo SĐT để không tốn thêm lượt khi chạy lại.
 *  - Lưu tiến trình công việc để có thể tiếp tục sau khi giới hạn được gỡ.
 */

const QUOTA_KEY_BASE = 'zalo_phone_search_quota_v1';
const CACHE_KEY_BASE = 'zalo_phone_lookup_cache_v1';
const JOB_KEY_BASE = 'zalo_userid_job_v1';
const LEGACY_KEYS = [QUOTA_KEY_BASE, CACHE_KEY_BASE, JOB_KEY_BASE];

let legacyCleanupDone = false;

export const SEARCH_WINDOW_MS = 60 * 60 * 1000; // cửa sổ 1 giờ
export const DEFAULT_HOURLY_LIMIT = 30;
export const DEFAULT_THROTTLE_SEC = 1.5;

const FOUND_CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 ngày
const NEGATIVE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày
const BLOCKED_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày
const MAX_CACHE_ENTRIES = 4000;

const RATE_LIMIT_PATTERNS = [
  /too\s*many/i,
  /rate[\s-]?limit/i,
  /vượt\s*quá/i,
  /quá\s*(số\s*)?lần/i,
  /quá\s*nhiều/i,
  /giới\s*hạn/i,
  /thử\s*lại\s*sau/i,
  /tạm\s*(thời\s*)?(bị\s*)?(khóa|khoá|chặn)\s*(tìm|tính\s*năng)/i,
  /spam/i,
  /\b(221|114)\b/,
  /limit\s*reached/i,
  /request\s*limit/i
];

const BLOCKED_PATTERNS = [/bị\s*chặn/i, /đã\s*bị\s*khóa/i, /blocked/i];
const NOT_FOUND_PATTERNS = [
  /không\s*tìm\s*thấy/i,
  /không\s*tồn\s*tại/i,
  /không\s*hợp\s*lệ/i,
  /not\s*found/i,
  /user\s*not\s*exist/i,
  /invalid/i
];

// Zalo trả về tài khoản hệ thống khi SĐT không gắn với người dùng thật
const SYSTEM_ACCOUNT_NAMES = ['truyền file', 'truyen file', 'file transfer'];

const readJson = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (err) {
    console.warn('[zaloUserId] Không đọc được dữ liệu lưu tạm:', key, err?.message || err);
    return fallback;
  }
};

const writeJson = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[zaloUserId] Không ghi được dữ liệu lưu tạm:', key, err?.message || err);
  }
};

/**
 * Định danh môi trường hiện tại (project Supabase + schema + app id).
 * Dùng để tách dữ liệu lưu tạm giữa các môi trường/khách hàng khác nhau trên cùng 1 trình duyệt.
 */
const getEnvScope = () => {
  const schema = process.env.REACT_APP_SUPABASE_SCHEMA || 'public';
  let host = '';
  try {
    host = new URL(process.env.REACT_APP_SUPABASE_URL || '').host;
  } catch (err) {
    host = '';
  }
  const appId = typeof window !== 'undefined' ? resolveZaloAppId() : 'default';
  return [host, schema, appId].filter(Boolean).join('|');
};

/**
 * Khóa localStorage đã được scope theo môi trường.
 * Ví dụ: zalo_userid_job_v1:lxirsdhjpmriyedovfat.supabase.co|mrsdung|mrsdung
 */
export const getZaloStorageKeys = () => {
  const scope = getEnvScope();
  return {
    scope,
    quota: `${QUOTA_KEY_BASE}:${scope}`,
    cache: `${CACHE_KEY_BASE}:${scope}`,
    job: `${JOB_KEY_BASE}:${scope}`
  };
};

/**
 * Dữ liệu của phiên bản cũ dùng khóa chung (không scope) nên bị lẫn giữa các môi trường.
 * Dọn 1 lần để không hiển thị tiến trình của database khác.
 */
const cleanupLegacyKeys = () => {
  if (legacyCleanupDone || typeof window === 'undefined') return;
  legacyCleanupDone = true;
  try {
    LEGACY_KEYS.forEach((key) => {
      if (window.localStorage.getItem(key) !== null) {
        window.localStorage.removeItem(key);
        console.info(`[zaloUserId] Đã xóa dữ liệu tra cứu cũ dùng khóa chung: ${key}`);
      }
    });
  } catch (err) {
    console.warn('[zaloUserId] Không dọn được dữ liệu cũ:', err?.message || err);
  }
};

const scopedKey = (type) => {
  cleanupLegacyKeys();
  return getZaloStorageKeys()[type];
};

/** App id dùng cho header X-App-Id của backend Zalo (đồng bộ với zaloSocketClient). */
export const resolveZaloAppId = () => {
  const fromEnv =
    process.env.REACT_APP_APP_ID ||
    process.env.REACT_APP_BUILD_PATH ||
    process.env.REACT_APP_SUPABASE_SCHEMA ||
    process.env.BUILD_PATH;
  if (fromEnv) return fromEnv;

  const hostname = window.location.hostname;
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') return hostname;
  return 'default';
};

export const getZaloBackendUrl = () => process.env.REACT_APP_ZALO_API_URL || 'http://localhost:5000';

export const isRateLimitMessage = (message) => {
  const text = String(message || '');
  if (!text.trim()) return false;
  return RATE_LIMIT_PATTERNS.some((re) => re.test(text));
};

const isBlockedMessage = (message) => BLOCKED_PATTERNS.some((re) => re.test(String(message || '')));
const isNotFoundMessage = (message) => NOT_FOUND_PATTERNS.some((re) => re.test(String(message || '')));

const isSystemAccount = (contact) => {
  const names = [contact?.resolvedName, contact?.displayName, contact?.alias, contact?.raw?.zalo_name]
    .map((value) => String(value || '').trim().toLowerCase());
  return names.some((name) => SYSTEM_ACCOUNT_NAMES.includes(name));
};

const parseRetryAfter = (rawValue) => {
  if (!rawValue) return 0;
  const asNumber = Number(rawValue);
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber * 1000;
  const asDate = Date.parse(rawValue);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return 0;
};

export const extractZaloUserId = (contact) => {
  if (!contact) return '';
  const raw = contact.userId || contact.uid || contact.zaloId || contact.id || contact.user_id || '';
  return raw ? String(raw) : '';
};

/* ────────────────────────────── Hạn mức tìm kiếm ────────────────────────────── */

export const getQuotaLog = () => {
  const log = readJson(scopedKey('quota'), []);
  if (!Array.isArray(log)) return [];
  const cutoff = Date.now() - SEARCH_WINDOW_MS;
  return log
    .filter((entry) => entry && typeof entry.t === 'number' && entry.t >= cutoff)
    .sort((a, b) => a.t - b.t);
};

export const getQuotaSnapshot = (hourlyLimit = DEFAULT_HOURLY_LIMIT) => {
  const limit = Math.max(1, Number(hourlyLimit) || DEFAULT_HOURLY_LIMIT);
  const log = getQuotaLog();
  const used = log.length;
  const remaining = Math.max(0, limit - used);
  const resetAt = used >= limit ? log[0].t + SEARCH_WINDOW_MS : null;
  return { limit, used, remaining, resetAt, windowMs: SEARCH_WINDOW_MS };
};

const recordSearchAttempt = (phone) => {
  const log = getQuotaLog();
  log.push({ t: Date.now(), phone: String(phone || '') });
  writeJson(scopedKey('quota'), log);
  return log.length;
};

export const resetQuotaLog = () => {
  try {
    window.localStorage.removeItem(scopedKey('quota'));
  } catch (err) {
    console.warn('[zaloUserId] Không xóa được log hạn mức:', err?.message || err);
  }
};

/* ─────────────────────────── Cache kết quả tra cứu ─────────────────────────── */

export const getCachedLookup = (phone) => {
  const cleanPhone = normalizePhoneNumber(phone);
  if (!cleanPhone) return null;
  const cache = readJson(scopedKey('cache'), {});
  if (!cache || typeof cache !== 'object') return null;
  const entry = cache[cleanPhone];
  if (!entry || !entry.status) return null;

  const ttl =
    entry.status === 'found'
      ? FOUND_CACHE_TTL_MS
      : entry.status === 'blocked'
        ? BLOCKED_CACHE_TTL_MS
        : entry.status === 'not_found'
          ? NEGATIVE_CACHE_TTL_MS
          : 0;
  if (!ttl) return null;
  if (Date.now() - (entry.at || 0) > ttl) return null;

  return {
    status: entry.status,
    userId: entry.userId || '',
    name: entry.name || '',
    message: entry.message || '',
    fromCache: true,
    cachedAt: entry.at || 0
  };
};

export const setCachedLookup = (phone, result) => {
  const cleanPhone = normalizePhoneNumber(phone);
  if (!cleanPhone || !result) return;
  if (!['found', 'not_found', 'blocked'].includes(result.status)) return;

  const cache = readJson(scopedKey('cache'), {});
  const nextCache = cache && typeof cache === 'object' && !Array.isArray(cache) ? { ...cache } : {};
  nextCache[cleanPhone] = {
    status: result.status,
    userId: result.userId || '',
    name: result.name || '',
    message: result.message || '',
    at: Date.now()
  };

  const keys = Object.keys(nextCache);
  if (keys.length > MAX_CACHE_ENTRIES) {
    keys
      .sort((a, b) => (nextCache[a]?.at || 0) - (nextCache[b]?.at || 0))
      .slice(0, keys.length - MAX_CACHE_ENTRIES)
      .forEach((key) => delete nextCache[key]);
  }

  writeJson(scopedKey('cache'), nextCache);
};

export const clearLookupCache = () => {
  try {
    window.localStorage.removeItem(scopedKey('cache'));
  } catch (err) {
    console.warn('[zaloUserId] Không xóa được cache tra cứu:', err?.message || err);
  }
};

/* ──────────────────────────────── Gọi API Zalo ──────────────────────────────── */

/**
 * Tra cứu tài khoản Zalo theo SĐT.
 * @returns {Promise<{status:'found'|'not_found'|'blocked'|'rate_limited'|'error'|'invalid', userId?:string, name?:string, message?:string, contact?:any, retryAfterMs?:number}>}
 */
export async function searchZaloUserByPhone(rawPhone, { timeout = 30000 } = {}) {
  const phone = normalizePhoneNumber(rawPhone);
  if (!phone) {
    return { status: 'invalid', message: 'Số điện thoại không hợp lệ' };
  }

  recordSearchAttempt(phone);

  let response;
  try {
    response = await axios.get(`${getZaloBackendUrl()}/api/zalo/search-phone`, {
      params: { phone },
      timeout,
      headers: { 'X-App-Id': resolveZaloAppId() },
      validateStatus: () => true
    });
  } catch (err) {
    const errorMessage = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Lỗi kết nối';
    if (isRateLimitMessage(errorMessage)) {
      return { status: 'rate_limited', message: errorMessage };
    }
    return { status: 'error', message: errorMessage };
  }

  const data = response?.data || {};
  const serverMessage = data.error || data.message || '';
  const retryAfterMs = parseRetryAfter(response?.headers?.['retry-after']);

  if (response?.status === 429 || isRateLimitMessage(serverMessage)) {
    return { status: 'rate_limited', message: serverMessage || `HTTP ${response?.status}`, retryAfterMs };
  }

  if (data.success && data.found && data.contact) {
    const userId = extractZaloUserId(data.contact);
    if (!userId) {
      return { status: 'not_found', message: 'Zalo không trả về User ID cho SĐT này' };
    }
    if (isSystemAccount(data.contact)) {
      return { status: 'not_found', message: 'SĐT không gắn với tài khoản Zalo của người dùng' };
    }
    return {
      status: 'found',
      userId,
      name: data.contact.resolvedName || data.contact.alias || data.contact.displayName || '',
      contact: data.contact
    };
  }

  if (isBlockedMessage(serverMessage)) {
    return { status: 'blocked', message: serverMessage };
  }
  if (isNotFoundMessage(serverMessage) || (response?.status === 200 && data.success === false)) {
    return { status: 'not_found', message: serverMessage || 'Không tìm thấy tài khoản Zalo' };
  }
  if (response?.status >= 400) {
    return { status: 'error', message: serverMessage || `HTTP ${response.status}` };
  }
  return { status: 'not_found', message: serverMessage || 'Không tìm thấy tài khoản Zalo' };
}

/* ─────────────────────────── Lưu / đọc tiến trình job ─────────────────────────── */

export const loadZaloUserIdJob = () => {
  const job = readJson(scopedKey('job'), null);
  if (!job || !Array.isArray(job.items) || job.items.length === 0) return null;
  // Bỏ qua tiến trình được tạo ở môi trường khác (đổi .env / schema) để không hiển thị sai số lượng
  if (job.env && job.env !== getEnvScope()) {
    console.info('[zaloUserId] Bỏ qua tiến trình của môi trường khác:', job.env);
    return null;
  }
  return job;
};

export const saveZaloUserIdJob = (job) => {
  if (!job) return;
  writeJson(scopedKey('job'), { ...job, env: getEnvScope() });
};

export const clearZaloUserIdJob = () => {
  try {
    window.localStorage.removeItem(scopedKey('job'));
  } catch (err) {
    console.warn('[zaloUserId] Không xóa được tiến trình:', err?.message || err);
  }
};
