import { supabase } from '../supabase';

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
 * Áp các tùy chọn xuất hóa đơn (mẫu số, ký hiệu, loại hóa đơn, hình thức TT)
 * từ tbl_config lên cấu hình hiện tại. Chỉ áp khi cột tồn tại (có giá trị).
 */
const applyInvoiceOptionsFromDb = (cfg, dbConfig) => {
  if (!dbConfig) return cfg;
  if (dbConfig.matbao_khmshdon !== undefined && dbConfig.matbao_khmshdon !== null && dbConfig.matbao_khmshdon !== '') {
    cfg.khmshDon = dbConfig.matbao_khmshdon;
  }
  if (dbConfig.matbao_khhdon) cfg.khhDon = dbConfig.matbao_khhdon;
  if (dbConfig.matbao_loaihdon !== undefined && dbConfig.matbao_loaihdon !== null) {
    cfg.loaiHDon = Number(dbConfig.matbao_loaihdon) === 1 ? 1 : 0;
  }
  if (dbConfig.matbao_hinhthuctt) cfg.hinhThucTT = dbConfig.matbao_hinhthuctt;
  return cfg;
};

/**
 * Lấy cấu hình kết nối Mắt Bão hiện tại
 * Thứ tự ưu tiên: tbl_config (schema truongla) > localStorage tùy chỉnh > .env
 */
export const getMatBaoConfig = (dbConfig = null) => {
  const envConfig = getEnvMatBaoConfig();

  // Nếu có dbConfig truyền vào hoặc từ tbl_config
  let cfg = { ...envConfig };
  if (dbConfig) {
    if (dbConfig.matbao_base_url) cfg.baseUrl = dbConfig.matbao_base_url;
    if (dbConfig.matbao_mst) cfg.mst = dbConfig.matbao_mst;
    if (dbConfig.matbao_username) cfg.username = dbConfig.matbao_username;
    if (dbConfig.matbao_password) cfg.password = dbConfig.matbao_password;
  }
  cfg = applyInvoiceOptionsFromDb(cfg, dbConfig);

  try {
    const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (saved) {
      cfg = { ...cfg, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Lỗi đọc cấu hình Mắt Bão:', e);
  }

  // Tùy chọn xuất hóa đơn lưu trong tbl_config (Cấu hình hệ thống) là nguồn chuẩn
  return applyInvoiceOptionsFromDb(cfg, dbConfig);
};

/**
 * Lấy các tùy chọn xuất hóa đơn mặc định (dùng cho ConfigManager)
 */
export const getMatBaoInvoiceDefaults = (dbConfig = null) => {
  const cfg = getMatBaoConfig(dbConfig);
  return {
    khmshDon: String(cfg.khmshDon || '1'),
    khhDon: String(cfg.khhDon || 'C26TAT'),
    loaiHDon: Number(cfg.loaiHDon) === 1 ? 1 : 0,
    hinhThucTT: cfg.hinhThucTT || 'TM/CK'
  };
};

const upsertTblConfig = async (payload) => {
  const { data: existing } = await supabase.from('tbl_config').select('id').maybeSingle();
  if (existing?.id) {
    return await supabase.from('tbl_config').update(payload).eq('id', existing.id);
  }
  return await supabase.from('tbl_config').insert([payload]);
};

/**
 * Ghi cấu hình vào tbl_config. Nếu bảng chưa có các cột tùy chọn hóa đơn thì
 * vẫn lưu được các cột kết nối (base url, MST, tài khoản, mật khẩu).
 */
const saveConfigToDb = async (fullPayload, connectionPayload) => {
  try {
    const { error } = await upsertTblConfig(fullPayload);
    if (!error) return true;
    const retry = await upsertTblConfig(connectionPayload);
    if (retry?.error) console.warn('Lỗi khi lưu cấu hình Mắt Bão vào tbl_config:', retry.error.message);
    return false;
  } catch (err) {
    console.warn('Lỗi khi lưu cấu hình Mắt Bão vào tbl_config:', err);
    return false;
  }
};

// tbl_config hiện chưa có các cột tùy chọn hóa đơn: chỉ thử ghi 1 lần để tránh làm chậm thao tác lưu
let invoiceDefaultsDbSupported = true;

const syncInvoiceDefaultsToDb = async (defaults, configId) => {
  try {
    const payload = {
      matbao_khmshdon: defaults.khmshDon,
      matbao_khhdon: defaults.khhDon,
      matbao_loaihdon: defaults.loaiHDon,
      matbao_hinhthuctt: defaults.hinhThucTT
    };
    const query = configId
      ? supabase.from('tbl_config').update(payload).eq('id', configId)
      : supabase.from('tbl_config').update(payload).not('id', 'is', null);
    const { error } = await query;
    if (error) {
      if (error.code === 'PGRST204' || /column .* does not exist/i.test(error.message || '')) {
        invoiceDefaultsDbSupported = false;
      }
      console.warn('Chưa lưu được tùy chọn hóa đơn Mắt Bão vào tbl_config:', error.message);
    }
  } catch (err) {
    invoiceDefaultsDbSupported = false;
    console.warn('Chưa lưu được tùy chọn hóa đơn Mắt Bão vào tbl_config:', err);
  }
};

/**
 * Lưu các tùy chọn xuất hóa đơn mặc định (mẫu số, ký hiệu, loại hóa đơn, hình thức TT)
 * từ ConfigManager: lưu ngay vào localStorage, đồng bộ tbl_config ở nền (nếu có cột).
 */
export const saveMatBaoInvoiceDefaults = ({ khmshDon, khhDon, loaiHDon, hinhThucTT, configId = null }) => {
  const defaults = {
    khmshDon: String(khmshDon ?? '').trim() || '1',
    khhDon: String(khhDon ?? '').trim().toUpperCase() || 'C26TAT',
    loaiHDon: Number(loaiHDon) === 1 ? 1 : 0,
    hinhThucTT: String(hinhThucTT ?? '').trim() || 'TM/CK'
  };

  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY_CONFIG) || '{}');
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify({ ...current, ...defaults }));
  } catch (e) {
    console.warn('Lỗi lưu tùy chọn hóa đơn Mắt Bão:', e);
  }

  if (invoiceDefaultsDbSupported) {
    syncInvoiceDefaultsToDb(defaults, configId);
  }

  return defaults;
};

/**
 * Lưu cấu hình kết nối Mắt Bão:
 * Ghi trực tiếp vào bảng tbl_config (schema truongla) đồng thời đồng bộ localStorage
 */
export const saveMatBaoConfig = async (cfg) => {
  localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(cfg));
  localStorage.removeItem(STORAGE_KEY_TOKEN);

  const connectionPayload = {
    matbao_base_url: cfg.baseUrl,
    matbao_mst: cfg.mst,
    matbao_username: cfg.username,
    matbao_password: cfg.password
  };

  const invoiceDefaults = {
    matbao_khmshdon: cfg.khmshDon,
    matbao_khhdon: cfg.khhDon,
    matbao_loaihdon: cfg.loaiHDon,
    matbao_hinhthuctt: cfg.hinhThucTT
  };

  await saveConfigToDb({ ...connectionPayload, ...invoiceDefaults }, connectionPayload);
};

/**
 * Khôi phục cấu hình mặc định từ file .env
 */
export const resetMatBaoConfig = () => {
  localStorage.removeItem(STORAGE_KEY_CONFIG);
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  return getEnvMatBaoConfig();
};

const MATBAO_FUNCTION_NAME = 'create-einvoice-matbao-truongla';

const getFunctionErrorMessage = async (error) => {
  let message = error?.message || `Lỗi khi gọi Edge Function ${MATBAO_FUNCTION_NAME}`;
  try {
    const response = error?.context;
    if (response && typeof response.json === 'function') {
      const payload = await response.json();
      message = payload?.error || payload?.message || message;
    }
  } catch (e) {
    // Giữ nguyên thông báo gốc nếu không đọc được body lỗi
  }
  return message;
};

// Schema được nhúng lúc build static (vd. trên Render) từ REACT_APP_SUPABASE_SCHEMA,
// Edge Function dùng giá trị này để đọc đúng tbl_config của từng trường.
const getClientSchema = () => process.env.REACT_APP_SUPABASE_SCHEMA || 'truongla';

const invokeMatBaoFunction = async (body) => {
  if (!supabase?.functions?.invoke) {
    throw new Error('Supabase client chưa được khởi tạo đúng cách để gọi Edge Function.');
  }

  const requestBody = Array.isArray(body) ? body : { ...body, schema: getClientSchema() };
  const { data, error } = await supabase.functions.invoke(MATBAO_FUNCTION_NAME, { body: requestBody });

  if (error) {
    console.error(`[matbaoService] Lỗi Edge Function ${MATBAO_FUNCTION_NAME}:`, error);
    throw new Error(await getFunctionErrorMessage(error));
  }

  return data;
};

/**
 * Gửi request tới API Mắt Bão qua Edge Function 'create-einvoice-matbao-truongla'
 * (Hàm tự lấy schema từ env và đọc cấu hình matbao_* trong tbl_config)
 */
export const callMatBaoApi = async ({ endpoint, method = 'POST', headers = {}, body = null }) =>
  invokeMatBaoFunction({ endpoint, method, headers, body });

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

  // Gọi API login qua proxy
  const resJson = await callMatBaoApi({
    endpoint: '/api/auth/login',
    method: 'POST',
    body: {
      MST: config.mst,
      TDNhap: config.username,
      MKhau: config.password
    }
  });

  if (resJson.errorCode !== 200 || !resJson.data?.accessToken) {
    const errMsg = resJson.message || `Đăng nhập Mắt Bão thất bại (Mã lỗi: ${resJson.errorCode || 'UNKNOWN'})`;
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
  const token = await getMatBaoToken();
  const resJson = await callMatBaoApi({
    endpoint: `/api/invoice/templates?year=${year}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (resJson.errorCode !== 200) {
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
      NMua_CCCDan: buyer.cccd || buyer.NMua_CCCDan || '',
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

  // Edge Function tự đăng nhập Mắt Bão (cấu hình trong tbl_config) và gửi hóa đơn
  const resJson = await invokeMatBaoFunction({ invoices: payload });

  if (resJson?.errorCode !== 200) {
    throw new Error(resJson?.message || resJson?.error || 'Lỗi tạo hóa đơn Mắt Bão');
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
  const token = await getMatBaoToken();

  const resJson = await callMatBaoApi({
    endpoint: '/api/invoice/download-invoice',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: {
      MaTraCuu: maTraCuu,
      MaSoHDon: maSoHDon
    }
  });

  if (resJson.errorCode !== 200) {
    throw new Error(resJson.message || 'Lỗi tải hóa đơn từ Mắt Bão');
  }

  return resJson.data; // Chứa { data_PDF_Base64, data_XML_Base64 }
};
