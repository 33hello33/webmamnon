import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase';
import { 
  Users, UserPlus, Edit, Trash2, Search, X, CheckCircle2, AlertCircle, 
  Shield, Briefcase, RefreshCw 
} from 'lucide-react';
import './EmployeeManager.css';

const INITIAL_FORM = {
  manv: '', tennv: '', sdt: '', ghichu: '', 
  username: '', password: '', role: 'Giáo viên', trangthai: 'Đang Làm'
};

export default function EmployeeManager({ currentUser }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedId, setSelectedId] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [isEditMode, setIsEditMode] = useState(false);
  
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      let query = supabase.from('tbl_nv').select('*').order('manv', { ascending: true });
      
      // Phân quyền: Nhân viên VP chỉ quản lý được khối Giáo viên / Trợ giảng
      if (currentUser?.role === 'Nhân viên VP') {
        query = query.in('role', ['Giáo viên', 'Trợ giảng']);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      setEmployees(data || []);
      setSelectedId(null);
    } catch (err) {
      console.error(err);
      showMessage('error', 'Lỗi tải dữ liệu nhân sự');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const handleOpenAdd = () => {
    let nextId = 'NV001';
    if (employees.length > 0) {
      const nvIds = employees
        .map(e => e.manv)
        .filter(id => id && id.startsWith('NV'))
        .map(id => parseInt(id.replace('NV', ''), 10))
        .filter(n => !isNaN(n));
        
      if (nvIds.length > 0) {
        const maxId = Math.max(...nvIds);
        nextId = `NV${String(maxId + 1).padStart(3, '0')}`;
      }
    }
    
    setFormData({ ...INITIAL_FORM, manv: nextId });
    setIsEditMode(false);
    setIsFormOpen(true);
  };

  const handleOpenEdit = () => {
    if (!selectedId) return showMessage('error', 'Vui lòng chọn một nhân viên để sửa');
    const emp = employees.find(e => e.manv === selectedId);
    if (emp) {
      setFormData({ ...INITIAL_FORM, ...emp });
      setIsEditMode(true);
      setIsFormOpen(true);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.manv || !formData.tennv) {
      return showMessage('error', 'Mã và Tên nhân viên là bắt buộc');
    }

    try {
      if (isEditMode) {
        const { error } = await supabase.from('tbl_nv').update(formData).eq('manv', formData.manv);
        if (error) throw error;
        showMessage('success', 'Cập nhật thành công');
      } else {
        const { error } = await supabase.from('tbl_nv').insert([formData]);
        if (error) throw error;
        showMessage('success', 'Thêm nhân sự mới thành công');
      }
      setIsFormOpen(false);
      fetchEmployees();
    } catch (err) {
      console.error(err);
      if (err.code === '23505') return showMessage('error', 'Mã nhân viên đã tồn tại');
      showMessage('error', 'Lỗi lưu dữ liệu: ' + err.message);
    }
  };

  const confirmDelete = async () => {
    if (!selectedId) return;
    
    // Yêu cầu xác thực mật khẩu (check với thông tin đăng nhập từ localStorage)
    const sessionStr = localStorage.getItem('auth_session');
    if (!sessionStr) return showMessage('error', 'Phiên làm việc hết hạn');
    
    const session = JSON.parse(sessionStr);
    if (session.user.password !== deletePassword) {
      return showMessage('error', 'Mật khẩu xác nhận không đúng!');
    }

    try {
      const { error } = await supabase.from('tbl_nv').update({ trangthai: 'Đã Nghỉ' }).eq('manv', selectedId);
      if (error) throw error;
      showMessage('success', 'Đã chuyển trạng thái nhân viên thành Đã Nghỉ');
      setIsDeleteOpen(false);
      fetchEmployees();
    } catch (err) {
      console.error(err);
      showMessage('error', 'Lỗi khi xóa nhân sự');
    }
  };

  const filteredEmployees = employees.filter(e => 
    (e.tennv && e.tennv.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (e.manv && e.manv.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (e.sdt && e.sdt.includes(searchTerm)) ||
    (e.role && e.role.toLowerCase().includes(searchTerm.toLowerCase()))
  ).sort((a, b) => {
    if (a.trangthai === 'Đã Nghỉ' && b.trangthai !== 'Đã Nghỉ') return 1;
    if (a.trangthai !== 'Đã Nghỉ' && b.trangthai === 'Đã Nghỉ') return -1;
    return (a.manv || '').localeCompare(b.manv || '');
  });

  const activeCount = employees.filter(e => e.trangthai === 'Đang Làm').length;
  const teacherCount = employees.filter(e => e.role === 'Giáo viên' && e.trangthai === 'Đang Làm').length;
  
  return (
    <div className="employee-manager animate-fade-in">
      {message.text && (
        <div className={`message-alert ${message.type}`}>
          {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Statistics */}
      <div className="stats-container">
        <div className="stat-card total">
          <div className="stat-icon"><Users size={24} /></div>
          <div className="stat-info">
            <span className="stat-label">Tổng Nhân Sự</span>
            <span className="stat-value">{employees.length}</span>
          </div>
        </div>
        <div className="stat-card active">
          <div className="stat-icon"><Briefcase size={24} /></div>
          <div className="stat-info">
            <span className="stat-label">Đang Công Tác</span>
            <span className="stat-value">{activeCount}</span>
          </div>
        </div>
        <div className="stat-card warning">
          <div className="stat-icon"><Shield size={24} color="#f59e0b" /></div>
          <div className="stat-info">
            <span className="stat-label">Lực Lượng Giáo Viên</span>
            <span className="stat-value">{teacherCount}</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="emp-toolbar">
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Tìm theo tên, mã NV, phòng ban..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="action-buttons">
          <button className="btn btn-primary" onClick={handleOpenAdd}><UserPlus size={16} /> Thêm Mới</button>
          <button className="btn btn-outline" onClick={handleOpenEdit}><Edit size={16} /> Chỉnh Sửa</button>
          <button className="btn btn-danger" onClick={() => {
            if (!selectedId) return showMessage('error', 'Vui lòng chọn nhân viên để xóa');
            setDeletePassword('');
            setIsDeleteOpen(true);
          }}>
            <Trash2 size={16} /> Báo Nghỉ Việc
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="table-container shadow-sm border-radius-lg overflow-hidden bg-white">
        {loading ? (
          <div className="loading-state">
            <RefreshCw className="spinner" size={24} />
            <span>Đang đồng bộ nhân sự...</span>
          </div>
        ) : (
          <>
            <div className="table-scroll-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã NV</th>
                  <th>Tên Nhân Viên</th>
                  <th>Chức Vụ (Role)</th>
                  <th>SĐT</th>
                  <th>Trạng Thái</th>
                  <th>Tài Khoản (User)</th>
                  <th>Mật Khẩu</th>
                  <th>Ghi Chú</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length > 0 ? (
                  filteredEmployees.map((e) => (
                    <tr 
                      key={e.manv} 
                      className={`
                        ${selectedId === e.manv ? 'selected-row' : ''}
                        ${e.trangthai === 'Đã Nghỉ' ? 'row-inactive' : ''}
                      `}
                      onClick={() => setSelectedId(e.manv)}
                    >
                      <td className="font-medium text-slate-500">{e.manv}</td>
                      <td className="font-bold text-slate-800">{e.tenhv || e.tennv || '-'}</td>
                      <td>
                        <span className={`status-badge ${
                          e.role === 'Quản lý' ? 'danger' : 
                          e.role === 'Nhân viên VP' ? 'primary' : 
                          e.role === 'Trợ giảng' ? 'warning' : 'success'
                        }`}>
                          {e.role}
                        </span>
                      </td>
                      <td>{e.sdt || '-'}</td>
                      <td>
                        <span className={`status-badge ${e.trangthai === 'Đang Làm' ? 'active' : 'inactive'}`}>
                          {e.trangthai}
                        </span>
                      </td>
                      <td className="font-medium">{e.username || '-'}</td>
                      <td className="text-muted">{e.password ? '***' + e.password.substring(e.password.length - 2) : '-'}</td>
                      <td className="truncate-cell text-muted" title={e.ghichu}>{e.ghichu || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="empty-state">
                      <div className="empty-state-content">
                        <Users size={40} />
                        <p>Không tìm thấy nhân sự nào.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ✅ CARD LIST (mobile) */}
          <div className="employee-card-list">
            {filteredEmployees.length > 0 ? (
              filteredEmployees.map((e) => (
                <div 
                  key={e.manv} 
                  className={`employee-card ${selectedId === e.manv ? 'selected' : ''} ${e.trangthai === 'Đã Nghỉ' ? 'inactive' : ''}`}
                  onClick={() => setSelectedId(e.manv)}
                >
                  <div className="employee-card-header">
                    <div className="employee-info">
                      <span className="employee-name">{e.tenhv || e.tennv || '-'}</span>
                      <span className="employee-id">#{e.manv}</span>
                    </div>
                    <span className={`status-badge ${
                      e.role === 'Quản lý' ? 'danger' : 
                      e.role === 'Nhân viên VP' ? 'primary' : 
                      e.role === 'Trợ giảng' ? 'warning' : 'success'
                    }`}>
                      {e.role}
                    </span>
                  </div>
                  <div className="employee-card-body">
                    <div className="info-row">
                      <span><strong>SĐT:</strong> {e.sdt || '-'}</span>
                      <span className={`status-badge ${e.trangthai === 'Đang Làm' ? 'active' : 'inactive'}`}>
                        {e.trangthai}
                      </span>
                    </div>
                    <div className="info-row">
                      <span><strong>Tài khoản:</strong> {e.username || '-'}</span>
                    </div>
                    {e.ghichu && (
                      <div className="info-row note">
                        <span><strong>Ghi chú:</strong> {e.ghichu}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">Không tìm thấy nhân sự nào.</div>
            )}
          </div>
        </>
      )}
    </div>

      {/* Form Modal */}
      {isFormOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal-content form-modal mx-width-1000">
            <div className="modal-header">
              <h3>{isEditMode ? 'Sửa Hồ Sơ Nhân Viên' : 'Tiếp Nhận Nhân Viên Mới'}</h3>
              <button className="close-btn" onClick={() => setIsFormOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Mã Nhân Sự (Tự động)</label>
                  <input type="text" name="manv" value={formData.manv} onChange={handleChange} required disabled={true} />
                </div>
                <div className="form-group">
                  <label>Họ và Tên *</label>
                  <input type="text" name="tennv" value={formData.tennv} onChange={handleChange} required />
                </div>
                
                <div className="form-group">
                  <label>Chức Vụ (Role) *</label>
                  <select name="role" value={formData.role} onChange={handleChange} required>
                    {currentUser?.role !== 'Nhân viên VP' && (
                      <>
                        <option value="Quản lý">Quản lý</option>
                        <option value="Nhân viên VP">Nhân viên VP</option>
                      </>
                    )}
                    <option value="Giáo viên">Giáo viên</option>
                    <option value="Trợ giảng">Trợ giảng</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Trạng Thái</label>
                  <select name="trangthai" value={formData.trangthai} onChange={handleChange}>
                    <option value="Đang Làm">Đang Làm</option>
                    <option value="Đã Nghỉ">Đã Nghỉ</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Số Điện Thoại</label>
                  <input type="text" name="sdt" value={formData.sdt} onChange={handleChange} />
                </div>
                <div className="form-group">
                  {/* Spacer */}
                </div>

                <div className="form-group full-width">
                  <h4 className="margin-top-1 margin-bottom-0 text-primary border-bottom pb-2">Thông Tin Tài Khoản Ứng Dụng</h4>
                </div>
                <div className="form-group">
                  <label>Tên Đăng Nhập (Username)</label>
                  <input type="text" name="username" value={formData.username} onChange={handleChange} placeholder="Chỉ viết liền không dấu..." />
                </div>
                <div className="form-group">
                  <label>Mật Khẩu Phân Quyền</label>
                  <input type="text" name="password" value={formData.password} onChange={handleChange} placeholder="Chuỗi ký tự..." />
                </div>
                <div className="form-group">
                  {/* Spacer */}
                </div>

                <div className="form-group full-width">
                  <label>Ghi Chú Công Việc</label>
                  <textarea name="ghichu" value={formData.ghichu} onChange={handleChange} rows="2"></textarea>
                </div>

              </div>
              <div className="form-actions full-width">
                <button type="button" className="btn btn-outline" onClick={() => setIsFormOpen(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">{isEditMode ? 'Lưu Hồ Sơ' : 'Cấp Quyền'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal-content sm-modal">
            <div className="modal-header delete-header">
              <h3><AlertCircle size={20} /> Xác nhận báo nghỉ việc</h3>
              <button className="close-btn" onClick={() => setIsDeleteOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p>Bạn có chắc chắn chuyển trạng thái nhân sự <strong>{selectedId}{employees.find(e => e.manv === selectedId)?.tennv ? ` - ${employees.find(e => e.manv === selectedId).tennv}` : ''}</strong> thành Đã Nghỉ? Thao tác này sẽ cắt quyền truy cập vào phần mềm của nhân sự này nếu có.</p>
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label>Vui lòng nhập mật khẩu quản lý của bạn để xác nhận (Bảo mật 2 lớp):</label>
                <input 
                  type="password" 
                  value={deletePassword} 
                  onChange={(e) => setDeletePassword(e.target.value)} 
                  placeholder="Mật khẩu của bạn..."
                />
              </div>
              <div className="form-actions" style={{ marginTop: '1.5rem' }}>
                <button className="btn btn-outline" onClick={() => setIsDeleteOpen(false)}>Hủy Thay Đổi</button>
                <button className="btn btn-danger" onClick={confirmDelete}>Xác Nhận Nghỉ</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
