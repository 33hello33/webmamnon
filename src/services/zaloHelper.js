import axios from 'axios';
import { supabase } from '../supabase';

/**
 * Xác định backend Zalo đã xử lý thành công hay chưa
 * (một số endpoint trả 200 nhưng success: false).
 */
export const isZaloRequestSuccessful = (response) => (
  Boolean(response?.data?.success) || (response?.status === 200 && response?.data?.success !== false)
);

// Bộ nhớ đệm tạm thời cho danh sách alias & friends để tránh gửi quá nhiều request khi gửi hàng loạt
let cachedAliases = null;
let cachedFriends = null;
let cacheTimestamp = 0;
let aliasEndpointUnsupported = false;
const CACHE_TTL_MS = 60000; // Cache 60 giây

// Cache thông tin Zalo của học viên (zalo_user_id, SĐT ba/mẹ) theo mã HV
const studentZaloInfoCache = new Map();

// Tắt ghi zalo_user_id nếu bảng tbl_hv chưa có cột này (tránh lặp lỗi khi gửi hàng loạt)
let canPersistZaloUserId = true;

const isMissingZaloUserIdColumn = (err) => {
  const message = String(err?.message || err || '');
  return err?.code === '42703' || (/zalo_user_id/i.test(message) && /column|does not exist/i.test(message));
};

export const getZaloBackendUrl = (zaloBackendUrl) => (
  zaloBackendUrl || process.env.REACT_APP_ZALO_API_URL || 'http://localhost:5000'
);

/**
 * Chuẩn hóa số điện thoại Việt Nam
 */
export const normalizePhoneNumber = (raw) => {
  if (!raw) return '';
  return String(raw)
    .replace(/\s+/g, '')
    .replace(/[\.-]/g, '')
    .replace(/^\+84/, '0')
    .replace(/^84/, '0')
    .trim();
};

/**
 * Xóa cache alias/friends
 */
export const clearZaloRecipientCache = () => {
  cachedAliases = null;
  cachedFriends = null;
  cacheTimestamp = 0;
  aliasEndpointUnsupported = false;
  studentZaloInfoCache.clear();
};

/**
 * Đọc zalo_user_id (và SĐT ba/mẹ) đã lưu trong tbl_hv theo mã học viên.
 * Có cache 60 giây để không phát sinh thêm truy vấn khi gửi hàng loạt.
 */
export async function getStudentZaloInfo(mahv, forceRefresh = false) {
  const key = String(mahv || '').trim();
  if (!key) return null;

  const cached = studentZaloInfoCache.get(key);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const { data, error } = await supabase
      .from('tbl_hv')
      .select('*')
      .eq('mahv', key)
      .maybeSingle();
    if (error) throw error;

    const info = data ? {
      tenhv: data.tenhv || '',
      sdtme: data.sdtme || '',
      sdtba: data.sdtba || '',
      zaloUserId: String(data.zalo_user_id || '').trim()
    } : null;

    studentZaloInfoCache.set(key, { data: info, timestamp: Date.now() });
    return info;
  } catch (e) {
    console.warn('[zaloHelper] Không đọc được thông tin Zalo từ tbl_hv:', e?.message || e);
    return null;
  }
}

/**
 * Lưu zalo_user_id vừa tra cứu được vào tbl_hv để các lần gửi sau dùng trực tiếp.
 * Không chặn luồng gửi tin nếu ghi thất bại.
 */
export async function saveStudentZaloUserId(mahv, zaloUserId) {
  const key = String(mahv || '').trim();
  const uid = String(zaloUserId || '').trim();
  if (!key || !uid || !canPersistZaloUserId) return false;

  const cached = studentZaloInfoCache.get(key);
  if (cached?.data?.zaloUserId === uid) return true;

  try {
    const { error } = await supabase
      .from('tbl_hv')
      .update({ zalo_user_id: uid })
      .eq('mahv', key);
    if (error) throw error;

    if (cached?.data) {
      studentZaloInfoCache.set(key, {
        data: { ...cached.data, zaloUserId: uid },
        timestamp: Date.now()
      });
    }
    return true;
  } catch (e) {
    if (isMissingZaloUserIdColumn(e)) canPersistZaloUserId = false;
    console.warn(`[zaloHelper] Không lưu được zalo_user_id cho ${key}:`, e?.message || e);
    return false;
  }
}

// Ưu tiên khớp chính xác alias, sau đó mới khớp một phần để tránh gửi nhầm người nhận
const pickAliasMatch = (items, lowerMahv, getText) => {
  const normalized = (items || [])
    .map(item => ({ item, text: String(getText(item) || '').toLowerCase().trim() }))
    .filter(entry => entry.text);

  return (
    normalized.find(entry => entry.text === lowerMahv)?.item ||
    normalized.find(entry => entry.text.split(/\s+/).includes(lowerMahv))?.item ||
    normalized.find(entry => entry.text.includes(lowerMahv))?.item ||
    null
  );
};

/**
 * Tìm tài khoản Zalo theo Alias mã học viên (ưu tiên cao nhất khi gửi).
 * Thử endpoint /api/zalo/search-alias của backend trước, sau đó quét danh sách alias/friends (cache 60 giây).
 *
 * @returns {Promise<{ contact: any, targetId: string }|null>}
 */
async function findZaloByAlias({ backendUrl, mahv, forceRefresh = false }) {
  const cleanMahv = String(mahv || '').trim();
  if (!cleanMahv) return null;
  const lowerMahv = cleanMahv.toLowerCase();

  try {
    // 1. Thử endpoint /api/zalo/search-alias trực tiếp từ backend
    if (!aliasEndpointUnsupported) {
      try {
        const directRes = await axios.get(`${backendUrl}/api/zalo/search-alias?alias=${encodeURIComponent(cleanMahv)}`, { timeout: 10000 });
        if (directRes.data?.success && directRes.data?.found && directRes.data?.contact) {
          const contact = directRes.data.contact;
          const targetId = contact.uid || contact.userId || contact.zaloId || contact.id;
          if (targetId) {
            return { contact, targetId: String(targetId) };
          }
        }
      } catch (directErr) {
        // Backend chưa hỗ trợ endpoint này thì ghi nhớ để khỏi gọi lại khi gửi hàng loạt
        const status = directErr.response?.status;
        if (status === 404 || status === 405 || status === 501) {
          aliasEndpointUnsupported = true;
        }
      }
    }

    // 2. Fallback: Lấy danh sách alias & friends để quét phía client (có cache 60s)
    const now = Date.now();
    const isCacheValid = !forceRefresh && cachedAliases && (now - cacheTimestamp < CACHE_TTL_MS);

    if (!isCacheValid) {
      const [aliasRes, friendsRes] = await Promise.allSettled([
        axios.get(`${backendUrl}/api/zalo/aliases`, { timeout: 15000 }).catch(e => {
          if (e.response?.status === 404) {
            return axios.get(`${backendUrl}/api/zalo/alias-list`, { timeout: 15000 });
          }
          throw e;
        }),
        axios.get(`${backendUrl}/api/zalo/friends`, { timeout: 15000 })
      ]);

      let rawAliases = [];
      if (aliasRes.status === 'fulfilled' && aliasRes.value?.data) {
        const data = aliasRes.value.data;
        rawAliases = data.aliases || data.items || (Array.isArray(data) ? data : []);
      }

      let rawFriends = [];
      if (friendsRes.status === 'fulfilled' && friendsRes.value?.data) {
        const data = friendsRes.value.data;
        rawFriends = data.friends || (Array.isArray(data) ? data : []);
      }

      cachedAliases = Array.isArray(rawAliases) ? rawAliases : [];
      cachedFriends = Array.isArray(rawFriends) ? rawFriends : [];
      cacheTimestamp = Date.now();
    }

    // Quét trong danh sách aliases
    const matchedAlias = pickAliasMatch(cachedAliases, lowerMahv, item => item.alias || item.name);
    if (matchedAlias) {
      const targetId = matchedAlias.userId || matchedAlias.uid || matchedAlias.id;
      if (targetId) {
        return {
          contact: {
            ...matchedAlias,
            userId: targetId,
            displayName: matchedAlias.alias || matchedAlias.name,
            resolvedName: matchedAlias.alias || matchedAlias.name
          },
          targetId: String(targetId)
        };
      }
    }

    // Quét trong danh sách bạn bè friends (chứa alias, friendAlias, displayNameResolved)
    const matchedFriend = pickAliasMatch(
      cachedFriends,
      lowerMahv,
      f => f.alias || f.friendAlias || f.displayNameResolved || f.displayName
    );
    if (matchedFriend) {
      const targetId = matchedFriend.userId || matchedFriend.uid || matchedFriend.id;
      if (targetId) {
        return { contact: matchedFriend, targetId: String(targetId) };
      }
    }
  } catch (aliasErr) {
    console.warn(`[zaloHelper] Quét alias theo mã HV ${cleanMahv} thất bại:`, aliasErr.response?.data || aliasErr.message);
  }

  return null;
}

/**
 * Tra cứu thông tin người nhận Zalo cho học sinh mầm non theo thứ tự ưu tiên:
 * 0. Nếu tbl_hv đã lưu zalo_user_id (hoặc truyền vào zaloUserId) -> dùng luôn ID đó
 * 1. Alias mã học viên (mahv)
 * 2. Nếu không tìm ra, tìm kiếm theo số điện thoại Mẹ (sdtme) — tìm ra UID sẽ lưu vào tbl_hv.zalo_user_id
 * 3. Nếu vẫn không có, tìm kiếm theo số điện thoại Ba (sdtba) — cũng lưu lại UID
 *
 * @param {Object} options
 * @param {string} [options.sdtme] - Số điện thoại mẹ
 * @param {string} [options.phoneMe] - Alias cho SĐT mẹ
 * @param {string} [options.sdtba] - Số điện thoại ba
 * @param {string} [options.phoneBa] - Alias cho SĐT ba
 * @param {string} [options.phone] - Fallback tham số phone cũ
 * @param {string} [options.sdt] - Fallback tham số sdt cũ
 * @param {string} [options.sdtphuhuynh] - Fallback tham số sdtphuhuynh cũ
 * @param {string} [options.parentPhone] - Fallback tham số parentPhone cũ
 * @param {string} [options.mahv] - Mã học viên
 * @param {string} [options.zaloUserId] - zalo_user_id đã lưu (ưu tiên cao nhất)
 * @param {string} [options.zaloBackendUrl] - Đường dẫn backend Zalo
 * @param {boolean} [options.forceRefresh] - Bỏ qua cache khi quét alias / thông tin học viên
 * @param {boolean} [options.skipSavedZaloUserId] - Bỏ qua bước ưu tiên zalo_user_id đã lưu (dùng cho cơ chế dự phòng)
 * @returns {Promise<{ found: boolean, contact: any, targetId: string|null, method: 'zalo_user_id'|'alias'|'phone_me'|'phone_ba'|null, error?: string }>}
 */
export async function findZaloRecipient({
  sdtme,
  phoneMe,
  sdtba,
  phoneBa,
  phone,
  sdt,
  sdtphuhuynh,
  parentPhone,
  mahv,
  zaloUserId,
  zaloBackendUrl,
  forceRefresh = false,
  skipSavedZaloUserId = false
}) {
  const backendUrl = getZaloBackendUrl(zaloBackendUrl);

  // Xác định SĐT mẹ (ưu tiên sau alias) và SĐT ba (ưu tiên thấp nhất)
  let cleanPhoneMe = normalizePhoneNumber(sdtme || phoneMe || phone || sdt);
  let cleanPhoneBa = normalizePhoneNumber(sdtba || phoneBa || sdtphuhuynh || parentPhone);

  const cleanMahv = String(mahv || '').trim();

  // Luôn đọc thông tin học viên (zalo_user_id + SĐT ba/mẹ) từ tbl_hv khi có mã HV
  const studentInfo = cleanMahv ? await getStudentZaloInfo(cleanMahv, forceRefresh) : null;

  // ── BƯỚC 0: Ưu tiên zalo_user_id đã lưu trong tbl_hv ─────────────────
  const savedZaloUserId = String(zaloUserId || studentInfo?.zaloUserId || '').trim();
  if (!skipSavedZaloUserId && savedZaloUserId) {
    return {
      found: true,
      contact: {
        userId: savedZaloUserId,
        zaloUserId: savedZaloUserId,
        displayName: studentInfo?.tenhv || '',
        resolvedName: studentInfo?.tenhv || ''
      },
      targetId: savedZaloUserId,
      method: 'zalo_user_id'
    };
  }

  // Bổ sung SĐT còn thiếu từ tbl_hv để không bỏ sót
  if (studentInfo) {
    if (!cleanPhoneMe && studentInfo.sdtme) {
      cleanPhoneMe = normalizePhoneNumber(studentInfo.sdtme);
    }
    if (!cleanPhoneBa && studentInfo.sdtba) {
      cleanPhoneBa = normalizePhoneNumber(studentInfo.sdtba);
    }
  }

  // ── BƯỚC 1: Ưu tiên tìm theo Alias mã học viên (mahv) ────────────────────
  if (cleanMahv) {
    const aliasMatch = await findZaloByAlias({ backendUrl, mahv: cleanMahv, forceRefresh });
    if (aliasMatch) {
      return {
        found: true,
        contact: aliasMatch.contact,
        targetId: aliasMatch.targetId,
        method: 'alias'
      };
    }
  }

  // ── BƯỚC 2: Nếu alias không ra, tìm theo SĐT MẸ (cleanPhoneMe) ───────────
  if (cleanPhoneMe) {
    try {
      const url = `${backendUrl}/api/zalo/search-phone?phone=${encodeURIComponent(cleanPhoneMe)}`;
      const searchRes = await axios.get(url, { timeout: 15000 });

      if (searchRes.data?.success && searchRes.data?.found && searchRes.data?.contact) {
        const contact = searchRes.data.contact;
        const targetId = contact.uid || contact.userId || contact.zaloId || contact.id;
        if (targetId) {
          await saveStudentZaloUserId(cleanMahv, targetId);
          return {
            found: true,
            contact,
            targetId: String(targetId),
            method: 'phone_me'
          };
        }
      }
    } catch (phoneErr) {
      console.warn(`[zaloHelper] Tìm theo SĐT mẹ ${cleanPhoneMe} không thành công:`, phoneErr.response?.data || phoneErr.message);
    }
  }

  // ── BƯỚC 3: Nếu SĐT mẹ trống hoặc không ra Zalo, tìm theo SĐT BA (cleanPhoneBa) ───
  if (cleanPhoneBa && cleanPhoneBa !== cleanPhoneMe) {
    try {
      const parentUrl = `${backendUrl}/api/zalo/search-phone?phone=${encodeURIComponent(cleanPhoneBa)}`;
      const parentRes = await axios.get(parentUrl, { timeout: 15000 });

      if (parentRes.data?.success && parentRes.data?.found && parentRes.data?.contact) {
        const contact = parentRes.data.contact;
        const targetId = contact.uid || contact.userId || contact.zaloId || contact.id;
        if (targetId) {
          await saveStudentZaloUserId(cleanMahv, targetId);
          return {
            found: true,
            contact,
            targetId: String(targetId),
            method: 'phone_ba'
          };
        }
      }
    } catch (parentErr) {
      console.warn(`[zaloHelper] Tìm theo SĐT ba ${cleanPhoneBa} không thành công:`, parentErr.response?.data || parentErr.message);
    }
  }

  const triedList = [];
  if (cleanMahv) triedList.push(`Alias mã HV ${cleanMahv}`);
  if (cleanPhoneMe) triedList.push(`SĐT mẹ ${cleanPhoneMe}`);
  if (cleanPhoneBa) triedList.push(`SĐT ba ${cleanPhoneBa}`);

  return {
    found: false,
    contact: null,
    targetId: null,
    method: null,
    error: `Không tìm thấy tài khoản Zalo theo ${triedList.length > 0 ? triedList.join(', ') : 'Mã HV, SĐT mẹ hoặc SĐT ba'}`
  };
}

const isZaloNetworkFailure = (err) => (
  !err?.response &&
  (
    err?.code === 'ECONNABORTED' ||
    err?.code === 'ERR_NETWORK' ||
    String(err?.message || '').toLowerCase().includes('timeout') ||
    String(err?.message || '').toLowerCase().includes('network')
  )
);

/**
 * Gửi Zalo với cơ chế dự phòng: thử zalo_user_id đã lưu trước,
 * chỉ khi gửi thất bại mới tra cứu theo cơ chế cũ (Alias -> SĐT mẹ -> SĐT ba) và gửi lại.
 */
async function sendZaloWithFallback({ targetArgs, attempt }) {
  const { mahv, zaloUserId, forceRefresh = false } = targetArgs;
  const triedTargetIds = [];
  let lastError = '';
  let lastTarget = null;
  let aborted = false;

  const trySend = async (target) => {
    triedTargetIds.push(target.targetId);
    lastTarget = target;
    try {
      const response = await attempt(target);
      if (isZaloRequestSuccessful(response)) {
        return {
          success: true,
          targetId: target.targetId,
          method: target.method,
          contact: target.contact,
          triedTargetIds,
          response,
          error: ''
        };
      }
      lastError = response?.data?.error || response?.data?.message || 'Zalo server không xác nhận gửi thành công';
      console.warn(`[zaloHelper] Gửi Zalo qua ${target.method} (${target.targetId}) không thành công:`, lastError);
    } catch (err) {
      lastError = err?.response?.data?.error || err?.message || 'Lỗi gửi Zalo';
      console.warn(`[zaloHelper] Lỗi gửi Zalo qua ${target.method} (${target.targetId}):`, lastError);
      // Lỗi mạng/timeout thì thử tiếp cũng vô ích, tránh nhân đôi thời gian chờ
      if (isZaloNetworkFailure(err)) aborted = true;
    }
    return null;
  };

  // ── 1. Gửi bằng zalo_user_id đã lưu trong tbl_hv ─────────────────────
  const studentInfo = mahv ? await getStudentZaloInfo(mahv, forceRefresh) : null;
  const savedZaloUserId = String(zaloUserId || studentInfo?.zaloUserId || '').trim();
  if (savedZaloUserId) {
    const sent = await trySend({
      targetId: savedZaloUserId,
      method: 'zalo_user_id',
      contact: {
        userId: savedZaloUserId,
        zaloUserId: savedZaloUserId,
        displayName: studentInfo?.tenhv || '',
        resolvedName: studentInfo?.tenhv || ''
      }
    });
    if (sent) return sent;
  }

  // ── 2. Dự phòng: cơ chế cũ (chỉ chạy khi bước 1 không gửi được) ──────
  let lookupError = '';
  if (!aborted) {
    const legacy = await findZaloRecipient({ ...targetArgs, skipSavedZaloUserId: true });
    lookupError = legacy.error || '';
    if (legacy.found && legacy.targetId && !triedTargetIds.includes(legacy.targetId)) {
      const sent = await trySend({
        targetId: legacy.targetId,
        method: legacy.method,
        contact: legacy.contact
      });
      if (sent) return sent;
    }
  }

  return {
    success: false,
    targetId: lastTarget?.targetId || null,
    method: lastTarget?.method || null,
    contact: lastTarget?.contact || null,
    triedTargetIds,
    response: null,
    error: lastError || lookupError || 'Không tìm thấy tài khoản Zalo'
  };
}

/**
 * Gửi tin nhắn văn bản Zalo: ưu tiên zalo_user_id trong tbl_hv, thất bại mới dùng cơ chế cũ.
 * @returns {Promise<{ success: boolean, targetId: string|null, method: string|null, contact: any, triedTargetIds: string[], response: any, error: string }>}
 */
export async function sendZaloMessage({ message, threadType = 'user', timeout = 30000, ...targetArgs }) {
  return sendZaloWithFallback({
    targetArgs,
    attempt: (target) => axios.post(
      `${getZaloBackendUrl(targetArgs.zaloBackendUrl)}/api/zalo/send-message`,
      { threadId: target.targetId, message, threadType },
      { timeout }
    )
  });
}

/**
 * Gửi hình ảnh Zalo: ưu tiên zalo_user_id trong tbl_hv, thất bại mới dùng cơ chế cũ.
 * @returns {Promise<{ success: boolean, targetId: string|null, method: string|null, contact: any, triedTargetIds: string[], response: any, error: string }>}
 */
export async function sendZaloImage({ file, caption, threadType = 'user', timeout = 30000, ...targetArgs }) {
  return sendZaloWithFallback({
    targetArgs,
    attempt: (target) => {
      const formData = new FormData();
      if (file) formData.append('file', file);
      formData.append('threadId', target.targetId);
      formData.append('threadType', threadType);
      if (caption) formData.append('caption', caption);
      return axios.post(
        `${getZaloBackendUrl(targetArgs.zaloBackendUrl)}/api/zalo/send-image`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout }
      );
    }
  });
}

/**
 * Chuyển dataURL (kết quả html-to-image) thành File để gửi Zalo.
 */
export const dataUrlToFile = (dataUrl, fileName) => {
  const [meta, base64] = String(dataUrl || '').split(',');
  const mimeString = meta?.split(':')[1]?.split(';')[0] || 'image/png';
  const byteString = atob(base64 || '');
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new File([ab], fileName, { type: mimeString });
};

/**
 * Xác định bảng chứa chứng từ theo mã: TB* -> tbl_thongbao (Doanh thu dự kiến), còn lại -> tbl_hd (QL phiếu thu HP).
 */
export const getZaloStatusTable = (mahd) => (
  String(mahd || '').trim().toUpperCase().startsWith('TB') ? 'tbl_thongbao' : 'tbl_hd'
);

/**
 * Ghi trạng thái gửi Zalo ('sending' | 'sent' | 'failed') vào đúng bảng chứng từ
 * để cột "Trạng thái Zalo" ở QL phiếu thu HP / Doanh thu dự kiến luôn chính xác.
 */
export const updateZaloStatus = async (mahd, status) => {
  const docId = String(mahd || '').trim();
  if (!docId) return;
  const { error } = await supabase
    .from(getZaloStatusTable(docId))
    .update({ zalo_status: status })
    .eq('mahd', docId);
  if (error) {
    console.warn(`[zaloHelper] Không cập nhật được zalo_status (${status}) cho ${docId}:`, error.message);
  }
};
