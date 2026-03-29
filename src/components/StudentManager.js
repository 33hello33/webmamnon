import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase, generateId } from '../supabase';
import * as XLSX from 'xlsx';
import {
  Users, UserPlus, Edit, Trash2, FileSpreadsheet, Download, BookOpen, Search, RefreshCw, X, CheckCircle2, AlertCircle, ArrowRightLeft
} from 'lucide-react';
import ClassManager from './ClassManager';
import AttendanceManager from './AttendanceManager';
import LeaveManager from './LeaveManager';
import AttendanceToday from './AttendanceToday';
import './StudentManager.css';
import { useConfig } from '../ConfigContext';

const INITIAL_FORM = {
  mahv: '', tenhv: '', sdtba: '', sdtme: '', ghichu: '',
  trangthai: 'Đang Học', imgpath: '', ngaynhaphoc: new Date().toISOString().split('T')[0], ngaynghihoc: '',
  diachi: '', tenme: '', hotenba: '', malop: '',
  ngaysinh: new Date().toISOString().split('T')[0],
  gioitinh: 'Nam', cccd: '', tinhtrangsk: '',
  nghenghiepba: '', nghenghiepme: '',
  ngaysinhba: new Date().toISOString().split('T')[0],
  ngaysinhme: new Date().toISOString().split('T')[0]
};

export default function StudentManager({ activeSubTab }) {
  const { config } = useConfig();
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('');

  // Modals & Selections
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [isEditMode, setIsEditMode] = useState(false);


  // Delete Modal State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteReason, setDeleteReason] = useState('');

  // Messages
  const [message, setMessage] = useState({ type: '', text: '' });
  const fileInputRef = useRef(null);

  // Transfer Class Modal State
  const [isTransferClassOpen, setIsTransferClassOpen] = useState(false);
  const [transferClassId, setTransferClassId] = useState('');


  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const { data: stData, error: stErr } = await supabase.from('tbl_hv').select('*').order('mahv', { ascending: true });
      if (stErr) throw stErr;

      // Attach classes info to student object using malop field
      setStudents(stData || []);

      const { data: clsData, error: clsErr } = await supabase.from('tbl_lop').select('malop, tenlop').neq('daxoa', 'Đã Xóa');
      if (clsErr) throw clsErr;
      setClasses(clsData || []);

      setSelectedStudentId(null);
    } catch (err) {
      console.error(err);
      showMessage('error', 'Lỗi tải dữ liệu học viên');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'students' || activeSubTab === 'classes' || activeSubTab === 'attendance_today') {
      if (students.length === 0) fetchStudents(); // Only fetch if not already loaded
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubTab]);

  // Form Handlers
  const handleOpenAdd = async () => {
    const newMaHV = await generateId('tbl_hv', 'mahv', 'HV', 4);
    setFormData({ ...INITIAL_FORM, mahv: newMaHV });
    setIsEditMode(false);
    setIsFormOpen(true);
  };

  const handleOpenEdit = async () => {
    if (!selectedStudentId) return showMessage('error', 'Vui lòng chọn một học viên để sửa');
    const student = students.find(s => s.mahv === selectedStudentId);
    if (student) {
      setFormData({ ...INITIAL_FORM, ...student });
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
    if (!formData.mahv || !formData.tenhv) {
      return showMessage('error', 'Mã HV và Tên HV là bắt buộc');
    }

    try {
      const dataToSave = { ...formData };
      
      // Đảm bảo các giá trị null thay vì chuỗi trống cho các trường date nếu cần
      if (!dataToSave.ngaysinh) dataToSave.ngaysinh = null;
      if (!dataToSave.ngaynhaphoc) dataToSave.ngaynhaphoc = null;
      if (!dataToSave.ngaysinhba) dataToSave.ngaysinhba = null;
      if (!dataToSave.ngaysinhme) dataToSave.ngaysinhme = null;

      if (isEditMode) {
        const { error } = await supabase.from('tbl_hv').update(dataToSave).eq('mahv', dataToSave.mahv);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tbl_hv').insert([dataToSave]);
        if (error) throw error;
      }
      
      showMessage('success', isEditMode ? 'Cập nhật thành công' : 'Thêm học viên thành công');
      setIsFormOpen(false);
      fetchStudents();
    } catch (err) {
      console.error(err);
      if (err.code === '23505') return showMessage('error', 'Mã học viên đã tồn tại');
      showMessage('error', 'Lỗi lưu thông tin');
    }
  };

  // Delete Action
  const handleDeleteTrigger = () => {
    if (!selectedStudentId) return showMessage('error', 'Vui lòng chọn học viên để xóa');
    setDeletePassword('');
    setDeleteReason('');
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    try {
      if (!deleteReason) return showMessage('error', 'Vui lòng chọn lý do xóa học viên!');
      
      // Validate password against current session
      const sessionStr = localStorage.getItem('auth_session');
      if (!sessionStr) return showMessage('error', 'Phiên làm việc hết hạn');

      const session = JSON.parse(sessionStr);
      if (session.user.password !== deletePassword) {
        return showMessage('error', 'Mật khẩu xác nhận không đúng!');
      }

      const student = students.find(s => s.mahv === selectedStudentId);
      const currentGhichu = student?.ghichu || '';
      const newGhichu = currentGhichu ? `${currentGhichu} | Lý do nghỉ: ${deleteReason}` : `Lý do nghỉ: ${deleteReason}`;

      const today = new Date().toISOString().split('T')[0];
      const { error } = await supabase.from('tbl_hv').update({ 
        trangthai: 'Đã Nghỉ', 
        ngaynghihoc: today,
        ghichu: newGhichu
      }).eq('mahv', selectedStudentId);
      if (error) throw error;

      showMessage('success', 'Đã chuyển trạng thái học viên thành Đã Nghỉ và cập nhật lý do');
      setIsDeleteOpen(false);
      fetchStudents();
    } catch (err) {
      console.error(err);
      showMessage('error', 'Lỗi khi xóa học viên');
    }
  };

  // Restore Action (From Đã Nghỉ to Đang Học)
  const handleRestore = async () => {
    if (!selectedStudentId) return showMessage('error', 'Vui lòng chọn học viên để khôi phục');
    const student = students.find(s => s.mahv === selectedStudentId);
    if (!student) return;
    if (student.trangthai !== 'Đã Nghỉ') {
       return showMessage('error', 'Chỉ có thể khôi phục học viên có trạng thái Đã Nghỉ');
    }

    if (!window.confirm(`Khôi phục học viên ${student.tenhv} về trạng thái Đang Học?`)) return;

    try {
      const { error } = await supabase.from('tbl_hv').update({ 
        trangthai: 'Đang Học', 
        ngaynghihoc: null 
      }).eq('mahv', selectedStudentId);
      if (error) throw error;

      showMessage('success', 'Đã khôi phục học viên thành công');
      fetchStudents();
    } catch (err) {
      console.error(err);
      showMessage('error', 'Lỗi khi khôi phục học viên');
    }
  };

  // Reserve/Unreserve (Bảo Lưu) Action
  const handleReserve = async () => {
    if (!selectedStudentId) return showMessage('error', 'Vui lòng chọn học viên để thao tác');

    const student = students.find(s => s.mahv === selectedStudentId);
    if (!student) return;

    const isHuyBaoLuu = student.trangthai === 'Bảo Lưu';
    const newStatus = isHuyBaoLuu ? 'Đang Học' : 'Bảo Lưu';
    const confirmMessage = isHuyBaoLuu
      ? `Bạn có chắc chắn muốn HỦY bảo lưu và chuyển học viên ${student.tenhv} sang Đang Học?`
      : `Bạn có chắc chắn muốn chuyển học viên ${student.tenhv} sang trạng thái BẢO LƯU?`;

    if (!window.confirm(confirmMessage)) return;

    try {
      const { error } = await supabase.from('tbl_hv').update({ trangthai: newStatus }).eq('mahv', selectedStudentId);
      if (error) throw error;

      showMessage('success', isHuyBaoLuu ? 'Đã hủy bảo lưu, học viên hiển thị Đang Học' : 'Đã cập nhật trạng thái Bảo Lưu');
      fetchStudents();
    } catch (err) {
      console.error(err);
      showMessage('error', 'Lỗi cập nhật trạng thái');
    }
  };

  // Transfer Class Action
  const handleTransferClassTrigger = () => {
    if (!selectedStudentId) return showMessage('error', 'Vui lòng chọn học viên cần chuyển lớp');
    setTransferClassId('');
    setIsTransferClassOpen(true);
  };

  const confirmTransferClass = async () => {
    if (!transferClassId) return showMessage('error', 'Vui lòng chọn lớp mới cần chuyển đến!');

    try {
      // 1. Update class directly in tbl_hv
      const { error } = await supabase.from('tbl_hv').update({ malop: transferClassId }).eq('mahv', selectedStudentId);
      if (error) throw error;

      showMessage('success', 'Chuyển lớp thành công!');
      setIsTransferClassOpen(false);
      fetchStudents();
    } catch (err) {
      console.error(err);
      showMessage('error', 'Lỗi khi chuyển lớp: ' + (err.message || ''));
    }
  };

  // Excel Actions
  const handleExportExcel = () => {
    if (students.length === 0) return showMessage('error', 'Không có dữ liệu để xuất');
    
    // Chuẩn bị dữ liệu đẹp để xuất Excel
    const exportData = students.map(s => {
      return {
        'Mã HV': s.mahv,
        'Tên Học Viên': s.tenhv,
        'Ngày Sinh': s.ngaysinh,
        'Giới Tính': s.gioitinh,
        'Mã Lớp': s.malop,
        'Tên Lớp': classes.find(c => c.malop === s.malop)?.tenlop || s.malop || '',
        'Trạng Thái': s.trangthai,
        'Họ Tên Ba': s.hotenba,
        'SĐT Ba': s.sdtba,
        'Ngày Sinh Ba': s.ngaysinhba,
        'Nghề Nghiệp Ba': s.nghenghiepba,
        'Họ Tên Mẹ': s.tenme,
        'SĐT Mẹ': s.sdtme,
        'Ngày Sinh Mẹ': s.ngaysinhme,
        'Nghề Nghiệp Mẹ': s.nghenghiepme,
        'CCCD': s.cccd,
        'Tình Trạng SK': s.tinhtrangsk,
        'Ngày Nhập Học': s.ngaynhaphoc,
        'Ngày Nghỉ Học': s.ngaynghihoc,
        'Địa Chỉ': s.diachi,
        'Ghi Chú': s.ghichu
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Học Viên");
    XLSX.writeFile(wb, "danh_sach_hoc_vien.xlsx");
  };

  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      setLoading(true);
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data.length > 0) {
          const mapping = {
            'Mã HV': 'mahv',
            'Tên Học Viên': 'tenhv',
            'Ngày Sinh': 'ngaysinh',
            'Giới Tính': 'gioitinh',
            'Mã Lớp': 'malop',
            'Trạng Thái': 'trangthai',
            'Họ Tên Ba': 'hotenba',
            'SĐT Ba': 'sdtba',
            'Ngày Sinh Ba': 'ngaysinhba',
            'Nghề Nghiệp Ba': 'nghenghiepba',
            'Họ Tên Mẹ': 'tenme',
            'SĐT Mẹ': 'sdtme',
            'Ngày Sinh Mẹ': 'ngaysinhme',
            'Nghề Nghiệp Mẹ': 'nghenghiepme',
            'CCCD': 'cccd',
            'Tình Trạng SK': 'tinhtrangsk',
            'Ngày Nhập Học': 'ngaynhaphoc',
            'Ngày Nghỉ Học': 'ngaynghihoc',
            'Địa Chỉ': 'diachi',
            'Ghi Chú': 'ghichu'
          };

          let successCount = 0;
          for (const item of data) {
            // 1. Map tbl_hv data
            const studentData = {};
            Object.keys(mapping).forEach(key => {
              const dbField = mapping[key];
              let val = item[key];
              
              if (val !== undefined) {
                 if (['ngaynhaphoc', 'ngaynghihoc', 'ngaysinh', 'ngaysinhba', 'ngaysinhme'].includes(dbField)) {
                    // Safe Date Formatting
                    if (val) {
                       let d;
                       if (typeof val === 'number') {
                          // Excel serial date
                          d = new Date((val - 25569) * 86400 * 1000);
                       } else {
                          d = new Date(val);
                       }
                       if (!isNaN(d.getTime())) {
                          val = d.toISOString().split('T')[0];
                       } else {
                          val = null;
                       }
                    } else {
                       val = null;
                    }
                 }
                 studentData[dbField] = val;
              }
            });
            
            if (!studentData.mahv) studentData.mahv = await generateId('tbl_hv', 'mahv', 'HV', 4);
            if (!studentData.tenhv) continue;

            // Skip if mahv already exists
            if (students.some(s => s.mahv === studentData.mahv)) {
               console.log(`Bỏ qua học viên trùng mã: ${studentData.mahv}`);
               continue;
            }

            // 2. Handle Class Mapping (Directly to tbl_hv)
            const maLopStr = item['Mã Lớp'] || '';
            const listMaLop = String(maLopStr).split(',').map(m => m.trim()).filter(Boolean);
            if (listMaLop.length > 0) {
               studentData.malop = listMaLop[0];
            }

            const { error: stUpsertError } = await supabase.from('tbl_hv').upsert(studentData);
            if (stUpsertError) {
               console.error("Lỗi lưu HV:", stUpsertError);
               continue;
            }


            successCount++;
          }

          showMessage('success', `Đã nhập Excel thành công ${successCount} học viên`);
          fetchStudents();
        }
      } catch (err) {
        console.error(err);
        showMessage('error', 'Lỗi xử lý file Excel: ' + (err.message || 'Template không đúng'));
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const renderStudentsTab = () => {
    const dangHoc = students.filter(s => s.trangthai === 'Đang Học').length;
    const baoluu = students.filter(s => s.trangthai === 'Bảo Lưu').length;
    const daNghi = students.filter(s => s.trangthai === 'Đã Nghỉ').length;

    // Auto filter by search
    const filteredStudents = students.filter(s => {
      const searchStr = searchTerm.toLowerCase();
      const matchSearch = (s.tenhv && s.tenhv.toLowerCase().includes(searchStr)) ||
        (s.mahv && s.mahv.toLowerCase().includes(searchStr)) ||
        (s.sdtba && s.sdtba.includes(searchTerm)) ||
        (s.sdtme && s.sdtme.includes(searchTerm));
      const matchClass = classFilter ? (s.malop === classFilter) : true;
      return matchSearch && matchClass;
    });

    // Sort: 'Đã Nghỉ' at the bottom
    const sortedStudents = [...filteredStudents].sort((a, b) => {
      if (a.trangthai === 'Đã Nghỉ' && b.trangthai !== 'Đã Nghỉ') return 1;
      if (a.trangthai !== 'Đã Nghỉ' && b.trangthai === 'Đã Nghỉ') return -1;
      // Secondary sort logic (by mahv)
      return (a.mahv || '').localeCompare(b.mahv || '');
    });

    return (
      <div className="students-tab-content animate-fade-in">
        {/* Statistics */}
        <div className="stats-container">
          <div className="stat-card total">
            <div className="stat-icon"><Users size={24} /></div>
            <div className="stat-info">
              <span className="stat-label">Tổng Học Viên</span>
              <span className="stat-value">{students.length}</span>
            </div>
          </div>
          <div className="stat-card active">
            <div className="stat-icon"><BookOpen size={24} /></div>
            <div className="stat-info">
              <span className="stat-label">Đang Học</span>
              <span className="stat-value">{dangHoc}</span>
            </div>
          </div>
          <div className="stat-card warning">
            <div className="stat-icon"><RefreshCw size={24} color="#f59e0b" /></div>
            <div className="stat-info">
              <span className="stat-label">Bảo Lưu</span>
              <span className="stat-value">{baoluu}</span>
            </div>
          </div>
          <div className="stat-card inactive">
            <div className="stat-icon"><Users size={24} color="#ef4444" /></div>
            <div className="stat-info">
              <span className="stat-label">Đã Nghỉ</span>
              <span className="stat-value">{daNghi}</span>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          <div className="toolbar-mobile">
            <div className="search-stack">
              <div className="search-item">
                <Search size={16} className="item-icon" />
                <input
                  type="text"
                  placeholder="Lọc tên, SĐT..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="search-item">
                <BookOpen size={16} className="item-icon" />
                <select
                  value={classFilter}
                  onChange={e => setClassFilter(e.target.value)}
                  className="mobile-select"
                >
                  <option value="">Lớp: Tất cả</option>
                  {classes.map(c => <option key={c.malop} value={c.malop}>{c.tenlop}</option>)}
                </select>
              </div>
            </div>

            <div className="action-grid-v2">
              <button className="grid-btn primary" onClick={handleOpenAdd}><UserPlus size={16} /><small>Thêm</small></button>
              <button className="grid-btn info" onClick={handleOpenEdit}><Edit size={16} /><small>Sửa</small></button>
              <button className="grid-btn danger" onClick={handleDeleteTrigger}><Trash2 size={16} /><small>Xóa</small></button>
              <button className="grid-btn success" onClick={handleRestore} style={{ background: '#ecfdf5', color: '#059669', borderColor: '#d1fae5' }}><RefreshCw size={16} /><small>Khôi phục</small></button>
              <button className="grid-btn warning" onClick={handleReserve}><RefreshCw size={16} /><small>Bảo lưu</small></button>
              <button className="grid-btn transfer" onClick={handleTransferClassTrigger}><ArrowRightLeft size={16} /><small>Chuyển</small></button>
              <button className="grid-btn success" onClick={() => fileInputRef.current?.click()}><FileSpreadsheet size={16} /><small>Nhập</small></button>
              <button className="grid-btn success" onClick={handleExportExcel}><Download size={16} /><small>Xuất</small></button>
              
              <input type="file" accept=".xlsx, .xls" style={{ display: 'none' }} ref={fileInputRef} onChange={handleImportExcel} />
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="table-container">
          {loading ? (
            <div className="loading-state">
              <RefreshCw className="spinner" size={24} />
              <span>Đang tải dữ liệu học viên...</span>
            </div>
          ) : (
            <>
              <div className="table-scroll-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Mã HV</th>
                      <th>Tên Học Viên</th>
                      <th>Sinh nhật HV</th>
                      <th>G.Tính</th>
                      <th>Lớp</th>
                      <th>Trạng Thái</th>
                      <th>Họ tên Ba</th>
                      <th>SĐT Ba</th>
                      <th>Sinh nhật Ba</th>
                      <th>Nghề Ba</th>
                      <th>Họ tên Mẹ</th>
                      <th>SĐT Mẹ</th>
                      <th>Sinh nhật Mẹ</th>
                      <th>Nghề Mẹ</th>
                      <th>CCCD</th>
                      <th>Nhập Học</th>
                      <th>Tình trạng SK</th>
                      <th>Địa Chỉ</th>
                      <th>Ghi Chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStudents.length > 0 ? (
                      sortedStudents.map((s) => (
                        <tr
                          key={s.mahv}
                          className={`
                            ${selectedStudentId === s.mahv ? 'selected-row' : ''}
                            ${s.trangthai === 'Đã Nghỉ' ? 'row-inactive' : ''}
                          `}
                          onClick={() => setSelectedStudentId(s.mahv)}
                        >
                          <td className="font-medium">{s.mahv || '-'}</td>
                          <td className="font-semibold text-primary">{s.tenhv || '-'}</td>
                          <td>{s.ngaysinh ? new Date(s.ngaysinh).toLocaleDateString('vi-VN') : '-'}</td>
                          <td>{s.gioitinh || '-'}</td>
                          <td>{classes.find(c => c.malop === s.malop)?.tenlop || s.malop || '-'}</td>
                          <td>
                            <span className={`status-badge ${s.trangthai === 'Đang Học' ? 'active' :
                              (s.trangthai === 'Bảo Lưu' ? 'warning' : 'inactive')
                              }`}>
                              {s.trangthai || 'Chưa phân loại'}
                            </span>
                          </td>
                          <td>{s.hotenba || '-'}</td>
                          <td>{s.sdtba || '-'}</td>
                          <td>{s.ngaysinhba ? new Date(s.ngaysinhba).toLocaleDateString('vi-VN') : '-'}</td>
                          <td>{s.nghenghiepba || '-'}</td>
                          <td>{s.tenme || '-'}</td>
                          <td>{s.sdtme || '-'}</td>
                          <td>{s.ngaysinhme ? new Date(s.ngaysinhme).toLocaleDateString('vi-VN') : '-'}</td>
                          <td>{s.nghenghiepme || '-'}</td>
                          <td>{s.cccd || '-'}</td>
                          <td>{s.ngaynhaphoc ? new Date(s.ngaynhaphoc).toLocaleDateString('vi-VN') : '-'}</td>
                          <td>{s.tinhtrangsk || '-'}</td>
                          <td className="truncate-cell" title={s.diachi}>{s.diachi || '-'}</td>
                          <td className="truncate-cell" title={s.ghichu}>{s.ghichu || '-'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="21" className="empty-state">
                          <div className="empty-state-content">
                            <Users size={40} />
                            <p>Không tìm thấy học viên nào.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* ✅ CARD LIST (mobile) */}
              <div className="student-card-list">
                {sortedStudents.length > 0 ? (
                  sortedStudents.map((s, idx) => (
                    <div
                      key={s.mahv}
                      className={`student-card status-${s.trangthai?.replace(/\s+/g, '-').toLowerCase()} ${selectedStudentId === s.mahv ? 'selected' : ''}`}
                      onClick={() => setSelectedStudentId(s.mahv)}
                    >
                      <div className="card-status-bar"></div>
                      <div className="student-card-header">
                        <div>
                          <div className="student-name">{s.tenhv}</div>
                          <div className="student-id">#{s.mahv}</div>
                        </div>
                        <span className={`status-badge ${s.trangthai === 'Đang Học' ? 'active' :
                          (s.trangthai === 'Bảo Lưu' ? 'warning' : 'inactive')
                          }`}>
                          {s.trangthai || 'Chưa cập nhật'}
                        </span>
                      </div>

                      <div className="student-card-body">
                        <div className="simple-info-grid">
                          <div className="info-pair">
                            <span className="label">Lớp:</span>
                            <span className="value">
                               {classes.find(c => c.malop === s.malop)?.tenlop || s.malop || '-'}
                            </span>
                          </div>
                          <div className="info-pair">
                            <span className="label">SĐT Ba:</span>
                            <span className="value highlight">{s.sdtba || '-'}</span>
                          </div>
                          <div className="info-pair">
                            <span className="label">Mẹ:</span>
                            <span className="value">{s.tenme || '-'}</span>
                          </div>
                          <div className="info-pair">
                            <span className="label">SĐT Mẹ:</span>
                            <span className="value">{s.sdtme || '-'}</span>
                          </div>
                          <div className="info-pair wide">
                            <span className="label">Ngày sinh:</span>
                            <span className="value">{s.ngaysinh || '-'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">Không tìm thấy học viên nào.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="student-manager">
      {message.text && (
        <div className={`message-alert ${message.type}`}>
          {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{message.text}</span>
        </div>
      )}
      <div className="subtab-content">
        {activeSubTab === 'students' && renderStudentsTab()}
        {activeSubTab === 'classes' && <ClassManager students={students} showMessage={showMessage} fetchStudents={fetchStudents} />}
        {activeSubTab === 'attendance_today' && <AttendanceToday students={students} classes={classes} />}
        {activeSubTab === 'attendance' && <AttendanceManager students={students} showMessage={showMessage} />}
        {activeSubTab === 'leave_list' && <LeaveManager students={students} />}
      </div>

      {/* Form Modal */}
      {isFormOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal-content form-modal">
            <div className="modal-header">
              <h3>{isEditMode ? 'Sửa thông tin Học Viên' : 'Thêm Học Viên Mới'}</h3>
              <button className="close-btn" onClick={() => setIsFormOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="modal-body sm-form-grid">
              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                <label>Mã HV (Tự động)</label>
                <input type="text" name="mahv" value={formData.mahv} onChange={handleChange} required disabled={true} />
              </div>
              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                <label>Tên học viên *</label>
                <input type="text" name="tenhv" value={formData.tenhv} onChange={handleChange} required />
              </div>
              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                <label>Ngày sinh học viên</label>
                <input type="date" name="ngaysinh" value={formData.ngaysinh} onChange={handleChange} />
              </div>
              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                 <label>Giới tính</label>
                 <select name="gioitinh" value={formData.gioitinh} onChange={handleChange}>
                   <option value="Nam">Nam</option>
                   <option value="Nữ">Nữ</option>
                 </select>
              </div>
              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                <label>Lớp Học</label>
                 <select
                   name="malop"
                   value={formData.malop || ''}
                   onChange={handleChange}
                   className="form-control"
                 >
                   <option value="">-- Chọn lớp --</option>
                   {classes.map(c => <option key={c.malop} value={c.malop}>{c.tenlop}</option>)}
                 </select>
              </div>
              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                <label>Trạng Thái</label>
                <select name="trangthai" value={formData.trangthai} onChange={handleChange}>
                   <option value="Đang Học">Đang Học</option>
                   <option value="Bảo Lưu">Bảo Lưu</option>
                   <option value="Đã Nghỉ">Đã Nghỉ</option>
                </select>
              </div>

              <div className="form-divider" style={{ gridColumn: '1 / -1', borderTop: '1px solid #e2e8f0', margin: '15px 0', paddingTop: '10px', fontWeight: 700, color: '#3b82f6' }}>THÔNG TIN GIA ĐÌNH</div>

              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                <label>Họ tên Ba</label>
                <input type="text" name="hotenba" value={formData.hotenba} onChange={handleChange} />
              </div>
              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                <label>SĐT Ba</label>
                <input type="text" name="sdtba" value={formData.sdtba} onChange={handleChange} />
              </div>
              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                <label>Ngày sinh Ba</label>
                <input type="date" name="ngaysinhba" value={formData.ngaysinhba} onChange={handleChange} />
              </div>
              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                <label>Nghề nghiệp Ba</label>
                <input type="text" name="nghenghiepba" value={formData.nghenghiepba} onChange={handleChange} />
              </div>

              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                <label>Họ tên Mẹ</label>
                <input type="text" name="tenme" value={formData.tenme} onChange={handleChange} />
              </div>
              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                <label>SĐT Mẹ</label>
                <input type="text" name="sdtme" value={formData.sdtme} onChange={handleChange} />
              </div>
              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                <label>Ngày sinh Mẹ</label>
                <input type="date" name="ngaysinhme" value={formData.ngaysinhme} onChange={handleChange} />
              </div>
              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                <label>Nghề nghiệp Mẹ</label>
                <input type="text" name="nghenghiepme" value={formData.nghenghiepme} onChange={handleChange} />
              </div>

              <div className="form-divider" style={{ gridColumn: '1 / -1', borderTop: '1px solid #e2e8f0', margin: '15px 0', paddingTop: '10px', fontWeight: 700, color: '#3b82f6' }}>THÔNG TIN CHI TIẾT</div>

              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                <label>Ngày Nhập Học</label>
                <input type="date" name="ngaynhaphoc" value={formData.ngaynhaphoc} onChange={handleChange} />
              </div>
              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                <label>CCCD</label>
                <input type="text" name="cccd" value={formData.cccd} onChange={handleChange} />
              </div>
              <div className="sm-form-group" style={{ gridColumn: 'span 2' }}>
                <label>Địa Chỉ</label>
                <input type="text" name="diachi" value={formData.diachi} onChange={handleChange} />
              </div>

              <div className="sm-form-group" style={{ gridColumn: 'span 2' }}>
                <label>Ghi Chú</label>
                <textarea name="ghichu" value={formData.ghichu} onChange={handleChange} rows="2"></textarea>
              </div>
              <div className="sm-form-group" style={{ gridColumn: 'span 2' }}>
                <label>Tình trạng sức khỏe</label>
                <input type="text" name="tinhtrangsk" value={formData.tinhtrangsk} onChange={handleChange} />
              </div>
              <div className="form-actions full-width">
                <button type="button" className="btn btn-outline" onClick={() => setIsFormOpen(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">{isEditMode ? 'Cập Nhật' : 'Thêm Mới'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}


      {/* Transfer Class Modal */}
      {isTransferClassOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal-content sm-modal">
            <div className="modal-header">
              <h3><ArrowRightLeft size={20} /> Chuyển Học Viên Sang Lớp Khác</h3>
              <button className="close-btn" onClick={() => setIsTransferClassOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p>Học viên đang chọn: <strong>{students.find(s => s.mahv === selectedStudentId)?.tenhv || selectedStudentId}</strong></p>
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label>Chọn lớp mới:</label>
                <select
                  value={transferClassId}
                  onChange={(e) => setTransferClassId(e.target.value)}
                  style={{ width: '100%', height: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                >
                  <option value="">-- Click để chọn lớp --</option>
                  {classes.map(c => (
                    <option key={c.malop} value={c.malop}>{c.tenlop} ({c.malop})</option>
                  ))}
                </select>
              </div>
              <div className="form-actions" style={{ marginTop: '1.5rem' }}>
                <button className="btn btn-outline" onClick={() => setIsTransferClassOpen(false)}>Hủy bỏ</button>
                <button className="btn btn-primary" style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }} onClick={confirmTransferClass}>Xác nhận chuyển</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal-content sm-modal delete-student-modal">
            <div className="modal-header delete-header">
              <h3><AlertCircle size={20} /> Xác nhận xóa học viên</h3>
              <button className="close-btn" onClick={() => setIsDeleteOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p className="delete-warning-text" style={{ marginBottom: '1.25rem', fontSize: '1rem', color: '#1e293b' }}>
                Bạn có chắc chắn muốn xóa học viên: <br />
                <strong>{selectedStudentId} - {students.find(s => s.mahv === selectedStudentId)?.tenhv || ''}</strong>
              </p>

              <div className="delete-reason-section" style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '10px', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.75rem', color: '#475569' }}>Chọn lý do nghỉ học:</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem' }}>
                  {[
                    'Lý do cá nhân - gia đình',
                    'Lý do tài chính',
                    'Lý do sức khỏe',
                    'Lý do Chất lượng chưa đảm bảo',
                    'Lý do chuyển trường',
                    'Lý do trẻ không hợp tác'
                  ].map(reason => (
                    <label key={reason} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', padding: '6px 8px', borderRadius: '6px', transition: 'all 0.2s' }} className={deleteReason === reason ? 'reason-selected' : ''}>
                      <input 
                        type="radio" 
                        name="deleteReason" 
                        value={reason} 
                        checked={deleteReason === reason}
                        onChange={(e) => setDeleteReason(e.target.value)}
                        style={{ width: '16px', height: '16px' }}
                      />
                      <span style={{ color: deleteReason === reason ? '#0f172a' : '#64748b', fontWeight: deleteReason === reason ? 600 : 400 }}>{reason}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label style={{ fontWeight: 600, color: '#475569', marginBottom: '8px', display: 'block' }}>Mật khẩu xác nhận của bạn:</label>
                <input
                  type="password"
                  className="password-confirm-input"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Nhập mật khẩu để xóa..."
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div className="form-actions" style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setIsDeleteOpen(false)}>Hủy bỏ</button>
                <button 
                  className="btn btn-danger" 
                  style={{ flex: 1, fontWeight: 700 }} 
                  onClick={confirmDelete}
                  disabled={!deleteReason || !deletePassword}
                >
                  Xác nhận xóa
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      
      {/* Mobile Selection Action Bar */}
      {selectedStudentId && (
        <div className="mobile-action-bar animate-slide-up">
          <button className="action-btn warning" onClick={handleReserve} title="Bảo lưu / Hủy">
            <RefreshCw size={20} />
            <span>Bảo lưu</span>
          </button>
          <button className="action-btn primary-purple" onClick={handleTransferClassTrigger}>
            <ArrowRightLeft size={20} />
            <span>Chuyển lớp</span>
          </button>
          <button className="action-btn danger" onClick={handleDeleteTrigger}>
            <Trash2 size={20} />
            <span>Xóa HV</span>
          </button>
          <button className="action-btn secondary" onClick={() => setSelectedStudentId(null)}>
            <X size={20} />
            <span>Đóng</span>
          </button>
        </div>
      )}
    </div>
  );
}
