import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Search, Receipt, User, BookOpen, Wallet, GraduationCap, AlertCircle, CheckCircle, X, MessageSquare, Plus, CreditCard } from 'lucide-react';
import { toPng } from 'html-to-image';
import './InvoiceManager.css';
import { useConfig } from '../ConfigContext';



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

const formatMonthYear = (dateStr) => {
   if (!dateStr) return '';
   const d = new Date(dateStr);
   return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const calculateThoiluong = (inv) => {
   if (!inv.ngayBatDau) return '';
   const SL = parseInt(inv.soLuong) || 1;
   const unit = (inv.loaiDong || '').toLowerCase();
   const start = new Date(inv.ngayBatDau);

   if (unit.includes('tháng') && SL > 1) {
      const months = [];
      for (let i = 0; i < SL; i++) {
         const d = new Date(start);
         d.setMonth(start.getMonth() + i);
         months.push(`${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
      }
      return months.join(', ');
   }
   return `${String(start.getMonth() + 1).padStart(2, '0')}/${start.getFullYear()}`;
};

const getQRUrl = (hoaDon, walletsConfig) => {
   if (!walletsConfig || !hoaDon.hinhthuc) return null;
   const hinhThucTrim = String(hoaDon.hinhthuc).trim();
   const matchedWallet = walletsConfig.find(w => String(w.name).trim() === hinhThucTrim);
   if (matchedWallet && matchedWallet.bankId && matchedWallet.accNo) {
      const amountStr = (hoaDon.tongcong || "0").toString().replace(/\D/g, "");

      let suffix = '';
      if (hoaDon.tenhv) {
         const parts = hoaDon.tenhv.trim().split(' ');
         suffix = parts.length >= 2 ? ' ' + parts.slice(-2).join(' ') : ' ' + hoaDon.tenhv;
      }

      const info = encodeURIComponent(`${hoaDon.mahv}${hoaDon.tenhv}`);
      return `https://img.vietqr.io/image/${matchedWallet.bankId}-${matchedWallet.accNo}-compact2.png?amount=${amountStr}&addInfo=${info}&accountName=${encodeURIComponent(matchedWallet.accName || '')}`;
   }
   return null;
};

const calculateEndDateBySessions = (startDateStr, numSessions, activeDays) => {
   if (!startDateStr || !numSessions || activeDays.length === 0) return '';
   let current = new Date(startDateStr);
   let sessionsFound = 0;
   let maxDaysToCheck = 3650;

   while (sessionsFound < numSessions && maxDaysToCheck > 0) {
      if (activeDays.includes(current.getDay())) {
         sessionsFound++;
         if (sessionsFound === parseInt(numSessions, 10)) {
            break;
         }
      }
      current.setDate(current.getDate() + 1);
      maxDaysToCheck--;
   }
   if (sessionsFound > 0) {
      return current.toISOString().split('T')[0];
   }
   return '';
};

const calculateConsecutiveLeave = (attendance) => {
   if (!attendance || attendance.length === 0) return [];

   // Filter for excused leave and sort by date
   const excusedLeaveDays = attendance
      .filter(att => (att.trangthai || '').trim().toLowerCase() === 'nghỉ phép')
      .map(att => {
         const d = new Date(att.ngay);
         d.setHours(0, 0, 0, 0); // Normalize time
         return d;
      })
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
         // Check if the middle day is a Sunday (0)
         const middleDay = new Date(prev);
         middleDay.setDate(prev.getDate() + 1);
         if (middleDay.getDay() === 0) {
            isConsecutive = true;
         }
      }

      if (isConsecutive) {
         currentGroup.push(curr);
      } else {
         if (currentGroup.length >= 6) {
            groups.push([...currentGroup]);
         }
         currentGroup = [curr];
      }
   }

   if (currentGroup.length >= 6) {
      groups.push(currentGroup);
   }

   return groups.map(g => ({
      ngay_bat_dau_nghi: g[0].toISOString().split('T')[0],
      ngay_ket_thuc_nghi: g[g.length - 1].toISOString().split('T')[0],
      so_ngay_nghi_lien_tuc: g.length
   }));
};

export default function InvoiceManager() {
   const { config } = useConfig();
   const walletsConfig = (config ? [
      { id: 'vi1', name: config.vi1?.name || '', bankId: config.vi1?.bankId || '', accNo: config.vi1?.accNo || '', accName: config.vi1?.accName || '' },
      { id: 'vi2', name: config.vi2?.name || '', bankId: config.vi2?.bankId || '', accNo: config.vi2?.accNo || '', accName: config.vi2?.accName || '' },
      { id: 'vi3', name: config.vi3?.name || '', bankId: config.vi3?.bankId || '', accNo: config.vi3?.accNo || '', accName: config.vi3?.accName || '' },
      { id: 'vi4', name: config.vi4?.name || '', bankId: config.vi4?.bankId || '', accNo: config.vi4?.accNo || '', accName: config.vi4?.accName || '' }
   ].filter(w => w.name && w.name.trim() !== '') : []);

   const [students, setStudents] = useState([]);
   const [classes, setClasses] = useState([]);
   const [employees, setEmployees] = useState([]);
   const [searchTerm, setSearchTerm] = useState('');
   const [selectedStudent, setSelectedStudent] = useState(null);
   const [activeClass, setActiveClass] = useState(null);
   const [classTeacher, setClassTeacher] = useState(null);

   const [isSaving, setIsSaving] = useState(false);
   const [message, setMessage] = useState({ type: '', text: '' });
   const [warningModal, setWarningModal] = useState({ isOpen: false, title: '', message: '' });
   const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
   const [downloadingInvoice, setDownloadingInvoice] = useState(null);
   const [downloadingNotice, setDownloadingNotice] = useState(null);
   const [previewImg, setPreviewImg] = useState(null);
   const [studySummary, setStudySummary] = useState(null);
   const [refundOverrides, setRefundOverrides] = useState({ meal: null, tuition: null });
   const [recentSourceText, setRecentSourceText] = useState('');
   const [showMobileDetails, setShowMobileDetails] = useState(false);
   const [invoiceData, setInvoiceData] = useState({
      loaiDong: 'Tháng',
      soLuong: 1,
      ngayBatDau: (() => {
         const now = new Date();
         const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
         return new Date(firstDay.getTime() - firstDay.getTimezoneOffset() * 60000).toISOString().split('T')[0];
      })(),
      ngayKetThuc: '',
      hocphi: 0,
      donGia: 0,
      giamHocphi: 0,
      discountPercent: 0,
      daDong: 0,
      hinhThuc: (config && (config.vi1?.name || config.vi2?.name || config.vi3?.name || config.vi4?.name)) ? (config.vi1?.name || config.vi2?.name || config.vi3?.name || config.vi4?.name) : 'Tiền mặt',
      ghiChu: '',
      phuthu: []
   });

   const auth = JSON.parse(localStorage.getItem('auth_session') || '{}');
   const cashier = auth.user?.tennv || auth.user?.username || 'Thu Ngân';

   const [noCu, setNoCu] = useState(0);
   const [unpaidBills, setUnpaidBills] = useState([]);
   const [unpaidBillsTotal, setUnpaidBillsTotal] = useState(0);

   const fetchBaseData = async () => {
      try {
         const { data: stRaw } = await supabase.from('tbl_hv').select('*').neq('trangthai', 'Đã Nghỉ').order('tenhv', { ascending: true });
         const { data: cls } = await supabase.from('tbl_lop').select('*').neq('daxoa', 'Đã Xóa');
         const { data: emp } = await supabase.from('tbl_nv').select('*');

         const st = (stRaw || []).map(s => ({
            ...s,
            malop_list: s.malop ? [s.malop] : []
         }));

         setStudents(st || []);
         setClasses(cls || []);
         setEmployees(emp || []);
      } catch (err) {
         console.error(err);
      }
   };

   useEffect(() => {
      fetchBaseData();
   }, []);

   useEffect(() => {
      if (downloadingInvoice) {
         const processPng = async () => {
            try {
               await new Promise(r => setTimeout(r, 1000));
               const node = document.getElementById('download-invoice-node');
               if (node) {
                  // Capture setup: force visible and at top
                  node.style.position = 'fixed';
                  node.style.top = '0';
                  node.style.left = '0';
                  node.style.zIndex = '9999';
                  node.style.opacity = '1';
                  node.style.visibility = 'visible';

                  const images = node.querySelectorAll('img');
                  await Promise.all(Array.from(images).map(img => {
                     if (img.complete) return Promise.resolve();
                     return new Promise(res => { img.onload = res; img.onerror = res; setTimeout(res, 5000); });
                  }));
                  await new Promise(r => setTimeout(r, 500));

                  const dataUrl = await toPng(node, { cacheBust: true, backgroundColor: '#ffffff' });

                  // Restore hide
                  node.style.position = 'static';
                  node.style.opacity = '0.01';

                  if (window.innerWidth <= 991) {
                     setPreviewImg(dataUrl);
                  } else {
                     const link = document.createElement('a');
                     link.download = `HoaDon_${downloadingInvoice.tenhv}_${downloadingInvoice.mahd}.png`;
                     link.href = dataUrl;
                     document.body.appendChild(link);
                     link.click();
                     document.body.removeChild(link);
                  }
               }
            } catch (err) {
               console.error('Lỗi xuất PNG:', err);
            } finally {
               setDownloadingInvoice(null);
            }
         };
         processPng();
      }
   }, [downloadingInvoice]);

   useEffect(() => {
      if (downloadingNotice) {
         const processPng = async () => {
            try {
               await new Promise(r => setTimeout(r, 1500));
               const node = document.getElementById('download-notice-node');
               if (node) {
                  // Capture setup
                  node.style.position = 'fixed';
                  node.style.top = '0';
                  node.style.left = '0';
                  node.style.zIndex = '9999';
                  node.style.opacity = '1';
                  node.style.visibility = 'visible';

                  const images = node.querySelectorAll('img');
                  await Promise.all(Array.from(images).map(img => {
                     if (img.complete) return Promise.resolve();
                     return new Promise(res => { img.onload = res; img.onerror = res; setTimeout(res, 5000); });
                  }));
                  await new Promise(r => setTimeout(r, 600));

                  const dataUrl = await toPng(node, { cacheBust: true, backgroundColor: '#ffffff' });

                  // Restore hide
                  node.style.position = 'static';
                  node.style.opacity = '0.01';

                  if (window.innerWidth <= 991) {
                     setPreviewImg(dataUrl);
                  } else {
                     const link = document.createElement('a');
                     link.download = `ThongBao_${downloadingNotice.tenhv}_${downloadingNotice.mahd}.png`;
                     link.href = dataUrl;
                     document.body.appendChild(link);
                     link.click();
                     document.body.removeChild(link);
                  }
               }
            } catch (err) {
               console.error('Notice capture error:', err);
            } finally {
               setDownloadingNotice(null);
            }
         };
         processPng();
      }
   }, [downloadingNotice]);

   const calculateOldDebt = async (mahv) => {
      try {
         let totalHdDebt = 0;
         let totalBillDebt = 0;
         const parseCur = (v) => parseInt(String(v).replace(/,/g, ''), 10) || 0;

         // Debt from tuition invoices
         const { data: hd } = await supabase.from('tbl_hd').select('mahd, conno, daxoa').eq('mahv', mahv);
         (hd || []).filter(x => (x.daxoa || '').toLowerCase() !== 'đã xóa').forEach(x => totalHdDebt += parseCur(x.conno));

         // Debt from product sales (SalesPOS)
         const { data: bills } = await supabase.from('tbl_billhanghoa')
            .select('mabill, conno, dadong, tongcong, daxoa, ngaylap, noidung')
            .eq('mahv', mahv);

         const validBills = (bills || []).filter(x =>
            (x.daxoa || '').toLowerCase() !== 'đã xóa' &&
            parseCur(x.dadong) === 0
         );
         validBills.forEach(x => totalBillDebt += parseCur(x.conno));

         setNoCu(totalHdDebt);
         setUnpaidBills(validBills);
         setUnpaidBillsTotal(totalBillDebt);
      } catch (e) {
         console.error(e);
      }
   };


   const handleSelectStudent = async (st) => {
      setSelectedStudent(st);
      setShowMobileDetails(true);
      setMessage({ type: '', text: '' });
      setRefundOverrides({ meal: null, tuition: null });
      calculateOldDebt(st.mahv);

      const firstMalop = st.malop_list && st.malop_list.length > 0 ? st.malop_list[0] : null;
      await updateClassContext(firstMalop, st);
   };

   const updateClassContext = async (malop, student) => {
      if (!student) return;
      const stClass = classes.find(c => c.malop === malop);

      // Lấy lịch học theo cấu hình (Đã lược bỏ truy vấn bảng lịch học)
      let effectiveSchedule = stClass?.thoigianbieu || '';

      // Tạo bản clone hoặc update object activeClass để chứa lichhoc đúng
      const enrichedClass = { ...stClass, thoigianbieu: effectiveSchedule };
      setActiveClass(enrichedClass);

      let defaultFee = 0;
      let tchr = null;
      if (stClass) {
         tchr = employees.find(e => e.manv === stClass.manv);
         if (stClass.hocphi) {
            const numbers = stClass.hocphi.replace(/,/g, '').match(/\d+/g);
            if (numbers && numbers.length > 0) {
               const maxNum = Math.max(...numbers.map(Number));
               if (maxNum > 1000) defaultFee = maxNum;
            }
         }
      }
      setClassTeacher(tchr);
      // Default values from class tuition template
      let loaiDong = 'Tháng';
      let soLuong = 1;

      if (stClass?.hocphi) {
         const firstOpt = stClass.hocphi.split('\n').filter(Boolean)[0] || '';
         const qtyMatch = firstOpt.match(/(?:^|[^0-9])(\d+)\s*(?:buổi|tháng|khóa|tuần)/i);
         if (qtyMatch && qtyMatch[1]) soLuong = parseInt(qtyMatch[1], 10);

         const lowOpt = firstOpt.toLowerCase();
         if (lowOpt.includes('buổi')) loaiDong = 'Buổi';
         else if (lowOpt.includes('tháng')) loaiDong = 'Tháng';
         else if (lowOpt.includes('khóa')) loaiDong = 'Khóa';
         else if (lowOpt.includes('tuần')) loaiDong = 'Tuần';
      }

      let hocphi = defaultFee;
      let giamHocphi = 0;
      let hinhThuc = walletsConfig.length > 0 ? walletsConfig[0].name : 'Tiền mặt';
      let ghiChu = '';
      let phuthu = [];

      setStudySummary(null);
      setRecentSourceText('');

      // Load recent HD or Thong bao for student + specific class
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      let startStr = new Date(firstDay.getTime() - firstDay.getTimezoneOffset() * 60000).toISOString().split('T')[0];
      let endMonthStr = '';

      let recentDoc = null;
      let recentHD = null;

      try {
         const [{ data: allHDs }, { data: allTBs }] = await Promise.all([
            supabase.from('tbl_hd').select('*').eq('mahv', student.mahv),
            supabase.from('tbl_thongbao').select('*').eq('mahv', student.mahv)
         ]);

         const validHDs = (allHDs || []).filter(x => x.mahd && (x.daxoa || '').toLowerCase() !== 'đã xóa');
         const validTBs = (allTBs || []).filter(x => x.mahd && (x.daxoa || '').toLowerCase() !== 'đã xóa');

         const safeTime = (d) => {
            if (!d) return 0;
            const t = new Date(d).getTime();
            if (!isNaN(t)) return t;
            const parts = String(d).split(/[\/\- :T]/);
            if (parts.length >= 3) {
               const p0 = parseInt(parts[0], 10);
               const p1 = parseInt(parts[1], 10) - 1;
               const p2 = parseInt(parts[2], 10);
               if (p2 > 2000) {
                  const td = new Date(p2, p1, p0).getTime();
                  if (!isNaN(td)) return td;
               }
            }
            return 0;
         };

         let allDocs = [...validHDs, ...validTBs];
         allDocs.sort((a, b) => safeTime(b.ngaylap) - safeTime(a.ngaylap));
         recentDoc = allDocs.length > 0 ? allDocs[0] : null;

         validHDs.sort((a, b) => safeTime(b.ngayketthuc || b.ngaylap) - safeTime(a.ngayketthuc || a.ngaylap));
         recentHD = validHDs.length > 0 ? validHDs[0] : null;

         if (recentDoc) {
            setRecentSourceText(recentDoc.mahd?.startsWith('TB') ? `Lấy dữ liệu từ Thông báo HP gần nhất (${recentDoc.mahd})` : `Lấy dữ liệu từ Hóa đơn gần nhất (${recentDoc.mahd})`);
            const parseCur = (v) => parseInt(String(v).replace(/,/g, ''), 10) || 0;
            hocphi = parseCur(recentDoc.hocphi);
            giamHocphi = parseCur(recentDoc.giamhocphi);
            hinhThuc = recentDoc.hinhthuc || (walletsConfig.length > 0 ? walletsConfig[0].name : 'Tiền mặt');
            if (walletsConfig.length > 0 && !walletsConfig.some(w => w.name === hinhThuc)) {
               hinhThuc = walletsConfig[0].name;
            }
            ghiChu = recentDoc.ghichu || '';
            if (recentDoc.ngaybatdau) {
               startStr = recentDoc.ngaybatdau;
               endMonthStr = ''; // Recalculate based on start and loaded quantity
            }
            if (recentDoc.phuthu) {
               try {
                  phuthu = Array.isArray(recentDoc.phuthu) ? recentDoc.phuthu : JSON.parse(recentDoc.phuthu);
                  if (!Array.isArray(phuthu)) phuthu = [];
               } catch (e) {
                  console.error('Error parsing phuthu:', e);
                  phuthu = [];
               }
            }
            if (recentDoc.sobuoihoc) {
               const text = recentDoc.sobuoihoc;

               // ❌ Bỏ qua nếu là dạng tháng/năm
               if (/^\d{1,2}\/\d{4}$/.test(text.trim())) {
                  soLuong = 1;
                  loaiDong = '';
               } else {
                  const qm = text.match(/(?:^|\s)(\d+)\s*(buổi|tháng|khóa|tuần)/i);

                  if (qm && parseInt(qm[1], 10) < 100) {
                     soLuong = parseInt(qm[1], 10);
                     loaiDong = qm[2].charAt(0).toUpperCase() + qm[2].slice(1);
                  } else {
                     soLuong = 1;
                  }
               }
            }
         }

      } catch (err) {
         console.error('Lỗi fetch dữ liệu ban đầu:', err);
      }

      if (!endMonthStr) {
         const unit = (loaiDong || '').toLowerCase().trim();
         if (unit.includes('tháng') || unit.includes('khóa')) {
            const tempDate = new Date(startStr);
            if (!isNaN(tempDate.getTime())) {
               tempDate.setMonth(tempDate.getMonth() + (parseInt(soLuong) || 1));
               endMonthStr = tempDate.toISOString().split('T')[0];
            }
         } else if (unit.includes('buổi') && enrichedClass?.thoigianbieu) {
            const activeDays = parseScheduleDays(enrichedClass.thoigianbieu);
            if (activeDays.length > 0) {
               endMonthStr = calculateEndDateBySessions(startStr, (parseInt(soLuong) || 1), activeDays);
            }
         } else if (unit.includes('tuần')) {
            const startD = new Date(startStr);
            if (!isNaN(startD.getTime())) {
               startD.setDate(startD.getDate() + (parseInt(soLuong) || 1) * 7);
               endMonthStr = startD.toISOString().split('T')[0];
            }
         }
         if (!endMonthStr) {
            const nextM = new Date(startStr);
            if (!isNaN(nextM.getTime())) {
               nextM.setMonth(nextM.getMonth() + 1);
               endMonthStr = nextM.toISOString().split('T')[0];
            }
         }
      }

      setInvoiceData({
         loaiDong, soLuong, ngayBatDau: startStr, ngayKetThuc: endMonthStr,
         hocphi, donGia: hocphi / (soLuong || 1), giamHocphi, hinhThuc, ghiChu, phuthu, daDong: 0
      });

      try {
         // Thống kê điểm danh - Chỉ lấy từ hóa đơn/thông báo trước đó
         const targetForStats = recentHD || (recentDoc?.ngaybatdau ? recentDoc : null);

         if (targetForStats) {
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
                  if (y > 2000) {
                     return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  }
               }
               return s;
            };

            let statsStart = ensureIsoDate(targetForStats.ngaybatdau);
            let statsEnd = ensureIsoDate(targetForStats.ngayketthuc);

            // Fallback: Nếu không có ngày cụ thể nhưng có chuỗi thời lượng "MM/YYYY"
            if ((!statsStart || !statsEnd) && targetForStats.thoiluong) {
               const m = targetForStats.thoiluong.match(/(\d{2})\/(\d{4})/);
               if (m) {
                  const mm = parseInt(m[1]) - 1;
                  const yyyy = parseInt(m[2]);
                  statsStart = new Date(yyyy, mm, 1).toISOString().split('T')[0];
                  statsEnd = new Date(yyyy, mm + 1, 0).toISOString().split('T')[0];
               }
            }

            if (statsStart && statsEnd) {
               let filterLop = malop;
               let scheduleToUse = enrichedClass?.thoigianbieu;

               if (targetForStats.malop) {
                  filterLop = targetForStats.malop;
                  if (filterLop !== malop) {
                     const oldClass = classes.find(c => c.malop === filterLop);
                     if (oldClass?.thoigianbieu) scheduleToUse = oldClass.thoigianbieu;
                  }
               }

               let tongBuoi = 0;
               if (scheduleToUse) {
                  const activeDays = parseScheduleDays(scheduleToUse);
                  let cDate = new Date(`${statsStart}T00:00:00`);
                  const eDate = new Date(`${statsEnd}T23:59:59`);
                  let safeCount = 0;
                  while (cDate <= eDate && safeCount < 1000) {
                     if (activeDays.includes(cDate.getDay())) tongBuoi++;
                     cDate.setDate(cDate.getDate() + 1);
                     safeCount++;
                  }
               }

               let attendanceQuery = supabase.from('tbl_diemdanh').select('*')
                  .eq('mahv', student.mahv)
                  .gte('ngay', statsStart).lte('ngay', statsEnd);

               const { data: attendance } = await attendanceQuery;

               const normalizeStatus = (s) => (s || '').trim().toLowerCase();
               let daHoc = 0, nghiPhep = 0, nghiKhongPhep = 0;
               (attendance || []).forEach(att => {
                  const s = normalizeStatus(att.trangthai);
                  if (s === 'có mặt') daHoc++;
                  else if (s === 'nghỉ phép') nghiPhep++;
                  else if (s === 'nghỉ không phép') nghiKhongPhep++;
               });

               const consecutiveLeave = calculateConsecutiveLeave(attendance || []);
               const maxConsecutive = consecutiveLeave.length > 0 ? Math.max(...consecutiveLeave.map(l => l.so_ngay_nghi_lien_tuc)) : 0;

               setStudySummary({
                  daHoc,
                  nghiPhep,
                  nghiKhongPhep,
                  tongBuoi,
                  consecutiveLeave,
                  maxConsecutive,
                  sourceHd: targetForStats.mahd,
                  period: targetForStats.thoiluong || `${statsStart} - ${statsEnd}`
               });
            }
         }
      } catch (err) {
         console.error('Lỗi tính thống kê điểm danh:', err);
      }
   };

   const showMessage = (type, text) => {
      setMessage({ type, text });
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
   };

   const removeSurcharge = (index) => {
      const newPT = [...invoiceData.phuthu];
      newPT.splice(index, 1);
      setInvoiceData(prev => ({ ...prev, phuthu: newPT }));
   };

   const addSurcharge = () => {
      setInvoiceData(prev => ({
         ...prev,
         phuthu: [...(prev.phuthu || []), { name: '', amount: 0 }]
      }));
   };

   const updateSurcharge = (index, field, value) => {
      const newPT = [...invoiceData.phuthu];
      if (field === 'amount') {
         newPT[index][field] = parseInt(String(value).replace(/,/g, ''), 10) || 0;
      } else {
         newPT[index][field] = value;
      }
      setInvoiceData(prev => ({ ...prev, phuthu: newPT }));
   };

   const formatCurrency = (val) => {
      if (!val && val !== 0) return '';
      return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
   };

   const handleFinanceInput = (field, e) => {
      const rawValue = e.target.value.replace(/,/g, '').replace(/\D/g, '');
      const num = parseInt(rawValue, 10) || 0;
      setInvoiceData(prev => {
         let next = { ...prev, [field]: num };
         if (field === 'hocphi') {
            if (prev.soLuong) next.donGia = num / prev.soLuong;
            // Nếu thay đổi học phí thì tính lại số tiền giảm nếu có phần trăm
            if (prev.discountPercent > 0) {
               next.giamHocphi = Math.round((num * prev.discountPercent) / 100);
            }
         }
         // Nếu tự nhập tay số tiền giảm thì xóa phần trăm (tránh xung đột)
         if (field === 'giamHocphi') {
            next.discountPercent = 0;
         }
         return next;
      });
   };

   const handlePercentDiscount = (e) => {
      const raw = e.target.value.replace(/[^\d.]/g, '');
      const pct = parseFloat(raw) || 0;
      setInvoiceData(prev => {
         const discountAmt = Math.round((prev.hocphi * pct) / 100);
         return {
            ...prev,
            discountPercent: pct,
            giamHocphi: discountAmt
         };
      });
   };

   const handleSelectTuitionPackage = (optText) => {
      let newInv = { ...invoiceData };

      const numbers = optText.replace(/,/g, '').match(/\d{4,}/g);
      if (numbers) {
         newInv.hocphi = Math.max(...numbers.map(Number));
      }

      const isBuoi = optText.toLowerCase().includes('buổi');
      const isThang = optText.toLowerCase().includes('tháng');
      const isKhoa = optText.toLowerCase().includes('khóa');
      const isTuan = optText.toLowerCase().includes('tuần');

      if (isBuoi) newInv.loaiDong = 'Buổi';
      else if (isThang) newInv.loaiDong = 'Tháng';
      else if (isKhoa) newInv.loaiDong = 'Khóa';
      else if (isTuan) newInv.loaiDong = 'Tuần';

      const qm = optText.match(/(?:^|[^0-9])(\d+)\s*(?:buổi|tháng|khóa|tuần)/i);
      if (qm && parseInt(qm[1], 10) < 100) {
         newInv.soLuong = parseInt(qm[1], 10);
         newInv.donGia = newInv.hocphi / (newInv.soLuong || 1);
      } else {
         newInv.soLuong = 1;
         newInv.donGia = newInv.hocphi;
      }

      const unit = (newInv.loaiDong || '').toLowerCase().trim();
      if (unit.includes('tháng') || unit.includes('khóa')) {
         const startD = new Date(newInv.ngayBatDau);
         if (!isNaN(startD.getTime())) {
            startD.setMonth(startD.getMonth() + (parseInt(newInv.soLuong) || 1));
            newInv.ngayKetThuc = startD.toISOString().split('T')[0];
         }
      } else if (unit.includes('buổi') && newInv.ngayBatDau && newInv.soLuong && activeClass?.thoigianbieu) {
         const activeDays = parseScheduleDays(activeClass.thoigianbieu);
         if (activeDays.length > 0) {
            newInv.ngayKetThuc = calculateEndDateBySessions(newInv.ngayBatDau, (parseInt(newInv.soLuong) || 1), activeDays);
         }
      } else if (unit.includes('tuần') && newInv.ngayBatDau && newInv.soLuong) {
         const startD = new Date(newInv.ngayBatDau);
         if (!isNaN(startD.getTime())) {
            startD.setDate(startD.getDate() + (parseInt(newInv.soLuong) || 1) * 7);
            newInv.ngayKetThuc = startD.toISOString().split('T')[0];
         }
      }

      setInvoiceData(newInv);
   };

   const handleFormChange = (field, val) => {
      let newInv = { ...invoiceData, [field]: val };

      if (field === 'soLuong' || field === 'ngayBatDau' || field === 'loaiDong') {
         if (field === 'soLuong' && process.env.REACT_APP_CALC_FEE_BY_SESSION === 'true') {
            const parsedQty = parseInt(val);
            if (!isNaN(parsedQty) && parsedQty > 0 && newInv.loaiDong === 'Buổi') {
               newInv.hocphi = Math.round((invoiceData.donGia || 0) * parsedQty);
            }
         }

         const unit = (newInv.loaiDong || '').toLowerCase().trim();
         if (unit.includes('tháng') || unit.includes('khóa')) {
            const startD = new Date(newInv.ngayBatDau);
            if (!isNaN(startD.getTime())) {
               startD.setMonth(startD.getMonth() + (parseInt(newInv.soLuong) || 1));
               newInv.ngayKetThuc = startD.toISOString().split('T')[0];
            }
         } else if (unit.includes('buổi') && newInv.ngayBatDau && newInv.soLuong && activeClass?.thoigianbieu) {
            const activeDays = parseScheduleDays(activeClass.thoigianbieu);
            if (activeDays.length > 0) {
               newInv.ngayKetThuc = calculateEndDateBySessions(newInv.ngayBatDau, (parseInt(newInv.soLuong) || 1), activeDays);
            }
         } else if (unit.includes('tuần') && newInv.ngayBatDau && newInv.soLuong) {
            const startD = new Date(newInv.ngayBatDau);
            if (!isNaN(startD.getTime())) {
               startD.setDate(startD.getDate() + (parseInt(newInv.soLuong) || 1) * 7);
               newInv.ngayKetThuc = startD.toISOString().split('T')[0];
            }
         }
      }
      setInvoiceData(newInv);
   };

   const shiftMonth = (delta) => {
      const d = new Date(invoiceData.ngayBatDau);
      if (isNaN(d.getTime())) return;
      d.setMonth(d.getMonth() + delta);
      handleFormChange('ngayBatDau', d.toISOString().split('T')[0]);
   };

   const handleExportNotice = async () => {
      const currentTimePeriod = calculateThoiluong(invoiceData);
      if (currentTimePeriod) {
         const { data: allDocs } = await supabase.from('tbl_hd')
            .select('mahd, daxoa, thoiluong')
            .eq('mahv', selectedStudent.mahv)
            .eq('malop', activeClass?.malop || '');

         const validHDs = (allDocs || []).filter(d => (d.daxoa || '').toLowerCase() !== 'đã xóa');
         const currentMonths = currentTimePeriod.split(',').map(m => m.trim());
         const existingMonths = validHDs.flatMap(d => (d.thoiluong || '').split(',').map(m => m.trim()));

         const overlappingMonth = currentMonths.find(m => existingMonths.includes(m));
         if (overlappingMonth) {
            setWarningModal({
               isOpen: true,
               title: 'Cảnh Báo Đóng Trùng Học Phí',
               message: `Học sinh này đã nộp học phí cho tháng ${overlappingMonth} rồi. Vui lòng kiểm tra lại các Hóa Đơn cũ của học sinh!`
            });
            return;
         }
      }

      // Generate TB code
      const { data: recentTB } = await supabase.from('tbl_thongbao').select('mahd').order('mahd', { ascending: false }).limit(1);
      let nextNum = 1;
      if (recentTB && recentTB.length > 0 && recentTB[0].mahd) {
         const numPart = recentTB[0].mahd.replace(/\D/g, '');
         if (!isNaN(parseInt(numPart, 10))) nextNum = parseInt(numPart, 10) + 1;
      }
      const newMaTB = `TB${String(nextNum).padStart(5, '0')}`;
      const localNow = new Date(new Date() - new Date().getTimezoneOffset() * 60000).toISOString();

      const billNote = unpaidBills.length > 0 ? ` (Gộp POS: ${unpaidBills.map(b => `${b.mabill}${b.noidung ? ` - ${b.noidung}` : ''}`).join('; ')})` : '';
      const sobuoihocFinal = `${invoiceData.soLuong} ${invoiceData.loaiDong}${invoiceData.loaiDong.toLowerCase().includes('tháng') ? ` (${currentTimePeriod})` : ''}`;
      const insertData = {
         mahd: newMaTB,
         ngaylap: localNow,
         mahv: selectedStudent.mahv,
         tenlop: activeClass?.tenlop || '',
         ngaybatdau: invoiceData.ngayBatDau || null,
         ngayketthuc: invoiceData.ngayKetThuc || null,
         manv: auth.user?.manv || auth.user?.username || '',
         hocphi: formatCurrency(invoiceData.hocphi),
         giamhocphi: formatCurrency(invoiceData.giamHocphi),
         tongcong: formatCurrency(tongCong),
         dadong: '0',
         conno: formatCurrency(tongCong),
         hinhthuc: invoiceData.hinhThuc,
         tiennghiphep: formatCurrency(Math.round(actualTuitionRefund)),
         trutienan: formatCurrency(Math.round(actualMealRefund)),
         ghichu: `${invoiceData.ghiChu}${billNote}`,
         phuthu: invoiceData.phuthu && invoiceData.phuthu.length > 0 ? JSON.stringify(invoiceData.phuthu) : null,
         daxoa: null,
         malop: activeClass?.malop || '',
         thoiluong: currentTimePeriod,
         sobuoihoc: sobuoihocFinal
      };

      try {
         const { error } = await supabase.from('tbl_thongbao').insert([insertData]);
         if (error) throw error;

         setDownloadingNotice({
            mahd: newMaTB,
            ngaylap: localNow,
            tenhv: selectedStudent.tenhv,
            mahv: selectedStudent.mahv,
            sdt: selectedStudent.sdtme || selectedStudent.sdtba || selectedStudent.sdt || "",
            tenlop: activeClass?.tenlop || '',
            ngaybatdau: invoiceData.ngayBatDau || null,
            ngayketthuc: invoiceData.ngayKetThuc || null,
            hocphi: formatCurrency(invoiceData.hocphi) + ' đ',
            giamhocphi: formatCurrency(invoiceData.giamHocphi) + ' đ',
            tongcong: formatCurrency(tongCong),
            hinhthuc: invoiceData.hinhThuc,
            ghichu: `${invoiceData.ghiChu}${billNote}`,
            thoiluong: currentTimePeriod,
            sobuoihoc: sobuoihocFinal,
            phuthu: invoiceData.phuthu,
            studySummary: studySummary,
            deductionSum,
            tuitionRefund,
            trutienan_val,
            trutiennghi_val
         });
      } catch (err) {
         console.error(err);
         showMessage('error', 'Lỗi lưu thông báo: ' + err.message);
      }
   };

   const handleSaveInvoice = async () => {
      setIsSaving(true);
      try {
         const currentTimePeriod = calculateThoiluong(invoiceData);

         if (currentTimePeriod) {
            const { data: allDocs, error: dupErr } = await supabase.from('tbl_hd')
               .select('mahd, daxoa, thoiluong')
               .eq('mahv', selectedStudent.mahv)
               .eq('malop', activeClass?.malop || '');

            const validHDs = (allDocs || []).filter(d => (d.daxoa || '').toLowerCase() !== 'đã xóa');
            const currentMonths = currentTimePeriod.split(',').map(m => m.trim());
            const existingMonths = validHDs.flatMap(d => (d.thoiluong || '').split(',').map(m => m.trim()));

            const overlappingMonth = currentMonths.find(m => existingMonths.includes(m));

            if (!dupErr && overlappingMonth) {
               setWarningModal({
                  isOpen: true,
                  title: 'Cảnh Báo Đóng Trùng Học Phí',
                  message: `Học sinh này đã nộp học phí cho tháng ${overlappingMonth} rồi. Để tránh tính nhầm tiền, hệ thống sẽ từ chối xuất hóa đơn. Vui lòng kiểm tra lại các Hóa Đơn cũ!`
               });
               setIsSaving(false);
               return;
            }
         }

         const { data: recentHD } = await supabase.from('tbl_hd').select('mahd').order('mahd', { ascending: false }).limit(1);
         let nextNum = 1;
         if (recentHD && recentHD.length > 0 && recentHD[0].mahd) {
            const numPart = recentHD[0].mahd.replace(/\D/g, '');
            if (!isNaN(parseInt(numPart, 10))) nextNum = parseInt(numPart, 10) + 1;
         }
         const newMaHD = `HD${String(nextNum).padStart(5, '0')}`;

         // Local tz for ngaylap
         const localNow = new Date(new Date() - new Date().getTimezoneOffset() * 60000).toISOString();

         const billNote = unpaidBills.length > 0 ? ` (Gộp POS: ${unpaidBills.map(b => `${b.mabill}${b.noidung ? ` - ${b.noidung}` : ''}`).join('; ')})` : '';
         const combinedNote = `${invoiceData.ghiChu}${billNote}`;
         const sobuoihocFinal = `${invoiceData.soLuong} ${invoiceData.loaiDong}${invoiceData.loaiDong.toLowerCase().includes('tháng') ? ` (${currentTimePeriod})` : ''}`;
         const insertData = {
            mahd: newMaHD,
            ngaylap: localNow,
            mahv: selectedStudent.mahv,
            tenlop: activeClass?.tenlop || '',
            ngaybatdau: invoiceData.ngayBatDau || null,
            ngayketthuc: invoiceData.ngayKetThuc || null,
            manv: auth.user?.manv || auth.user?.username || '',
            hocphi: formatCurrency(invoiceData.hocphi),
            giamhocphi: formatCurrency(invoiceData.giamHocphi),
            tongcong: formatCurrency(tongCong),
            dadong: formatCurrency(invoiceData.daDong),
            conno: formatCurrency(conLai),
            hinhthuc: invoiceData.hinhThuc,
            ghichu: combinedNote,
            phuthu: invoiceData.phuthu && invoiceData.phuthu.length > 0 ? JSON.stringify(invoiceData.phuthu) : null,
            daxoa: null,
            malop: activeClass?.malop || '',
            thoiluong: currentTimePeriod,
            sobuoihoc: sobuoihocFinal,
            tiennghiphep: formatCurrency(Math.round(actualTuitionRefund)),
            trutienan: formatCurrency(Math.round(actualMealRefund)),
            sobuoinghiphep: studySummary?.nghiPhep || 0,
            nhanvien: cashier
         };

         const res = await supabase.from('tbl_hd').insert([insertData]);
         if (res.error) throw res.error;

         // Nếu hóa đơn có tính nợ cũ, sau khi lưu thành công phải cập nhật các hóa đơn/bill cũ của học sinh về nợ = 0
         // vì nợ đó đã được gộp (rollup) vào hóa đơn mới này.
         if (noCu > 0) {
            try {
               // Cập nhật nợ cũ trong tbl_hd (trừ hóa đơn vừa tạo)
               await supabase.from('tbl_hd')
                  .update({ conno: '0' })
                  .eq('mahv', selectedStudent.mahv)
                  .neq('mahd', newMaHD);
            } catch (err) {
               console.error('Lỗi cập nhật xóa nợ cũ:', err);
            }
         }

         // Gộp nợ bill hàng hóa
         if (unpaidBillsTotal > 0) {
            try {
               await supabase.from('tbl_billhanghoa')
                  .update({ conno: '0' })
                  .eq('mahv', selectedStudent.mahv)
                  .eq('dadong', '0'); // Chỉ cập nhật những bill chưa đóng (đã được gom)
            } catch (err) {
               console.error('Lỗi cập nhật xóa nợ bill hàng hóa:', err);
            }
         }

         // show thành công
         setSuccessModal({
            isOpen: true,
            title: 'Xuất Hóa Đơn Thành Công 🎉',
            message: `Hóa đơn ${newMaHD} đã được tạo thành công!`
         });

         setDownloadingInvoice({
            mahd: newMaHD,
            ngaylap: localNow,
            tenhv: selectedStudent.tenhv,
            sdt: selectedStudent.sdtme || selectedStudent.sdtba || selectedStudent.sdt || "",
            tenlop: activeClass?.tenlop || '',
            ngaybatdau: invoiceData.ngayBatDau || null,
            ngayketthuc: invoiceData.ngayKetThuc || null,
            hocphi: formatCurrency(invoiceData.hocphi),
            giamhocphi: formatCurrency(invoiceData.giamHocphi),
            sobuoihoc: sobuoihocFinal,
            nocu: formatCurrency(noCu),
            tongcong: formatCurrency(tongCong),
            dadong: formatCurrency(invoiceData.daDong),
            conno: formatCurrency(conLai),
            hinhthuc: invoiceData.hinhThuc,
            ghichu: combinedNote,
            nhanvien: cashier,
            thoiluong: currentTimePeriod,
            phuthu: invoiceData.phuthu,
            studySummary: studySummary,
            deductionSum,
            tuitionRefund,
            trutienan_val,
            trutiennghi_val
         });

         // Reload old debt dynamically mimicking real-time refresh
         calculateOldDebt(selectedStudent.mahv);
         // daDong will auto-reset via useEffect when calculateOldDebt updates noCu/tongCong
      } catch (err) {
         console.error(err);
         showMessage('error', 'Lỗi xuất hóa đơn: ' + err.message);
      } finally {
         setIsSaving(false);
      }
   };

   const filteredStudents = students.filter(s =>
      (s.tenhv && s.tenhv.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (s.sdt && s.sdt.includes(searchTerm)) ||
      (s.mahv && s.mahv.toLowerCase().includes(searchTerm.toLowerCase()))
   );



   const surchargeSum = (invoiceData.phuthu || []).reduce((sum, item) => sum + (item.amount || 0), 0);

   // Tính tiền hoàn trả từ lịch nghỉ (Nghỉ phép)
   const trutienan_val = parseInt(String(config?.trutienan || '0').replace(/\D/g, '')) || 0;
   const trutiennghi_val = parseInt(String(config?.trutiennghi || '0').replace(/\D/g, '')) || 0;

   // Logic hoàn trả tiền học theo số ngày nghỉ liên tiếp (Cấu hình % từ tbl_config)
   let tuitionRefund = 0;
   let daysHandled = 0;
   const p6 = parseFloat(config?.nghi6ngay) || 0;
   const p12 = parseFloat(config?.nghi12ngay) || 0;

   if (studySummary?.consecutiveLeave) {
      studySummary.consecutiveLeave.forEach(group => {
         const count = group.so_ngay_nghi_lien_tuc;
         if (count >= 12) {
            tuitionRefund += count * trutiennghi_val * (p12 / 100);
            daysHandled += count;
         } else if (count >= 6) {
            tuitionRefund += count * trutiennghi_val * (p6 / 100);
            daysHandled += count;
         }
      });
   }
   const remainingExcusedDays = Math.max(0, (studySummary?.nghiPhep || 0) - daysHandled);
   // Những ngày nghỉ lẻ mẻ không theo chuỗi 6 ngày thường không được tính giảm % mà tính theo mức trutiennghi cố định
   tuitionRefund += remainingExcusedDays * trutiennghi_val;

   const actualMealRefund = refundOverrides.meal !== null ? refundOverrides.meal : (trutienan_val * (studySummary?.nghiPhep || 0));
   const actualTuitionRefund = refundOverrides.tuition !== null ? refundOverrides.tuition : tuitionRefund;

   const deductionSum = studySummary ? (actualMealRefund + actualTuitionRefund) : 0;

   const tongCong = noCu + unpaidBillsTotal + invoiceData.hocphi + surchargeSum - invoiceData.giamHocphi - deductionSum;

   // Auto fill daDong in InvoiceManager: Default to full payment
   useEffect(() => {
      setInvoiceData(prev => ({ ...prev, daDong: tongCong }));
   }, [tongCong, selectedStudent?.mahv, activeClass?.malop]);

   const conLai = tongCong - invoiceData.daDong;

   return (
      <div className={`invoice-manager animate-fade-in ${showMobileDetails ? 'mobile-show-details' : ''}`}>

         {/* TRÁI: TÌM KIẾM LIST HỌC SINH */}
         <div className="im-left-pane">
            <div className="im-search">
               <Search size={20} className="text-muted" />
               <input
                  type="text"
                  placeholder="Tìm mã HS, tên, SĐT..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
               />
            </div>
            <div className="im-student-list">
               {filteredStudents.length > 0 ? filteredStudents.map(st => {
                  const isActive = selectedStudent?.mahv === st.mahv;
                  return (
                     <div key={st.mahv} className={`im-student-card ${isActive ? 'active' : ''}`} onClick={() => handleSelectStudent(st)}>
                        <div className="im-card-name">
                           {st.tenhv}
                        </div>
                        <div className="im-card-sub">SDT: {st.sdt || 'SĐT: Trống'}</div>
                        <div className="im-card-sub">Lớp: {st.malop_list && st.malop_list.length > 0
                           ? st.malop_list.map(ml => classes.find(c => c.malop === ml)?.tenlop || ml).join(', ')
                           : 'Chưa xếp lớp'}</div>
                     </div>
                  );
               }) : (
                  <div className="im-s-empty">Không tìm thấy học sinh hiển thị.</div>
               )}
            </div>
         </div>

         {/* PHẢI: CHI TIẾT VÀ XUẤT PHIẾU */}
         <div className="im-right-pane">
            {message.text && (
               <div className={`message-alert full-width ${message.type}`}>
                  <span>{message.text}</span>
               </div>
            )}

            {!selectedStudent ? (
               <div className="im-empty animate-fade-in">
                  <Receipt size={64} className="text-muted" style={{ opacity: 0.3 }} />
                  <h3>Chưa Chọn Học Sinh</h3>
                  <p>Vui lòng nhấp vào một học sinh từ danh sách bên trái để tạo hóa đơn thanh toán.</p>
               </div>
            ) : (
               <div className="invoice-details animate-fade-in">
                  <div className="mobile-header-actions">
                     <button className="btn-back" onClick={() => setShowMobileDetails(false)}>
                        <X size={20} /> Quay lại danh sách
                     </button>
                  </div>

                  <div className="im-sections-wrapper">
                     {/* 1. THÔNG TIN HỌC SINH */}
                     {recentSourceText && (
                        <div style={{ background: '#e0f2fe', color: '#0369a1', padding: '10px 15px', borderRadius: '8px', marginBottom: '1.5rem', fontWeight: 600, fontSize: '0.95rem', border: '1px solid #bae6fd' }}>
                           💡 {recentSourceText}
                        </div>
                     )}
                     <div className="im-section">
                        <h3 className="im-section-title"><User size={18} /> Thông tin học sinh</h3>
                        <div className="im-grid-3">
                           <div className="im-field-hz">
                              <label>Mã HS:</label>
                              <div className="val-text">{selectedStudent.mahv}</div>
                           </div>
                           <div className="im-field-hz">
                              <label>Tên HS:</label>
                              <div className="val-text text-primary">{selectedStudent.tenhv}</div>
                           </div>
                           <div className="im-field-hz">
                              <label>SĐT:</label>
                              <div className="val-text text-bold">{selectedStudent.sdtme || selectedStudent.sdtba || selectedStudent.sdt || 'Chưa cung cấp'}</div>
                           </div>
                        </div>
                     </div>

                     {/* 2. CHƯƠNG TRÌNH ĐÀO TẠO */}
                     <div className="im-section">
                        <h3 className="im-section-title"><BookOpen size={18} /> Thông tin lớp học</h3>
                        <div className="im-grid-2">
                           <div className="im-field-hz">
                              <label>Lớp Học:</label>
                              <div className="val-text text-primary text-bold">
                                 {activeClass?.tenlop || 'Chưa xếp lớp'}
                              </div>
                           </div>
                           <div className="im-field-hz">
                              <label>Giảng Viên:</label>
                              <div className="val-text flex-center"><GraduationCap size={16} /> {classTeacher?.tenhv || classTeacher?.tennv || activeClass?.manv || 'Không rõ'}</div>
                           </div>
                           <div className="im-field-hz" style={{ marginTop: '10px', gridColumn: 'span 2' }}>
                              <label style={{ color: '#059669', fontWeight: 600 }}>Thời lượng đóng:</label>
                              <div className="val-text flex-center" style={{ gap: '12px' }}>
                                 <button
                                    onClick={() => shiftMonth(-1)}
                                    style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontWeight: 900 }}
                                 >
                                    &lt;
                                 </button>
                                 <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#059669', minWidth: '100px', textAlign: 'center' }}>
                                    {formatMonthYear(invoiceData.ngayBatDau)}
                                 </span>
                                 <button
                                    onClick={() => shiftMonth(1)}
                                    style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontWeight: 900 }}
                                 >
                                    &gt;
                                 </button>
                              </div>
                           </div>
                        </div>

                     </div>

                     {/* 3. THỐNG KÊ ĐIỂM DANH */}
                     <div className="study-summary-wrap">
                        <div className="study-summary-label">
                           Thống kê điểm danh — {studySummary?.period || studySummary?.sourceHd || 'kỳ được chọn'}
                        </div>
                        {studySummary ? (
                           <>
                              <div className="study-summary-grid">
                                 <div className="ss-badge ss-present">
                                    <span className="ss-num">{studySummary.daHoc}</span>
                                    <span className="ss-txt">Đã học</span>
                                 </div>
                                 <div className="ss-badge ss-excused">
                                    <span className="ss-num">{studySummary.nghiPhep}</span>
                                    <span className="ss-txt">Nghỉ phép</span>
                                 </div>
                                 <div className="ss-badge ss-absent">
                                    <span className="ss-num">{studySummary.nghiKhongPhep || 0}</span>
                                    <span className="ss-txt">Không phép</span>
                                 </div>
                                 <div className="ss-badge ss-total">
                                    <span className="ss-num">{studySummary.tongBuoi}</span>
                                    <span className="ss-txt">Tổng buổi</span>
                                 </div>
                                 <div className={`ss-badge ${studySummary.maxConsecutive >= 6 ? 'ss-warning-pulse' : ''}`} style={{ background: studySummary.maxConsecutive >= 6 ? '#fff7ed' : '#f1f5f9', border: studySummary.maxConsecutive >= 6 ? '1.5px solid #f97316' : '1px solid #e2e8f0' }}>
                                    <span className="ss-num" style={{ color: studySummary.maxConsecutive >= 6 ? '#ea580c' : '#64748b' }}>{studySummary.maxConsecutive}</span>
                                    <span className="ss-txt" style={{ color: studySummary.maxConsecutive >= 6 ? '#c2410c' : '#64748b' }}>Nghỉ liên tiếp</span>
                                 </div>
                              </div>
                              {studySummary.consecutiveLeave && studySummary.consecutiveLeave.length > 0 && (
                                 <div style={{ marginTop: '5px', fontSize: '0.75rem', color: '#ea580c', fontWeight: 600 }}>
                                    ⚠️ Có đợt nghỉ dài: {studySummary.consecutiveLeave.map(l => `${l.so_ngay_nghi_lien_tuc} ngày (${l.ngay_bat_dau_nghi} -> ${l.ngay_ket_thuc_nghi})`).join(', ')}
                                 </div>
                              )}
                              {deductionSum > 0 && (
                                 <div style={{ marginTop: '10px', padding: '10px', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #10b981', color: '#065f46', fontSize: '0.9rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                       <span>Hoàn trả tiền ăn ({studySummary.nghiPhep} ngày x {formatCurrency(trutienan_val)}đ):</span>
                                       <div style={{ display: 'flex', alignItems: 'center', gap: '4px', borderBottom: '1px dashed #10b981' }}>
                                          <span style={{ fontWeight: 700 }}>-</span>
                                          <input
                                             type="text"
                                             value={formatCurrency(actualMealRefund)}
                                             onChange={(e) => {
                                                const val = parseInt(e.target.value.replace(/\D/g, '')) || 0;
                                                setRefundOverrides(prev => ({ ...prev, meal: val }));
                                             }}
                                             style={{ width: '100px', border: 'none', background: 'transparent', textAlign: 'right', fontWeight: 700, color: '#065f46', outline: 'none', padding: 0 }}
                                          />
                                          <span style={{ fontWeight: 700 }}>đ</span>
                                       </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', alignItems: 'center' }}>
                                       <span>Hoàn trả học phí (Tính theo số ngày nghỉ):</span>
                                       <div style={{ display: 'flex', alignItems: 'center', gap: '4px', borderBottom: '1px dashed #10b981' }}>
                                          <span style={{ fontWeight: 700 }}>-</span>
                                          <input
                                             type="text"
                                             value={formatCurrency(actualTuitionRefund)}
                                             onChange={(e) => {
                                                const val = parseInt(e.target.value.replace(/\D/g, '')) || 0;
                                                setRefundOverrides(prev => ({ ...prev, tuition: val }));
                                             }}
                                             style={{ width: '100px', border: 'none', background: 'transparent', textAlign: 'right', fontWeight: 700, color: '#065f46', outline: 'none', padding: 0 }}
                                          />
                                          <span style={{ fontWeight: 700 }}>đ</span>
                                       </div>
                                    </div>
                                    <div style={{ textAlign: 'right', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #10b981', fontWeight: 800 }}>
                                       Tổng hoàn trả từ lịch nghỉ: -{formatCurrency(deductionSum)}đ
                                    </div>
                                 </div>
                              )}
                           </>
                        ) : (
                           <div style={{ textAlign: 'center', padding: '10px', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.9rem' }}>
                              Không tìm thấy dữ liệu điểm danh hoặc chưa cài lịch học lớp.
                           </div>
                        )}
                     </div>

                     <div className="im-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                           <h3 className="im-section-title" style={{ marginBottom: 0 }}><Receipt size={18} /> Phụ thu (Nếu có)</h3>
                           <button className="btn-add-surcharge" onClick={addSurcharge} style={{ padding: '6px 12px', background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                              <Plus size={14} /> Thêm khoản phụ thu
                           </button>
                        </div>
                        {(invoiceData.phuthu && invoiceData.phuthu.length > 0) ? (
                           <div className="surcharge-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {invoiceData.phuthu.map((pt, idx) => (
                                 <div key={idx} className="surcharge-item" style={{ display: 'grid', gridTemplateColumns: '1fr 150px 40px', gap: '10px', alignItems: 'center' }}>
                                    <input
                                       className="im-input-text"
                                       type="text"
                                       placeholder="Tên khoản phụ thu..."
                                       value={pt.name}
                                       onChange={(e) => updateSurcharge(idx, 'name', e.target.value)}
                                       style={{ background: '#f1f5f9', border: 'none' }}
                                    />
                                    <div className="fi-input-wrapper" style={{ maxWidth: 'unset', height: '38px' }}>
                                       <input
                                          type="text"
                                          value={formatCurrency(pt.amount)}
                                          onChange={(e) => updateSurcharge(idx, 'amount', e.target.value)}
                                          style={{ padding: '4px 8px', fontSize: '0.9rem' }}
                                       />
                                       <span className="unit"></span>
                                    </div>
                                    <button onClick={() => removeSurcharge(idx)} style={{ border: 'none', background: '#fee2e2', color: '#ef4444', borderRadius: '6px', height: '38px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                       <X size={16} />
                                    </button>
                                 </div>
                              ))}
                           </div>
                        ) : (
                           <div style={{ textAlign: 'center', padding: '15px', border: '1px dashed #e2e8f0', borderRadius: '10px', color: '#94a3b8', fontSize: '0.9rem' }}>
                              Chưa có khoản phụ thu nào được thêm.
                           </div>
                        )}
                     </div>

                     {unpaidBills.length > 0 && (
                        <div className="im-section" style={{ background: '#fff7ed', border: '1px solid #ffedd5' }}>
                           <h3 className="im-section-title" style={{ color: '#c2410c' }}><CreditCard size={18} /> Gộp bill hàng hóa mới & Nợ POS</h3>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {unpaidBills.map((b, idx) => (
                                 <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#fff', borderRadius: '8px', border: '1px solid #fed7aa', fontSize: '0.9rem' }}>
                                    <div>
                                       <b style={{ color: '#ea580c' }}>{b.mabill}</b>
                                       <span style={{ marginLeft: '8px', color: '#94a3b8' }}>({new Date(b.ngaylap).toLocaleDateString('vi-VN')})</span>
                                    </div>
                                    <b style={{ color: '#ea580c' }}>{formatCurrency(b.conno)} ₫</b>
                                 </div>
                              ))}
                              <div style={{ textAlign: 'right', marginTop: '5px', padding: '5px 10px', fontSize: '1rem', fontWeight: 800, color: '#c2410c', borderTop: '2px dashed #fed7aa' }}>
                                 Tổng nợ POS gộp thêm: {formatCurrency(unpaidBillsTotal)} ₫
                              </div>
                           </div>
                        </div>
                     )}

                     <div className="im-section">
                        <h3 className="im-section-title"><Wallet size={18} /> Quyết Toán Tổng (VNĐ)</h3>

                        {/* HÀNG 1: NỢ CŨ, HỌC PHÍ, VOUCHER */}
                        <div className="im-finance-row grid-3">
                           <div className="im-fi-item">
                              <label>Nợ cũ</label>
                              <div className={`fi-val-display ${noCu > 0 ? 'text-danger' : 'text-success'}`}>{formatCurrency(noCu)} ₫</div>
                           </div>
                           <div className="im-fi-item">
                              <label>Học phí</label>
                              <div className="fi-input-wrapper with-chips" style={{ maxWidth: 'unset' }}>
                                 <input type="text" value={formatCurrency(invoiceData.hocphi)} onChange={e => handleFinanceInput('hocphi', e)} />
                                 <span className="unit">₫</span>
                                 {activeClass?.hocphi && (
                                    <div className="tuition-packages-chips">
                                       {activeClass.hocphi.split('\n').filter(Boolean).map((opt, i) => {
                                          const optLower = opt.toLowerCase();
                                          const isBuoi = optLower.includes('buổi');
                                          const isThang = optLower.includes('tháng');
                                          const isKhoa = optLower.includes('khóa');
                                          const isTuan = optLower.includes('tuần');
                                          const sel = config?.tinhhocphi?.selected || ['khoa', 'buoi', 'thang', 'tuần'];
                                          const isAllowed = (isBuoi && sel.includes('buoi')) ||
                                             (isThang && sel.includes('thang')) ||
                                             (isKhoa && sel.includes('khoa')) ||
                                             (isTuan && sel.includes('tuần')) ||
                                             (!isBuoi && !isThang && !isKhoa && !isTuan);
                                          if (!isAllowed) return null;
                                          return (
                                             <span key={i} className="tuition-chip" onClick={() => handleSelectTuitionPackage(opt)}>
                                                {opt.trim()}
                                             </span>
                                          );
                                       })}
                                    </div>
                                 )}
                              </div>
                           </div>
                           <div className="im-fi-item">
                              <label>Giảm HP</label>
                              <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '5px' }}>
                                 <div className="fi-input-wrapper">
                                    <input type="text" placeholder="%" value={invoiceData.discountPercent > 0 ? invoiceData.discountPercent : ''} onChange={handlePercentDiscount} />
                                    <span className="unit">%</span>
                                 </div>
                                 <div className="fi-input-wrapper">
                                    <input type="text" value={formatCurrency(invoiceData.giamHocphi)} onChange={e => handleFinanceInput('giamHocphi', e)} />
                                    <span className="unit">₫</span>
                                 </div>
                              </div>
                           </div>
                        </div>

                        {/* HÀNG 2: CẦN THU, ĐÃ ĐÓNG, CÒN LẠI */}
                        <div className="im-finance-row grid-3 highlight-row">
                           <div className="im-fi-item">
                              <label>Cần thu</label>
                              <div className="fi-val-display text-bold text-danger" style={{ fontSize: '1.4rem' }}>{formatCurrency(tongCong)} ₫</div>
                           </div>
                           <div className="im-fi-item">
                              <label>Đã đóng</label>
                              <div className="fi-input-wrapper giant" style={{ maxWidth: 'unset' }}>
                                 <input type="text" value={formatCurrency(invoiceData.daDong)} onChange={e => handleFinanceInput('daDong', e)} />
                                 <span className="unit">₫</span>
                              </div>
                           </div>
                           <div className="im-fi-item">
                              <label>Còn lại</label>
                              <div className={`fi-val-display text-bold ${conLai > 0 ? 'text-danger' : 'text-success'}`} style={{ fontSize: '1.25rem' }}>
                                 {formatCurrency(conLai)} ₫
                              </div>
                           </div>
                        </div>

                        {/* HÀNG 3: GHI CHÚ, HÌNH THỨC */}
                        <div className="im-finance-row grid-2">
                           <div className="im-fi-item-col">
                              <label>📝 Ghi chú biên lai</label>
                              <input
                                 className="im-input-text"
                                 type="text"
                                 value={invoiceData.ghiChu}
                                 onChange={e => handleFormChange('ghiChu', e.target.value)}
                                 placeholder="VD: Khách hứa trả nốt vào mùng 5..."
                              />
                           </div>
                           <div className="im-fi-item-col">
                              <label>💳 Hình thức thanh toán</label>
                              <select className="im-select" value={invoiceData.hinhThuc} onChange={e => handleFormChange('hinhThuc', e.target.value)}>
                                 {walletsConfig.length === 0 && <option value="Tiền mặt">Tiền mặt</option>}
                                 {walletsConfig.map(w => (
                                    <option key={w.id} value={w.name}>{w.name}</option>
                                 ))}
                              </select>
                           </div>
                        </div>

                        <div className="im-actions" style={{ display: 'flex', gap: '10px' }}>
                           <button className="im-btn-submit" style={{ background: '#3b82f6', borderColor: '#3b82f6' }} onClick={handleExportNotice}>
                              <MessageSquare size={18} />
                              Xuất Thông Báo
                           </button>
                           <button className="im-btn-submit" onClick={handleSaveInvoice} disabled={isSaving}>
                              <Receipt size={18} />
                              {isSaving ? 'Đang tạo cơ sở dữ liệu...' : 'Xác Nhận Xuất Hóa Đơn'}
                           </button>
                        </div>
                     </div>
                  </div>

               </div>
            )}
         </div>

         {warningModal.isOpen && (
            <div className="im-modal-overlay">
               <div className="im-warning-modal animate-slide-up">
                  <button className="im-close-btn" onClick={() => setWarningModal({ ...warningModal, isOpen: false })}>
                     <X size={20} />
                  </button>
                  <div className="im-warning-icon">
                     <AlertCircle size={52} />
                  </div>
                  <h3>{warningModal.title}</h3>
                  <p>{warningModal.message}</p>
                  <div className="im-warning-actions">
                     <button className="im-btn-warn-ok" onClick={() => setWarningModal({ ...warningModal, isOpen: false })}>
                        Đã Hiểu & Kiểm Tra Lại
                     </button>
                  </div>
               </div>
            </div>
         )}

         {successModal.isOpen && (
            <div className="im-modal-overlay">
               <div className="im-success-modal animate-slide-up">
                  <button
                     className="im-close-btn"
                     onClick={() => setSuccessModal({ ...successModal, isOpen: false })}
                  >
                     <X size={20} />
                  </button>

                  <div className="im-success-icon">
                     <CheckCircle size={52} />
                  </div>

                  <h3>{successModal.title}</h3>
                  <p>{successModal.message}</p>

                  <div className="im-warning-actions">
                     <button
                        className="im-btn-success-ok"
                        onClick={() => setSuccessModal({ ...successModal, isOpen: false })}
                     >
                        OK
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* HIDDEN TEMPLATE FOR INVOICE PNG EXPORT */}
         <div style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', overflow: 'hidden', opacity: 0.01, zIndex: -100, pointerEvents: 'none', background: '#ffffff' }}>
            <div id="download-invoice-node" style={{ position: 'relative', overflow: 'hidden', padding: '30px', background: 'white', color: '#000', width: '800px', fontFamily: 'Arial, sans-serif' }}>
               {/* Invoice Template Content ... (remains same) */}
               <div style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 0,
                  opacity: 0.2,
                  pointerEvents: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 10 Q 25 20 50 10 T 100 10' fill='none' stroke='%230066cc' stroke-width='0.5'/%3E%3Cpath d='M0 5 Q 25 15 50 5 T 100 5' fill='none' stroke='%230066cc' stroke-width='0.3' opacity='0.5'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'repeat'
               }} />
               <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%) rotate(-30deg)',
                  fontSize: '60pt',
                  fontWeight: 'bold',
                  color: 'rgba(0, 102, 204, 0.05)',
                  zIndex: 0,
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                  width: '150%'
               }}>
                  {config?.tencongty || 'ĐÃ THANH TOÁN'}
               </div>
               <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     {/* LEFT: Logo */}
                     <div style={{ width: '180px', textAlign: 'left' }}>
                        <img crossOrigin="anonymous" src={config?.logo || "/logo.png"} alt="logo" style={{ maxWidth: '160px', maxHeight: '160px', objectFit: 'contain' }} onError={(e) => { e.target.src = "/logo.png" }} />
                     </div>

                     {/* CENTER: Info */}
                     <div style={{ flex: 1, textAlign: 'center' }}>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, textTransform: 'uppercase' }}>
                           {config?.tencongty || 'Tên Công Ty'}
                        </h2>
                        <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Địa chỉ: {config?.diachicongty}</p>
                     </div>

                     {/* RIGHT: Invoice info */}
                     <div style={{ width: '150px', textAlign: 'right', fontSize: '14px' }}>
                        <div>Mã HĐ: <b style={{ fontWeight: 950 }}>{downloadingInvoice?.mahd}</b></div>
                        <div>Ngày lập: <span style={{ fontWeight: 600 }}>{downloadingInvoice ? new Date(downloadingInvoice.ngaylap).toLocaleDateString("vi-VN") : ""}</span></div>
                     </div>
                  </div>
                  <div style={{ textAlign: "center", fontWeight: "950", fontSize: "20pt", margin: "15px 0", color: '#000', textTransform: 'uppercase', textDecoration: 'underline' }}>
                     BIÊN LAI THU HỌC PHÍ
                  </div>
                  <div style={{ fontSize: "14pt", lineHeight: "1.8", margin: '20px 0' }}>
                     <div style={{ display: "flex", justifyContent: "space-between", marginBottom: '5px' }}>
                        <div>Họ và tên: <b>{downloadingInvoice?.tenhv}</b></div>
                        <div>SĐT: <b>{downloadingInvoice?.sdt || ""}</b></div>
                     </div>
                     <div>Khóa học: <b>{downloadingInvoice?.tenlop}</b></div>
                     <div>
                        Tháng đóng học phí/Thời lượng: <b>{downloadingInvoice?.thoiluong || "..."}</b>
                     </div>
                     <div style={{ marginTop: '5px' }}>
                        Hình thức đóng tiền: <b>{downloadingInvoice?.hinhthuc || "..."}</b>
                     </div>
                     <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '15px 0' }} />
                     <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>Học phí: <b>{downloadingInvoice?.hocphi} đ</b></div>
                        <div>Giảm HP: <b>{downloadingInvoice?.giamhocphi} đ</b></div>
                        <div>Nợ cũ: <b>{downloadingInvoice?.nocu} đ</b></div>
                     </div>
                     {downloadingInvoice?.phuthu && downloadingInvoice.phuthu.length > 0 && (
                        <div style={{ marginTop: '5px', padding: '5px', background: '#f9fafb', borderRadius: '4px' }}>
                           {downloadingInvoice.phuthu.map((pt, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12pt' }}>
                                 <span>+ {pt.name || 'Phụ thu'}:</span>
                                 <b>{formatCurrency(pt.amount)} đ</b>
                              </div>
                           ))}
                        </div>
                     )}
                     {downloadingInvoice?.deductionSum > 0 && (
                        <div style={{ marginTop: '5px', padding: '8px', background: '#ecfdf5', borderRadius: '4px', color: '#065f46', fontSize: '11pt' }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>- Hoàn trả tiền ăn ({downloadingInvoice.studySummary.nghiPhep} ngày):</span>
                              <b>-{formatCurrency(downloadingInvoice.trutienan_val * downloadingInvoice.studySummary.nghiPhep)} đ</b>
                           </div>
                           <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                              <span>- Hoàn trả học phí (Tính theo số ngày nghỉ):</span>
                              <b>-{formatCurrency(Math.round(downloadingInvoice.tuitionRefund))} đ</b>
                           </div>
                        </div>
                     )}
                     <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", marginTop: '5px' }}>
                        <div>Tổng cộng: <b>{downloadingInvoice?.tongcong} đ</b></div>
                        <div>Đã đóng: <b style={{ color: '#059669' }}>{downloadingInvoice?.dadong} đ</b></div>
                        <div>Còn lại: <b style={{ color: '#dc2626' }}>{downloadingInvoice?.conno} đ</b></div>
                     </div>
                     <div style={{ marginTop: '10px' }}>
                        Ghi chú: {downloadingInvoice?.ghichu || ""}
                     </div>
                  </div>
                  <div style={{ marginTop: 40, fontSize: "12pt", display: "flex", justifyContent: "space-between" }}>
                     <div>
                        Facebook: Trường Lá - E Skills School <br />
                        SĐT/Zalo: {config?.sdtcongty}
                     </div>
                     <div style={{ textAlign: "center" }}>
                        Nhân viên thu tiền <br /><br /><br />
                        <b>{downloadingInvoice?.nhanvien}</b>
                     </div>
                  </div>
                  <div style={{ marginTop: "30px", textAlign: "center", fontStyle: "italic", borderTop: '1px dashed #ccc', paddingTop: '10px', fontSize: '10pt' }}>
                     Lưu ý: Hóa đơn này có giá trị xác nhận việc đóng phí. Vui lòng giữ lại để đối chiếu khi cần thiết.
                  </div>
               </div>
            </div>

            {/* HIDDEN TEMPLATE FOR NOTICE PNG EXPORT */}
            <div id="download-notice-node" className="print-a5-receipt" style={{ width: '800px', background: '#fff', padding: '30px', boxSizing: 'border-box', display: 'block', opacity: 0.01 }}>
               {/* HEADER */}
               <div className="p-header" style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {/* LEFT: Logo */}
                  <div style={{ width: '180px', textAlign: 'left' }}>
                     <img crossOrigin="anonymous" src={config?.logo || "/logo.png"} alt="logo" style={{ maxWidth: '160px', maxHeight: '100px', objectFit: 'contain' }} onError={(e) => { e.target.src = "/logo.png" }} />
                  </div>

                  {/* CENTER: Info */}
                  <div style={{ flex: 1, textAlign: 'center' }}>
                     <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, textTransform: 'uppercase' }}>
                        TRƯỜNG LÁ TAM PHƯỚC
                     </h3>
                     <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Địa chỉ: {config?.diachicongty}</p>
                     <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Số điện thoại: {config?.sdtcongty}</p>
                  </div>

                  {/* RIGHT: Invoice info */}
                  <div style={{ width: '150px', textAlign: 'right', fontSize: '14px' }}>
                     <div>Mã TB: <b style={{ fontWeight: 950 }}>{downloadingNotice?.mahd}</b></div>
                     <div>Ngày lập: <span style={{ fontWeight: 600 }}>{downloadingNotice ? new Date(downloadingNotice.ngaylap).toLocaleDateString("vi-VN") : "..."}</span></div>
                  </div>
               </div>

               {/* TITLE */}
               <div style={{ textAlign: "center", fontWeight: "950", fontSize: "24pt", margin: "20px 0", color: '#000', textTransform: 'uppercase', textDecoration: 'underline' }}>
                  THÔNG BÁO THU HỌC PHÍ
               </div>

               {/* INFO */}
               <div style={{ fontSize: "15pt", lineHeight: "1.9", color: '#000' }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                     <div>Họ và tên: <b style={{ fontWeight: 950 }}>{downloadingNotice?.tenhv}</b></div>
                     <div>SĐT: <b style={{ fontWeight: 900 }}>{downloadingNotice?.sdt || ""}</b></div>
                  </div>

                  <div>
                     Khóa học: <b style={{ fontWeight: 900 }}>{downloadingNotice?.tenlop}</b>
                  </div>

                  {downloadingNotice?.thoiluong && (
                     <div style={{ color: '#059669', fontWeight: 950 }}>
                        Tháng đóng học phí/Thời lượng: <span style={{ textDecoration: 'underline' }}>{downloadingNotice.thoiluong}</span>
                     </div>
                  )}

                  <div style={{ background: '#f0f9ff', padding: '15px', borderRadius: '12px', border: '2px solid #0369a1', margin: '15px 0' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Học phí:</span> <b style={{ fontWeight: 900 }}>{downloadingNotice?.hocphi}</b>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Giảm trừ:</span> <b style={{ fontWeight: 900 }}>{downloadingNotice?.giamhocphi}</b>
                     </div>
                     {downloadingNotice?.phuthu && downloadingNotice.phuthu.length > 0 && (
                        <div style={{ borderTop: '1px solid #bae6fd', marginTop: '10px', paddingTop: '10px' }}>
                           {downloadingNotice.phuthu.map((pt, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                 <span>+ {pt.name || 'Phụ thu'}:</span>
                                 <b style={{ fontWeight: 900 }}>{formatCurrency(pt.amount)} đ</b>
                              </div>
                           ))}
                        </div>
                     )}
                     {downloadingNotice?.deductionSum > 0 && (
                        <div style={{ borderTop: '1px solid #bae6fd', marginTop: '10px', paddingTop: '10px' }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13pt' }}>
                              <span>- Hoàn trả tiền ăn ({downloadingNotice.studySummary.nghiPhep}n):</span>
                              <b style={{ fontWeight: 900 }}>-{formatCurrency(downloadingNotice.trutienan_val * downloadingNotice.studySummary.nghiPhep)} đ</b>
                           </div>
                           <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13pt' }}>
                              <span>- Hoàn trả học phí (Tính theo số ngày nghỉ):</span>
                              <b style={{ fontWeight: 900 }}>-{formatCurrency(Math.round(downloadingNotice.tuitionRefund))} đ</b>
                           </div>
                        </div>
                     )}
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', marginTop: '10px', borderTop: '2px solid #0369a1', paddingTop: '10px' }}>
                        <span style={{ fontWeight: 950 }}>TỔNG CỘNG:</span>
                        <b style={{ color: '#dc2626', fontSize: '1.5rem', fontWeight: 950 }}>{downloadingNotice?.tongcong} VNĐ</b>
                     </div>
                  </div>

                  <div>
                     Tháng đóng học phí/Thời lượng: <b style={{ fontWeight: 900 }}>{downloadingNotice?.thoiluong || "..."}</b>
                  </div>
                  <div>
                     Hình thức đóng tiền: <b style={{ fontWeight: 900 }}>{downloadingNotice?.hinhthuc || "..."}</b>
                  </div>
                  {downloadingNotice?.studySummary && (
                     <div style={{ fontSize: '13pt', marginTop: '5px', opacity: 0.9 }}>
                        Điểm danh ({downloadingNotice.studySummary.period || downloadingNotice.studySummary.sourceHd || 'kỳ trước'}): &nbsp;
                        Đi học: <b style={{ color: '#059669', fontWeight: 900 }}>{downloadingNotice.studySummary.daHoc}</b>, &nbsp;
                        Nghỉ phép: <b style={{ color: '#0369a1', fontWeight: 900 }}>{downloadingNotice.studySummary.nghiPhep}</b>, &nbsp;
                        Nghi KP: <b style={{ color: '#dc2626', fontWeight: 900 }}>{downloadingNotice.studySummary.nghiKhongPhep || 0}</b>
                     </div>
                  )}

                  {/* FEES */}
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: '2px solid #000', marginTop: '15px', paddingTop: '10px' }}>
                     <div>Học phí: <b style={{ fontWeight: 900 }}>{downloadingNotice?.hocphi}</b></div>
                     <div>Giảm HP: <b style={{ fontWeight: 900 }}>{downloadingNotice?.giamhocphi}</b></div>
                     <div>Nợ cũ: <b style={{ fontWeight: 800 }}>{formatCurrency(noCu)} đ</b></div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "950", borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '15px', fontSize: '16pt' }}>
                     <div>Tổng cộng: <b style={{ fontWeight: 950 }}>{downloadingNotice?.tongcong} đ</b></div>
                  </div>

                  <div style={{ marginBottom: '15px' }}>
                     Ghi chú: <b style={{ fontWeight: 800 }}>{downloadingNotice?.ghichu || ""}</b>
                  </div>

                  {/* QR SECTION */}
                  {(() => {
                     const qrUrl = downloadingNotice ? getQRUrl(downloadingNotice, walletsConfig) : null;
                     if (!qrUrl) return (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
                        </div>
                     );
                     return (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', marginTop: '10px' }}>
                           <div style={{ fontWeight: '950', fontSize: '14pt', marginBottom: '10px', textAlign: 'right', width: '100%' }}>Hình thức thanh toán: <span style={{ color: '#000' }}>{downloadingNotice?.hinhthuc}</span></div>
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
                     Facebook: Trường Lá - Eskills School
                     Hotline: <b style={{ fontWeight: 900 }}>{config?.sdtcongty}</b><br />
                     Nhân viên: <b style={{ fontWeight: 950 }}>{cashier}</b>
                  </div>
                  <div style={{ textAlign: "right", fontSize: '12pt', fontStyle: 'italic', opacity: 0.8 }}>
                     (Xác nhận)
                  </div>
               </div>
            </div>
         </div>

         {previewImg && (
            <div className="sp-modal-overlay" onClick={() => setPreviewImg(null)} style={{ zIndex: 3000, position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: '15px' }}>
               <div className="sp-success-modal animate-slide-up" onClick={e => e.stopPropagation()} style={{ padding: '20px', maxWidth: '100%', width: '450px', background: 'white', borderRadius: '12px', position: 'relative' }}>
                  <button onClick={() => setPreviewImg(null)} style={{ position: 'absolute', right: 10, top: 10, border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={20} /></button>
                  <p style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: '10px', color: '#0369a1', fontSize: '1rem' }}>
                     NHẤN GIỮ HÌNH ĐỂ LƯU / CHIA SẺ HÓA ĐƠN
                  </p>
                  <img src={previewImg} alt="Preview Invoice" style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                  <div style={{ marginTop: '15px', textAlign: 'center' }}>
                     <button className="im-btn-submit" style={{ width: '100%' }} onClick={() => setPreviewImg(null)}>HOÀN TẤT</button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
}
