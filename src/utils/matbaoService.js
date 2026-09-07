/**
 * Service tích hợp API Hóa Đơn Điện Tử Mắt Bão (MIFI)
 * Dựa trên tài liệu Postman collection api-matbao
 */

const STORAGE_KEY_CONFIG = 'matbao_hddt_config';
const STORAGE_KEY_TOKEN = 'matbao_hddt_token';

// Cấu hình từ file .env (hoặc giá trị mặc định từ api-matbao)
export const getEnvMatBaoConfig = () => ({
  baseUrl: process.env.REACT_APP_MATBAO_BASE_URL || 'https://demo-api-hddt.matbao.in:11443',
  mst: process.env.REACT_APP_MATBAO_MST || '0302712571-999',
  username: process.env.REACT_APP_MATBAO_USERNAME || 'admin',
  password: process.env.REACT_APP_MATBAO_PASSWORD || 'Gtybf@12sd',
  khmshDon: process.env.REACT_APP_MATBAO_KHMSHDON || '1',     // Mẫu số: 1 (Hóa đơn GTGT) hoặc 2 (Hóa đơn bán hàng)
  khhDon: process.env.REACT_APP_MATBAO_KHHDON || 'C26TAT',   // Ký hiệu mẫu hóa đơn
  loaiHDon: process.env.REACT_APP_MATBAO_LOAI_HDON !== undefined ? Number(process.env.REACT_APP_MATBAO_LOAI_HDON) : 0, // 0: Nháp, 1: Phát hành
  hinhThucTT: process.env.REACT_APP_MATBAO_HINHTHUC_TT || 'TM/CK'
});

export const DEFAULT_MATBAO_CONFIG = getEnvMatBaoConfig();

/**
 * Lấy cấu hình kết nối Mắt Bão hiện tại (Ưu tiên: localStorage tùy chỉnh > .env)
 */
export const getMatBaoConfig = () => {
  const envConfig = getEnvMatBaoConfig();
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (saved) {
      return { ...envConfig, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Lỗi đọc cấu hình Mắt Bão:', e);
  }
  return { ...envConfig };
};

/**
 * Lưu cấu hình kết nối Mắt Bão (ghi đè tạm thời hoặc lưu từ giao diện)
 */
export const saveMatBaoConfig = (cfg) => {
  localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(cfg));
  // Xóa token cũ để đăng nhập lại với thông tin mới
  localStorage.removeItem(STORAGE_KEY_TOKEN);
};

/**
 * Khôi phục cấu hình mặc định từ file .env
 */
export const resetMatBaoConfig = () => {
  localStorage.removeItem(STORAGE_KEY_CONFIG);
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  return getEnvMatBaoConfig();
};

/**
 * Lấy token xác thực từ Mắt Bão (tự động đăng nhập lại nếu hết hạn)
 */
export const getMatBaoToken = async (forceRefresh = false) => {
  const config = getMatBaoConfig();

  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_TOKEN);
      if (cached) {
        const tokenObj = JSON.parse(cached);
        const expired = new Date(tokenObj.expiredDate).getTime();
        // Kiểm tra xem token còn hạn ít nhất 5 phút không
        if (expired > Date.now() + 5 * 60 * 1000) {
          return tokenObj.accessToken;
        }
      }
    } catch (e) {
      console.warn('Lỗi kiểm tra cached token:', e);
    }
  }

  // Gọi API login
  const loginUrl = `${config.baseUrl.replace(/\/+$/, '')}/api/auth/login`;
  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      MST: config.mst,
      TDNhap: config.username,
      MKhau: config.password
    })
  });

  const resJson = await response.json();
  if (!response.ok || resJson.errorCode !== 200 || !resJson.data?.accessToken) {
    const errMsg = resJson.message || `Đăng nhập Mắt Bão thất bại (Mã lỗi: ${resJson.errorCode || response.status})`;
    throw new Error(errMsg);
  }

  localStorage.setItem(STORAGE_KEY_TOKEN, JSON.stringify({
    accessToken: resJson.data.accessToken,
    expiredDate: resJson.data.expiredDate
  }));

  return resJson.data.accessToken;
};

/**
 * Lấy danh sách mẫu hóa đơn theo năm từ Mắt Bão
 */
export const getMatBaoTemplates = async (year = new Date().getFullYear()) => {
  const config = getMatBaoConfig();
  const token = await getMatBaoToken();
  const url = `${config.baseUrl.replace(/\/+$/, '')}/api/invoice/templates?year=${year}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const resJson = await response.json();
  if (!response.ok || resJson.errorCode !== 200) {
    throw new Error(resJson.message || 'Không thể lấy danh sách mẫu hóa đơn từ Mắt Bão');
  }

  return resJson.data || [];
};

/**
 * Chuyển số thành chữ tiếng Việt (hỗ trợ đọc tổng tiền hóa đơn)
 */
export const readVNDCurrency = (number) => {
  if (!number || number <= 0) return 'Không đồng';
  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
  const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

  const readGroup = (group, showZeroHundred) => {
    let a = Math.floor(group / 100);
    let b = Math.floor((group % 100) / 10);
    let c = group % 10;
    let res = '';
    if (a > 0 || showZeroHundred) {
      res += digits[a] + ' trăm ';
    }
    if (b > 1) {
      res += digits[b] + ' mươi ';
      if (c === 1) res += 'mốt ';
      else if (c === 5) res += 'lăm ';
      else if (c > 0) res += digits[c] + ' ';
    } else if (b === 1) {
      res += 'mười ';
      if (c === 5) res += 'lăm ';
      else if (c > 0) res += digits[c] + ' ';
    } else if (b === 0 && (a > 0 || showZeroHundred) && c > 0) {
      res += 'lẻ ' + digits[c] + ' ';
    } else if (b === 0 && c > 0) {
      res += digits[c] + ' ';
    }
    return res.trim();
  };

  let result = '';
  let unitPos = 0;
  let n = Math.floor(number);
  do {
    let group = n % 1000;
    n = Math.floor(n / 1000);
    if (group > 0 || (unitPos === 0 && n === 0)) {
      let str = readGroup(group, n > 0);
      if (str) {
        result = str + ' ' + units[unitPos] + ' ' + result;
      }
    }
    unitPos++;
  } while (n > 0);

  result = result.replace(/\s+/g, ' ').trim() + ' đồng';
  return result.charAt(0).toUpperCase() + result.slice(1);
};

/**
 * Chuẩn bị payload và tạo Hóa Đơn trên Mắt Bão
 * @param {Object} params 
 * @param {Object} params.invoice Thông tin phiếu thu học phí từ tbl_hd
 * @param {Object} params.buyer Thông tin người mua (Học sinh/Phụ huynh/Công ty)
 * @param {Array} params.items Danh sách hàng hóa/dịch vụ
 * @param {Object} params.options Tùy chọn (loaiHDon, mauSo, kiHieu, hinhThucTT...)
 */
export const createMatBaoInvoice = async ({ invoice, buyer, items = [], options = {} }) => {
  const config = getMatBaoConfig();
  const token = await getMatBaoToken();

  const now = new Date();
  const dateIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T00:00:00`;
  const maTraCuu = `HD_${invoice.mahd}_${Date.now()}`;

  // Chuẩn hóa danh sách sản phẩm / dịch vụ
  let totalAmount = 0;
  const dshhdvu = items.map((item, idx) => {
    const sl = Number(item.sl) || 1;
    const gia = Number(item.gia) || 0;
    const thanhTien = sl * gia;
    totalAmount += thanhTien;

    return {
      TChat: 1, // 1: Hàng hóa dịch vụ thông thường
      STT: idx + 1,
      MHHDVu: item.ma || `DVKP_${idx + 1}`,
      THHDVu: item.ten || 'Học phí',
      DVTinh: item.dvt || 'Tháng',
      SLuong: sl,
      DGia: gia,
      ThTienChuaCK: thanhTien,
      TLCKhau: 0,
      STCKhau: 0,
      ThTien: thanhTien,
      TSuat: options.thueSuat !== undefined ? options.thueSuat : -1, // -1: Không chịu thuế
      TThue: 0,
      TgTien: thanhTien
    };
  });

  const payload = [
    {
      KHMSHDon: options.mauSo || config.khmshDon || '1',
      KHHDon: options.kiHieu || config.khhDon || 'C26TAT',
      MaTraCuu: maTraCuu,
      MTChieu: invoice.mahd || maTraCuu,
      NLap: dateIso,
      LoaiHDon: options.loaiHDon !== undefined ? Number(options.loaiHDon) : Number(config.loaiHDon || 0), // 0: Nháp, 1: Phát hành
      TCHDon: 0, // 0: Hóa đơn mới
      LoaiTraHang: 0,
      DVTTe: 704, // VND
      TGia: 1,
      HTTToan: options.hinhThucTT || config.hinhThucTT || 'TM/CK',
      GChu: options.ghiChu || `Thu học phí - Mã phiếu ${invoice.mahd}`,
      
      // Thông tin người mua
      NMua_Ten: buyer.ten || buyer.tenhv || 'Khách hàng',
      NMua_MST: buyer.mst || '',
      NMua_DChi: buyer.diachi || '',
      NMua_MKHang: buyer.mahv || '',
      NMua_SDThoai: buyer.sdt || '',
      NMua_DCTDTu: buyer.email || '',
      NMua_HVTNMHang: buyer.nguoiMua || buyer.tenba || buyer.tenme || buyer.tenhv || '',
      NMua_STKNHang: '',
      NMua_TNHang: '',

      // Danh sách dịch vụ & tổng tiền
      DSHHDVu: dshhdvu,
      TTCKTMai: 0,
      TGTKhac: 0,
      TgThTien: totalAmount,
      TgTThue: 0,
      TgTTTBSo: totalAmount,
      TgTTTBChu: readVNDCurrency(totalAmount)
    }
  ];

  const createUrl = `${config.baseUrl.replace(/\/+$/, '')}/api/invoice/create-invoice`;
  const response = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const resJson = await response.json();
  if (!response.ok || resJson.errorCode !== 200) {
    throw new Error(resJson.message || 'Lỗi tạo hóa đơn Mắt Bão');
  }

  const resultItem = resJson.data?.[0];
  if (resultItem && resultItem.errorCode !== 200) {
    throw new Error(resultItem.message || 'Không tạo được hóa đơn Mắt Bão');
  }

  return resultItem?.data || resJson.data;
};

/**
 * Tải nội dung PDF hóa đơn điện tử
 */
export const downloadMatBaoInvoice = async ({ maTraCuu, maSoHDon }) => {
  const config = getMatBaoConfig();
  const token = await getMatBaoToken();

  const url = `${config.baseUrl.replace(/\/+$/, '')}/api/invoice/download-invoice`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      MaTraCuu: maTraCuu,
      MaSoHDon: maSoHDon
    })
  });

  const resJson = await response.json();
  if (!response.ok || resJson.errorCode !== 200) {
    throw new Error(resJson.message || 'Lỗi tải hóa đơn từ Mắt Bão');
  }

  return resJson.data; // Chứa { data_PDF_Base64, data_XML_Base64 }
};
