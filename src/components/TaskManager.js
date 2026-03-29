import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../supabase';
import { Plus, Clock, Search, Edit2, Trash2, X, Filter, Briefcase, RefreshCw, CheckCircle } from 'lucide-react';
import './TaskManager.css';

export default function TaskManager() {
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterNV, setFilterNV] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({ noidung: '', tinhtrang: 'Chưa xử lý', manv: '' });

  const fetchTasks = async () => {
     setLoading(true);
     const { data, error } = await supabase.from('tbl_ghichu').select('*').order('time', { ascending: false });
     if (!error) setTasks(data || []);
     
     // Also fetch employees for mapping
     const { data: emps } = await supabase.from('tbl_nv').select('manv, tennv');
     if (emps) setEmployees(emps);
     
     setLoading(false);
  };

  useEffect(() => { fetchTasks(); }, []);

  const handleOpenAdd = () => {
     const auth = JSON.parse(localStorage.getItem('auth_session') || '{}');
     const currentManv = auth.user?.manv || '';
     setFormData({ noidung: '', tinhtrang: 'Chưa xử lý', manv: currentManv });
     setIsEdit(false);
     setEditId(null);
     setIsFormOpen(true);
  };

  const handleOpenEdit = (task) => {
     setFormData({ noidung: task.noidung || '', tinhtrang: task.tinhtrang || 'Chưa xử lý', manv: task.manv || '' });
     setIsEdit(true);
     setEditId(task.id);
     setIsFormOpen(true);
  };

  const handleSaveTask = async (e) => {
     e.preventDefault();
     if (!formData.noidung.trim() || !formData.manv) return window.alert("Vui lòng nhập nội dung và gán nhân viên!");

     const localNow = new Date(new Date() - new Date().getTimezoneOffset() * 60000).toISOString();

     if (isEdit) {
        await supabase.from('tbl_ghichu').update({
           noidung: formData.noidung,
           tinhtrang: formData.tinhtrang,
           manv: formData.manv
        }).eq('id', editId);
     } else {
        await supabase.from('tbl_ghichu').insert([{
           time: localNow,
           noidung: formData.noidung,
           tinhtrang: formData.tinhtrang,
           manv: formData.manv
        }]);
     }
     setIsFormOpen(false);
     fetchTasks();
  };

  const handleDelete = async (id) => {
     if (!window.confirm("Thao tác này sẽ xoá vĩnh viễn ghi chú. Bạn chắc chắn chứ?")) return;
     await supabase.from('tbl_ghichu').delete().eq('id', id);
     fetchTasks();
  };

  const toggleStatus = async (task) => {
     let nextStatus = 'Đang xử lý';
     if (task.tinhtrang === 'Đang xử lý') nextStatus = 'Hoàn thành';
     else if (task.tinhtrang === 'Hoàn thành') nextStatus = 'Chưa xử lý';

     await supabase.from('tbl_ghichu').update({ tinhtrang: nextStatus }).eq('id', task.id);
     fetchTasks();
  };

  const getEmpName = (manv) => {
     const emp = employees.find(e => e.manv === manv);
     return emp ? emp.tennv : 'Chưa phân công / Vô danh';
  };

  const getBadgeColor = (status) => {
     const s = status?.toLowerCase() || '';
     if (s.includes('chưa') || s.includes('mới')) return 'bg-pending';
     if (s.includes('đang')) return 'bg-progress';
     if (s.includes('hoàn') || s.includes('xong')) return 'bg-done';
     if (s.includes('ghim') || s.includes('trọng')) return 'bg-important';
     return 'bg-default';
  };

  const formatDate = (isoStr) => {
     if (!isoStr) return '';
     const d = new Date(isoStr);
     return d.toLocaleString('vi-VN', { hour: '2-digit', minute:'2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const filteredTasks = tasks.filter(t => {
     const matchSearch = !searchTerm || (t.noidung && t.noidung.toLowerCase().includes(searchTerm.toLowerCase()));
     const matchNV = !filterNV || t.manv === filterNV;
     
     // strict mapping for status filter specifically to match distinct states
     let matchStatus = true;
     if (filterStatus === '1') matchStatus = getBadgeColor(t.tinhtrang) === 'bg-pending';
     if (filterStatus === '2') matchStatus = getBadgeColor(t.tinhtrang) === 'bg-progress';
     if (filterStatus === '3') matchStatus = getBadgeColor(t.tinhtrang) === 'bg-done';
     
     return matchSearch && matchNV && matchStatus;
  });

  return (
    <div className="task-manager animate-fade-in">
       {/* Toolbar */}
       {/* Stats Filter Cards */}
       <div className="stats-container" style={{marginBottom: '0.5rem'}}>
          <div className={`stat-card total ${filterStatus === '' ? 'active-filter' : ''}`} onClick={() => setFilterStatus('')} style={{cursor: 'pointer'}}>
            <div className="stat-icon"><Briefcase size={22} /></div>
            <div className="stat-info">
              <span className="stat-label">Tổng Công Việc</span>
              <span className="stat-value">{tasks.length}</span>
            </div>
          </div>
          <div className={`stat-card warning ${filterStatus === '1' ? 'active-filter' : ''}`} onClick={() => setFilterStatus('1')} style={{cursor: 'pointer'}}>
            <div className="stat-icon"><Clock size={22} color="#f59e0b" /></div>
            <div className="stat-info">
              <span className="stat-label">Chờ Xử Lý / Chưa Làm</span>
              <span className="stat-value">{tasks.filter(t => getBadgeColor(t.tinhtrang) === 'bg-pending').length}</span>
            </div>
          </div>
          <div className={`stat-card active ${filterStatus === '2' ? 'active-filter' : ''}`} onClick={() => setFilterStatus('2')} style={{cursor: 'pointer'}}>
            <div className="stat-icon"><RefreshCw size={22} color="#2563eb" /></div>
            <div className="stat-info">
              <span className="stat-label">Đang Triển Khai</span>
              <span className="stat-value">{tasks.filter(t => getBadgeColor(t.tinhtrang) === 'bg-progress').length}</span>
            </div>
          </div>
          <div className={`stat-card success ${filterStatus === '3' ? 'active-filter' : ''}`} onClick={() => setFilterStatus('3')} style={{cursor: 'pointer'}}>
            <div className="stat-icon"><CheckCircle size={22} color="#16a34a" /></div>
            <div className="stat-info">
              <span className="stat-label">Đã Hoàn Tất Xong</span>
              <span className="stat-value">{tasks.filter(t => getBadgeColor(t.tinhtrang) === 'bg-done').length}</span>
            </div>
          </div>
       </div>

       {/* Toolbar */}
       <div className="tm-toolbar">
         <div className="tm-actions-top" style={{width: '100%', justifyContent: 'space-between'}}>
            <div className="tm-filters">
               <Filter size={16} className="text-muted" />
               <select value={filterNV} onChange={e => setFilterNV(e.target.value)}>
                 <option value="">Lọc Giao Việc: Mọi Nhân Sự</option>
                 {employees.map(e => <option key={e.manv} value={e.manv}>Nhân sự: {e.tennv} ({e.manv})</option>)}
               </select>
            </div>
            
            <div className="tm-search" style={{flex: 1, margin: '0 1rem'}}>
               <Search size={16} className="text-muted" />
               <input type="text" placeholder="Tra cứu nội dung ghi chú, tìm theo người gửi..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <button className="tm-btn-add" onClick={handleOpenAdd}>
               <Plus size={18}/> Giao Việc Khẩn
            </button>
         </div>
       </div>

       {/* Matrix Grid */}
       <div className="tm-grid-container">
          {loading ? (
             <div className="p-4 text-center text-muted">Đang quét sổ tay thư ký hệ thống...</div>
          ) : filteredTasks.length === 0 ? (
             <div className="p-4 text-center text-muted" style={{fontStyle: 'italic', marginTop: '2rem'}}>Không có công việc nào tồn đọng hoặc phù hợp với bộ lọc hiện tại!</div>
          ) : (
             <div className="tm-grid">
                {filteredTasks.map(t => (
                   <div key={t.id} className="tm-card">
                      <div className="tm-card-header">
                         <span className={`tm-badge ${getBadgeColor(t.tinhtrang)} pointer`} onClick={() => toggleStatus(t)} title="Click trực tiếp vào Nhãn để lướt trạng thái Siêu nhanh">
                            {t.tinhtrang || 'Không rõ'}
                         </span>
                         <span className="tm-card-time"><Clock size={12}/> {formatDate(t.time) || 'Unknown'}</span>
                      </div>
                      <div className="tm-card-content">
                         {t.noidung}
                      </div>
                      <div className="tm-card-footer">
                         <div className="tm-user">
                            <div className="tm-avatar">{(getEmpName(t.manv) || 'A')[0].toUpperCase()}</div>
                            <span style={{display: 'flex', flexDirection: 'column'}}>
                               {getEmpName(t.manv)}
                               <small className="text-muted" style={{fontSize: '0.75rem', fontWeight: 500}}>{t.manv || 'Mã n/a'}</small>
                            </span>
                         </div>
                         <div className="tm-actions">
                            <button className="tm-btn-icon" title="Chỉnh sửa nội dung & giao việc" onClick={() => handleOpenEdit(t)}><Edit2 size={16}/></button>
                            <button className="tm-btn-icon tm-btn-del" title="Xóa ghi chú này" onClick={() => handleDelete(t.id)}><Trash2 size={16}/></button>
                         </div>
                      </div>
                   </div>
                ))}
             </div>
          )}
       </div>

       {/* Form Modal – rendered via Portal to escape stacking context */}
       {isFormOpen && ReactDOM.createPortal(
          <div className="tm-modal-overlay">
             <div className="tm-modal animate-slide-up">
                <div className="tm-modal-header">
                   <h3>{isEdit ? 'Chỉnh Sửa Form Giao Việc' : 'Soạn Ghi Chú - Phân Việc Mới'}</h3>
                   <button className="tm-close" onClick={() => setIsFormOpen(false)}><X size={20}/></button>
                </div>
                <form onSubmit={handleSaveTask} className="tm-modal-body">
                   
                   <div className="tm-form-group">
                      <label>Điều động việc tới Nhân viên (Lọc đích danh)</label>
                      <select value={formData.manv} onChange={e => setFormData({...formData, manv: e.target.value})} required style={{background: '#f8fafc', fontWeight: 700}}>
                         <option value="">-- Click Chọn Nhân Viên Nhận Nhiệm Vụ --</option>
                         {employees.map(e => <option key={e.manv} value={e.manv}>{e.tennv} (ID: {e.manv})</option>)}
                      </select>
                   </div>

                   <div className="tm-form-group">
                      <label>Nội dung chỉ đạo / Ghi nhớ cá nhân</label>
                      <textarea rows="3" placeholder="Mỗi đầu mục enter 1 dòng rõ ràng..." value={formData.noidung} onChange={e => setFormData({...formData, noidung: e.target.value})} required autoFocus></textarea>
                   </div>
                   <div className="tm-form-group">
                      <label>Định hướng Tình Trạng Khởi Điểm</label>
                      <select value={formData.tinhtrang} onChange={e => setFormData({...formData, tinhtrang: e.target.value})}>
                         <option value="Chưa xử lý">Chỉ định Mới (Chưa xử lý)</option>
                         <option value="Đang xử lý">Đang thi hành (Bấm theo dõi)</option>
                         <option value="Hoàn thành">Đã Hoàn tất 100%</option>
                         <option value="Ghim quan trọng">GẮN MÁC QUAN TRỌNG !</option>
                      </select>
                   </div>
                   <div className="tm-form-actions">
                      <button type="submit" className="tm-btn-submit">{isEdit ? 'Xác Nhận Update' : 'Push Việc Lên Bảng'}</button>
                   </div>
                </form>
             </div>
          </div>,
          document.body
       )}
    </div>
  )
}
