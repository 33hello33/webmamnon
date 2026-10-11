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
 * Tra cứu thông tin người nhận Zalo theo thứ tự ưu tiên:
 * 1. Nếu có SĐT học viên (phone/sdt) -> tìm kiếm qua /api/zalo/search-phone
 * 2. Nếu SĐT học viên trống hoặc tìm không ra -> tìm kiếm theo SĐT phụ huynh (sdtphuhuynh/parentPhone)
 * 3. Nếu tìm theo SĐT phụ huynh vẫn không ra (bị chặn tìm, ko có Zalo...) -> tìm theo Alias mã học viên (mahv)
 *
 * @param {Object} options
 * @param {string} [options.phone] - Số điện thoại học viên
 * @param {string} [options.sdt] - Alias cho Số điện thoại học viên
 * @param {string} [options.sdtphuhuynh] - Số điện thoại phụ huynh
 * @param {string} [options.parentPhone] - Alias cho Số điện thoại phụ huynh
 * @param {string} [options.mahv] - Mã học viên
 * @param {string} [options.zaloBackendUrl] - Đường dẫn backend Zalo
 * @param {boolean} [options.forceRefresh] - Bỏ qua cache khi quét alias
 * @returns {Promise<{ found: boolean, contact: any, targetId: string|null, method: 'phone'|'parent_phone'|'alias'|null, error?: string }>}
 */
export async function findZaloRecipient({
  phone,
  sdt,
  sdtphuhuynh,
  parentPhone,
  mahv,
  zaloBackendUrl,
  forceRefresh = false
}) {
  const backendUrl = zaloBackendUrl || process.env.REACT_APP_ZALO_API_URL || 'http://localhost:5000';
  let cleanPhone = normalizePhoneNumber(phone || sdt);
  let cleanParentPhone = normalizePhoneNumber(sdtphuhuynh || parentPhone);
  const cleanMahv = String(mahv || '').trim();
  const lowerMahv = cleanMahv.toLowerCase();

  // Nếu có mã HV mà còn thiếu SĐT học viên hoặc SĐT phụ huynh, tra cứu thêm từ tbl_hv để không bỏ sót
  if (cleanMahv && (!cleanPhone || !cleanParentPhone)) {
    try {
      const { data: hvData } = await supabase
        .from('tbl_hv')
        .select('sdt, sdtphuhuynh')
        .eq('mahv', cleanMahv)
        .maybeSingle();

      if (hvData) {
        if (!cleanPhone && hvData.sdt) {
          cleanPhone = normalizePhoneNumber(hvData.sdt);
        }
        if (!cleanParentPhone && hvData.sdtphuhuynh) {
          cleanParentPhone = normalizePhoneNumber(hvData.sdtphuhuynh);
        }
      }
    } catch (e) {
      console.warn('[zaloHelper] Không thể tra cứu thêm SĐT từ tbl_hv:', e?.message || e);
    }
  }

  // ── BƯỚC 1: Tìm kiếm bằng SĐT học viên (cleanPhone) ───────────────────
  if (cleanPhone) {
    try {
      const url = `${backendUrl}/api/zalo/search-phone?phone=${encodeURIComponent(cleanPhone)}`;
      const searchRes = await axios.get(url, { timeout: 15000 });

      if (searchRes.data?.success && searchRes.data?.found && searchRes.data?.contact) {
        const contact = searchRes.data.contact;
        const targetId = contact.uid || contact.userId || contact.zaloId || contact.id;
        if (targetId) {
          return {
            found: true,
            contact,
            targetId: String(targetId),
            method: 'phone'
          };
        }
      }
    } catch (phoneErr) {
      console.warn(`[zaloHelper] Tìm theo SĐT học viên ${cleanPhone} không thành công:`, phoneErr.response?.data || phoneErr.message);
    }
  }

  // ── BƯỚC 2: Nếu SĐT học viên trống hoặc tìm không ra, tìm theo SĐT phụ huynh (cleanParentPhone) ───
  if (cleanParentPhone && cleanParentPhone !== cleanPhone) {
    try {
      const parentUrl = `${backendUrl}/api/zalo/search-phone?phone=${encodeURIComponent(cleanParentPhone)}`;
      const parentRes = await axios.get(parentUrl, { timeout: 15000 });

      if (parentRes.data?.success && parentRes.data?.found && parentRes.data?.contact) {
        const contact = parentRes.data.contact;
        const targetId = contact.uid || contact.userId || contact.zaloId || contact.id;
        if (targetId) {
          return {
            found: true,
            contact,
            targetId: String(targetId),
            method: 'parent_phone'
          };
        }
      }
    } catch (parentErr) {
      console.warn(`[zaloHelper] Tìm theo SĐT phụ huynh ${cleanParentPhone} không thành công (bị chặn tìm hoặc không có Zalo):`, parentErr.response?.data || parentErr.message);
    }
  }

  // ── BƯỚC 3: Nếu tìm theo SĐT phụ huynh vẫn không ra (bị chặn tìm), tìm theo alias mã học viên ────
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
  if (cleanPhone) triedList.push(`SĐT HV ${cleanPhone}`);
  if (cleanParentPhone) triedList.push(`SĐT PH ${cleanParentPhone}`);
  if (cleanMahv) triedList.push(`Alias mã HV ${cleanMahv}`);

  return {
    found: false,
    contact: null,
    targetId: null,
    method: null,
    error: `Không tìm thấy tài khoản Zalo theo ${triedList.length > 0 ? triedList.join(', ') : 'SĐT hoặc Mã HV'}`
  };
}
