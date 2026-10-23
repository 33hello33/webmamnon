import axios from 'axios';
import { findZaloRecipient, clearZaloRecipientCache } from '../zaloHelper';

jest.mock('axios');
jest.mock('../../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null })
        })
      })
    })
  }
}));

const mockGet = (handler) => {
  axios.get.mockImplementation((url) => handler(url));
};

describe('findZaloRecipient priority (alias mahv -> sdtme -> sdtba)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearZaloRecipientCache();
  });

  test('alias mahv được ưu tiên trước SĐT mẹ/ba', async () => {
    mockGet((url) => {
      if (url.includes('/api/zalo/search-alias')) {
        return Promise.resolve({ data: { success: true, found: true, contact: { uid: 'alias-uid' } } });
      }
      if (url.includes('/api/zalo/search-phone')) {
        return Promise.resolve({ data: { success: true, found: true, contact: { uid: 'phone-uid' } } });
      }
      return Promise.resolve({ data: {} });
    });

    const result = await findZaloRecipient({ mahv: 'HV0001', sdtme: '0901111111', sdtba: '0902222222' });

    expect(result.method).toBe('alias');
    expect(result.targetId).toBe('alias-uid');
    expect(axios.get.mock.calls.some(([url]) => url.includes('search-phone'))).toBe(false);
  });

  test('alias nằm trong tên gợi nhớ (quét danh sách alias) vẫn tìm ra', async () => {
    mockGet((url) => {
      if (url.includes('/api/zalo/search-alias')) {
        return Promise.reject(new Error('not found'));
      }
      if (url.includes('/api/zalo/aliases')) {
        return Promise.resolve({ data: { aliases: [{ alias: 'trần phúc nguyên HV0001', userId: 'u-alias' }] } });
      }
      if (url.includes('/api/zalo/friends')) {
        return Promise.resolve({ data: { friends: [] } });
      }
      if (url.includes('/api/zalo/search-phone')) {
        return Promise.resolve({ data: { success: true, found: true, contact: { uid: 'phone-uid' } } });
      }
      return Promise.resolve({ data: {} });
    });

    const result = await findZaloRecipient({ mahv: 'HV0001', sdtme: '0901111111', sdtba: '0902222222' });

    expect(result.method).toBe('alias');
    expect(result.targetId).toBe('u-alias');
  });

  test('không có alias thì dùng SĐT mẹ trước SĐT ba', async () => {
    mockGet((url) => {
      if (url.includes('/api/zalo/search-alias')) {
        return Promise.reject(new Error('not found'));
      }
      if (url.includes('/api/zalo/aliases') || url.includes('/api/zalo/friends')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('phone=0901111111')) {
        return Promise.resolve({ data: { success: true, found: true, contact: { uid: 'me-uid' } } });
      }
      if (url.includes('phone=0902222222')) {
        return Promise.resolve({ data: { success: true, found: true, contact: { uid: 'ba-uid' } } });
      }
      return Promise.resolve({ data: {} });
    });

    const result = await findZaloRecipient({ mahv: 'HV0001', sdtme: '0901111111', sdtba: '0902222222' });

    expect(result.method).toBe('phone_me');
    expect(result.targetId).toBe('me-uid');
  });

  test('SĐT mẹ không có Zalo thì fallback sang SĐT ba', async () => {
    mockGet((url) => {
      if (url.includes('/api/zalo/search-alias')) {
        return Promise.reject(new Error('not found'));
      }
      if (url.includes('/api/zalo/aliases') || url.includes('/api/zalo/friends')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('phone=0901111111')) {
        return Promise.resolve({ data: { success: true, found: false } });
      }
      if (url.includes('phone=0902222222')) {
        return Promise.resolve({ data: { success: true, found: true, contact: { uid: 'ba-uid' } } });
      }
      return Promise.resolve({ data: {} });
    });

    const result = await findZaloRecipient({ mahv: 'HV0001', sdtme: '0901111111', sdtba: '0902222222' });

    expect(result.method).toBe('phone_ba');
    expect(result.targetId).toBe('ba-uid');
  });
});
