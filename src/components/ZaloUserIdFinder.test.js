import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import ZaloUserIdFinder from './ZaloUserIdFinder';
import { searchZaloUserByPhone, getZaloStorageKeys } from '../services/zaloUserIdService';

jest.mock('../supabase', () => ({
  insertLog: jest.fn(),
  supabaseNoLog: {
    from: () => ({
      update: () => ({
        eq: () => Promise.resolve({ error: null })
      })
    })
  }
}));

jest.mock('../services/zaloUserIdService', () => {
  const actual = jest.requireActual('../services/zaloUserIdService');
  return { ...actual, searchZaloUserByPhone: jest.fn() };
});

const advance = async (totalMs, stepMs = 100) => {
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      jest.advanceTimersByTime(stepMs);
    });
  }
};

const renderFinder = (props = {}) => render(
  <ZaloUserIdFinder
    open
    onClose={() => {}}
    students={[]}
    filteredStudents={[]}
    selectedStudentId=""
    onSaved={jest.fn()}
    onJobStateChange={jest.fn()}
    {...props}
  />
);

describe('ZaloUserIdFinder', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  test('tra cứu lần lượt và lưu Zalo User ID tìm được', async () => {
    const onSaved = jest.fn();
    searchZaloUserByPhone.mockImplementation(async (phone) => {
      if (String(phone) === '0901111111') {
        return { status: 'found', userId: 'uid-1', name: 'Học viên A' };
      }
      return { status: 'not_found', message: 'Không tìm thấy' };
    });

    renderFinder({
      students: [
        { mahv: 'HV001', tenhv: 'Học viên A', sdtme: '0901111111', sdtba: '' },
        { mahv: 'HV002', tenhv: 'Học viên B', sdtme: '', sdtba: '0902222222' }
      ],
      onSaved
    });

    fireEvent.click(screen.getByText('Bắt đầu tìm'));
    await advance(6000);

    expect(onSaved).toHaveBeenCalledWith('HV001', 'uid-1');
    expect(searchZaloUserByPhone).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/2\/2 \(100%\)/)).toBeInTheDocument();
  });

  test('gặp giới hạn Zalo thì tự nghỉ rồi tự tiếp tục tra cứu', async () => {    searchZaloUserByPhone
      .mockResolvedValueOnce({ status: 'rate_limited', message: 'Too many requests' })
      .mockResolvedValue({ status: 'found', userId: 'uid-2', name: 'Học viên C' });

    const onSaved = jest.fn();

    renderFinder({
      students: [{ mahv: 'HV003', tenhv: 'Học viên C', sdtme: '0903333333', sdtba: '' }],
      onSaved
    });

    fireEvent.click(screen.getByText('Bắt đầu tìm'));
    await advance(2000);

    expect(screen.getByText(/Zalo đang tạm giới hạn tra cứu/)).toBeInTheDocument();
    expect(searchZaloUserByPhone).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();

    await advance(130000);

    expect(onSaved).toHaveBeenCalledWith('HV003', 'uid-2');
    expect(searchZaloUserByPhone).toHaveBeenCalledTimes(2);
  });

  test('chạm hạn mức/giờ thì tự chờ hết cửa sổ 60 phút rồi mới tra tiếp', async () => {
    localStorage.setItem(getZaloStorageKeys().quota, JSON.stringify([{ t: Date.now(), phone: '0900000000' }]));
    searchZaloUserByPhone.mockResolvedValue({ status: 'found', userId: 'uid-9', name: 'Học viên D' });

    const onSaved = jest.fn();
    renderFinder({
      students: [{ mahv: 'HV009', tenhv: 'Học viên D', sdtme: '0909999999', sdtba: '' }],
      onSaved
    });

    fireEvent.change(screen.getByDisplayValue('30'), { target: { value: '1' } });
    fireEvent.click(screen.getByText('Bắt đầu tìm'));
    await advance(2000);

    expect(screen.getByText(/Đã chạm hạn mức tìm kiếm theo giờ của Zalo/)).toBeInTheDocument();
    expect(searchZaloUserByPhone).not.toHaveBeenCalled();

    await advance(65 * 60 * 1000, 15000);

    expect(searchZaloUserByPhone).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith('HV009', 'uid-9');
  });
});
