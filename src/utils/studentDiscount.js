export const EMPTY_STUDENT_DISCOUNT = { phantram: 0, sotien: 0 };

export const DISCOUNT_TYPES = {
  NONE: 'khong',
  PERCENT: 'phantram',
  AMOUNT: 'sotien'
};

const toNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const toPercentNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value ?? '').trim().replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const toMoneyNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
};

const decodeDiscount = (raw) => {
  if (typeof raw !== 'string') return raw;
  const text = raw.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return { phantram: toNumber(text) };
  }
};

const parseDiscountEntry = (entry) => {
  const data = decodeDiscount(entry);
  if (Array.isArray(data)) return parseDiscountEntry(data[0]);
  if (typeof data === 'number') {
    return { phantram: Math.min(100, Math.max(0, data)), sotien: 0 };
  }
  const phantram = Math.min(100, Math.max(0, toNumber(data?.phantram)));
  const sotien = Math.max(0, Math.round(toNumber(data?.sotien)));
  return { phantram, sotien };
};

const hasDiscountValue = (discount) => !!discount && (discount.phantram > 0 || discount.sotien > 0);

/**
 * Chuẩn hóa cột tbl_hv.giamhp (json) về { phantram, sotien } của mức giảm đầu tiên.
 * Hỗ trợ json nhiều mức (mảng), json một mức (object) và dữ liệu cũ dạng số.
 */
export const parseStudentDiscount = (raw) => {
  const data = decodeDiscount(raw);
  if (Array.isArray(data)) {
    return data.length > 0 ? parseDiscountEntry(data[0]) : { ...EMPTY_STUDENT_DISCOUNT };
  }
  return parseDiscountEntry(data);
};

/**
 * Danh sách các mức giảm đã cấu hình cho học sinh (bỏ các mức bằng 0).
 */
export const parseStudentDiscountLevels = (raw) => {
  const data = decodeDiscount(raw);
  const list = Array.isArray(data) ? data : [data];
  return list.map(parseDiscountEntry).filter(hasDiscountValue);
};

export const getStudentDiscountType = (raw) => {
  const discount = parseStudentDiscount(raw);
  if (discount.sotien > 0) return DISCOUNT_TYPES.AMOUNT;
  if (discount.phantram > 0) return DISCOUNT_TYPES.PERCENT;
  return DISCOUNT_TYPES.NONE;
};

export const buildStudentDiscount = (type, value) => {
  if (type === DISCOUNT_TYPES.PERCENT) {
    return { phantram: Math.min(100, Math.max(0, toPercentNumber(value))), sotien: 0 };
  }
  if (type === DISCOUNT_TYPES.AMOUNT) {
    return { phantram: 0, sotien: Math.round(toMoneyNumber(value)) };
  }
  return { ...EMPTY_STUDENT_DISCOUNT };
};

/**
 * Ghép danh sách mức giảm đang nhập trên form thành json lưu vào tbl_hv.giamhp.
 */
export const buildStudentDiscountLevels = (entries) => {
  const result = [];
  const seen = new Set();
  (Array.isArray(entries) ? entries : []).forEach(entry => {
    const discount = buildStudentDiscount(entry?.type, entry?.value);
    if (!hasDiscountValue(discount)) return;
    const key = discount.phantram > 0 ? `phantram:${discount.phantram}` : `sotien:${discount.sotien}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(discount);
  });
  return result;
};

export const calcStudentDiscountAmount = (hocphi, raw) => {
  const discount = parseStudentDiscount(raw);
  if (!hasDiscountValue(discount)) return 0;
  if (discount.phantram > 0) {
    return Math.round(((Number(hocphi) || 0) * discount.phantram) / 100);
  }
  return Math.round(discount.sotien);
};

/**
 * Định dạng số tiền với dấu chấm phân cách hàng ngàn (VD: 1500000 -> "1.500.000").
 */
export const formatThousands = (value) => {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('vi-VN');
};

/**
 * Chỉ giữ lại chữ số của số tiền đang nhập (bỏ dấu chấm phân cách).
 */
export const parseMoneyDigits = (value) => String(value ?? '').replace(/[^\d]/g, '');

/**
 * Giá trị hiện tại của select giảm học phí (dùng cho InvoiceManager).
 */
export const detectDiscountValue = ({ discountPercent = 0, giamHocphi = 0 } = {}) => {
  const pct = Number(discountPercent) || 0;
  if (pct > 0) return `phantram:${pct}`;
  const amount = Number(giamHocphi) || 0;
  return amount > 0 ? `sotien:${Math.round(amount)}` : 'none';
};

/**
 * Giá trị hiện tại của select giảm học phí khi đã biết mức đang áp dụng (dùng cho ClassManager).
 */
export const getDiscountSelectValue = ({ mode = 'none', discountPercent = 0, giamHocphi = 0 } = {}) => {
  if (mode === 'custom') return 'custom';
  if (mode === DISCOUNT_TYPES.PERCENT) {
    const pct = Number(discountPercent) || 0;
    return pct > 0 ? `phantram:${pct}` : 'none';
  }
  if (mode === DISCOUNT_TYPES.AMOUNT) {
    const amount = Number(giamHocphi) || 0;
    return amount > 0 ? `sotien:${Math.round(amount)}` : 'none';
  }
  return detectDiscountValue({ discountPercent, giamHocphi });
};

/**
 * Danh sách lựa chọn cho select "mức giảm của học sinh":
 * tất cả mức đã cấu hình trong hồ sơ học sinh + mức đang áp dụng (nếu khác) + tùy chỉnh.
 * opts.compact: nhãn ngắn gọn cho bảng có cột hẹp.
 */
export const buildDiscountSelectOptions = (raw, currentValue = 'none', opts = {}) => {
  const levels = parseStudentDiscountLevels(raw);
  const compact = opts.compact === true;
  const options = [{ value: 'none', label: 'Không giảm' }];
  const seen = new Set(['none']);

  const add = (value, label) => {
    if (seen.has(value)) return;
    seen.add(value);
    options.push({ value, label });
  };

  levels.forEach(level => {
    if (level.phantram > 0) {
      add(`phantram:${level.phantram}`, compact ? `${level.phantram}% (HS)` : `Giảm ${level.phantram}% (của HS)`);
    }
    if (level.sotien > 0) {
      add(`sotien:${level.sotien}`, compact
        ? `${level.sotien.toLocaleString('vi-VN')} đ (HS)`
        : `Giảm ${level.sotien.toLocaleString('vi-VN')} ₫ (của HS)`);
    }
  });

  const [currentKind, currentRaw] = String(currentValue || '').split(':');
  const currentNumber = toNumber(currentRaw);
  if (currentKind === 'phantram' && currentNumber > 0) {
    add(currentValue, compact ? `${currentNumber}%` : `Giảm ${currentNumber}%`);
  }
  if (currentKind === 'sotien' && currentNumber > 0) {
    add(currentValue, compact ? `${currentNumber.toLocaleString('vi-VN')} đ` : `Giảm ${currentNumber.toLocaleString('vi-VN')} ₫`);
  }

  options.push({ value: 'custom', label: compact ? 'Khác' : 'Tùy chỉnh' });
  return options;
};

/**
 * Tính % và số tiền giảm tương ứng với lựa chọn trong select.
 * Trả về null khi người dùng chọn "Tùy chỉnh" (giữ nguyên giá trị đang nhập).
 */
export const resolveDiscountValue = (value, hocphi) => {
  if (!value || value === 'custom') return null;
  if (value === 'none') return { discountPercent: 0, giamHocphi: 0 };
  const [kind, rawVal] = String(value).split(':');
  const num = Math.max(0, toNumber(rawVal));
  const hp = Number(hocphi) || 0;
  if (kind === 'phantram') return { discountPercent: Math.min(100, num), giamHocphi: Math.round((hp * Math.min(100, num)) / 100) };
  if (kind === 'sotien') return { discountPercent: 0, giamHocphi: Math.round(num) };
  return null;
};
