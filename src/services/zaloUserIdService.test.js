import axios from 'axios';
import {
  getCachedLookup,
  getQuotaSnapshot,
  getZaloStorageKeys,
  isRateLimitMessage,
  searchZaloUserByPhone,
  setCachedLookup
} from './zaloUserIdService';

jest.mock('axios');

const HOUR = 60 * 60 * 1000;

describe('zaloUserIdService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  test('isRateLimitMessage nhận diện giới hạn và bỏ qua lỗi bị chặn', () => {
    expect(isRateLimitMessage('Too many requests')).toBe(true);
    expect(isRateLimitMessage('Bạn đã vượt quá số lần tìm kiếm trong giờ')).toBe(true);
    expect(isRateLimitMessage('Đã đạt giới hạn tra cứu, vui lòng thử lại sau')).toBe(true);
    expect(isRateLimitMessage('Người dùng này đã bị chặn do vi phạm chính sách của Zalo')).toBe(false);
    expect(isRateLimitMessage('Không tìm thấy người dùng')).toBe(false);
  });

  test('map kết quả tìm thấy và tự lưu cache', async () => {
    axios.get.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        success: true,
        found: true,
        contact: { userId: '123456789', resolvedName: 'Nguyễn Văn A', alias: 'HV0001' }
      }
    });

    const result = await searchZaloUserByPhone('+84 901 234 567');
    expect(result.status).toBe('found');
    expect(result.userId).toBe('123456789');
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/zalo/search-phone'),
      expect.objectContaining({ params: { phone: '0901234567' } })
    );
  });

  test('SĐT bị chặn trả về status blocked', async () => {
    axios.get.mockResolvedValue({
      status: 500,
      headers: {},
      data: { success: false, error: 'Người dùng này đã bị chặn do vi phạm chính sách của Zalo' }
    });

    const result = await searchZaloUserByPhone('0999999999');
    expect(result.status).toBe('blocked');
  });

  test('HTTP 429 trả về rate_limited kèm retryAfter', async () => {
    axios.get.mockResolvedValue({
      status: 429,
      headers: { 'retry-after': '120' },
      data: { success: false, error: 'Too many requests' }
    });

    const result = await searchZaloUserByPhone('0900000000');
    expect(result.status).toBe('rate_limited');
    expect(result.retryAfterMs).toBe(120000);
  });

  test('lỗi mạng trả về error để vòng lặp thử lại', async () => {
    axios.get.mockRejectedValue(new Error('Network Error'));
    const result = await searchZaloUserByPhone('0900000000');
    expect(result.status).toBe('error');
  });

  test('tài khoản hệ thống "Truyền File" coi như không tìm thấy', async () => {
    axios.get.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        success: true,
        found: true,
        contact: {
          userId: '8090484155831827766',
          resolvedName: '0900000001',
          displayName: '',
          alias: '',
          raw: { zalo_name: 'Truyền File' }
        }
      }
    });

    const result = await searchZaloUserByPhone('0900000001');
    expect(result.status).toBe('not_found');
  });

  test('lỗi "User không hợp lệ" coi như không tìm thấy', async () => {
    axios.get.mockResolvedValue({
      status: 500,
      headers: {},
      data: { success: false, error: 'User không hợp lệ' }
    });

    const result = await searchZaloUserByPhone('0900000009');
    expect(result.status).toBe('not_found');
  });

  test('hạn mức 60 phút: đủ lượt thì chặn và tính thời điểm mở lại', async () => {
    axios.get.mockResolvedValue({ status: 200, headers: {}, data: { success: false, error: 'Không tìm thấy' } });

    const limit = 3;
    for (let i = 0; i < limit; i++) {
      // eslint-disable-next-line no-await-in-loop
      await searchZaloUserByPhone(`090000000${i}`);
    }

    const snapshot = getQuotaSnapshot(limit);
    expect(snapshot.used).toBe(3);
    expect(snapshot.remaining).toBe(0);
    expect(snapshot.resetAt).toBeGreaterThan(Date.now() + HOUR - 60 * 1000);
    expect(snapshot.resetAt).toBeLessThanOrEqual(Date.now() + HOUR);
  });

  test('cache dùng lại kết quả và hết hạn theo loại kết quả', () => {
    setCachedLookup('0901112222', { status: 'found', userId: '999', name: 'A' });
    expect(getCachedLookup('0901 112 222')).toEqual(
      expect.objectContaining({ status: 'found', userId: '999', fromCache: true })
    );

    setCachedLookup('0901113333', {
      status: 'not_found',
      message: 'Không tìm thấy'
    });
    expect(getCachedLookup('0901113333').status).toBe('not_found');

    // Hết hạn cache phủ định sau 30 ngày
    const cache = JSON.parse(localStorage.getItem(getZaloStorageKeys().cache));
    cache['0901113333'].at = Date.now() - 31 * 24 * HOUR;
    localStorage.setItem(getZaloStorageKeys().cache, JSON.stringify(cache));
    expect(getCachedLookup('0901113333')).toBeNull();
  });
});
