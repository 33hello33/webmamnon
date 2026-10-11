import axios from 'axios';
import { supabase } from '../supabase';

// Bộ nhớ đệm tạm thời cho danh sách alias & friends để tránh gửi quá nhiều request khi gửi hàng loạt
let cachedAliases = null;
let cachedFriends = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60000; // Cache 60 giây

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
};

/**
 * Tra cứu thông tin người nhận Zalo cho học sinh mầm non theo thứ tự ưu tiên:
 * 1. Ưu tiên số điện thoại Mẹ (sdtme)
 * 2. Nếu không tìm ra hoặc không có, tìm kiếm theo số điện thoại Ba (sdtba)
 * 3. Nếu cả 2 đều không có hoặc bị chặn tìm -> tìm theo Alias mã học viên (mahv)
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
 * @param {string} [options.zaloBackendUrl] - Đường dẫn backend Zalo
 * @param {boolean} [options.forceRefresh] - Bỏ qua cache khi quét alias
 * @returns {Promise<{ found: boolean, contact: any, targetId: string|null, method: 'phone_me'|'phone_ba'|'alias'|null, error?: string }>}
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
  zaloBackendUrl,
  forceRefresh = false
}) {
  const backendUrl = zaloBackendUrl || process.env.REACT_APP_ZALO_API_URL || 'http://localhost:5000';
  
  // Xác định SĐT mẹ (ưu tiên cao nhất) và SĐT ba (ưu tiên thứ hai)
  let cleanPhoneMe = normalizePhoneNumber(sdtme || phoneMe || phone || sdt);
  let cleanPhoneBa = normalizePhoneNumber(sdtba || phoneBa || sdtphuhuynh || parentPhone);
  
  const cleanMahv = String(mahv || '').trim();
  const lowerMahv = cleanMahv.toLowerCase();

  // Nếu có mã HV mà còn thiếu SĐT mẹ hoặc SĐT ba, tra cứu thêm từ tbl_hv (chỉ dùng cột sdtme, sdtba)
  if (cleanMahv && (!cleanPhoneMe || !cleanPhoneBa)) {
    try {
      const { data: hvData } = await supabase
        .from('tbl_hv')
        .select('sdtme, sdtba')
        .eq('mahv', cleanMahv)
        .maybeSingle();

      if (hvData) {
        if (!cleanPhoneMe && hvData.sdtme) {
          cleanPhoneMe = normalizePhoneNumber(hvData.sdtme);
        }
        if (!cleanPhoneBa && hvData.sdtba) {
          cleanPhoneBa = normalizePhoneNumber(hvData.sdtba);
        }
      }
    } catch (e) {
      console.warn('[zaloHelper] Không thể tra cứu SĐT ba/mẹ từ tbl_hv:', e?.message || e);
    }
  }

  // ── BƯỚC 1: Ưu tiên tìm kiếm bằng SĐT MẸ (cleanPhoneMe) ───────────────────
  if (cleanPhoneMe) {
    try {
      const url = `${backendUrl}/api/zalo/search-phone?phone=${encodeURIComponent(cleanPhoneMe)}`;
      const searchRes = await axios.get(url, { timeout: 15000 });

      if (searchRes.data?.success && searchRes.data?.found && searchRes.data?.contact) {
        const contact = searchRes.data.contact;
        const targetId = contact.uid || contact.userId || contact.zaloId || contact.id;
        if (targetId) {
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

  // ── BƯỚC 2: Nếu SĐT mẹ trống hoặc không ra Zalo, tìm theo SĐT BA (cleanPhoneBa) ───
  if (cleanPhoneBa && cleanPhoneBa !== cleanPhoneMe) {
    try {
      const parentUrl = `${backendUrl}/api/zalo/search-phone?phone=${encodeURIComponent(cleanPhoneBa)}`;
      const parentRes = await axios.get(parentUrl, { timeout: 15000 });

      if (parentRes.data?.success && parentRes.data?.found && parentRes.data?.contact) {
        const contact = parentRes.data.contact;
        const targetId = contact.uid || contact.userId || contact.zaloId || contact.id;
        if (targetId) {
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

  // ── BƯỚC 3: Nếu tìm theo SĐT mẹ & ba vẫn không ra (bị chặn tìm hoặc không có Zalo), tìm theo alias mã học viên ────
  if (cleanMahv) {
    try {
      // 3a. Thử endpoint /api/zalo/search-alias trực tiếp từ backend
      try {
        const directRes = await axios.get(`${backendUrl}/api/zalo/search-alias?alias=${encodeURIComponent(cleanMahv)}`, { timeout: 10000 });
        if (directRes.data?.success && directRes.data?.found && directRes.data?.contact) {
          const contact = directRes.data.contact;
          const targetId = contact.uid || contact.userId || contact.zaloId || contact.id;
          if (targetId) {
            return {
              found: true,
              contact,
              targetId: String(targetId),
              method: 'alias'
            };
          }
        }
      } catch (directErr) {
        // Tiếp tục fallback quét danh bạ phía frontend nếu endpoint chưa hỗ trợ
      }

      // 3b. Fallback: Lấy danh sách alias & friends để quét phía client (có cache 60s)
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
      const matchedAlias = (cachedAliases || []).find(item => {
        const aliasText = String(item.alias || item.name || '').toLowerCase();
        return aliasText.includes(lowerMahv);
      });

      if (matchedAlias) {
        const targetId = matchedAlias.userId || matchedAlias.uid || matchedAlias.id;
        if (targetId) {
          return {
            found: true,
            contact: {
              ...matchedAlias,
              userId: targetId,
              displayName: matchedAlias.alias || matchedAlias.name,
              resolvedName: matchedAlias.alias || matchedAlias.name
            },
            targetId: String(targetId),
            method: 'alias'
          };
        }
      }

      // Quét trong danh sách bạn bè friends (chứa alias, friendAlias, displayNameResolved)
      const matchedFriend = (cachedFriends || []).find(f => {
        const aliasText = String(f.alias || f.friendAlias || f.displayNameResolved || f.displayName || '').toLowerCase();
        return aliasText.includes(lowerMahv);
      });

      if (matchedFriend) {
        const targetId = matchedFriend.userId || matchedFriend.uid || matchedFriend.id;
        if (targetId) {
          return {
            found: true,
            contact: matchedFriend,
            targetId: String(targetId),
            method: 'alias'
          };
        }
      }
    } catch (aliasErr) {
      console.warn(`[zaloHelper] Quét alias theo mã HV ${cleanMahv} thất bại:`, aliasErr.response?.data || aliasErr.message);
    }
  }

  const triedList = [];
  if (cleanPhoneMe) triedList.push(`SĐT mẹ ${cleanPhoneMe}`);
  if (cleanPhoneBa) triedList.push(`SĐT ba ${cleanPhoneBa}`);
  if (cleanMahv) triedList.push(`Alias mã HV ${cleanMahv}`);

  return {
    found: false,
    contact: null,
    targetId: null,
    method: null,
    error: `Không tìm thấy tài khoản Zalo theo ${triedList.length > 0 ? triedList.join(', ') : 'SĐT mẹ, SĐT ba hoặc Mã HV'}`
  };
}
