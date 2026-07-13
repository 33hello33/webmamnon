import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { 
  History, Search, RefreshCw, User, Calendar, Tag, Info, Filter, X, 
  ChevronLeft, ChevronRight, FileText, Trash2, Edit3, PlusCircle, AlertCircle
} from 'lucide-react';
import './SystemLogs.css';

export default function SystemLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [employees, setEmployees] = useState([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;

  const tableNames = {
    'tbl_hanghoa': 'Sản phẩm/Kho',
    'tbl_billhanghoa': 'Đơn hàng POS',
    'tbl_hd': 'Hóa đơn học phí',
    'tbl_nv': 'Nhân viên',
    'tbl_hv': 'Học viên',
    'tbl_lop': 'Lớp học',
    'tbl_diemdanh': 'Điểm danh',
    'tbl_thu': 'Phiếu thu',
    'tbl_chi': 'Phiếu chi',
    'tbl_thongbao': 'Thông báo',
    'tbl_task': 'Công việc',
    'tbl_chamcong': 'Chấm công',
    'tbl_luong': 'Phiếu lương',
    'tbl_log': 'Hệ thống'
  };

  useEffect(() => {
    fetchEmployees();
    fetchLogs();
  }, [page, userFilter, tableFilter]);

  const fetchEmployees = async () => {
    const { data } = await supabase.from('tbl_nv').select('manv, tennv, username');
    if (data) setEmployees(data);
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('tbl_log')
        .select('*, tbl_nv(tennv, username)', { count: 'exact' });

      if (userFilter) {
        query = query.eq('manv', userFilter);
      }
      
      if (tableFilter) {
        query = query.ilike('mota', `%Bảng: ${tableFilter}%`);
      }

      if (searchTerm) {
        query = query.ilike('mota', `%${searchTerm}%`);
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (error) throw error;
      setLogs(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error('Lỗi tải log:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    if (e.key === 'Enter') {
      setPage(1);
      fetchLogs();
    }
  };

  const formatMota = (mota) => {
    if (!mota) return { action: 'Thao tác', target: 'Hệ thống', details: '' };
    
    // Check if it's the structured format we just implemented
    // "[action] Bảng: table | Chi tiết: something (changes)"
    const structuredRegex = /\[(.*?)\] Bảng: (.*?)(?: \| Chi tiết: (.*?))?(?: \((.*?)\))?$/;
    const structuredMatch = mota.match(structuredRegex);
    
    if (structuredMatch) {
      const actionRaw = structuredMatch[1];
      const tableRaw = structuredMatch[2].trim();
      const detailRaw = structuredMatch[3] || '';
      const changesRaw = structuredMatch[4] || '';

      let actionLabel = actionRaw;
      if (actionRaw.includes('Nhập mới')) actionLabel = 'Thêm mới';
      if (actionRaw.includes('Sửa')) actionLabel = 'Cập nhật';
      if (actionRaw.includes('Xóa')) actionLabel = 'Đã xóa';

      return {
        action: actionLabel,
        target: tableNames[tableRaw] || tableRaw,
        details: detailRaw,
        changes: changesRaw,
        isError: actionRaw.includes('LỖI')
      };
    }

    // Check for explicit manual logs like "[XÓA] Bảng: ...", "[PHIẾU THU] ...", "[ĐIỂM DANH] ...", "[BÁN HÀNG POS] ..."
    const explicitRegex = /^\[(.*?)\] (.*)$/;
    const explicitMatch = mota.match(explicitRegex);
    if (explicitMatch) {
      const action = explicitMatch[1];
      const content = explicitMatch[2];
      
      let target = 'Hệ thống';
      let details = content;
      
      if (content.includes('Bảng:')) {
         const parts = content.split('|');
         const tablePart = parts[0].replace('Bảng:', '').trim();
         target = tableNames[tablePart] || tablePart;
         details = parts.slice(1).join('|').replace('Chi tiết:', '').trim();
      } else if (action.includes('PHIẾU') || action.includes('CÂN ĐỐI')) {
         target = 'Tài chính';
      } else if (action.includes('NHẬP KHO') || action.includes('KHO HÀNG') || action.includes('XÓA KHO')) {
         target = 'Sản phẩm/Kho';
      } else if (action.includes('XUẤT HĐ') || action.includes('BÁO PHÍ') || action.includes('PHIẾU THU') || action.includes('PHIẾU CHI')) {
         target = 'Học phí/Tài chính';
      } else if (action.includes('ĐIỂM DANH') || action.includes('XUẤT THÔNG BÁO')) {
         target = 'Học tập';
      } else if (action.includes('BÁN HÀNG')) {
         target = 'Đơn hàng POS';
      } else if (action.includes('NHÂN SỰ')) {
         target = 'Nhân sự';
      } else if (action.includes('HS') || action.includes('HỌC SINH')) {
         target = 'Học viên';
      } else if (action.includes('LỚP') || action.includes('CHUYỂN LỚP')) {
         target = 'Lớp học';
      } else if (action.includes('CÔNG VIỆC')) {
         target = 'Công việc';
      } else if (action.includes('CẤU HÌNH')) {
         target = 'Cấu hình';
      }

      return {
        action,
        target,
        details,
        isError: action.includes('LỖI')
      };
    }

    return { action: 'Thông báo', target: 'Hệ thống', details: mota, isError: mota.includes('[LỖI]') };
  };

  const getActionIcon = (action) => {
    const a = action.toUpperCase();
    if (a.includes('THÊM') || a.includes('MỚI') || a.includes('PHIẾU') || a.includes('NHẬP KHO') || a.includes('NHẬP EXCEL')) return <PlusCircle size={14} className="text-success" />;
    if (a.includes('CẬP NHẬT') || a.includes('SỬA') || a.includes('ĐIỂM DANH') || a.includes('CÂN ĐỐI') || a.includes('CHUYỂN TRẠNG THÁI') || a.includes('GIAO VIỆC')) return <Edit3 size={14} className="text-info" />;
    if (a.includes('XÓA')) return <Trash2 size={14} className="text-danger" />;
    if (a.includes('LỖI')) return <AlertCircle size={14} className="text-warning" />;
    if (a.includes('NHÂN SỰ') || a.includes('HS') || a.includes('HỌC SINH')) return <User size={14} className="text-primary" />;
    if (a.includes('LỚP') || a.includes('CHUYỂN LỚP')) return <History size={14} className="text-warning" />;
    if (a.includes('CÔNG VIỆC')) return <Calendar size={14} className="text-success" />;
    return <FileText size={14} />;
  };

  return (
    <div className="system-logs-container animate-fade-in">
      <div className="logs-header">
        <div className="title-group">
          <History size={24} className="text-primary" />
          <div>
            <h1>Lịch sử Hệ thống</h1>
            <p>Theo dõi mọi thao tác của người dùng trên hệ thống</p>
          </div>
        </div>
        <div className="logs-stats">
          <div className="stat-pill">
            <span className="label">Tổng cộng:</span>
            <span className="value">{totalCount.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="logs-filters">
        <div className="search-box">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Tìm kiếm nội dung... (Nhấn Enter)" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearch}
          />
        </div>

        <div className="filter-group">
          <div className="filter-item">
            <User size={16} />
            <select value={userFilter} onChange={(e) => { setUserFilter(e.target.value); setPage(1); }}>
              <option value="">Tất cả người dùng</option>
              {employees.map(emp => (
                <option key={emp.manv} value={emp.manv}>{emp.tennv || emp.username} ({emp.manv})</option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <Filter size={16} />
            <select value={tableFilter} onChange={(e) => { setTableFilter(e.target.value); setPage(1); }}>
              <option value="">Tất cả danh mục</option>
              {Object.entries(tableNames).map(([key, name]) => (
                <option key={key} value={key}>{name}</option>
              ))}
            </select>
          </div>

          <button className="btn-refresh" onClick={() => fetchLogs()} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      <div className="logs-table-wrapper">
        <table className="logs-table">
          <thead>
            <tr>
              <th width="180">Thời gian</th>
              <th width="180">Người thực hiện</th>
              <th width="150">Hành động</th>
              <th width="150">Đối tượng</th>
              <th>Chi tiết thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading && logs.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-5">
                  <RefreshCw className="spin" /> Đang tải dữ liệu...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-5">Không tìm thấy dữ liệu phù hợp</td>
              </tr>
            ) : (
              logs.map((log) => {
                const info = formatMota(log.mota);
                const userName = log.tbl_nv?.tennv || log.tbl_nv?.username || log.manv || 'Hệ thống';
                
                return (
                  <tr key={log.id} className={info.isError ? 'row-error' : ''}>
                    <td>
                      <div className="time-cell">
                        <Calendar size={12} />
                        {new Date(log.created_at).toLocaleString('vi-VN')}
                      </div>
                    </td>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar">{userName.charAt(0).toUpperCase()}</div>
                        <span>{userName}</span>
                      </div>
                    </td>
                    <td>
                      <div className={`action-badge ${info.action.toLowerCase()}`}>
                        {getActionIcon(info.action)}
                        {info.action}
                      </div>
                    </td>
                    <td>
                      <div className="target-cell">
                        <Tag size={12} />
                        {info.target}
                      </div>
                    </td>
                    <td className="detail-cell">
                      {info.details && <span className="item-name">{info.details}</span>}
                      {info.changes && (
                        <div className="changes-tag">
                          <Info size={10} />
                          {info.changes}
                        </div>
                      )}
                      {!info.details && !info.changes && <span className="text-muted">{log.mota}</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="logs-pagination">
        <div className="pagination-info">
          Hiển thị {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, totalCount)} trong số {totalCount}
        </div>
        <div className="pagination-controls">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={20} />
          </button>
          <span className="page-number">Trang {page}</span>
          <button disabled={page * pageSize >= totalCount} onClick={() => setPage(p => p + 1)}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
