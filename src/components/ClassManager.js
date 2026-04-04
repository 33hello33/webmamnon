import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase, generateId } from '../supabase';
import * as XLSX from 'xlsx';
import {
  Edit, Trash2, Download, Search, PlusCircle, MessageSquare, ArrowRightLeft, CalendarDays, Clock, Users, User, DollarSign, X, Eye, GraduationCap, FileText
} from 'lucide-react';

import { toPng } from 'html-to-image';
import { useConfig } from '../ConfigContext';
import './ClassManager.css';

const INITIAL_FORM = {
  malop: '', tenlop: '', hocphi: '', manv: '', daxoa: 'Đang Học'
}
const formatMonthYear = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const getQRUrl = (hoaDon, walletsConfig) => {
  if (!walletsConfig || !hoaDon.hinhthuc) return null;
  const hinhThucTrim = String(hoaDon.hinhthuc).trim();
  const matchedWallet = walletsConfig.find(w => String(w.name).trim() === hinhThucTrim);
  if (matchedWallet && matchedWallet.bankId && matchedWallet.accNo) {
    const amountStr = (hoaDon.tongcong || "0").toString().replace(/\D/g, "");

    // Cải thiện nội dung chuyển khoản để chính xác và tránh nhầm lẫn
    const mahv = hoaDon.mahv || '';
    const tenhv = hoaDon.tenhv || '';
    const mahd = hoaDon.mahd || '';

    // Rút gọn tên nếu cần (lấy tối đa 2 từ cuối để vừa độ dài QR nếu quá dài)
    let shortenedName = tenhv.trim();
    /* 
    const nameParts = shortenedName.split(' ');
    if (nameParts.length > 2) shortenedName = nameParts.slice(-2).join(' ');
    */

    const info = encodeURIComponent(`${mahv}-${tenhv}`.trim());
    return `https://img.vietqr.io/image/${matchedWallet.bankId}-${matchedWallet.accNo}-compact2.png?amount=${amountStr}&addInfo=${info}&accountName=${encodeURIComponent(matchedWallet.accName || '')}`;
  }
  return null;
};
const formatTuition = (val) => {
  if (!val && val !== 0) return '';
  let raw = val.toString().replace(/,/g, '');
  return raw.replace(/\d+/g, (match) => {
    return parseInt(match, 10).toLocaleString('en-US');
  });
};
const parseFormattedNumber = (val) => {
  if (!val) return 0;
  return parseInt(val.toString().replace(/,/g, ''), 10) || 0;
};

const parseScheduleDays = (tgb) => {
  if (!tgb) return [];
  const normalized = tgb.toLowerCase().replace(/thứ /g, 't').replace(/thứ/g, 't').replace(/chủ nhật/g, 'cn');
  const days = [];
  if (normalized.includes('t2')) days.push(1);
  if (normalized.includes('t3')) days.push(2);
  if (normalized.includes('t4')) days.push(3);
  if (normalized.includes('t5')) days.push(4);
  if (normalized.includes('t6')) days.push(5);
  if (normalized.includes('t7')) days.push(6);
  if (normalized.includes('cn')) days.push(0);
  return days;
};

const calculateEndDateBySessions = (startDateStr, numSessions, activeDays) => {
  if (!startDateStr || !numSessions || activeDays.length === 0) return '';
  let current = new Date(startDateStr);
  let sessionsFound = 0;
  let maxDaysToCheck = 3650;

  while (sessionsFound < numSessions && maxDaysToCheck > 0) {
    if (activeDays.includes(current.getDay())) {
      sessionsFound++;
      if (sessionsFound === parseInt(numSessions, 10)) break;
    }
    current.setDate(current.getDate() + 1);
    maxDaysToCheck--;
  }
  if (sessionsFound > 0) {
    return current.toISOString().split('T')[0];
  }
  return '';
};

const calculateThoiluong = (ngayBatDau, soLuong, loaiDong) => {
  if (!ngayBatDau) return '';
  const SL = parseInt(soLuong) || 1;
  const unit = (loaiDong || '').toLowerCase();
  const start = new Date(ngayBatDau);

  if ((unit.includes('tháng') || unit.includes('khóa')) && SL > 1) {
    const months = [];
    for (let i = 0; i < SL; i++) {
      const d = new Date(start);
      d.setMonth(start.getUTCMonth() + i);
      months.push(`${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`);
    }
    return months.join(', ');
  }
  return `${String(start.getUTCMonth() + 1).padStart(2, '0')}/${start.getUTCFullYear()}`;
};

const calculateConsecutiveLeave = (attendanceData) => {
  const excusedLeaveDays = attendanceData
    .filter(a => (a.trangthai || '').trim().toLowerCase() === 'nghỉ phép')
    .map(a => new Date(a.ngay).getTime())
    .sort((a, b) => a - b);

  if (excusedLeaveDays.length === 0) return [];

  const groups = [];
  let currentGroup = [excusedLeaveDays[0]];

  for (let i = 1; i < excusedLeaveDays.length; i++) {
    const prev = new Date(excusedLeaveDays[i - 1]);
    const curr = new Date(excusedLeaveDays[i]);
    const diffInDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

    let isConsecutive = false;
    if (diffInDays === 1) {
      isConsecutive = true;
    } else if (diffInDays === 2) {
      const middleDay = new Date(prev);
      middleDay.setDate(prev.getDate() + 1);
      if (middleDay.getDay() === 0) isConsecutive = true;
    }

    if (isConsecutive) {
      currentGroup.push(curr);
    } else {
      groups.push([...currentGroup]);
      currentGroup = [curr];
    }
  }
  groups.push(currentGroup);
  return groups.map(g => ({
    ngay_bat_dau_nghi: g[0],
    ngay_ket_thuc_nghi: g[g.length - 1],
    so_ngay_nghi_lien_tuc: g.length
  }));
};

export default function ClassManager({ students, showMessage, fetchStudents }) {
  const { config } = useConfig();
  const walletsConfig = React.useMemo(() => (config ? [
    { id: 'vi1', name: config.vi1?.name || '', bankId: config.vi1?.bankId || '', accNo: config.vi1?.accNo || '', accName: config.vi1?.accName || '' },
    { id: 'vi2', name: config.vi2?.name || '', bankId: config.vi2?.bankId || '', accNo: config.vi2?.accNo || '', accName: config.vi2?.accName || '' },
    { id: 'vi3', name: config.vi3?.name || '', bankId: config.vi3?.bankId || '', accNo: config.vi3?.accNo || '', accName: config.vi3?.accName || '' },
    { id: 'vi4', name: config.vi4?.name || '', bankId: config.vi4?.bankId || '', accNo: config.vi4?.accNo || '', accName: config.vi4?.accName || '' }
  ].filter(w => w.name && w.name.trim() !== '') : []), [config]);

  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Data for Joins
  const [teachers, setTeachers] = useState([]);
  const [contracts, setContracts] = useState([]);

  // Form
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);

  // Batch Notice
  const [isBatchNoticeOpen, setIsBatchNoticeOpen] = useState(false);
  const [batchNoticeData, setBatchNoticeData] = useState({
    loaiDong: 'Tháng',
    soLuong: 1,
    hocPhiOpt: '',
    hinhThuc: (config && (config.vi1?.name || config.vi2?.name || config.vi3?.name || config.vi4?.name)) ? (config.vi1?.name || config.vi2?.name || config.vi3?.name || config.vi4?.name) : 'Tiền mặt',
    ngayBatDau: new Date().toISOString().split('T')[0],
    ngayKetThuc: '',
    ghiChu: ''
  });
  const [batchHinhThucFilter, setBatchHinhThucFilter] = useState('Tất cả');
  const [batchStudentsData, setBatchStudentsData] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [noticesToPrint, setNoticesToPrint] = useState([]);
  const [isViewStudentOpen, setIsViewStudentOpen] = useState(false);
  const [viewStudentData, setViewStudentData] = useState(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferTargetClassId, setTransferTargetClassId] = useState('');
  const [transferringStudent, setTransferringStudent] = useState(null);
  const isProcessingRef = React.useRef(false);



  // Lesson Content
  const [isNoidungModalOpen, setIsNoidungModalOpen] = useState(false);
  const [noidungFilter, setNoidungFilter] = useState('this_month');
  const [noidungList, setNoidungList] = useState([]);
  const [noidungLoading, setNoidungLoading] = useState(false);

  // Delete Confirmation
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  const fetchClasses = async () => {
    setLoading(true);
    try {
      const { data: lopData, error } = await supabase.from('tbl_lop')
        .select('*')
        .neq('daxoa', 'Đã Xóa')
        .order('tenlop');
      if (error) {
        console.warn('Lỗi tải danh sách lớp, có thể bảng chưa được tạo.', error);
      } else {
        setClasses(lopData || []);
        if (lopData && lopData.length > 0 && !selectedClassId) {
          setSelectedClassId(lopData[0].malop);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    try {
      const { data } = await supabase
        .from('tbl_nv')
        .select('*')
        .in('role', ['Giáo viên', 'Trợ giảng'])
        .eq('trangthai', 'Đang Làm');
      if (data) setTeachers(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchClasses();
    fetchTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchNoidungDay = useCallback(async (filter) => {
    if (!selectedClassId) return;
    setNoidungLoading(true);
    try {
      let startD, endD;
      const today = new Date();
      const now = new Date(today - today.getTimezoneOffset() * 60000);
      const todayIso = now.toISOString().split('T')[0];

      if (filter === 'this_week') {
        const day = now.getDay() || 7;
        const wStart = new Date(now);
        wStart.setHours(-24 * (day - 1));
        startD = wStart.toISOString().split('T')[0];
        endD = todayIso;
      } else if (filter === 'this_month') {
        startD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        endD = todayIso;
      } else if (filter === 'last_month') {
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        startD = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
        endD = lastDay.toISOString().split('T')[0];
      }

      const { data, error } = await supabase
        .from('tbl_noidungday')
        .select('*')
        .eq('malop', selectedClassId)
        .gte('ngay', startD)
        .lte('ngay', endD)
        .order('ngay', { ascending: false });

      if (error) throw error;
      setNoidungList(data || []);
    } catch (err) {
      console.error(err);
      showMessage('error', 'Lỗi tải nội dung dạy: ' + err.message);
    } finally {
      setNoidungLoading(false);
    }
  }, [selectedClassId]);

  useEffect(() => {
    if (isNoidungModalOpen) {
      fetchNoidungDay(noidungFilter);
    }
  }, [isNoidungModalOpen, noidungFilter, fetchNoidungDay]);

  const classStudents = React.useMemo(() => {
    if (!selectedClassId || !students) return [];

    return students.filter(s => {
      // 1. Normalize malop comparison
      const smalop = (s.malop || '').toString().trim().toLowerCase();
      const selId = (selectedClassId || '').toString().trim().toLowerCase();

      // 2. Check in malop or malop_list (handling both array and string variants)
      let matchesClass = (smalop === selId);

      if (!matchesClass && s.malop_list) {
        if (Array.isArray(s.malop_list)) {
          matchesClass = s.malop_list.some(m => (m || '').toString().trim().toLowerCase() === selId);
        } else if (typeof s.malop_list === 'string') {
          matchesClass = s.malop_list.toLowerCase().includes(selId);
        }
      }

      if (!matchesClass) return false;

      // 3. Status check (normalize state)
      const st = (s.trangthai || '').trim().toLowerCase();
      // Only hide if 'đã nghỉ'
      return st !== 'đã nghỉ';
    });
  }, [students, selectedClassId]);

  useEffect(() => {
    const fetchContractsForClass = async () => {
      const stdIds = classStudents.map(s => s.mahv);
      if (stdIds.length > 0) {
        try {
          const { data, error } = await supabase
            .from('tbl_hd')
            .select('mahv, ngaybatdau, ngayketthuc, ngaylap, thoiluong')
            .in('mahv', stdIds)
            .order('ngaylap', { ascending: false });
          if (!error && data) {
            setContracts(data);
          }
        } catch (err) {
          console.error(err);
        }
      } else {
        setContracts([]);
      }
    };

    if (selectedClassId) {
      fetchContractsForClass();
    }
  }, [selectedClassId, classStudents]); // Dependency triggers when class or static students change

  // Today's Day Code (T2, T3... CN)
  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const todayCode = dayNames[new Date().getDay()];

  // Filter & Sort Classes
  const filteredClasses = classes
    .filter(c =>
      c.tenlop?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.malop?.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const selectedClass = classes.find(c => c.malop === selectedClassId);

  // --- BATCH NOTICE HANDLERS ---
  const handleOpenBatchNotice = async () => {
    const activeStudents = classStudents.filter(s => (s.trangthai || '').trim().toLowerCase().includes('đang học'));
    if (activeStudents.length === 0) return showMessage('error', 'Lớp này không có học sinh nào "Đang Học" để gửi thông báo');

    setIsBatchNoticeOpen(true);
    setBatchHinhThucFilter('Tất cả');
    setLoading(true);

    try {
      let initHocPhiOpt = '';
      let initSoLuong = 1;
      let initLoaiDong = 'Tháng';
      let initHocPhi = 0;

      if (selectedClass?.hocphi) {
        const opts = String(selectedClass.hocphi).split('\n').filter(Boolean);
        if (opts.length > 0) {
          initHocPhiOpt = opts[0];
          const qtyMatch = String(initHocPhiOpt).match(/(?:^|[^0-9])(\d+)\s*(?:buổi|tháng|khóa|tuần)/i);
          if (qtyMatch && qtyMatch[1]) {
            initSoLuong = parseInt(qtyMatch[1], 10);
          }
          const optLower = String(initHocPhiOpt).toLowerCase();
          if (optLower.includes('buổi')) initLoaiDong = 'Buổi';
          else if (optLower.includes('tháng')) initLoaiDong = 'Tháng';
          else if (optLower.includes('khóa')) initLoaiDong = 'Khóa';
          else if (optLower.includes('tuần')) initLoaiDong = 'Tuần';

          const hpNumbers = String(initHocPhiOpt).replace(/,/g, '').match(/\d{4,}/g);
          if (hpNumbers) {
            initHocPhi = Math.max(...hpNumbers.map(Number));
          }
        }
      }

      const now = new Date();
      const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startStr = new Date(firstDayThisMonth.getTime() - firstDayThisMonth.getTimezoneOffset() * 60000).toISOString().split('T')[0];

      // Fetch latest docs for all active students to determine their previous billing cycle
      const studentIds = activeStudents.map(s => s.mahv);
      const [{ data: allHDs }, { data: allTBs }] = await Promise.all([
        supabase.from('tbl_hd').select('mahv, ngaybatdau, ngayketthuc, ngaylap, thoiluong, mahd').in('mahv', studentIds).neq('daxoa', 'Đã Xóa'),
        supabase.from('tbl_thongbao').select('mahv, ngaybatdau, ngayketthuc, ngaylap, thoiluong, mahd').in('mahv', studentIds).neq('daxoa', 'Đã Xóa')
      ]);

      const ensureIsoDate = (dStr) => {
        if (!dStr) return null;
        const s = String(dStr);
        if (s.includes('T')) return s.split('T')[0];
        if (s.includes('-') && s.length >= 10 && s.indexOf('-') === 4) return s.substring(0, 10);
        const parts = s.split(/[\/\- :]/);
        if (parts.length >= 3) {
          const d = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const y = parseInt(parts[2], 10);
          if (y > 2000) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
        return s;
      };

      const safeTime = (d) => {
        if (!d) return 0;
        const t = new Date(d).getTime();
        return isNaN(t) ? 0 : t;
      };

      // Map each student to their latest doc's date range
      const studentRanges = {};
      activeStudents.forEach(s => {
        const docs = [
          ...(allHDs || []).filter(x => x.mahv === s.mahv),
          ...(allTBs || []).filter(x => x.mahv === s.mahv)
        ].sort((a, b) => safeTime(b.ngaylap) - safeTime(a.ngaylap));

        const recent = docs[0];
        if (recent) {
          let sStart = ensureIsoDate(recent.ngaybatdau);
          let sEnd = ensureIsoDate(recent.ngayketthuc);

          if ((!sStart || !sEnd) && recent.thoiluong) {
            const m = recent.thoiluong.match(/(\d{2})\/(\d{4})/);
            if (m) {
              const mm = parseInt(m[1]) - 1;
              const yyyy = parseInt(m[2]);
              sStart = new Date(yyyy, mm, 1).toISOString().split('T')[0];
              sEnd = new Date(yyyy, mm + 1, 0).toISOString().split('T')[0];
            }
          }
          if (sStart && sEnd) {
            studentRanges[s.mahv] = { start: sStart, end: sEnd };
          }
        }
      });

      // Fetch attendance for all identified ranges (broad fetch for simplicity but covered by MIN/MAX)
      const allStarts = Object.values(studentRanges).map(r => r.start);
      const allEnds = Object.values(studentRanges).map(r => r.end);

      let attendance = [];
      if (allStarts.length > 0) {
        const minStart = allStarts.reduce((a, b) => a < b ? a : b);
        const maxEnd = allEnds.reduce((a, b) => a > b ? a : b);
        const { data: attData } = await supabase
          .from('tbl_diemdanh')
          .select('*')
          .in('mahv', studentIds)
          .gte('ngay', minStart)
          .lte('ngay', maxEnd);
        attendance = attData || [];
      }

      const trutienan_val = parseInt(String(config?.trutienan || '0').replace(/\D/g, '')) || 0;
      const trutiennghi_val = parseInt(String(config?.trutiennghi || '0').replace(/\D/g, '')) || 0;
      const p6 = parseFloat(config?.nghi6ngay) || 0;
      const p12 = parseFloat(config?.nghi12ngay) || 0;

      setBatchNoticeData({
        loaiDong: initLoaiDong,
        soLuong: initSoLuong,
        hocPhiOpt: initHocPhiOpt,
        hinhThuc: walletsConfig[0]?.name || 'Tiền mặt',
        ngayBatDau: startStr,
        ngayKetThuc: '',
        giamHocphi: 0,
        ghiChu: ''
      });

      const initData = activeStudents.map((s, sIdx) => {
        // Find specific student data again to be 100% sure of identity
        const studentRaw = students.find(st => st.mahv === s.mahv) || s;
        const currentMahv = studentRaw.mahv;
        const currentTenhv = studentRaw.tenhv;

        const range = studentRanges[currentMahv];
        let studentAttendance = [];
        if (range && attendance) {
          studentAttendance = attendance.filter(a => a.mahv === currentMahv && a.ngay >= range.start && a.ngay <= range.end);
        }

        const groups = calculateConsecutiveLeave(studentAttendance);

        let mealRefund = 0;
        let tuitionRefund = 0;
        let maxLeave = 0;

        groups.forEach(g => {
          const count = g.so_ngay_nghi_lien_tuc;
          if (count > maxLeave) maxLeave = count;

          if (count >= 12) {
            tuitionRefund += count * trutiennghi_val * (p12 / 100);
          } else if (count >= 6) {
            tuitionRefund += count * trutiennghi_val * (p6 / 100);
          }

          if (count >= 3) {
            mealRefund += count * trutienan_val;
          }
        });

        // Round to nearest 1000
        mealRefund = Math.round(mealRefund / 1000) * 1000;
        tuitionRefund = Math.round(tuitionRefund / 1000) * 1000;

        const stHinhThuc = studentRaw.hinhthucdong || walletsConfig[0]?.name || 'Tiền mặt';
        const totalRefund = mealRefund + tuitionRefund;

        const diHoc = studentAttendance.filter(a => (a.trangthai || '').trim().toLowerCase() === 'có mặt').length;
        const nghiPhep = studentAttendance.filter(a => (a.trangthai || '').trim().toLowerCase() === 'nghỉ phép').length;
        const nghiKP = studentAttendance.filter(a => (a.trangthai || '').trim().toLowerCase() === 'nghỉ không phép').length;
        const statsPeriod = range ? formatMonthYear(range.start) : '';

        return {
          mahv: currentMahv,
          tenhv: currentTenhv,
          hocphi: initHocPhi,
          giamhocphi: 0,
          truTienAn: mealRefund,
          truHocPhi: tuitionRefund,
          nghiLienTiep: maxLeave,
          tongcong: Math.max(0, initHocPhi - totalRefund),
          ngaybatdau: startStr,
          hinhthuc: stHinhThuc,
          ghichu: '',
          thoigianbieu: selectedClass?.thoigianbieu || '',
          diemDanhInfo: { diHoc, nghiPhep, nghiKP, statsPeriod }
        };
      });

      setBatchStudentsData(initData);
    } catch (err) {
      console.error('Lỗi mở thông báo hàng loạt:', err);
      showMessage('error', 'Đã xảy ra lỗi khi chuẩn bị thông báo: ' + err.message);
      setIsBatchNoticeOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchNoticeFieldChange = (field, val) => {
    let cleanVal = val;
    if (field === 'giamHocphi' || field === 'soLuong') {
      cleanVal = parseFormattedNumber(val);
    }
    let newNotice = { ...batchNoticeData, [field]: cleanVal };

    if (field === 'hocPhiOpt') {
      const qtyMatch = String(val).match(/(?:^|[^0-9])(\d+)\s*(?:buổi|tháng)/i);
      if (qtyMatch && qtyMatch[1]) {
        newNotice.soLuong = parseInt(qtyMatch[1], 10);
      }
      const valLower = String(val).toLowerCase();
      if (valLower.includes('buổi')) newNotice.loaiDong = 'Buổi';
      else if (valLower.includes('tháng')) newNotice.loaiDong = 'Tháng';
      else if (valLower.includes('khóa')) newNotice.loaiDong = 'Khóa';
      else if (valLower.includes('tuần')) newNotice.loaiDong = 'Tuần';
    }

    if (field === 'loaiDong' || field === 'soLuong' || field === 'ngayBatDau' || field === 'hocPhiOpt') {
      const unit = (newNotice.loaiDong || '').toLowerCase().trim();
      if (unit.includes('tháng') || unit.includes('khóa')) {
        const startD = new Date(newNotice.ngayBatDau);
        if (!isNaN(startD.getTime())) {
          startD.setMonth(startD.getMonth() + (parseInt(newNotice.soLuong) || 1));
          newNotice.ngayKetThuc = startD.toISOString().split('T')[0];
        }
      } else if (unit.includes('buổi') && newNotice.ngayBatDau && newNotice.soLuong && selectedClass?.thoigianbieu) {
        const activeDays = parseScheduleDays(selectedClass.thoigianbieu);
        if (activeDays.length > 0) {
          newNotice.ngayKetThuc = calculateEndDateBySessions(newNotice.ngayBatDau, parseInt(newNotice.soLuong) || 1, activeDays);
        }
      } else if (unit.includes('tuần') && newNotice.ngayBatDau && newNotice.soLuong) {
        const startD = new Date(newNotice.ngayBatDau);
        if (!isNaN(startD.getTime())) {
          startD.setDate(startD.getDate() + (parseInt(newNotice.soLuong) || 1) * 7);
          newNotice.ngayKetThuc = startD.toISOString().split('T')[0];
        }
      }
    }
    setBatchNoticeData(newNotice);
  };

  const handleBatchMonthChange = (offset) => {
    const current = new Date(batchNoticeData.ngayBatDau);
    if (isNaN(current.getTime())) return;
    current.setMonth(current.getMonth() + offset);
    current.setDate(1);
    const startStr = current.toISOString().split('T')[0];
    handleBatchNoticeFieldChange('ngayBatDau', startStr);
  };

  const handleApplyBatchNotice = () => {
    let hpNumber = 0;
    if (batchNoticeData.hocPhiOpt) {
      const numbers = String(batchNoticeData.hocPhiOpt).replace(/,/g, '').match(/\d{4,}/g);
      if (numbers) {
        hpNumber = Math.max(...numbers.map(Number));
      }
    }

    setBatchStudentsData(prev => (prev || []).map(item => {
      const tc = Math.max(0, hpNumber - (parseInt(batchNoticeData.giamHocphi) || 0) - (item.truTienAn || 0) - (item.truHocPhi || 0));

      return {
        ...item,
        hocphi: hpNumber,
        giamhocphi: batchNoticeData.giamHocphi || 0,
        ngaybatdau: batchNoticeData.ngayBatDau,
        ghichu: batchNoticeData.ghiChu,
        tongcong: tc
      };
    }));
  };

  const handleBatchStudentChange = (mahv, field, value) => {
    setBatchStudentsData(prev => (prev || []).map(item => {
      if (item.mahv === mahv) {
        let cleanVal = value;
        if (['hocphi', 'giamhocphi', 'truTienAn', 'truHocPhi'].includes(field)) {
          cleanVal = parseFormattedNumber(value);
        }
        let newItem = { ...item, [field]: cleanVal };
        if (['hocphi', 'giamhocphi', 'truTienAn', 'truHocPhi'].includes(field)) {
          const hp = parseInt(newItem.hocphi || 0);
          const ghp = parseInt(newItem.giamhocphi || 0);
          const tta = parseInt(newItem.truTienAn || 0);
          const thp = parseInt(newItem.truHocPhi || 0);
          newItem.tongcong = Math.max(0, hp - ghp - tta - thp);
        }
        return newItem;
      }
      return item;
    }));
  };

  const handleRemoveBatchStudent = (mahv) => {
    setBatchStudentsData(prev => prev.filter(item => item.mahv !== mahv));
  };
  const handleConfirmBatchExport = async () => {
    setIsGenerating(true);
    try {
      const localNow = new Date(new Date() - new Date().getTimezoneOffset() * 60000).toISOString();

      const { data: recentTB } = await supabase.from('tbl_thongbao').select('mahd').order('mahd', { ascending: false }).limit(1);
      let nextNum = 1;
      if (recentTB && recentTB.length > 0 && recentTB[0].mahd) {
        const numPart = recentTB[0].mahd.replace(/\D/g, '');
        if (!isNaN(parseInt(numPart, 10))) nextNum = parseInt(numPart, 10) + 1;
      }

      const filteredExport = (batchStudentsData || []).filter(row => batchHinhThucFilter === 'Tất cả' || row.hinhthuc === batchHinhThucFilter);

      const batchId = Date.now();
      const finalNotices = filteredExport.map((row, i) => {
        const studentId = row.mahv;
        // Re-fetch from master list to be absolutely sure of identity
        const masterStudent = students.find(s => s.mahv === studentId) || {};
        const newMaHD = `TB${String(nextNum + i).padStart(5, '0')}`;
        const tl = formatMonthYear(row.ngaybatdau);

        return {
          ...row,
          batchId: `${batchId}-${i}`,
          mahd: newMaHD,
          mahv: studentId,
          tenhv: masterStudent.tenhv || row.tenhv,
          sdt: masterStudent.sdt || '',
          tenlop: selectedClass?.tenlop || '',
          thoiluong: tl,
          ngaylap: localNow,
          // Pre-format strings to avoid any render-time recalculation errors
          hocphiStr: formatTuition(row.hocphi),
          giamhocphiStr: formatTuition(row.giamhocphi),
          truTienAnStr: formatTuition(row.truTienAn || 0),
          truHocPhiStr: formatTuition(row.truHocPhi || 0),
          tongcongStr: formatTuition(row.tongcong)
        };
      });

      const recordsToInsert = finalNotices.map(n => ({
        mahd: n.mahd,
        ngaylap: n.ngaylap,
        mahv: n.mahv,
        tenlop: n.tenlop,
        ngaybatdau: n.ngaybatdau,
        manv: 'Hệ thống',
        hocphi: n.hocphiStr,
        giamhocphi: formatTuition((n.giamhocphi || 0) + (n.truTienAn || 0) + (n.truHocPhi || 0)),
        tongcong: n.tongcongStr,
        dadong: '0',
        conno: n.tongcongStr,
        hinhthuc: n.hinhthuc,
        ghichu: n.ghichu,
        malop: selectedClass?.malop || '',
        thoiluong: n.thoiluong,
        sobuoihoc: n.thoiluong,
        daxoa: null
      }));

      if (recordsToInsert.length > 0) {
        const { error } = await supabase.from('tbl_thongbao').insert(recordsToInsert);
        if (error) throw error;
      }

      // EXCEL EXPORT
      const excelData = finalNotices.map((n, idx) => ({
        "STT": idx + 1,
        "Mã học sinh": n.mahv,
        "Họ và tên": n.tenhv,
        "Lớp": n.tenlop,
        "Tháng": n.thoiluong,
        "Học phí": n.hocphi || 0,
        "Giảm học phí": n.giamhocphi || 0,
        "Hoàn tiền ăn": n.truTienAn || 0,
        "Hoàn tiền học": n.truHocPhi || 0,
        "Tổng cộng": n.tongcong || 0,
        "Hình thức": n.hinhthuc,
        "Ghi chú": n.ghichu
      }));

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "DanhSachHocPhi");
      XLSX.writeFile(wb, `DS_Thong_Bao_HP_${selectedClass?.tenlop}_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`);

      if (finalNotices.length > 0) {
        setNoticesToPrint(finalNotices);
      }
    } catch (err) {
      console.error('Lỗi khi lưu thông báo hàng loạt:', err);
      if (err.code === '42P01') showMessage('error', 'Chưa có bảng tbl_thongbao trong CSDL để lưu trữ.');
      else showMessage('error', 'Lỗi lưu dữ liệu: ' + err.message);
      setIsGenerating(false);
    }
  };

  const getNoticeQRUrl = (hoaDon) => {
    return getQRUrl(hoaDon, walletsConfig);
  };

  useEffect(() => {
    if (noticesToPrint.length > 0 && !isProcessingRef.current) {
      isProcessingRef.current = true;
      const processPngs = async () => {
        try {
          // Wait for DOM to fully settle
          await new Promise(r => setTimeout(r, 3500));

          // Ensure all images are loaded
          const allImageTags = Array.from(document.querySelectorAll('[id^="print-notice-"] img'));
          await Promise.all(
            allImageTags.map(img => {
              if (img.complete) return Promise.resolve();
              return new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve;
                setTimeout(resolve, 5000);
              });
            })
          );

          await new Promise(r => setTimeout(r, 1000));

          for (let i = 0; i < noticesToPrint.length; i++) {
            const notice = noticesToPrint[i];
            const node = document.getElementById(`batch-notice-${notice.batchId}`);
            if (node) {
              // Bring it "visually" to the viewport but almost transparent
              node.style.position = 'fixed';
              node.style.top = '0';
              node.style.left = '0';
              node.style.zIndex = '99999';
              node.style.opacity = '1';
              node.style.visibility = 'visible';

              // Small wait before capture
              await new Promise(r => setTimeout(r, 600));

              try {
                const dataUrl = await toPng(node, {
                  cacheBust: true,
                  backgroundColor: '#ffffff'
                });

                // Set back to hidden state immediately after capture but keep in DOM
                node.style.position = 'static';
                node.style.opacity = '0.01';

                if (dataUrl && dataUrl.length > 2500) {
                  const link = document.createElement('a');
                  link.download = `ThongBao_${notice.tenhv}_${notice.mahd}.png`;
                  link.href = dataUrl;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                } else {
                  console.warn(`Empty or tiny dataUrl for index ${i}. Length: ${dataUrl?.length}`);
                  // Immediate retry with simple capture
                  const retryUrl = await toPng(node, { cacheBust: true, backgroundColor: '#ffffff' });
                  if (retryUrl && retryUrl.length > 2500) {
                    const link = document.createElement('a');
                    link.download = `ThongBao_${notice.tenhv}_${notice.mahd}_retry.png`;
                    link.href = retryUrl;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }
                }
              } catch (nodeErr) {
                console.error(`Lỗi capturing node ${i}:`, nodeErr);
              }

              // Pause between downloads
              await new Promise(r => setTimeout(r, 1800));
            }
          }
          showMessage('success', 'Đã tải xong hình ảnh thông báo!');
        } catch (err) {
          console.error('Lỗi PNG:', err);
          showMessage('error', 'Lỗi khi lưu tệp hình ảnh: ' + err.message);
        } finally {
          setIsGenerating(false);
          setNoticesToPrint([]);
          setIsBatchNoticeOpen(false);
          isProcessingRef.current = false;
        }
      };

      processPngs();
    }
  }, [noticesToPrint, showMessage]);

  // Form Handlers
  const handleOpenAdd = async () => {
    setIsEditMode(false);
    const newMalop = await generateId('tbl_lop', 'malop', 'Lop', 3);
    setFormData({ ...INITIAL_FORM, malop: newMalop });
    setIsFormOpen(true);
  };

  const handleOpenEdit = () => {
    if (!selectedClass) return showMessage('error', 'Chọn một lớp để sửa');
    setIsEditMode(true);
    setFormData(selectedClass);
    setIsFormOpen(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'hocphi' || name === 'trutiennghi') {
      setFormData(prev => ({ ...prev, [name]: formatTuition(value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };


  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.malop || !formData.tenlop) {
      return showMessage('error', 'Mã lớp và Tên lớp là bắt buộc');
    }

    try {
      const payload = {
        ...formData
      };

      if (isEditMode) {
        const { error } = await supabase.from('tbl_lop').update(payload).eq('malop', formData.malop);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tbl_lop').insert([payload]);
        if (error) throw error;
        setSelectedClassId(formData.malop);
      }

      showMessage('success', isEditMode ? 'Cập nhật thông tin lớp thành công!' : 'Thêm lớp học thành công!');
      setIsFormOpen(false);
      fetchClasses();
    } catch (err) {
      console.error(err);
      if (err.code === '23505') return showMessage('error', 'Mã lớp đã tồn tại');
      if (err.code === '42P01') return showMessage('error', 'Cơ sở dữ liệu chưa có bảng tbl_lop, hãy tạo bảng trước.');
      showMessage('error', 'Đã xảy ra lỗi khi lưu lớp');
    }
  };

  const handleDelete = () => {
    console.log("handleDelete called, selectedClass:", selectedClass);
    if (!selectedClass) return;
    if (classStudents && classStudents.length > 0) {
      console.log("Class has students, showing error...");
      return showMessage('error', 'Không thể xóa lớp đang có học sinh. Vui lòng chuyển lớp cho học sinh trước.');
    }
    setDeletePassword('');
    setIsDeleteOpen(true);
    console.log("isDeleteOpen set to true");
  };

  const confirmDelete = async () => {
    try {
      const sessionStr = localStorage.getItem('auth_session');
      if (!sessionStr) return showMessage('error', 'Phiên làm việc hết hạn');

      const session = JSON.parse(sessionStr);
      if (session.user.password !== deletePassword) {
        return showMessage('error', 'Mật khẩu xác nhận không đúng!');
      }

      const { error } = await supabase.from('tbl_lop').update({ daxoa: 'Đã Xóa' }).eq('malop', selectedClass.malop);
      if (error) throw error;

      showMessage('success', `Đã xóa lớp ${selectedClass.tenlop} thành công`);
      setIsDeleteOpen(false);
      setSelectedClassId(null);
      fetchClasses();
    } catch (err) {
      console.error(err);
      showMessage('error', 'Lỗi khi xóa lớp');
    }
  };

  const handleOpenViewStudent = (student) => {
    setViewStudentData(student);
    setIsViewStudentOpen(true);
  };

  const handleOpenTransfer = (student) => {
    setTransferringStudent(student);
    setTransferTargetClassId('');
    setIsTransferModalOpen(true);
  };

  const confirmTransfer = async () => {
    if (!transferTargetClassId) return showMessage('error', 'Vui lòng chọn lớp mới!');
    if (!transferringStudent) return;

    try {
      // Chuyển học sinh sang lớp mới bằng cách update cột malop trong tbl_hv
      const { error } = await supabase.from('tbl_hv')
        .update({ malop: transferTargetClassId })
        .eq('mahv', transferringStudent.mahv);

      if (error) throw error;

      showMessage('success', `Đã chuyển ${transferringStudent.tenhv} sang lớp mới thành công!`);
      setIsTransferModalOpen(false);
      if (fetchStudents) fetchStudents(); // Refresh global student list
      fetchClasses(); // Refresh local counts if needed
    } catch (err) {
      console.error(err);
      showMessage('error', 'Lỗi chuyển lớp: ' + (err.message || ''));
    }
  };

  // Export Excel
  const handleExportStudents = () => {
    if (classStudents.length === 0) return showMessage('error', 'Lớp này hiện không có học sinh');
    const cleanStudents = classStudents.map(s => {

      const latestHd = contracts
        .filter(c => c.mahv === s.mahv)
        .sort((a, b) => new Date(b.ngaylap) - new Date(a.ngaylap))[0];

      return {
        mahv: s.mahv || '',
        tenhv: s.tenhv || '',
        sdt: s.sdt || '',
        trangthai: s.trangthai || '',
        thoiluong: latestHd?.thoiluong || ''
      };
    });
    const ws = XLSX.utils.json_to_sheet(cleanStudents);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Học Sinh - ${selectedClass?.tenlop || 'Lớp'}`);
    XLSX.writeFile(wb, `DS_HocSinh_${selectedClass?.malop || 'Lop'}.xlsx`);
  };

  return (
    <div className="class-manager animate-fade-in">
      {/* Search and Action Bar */}
      <div className="class-toolbar">
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Tìm kiếm lớp học..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="action-buttons">
          <button className="btn btn-primary" onClick={handleOpenAdd}><PlusCircle size={16} /> Thêm Lớp</button>
        </div>
      </div>

      <div className="class-layout">
        {/* Left Pane - List of classes */}
        <div className="class-list-pane">
          <h3 className="pane-title">Danh sách lớp học ({filteredClasses.length})</h3>
          {loading ? (
            <div className="loading-state">Đang tải...</div>
          ) : (
            <div className="class-list">
              {filteredClasses.length > 0 ? (
                filteredClasses.map(c => {
                  const teacher = teachers.find(t => t.manv === c.manv);
                  const teacherName = teacher && teacher.tennv ? teacher.tennv : (c.manv ? c.manv : 'Chưa phân công');

                  return (
                    <div
                      key={c.malop}
                      className={`class-item ${selectedClassId === c.malop ? 'active' : ''} ${c.thoigianbieu?.split(',').map(s => s.trim()).includes(todayCode) ? 'is-today' : ''}`}
                      onClick={() => setSelectedClassId(c.malop)}
                    >
                      <div className="class-icon"><Users size={20} /></div>
                      <div className="class-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h4>{c.tenlop}</h4>
                          {c.thoigianbieu?.split(',').map(s => s.trim()).includes(todayCode) && (
                            <span style={{ fontSize: '0.65rem', background: '#ef4444', color: 'white', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>HÔM NAY</span>
                          )}
                        </div>
                        <div className="class-info-details">
                          <span>Sĩ số: {students.filter(s => {
                            const smalop = (s.malop || '').toString().trim().toLowerCase();
                            const cmalop = (c.malop || '').toString().trim().toLowerCase();
                            let matches = (smalop === cmalop);
                            if (!matches && s.malop_list) {
                              if (Array.isArray(s.malop_list)) matches = s.malop_list.some(m => (m || '').toString().trim().toLowerCase() === cmalop);
                              else if (typeof s.malop_list === 'string') matches = s.malop_list.toLowerCase().includes(cmalop);
                            }
                            return matches && (s.trangthai || '').trim().toLowerCase() !== 'đã nghỉ';
                          }).length} HV</span>
                          <span>GV: {teacherName}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="empty-message">Không có lớp học nào</div>
              )}
            </div>
          )}
        </div>

        {/* Right Pane - Details & Students */}
        <div className="class-details-pane">
          {selectedClass ? (
            <>
              <div className="class-header-card">
                <div className="class-title-row">
                  <div>
                    <h2>{selectedClass.tenlop}</h2>
                    <span className="class-id">Mã số: {selectedClass.malop}</span>
                  </div>
                  <div className="class-actions">
                    <button className="btn btn-outline" style={{ borderLeft: '4px solid #db2777' }} onClick={() => setIsNoidungModalOpen(true)}>
                      <FileText size={16} /> Lịch Sử Nội Dung Dạy
                    </button>
                    <button className="btn btn-outline" onClick={handleOpenEdit}><Edit size={16} /> Sửa Lớp</button>
                    <button className="btn btn-danger" onClick={handleDelete}><Trash2 size={16} /> Xóa Lớp</button>
                  </div>
                </div>

                <div className="class-info-list text-layout">
                  {(() => {
                    const teacher = teachers.find(t => t.manv === selectedClass.manv);
                    const teacherName = teacher && teacher.tennv ? teacher.tennv : (selectedClass.manv || 'Chưa phân công');

                    return (
                      <>
                        <div className="info-chip">
                          <GraduationCap size={16} />
                          <div className="chip-content">
                            <label>Giảng viên</label>
                            <span>{teacherName}</span>
                          </div>
                        </div>

                        {Array.from({ length: parseInt(config?.sonhanvientrogiang || '0', 10) }).map((_, i) => {
                          const taField = `manv${i + 1}`;
                          const taId = selectedClass[taField];
                          const taObj = teachers.find(t => t.manv === taId);
                          const taName = taObj && taObj.tennv ? taObj.tennv : taId;
                          if (!taName) return null;
                          return (
                            <div className="info-chip" key={taField}>
                              <User size={16} />
                              <div className="chip-content">
                                <label>Trợ giảng {i + 1}</label>
                                <span>{taName}</span>
                              </div>
                            </div>
                          );
                        })}

                        <div className="info-chip full-span">
                          <DollarSign size={16} />
                          <div className="chip-content">
                            <label>Học phí</label>
                            <span style={{ whiteSpace: 'pre-wrap' }}>{selectedClass.hocphi || 'Chưa cập nhật'}</span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="class-students-section">
                <div className="section-head">
                  <h3>Danh sách học sinh ({classStudents.length})</h3>
                  <div className="student-actions">
                    {config?.xuatthongbaohangloat !== false && (
                      <button className="btn btn-outline" onClick={handleOpenBatchNotice}>
                        <MessageSquare size={16} /> Xuất thông báo hàng loạt
                      </button>
                    )}
                    <button className="btn btn-success" onClick={handleExportStudents}>
                      <Download size={16} /> Xuất Excel
                    </button>
                  </div>
                </div>

                <div className="table-container inline-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th style={{ textAlign: 'center' }}>Hành động</th>
                        <th>Mã HS</th>
                        <th>Tên Học Sinh</th>
                        <th>Trạng Thái</th>
                        <th>Hình thức đóng</th>
                        <th>Thời Lượng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classStudents.length > 0 ? (
                        classStudents.map((s, idx) => {
                          const latestHd = contracts.find(c => c.mahv === s.mahv);
                          return (
                            <tr key={s.mahv}>
                              <td>{idx + 1}</td>
                              <td className="text-center">
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                                  <button className="tm-btn-icon text-primary" title="Xem chi tiết học sinh" onClick={() => handleOpenViewStudent(s)}>
                                    <Eye size={18} />
                                  </button>
                                  <button className="tm-btn-icon" style={{ color: '#8b5cf6' }} title="Chuyển lớp" onClick={() => handleOpenTransfer(s)}>
                                    <ArrowRightLeft size={18} />
                                  </button>
                                </div>
                              </td>
                              <td className="font-medium">{s.mahv}</td>
                              <td className="font-semibold text-primary">{s.tenhv}</td>
                              <td>
                                <span className={`status-badge ${(() => {
                                  const st = (s.trangthai || '').trim().toLowerCase();
                                  if (st.includes('đang học')) return 'active';
                                  if (st.includes('bảo lưu')) return 'warning';
                                  if (st.includes('đã nghỉ')) return 'inactive';
                                  return 'default';
                                })()}`}>
                                  {s.trangthai || 'Chưa cập nhật'}
                                </span>
                              </td>
                              <td>{s.hinhthucdong || '-'}</td>
                              <td style={{ fontWeight: 600, color: '#0369a1' }}>{latestHd?.thoiluong || '-'}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="7" className="empty-state">Lớp chưa có học sinh nào</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* ✅ CARD LIST (mobile) */}
                <div className="student-card-list">
                  {classStudents.length > 0 ? (
                    classStudents.map((s, idx) => {
                      const latestHd = contracts.find(c => c.mahv === s.mahv);

                      return (
                        <div key={s.mahv} className="student-card">
                          <div className="student-card-header">
                            <div>
                              <div className="student-name">{s.tenhv}</div>
                              <div className="student-id">#{s.mahv}</div>
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

                          <div className="student-info">
                            <span>STT: {idx + 1}</span>
                            <span>{selectedClass?.tenlop}</span>
                            <span style={{ fontWeight: 600, color: '#db2777' }}>HT: {s.hinhthucdong || 'Tiền mặt'}</span>
                          </div>

                          <div className="student-dates">
                            <span>
                              BĐ: {latestHd?.ngaybatdau
                                ? new Date(latestHd.ngaybatdau).toLocaleDateString('vi-VN')
                                : '-'}
                            </span>
                            <span>
                              KT: {latestHd?.ngayketthuc
                                ? new Date(latestHd.ngayketthuc).toLocaleDateString('vi-VN')
                                : '-'}
                            </span>
                          </div>

                          <div style={{ marginTop: '5px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                              className="btn btn-primary"
                              style={{ padding: '4px 10px', fontSize: '0.75rem', gap: '4px', background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' }}
                              onClick={() => handleOpenViewStudent(s)}
                            >
                              <Eye size={14} /> Chi tiết
                            </button>
                            <button
                              className="btn btn-primary"
                              style={{ padding: '4px 10px', fontSize: '0.75rem', gap: '4px', background: '#f5f3ff', color: '#5b21b6', borderColor: '#ddd6fe' }}
                              onClick={() => handleOpenTransfer(s)}
                            >
                              <ArrowRightLeft size={14} /> Chuyển
                            </button>
                          </div>

                        </div>
                      );
                    })
                  ) : (
                    <div className="empty-state">Lớp chưa có học sinh nào</div>
                  )}
                </div>

              </div>
            </>
          ) : (
            <div className="no-selection">
              <Users size={48} />
              <p>Chọn một lớp học bên danh sách để xem chi tiết</p>
            </div>
          )}
        </div>
      </div>

      {/* Student Detail Modal (Read-only) */}
      {isViewStudentOpen && viewStudentData && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content form-modal">
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <User size={20} /> Chi tiết thông tin Học Sinh
              </h3>
              <button className="close-btn" onClick={() => setIsViewStudentOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body form-grid column-2">
              <div className="form-group">
                <label>Mã HS</label>
                <input type="text" value={viewStudentData.mahv} disabled />
              </div>
              <div className="form-group">
                <label>Tên Học Sinh</label>
                <input type="text" value={viewStudentData.tenhv} disabled />
              </div>
              <div className="form-group">
                <label>SĐT Ba</label>
                <input type="text" value={viewStudentData.sdtba || '-'} disabled />
              </div>
              <div className="form-group">
                <label>SĐT Mẹ</label>
                <input type="text" value={viewStudentData.sdtme || '-'} disabled />
              </div>
              <div className="form-group">
                <label>Lớp Học</label>
                <input type="text" value={viewStudentData.malop_list && viewStudentData.malop_list.length > 0
                  ? viewStudentData.malop_list.map(ml => classes.find(c => c.malop === ml)?.tenlop || ml).join(', ')
                  : '-'} disabled />
              </div>
              <div className="form-group">
                <label>Trạng Thái</label>
                <input type="text" value={viewStudentData.trangthai || '-'} disabled />
              </div>
              <div className="form-group">
                <label>Ngày Nhập Học</label>
                <input type="text" value={viewStudentData.ngaynhaphoc ? new Date(viewStudentData.ngaynhaphoc).toLocaleDateString('vi-VN') : '-'} disabled />
              </div>
              <div className="form-group">
                <label>Họ tên Ba</label>
                <input type="text" value={viewStudentData.hotenba || '-'} disabled />
              </div>
              <div className="form-group">
                <label>Họ tên Mẹ</label>
                <input type="text" value={viewStudentData.tenme || '-'} disabled />
              </div>
              <div className="form-group">
                <label>Trường Đang Học</label>
                <input type="text" value={viewStudentData.truongdanghoc || '-'} disabled />
              </div>
              <div className="form-group">
                <label>Lớp Ở Trường</label>
                <input type="text" value={viewStudentData.lopotruong || '-'} disabled />
              </div>
              <div className="form-group full-width">
                <label>Địa Chỉ</label>
                <input type="text" value={viewStudentData.diachi || '-'} disabled />
              </div>
              <div className="form-group full-width">
                <label>Ghi Chú</label>
                <textarea value={viewStudentData.ghichu || '-'} disabled rows="2"></textarea>
              </div>
              <div className="form-actions full-width" style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                <button type="button" className="btn btn-primary" onClick={() => setIsViewStudentOpen(false)} style={{ minWidth: '120px' }}>Đóng</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Transfer Class Modal */}
      {isTransferModalOpen && transferringStudent && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content sm-modal">
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8b5cf6' }}>
                <ArrowRightLeft size={20} /> Chuyển lớp cho học sinh
              </h3>
              <button className="close-btn" onClick={() => setIsTransferModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', color: '#475569' }}>
                Học sinh: <strong style={{ color: '#10b981' }}>{transferringStudent.tenhv}</strong> (Mã: {transferringStudent.mahv})
              </p>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label style={{ color: '#64748b', fontWeight: 600, fontSize: '0.85rem' }}>Chọn lớp học mới chuyển đến:</label>
                <select
                  value={transferTargetClassId}
                  onChange={(e) => setTransferTargetClassId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    fontSize: '0.95rem',
                    outline: 'none',
                    fontFamily: 'inherit'
                  }}
                >
                  <option value="">-- Chọn lớp học --</option>
                  {classes.filter(c => transferringStudent.malop !== c.malop && !transferringStudent.malop_list?.includes(c.malop)).map(c => (
                    <option key={c.malop} value={c.malop}>{c.tenlop} ({c.malop})</option>
                  ))}
                </select>
              </div>
              <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: '1rem', gap: '10px' }}>
                <button className="btn btn-outline" onClick={() => setIsTransferModalOpen(false)}>Hủy</button>
                <button
                  className="btn btn-primary"
                  style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}
                  onClick={confirmTransfer}
                  disabled={!transferTargetClassId}
                >
                  Xác nhận chuyển lớp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {isFormOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal-content form-modal" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>{isEditMode ? 'Sửa Thông Tin Lớp' : 'Thêm Lớp Học Mới'}</h3>
              <button className="close-btn" onClick={() => setIsFormOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="modal-body form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="form-group">
                <label>Mã Lớp (Tự động)</label>
                <input type="text" name="malop" value={formData.malop} onChange={handleChange} required disabled={true} />
              </div>
              <div className="form-group">
                <label>Tên Lớp *</label>
                <input type="text" name="tenlop" value={formData.tenlop} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>Giảng viên phụ trách</label>
                <select name="manv" value={formData.manv || ''} onChange={handleChange}>
                  <option value="">-- Chọn Giảng viên --</option>
                  {teachers.map(t => (
                    <option key={t.manv} value={t.manv}>{t.tennv || t.manv}</option>
                  ))}
                </select>
              </div>

              {Array.from({ length: parseInt(config?.sonhanvientrogiang || '0', 10) }).map((_, i) => {
                const taField = `manv${i + 1}`;
                return (
                  <div className="form-group" key={taField}>
                    <label>Trợ giảng {i + 1}</label>
                    <select name={taField} value={formData[taField] || ''} onChange={handleChange}>
                      <option value="">-- Chọn Trợ giảng --</option>
                      {teachers.map(t => (
                        <option key={t.manv} value={t.manv}>{t.tennv || t.manv}</option>
                      ))}
                    </select>
                  </div>
                );
              })}

              <div className="form-group full-width" style={{ gridColumn: 'span 2' }}>
                <label>Học phí - Định mức thu</label>
                <textarea name="hocphi" placeholder="VD: 8 buổi - 1,000,000&#10;4 tháng - 4,400,000" value={formData.hocphi} onChange={handleChange} rows="5"></textarea>
              </div>


              <div className="form-actions full-width" style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setIsFormOpen(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">{isEditMode ? 'Lưu Thay Đổi' : 'Thêm Lớp'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Batch Notice Modal */}
      {isBatchNoticeOpen && createPortal(
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-content" style={{ maxWidth: '1200px', width: '98%', height: '90vh', overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 25px', borderBottom: '1px solid #e2e8f0', background: 'white' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <MessageSquare size={22} className="text-primary" />
                  Xuất Thông Báo Hàng Loạt - <span className="text-primary">{selectedClass?.tenlop}</span>
                </h3>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px', textAlign: 'left', fontWeight: 500 }}>
                  <span style={{ fontWeight: 700 }}>Giảng viên:</span> {teachers.find(t => t.manv === selectedClass?.manv)?.tennv || selectedClass?.manv || 'Chưa phân công'}
                </div>
              </div>
              <button className="close-btn" onClick={() => setIsBatchNoticeOpen(false)} style={{ padding: '8px', color: '#94a3b8' }}><X size={24} /></button>
            </div>

            <div className="modal-body" style={{ flex: 1, minHeight: 0, overflowY: 'hidden', padding: '20px', display: 'flex', flexDirection: 'column', gap: '1.5rem', background: '#fcfdfe' }}>

              {/* PHẦN 1: CÀI ĐẶT CHUNG - REARRANGED PER DRAWING */}
              <div style={{ background: '#ffffff', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '15px' }}>

                {/* Dòng 1: Tiêu đề & Chọn tháng */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', paddingBottom: '10px', borderBottom: '1px dashed #e2e8f0' }}>
                  <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    <CalendarDays size={14} /> Cấu hình chung
                  </h4>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid #e2e8f0', paddingLeft: '15px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', whiteSpace: 'nowrap' }}>THÁNG THÔNG BÁO:</span>
                    <button
                      onClick={() => handleBatchMonthChange(-1)}
                      style={{ width: '28px', height: '28px', border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: '6px', cursor: 'pointer', fontWeight: 900 }}
                    > &lt; </button>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#059669', minWidth: '90px', textAlign: 'center' }}>
                      {(() => {
                        const d = new Date(batchNoticeData.ngayBatDau);
                        return isNaN(d.getTime()) ? "??/????" : `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                      })()}
                    </div>
                    <button
                      onClick={() => handleBatchMonthChange(1)}
                      style={{ width: '28px', height: '28px', border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: '6px', cursor: 'pointer', fontWeight: 900 }}
                    > &gt; </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid #e2e8f0', paddingLeft: '15px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', whiteSpace: 'nowrap' }}>LỌC HÌNH THỨC:</span>
                    <select
                      value={batchHinhThucFilter}
                      onChange={(e) => setBatchHinhThucFilter(e.target.value)}
                      style={{
                        height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700,
                        color: '#0369a1', background: '#f0f9ff', fontSize: '0.8rem', outline: 'none', cursor: 'pointer'
                      }}
                    >
                      <option value="Tất cả">Tất cả hình thức</option>
                      {walletsConfig.length === 0 && <option value="Tiền mặt">Tiền mặt</option>}
                      {walletsConfig.map(w => (
                        <option key={w.id} value={w.name}>{w.name}</option>
                      ))}
                      {!walletsConfig.some(w => w.name === 'Tiền mặt') && <option value="Tiền mặt">Tiền mặt</option>}
                    </select>
                  </div>
                </div>

                {/* Dòng 2: Gói HP | Giảm HP | Ghi chú | Nút Áp dụng */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.2fr) 140px 1fr 180px', gap: '15px', alignItems: 'end' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '6px', display: 'block' }}>GÓI HỌC PHÍ MẪU</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', background: '#f8fafc', padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', minHeight: '42px', alignItems: 'center' }}>
                      {selectedClass?.hocphi ? String(selectedClass.hocphi).split('\n').filter(Boolean).map((opt, i) => {
                        const optLower = String(opt).toLowerCase();
                        const isBuoi = optLower.includes('buổi');
                        const isThang = optLower.includes('tháng');
                        const isKhoa = optLower.includes('khóa');
                        const isTuan = optLower.includes('tuần');
                        const sel = Array.isArray(config?.tinhhocphi?.selected) ? config.tinhhocphi.selected : ['khoa', 'buoi', 'thang', 'tuần'];
                        const isAllowed = (isBuoi && sel.includes('buoi')) ||
                          (isThang && sel.includes('thang')) ||
                          (isKhoa && sel.includes('khoa')) ||
                          (isTuan && sel.includes('tuần')) ||
                          (!isBuoi && !isThang && !isKhoa && !isTuan);
                        if (!isAllowed) return null;

                        const isActive = batchNoticeData.hocPhiOpt === opt;
                        return (
                          <span
                            key={i}
                            onClick={() => handleBatchNoticeFieldChange('hocPhiOpt', opt)}
                            style={{
                              padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', transition: '0.15s',
                              background: isActive ? '#3b82f6' : '#ffffff',
                              color: isActive ? '#ffffff' : '#475569',
                              border: `1px solid ${isActive ? '#2563eb' : '#cbd5e1'}`,
                            }}
                          >
                            {opt.trim()}
                          </span>
                        );
                      }) : <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>N/A</span>}
                    </div>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '6px', display: 'block' }}>GIẢM HỌC PHÍ (₫)</label>
                    <input
                      style={{ width: '100%', height: '42px', padding: '0 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 700, color: '#dc2626', textAlign: 'right', fontSize: '0.85rem' }}
                      type="text"
                      value={formatTuition(batchNoticeData.giamHocphi)}
                      onChange={e => handleBatchNoticeFieldChange('giamHocphi', e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '6px', display: 'block' }}>📝 GHI CHÚ THÔNG BÁO CHUNG</label>
                    <input
                      style={{ width: '100%', height: '42px', padding: '0 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                      type="text"
                      value={batchNoticeData.ghiChu}
                      onChange={e => handleBatchNoticeFieldChange('ghiChu', e.target.value)}
                      placeholder="VD: Thu học phí tháng mới..."
                    />
                  </div>

                  <button
                    onClick={handleApplyBatchNotice}
                    style={{
                      height: '42px', padding: '0 15px', borderRadius: '8px', background: '#10b981', color: '#fff',
                      border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap',
                      boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)'
                    }}
                  >
                    Áp dụng cho cả lớp
                  </button>
                </div>
              </div>

              {/* PHẦN 3: DANH SÁCH CHI TIẾT */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', fontWeight: 800, color: '#475569', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase' }}>
                  <Users size={16} /> Danh sách học sinh ({(batchStudentsData || []).filter(row => batchHinhThucFilter === 'Tất cả' || row.hinhthuc === batchHinhThucFilter).length})
                </h4>

                <div style={{ flex: 1, minHeight: 0, border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div className="inline-table batch-notice-table" style={{ height: '100%', overflow: 'auto', scrollbarWidth: 'thin' }}>
                    <table className="data-table" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                      <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <tr style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          <th style={{ width: '40px', padding: '12px' }}></th>
                          <th style={{ width: '40px' }}>STT</th>
                          <th style={{ width: '80px' }}>Mã HS</th>
                          <th style={{ minWidth: '160px' }}>Học Sinh</th>
                          <th style={{ minWidth: '130px' }}>Học phí</th>
                          <th style={{ minWidth: '130px' }}>Giảm HP</th>
                          <th style={{ width: '80px' }}>Nghỉ LT</th>
                          <th style={{ minWidth: '130px' }}>Trừ Tiền Ăn</th>
                          <th style={{ minWidth: '130px' }}>Trừ Học Phí</th>
                          <th style={{ minWidth: '130px' }}>TỔNG THU</th>
                          <th style={{ width: '130px' }}>Hình thức</th>
                          <th style={{ minWidth: '250px' }}>Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(batchStudentsData || [])
                          .filter(row => batchHinhThucFilter === 'Tất cả' || row.hinhthuc === batchHinhThucFilter)
                          .map((row, idx) => (
                            <tr key={row.mahv} style={{ fontSize: '0.85rem' }}>
                              <td style={{ padding: '8px' }}>
                                <button onClick={() => handleRemoveBatchStudent(row.mahv)} style={{ color: '#ef4444', background: '#fee2e2', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer' }}>
                                  <Trash2 size={14} />
                                </button>
                              </td>
                              <td style={{ color: '#64748b' }}>{idx + 1}</td>
                              <td style={{ fontWeight: 600, color: '#64748b' }}>#{row.mahv}</td>
                              <td style={{ fontWeight: 700, color: '#1e293b', textAlign: 'left' }}>{row.tenhv}</td>
                              <td>
                                <input
                                  type="text"
                                  value={formatTuition(row.hocphi)}
                                  onChange={e => handleBatchStudentChange(row.mahv, 'hocphi', e.target.value)}
                                  className="td-input"
                                  style={{ width: '100%', border: 'none', background: '#f1f5f9', borderRadius: '4px', padding: '4px', textAlign: 'right', fontWeight: 600 }}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={formatTuition(row.giamhocphi)}
                                  onChange={e => handleBatchStudentChange(row.mahv, 'giamhocphi', e.target.value)}
                                  className="td-input"
                                  style={{ width: '100%', border: 'none', background: '#f1f5f9', borderRadius: '4px', padding: '4px', textAlign: 'right', fontWeight: 600, color: '#dc2626' }}
                                />
                              </td>
                              <td style={{ fontWeight: 700, color: '#f59e0b' }}>{row.nghiLienTiep || 0} n</td>
                              <td>
                                <input
                                  type="text"
                                  value={formatTuition(row.truTienAn)}
                                  onChange={e => handleBatchStudentChange(row.mahv, 'truTienAn', e.target.value)}
                                  className="td-input"
                                  style={{ width: '100%', border: 'none', background: '#fef2f2', borderRadius: '4px', padding: '4px', textAlign: 'right', fontWeight: 600, color: '#ef4444' }}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={formatTuition(row.truHocPhi)}
                                  onChange={e => handleBatchStudentChange(row.mahv, 'truHocPhi', e.target.value)}
                                  className="td-input"
                                  style={{ width: '100%', border: 'none', background: '#fef2f2', borderRadius: '4px', padding: '4px', textAlign: 'right', fontWeight: 600, color: '#ef4444' }}
                                />
                              </td>
                              <td style={{ fontWeight: 800, color: '#16a34a', whiteSpace: 'nowrap' }}>{formatTuition(row.tongcong)}</td>
                              <td>
                                <select value={row.hinhthuc} onChange={e => handleBatchStudentChange(row.mahv, 'hinhthuc', e.target.value)} className="td-input" style={{ width: '100%', border: 'none', background: '#f1f5f9', borderRadius: '4px', padding: '4px' }}>
                                  {walletsConfig.length === 0 && <option value="Tiền mặt">Tiền mặt</option>}
                                  {walletsConfig.map(w => (
                                    <option key={w.id} value={w.name}>{w.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td><input type="text" value={row.ghichu} onChange={e => handleBatchStudentChange(row.mahv, 'ghichu', e.target.value)} className="td-input" style={{ width: '100%', border: 'none', background: '#f1f5f9', borderRadius: '4px', padding: '4px 8px' }} placeholder="..." /></td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '15px 25px', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#f8fafc' }}>
              <button className="btn btn-outline" onClick={() => setIsBatchNoticeOpen(false)} style={{ padding: '0 20px', height: '40px', fontWeight: 600 }}>Đóng lại</button>
              <button
                className="btn btn-success"
                onClick={handleConfirmBatchExport}
                disabled={isGenerating}
                style={{
                  padding: '0 30px', height: '40px', fontWeight: 800, background: '#2563eb', borderColor: '#2563eb',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
                }}
              >
                {isGenerating ? 'Đang xử lý...' : 'Xác Nhận Xuất Tất Cả'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* HIDDEN PRINT TEMPLATES FOR BATCH */}
      {noticesToPrint.length > 0 && (
        <div style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', overflow: 'hidden', opacity: 0.01, zIndex: -100, pointerEvents: 'none', background: '#ffffff' }}>
          {noticesToPrint.map((printHoaDon) => (
            <div key={printHoaDon.batchId} id={`batch-notice-${printHoaDon.batchId}`} className="print-a5-receipt" style={{ width: '800px', background: '#ffffff', padding: '30px', boxSizing: 'border-box', display: 'block', marginBottom: '50px' }}>
              {/* HEADER */}
              <div className="p-header" style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {/* LEFT: Logo */}
                <div style={{ width: '180px', textAlign: 'left' }}>
                  <img crossOrigin="anonymous" src={config?.logo || "/logo.png"} alt="logo" style={{ maxWidth: '160px', maxHeight: '100px', objectFit: 'contain' }} onError={(e) => { e.target.src = "/logo.png" }} />
                </div>

                {/* CENTER: Info */}
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, textTransform: 'uppercase' }}>
                    {config?.tencongty || 'E-Skills Academy'}
                  </h3>
                  <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Địa chỉ: {config?.diachicongty}</p>
                  <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Số điện thoại: {config?.sdtcongty}</p>
                </div>

                {/* RIGHT: Invoice info */}
                <div style={{ width: '150px', textAlign: 'right', fontSize: '14px' }}>
                  <div>Mã HD: <b style={{ fontWeight: 950 }}>{printHoaDon.mahd}</b></div>
                  <div>Ngày lập: <span style={{ fontWeight: 600 }}>{new Date(printHoaDon.ngaylap).toLocaleDateString("vi-VN")}</span></div>
                </div>
              </div>

              {/* TITLE */}
              <div style={{ textAlign: "center", fontWeight: "950", fontSize: "24pt", margin: "20px 0", color: '#000', textTransform: 'uppercase', textDecoration: 'underline' }}>
                THÔNG BÁO THU HỌC PHÍ
              </div>

              {/* INFO */}
              <div style={{ fontSize: "15pt", lineHeight: "1.9", color: '#000' }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>Họ và tên: <b style={{ fontWeight: 950, fontSize: '18pt' }}>{printHoaDon.tenhv}</b></div>
                  <div>Mã HS: <b style={{ fontWeight: 950, fontSize: '18pt' }}>{printHoaDon.mahv}</b></div>
                </div>

                {/* FEES BOX */}
                <div style={{
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: '16px',
                  padding: '24px',
                  marginTop: '15px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16pt', marginBottom: '10px', color: '#1e293b' }}>
                    <div style={{ fontWeight: 600 }}>Học phí:</div>
                    <div style={{ fontWeight: 900 }}>{printHoaDon.hocphiStr} đ</div>
                  </div>

                  {parseInt(String(printHoaDon.giamhocphi).replace(/\D/g, '')) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16pt', marginBottom: '10px', color: '#1e293b' }}>
                      <div style={{ fontWeight: 600 }}>Giảm trừ:</div>
                      <div style={{ fontWeight: 900 }}>{printHoaDon.giamhocphiStr} đ</div>
                    </div>
                  )}

                  {(parseInt(String(printHoaDon.truTienAn).replace(/\D/g, '')) > 0 || parseInt(String(printHoaDon.truHocPhi).replace(/\D/g, '')) > 0) && (
                    <>
                      <div style={{ borderTop: '1px solid #bae6fd', margin: '15px 0' }}></div>
                      {parseInt(String(printHoaDon.truTienAn).replace(/\D/g, '')) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15pt', marginBottom: '8px', color: '#475569' }}>
                          <div style={{ fontStyle: 'italic' }}>- Hoàn trả tiền ăn ({printHoaDon.nghiLienTiep}n):</div>
                          <div style={{ fontWeight: 700 }}>-{printHoaDon.truTienAnStr} đ</div>
                        </div>
                      )}
                      {parseInt(String(printHoaDon.truHocPhi).replace(/\D/g, '')) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15pt', color: '#475569' }}>
                          <div style={{ fontStyle: 'italic' }}>- Hoàn trả tiền học ({printHoaDon.nghiLienTiep}n):</div>
                          <div style={{ fontWeight: 700 }}>-{printHoaDon.truHocPhiStr} đ</div>
                        </div>
                      )}
                    </>
                  )}

                  <div style={{ borderTop: '2.5px solid #0369a1', margin: '18px 0 12px 0' }}></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '22pt', fontWeight: 900, color: '#0369a1' }}>
                    <div>TỔNG CỘNG:</div>
                    <div>{printHoaDon.tongcongStr} VNĐ</div>
                  </div>
                </div>

                <div style={{ marginTop: '20px', fontSize: '15pt', color: '#1e293b', lineHeight: '1.8' }}>
                  <div style={{ marginBottom: '5px' }}>Tháng đóng học phí/Thời lượng: <b style={{ fontWeight: 900 }}>{printHoaDon.thoiluong || "..."}</b></div>
                  {printHoaDon.diemDanhInfo && (
                    <div style={{ opacity: 0.9 }}>
                      Điểm danh ({printHoaDon.diemDanhInfo.statsPeriod}):
                      <span> Đi học: <b style={{ fontWeight: 900 }}>{printHoaDon.diemDanhInfo.diHoc}</b></span>,
                      <span> Nghỉ phép: <b style={{ fontWeight: 900 }}>{printHoaDon.diemDanhInfo.nghiPhep}</b></span>,
                      <span> Nghỉ KP: <b style={{ fontWeight: 900 }}>{printHoaDon.diemDanhInfo.nghiKP}</b></span>
                    </div>
                  )}
                  {printHoaDon.ghichu && (
                    <div style={{ marginTop: '10px' }}>Ghi chú: <b style={{ fontWeight: 800 }}>{printHoaDon.ghichu}</b></div>
                  )}
                </div>

                {/* QR SECTION */}
                {(() => {
                  const qrUrl = getNoticeQRUrl(printHoaDon);
                  if (!qrUrl) return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
                      <div style={{ fontWeight: '950', fontSize: '14pt' }}>Hình thức thanh toán: <span style={{ color: '#000' }}>{printHoaDon.hinhthuc}</span></div>
                    </div>
                  );
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', marginTop: '10px' }}>
                      <div style={{ fontWeight: '950', fontSize: '14pt', marginBottom: '10px', textAlign: 'right', width: '100%' }}>Hình thức thanh toán: <span style={{ color: '#000' }}>{printHoaDon.hinhthuc}</span></div>
                      <div style={{ textAlign: 'center' }}>
                        <img crossOrigin="anonymous" src={qrUrl} alt="Mã QR" style={{ width: '280px', height: '280px', borderRadius: '12px', border: '4px solid #000' }} />
                        <div style={{ fontSize: '12pt', textAlign: 'center', marginTop: '8px', color: '#000', fontWeight: 950 }}>QUÉT MÃ QR ĐỂ THANH TOÁN</div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* FOOTER */}
              <div style={{ marginTop: 20, fontSize: "15pt", display: "flex", justifyContent: "space-between", alignItems: 'flex-end' }}>
                <div style={{ lineHeight: '1.6' }}>
                  <b style={{ fontWeight: 950, fontSize: '17pt' }}>{config?.tencongty || 'E-Skills Academy'} </b><br />
                  Hotline: <b style={{ fontWeight: 900 }}>{config?.sdtcongty}</b><br />
                  Nhân viên thu tiền: <b style={{ fontWeight: 950 }}>{printHoaDon.manv || printHoaDon.nhanvien || 'Ban Tuyển Sinh'}</b>
                </div>
                <div style={{ textAlign: "right", fontSize: '12pt', fontStyle: 'italic', opacity: 0.8 }}>
                  (Ký tên / Xác nhận)
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Lesson Content Modal */}
      {isNoidungModalOpen && createPortal(
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-content" style={{ maxWidth: '800px', width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#db2777', color: 'white', padding: '8px', borderRadius: '8px' }}>
                  <FileText size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Nội dung dạy: {selectedClass?.tenlop}</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>Theo dõi tiến độ giảng dạy của lớp</p>
                </div>
              </div>
              <button className="close-btn" onClick={() => setIsNoidungModalOpen(false)}><X size={20} /></button>
            </div>

            <div className="modal-body" style={{ padding: '20px', overflowY: 'auto', flex: 1, background: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', background: 'white', padding: '12px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <label style={{ fontWeight: 600, color: '#334155' }}>Khoảng thời gian:</label>
                <select
                  value={noidungFilter}
                  onChange={(e) => setNoidungFilter(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', minWidth: '150px' }}
                >
                  <option value="this_week">Trong tuần này</option>
                  <option value="this_month">Trong tháng này</option>
                  <option value="last_month">Trong tháng trước</option>
                </select>
              </div>

              {noidungLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Đang tải dữ liệu...</div>
              ) : noidungList.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {noidungList.map((item) => (
                    <div key={item.id} style={{ background: 'white', padding: '15px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 700, color: '#2563eb', fontSize: '0.95rem' }}>
                          📅 {new Date(item.ngay).toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                      </div>
                      <div style={{ color: '#334155', lineHeight: '1.6', fontSize: '1rem', whiteSpace: 'pre-wrap' }}>
                        {item.noidungday || <i style={{ color: '#94a3b8' }}>Không có nội dung được ghi lại.</i>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '12px', border: '2px dashed #e2e8f0' }}>
                  <div style={{ color: '#94a3b8', marginBottom: '10px' }}><FileText size={48} strokeWidth={1} /></div>
                  <p style={{ color: '#64748b', fontSize: '1.1rem' }}>Chưa có nội dung dạy nào trong khoảng thời gian này.</p>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ padding: '15px 20px', borderTop: '1px solid #e2e8f0', textAlign: 'right', background: 'white' }}>
              <button className="btn btn-primary" onClick={() => setIsNoidungModalOpen(false)}>Đóng</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteOpen && createPortal(
        <div className="modal-overlay" style={{ zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content sm-modal" style={{ width: '400px', maxWidth: '95%', background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div className="modal-header delete-header" style={{ background: '#fef2f2', borderBottom: '1px solid #fee2e2' }}>
              <h3 style={{ color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trash2 size={20} /> Xác nhận xóa lớp học
              </h3>
              <button className="close-btn" onClick={() => setIsDeleteOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <p style={{ color: '#4b5563', marginBottom: '1.2rem', lineHeight: '1.5' }}>
                Bạn có chắc chắn muốn xóa lớp <strong>{selectedClass?.tenlop}</strong>? <br />
                Hành động này sẽ ẩn lớp khỏi hệ thống.
              </p>
              <div className="form-group">
                <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>Vui lòng nhập mật khẩu xác nhận:</label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Mật khẩu của bạn..."
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  onKeyDown={(e) => e.key === 'Enter' && confirmDelete()}
                  autoFocus
                />
              </div>
              <div className="form-actions" style={{ marginTop: '1.5rem', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={() => setIsDeleteOpen(false)}>Hủy bỏ</button>
                <button className="btn btn-danger" onClick={confirmDelete} style={{ background: '#dc2626', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 600 }}>Xác nhận xóa</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
