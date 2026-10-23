import { formatZaloMessage, buildZaloCaption } from '../zaloMessage';

describe('zaloMessage', () => {
  test('thay thế các từ khóa có giá trị', () => {
    const text = formatZaloMessage('Biên lai [tenhv] - Số phiếu [mahd] ([mahv])', {
      tenhv: 'Bé An',
      mahv: 'HV001',
      mahd: 'HD001'
    });
    expect(text).toBe('Biên lai Bé An - Số phiếu HD001 (HV001)');
  });

  test('giữ nguyên từ khóa không có giá trị', () => {
    expect(formatZaloMessage('Xin chào [tenhv] [khongco]', { tenhv: 'Bé An' })).toBe('Xin chào Bé An [khongco]');
  });

  test('buildZaloCaption dùng câu mặc định khi mẫu trống', () => {
    expect(buildZaloCaption(null, { tenhv: 'Bé An' }, 'Mặc định')).toBe('Mặc định');
    expect(buildZaloCaption('   ', {}, 'Mặc định')).toBe('Mặc định');
  });

  test('buildZaloCaption dùng mẫu cấu hình khi có', () => {
    expect(buildZaloCaption('TB [tenhv] - [mahd]', { tenhv: 'Bé An', mahd: 'HD9' }, 'Mặc định')).toBe('TB Bé An - HD9');
  });
});
