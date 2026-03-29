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
  malop: '', tenlop: '', hocphi: '', manv: '', daxoa: 'Đang Học', trutiennghi: 0
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
    const info = encodeURIComponent(`${hoaDon.mahv} Dong HP Thang ${formatMonthYear(hoaDon.ngaybatdau)}`);
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
    return students.filter(s => s.malop_list?.includes(selectedClassId) && (s.trangthai === 'Đang Học' || s.trangthai === 'Bảo Lưu'));
  }, [students, selectedClassId]);

  useEffect(() => {
    const fetchContractsForClass = async () => {
      const stdIds = classStudents.map(s => s.mahv);
      if (stdIds.length > 0) {
        try {
          const { data, error } = await supabase
            .from('tbl_hd')
            .select('mahv, ngaybatdau, ngayketthuc, ngaylap')
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
    const activeStudents = classStudents.filter(s => s.trangthai === 'Đang Học');
    if (activeStudents.length === 0) return showMessage('error', 'Lớp này không có học viên nào Đang Học để gửi thông báo');

    try {
      setIsBatchNoticeOpen(true);
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

    const startStr = new Date().toISOString().split('T')[0];

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

    // Initialize batchStudentsData with per-student end dates
    const initData = activeStudents.map(s => {
      let finalKetThuc = '';
      const stSchedRaw = selectedClass?.thoigianbieu || '';
      const activeDays = parseScheduleDays(stSchedRaw);

      if (initLoaiDong === 'Tháng' || initLoaiDong === 'Khóa') {
        const d = new Date(startStr);
        d.setMonth(d.getMonth() + initSoLuong);
        finalKetThuc = d.toISOString().split('T')[0];
      } else if (initLoaiDong === 'Tuần') {
        const d = new Date(startStr);
        d.setDate(d.getDate() + initSoLuong * 7);
        finalKetThuc = d.toISOString().split('T')[0];
      } else if (initLoaiDong === 'Buổi' && activeDays.length > 0) {
        finalKetThuc = calculateEndDateBySessions(startStr, initSoLuong, activeDays);
      }

      return {
        mahv: s.mahv,
        tenhv: s.tenhv,
        sobuoihoc: `${initSoLuong} ${initLoaiDong.toLowerCase()}`,
        hocphi: initHocPhi,
        giamhocphi: 0,
        tongcong: initHocPhi,
        ngaybatdau: startStr,
        ngayketthuc: finalKetThuc,
        hinhthuc: walletsConfig[0]?.name || 'Tiền mặt',
        ghichu: '',
        thoigianbieu: stSchedRaw
      };
    });
      setBatchStudentsData(initData);
    } catch (err) {
      console.error('Lỗi mở thông báo hàng loạt:', err);
      showMessage('error', 'Đã xảy ra lỗi khi chuẩn bị thông báo: ' + err.message);
      setIsBatchNoticeOpen(false);
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

  const handleApplyBatchNotice = () => {
    let hpNumber = 0;
    if (batchNoticeData.hocPhiOpt) {
      const numbers = String(batchNoticeData.hocPhiOpt).replace(/,/g, '').match(/\d{4,}/g);
      if (numbers) {
        hpNumber = Math.max(...numbers.map(Number));
      }
    }

    setBatchStudentsData(prev => (prev || []).map(item => {
      let sobuoi = `${batchNoticeData.soLuong} ${batchNoticeData.loaiDong.toLowerCase()}`;
      const tc = Math.max(0, hpNumber - (parseInt(batchNoticeData.giamHocphi) || 0));

      let finalKetThuc = '';
      const activeDays = parseScheduleDays(item.thoigianbieu);
      const unit = (batchNoticeData.loaiDong || '').toLowerCase().trim();

      if (unit.includes('tháng') || unit.includes('khóa')) {
        const d = new Date(batchNoticeData.ngayBatDau);
        d.setMonth(d.getMonth() + (parseInt(batchNoticeData.soLuong) || 1));
        finalKetThuc = d.toISOString().split('T')[0];
      } else if (unit.includes('tuần')) {
        const d = new Date(batchNoticeData.ngayBatDau);
        d.setDate(d.getDate() + (parseInt(batchNoticeData.soLuong) || 1) * 7);
        finalKetThuc = d.toISOString().split('T')[0];
      } else if (unit.includes('buổi') && activeDays.length > 0) {
        finalKetThuc = calculateEndDateBySessions(batchNoticeData.ngayBatDau, (parseInt(batchNoticeData.soLuong) || 1), activeDays);
      } else {
        finalKetThuc = batchNoticeData.ngayKetThuc;
      }

      return {
        ...item,
        hocphi: hpNumber,
        giamhocphi: batchNoticeData.giamHocphi || 0,
        hinhthuc: batchNoticeData.hinhThuc,
        ngaybatdau: batchNoticeData.ngayBatDau,
        ngayketthuc: finalKetThuc,
        ghichu: batchNoticeData.ghiChu,
        tongcong: tc,
        sobuoihoc: sobuoi
      };
    }));
  };

  const handleBatchStudentChange = (mahv, field, value) => {
    setBatchStudentsData(prev => (prev || []).map(item => {
      if (item.mahv === mahv) {
        let cleanVal = value;
        if (field === 'hocphi' || field === 'giamhocphi') {
          cleanVal = parseFormattedNumber(value);
        }
        let newItem = { ...item, [field]: cleanVal };
        if (field === 'hocphi' || field === 'giamhocphi') {
          const hp = parseInt(newItem.hocphi || 0);
          const ghp = parseInt(newItem.giamhocphi || 0);
          newItem.tongcong = Math.max(0, hp - ghp);
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
      const recordsToInsert = [];
      const currentNotices = [];
      const localNow = new Date(new Date() - new Date().getTimezoneOffset() * 60000).toISOString();

      const { data: recentTB } = await supabase.from('tbl_thongbao').select('mahd').order('mahd', { ascending: false }).limit(1);
      let nextNum = 1;
      if (recentTB && recentTB.length > 0 && recentTB[0].mahd) {
        const numPart = recentTB[0].mahd.replace(/\D/g, '');
        if (!isNaN(parseInt(numPart, 10))) nextNum = parseInt(numPart, 10) + 1;
      }

      for (let i = 0; i < batchStudentsData.length; i++) {
        const row = batchStudentsData[i];
        const newMaHD = `TB${String(nextNum + i).padStart(5, '0')}`;

        const insertData = {
          mahd: newMaHD,
          ngaylap: localNow,
          mahv: row.mahv,
          tenlop: selectedClass?.tenlop || '',
          ngaybatdau: row.ngaybatdau || null,
          ngayketthuc: row.ngayketthuc || null,
          manv: 'Hệ thống',
          hocphi: formatTuition(row.hocphi),
          giamhocphi: formatTuition(row.giamhocphi),
          phuthu: null,
          tongcong: formatTuition(row.tongcong),
          dadong: '0',
          conno: formatTuition(row.tongcong),
          hinhthuc: row.hinhthuc,
          ghichu: row.ghichu,
          daxoa: null,
          malop: selectedClass?.malop || ''
        };
        recordsToInsert.push(insertData);

        currentNotices.push({
          ...row,
          ...insertData,
          sdt: students.find(s => s.mahv === row.mahv)?.sdt || ''
        });
      }

      const { error } = await supabase.from('tbl_thongbao').insert(recordsToInsert);
      if (error) throw error;

      setNoticesToPrint(currentNotices);
    } catch (err) {
      console.error(err);
      if (err.code === '42P01') showMessage('error', 'Chưa có bảng tbl_thongbao trong CSDL để lưu trữ.');
      else showMessage('error', 'Lỗi lưu thông báo hàng loạt: ' + err.message);
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
            const node = document.getElementById(`print-notice-${i}`);
            if (node) {
              // Bring it "visually" to the viewport but almost transparent
              node.style.position = 'fixed';
              node.style.top = '0';
              node.style.left = '0';
              node.style.zIndex = '9999';
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
                  link.download = `ThongBao_${noticesToPrint[i].tenhv}_${noticesToPrint[i].mahd}.png`;
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
                    link.download = `ThongBao_${noticesToPrint[i].tenhv}_${noticesToPrint[i].mahd}_retry.png`;
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
        ...formData,
        trutiennghi: parseInt(String(formData.trutiennghi || '0').replace(/,/g, ''), 10) || 0
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
      return showMessage('error', 'Không thể xóa lớp đang có học viên. Vui lòng chuyển lớp cho học viên trước.');
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
      // Chuyển học viên sang lớp mới bằng cách update cột malop trong tbl_hv
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
    if (classStudents.length === 0) return showMessage('error', 'Lớp này hiện không có học viên');
    const cleanStudents = classStudents.map(s => {

      const latestHd = contracts
        .filter(c => c.mahv === s.mahv)
        .sort((a, b) => new Date(b.ngaylap) - new Date(a.ngaylap))[0];

      return {
        mahv: s.mahv || '',
        tenhv: s.tenhv || '',
        sdt: s.sdt || '',
        trangthai: s.trangthai || '',
        ngaybatdau: latestHd?.ngaybatdau || '',
        ngayketthuc: latestHd?.ngayketthuc || ''
      };
    });
    const ws = XLSX.utils.json_to_sheet(cleanStudents);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Học Viên - ${selectedClass?.tenlop || 'Lớp'}`);
    XLSX.writeFile(wb, `DS_HocVien_${selectedClass?.malop || 'Lop'}.xlsx`);
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
                          <span>Sĩ số: {students.filter(s => s.malop_list?.includes(c.malop) && (s.trangthai === 'Đang Học' || s.trangthai === 'Bảo Lưu')).length} HV</span>
                          <span>GV: {teacherName}</span>
                          <span>Lịch: {c.thoigianbieu || '-'}</span>
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
                  <h3>Danh sách học viên ({classStudents.length})</h3>
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
                        <th>Mã HV</th>
                        <th>Tên Học Viên</th>
                        <th>Trạng Thái</th>
                        <th>Ngày Bắt Đầu</th>
                        <th>Ngày Kết Thúc</th>
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
                                  <button className="tm-btn-icon text-primary" title="Xem chi tiết học viên" onClick={() => handleOpenViewStudent(s)}>
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
                                <span className={`status-badge ${s.trangthai === 'Đang Học' ? 'active' :
                                  (s.trangthai === 'Bảo Lưu' ? 'warning' : 'inactive')
                                  }`}>
                                  {s.trangthai || 'Chưa cập nhật'}
                                </span>
                              </td>
                              <td>{latestHd?.ngaybatdau ? new Date(latestHd.ngaybatdau).toLocaleDateString('vi-VN') : '-'}</td>
                              <td>{latestHd?.ngayketthuc ? new Date(latestHd.ngayketthuc).toLocaleDateString('vi-VN') : '-'}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="7" className="empty-state">Lớp chưa có học viên nào</td>
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

                            <span className={`status-badge ${s.trangthai === 'Đang Học'
                              ? 'active'
                              : s.trangthai === 'Bảo Lưu'
                                ? 'warning'
                                : 'inactive'
                              }`}>
                              {s.trangthai || 'Chưa cập nhật'}
                            </span>
                          </div>

                          <div className="student-info">
                            <span>STT: {idx + 1}</span>
                            <span>{selectedClass?.tenlop}</span>
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
                    <div className="empty-state">Lớp chưa có học viên nào</div>
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
                <User size={20} /> Chi tiết thông tin Học Viên
              </h3>
              <button className="close-btn" onClick={() => setIsViewStudentOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body form-grid column-2">
              <div className="form-group">
                <label>Mã HV</label>
                <input type="text" value={viewStudentData.mahv} disabled />
              </div>
              <div className="form-group">
                <label>Tên Học Viên</label>
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
                <ArrowRightLeft size={20} /> Chuyển lớp cho học viên
              </h3>
              <button className="close-btn" onClick={() => setIsTransferModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', color: '#475569' }}>
                Học viên: <strong style={{ color: '#10b981' }}>{transferringStudent.tenhv}</strong> (Mã: {transferringStudent.mahv})
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
                  {classes.filter(c => !transferringStudent.malop_list?.includes(c.malop)).map(c => (
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

              {config?.trutiennghi && (
                <div className="form-group full-width" style={{ gridColumn: 'span 2', background: '#fff1f2', padding: '10px', borderRadius: '8px', border: '1px solid #fecdd3' }}>
                  <label style={{ color: '#be123c', fontWeight: 700 }}>Tiền trừ mỗi buổi nghỉ (Nghỉ có phép)</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      name="trutiennghi"
                      value={formatTuition(formData.trutiennghi || 0)}
                      onChange={handleChange}
                      placeholder="VD: 50,000"
                      style={{ paddingRight: '35px', fontWeight: 700, color: '#be123c' }}
                    />
                    <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#be123c', fontWeight: 700 }}>₫</span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#e11d48', marginTop: '4px' }}>* Chỉ tự động trừ khi xuất hóa đơn nếu học viên có nghỉ phép trong chu kỳ.</p>
                </div>
              )}
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
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '15px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>
                    Thêm Thông Báo Hàng Loạt - <span className="text-primary">{selectedClass?.tenlop}</span>
                </h3>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px', textAlign: 'left' }}>
                  <span style={{ fontWeight: 600 }}>Giảng viên:</span> {teachers.find(t => t.manv === selectedClass?.manv)?.tennv || selectedClass?.manv || 'Chưa phân công'}
                </div>
              </div>
              <button className="close-btn" onClick={() => setIsBatchNoticeOpen(false)} style={{ padding: '8px' }}><X size={24} /></button>
            </div>

            <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Top Form (Compact) */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* HÀNG 1: ĐÓNG THEO, SỐ LƯỢNG, NGÀY BẮT ĐẦU, NGÀY KẾT THÚC */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.5fr 1.5fr', gap: '12px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>ĐÓNG THEO</label>
                      <select value={batchNoticeData.loaiDong} onChange={e => handleBatchNoticeFieldChange('loaiDong', e.target.value)}>
                        {(!config?.tinhhocphi || (Array.isArray(config.tinhhocphi.selected) && config.tinhhocphi.selected.includes('thang'))) && <option value="Tháng">Tháng</option>}
                        {(!config?.tinhhocphi || (Array.isArray(config.tinhhocphi.selected) && config.tinhhocphi.selected.includes('khoa'))) && <option value="Khóa">Khóa</option>}
                        {(!config?.tinhhocphi || (Array.isArray(config.tinhhocphi.selected) && config.tinhhocphi.selected.includes('buoi'))) && <option value="Buổi">Buổi</option>}
                        {(!config?.tinhhocphi || (Array.isArray(config.tinhhocphi.selected) && config.tinhhocphi.selected.includes('tuần'))) && <option value="Tuần">Tuần</option>}
                      </select>
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>SỐ LƯỢNG</label>
                      <input type="number" min="1" value={batchNoticeData.soLuong} onChange={e => handleBatchNoticeFieldChange('soLuong', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>NGÀY BẮT ĐẦU</label>
                      <input type="date" value={batchNoticeData.ngayBatDau} onChange={e => handleBatchNoticeFieldChange('ngayBatDau', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>NGÀY KẾT THÚC</label>
                      <input type="date" value={batchNoticeData.ngayKetThuc} onChange={e => handleBatchNoticeFieldChange('ngayKetThuc', e.target.value)} />
                    </div>
                  </div>

                  {/* HÀNG 2: HỌC PHÍ MẪU, GIẢM HỌC PHÍ, HÌNH THỨC */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>HỌC PHÍ MẪU</label>
                      <select value={batchNoticeData.hocPhiOpt} onChange={e => handleBatchNoticeFieldChange('hocPhiOpt', e.target.value)}>
                        <option value="">-- Chọn gói học phí --</option>
                        {selectedClass?.hocphi && String(selectedClass.hocphi).split('\n').filter(Boolean).map((opt, i) => {
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
                            (!isBuoi && !isThang && !isKhoa && !isTuan); // fallback for untyped packages
                          if (!isAllowed) return null;
                          return <option key={i} value={opt}>{opt}</option>;
                        })}
                      </select>
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>GIẢM HP (₫)</label>
                      <input
                        type="text"
                        value={formatTuition(batchNoticeData.giamHocphi)}
                        onChange={e => handleBatchNoticeFieldChange('giamHocphi', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'ArrowUp') {
                            handleBatchNoticeFieldChange('giamHocphi', (batchNoticeData.giamHocphi || 0) + 50000);
                            e.preventDefault();
                          } else if (e.key === 'ArrowDown') {
                            handleBatchNoticeFieldChange('giamHocphi', Math.max(0, (batchNoticeData.giamHocphi || 0) - 50000));
                            e.preventDefault();
                          }
                        }}
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>HÌNH THỨC</label>
                      <select value={batchNoticeData.hinhThuc} onChange={e => handleBatchNoticeFieldChange('hinhThuc', e.target.value)}>
                        {walletsConfig.length === 0 && <option value="Tiền mặt">Tiền mặt</option>}
                        {walletsConfig.map(w => (
                          <option key={w.id} value={w.name}>{w.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* HÀNG 3: GHI CHÚ, ÁP DỤNG HÀNG LOẠT */}
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>GHI CHÚ HÀNG LOẠT</label>
                      <input type="text" value={batchNoticeData.ghiChu} onChange={e => handleBatchNoticeFieldChange('ghiChu', e.target.value)} placeholder="Ghi chú thống nhất (Vd: Thu học phí T8)..." style={{ height: '36px' }} />
                    </div>
                    <button className="btn btn-primary" onClick={handleApplyBatchNotice} style={{ padding: '0 25px', height: '36px', minWidth: '180px', fontWeight: 700, borderRadius: '8px' }}>
                      Áp dụng hàng loạt
                    </button>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="inline-table" style={{ flex: 1, minHeight: '300px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table className="data-table">
                  <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 10 }}>
                    <tr style={{ fontSize: '0.8rem' }}>
                      <th style={{ width: '40px' }}></th>
                      <th>STT</th>
                      <th>Mã HV</th>
                      <th style={{ minWidth: '150px' }}>Tên HV</th>
                      <th style={{ minWidth: '85px' }}>Số buổi</th>
                      <th style={{ minWidth: '135px' }}>Học phí</th>
                      <th style={{ minWidth: '125px' }}>Giảm HP</th>
                      <th style={{ minWidth: '125px' }}>Tổng thu</th>
                      <th style={{ minWidth: '115px' }}>Bắt đầu</th>
                      <th style={{ minWidth: '115px' }}>Kết thúc</th>
                      <th style={{ minWidth: '140px' }}>Hình thức</th>
                      <th style={{ minWidth: '140px' }}>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(batchStudentsData || []).map((row, idx) => (
                      <tr key={row.mahv} style={{ fontSize: '0.85rem' }}>
                        <td>
                          <button className="btn" title="Xóa" onClick={() => handleRemoveBatchStudent(row.mahv)} style={{ color: '#ef4444', padding: '4px', background: 'transparent' }}>
                            <Trash2 size={16} />
                          </button>
                        </td>
                        <td>{idx + 1}</td>
                        <td>{row.mahv}</td>
                        <td style={{ fontWeight: 600, color: '#1e293b', textAlign: 'left' }}>{row.tenhv}</td>
                        <td>
                          <input type="text" value={row.sobuoihoc} onChange={e => handleBatchStudentChange(row.mahv, 'sobuoihoc', e.target.value)} className="td-input" style={{ padding: '4px' }} />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={formatTuition(row.hocphi)}
                            onChange={e => handleBatchStudentChange(row.mahv, 'hocphi', e.target.value)}
                            className="td-input"
                            style={{ padding: '4px' }}
                            onKeyDown={e => {
                              if (e.key === 'ArrowUp') {
                                handleBatchStudentChange(row.mahv, 'hocphi', (row.hocphi || 0) + 50000);
                                e.preventDefault();
                              } else if (e.key === 'ArrowDown') {
                                handleBatchStudentChange(row.mahv, 'hocphi', Math.max(0, (row.hocphi || 0) - 50000));
                                e.preventDefault();
                              }
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={formatTuition(row.giamhocphi)}
                            onChange={e => handleBatchStudentChange(row.mahv, 'giamhocphi', e.target.value)}
                            className="td-input"
                            style={{ padding: '4px' }}
                            onKeyDown={e => {
                              if (e.key === 'ArrowUp') {
                                handleBatchStudentChange(row.mahv, 'giamhocphi', (row.giamhocphi || 0) + 50000);
                                e.preventDefault();
                              } else if (e.key === 'ArrowDown') {
                                handleBatchStudentChange(row.mahv, 'giamhocphi', Math.max(0, (row.giamhocphi || 0) - 50000));
                                e.preventDefault();
                              }
                            }}
                          />
                        </td>
                        <td className="font-bold text-success" style={{ whiteSpace: 'nowrap' }}>{formatTuition(row.tongcong)}</td>
                        <td><input type="date" value={row.ngaybatdau} onChange={e => handleBatchStudentChange(row.mahv, 'ngaybatdau', e.target.value)} className="td-input" style={{ padding: '4px' }} /></td>
                        <td><input type="date" value={row.ngayketthuc} onChange={e => handleBatchStudentChange(row.mahv, 'ngayketthuc', e.target.value)} className="td-input" style={{ padding: '4px' }} /></td>
                        <td>
                          <select value={row.hinhthuc} onChange={e => handleBatchStudentChange(row.mahv, 'hinhthuc', e.target.value)} className="td-input" style={{ padding: '4px' }}>
                            {walletsConfig.length === 0 && <option value="Tiền mặt">Tiền mặt</option>}
                            {walletsConfig.map(w => (
                              <option key={w.id} value={w.name}>{w.name}</option>
                            ))}
                          </select>
                        </td>
                        <td><input type="text" value={row.ghichu} onChange={e => handleBatchStudentChange(row.mahv, 'ghichu', e.target.value)} className="td-input" style={{ padding: '4px' }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: '#f8fafc' }}>
              <button className="btn btn-outline" onClick={() => setIsBatchNoticeOpen(false)}>Hủy bỏ</button>
              <button className="btn btn-success" onClick={handleConfirmBatchExport} disabled={isGenerating} style={{ padding: '0 25px' }}>
                {isGenerating ? 'Đang xuất và tạo hình ảnh...' : 'Xác Nhận Xuất Hàng Loạt'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* HIDDEN PRINT TEMPLATES FOR BATCH */}
      {noticesToPrint.length > 0 && (
        <div style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', overflow: 'hidden', opacity: 0.01, zIndex: -100, pointerEvents: 'none', background: '#ffffff' }}>
          {noticesToPrint.map((printHoaDon, idx) => (
            <div key={idx} id={`print-notice-${idx}`} className="print-a5-receipt" style={{ width: '800px', background: '#ffffff', padding: '30px', boxSizing: 'border-box', display: 'block', marginBottom: '50px' }}>
              {/* HEADER */}
              <div className="p-header" style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ textAlign: 'left' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>
                    {config?.tencongty || 'E-Skills Academy'}
                  </h3>
                  <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: 800 }}>{config?.diachicongty}</p>
                  <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: 800 }}>SĐT/Zalo: {config?.sdtcongty}</p>
                </div>
                <div style={{ textAlign: 'right', fontSize: '14px', fontWeight: 800 }}>
                  <div>Mã HD: <b style={{ fontWeight: 950 }}>{printHoaDon.mahd}</b></div>
                  <div>Ngày lập: <b style={{ fontWeight: 900 }}>{new Date(printHoaDon.ngaylap).toLocaleDateString("vi-VN")}</b></div>
                  <img crossOrigin="anonymous" src={config?.logo || "/logo.png"} alt="logo" style={{ width: 100, marginTop: 5 }} onError={(e) => { e.target.src = "/logo.png" }} />
                </div>
              </div>

              {/* TITLE */}
              <div style={{ textAlign: "center", fontWeight: "950", fontSize: "24pt", margin: "20px 0", color: '#000', textTransform: 'uppercase', textDecoration: 'underline' }}>
                THÔNG BÁO THU HỌC PHÍ
              </div>

              {/* INFO */}
              <div style={{ fontSize: "15pt", lineHeight: "1.9", color: '#000' }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>Họ và tên: <b style={{ fontWeight: 950 }}>{printHoaDon.tenhv}</b></div>
                  <div>SĐT: <b style={{ fontWeight: 900 }}>{printHoaDon.sdt || ""}</b></div>
                </div>

                <div>
                  Khóa học: <b style={{ fontWeight: 900 }}>{printHoaDon.tenlop}</b>
                </div>

                {printHoaDon.sobuoihoc && (
                  <div>
                    Số buổi/Thời lượng: <b style={{ fontWeight: 900 }}>{printHoaDon.sobuoihoc}</b>
                  </div>
                )}

                <div>
                  Thời lượng:{" "}
                  từ <b style={{ fontWeight: 900 }}>{printHoaDon.ngaybatdau ? new Date(printHoaDon.ngaybatdau).toLocaleDateString("vi-VN") : "..."}</b>{" "}
                  đến <b style={{ fontWeight: 900 }}>{printHoaDon.ngayketthuc ? new Date(printHoaDon.ngayketthuc).toLocaleDateString("vi-VN") : "..."}</b>
                </div>

                {/* FEES */}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: '2px solid #000', marginTop: '15px', paddingTop: '10px' }}>
                  <div>Học phí: <b style={{ fontWeight: 900 }}>{printHoaDon.hocphi}</b></div>
                  <div>Giảm HP: <b style={{ fontWeight: 900 }}>{printHoaDon.giamhocphi}</b></div>
                  <div>Nợ cũ: <b style={{ fontWeight: 800 }}>0 đ</b></div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "950", borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '15px', fontSize: '16pt' }}>
                  <div>Tổng cộng: <b style={{ fontWeight: 950 }}>{printHoaDon.tongcong}</b></div>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  Ghi chú: <b style={{ fontWeight: 800 }}>{printHoaDon.ghichu || ""}</b>
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
