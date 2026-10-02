/**
 * Helper xử lý nội dung chuyển khoản và tạo URL VietQR
 */

export const getShortStudentName = (name) => {
  const normalized = String(name || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  const parts = normalized.split(' ');
  if (parts.length <= 2) return normalized;
  return parts.slice(-2).join(' ');
};

export const formatMonthYearValue = (val) => {
  if (!val) return '';
  const str = String(val).trim();
  // Nếu đã ở dạng MM/YYYY
  if (/^\d{1,2}\/\d{4}$/.test(str)) {
    return str;
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
  return str;
};

/**
 * Phục hồi / thay thế các placeholder trong template:
 * Hỗ trợ cú pháp [bien] hoặc {bien} (không phân biệt chữ hoa thường)
 * Các biến hỗ trợ:
 * - [mahv]: Mã học viên
 * - [tenhv] / [hoten]: Họ và tên học sinh
 * - [tenrutgon] / [shortname] / [ten]: Tên rút gọn (2 từ cuối)
 * - [tenlop] / [lop]: Tên lớp
 * - [malop]: Mã lớp
 * - [mahd] / [mabill] / [sophieu]: Mã hóa đơn / thông báo
 * - [ngaybatdau]: Tháng/Kỳ học tính từ ngày bắt đầu (MM/YYYY)
 * - [thang]: Tháng học (MM/YYYY)
 * - [thoiluong]: Thời lượng học phí
 */
export const formatQRTransferContent = (template, data = {}) => {
  const mahv = String(data.mahv || '').trim();
  const tenhv = String(data.tenhv || data.hoten || '').trim();
  const shortName = getShortStudentName(tenhv);
  const tenlop = String(data.tenlop || data.lop || '').trim();
  const malop = String(data.malop || '').trim();
  const mahd = String(data.mahd || data.mabill || data.sophieu || '').trim();
  const thoiluong = String(data.thoiluong || '').trim();

  let ngaybatdauFormatted = '';
  if (data.ngaybatdau) {
    ngaybatdauFormatted = formatMonthYearValue(data.ngaybatdau);
  } else if (thoiluong) {
    ngaybatdauFormatted = thoiluong;
  }

  let thangValue = '';
  if (data.thang) {
    thangValue = String(data.thang).trim();
  } else if (ngaybatdauFormatted) {
    thangValue = ngaybatdauFormatted;
  } else if (thoiluong) {
    thangValue = thoiluong;
  }

  const tpl = (template && typeof template === 'string') ? template.trim() : '';
  if (!tpl) {
    return [mahv, shortName].filter(Boolean).join(' ');
  }

  const result = tpl.replace(/(\[|\{)\s*([a-zA-Z0-9_]+)\s*(\]|\})/gi, (match, open, key) => {
    const k = key.toLowerCase();
    switch (k) {
      case 'mahv':
        return mahv;
      case 'tenhv':
      case 'hoten':
        return tenhv;
      case 'tenrutgon':
      case 'shortname':
      case 'ten':
        return shortName || tenhv;
      case 'tenlop':
      case 'lop':
        return tenlop;
      case 'malop':
        return malop;
      case 'mahd':
      case 'mabill':
      case 'sophieu':
        return mahd;
      case 'ngaybatdau':
        return ngaybatdauFormatted;
      case 'thang':
        return thangValue;
      case 'thoiluong':
        return thoiluong || ngaybatdauFormatted;
      default:
        if (data[key] !== undefined && data[key] !== null) {
          return String(data[key]);
        }
        return '';
    }
  });

  return result.replace(/\s+/g, ' ').trim();
};

/**
 * Sinh link ảnh VietQR đầy đủ
 */
export const generateVietQRUrl = ({
  bankId,
  accNo,
  accName = '',
  amount = 0,
  template = '',
  data = {},
  cacheBust = false
}) => {
  if (!bankId || !accNo) return null;
  const amountStr = String(amount || '0').replace(/\D/g, '');
  const infoText = formatQRTransferContent(template, data);
  const infoEncoded = encodeURIComponent(infoText);
  const base = `https://img.vietqr.io/image/${bankId}-${accNo}-compact2.png?amount=${amountStr}&addInfo=${infoEncoded}&accountName=${encodeURIComponent(accName || '')}`;
  return cacheBust ? `${base}&_cb=${Date.now()}_${Math.random().toString(36).slice(2)}` : base;
};
