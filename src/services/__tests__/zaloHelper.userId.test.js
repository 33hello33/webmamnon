import axios from 'axios';
import { findZaloRecipient, sendZaloMessage, clearZaloRecipientCache } from '../zaloHelper';

const mockStudentRow = { data: null };

jest.mock('axios');
jest.mock('../../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(mockStudentRow)
        })
      }),
      update: () => ({
        eq: () => Promise.resolve({ error: null })
      })
    })
  }
}));

describe('findZaloRecipient ưu tiên zalo_user_id đã lưu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearZaloRecipientCache();
    mockStudentRow.data = null;
  });

  test('dùng zalo_user_id trong tbl_hv mà không cần gọi API tra cứu', async () => {
    mockStudentRow.data = { tenhv: 'Bé An', sdtme: '0901111111', sdtba: '0902222222', zalo_user_id: 'saved-uid' };

    const result = await findZaloRecipient({ mahv: 'HV0001', sdtme: '0901111111', sdtba: '0902222222' });

    expect(result.found).toBe(true);
    expect(result.method).toBe('zalo_user_id');
    expect(result.targetId).toBe('saved-uid');
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('bỏ qua zalo_user_id khi skipSavedZaloUserId được bật', async () => {
    mockStudentRow.data = { tenhv: 'Bé An', sdtme: '0901111111', sdtba: '', zalo_user_id: 'saved-uid' };
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/zalo/search-phone')) {
        return Promise.resolve({ data: { success: true, found: true, contact: { uid: 'phone-uid' } } });
      }
      return Promise.reject(new Error('not found'));
    });

    const result = await findZaloRecipient({ mahv: 'HV0001', sdtme: '0901111111', skipSavedZaloUserId: true });

    expect(result.method).toBe('phone_me');
    expect(result.targetId).toBe('phone-uid');
  });

  test('sendZaloMessage gửi trực tiếp tới zalo_user_id đã lưu', async () => {
    mockStudentRow.data = { tenhv: 'Bé An', sdtme: '', sdtba: '', zalo_user_id: 'saved-uid' };
    axios.post.mockResolvedValue({ status: 200, data: { success: true } });

    const result = await sendZaloMessage({ mahv: 'HV0001', message: 'Xin chào' });

    expect(result.success).toBe(true);
    expect(result.method).toBe('zalo_user_id');
    expect(result.targetId).toBe('saved-uid');
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/zalo/send-message'),
      expect.objectContaining({ threadId: 'saved-uid', message: 'Xin chào' }),
      expect.any(Object)
    );
    expect(axios.get).not.toHaveBeenCalled();
  });
});
