import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase, generateId, insertLog } from '../supabase';
import * as XLSX from 'xlsx';
import {
  Users, UserPlus, Edit, Trash2, FileSpreadsheet, Download, BookOpen, Search, RefreshCw, X, CheckCircle2, AlertCircle, ArrowRightLeft, Camera, Heart
} from 'lucide-react';
import ClassManager from './ClassManager';
import AttendanceManager from './AttendanceManager';
import LeaveManager from './LeaveManager';
import AttendanceToday from './AttendanceToday';
import NgoaiKhoaManager from './NgoaiKhoaManager';
import './StudentManager.css';
import { compressImage } from '../utils/imageUtils';
import { toLocalISODate } from '../utils/localDate';
import { useConfig } from '../ConfigContext';

const INITIAL_FORM = {
  mahv: '', tenhv: '', sdtba: '', sdtme: '', ghichu: '',
  trangthai: 'Đang Học', imgpath: '', ngaynhaphoc: toLocalISODate(), ngaynghihoc: '',
  diachi: '', tenme: '', hotenba: '', malop: '',
  ngaysinh: toLocalISODate(),
  gioitinh: 'Nam', cccd: '', tinhtrangsk: '',
  nghenghiepba: '', nghenghiepme: '',
  ngaysinhba: toLocalISODate(),
  ngaysinhme: toLocalISODate(),
  username: '', password: '',
  hinhthucdong: 'Tiền mặt'
};

export default function StudentManager({ activeSubTab, currentUser }) {
  const { config } = useConfig();
  const walletsConfig = React.useMemo(() => (config ? [
    { id: 'vi1', name: config.vi1?.name || '' },
    { id: 'vi2', name: config.vi2?.name || '' },
    { id: 'vi3', name: config.vi3?.name || '' },
    { id: 'vi4', name: config.vi4?.name || '' }
  ].filter(w => w.name && w.name.trim() !== '') : []), [config]);

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

  // Health History Modal State
  const [isHealthOpen, setIsHealthOpen] = useState(false);
  const [healthHistory, setHealthHistory] = useState([]);
  const [healthLoading, setHealthLoading] = useState(false);


  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const appendCacheBuster = (url) => {
    if (!url) return '';
    const cleanUrl = String(url).replace(/([?&])t=\d+(&|$)/, '$1').replace(/[?&]$/, '');
    const separator = cleanUrl.includes('?') ? '&' : '?';
    return `${cleanUrl}${separator}t=${Date.now()}`;
  };

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const { data: stData, error: stErr } = await supabase.from('tbl_hv').select('*').order('mahv', { ascending: true });
      if (stErr) throw stErr;

      // Attach classes info to student object using malop field
      setStudents(stData || []);

      const { data: clsData, error: clsErr } = await supabase.from('tbl_lop').select('malop, tenlop').or('daxoa.neq."Đã Xóa",daxoa.is.null');
      if (clsErr) throw clsErr;
      setClasses(clsData || []);

      setSelectedStudentId(null);
    } catch (err) {
      console.error(err);
      showMessage('error', 'Lỗi tải dữ liệu học sinh');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (students.length === 0) fetchStudents(); // Only fetch if not already loaded
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
    if (!selectedStudentId) return showMessage('error', 'Vui lòng chọn một học sinh để sửa');
    const student = students.find(s => s.mahv === selectedStudentId);
    if (student) {
      setFormData({ ...INITIAL_FORM, ...student });
      setIsEditMode(true);
      setIsFormOpen(true);
    }
  };

  const handleOpenHealth = async () => {
    if (!selectedStudentId) return showMessage('error', 'Vui lòng chọn một học sinh để xem hồ sơ sức khỏe');
    setIsHealthOpen(true);
    setHealthLoading(true);
    try {
      const { data, error } = await supabase
        .from('suckhoedinhky')
        .select('*')
        .eq('mahv', selectedStudentId)
        .order('ngay', { ascending: false });
      if (error) throw error;
      // Nhóm theo Năm-Tháng (YYYY-MM) và chỉ lấy bản ghi gần nhất mỗi tháng
      const latestPerMonth = [];
      const seenMonths = new Set();
      (data || []).forEach(item => {
        if (!item.ngay) return;
        const monthKey = item.ngay.substring(0, 7); // Format: YYYY-MM
        if (!seenMonths.has(monthKey)) {
          seenMonths.add(monthKey);
          latestPerMonth.push(item);
        }
      });
      setHealthHistory(latestPerMonth);
    } catch (err) {
      console.error(err);
      showMessage('error', 'Lỗi tải hồ sơ sức khỏe');
    } finally {
      setHealthLoading(false);
    }
  };

  const generateUsername = (tenhv) => {
    if (!tenhv) return '';
    const words = tenhv.trim().split(/\s+/);
    if (words.length < 2) words.unshift('');
    const last2 = words.slice(-2).join('');
    let base = last2.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();

    if (!base) return '';

    let suggested = base;
    let counter = 1;
    const existingUsernames = students.map(s => s.username).filter(Boolean);
    while (existingUsernames.includes(suggested)) {
      suggested = base + counter;
      counter++;
    }
    return suggested;
  };

  const generatePassword = (ngaysinh) => {
    if (!ngaysinh) return '';
    const parts = ngaysinh.split('-');
    if (parts.length === 3) {
      return parts[2] + parts[1];
    }
    return '';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      if (!isEditMode) {
        if (name === 'tenhv') {
          next.username = generateUsername(value);
        }
        if (name === 'ngaysinh') {
          next.password = generatePassword(value);
        }
      }
      return next;
    });
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) return showMessage('error', 'Chỉ tải lên file hình ảnh');

    const mahv = formData.mahv;
    if (!mahv) return showMessage('error', 'Lỗi: Không tìm thấy Mã HS');

    try {
      setLoading(true);
      const uploadFile = await compressImage(file, 200);
      const fileExt = uploadFile.name.split('.').pop() || file.name.split('.').pop() || 'jpg';
      const avatarKey = `students/${mahv}.${String(fileExt).toLowerCase()}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(avatarKey, uploadFile, {
          upsert: true,
          contentType: uploadFile.type,
          cacheControl: '0'
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(avatarKey);
      const publicUrl = data?.publicUrl || '';

      const nextImgPath = appendCacheBuster(publicUrl);
      setFormData(prev => ({ ...prev, imgpath: nextImgPath }));
      showMessage('success', 'Đã tải lên ảnh đại diện');
    } catch (err) {
      console.error(err);
      showMessage('error', 'Lỗi tải ảnh: ' + err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.mahv || !formData.tenhv) {
      return showMessage('error', 'Mã HS và Tên HS là bắt buộc');
    }

    try {
      const dataToSave = { ...formData };

      // Đảm bảo các giá trị null thay vì chuỗi trống cho các trường date nếu cần
      if (!dataToSave.ngaysinh) dataToSave.ngaysinh = null;
      if (!dataToSave.ngaynhaphoc) dataToSave.ngaynhaphoc = null;
      if (!dataToSave.ngaysinhba) dataToSave.ngaysinhba = null;
      if (!dataToSave.ngaysinhme) dataToSave.ngaysinhme = null;

      // Nếu học sinh đã nghỉ học thì xóa username, password và cập nhật ngày nghỉ học
      if (dataToSave.trangthai === 'Đã Nghỉ') {
        dataToSave.username = null;
        dataToSave.password = null;
        if (!dataToSave.ngaynghihoc) {
          dataToSave.ngaynghihoc = toLocalISODate();
        }
      } else {
        dataToSave.ngaynghihoc = null;
      }

      if (isEditMode) {
        const { error } = await supabase.from('tbl_hv').update(dataToSave).eq('mahv', dataToSave.mahv);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tbl_hv').insert([dataToSave]);
        if (error) throw error;
      }

      showMessage('success', isEditMode ? 'Cập nhật thành công' : 'Thêm học sinh thành công');
      const detailDesc = `[${isEditMode ? 'CẬP NHẬT HS' : 'ĐĂNG KÝ HS'}] Mã: ${dataToSave.mahv} | Tên: ${dataToSave.tenhv} | Lớp: ${classes.find(c => c.malop === dataToSave.malop)?.tenlop || dataToSave.malop || '_'}`;
      insertLog(detailDesc);
      setIsFormOpen(false);
      fetchStudents();
    } catch (err) {
      console.error(err);
      if (err.code === '23505') return showMessage('error', 'Mã học sinh đã tồn tại');
      showMessage('error', 'Lỗi lưu thông tin');
    }
  };

  // Delete Action
  const handleDeleteTrigger = () => {
    if (!selectedStudentId) return showMessage('error', 'Vui lòng chọn học sinh để xóa');
    setDeletePassword('');
    setDeleteReason('');
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    try {
      if (!deleteReason) return showMessage('error', 'Vui lòng chọn lý do xóa học sinh!');

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

      const today = toLocalISODate();
      const { error } = await supabase.from('tbl_hv').update({
        trangthai: 'Đã Nghỉ',
        ngaynghihoc: today,
        ghichu: newGhichu,
        username: null,
        password: null
      }).eq('mahv', selectedStudentId);
      if (error) throw error;

      showMessage('success', 'Đã chuyển trạng thái học sinh thành Đã Nghỉ và cập nhật lý do');
      const detailDesc = `[XÓA/NGHỈ HỌC] Mã: ${selectedStudentId} | Tên: ${student?.tenhv} | Lý do: ${deleteReason}`;
      insertLog(detailDesc);
      setIsDeleteOpen(false);
      fetchStudents();
    } catch (err) {
      console.error(err);
      showMessage('error', 'Lỗi khi xóa học sinh');
    }
  };

  // Restore Action (From Đã Nghỉ to Đang Học)
  const handleRestore = async () => {
    if (!selectedStudentId) return showMessage('error', 'Vui lòng chọn học sinh để khôi phục');
    const student = students.find(s => s.mahv === selectedStudentId);
    if (!student) return;
    if (student.trangthai !== 'Đã Nghỉ') {
      return showMessage('error', 'Chỉ có thể khôi phục học sinh có trạng thái Đã Nghỉ');
    }

    if (!window.confirm(`Khôi phục học sinh ${student.tenhv} về trạng thái Đang Học?`)) return;

    try {
      const { error } = await supabase.from('tbl_hv').update({
        trangthai: 'Đang Học',
        ngaynghihoc: null
      }).eq('mahv', selectedStudentId);
      if (error) throw error;

      showMessage('success', 'Đã khôi phục học sinh thành công');
      insertLog(`[KHÔI PHỤC HS] Mã: ${selectedStudentId} | Tên: ${student.tenhv}`);
      fetchStudents();
    } catch (err) {
      console.error(err);
      showMessage('error', 'Lỗi khi khôi phục học sinh');
    }
  };

  // Transfer Class Action
  const handleTransferClassTrigger = () => {
    if (!selectedStudentId) return showMessage('error', 'Vui lòng chọn học sinh cần chuyển lớp');
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
      const studentName = students.find(s => s.mahv === selectedStudentId)?.tenhv || selectedStudentId;
      const targetClassName = classes.find(c => c.malop === transferClassId)?.tenlop || transferClassId;
      insertLog(`[CHUYỂN LỚP] Mã: ${selectedStudentId} | Tên: ${studentName} | Lớp mới: ${targetClassName}`);
      setIsTransferClassOpen(false);
      fetchStudents();
    } catch (err) {
      console.error(err);
      showMessage('error', 'Lỗi khi chuyển lớp: ' + (err.message || ''));
    }
  };

  // Computed values for filtered/sorted students
  const filteredStudents = students.filter(s => {
    const searchStr = searchTerm.toLowerCase();
    const matchSearch = (s.tenhv && s.tenhv.toLowerCase().includes(searchStr)) ||
      (s.mahv && s.mahv.toLowerCase().includes(searchStr)) ||
      (s.sdtba && s.sdtba.includes(searchTerm)) ||
      (s.sdtme && s.sdtme.includes(searchTerm));
    const matchClass = classFilter ? (s.malop === classFilter) : true;
    return matchSearch && matchClass;
  });

  const sortedStudents = [...filteredStudents].sort((a, b) => {
    if (a.trangthai === 'Đã Nghỉ' && b.trangthai !== 'Đã Nghỉ') return 1;
    if (a.trangthai !== 'Đã Nghỉ' && b.trangthai === 'Đã Nghỉ') return -1;
    return (a.mahv || '').localeCompare(b.mahv || '');
  });

  // Excel Actions
  const handleExportExcel = () => {
    if (sortedStudents.length === 0) return showMessage('error', 'Không có dữ liệu để xuất (theo bộ lọc hiện tại)');

    // Chuẩn bị dữ liệu đẹp để xuất Excel
    const exportData = sortedStudents.map(s => {
      return {
        'Mã HS': s.mahv,
        'Tên Học Sinh': s.tenhv,
        'Ngày Sinh': s.ngaysinh,
        'Giới Tính': s.gioitinh,
        'Mã Lớp': s.malop,
        'Tên Lớp': classes.find(c => c.malop === s.malop)?.tenlop || s.malop || '',
        'Trạng Thái': s.trangthai,
        'Hình thức đóng': s.hinhthucdong || 'Tiền mặt',
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
        'Ghi Chú': s.ghichu,
        'Username': s.username,
        'Password': s.password
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Học Sinh");
    XLSX.writeFile(wb, "danh_sach_hoc_sinh.xlsx");
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
            'Mã HS': 'mahv',
            'Tên Học Sinh': 'tenhv',
            'Ngày Sinh': 'ngaysinh',
            'Giới Tính': 'gioitinh',
            'Mã Lớp': 'malop',
            'Trạng Thái': 'trangthai',
            'Hình thức đóng': 'hinhthucdong',
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
            'Ghi Chú': 'ghichu',
            'Username': 'username',
            'Password': 'password'
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
                      val = toLocalISODate(d);
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
              console.log(`Bỏ qua học sinh trùng mã: ${studentData.mahv}`);
              continue;
            }

            // 2. Handle Class Mapping (Directly to tbl_hv)
            const maLopStr = item['Mã Lớp'] || '';
            const tenLopStr = (item['Tên Lớp'] || item['Lớp'] || '').toString().trim();
            let listMaLop = String(maLopStr).split(',').map(m => m.trim()).filter(Boolean);

            if (listMaLop.length === 0 && tenLopStr) {
              // Try to find class by name (case insensitive)
              let foundCls = classes.find(c => c.tenlop && c.tenlop.toLowerCase() === tenLopStr.toLowerCase());

              if (!foundCls) {
                // Auto-create class if it doesn't exist
                const newMaLop = await generateId('tbl_lop', 'malop', 'Lop', 3);
                const newCls = { malop: newMaLop, tenlop: tenLopStr };

                const { error: clsErr } = await supabase.from('tbl_lop').insert([newCls]);
                if (!clsErr) {
                  // Add to local state & loop helper
                  setClasses(prev => [...prev, newCls]);
                  classes.push(newCls); // Direct push to the array used by the loop to catch subsequent same-class-name students
                  foundCls = newCls;
                } else {
                  console.error("Lỗi tạo lớp tự động:", clsErr);
                }
              }

              if (foundCls) {
                listMaLop = [foundCls.malop];
              }
            }

            if (listMaLop.length > 0) {
              studentData.malop = listMaLop[0];
            }

            // Nếu học sinh đã nghỉ học thì xóa username, password và cập nhật ngày nghỉ học
            if (studentData.trangthai === 'Đã Nghỉ') {
              studentData.username = null;
              studentData.password = null;
              if (!studentData.ngaynghihoc) {
                studentData.ngaynghihoc = toLocalISODate();
              }
            } else {
              studentData.ngaynghihoc = null;
            }

            const { error: stUpsertError } = await supabase.from('tbl_hv').upsert(studentData);
            if (stUpsertError) {
              console.error("Lỗi lưu HS:", stUpsertError);
              continue;
            }


            successCount++;
          }

          showMessage('success', `Đã nhập Excel thành công ${successCount} học sinh`);
          insertLog(`[NHẬP EXCEL HS] Số lượng: ${successCount} học sinh`);
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
    // Calculate stats based on filtered list to be more accurate to user view
    const total = filteredStudents.length;
    const dangHoc = filteredStudents.filter(s => {
      const st = (s.trangthai || '').trim().toLowerCase();
      return st === 'đang học';
    }).length;
    const daNghi = filteredStudents.filter(s => {
      const st = (s.trangthai || '').trim().toLowerCase();
      return st === 'đã nghỉ';
    }).length;

    return (
      <div className="students-tab-content animate-fade-in">
        {/* Statistics */}
        <div className="stats-container">
          <div className="stat-card total">
            <div className="stat-icon"><Users size={24} /></div>
            <div className="stat-info">
              <span className="stat-label">Tổng Học Sinh</span>
              <span className="stat-value">{total}</span>
            </div>
          </div>
          <div className="stat-card active">
            <div className="stat-icon"><BookOpen size={24} /></div>
            <div className="stat-info">
              <span className="stat-label">Đang Học</span>
              <span className="stat-value">{dangHoc}</span>
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
              <button className="grid-btn" onClick={handleOpenHealth} style={{ background: '#fdf2f8', color: '#db2777', borderColor: '#fbcfe8' }}><Heart size={16} /><small>Sức khỏe</small></button>
              <button className="grid-btn danger" onClick={handleDeleteTrigger}><Trash2 size={16} /><small>Xóa</small></button>
              <button className="grid-btn success" onClick={handleRestore} style={{ background: '#ecfdf5', color: '#059669', borderColor: '#d1fae5' }}><RefreshCw size={16} /><small>Khôi phục</small></button>

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
              <span>Đang tải dữ liệu học sinh...</span>
            </div>
          ) : (
            <>
              <div className="table-scroll-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>Ảnh</th>
                      <th>Mã HS</th>
                      <th>Tên Học Sinh</th>
                      <th>Sinh nhật HS</th>
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
                          <td>
                            <img
                              src={s.imgpath || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.tenhv || 'HS')}&background=random&color=fff&size=128`}
                              alt=""
                              style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #e2e8f0' }}
                            />
                          </td>
                          <td className="font-medium">{s.mahv || '-'}</td>
                          <td className="font-semibold text-primary">{s.tenhv || '-'}</td>
                          <td>{s.ngaysinh ? new Date(s.ngaysinh).toLocaleDateString('vi-VN') : '-'}</td>
                          <td>{s.gioitinh || '-'}</td>
                          <td>{classes.find(c => c.malop === s.malop)?.tenlop || s.malop || '-'}</td>
                          <td>
                            <span className={`status-badge ${(() => {
                              const st = (s.trangthai || '').trim().toLowerCase();
                              if (st.includes('đang học')) return 'active';
                              if (st.includes('bảo lưu')) return 'warning';
                              if (st.includes('đã nghỉ')) return 'inactive';
                              return 'default';
                            })()}`}>
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
                            <p>Không tìm thấy học sinh nào.</p>
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
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <img
                            src={s.imgpath || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.tenhv || 'HS')}&background=random&color=fff&size=128`}
                            alt=""
                            style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                          />
                          <div>
                            <div className="student-name">{s.tenhv}</div>
                            <div className="student-id">#{s.mahv}</div>
                          </div>
                        </div>
                        <span className={`status-badge ${(() => {
                          const st = (s.trangthai || '').trim().toLowerCase();
                          if (st.includes('đang học')) return 'active';
                          if (st.includes('bảo lưu')) return 'warning';
                          if (st.includes('đã nghỉ')) return 'inactive';
                          return 'default';
                        })()}`}>
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
                  <div className="empty-state">Không tìm thấy học sinh nào.</div>
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
        {activeSubTab === 'ngoaikhoa_reg' && <NgoaiKhoaManager currentUser={currentUser} />}
      </div>

      {/* Form Modal */}
      {isFormOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal-content form-modal">
            <div className="modal-header">
              <h3>{isEditMode ? 'Sửa thông tin Học Sinh' : 'Thêm Học Sinh Mới'}</h3>
              <button className="close-btn" onClick={() => setIsFormOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="modal-body sm-form-grid">
              {/* Header row with Large Avatar and Basic Info */}
              <div className="sm-form-header-row" style={{
                gridColumn: '1 / -1',
                display: 'flex',
                gap: '2.5rem',
                alignItems: 'center',
                marginBottom: '1.5rem',
                background: '#f8fafc',
                padding: '2rem',
                borderRadius: '24px',
                border: '1px solid #e2e8f0',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
              }}>
                <div className="avatar-upload-container" style={{ position: 'relative', width: '200px', height: '200px', flexShrink: 0 }}>
                  <img
                    src={formData.imgpath || `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.tenhv || 'HS')}&background=random&color=fff&size=256`}
                    alt="Avatar"
                    style={{ width: '200px', height: '200px', borderRadius: '32px', objectFit: 'cover', border: '6px solid white', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}
                  />
                  <label htmlFor="avatar-input" style={{
                    position: 'absolute',
                    bottom: '-12px',
                    right: '-12px',
                    background: '#3b82f6',
                    color: 'white',
                    padding: '14px',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.5)',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                    onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                    onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <Camera size={26} />
                    <input ref={fileInputRef} id="avatar-input" type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
                  </label>
                </div>

                <div className="header-info-fields" style={{
                  flex: 1,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1.25rem',
                  alignContent: 'center'
                }}>
                  <div className="sm-form-group">
                    <label style={{ fontWeight: 800, color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mã Học Sinh</label>
                    <input type="text" name="mahv" value={formData.mahv} disabled={true} style={{ background: '#f1f5f9', fontWeight: 900, fontSize: '1.1rem', color: '#334155', border: '1px solid #e2e8f0' }} />
                  </div>
                  <div className="sm-form-group">
                    <label style={{ fontWeight: 800, color: '#3b82f6', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tên học sinh *</label>
                    <input type="text" name="tenhv" value={formData.tenhv} onChange={handleChange} required style={{ fontSize: '1.2rem', fontWeight: 800, borderColor: '#3b82f6', boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)' }} />
                  </div>
                  <div className="sm-form-group">
                    <label style={{ fontWeight: 800, color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ngày sinh</label>
                    <input type="date" name="ngaysinh" value={formData.ngaysinh} onChange={handleChange} style={{ fontWeight: 600 }} />
                  </div>
                  <div className="sm-form-group">
                    <label style={{ fontWeight: 800, color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Giới tính</label>
                    <select name="gioitinh" value={formData.gioitinh} onChange={handleChange} style={{ fontWeight: 600 }}>
                      <option value="Nam">Nam</option>
                      <option value="Nữ">Nữ</option>
                    </select>
                  </div>
                  <div className="sm-form-group">
                    <label style={{ fontWeight: 800, color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lớp Học</label>
                    <select name="malop" value={formData.malop || ''} onChange={handleChange} style={{ fontWeight: 600 }}>
                      <option value="">-- Chọn lớp --</option>
                      {classes.map(c => <option key={c.malop} value={c.malop}>{c.tenlop}</option>)}
                    </select>
                  </div>
                  <div className="sm-form-group">
                    <label style={{ fontWeight: 800, color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trạng Thái</label>
                    <select name="trangthai" value={formData.trangthai} onChange={handleChange} style={{ fontWeight: 600 }}>
                      <option value="Đang Học">Đang Học</option>
                      <option value="Đã Nghỉ">Đã Nghỉ</option>
                    </select>
                  </div>
                  <div className="sm-form-group">
                    <label style={{ fontWeight: 800, color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hình thức thanh toán</label>
                    <select name="hinhthucdong" value={formData.hinhthucdong || (walletsConfig[0]?.name || 'Tiền mặt')} onChange={handleChange} style={{ fontWeight: 600 }}>
                      {walletsConfig.length === 0 && <option value="Tiền mặt">Tiền mặt</option>}
                      {walletsConfig.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                    </select>
                  </div>

                </div>
              </div>

              <div className="form-divider" style={{ gridColumn: '1 / -1', borderTop: '1px solid #e2e8f0', margin: '15px 0', paddingTop: '10px', fontWeight: 700, color: '#3b82f6' }}>TÀI KHOẢN PHỤ HUYNH (ĐỂ ĐĂNG NHẬP)</div>

              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                <label style={{ fontWeight: 700, color: '#059669' }}>Tên đăng nhập (Username)</label>
                <input type="text" name="username" value={formData.username || ''} onChange={handleChange} placeholder="VD: ph_nguyenvana" />
              </div>
              <div className="sm-form-group" style={{ gridColumn: 'span 1' }}>
                <label style={{ fontWeight: 700, color: '#059669' }}>Mật khẩu (Password)</label>
                <input type="text" name="password" value={formData.password || ''} onChange={handleChange} placeholder="Mật khẩu đăng nhập" />
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
                <textarea style={{ height: "100px" }}
                  name="ghichu"
                  defaultValue={`Số ĐT người đón dùm :
Họ tên người đón :
Mối liên hệ với bé :
Địa chỉ tạm trú:`}
                  onChange={handleChange}
                  rows="2"
                />
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
              <h3><ArrowRightLeft size={20} /> Chuyển Học Sinh Sang Lớp Khác</h3>
              <button className="close-btn" onClick={() => setIsTransferClassOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p>Học sinh đang chọn: <strong>{students.find(s => s.mahv === selectedStudentId)?.tenhv || selectedStudentId}</strong></p>
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
              <h3><AlertCircle size={20} /> Xác nhận xóa học sinh</h3>
              <button className="close-btn" onClick={() => setIsDeleteOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p className="delete-warning-text" style={{ marginBottom: '1.25rem', fontSize: '1rem', color: '#1e293b' }}>
                Bạn có chắc chắn muốn xóa học sinh: <br />
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
      {/* Health History Modal */}
      {isHealthOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px', width: '95%', borderRadius: '20px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #f1f5f9', padding: '1.25rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                <Heart size={24} color="#db2777" fill="#fdf2f8" /> Hồ sơ sức khỏe định kỳ
              </h3>
              <button className="close-btn" onClick={() => setIsHealthOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ padding: '1.5rem', maxHeight: '70vh', overflowY: 'auto' }}>
              {healthLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <RefreshCw className="spinner" size={32} color="#db2777" />
                  <p style={{ marginTop: '1rem', color: '#64748b' }}>Đang tải hồ sơ...</p>
                </div>
              ) : (
                <>
                  <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '16px', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                      {students.find(s => s.mahv === selectedStudentId)?.tenhv}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.85rem' }}>Mã HS: {selectedStudentId}</div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h4 style={{ margin: '0 0 5px 0', fontSize: '0.9rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lịch sử theo dõi</h4>
                    {healthHistory.length > 0 ? healthHistory.map((h, idx) => (
                      <div key={idx} style={{ background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid #f1f5f9', display: 'grid', gridTemplateColumns: '100px 1fr 1fr', alignItems: 'center', gap: '15px' }}>
                        <div style={{ textAlign: 'center', borderRight: '1px solid #f1f5f9', paddingRight: '10px' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>Tháng {new Date(h.ngay).getMonth() + 1}</div>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{new Date(h.ngay).getFullYear()}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Chiều cao</div>
                          <div style={{ fontWeight: 700, color: '#2563eb' }}>{h.chieucao} cm</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Cân nặng</div>
                          <div style={{ fontWeight: 700, color: '#16a34a' }}>{h.cannang} kg</div>
                        </div>
                      </div>
                    )) : (
                      <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #e2e8f0' }}>
                        Chưa có lịch sử sức khỏe.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer" style={{ padding: '1.25rem', borderTop: '1px solid #f1f5f9', textAlign: 'right' }}>
              <button className="btn btn-secondary" onClick={() => setIsHealthOpen(false)} style={{ padding: '0.6rem 1.5rem', borderRadius: '8px' }}>Đóng</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
