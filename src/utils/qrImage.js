/**
 * Helper tải ảnh QR VietQR (img.vietqr.io) về dạng base64 để nhúng vào
 * template in / gửi Zalo mà KHÔNG bị chặn CORS.
 *
 * Bối cảnh: img.vietqr.io đã đổi cách trả ảnh — URL "...-compact2.png" giờ
 * trả về 301 redirect sang "...-compact2.svg", và response 301 KHÔNG có header
 * Access-Control-Allow-Origin. Vì vậy fetch() (CORS mode) bị chặn với lỗi:
 *   "has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header"
 * Trong khi đó URL .svg trả 200 kèm Access-Control-Allow-Origin: *.
 *
 * Cách xử lý:
 *   1. Chuẩn hoá URL sang .svg (bỏ redirect).
 *   2. Nếu fetch vẫn lỗi → fallback nạp qua <img crossOrigin> + canvas.
 */

const VIETQR_HOSTS = ['img.vietqr.io', 'api.vietqr.io'];

/**
 * Đổi URL ảnh VietQR từ .png sang .svg để tránh 301 redirect thiếu CORS header.
 * Các URL khác được giữ nguyên.
 */
export const normalizeVietQrUrl = (url) => {
   if (!url) return url;
   try {
      const base = typeof window !== 'undefined' && window.location ? window.location.origin : 'https://localhost';
      const parsed = new URL(url, base);
      if (VIETQR_HOSTS.includes(parsed.hostname.toLowerCase()) && /\.png$/i.test(parsed.pathname)) {
         parsed.pathname = parsed.pathname.replace(/\.png$/i, '.svg');
         return parsed.toString();
      }
   } catch (e) {
      // URL không hợp lệ → trả nguyên bản
   }
   return url;
};

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
   const reader = new FileReader();
   reader.onloadend = () => resolve(reader.result);
   reader.onerror = reject;
   reader.readAsDataURL(blob);
});

const fetchAsDataUrl = async (url) => {
   const response = await fetch(url, {
      cache: 'no-store',
      mode: 'cors',
      credentials: 'omit'
   });
   if (!response.ok) {
      throw new Error(`QR fetch failed: HTTP ${response.status}`);
   }
   const blob = await response.blob();
   if (!blob.size) {
      throw new Error('QR fetch failed: empty response');
   }
   return blobToDataUrl(blob);
};

const loadViaCanvas = (url) => new Promise((resolve, reject) => {
   const img = new window.Image();
   img.crossOrigin = 'anonymous';
   img.onload = () => {
      try {
         const width = img.naturalWidth || img.width;
         const height = img.naturalHeight || img.height;
         if (!width || !height) {
            reject(new Error('QR image has no size'));
            return;
         }
         const canvas = document.createElement('canvas');
         canvas.width = width;
         canvas.height = height;
         const ctx = canvas.getContext('2d');
         ctx.drawImage(img, 0, 0, width, height);
         resolve(canvas.toDataURL('image/png'));
      } catch (err) {
         reject(err);
      }
   };
   img.onerror = () => reject(new Error('Không tải được ảnh QR (CORS/network)'));
   img.src = url;
});

/**
 * Tải ảnh về data URL (base64). Tự động xử lý redirect .png → .svg của VietQR.
 * @param {string} imageUrl
 * @returns {Promise<string|null>} data URL hoặc null nếu không có URL
 */
export const fetchImageAsBase64 = async (imageUrl) => {
   if (!imageUrl) return null;
   if (imageUrl.startsWith('data:')) return imageUrl;

   const normalized = normalizeVietQrUrl(imageUrl);
   const candidates = normalized !== imageUrl ? [normalized, imageUrl] : [imageUrl];

   let lastError = null;
   for (const candidate of candidates) {
      try {
         return await fetchAsDataUrl(candidate);
      } catch (err) {
         lastError = err;
      }
      try {
         return await loadViaCanvas(candidate);
      } catch (err) {
         lastError = err;
      }
   }
   throw lastError || new Error('Không tải được ảnh QR');
};

export default fetchImageAsBase64;
