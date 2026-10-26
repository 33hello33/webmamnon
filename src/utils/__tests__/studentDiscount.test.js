import {
  buildDiscountSelectOptions,
  buildStudentDiscount,
  buildStudentDiscountLevels,
  calcStudentDiscountAmount,
  detectDiscountValue,
  formatThousands,
  getDiscountSelectValue,
  parseMoneyDigits,
  parseStudentDiscount,
  parseStudentDiscountLevels,
  resolveDiscountValue
} from '../studentDiscount';

describe('parseStudentDiscount', () => {
  test('đọc json {phantram, sotien}', () => {
    expect(parseStudentDiscount({ phantram: 10, sotien: 0 })).toEqual({ phantram: 10, sotien: 0 });
    expect(parseStudentDiscount({ phantram: 0, sotien: 500000 })).toEqual({ phantram: 0, sotien: 500000 });
  });

  test('đọc json dạng chuỗi và dữ liệu cũ dạng số', () => {
    expect(parseStudentDiscount('{"phantram":5,"sotien":0}')).toEqual({ phantram: 5, sotien: 0 });
    expect(parseStudentDiscount(15)).toEqual({ phantram: 15, sotien: 0 });
    expect(parseStudentDiscount(null)).toEqual({ phantram: 0, sotien: 0 });
  });

  test('nhiều mức giảm: lấy mức đầu tiên làm mặc định', () => {
    const levels = [{ phantram: 10, sotien: 0 }, { phantram: 0, sotien: 500000 }];
    expect(parseStudentDiscount(levels)).toEqual({ phantram: 10, sotien: 0 });
    expect(parseStudentDiscount(JSON.stringify(levels))).toEqual({ phantram: 10, sotien: 0 });
  });
});

describe('parseStudentDiscountLevels', () => {
  test('trả về tất cả mức giảm hợp lệ', () => {
    expect(parseStudentDiscountLevels([
      { phantram: 10, sotien: 0 },
      { phantram: 0, sotien: 500000 },
      { phantram: 0, sotien: 0 }
    ])).toEqual([
      { phantram: 10, sotien: 0 },
      { phantram: 0, sotien: 500000 }
    ]);
    expect(parseStudentDiscountLevels({ phantram: 0, sotien: 0 })).toEqual([]);
    expect(parseStudentDiscountLevels(null)).toEqual([]);
  });
});

describe('buildStudentDiscount', () => {
  test('tạo json theo loại giảm', () => {
    expect(buildStudentDiscount('phantram', '12.5')).toEqual({ phantram: 12.5, sotien: 0 });
    expect(buildStudentDiscount('sotien', '500000')).toEqual({ phantram: 0, sotien: 500000 });
    expect(buildStudentDiscount('khong', '100')).toEqual({ phantram: 0, sotien: 0 });
  });
});

describe('buildStudentDiscountLevels', () => {
  test('ghép nhiều mức giảm và bỏ mức trống/trùng', () => {
    expect(buildStudentDiscountLevels([
      { type: 'phantram', value: '10' },
      { type: 'sotien', value: '500.000' },
      { type: 'sotien', value: '500000' },
      { type: 'phantram', value: '' }
    ])).toEqual([
      { phantram: 10, sotien: 0 },
      { phantram: 0, sotien: 500000 }
    ]);
  });
});

describe('formatThousands', () => {
  test('thêm dấu chấm hàng ngàn', () => {
    expect(formatThousands('1500000')).toBe('1.500.000');
    expect(formatThousands(500000)).toBe('500.000');
    expect(formatThousands('')).toBe('');
    expect(parseMoneyDigits('1.500.000')).toBe('1500000');
  });
});

describe('calcStudentDiscountAmount', () => {
  test('tính theo % hoặc theo số tiền', () => {
    expect(calcStudentDiscountAmount(2000000, { phantram: 10, sotien: 0 })).toBe(200000);
    expect(calcStudentDiscountAmount(2000000, { phantram: 0, sotien: 300000 })).toBe(300000);
    expect(calcStudentDiscountAmount(2000000, [{ phantram: 0, sotien: 300000 }, { phantram: 50, sotien: 0 }])).toBe(300000);
    expect(calcStudentDiscountAmount(2000000, null)).toBe(0);
  });
});

describe('select mức giảm', () => {
  const studentDiscount = [{ phantram: 10, sotien: 0 }, { phantram: 0, sotien: 500000 }];

  test('giá trị hiện tại của select', () => {
    expect(detectDiscountValue({ discountPercent: 0, giamHocphi: 0 })).toBe('none');
    expect(detectDiscountValue({ discountPercent: 10, giamHocphi: 200000 })).toBe('phantram:10');
    expect(detectDiscountValue({ discountPercent: 0, giamHocphi: 300000 })).toBe('sotien:300000');
    expect(getDiscountSelectValue({ mode: 'custom', discountPercent: 50, giamHocphi: 0 })).toBe('custom');
    expect(getDiscountSelectValue({ mode: 'phantram', discountPercent: 50, giamHocphi: 0 })).toBe('phantram:50');
  });

  test('liệt kê tất cả mức của học sinh và mức đang áp dụng', () => {
    const options = buildDiscountSelectOptions(studentDiscount, 'phantram:50');
    expect(options.map(o => o.value)).toEqual(['none', 'phantram:10', 'sotien:500000', 'phantram:50', 'custom']);
    expect(options.find(o => o.value === 'sotien:500000').label).toContain('500.000');
  });

  test('nhãn ngắn gọn cho bảng hẹp', () => {
    const options = buildDiscountSelectOptions(studentDiscount, 'sotien:500000', { compact: true });
    expect(options.map(o => o.value)).toEqual(['none', 'phantram:10', 'sotien:500000', 'custom']);
    expect(options.find(o => o.value === 'sotien:500000').label).toBe('500.000 đ (HS)');
    expect(options.find(o => o.value === 'custom').label).toBe('Khác');
  });

  test('chọn mức giảm tính đúng số tiền', () => {
    expect(resolveDiscountValue('phantram:10', 2000000)).toEqual({ discountPercent: 10, giamHocphi: 200000 });
    expect(resolveDiscountValue('sotien:300000', 2000000)).toEqual({ discountPercent: 0, giamHocphi: 300000 });
    expect(resolveDiscountValue('none', 2000000)).toEqual({ discountPercent: 0, giamHocphi: 0 });
    expect(resolveDiscountValue('custom', 2000000)).toBeNull();
  });
});
