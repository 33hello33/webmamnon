import React from 'react';
import { render, screen } from '@testing-library/react';
import ConfigManager from '../ConfigManager';

let mockConfig;

jest.mock('../../ConfigContext', () => ({
  __esModule: true,
  useConfig: () => ({ config: mockConfig, refreshConfig: jest.fn() })
}));

jest.mock('../../supabase', () => ({
  __esModule: true,
  supabase: {
    from: jest.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: null }) }) })),
    storage: { from: () => ({ upload: jest.fn(), getPublicUrl: jest.fn() }) }
  },
  insertLog: jest.fn(),
  SUPABASE_SCHEMA: 'public'
}));

jest.mock('../../utils/cloudflareR2', () => ({ __esModule: true, uploadToR2: jest.fn() }));
jest.mock('../HolidayManager', () => ({ __esModule: true, default: () => null }));

const baseConfig = {
  tenweb: 'Mầm non Test',
  motaweb: 'Mô tả',
  hangmucthu: [],
  hangmucchi: [],
  phanquyenrole: { 'Quản lý': { full: true }, 'Nhân viên VP': { full: false, tabs: [] } }
};

describe('ConfigManager - cấu hình tin nhắn Zalo', () => {
  test('luôn hiển thị mẫu tin nhắn Zalo (không phụ thuộc tbl_config.chatzalo)', () => {
    mockConfig = { ...baseConfig, chatzalo: true };
    render(<ConfigManager />);

    expect(screen.getByText('Cấu hình Tin nhắn tự động Zalo')).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Khóa học\/học phí của học viên đã kết thúc/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Hiện tại học viên còn nợ học phí/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/nhà trường ghi nhận bé/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Thông báo thu học phí [tenhv] - Số phiếu [mahd]')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Biên lai thu học phí [tenhv] - Số phiếu [mahd]')).toBeInTheDocument();
  });

  test('vẫn hiển thị mẫu tin nhắn khi tbl_config.chatzalo = false', () => {
    mockConfig = { ...baseConfig, chatzalo: false };
    render(<ConfigManager />);

    expect(screen.getByText('Cấu hình Tin nhắn tự động Zalo')).toBeInTheDocument();
  });

  test('vẫn hiển thị mẫu tin nhắn khi config không có trường chatzalo', () => {
    mockConfig = { ...baseConfig };
    render(<ConfigManager />);

    expect(screen.getByText('Cấu hình Tin nhắn tự động Zalo')).toBeInTheDocument();
  });
});
