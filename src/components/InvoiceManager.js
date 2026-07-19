import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase, insertLog } from '../supabase';
import { Search, Receipt, User, Wallet, AlertCircle, CheckCircle, X, MessageSquare, Plus, CreditCard, BookOpen, GraduationCap, Printer } from 'lucide-react';
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

const getWorkingDaysInMonth = (dateStr) => {
   if (!dateStr) return 0;
   const d = new Date(dateStr);
   const year = d.getFullYear();
   const month = d.getMonth();
   const daysInMonth = new Date(year, month + 1, 0).getDate();
   let workingDays = 0;
   for (let i = 1; i <= daysInMonth; i++) {
      const day = new Date(year, month, i).getDay();
      if (day !== 0 && day !== 6) { // 0: Sunday, 6: Saturday
         workingDays++;
      }
   }
   return workingDays;
};

const calculateWorkingDaysInMonth = getWorkingDaysInMonth;

const parseAmount = (val) => {
   if (typeof val === 'number') return val;
   if (!val) return 0;
   const str = String(val);
   const isNeg = str.includes('-');
   const cleaned = str.replace(/\D/g, '');
   const num = parseInt(cleaned, 10) || 0;
   return isNeg ? -num : num;
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

      const info = encodeURIComponent(`${hoaDon.mahv}${suffix}`);
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
         groups.push([...currentGroup]);
         currentGroup = [curr];
      }
   }

   groups.push(currentGroup);

   return groups.map(g => ({
      ngay_bat_dau_nghi: g[0].toISOString().split('T')[0],
      ngay_ket_thuc_nghi: g[g.length - 1].toISOString().split('T')[0],
      so_ngay_nghi_lien_tuc: g.length
   }));
};

const normalizeStudentStatus = (value) => (
   String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .trim()
      .toLowerCase()
);

const isInactiveStudent = (student) => normalizeStudentStatus(student?.trangthai) === 'da nghi';

export default function InvoiceManager() {
   const { config } = useConfig();
   const walletsConfig = (config ? [
      { id: 'vi1', name: config.vi1?.name || '', bankId: config.vi1?.bankId || '', accNo: config.vi1?.accNo || '', accName: config.vi1?.accName || '' },
      { id: 'vi2', name: config.vi2?.name || '', bankId: config.vi2?.bankId || '', accNo: config.vi2?.accNo || '', accName: config.vi2?.accName || '' },
      { id: 'vi3', name: config.vi3?.name || '', bankId: config.vi3?.bankId || '', accNo: config.vi3?.accNo || '', accName: config.vi3?.accName || '' },
      { id: 'vi4', name: config.vi4?.name || '', bankId: config.vi4?.bankId || '', accNo: config.vi4?.accNo || '', accName: config.vi4?.accName || '' }
   ].filter(w => w.name && w.name.trim() !== '') : []);

   const mealTiers = [];
   if (config?.trutienan) {
      const lines = String(config.trutienan).split('\n').map(l => l.trim()).filter(Boolean);
      lines.forEach(line => {
         const parts = line.split(':');
         if (parts.length === 2) {
            mealTiers.push({ name: parts[0].trim(), val: parseInt(parts[1].replace(/\D/g, ''), 10) || 0 });
         } else {
            mealTiers.push({ name: line, val: parseInt(line.replace(/\D/g, ''), 10) || 0 });
         }
      });
   }

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
      phuthu: [],
      selectedTienAnTier: null
   });

   const auth = JSON.parse(localStorage.getItem('auth_session') || '{}');
   const cashier = auth.user?.tennv || auth.user?.username || 'Thu Ngân';

   const [noCu, setNoCu] = useState(0);
   const [unpaidBills, setUnpaidBills] = useState([]);
   const [unpaidBillsTotal, setUnpaidBillsTotal] = useState(0);

   const fetchBaseData = async () => {
      try {
         const { data: stRaw } = await supabase.from('tbl_hv').select('*').order('tenhv', { ascending: true });
         const { data: cls } = await supabase.from('tbl_lop').select('*').or('daxoa.neq."Đã Xóa",daxoa.is.null');
         const { data: emp } = await supabase.from('tbl_nv').select('*');

         const st = (stRaw || []).filter(s => !isInactiveStudent(s)).map(s => ({
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
                  node.style.display = 'flex';
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
                  node.style.position = 'fixed';
                  node.style.top = '-9999px';
                  node.style.left = '-9999px';
                  node.style.zIndex = '-1000';
                  node.style.opacity = '0.01';

                  if (downloadingInvoice.isPrinting) {
                     const printWin = window.open('', '_blank');
                     if (printWin) {
                        printWin.document.write(`
                           <html>
                              <head>
                                 <title>Print Invoice</title>
                                 <style>
                                    @page { size: A4 landscape; margin: 0; }
                                    body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: #fff; }
                                    img { width: 297mm; height: 210mm; object-fit: contain; }
                                 </style>
                              </head>
                              <body>
                                 <img src="${dataUrl}" />
                                 <script>
                                    window.onload = function() {
                                       setTimeout(function() {
                                          window.focus();
                                          window.print();
                                          window.close();
                                       }, 500);
                                    };
                                 </script>
                              </body>
                           </html>
                        `);
                        printWin.document.close();
                     }
                  } else if (window.innerWidth <= 991) {
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
                  node.style.display = 'flex';
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
                  node.style.position = 'fixed';
                  node.style.top = '-9999px';
                  node.style.left = '-9999px';
                  node.style.zIndex = '-1000';
                  node.style.opacity = '0.01';

                  if (downloadingNotice.isPrinting) {
                     const printWin = window.open('', '_blank');
                     if (printWin) {
                        printWin.document.write(`
                           <html>
                              <head>
                                 <title>Print Notice</title>
                                 <style>
                                    @page { size: A5 portrait; margin: 0; }
                                    body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: #fff; }
                                    img { width: 148.5mm; height: 210mm; object-fit: contain; }
                                 </style>
                              </head>
                              <body>
                                 <img src="${dataUrl}" />
                                 <script>
                                    window.onload = function() {
                                       setTimeout(function() {
                                          window.focus();
                                          window.print();
                                          window.close();
                                       }, 500);
                                    };
                                 </script>
                              </body>
                           </html>
                        `);
                        printWin.document.close();
                     }
                  } else if (window.innerWidth <= 991) {
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
         const { data: bills } = await supabase.from('tbl_billhanghoa').select('mabill, conno, daxoa, ngaylap, daxacnhan, noidung').eq('mahv', mahv);
         const validBills = (bills || []).filter(x => (x.daxoa || '').toLowerCase() !== 'đã xóa' && (x.daxacnhan === false || parseCur(x.conno) > 0));
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
      let selectedTienAnTier = null;

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
            if (recentDoc.tienan) {
               try {
                  const taData = typeof recentDoc.tienan === 'string' ? JSON.parse(recentDoc.tienan) : recentDoc.tienan;
                  if (taData && taData.tierName) {
                     const found = mealTiers.find(t => t.name === taData.tierName);
                     if (found) selectedTienAnTier = found;
                  }
               } catch (e) {
                  console.error('Error parsing tienan from recent Doc:', e);
               }
            }
         }
         
         if (!selectedTienAnTier && mealTiers.length > 0) {
            selectedTienAnTier = mealTiers[0];
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

      let finalDiscountPercent = parseInt(student['giamhp%'], 10) || 0;
      let finalGiamHocphi = giamHocphi;

      if (finalDiscountPercent > 0) {
         finalGiamHocphi = Math.round((hocphi * finalDiscountPercent) / 100);
      } else if (hocphi > 0 && giamHocphi > 0) {
         finalDiscountPercent = parseFloat(((giamHocphi / hocphi) * 100).toFixed(2));
      }

      setInvoiceData({
         loaiDong, soLuong, ngayBatDau: startStr, ngayKetThuc: endMonthStr,
         hocphi, donGia: hocphi / (soLuong || 1), giamHocphi: finalGiamHocphi, discountPercent: finalDiscountPercent, hinhThuc, ghiChu, phuthu,
         selectedTienAnTier
      });

      // Logic thống kê điểm danh đã được chuyển sang useEffect bên dưới
   };

   // Auto update study summary when invoice start date changes
   useEffect(() => {
      if (!selectedStudent || !invoiceData.ngayBatDau) return;

      const fetchAttendance = async () => {
         try {
            const currentStart = new Date(invoiceData.ngayBatDau);
            if (isNaN(currentStart.getTime())) return;

            // Calculate previous month based on ngayBatDau
            const prevMonthDate = new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, 1);
            const statsStart = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), 1).toISOString().split('T')[0];
            const statsEnd = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).toISOString().split('T')[0];

            let scheduleToUse = activeClass?.thoigianbieu;
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

            const { data: attendance } = await supabase.from('tbl_diemdanh')
               .select('*')
               .eq('mahv', selectedStudent.mahv)
               .gte('ngay', statsStart)
               .lte('ngay', statsEnd);

            const normalizeStatus = (s) => (s || '').trim().toLowerCase();
            let daHoc = 0, nghiPhep = 0, nghiKhongPhep = 0;
            (attendance || []).forEach(att => {
               const s = normalizeStatus(att.trangthai);
               if (s === 'có mặt') daHoc++;
               else if (s === 'nghỉ phép') nghiPhep++;
               else if (s === 'nghỉ không phép') nghiKhongPhep++;
            });

            const groups = calculateConsecutiveLeave(attendance || []);
            const maxConsecutive = groups.length > 0 ? Math.max(...groups.map(g => g.so_ngay_nghi_lien_tuc)) : 0;

            const periodStr = `${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}/${prevMonthDate.getFullYear()}`;

            setStudySummary({
               daHoc,
               nghiPhep,
               nghiKhongPhep,
               tongBuoi,
               consecutiveLeave: groups,
               maxConsecutive,
               sourceHd: 'Tự động',
               period: periodStr
            });

         } catch (err) {
            console.error('Lỗi tính lại thống kê điểm danh:', err);
         }
      };

      fetchAttendance();
   }, [invoiceData.ngayBatDau, selectedStudent?.mahv, activeClass]);

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
         const valStr = String(value);
         if (valStr.trim() === '-') {
            newPT[index][field] = -0;
         } else {
            const isNeg = valStr.includes('-');
            const raw = valStr.replace(/\D/g, '');
            let num = parseInt(raw, 10) || 0;
            if (isNeg) num = -num;
            newPT[index][field] = num;
         }
      } else {
         newPT[index][field] = value;
      }
      setInvoiceData(prev => ({ ...prev, phuthu: newPT }));
   };

   const formatCurrency = (val) => {
      if (val === null || val === undefined || val === '') return '';
      if (Object.is(val, -0)) return '-';
      const num = typeof val === 'number' ? val : parseInt(String(val).replace(/,/g, ''), 10);
      if (isNaN(num)) return String(val);
      const isNeg = num < 0;
      const absNum = Math.abs(num);
      const formatted = absNum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return (isNeg ? '-' : '') + formatted;
   };

   const handleFinanceInput = (field, e) => {
      const val = e.target.value;
      if (val.trim() === '-') {
         setInvoiceData(prev => ({ ...prev, [field]: -0 }));
         return;
      }
      const isNegative = val.includes('-');
      const rawValue = val.replace(/\D/g, '');
      let num = parseInt(rawValue, 10) || 0;
      if (isNegative) num = -num;
      setInvoiceData(prev => {
         let next = { ...prev, [field]: num };
         if (field === 'hocphi') {
            if (prev.soLuong) next.donGia = num / prev.soLuong;
            if (prev.discountPercent > 0) {
               next.giamHocphi = Math.round((num * prev.discountPercent) / 100);
            }
         }
         if (field === 'giamHocphi') {
            next.discountPercent = 0;
         }
         return next;
      });
   };

   const handlePercentDiscount = (e) => {
      const val = e.target.value;
      if (val.trim() === '-') {
         setInvoiceData(prev => ({ ...prev, discountPercent: -0, giamHocphi: 0 }));
         return;
      }
      const isNeg = val.includes('-');
      const raw = val.replace(/[^\d.]/g, '');
      let pct = parseFloat(raw) || 0;
      if (isNeg) pct = -pct;

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

   const surchargeSum = (invoiceData.phuthu || []).reduce((sum, item) => sum + (item.amount || 0), 0);

   // Tính tiền ăn (Số ngày học + nghỉ không phép) * số tiền ăn 1 ngày
   const dailyMealFee = invoiceData.selectedTienAnTier ? invoiceData.selectedTienAnTier.val : 0;
   const trutiennghi_val = parseInt(String(config?.trutiennghi || '0').replace(/\D/g, '')) || 0;

   // Logic hoàn trả tiền học theo số ngày nghỉ liên tiếp (Cấu hình % từ tbl_config)
   let tuitionRefund = 0;
   const nlConfig = typeof config?.nghilientiep === 'string' ? JSON.parse(config.nghilientiep) : (config?.nghilientiep || { songaynghilientiep: 7, phantramgiam: 50 });
   const threshold = nlConfig.songaynghilientiep || 7;
   const percent = nlConfig.phantramgiam || 0;

   if (studySummary) {
      // 2. Hoàn trả học phí: Nghỉ liên tiếp từ threshold ngày trở lên
      if (studySummary.consecutiveLeave) {
         studySummary.consecutiveLeave.forEach(group => {
            const count = group.so_ngay_nghi_lien_tuc;
            if (count >= threshold) {
               tuitionRefund += count * trutiennghi_val * (percent / 100);
            }
         });
      }
   }

   const workingDaysCount = getWorkingDaysInMonth(invoiceData.ngayBatDau);
   const isMonthly = (invoiceData.loaiDong || '').toLowerCase().includes('tháng');

   const actualMealRefund = (studySummary && isMonthly) ? (studySummary.nghiPhep || 0) * dailyMealFee : 0;
   const actualTuitionRefund = tuitionRefund;
   const deductionSum = (studySummary ? actualTuitionRefund : 0) + actualMealRefund;

   // Tiền ăn tháng này = số ngày làm việc trong tháng * số tiền ăn 1 ngày
   const monthlyMealFee = isMonthly ? workingDaysCount * dailyMealFee : 0;
   const trutienan_val = dailyMealFee; // Giữ lại biến cho màn hình in nếu cần

   const tongCong = noCu + unpaidBillsTotal + invoiceData.hocphi + surchargeSum + monthlyMealFee - invoiceData.giamHocphi - deductionSum;
   const conLai = tongCong - invoiceData.daDong;

   const handleExportNotice = async (isPrintingParam = false) => {
      const isPrinting = isPrintingParam === true; // Strict check to avoid React event objects
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
         manv: auth.user?.manv || auth.user?.username || '',
         hocphi: formatCurrency(invoiceData.hocphi),
         giamhocphi: formatCurrency(invoiceData.giamHocphi),
         trutienan: formatCurrency(actualMealRefund),
         tiennghiphep: formatCurrency(actualTuitionRefund),
         tongcong: formatCurrency(tongCong),
         dadong: '0',
         conno: formatCurrency(tongCong),
         hinhthuc: invoiceData.hinhThuc,
         ghichu: `${invoiceData.ghiChu}${billNote}`,
         phuthu: invoiceData.phuthu && invoiceData.phuthu.length > 0 ? JSON.stringify(invoiceData.phuthu) : null,
         daxoa: null,
         malop: activeClass?.malop || '',
         thoiluong: currentTimePeriod,
         sobuoihoc: sobuoihocFinal,
         tienan: monthlyMealFee > 0 ? JSON.stringify({ days: workingDaysCount, amount: monthlyMealFee, tierName: invoiceData.selectedTienAnTier?.name, val: invoiceData.selectedTienAnTier?.val }) : null
      };

      try {
         const { error } = await supabase.from('tbl_thongbao').insert([insertData]);
         if (error) throw error;

         setDownloadingNotice({
            isPrinting,
            mahd: newMaTB,
            ngaylap: localNow,
            tenhv: selectedStudent.tenhv,
            mahv: selectedStudent.mahv,
            sdt: (selectedStudent.sdt || '').replace(/-/g, ''),
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
            studySummary: { ...studySummary, threshold },
            actualMealRefund,
            actualTuitionRefund,
            deductionSum,
            trutienan_val,
            trutiennghi_val,
            monthlyMealFee,
            workingDaysCount
         });
         insertLog(`[THÔNG BÁO] Đã thêm mới Thông báo ${newMaTB} - ${selectedStudent.tenhv} | Lớp: ${activeClass?.tenlop} | Tổng cộng: ${tongCong.toLocaleString('vi-VN')} đ | Thời lượng: ${sobuoihocFinal}`);
      } catch (err) {
         console.error(err);
         showMessage('error', 'Lỗi lưu thông báo: ' + err.message);
      }
   };

   const handlePrintNotice = async () => {
      await handleExportNotice(true);
   };

   const handlePrintInvoice = async () => {
      await handleSaveInvoice(true);
   };

   const handleSaveInvoice = async (isPrintingParam = false) => {
      const isPrinting = isPrintingParam === true; // Strict check 
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
                  message: `Học sinh này đã nộp học phí cho tháng ${overlappingMonth} rồi. Để tránh tính nhầm tiền, hệ thống sẽ từ chối thu học phí. Vui lòng kiểm tra lại các Hóa Đơn cũ!`
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
            trutienan: formatCurrency(actualMealRefund),
            tiennghiphep: formatCurrency(actualTuitionRefund),
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
            nocu: formatCurrency(noCu),
            tienan: monthlyMealFee > 0 ? JSON.stringify({ days: workingDaysCount, amount: monthlyMealFee, tierName: invoiceData.selectedTienAnTier?.name, val: invoiceData.selectedTienAnTier?.val }) : null
         };

         const res = await supabase.from('tbl_hd').insert([insertData]);
         if (res.error) throw res.error;

         // Nếu hóa đơn có tính nợ cũ, sau khi lưu thành công phải cập nhật các hóa đơn/bill cũ của học sinh về nợ = 0
         // vì nợ đó đã được gộp (rollup) vào hóa đơn mới này.
         if (noCu !== 0) {
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
                  .update({ conno: '0', daxacnhan: true })
                  .eq('mahv', selectedStudent.mahv);
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
            isPrinting,
            mahd: newMaHD,
            ngaylap: localNow,
            tenhv: selectedStudent.tenhv,
            sdt: (selectedStudent.sdt || '').replace(/-/g, ''),
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
            studySummary: { ...studySummary, threshold },
            actualMealRefund,
            actualTuitionRefund,
            deductionSum,
            trutienan_val,
            trutiennghi_val,
            monthlyMealFee,
            workingDaysCount
         });

         insertLog(`[PHIẾU THU] Đã thêm mới Hóa đơn ${newMaHD} - ${selectedStudent.tenhv} | Lớp: ${activeClass?.tenlop} | Tổng cộng: ${tongCong.toLocaleString('vi-VN')} đ | Thời lượng: ${sobuoihocFinal} | Đã đóng: ${invoiceData.daDong.toLocaleString('vi-VN')} đ`);

         // Reload old debt dynamically mimicking real-time refresh
         calculateOldDebt(selectedStudent.mahv);
         // daDong will auto-reset via useEffect when calculateOldDebt updates noCu/tongCong
      } catch (err) {
         console.error(err);
         showMessage('error', 'Lỗi khi thu học phí: ' + err.message);
      } finally {
         setIsSaving(false);
      }
   };
   const filteredStudents = students.filter(s =>
      (s.tenhv && s.tenhv.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (s.sdt && s.sdt.includes(searchTerm)) ||
      (s.mahv && s.mahv.toLowerCase().includes(searchTerm.toLowerCase()))
   );

   const groupedStudents = filteredStudents.reduce((acc, st) => {
      const className = st.malop_list && st.malop_list.length > 0
         ? (classes.find(c => c.malop === st.malop_list[0])?.tenlop || 'Lớp khác')
         : 'Chưa xếp lớp';
      if (!acc[className]) acc[className] = [];
      acc[className].push(st);
      return acc;
   }, {});

   Object.keys(groupedStudents).forEach(cls => {
      groupedStudents[cls].sort((a, b) => (a.tenhv || '').localeCompare(b.tenhv || '', 'vi'));
   });

   const sortedClasses = Object.keys(groupedStudents).sort((a, b) => {
      if (a === 'Chưa xếp lớp') return 1;
      if (b === 'Chưa xếp lớp') return -1;
      return a.localeCompare(b, 'vi');
   });

   // Auto fill daDong in InvoiceManager: Default to full payment
   useEffect(() => {
      setInvoiceData(prev => ({ ...prev, daDong: tongCong }));
   }, [tongCong, selectedStudent?.mahv, activeClass?.malop]);

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
               {sortedClasses.length > 0 ? sortedClasses.map(clsName => (
                  <React.Fragment key={clsName}>
                     <div className="im-group-header">
                        <BookOpen size={14} /> {clsName} ({groupedStudents[clsName].length})
                     </div>
                     {groupedStudents[clsName].map(st => {
                        const isActive = selectedStudent?.mahv === st.mahv;
                        return (
                           <div key={st.mahv} className={`im-student-card ${isActive ? 'active' : ''}`} onClick={() => handleSelectStudent(st)}>
                              <div className="im-card-name">
                                 {st.tenhv}
                              </div>
                              <div className="im-card-sub">SDT: {(st.sdt || '').replace(/-/g, '')}</div>
                              <div className="im-card-sub">Lớp: {clsName}</div>
                           </div>
                        );
                     })}
                  </React.Fragment>
               )) : (
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
                              <div className="val-text text-bold">{(selectedStudent.sdt || '').replace(/-/g, '')}</div>
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
                              <label>Giáo Viên:</label>
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
                                 <div className="ss-badge ss-consecutive">
                                    <span className="ss-num">{studySummary.maxConsecutive || 0}</span>
                                    <span className="ss-txt">Nghỉ liên tiếp</span>
                                 </div>
                              </div>
                              {studySummary.consecutiveLeave && studySummary.consecutiveLeave.length > 0 && studySummary.maxConsecutive >= 3 && (
                                 <div style={{ marginTop: '10px', color: '#d97706', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <AlertCircle size={16} />
                                    Có đợt nghỉ dài: {studySummary.maxConsecutive} ngày ({
                                       (() => {
                                          const longest = studySummary.consecutiveLeave.reduce((prev, curr) => (prev.so_ngay_nghi_lien_tuc > curr.so_ngay_nghi_lien_tuc) ? prev : curr);
                                          return `${new Date(longest.ngay_bat_dau_nghi).toLocaleDateString("vi-VN")} → ${new Date(longest.ngay_ket_thuc_nghi).toLocaleDateString("vi-VN")}`;
                                       })()
                                    })
                                 </div>
                              )}
                              {deductionSum > 0 && (
                                 <div style={{ marginTop: '10px', padding: '10px', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #10b981', color: '#065f46', fontSize: '0.9rem' }}>
                                    {actualTuitionRefund > 0 && (
                                       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                          <span>Hoàn trả học phí (Nghỉ liên tiếp ≥{threshold} ngày):</span>
                                          <span style={{ fontWeight: 700 }}>-{formatCurrency(actualTuitionRefund)}đ</span>
                                       </div>
                                    )}
                                    {actualMealRefund > 0 && (
                                       <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span>Hoàn trả tiền ăn (Nghỉ phép tháng trước):</span>
                                          <span style={{ fontWeight: 700 }}>-{formatCurrency(actualMealRefund)}đ</span>
                                       </div>
                                    )}
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
                        <div className="im-finance-row grid-4">
                           <div className="im-fi-item">
                              <label>Nợ cũ</label>
                              <div className={`fi-val-display ${noCu > 0 ? 'text-danger' : 'text-success'}`}>
                                 {formatCurrency(noCu)} ₫
                                 {noCu < 0 && <span style={{ fontSize: '0.7rem', marginLeft: '4px' }}>(Tiền dư)</span>}
                              </div>
                           </div>
                           <div className="im-fi-item">
                              <label>Tiền ăn {invoiceData.ngayBatDau ? `(T${new Date(invoiceData.ngayBatDau).getMonth() + 1})` : ''}</label>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                 {mealTiers.length > 0 && (
                                    <select
                                       value={invoiceData.selectedTienAnTier?.name || ''}
                                       onChange={(e) => {
                                          const tier = mealTiers.find(t => t.name === e.target.value);
                                          setInvoiceData(prev => ({ ...prev, selectedTienAnTier: tier }));
                                       }}
                                       style={{ padding: '4px', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%', height: '38px', fontSize: '0.9rem' }}
                                    >
                                       {mealTiers.map((t, idx) => (
                                          <option key={idx} value={t.name}>{t.name} ({formatCurrency(t.val)})</option>
                                       ))}
                                    </select>
                                 )}
                                 <div className="fi-val-display text-primary" style={{ height: '38px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 700 }}>
                                    {monthlyMealFee > 0 ? `${formatCurrency(monthlyMealFee)} ₫` : '0 ₫'}
                                 </div>
                              </div>
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
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                 <div className="fi-input-wrapper">
                                    <input type="text" placeholder="Nhập % giảm..." value={invoiceData.discountPercent > 0 ? invoiceData.discountPercent : ''} onChange={handlePercentDiscount} />
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

                        <div className="im-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '1.5rem', justifyContent: 'center' }}>
                           <button className="im-btn-submit" style={{ flex: '1 1 calc(50% - 10px)', minWidth: '160px', padding: '0.8rem 1rem', fontSize: '1.1rem', background: '#3b82f6', borderColor: '#3b82f6' }} onClick={() => handleExportNotice(false)}>
                              <MessageSquare size={18} />
                              Xuất Thông Báo
                           </button>
                           <button className="im-btn-submit" style={{ flex: '1 1 calc(50% - 10px)', minWidth: '160px', padding: '0.8rem 1rem', fontSize: '1.1rem' }} onClick={() => handleSaveInvoice(false)} disabled={isSaving}>
                              <Receipt size={18} />
                              {isSaving ? 'Đang tạo...' : 'Xác Nhận Xuất HĐ'}
                           </button>

                           <button className="im-btn-submit print-btn" style={{ flex: '1 1 calc(50% - 10px)', minWidth: '160px', padding: '0.8rem 1rem', fontSize: '1.1rem', background: '#fff', color: '#3b82f6', border: '1px solid #3b82f6' }} onClick={handlePrintNotice}>
                              <Printer size={18} />
                              In Thông Báo
                           </button>
                           <button className="im-btn-submit print-btn" style={{ flex: '1 1 calc(50% - 10px)', minWidth: '160px', padding: '0.8rem 1rem', fontSize: '1.1rem', background: '#fff', color: '#10b981', border: '1px solid #10b981' }} onClick={handlePrintInvoice}>
                              <Printer size={18} />
                              In Hóa Đơn
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
         {(downloadingInvoice || downloadingNotice) && document.body && createPortal(
         <div style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', overflow: 'hidden', opacity: 0.01, zIndex: -100, pointerEvents: 'none', background: '#ffffff' }}>
            {downloadingInvoice && (
            <div id="download-invoice-node" className="print-a5-receipt" style={{ width: '297mm', height: '210mm', background: '#fff', display: 'flex', opacity: 0.01, position: 'relative', overflow: 'hidden' }}>
               {[1, 2].map(copyNum => (
                  <div key={copyNum} className="receipt-copy">
                     {/* HEADER */}
                     <div className="p-header">
                        <div style={{ width: '80px' }}>
                           <img crossOrigin="anonymous" src={config?.logo || "/logo.png"} alt="logo" style={{ maxWidth: '70px', maxHeight: '50px', objectFit: 'contain' }} onError={(e) => { e.target.src = "/logo.png" }} />
                        </div>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                           <h3 style={{ fontSize: '14pt' }}>{config?.tencongty || 'Tên Trường'}</h3>
                           <p style={{ fontSize: '10pt' }}>ĐC: {config?.diachicongty}</p>
                           <p style={{ fontSize: '10pt' }}>SĐT: {config?.sdtcongty}</p>
                        </div>
                        <div style={{ width: '100px', textAlign: 'right', fontSize: '9pt' }}>
                           <div style={{ fontWeight: 800 }}>Mã HĐ: {downloadingInvoice?.mahd}</div>
                           <div style={{ fontSize: '8pt', opacity: 0.8 }}>{downloadingInvoice ? new Date(downloadingInvoice.ngaylap).toLocaleDateString("vi-VN") : "..."}</div>
                        </div>
                     </div>

                     <div className="p-title-area">
                        <h2 style={{ fontSize: '15pt' }}>BIÊN LAI THU HỌC PHÍ</h2>
                     </div>

                     <div className="p-content">
                        <div className="p-row">
                           <span className="p-label">Học viên:</span>
                           <span className="p-value" style={{ fontSize: '11pt' }}>{downloadingInvoice?.tenhv}</span>
                           <span className="p-label" style={{ minWidth: '40px' }}>Lớp:</span>
                           <span className="p-value">{downloadingInvoice?.tenlop}</span>
                        </div>
                        <div className="p-row">
                           <span className="p-label">SĐT liên hệ:</span>
                           <span className="p-value">{downloadingInvoice?.sdt || ""}</span>
                           <span className="p-label" style={{ minWidth: '60px' }}>Đóng cho:</span>
                           <span className="p-value">{downloadingInvoice?.thoiluong}</span>
                        </div>

                        <div style={{ marginTop: '8px', borderTop: '1px solid #000', paddingTop: '6px' }}>
                           <div className="p-row">
                              <span style={{ flex: 1 }}>- Học phí: <b>{downloadingInvoice?.hocphi} đ</b></span>
                              <span style={{ flex: 1, textAlign: 'right' }}>- Tiền ăn: <b>{formatCurrency(downloadingInvoice?.monthlyMealFee || 0)} đ</b></span>
                           </div>
                           <div className="p-row">
                              <span style={{ flex: 1 }}>- Ưu đãi: <b>{downloadingInvoice?.giamhocphi} đ</b></span>
                              <span style={{ flex: 1, textAlign: 'right' }}>- Nợ cũ: <b>{downloadingInvoice?.nocu || 0} đ</b></span>
                           </div>

                           {downloadingInvoice?.phuthu && downloadingInvoice.phuthu.length > 0 && (
                              <div style={{ margin: '4px 0', padding: '4px 8px', background: '#f9fafb', borderRadius: '4px', border: '1px solid #eee' }}>
                                 {downloadingInvoice.phuthu.map((pt, i) => (
                                    <div key={i} className="p-row" style={{ marginBottom: 0 }}>
                                       <span>+ {pt.name || 'Phụ thu'}:</span>
                                       <span style={{ marginLeft: 'auto' }}><b>{formatCurrency(pt.amount)} đ</b></span>
                                    </div>
                                 ))}
                              </div>
                           )}

                           {downloadingInvoice?.actualTuitionRefund > 0 && (
                              <div style={{ margin: '2px 0', borderTop: '1px dashed #ddd', paddingTop: '4px' }}>
                                 <div className="p-row" style={{ fontSize: '8.5pt' }}>
                                    <span style={{ marginLeft: 'auto' }}>Hoàn HP: <b>-{formatCurrency(Math.round(downloadingInvoice?.actualTuitionRefund || 0))} đ</b></span>
                                 </div>
                              </div>
                           )}
                           
                           {downloadingInvoice?.actualMealRefund > 0 && (
                              <div style={{ margin: '2px 0', borderTop: '1px dashed #ddd', paddingTop: '4px' }}>
                                 <div className="p-row" style={{ fontSize: '8.5pt' }}>
                                    <span style={{ marginLeft: 'auto' }}>Hoàn TA: <b>-{formatCurrency(Math.round(downloadingInvoice?.actualMealRefund || 0))} đ</b></span>
                                 </div>
                              </div>
                           )}
                        </div>

                        <div className="p-row" style={{ marginTop: '8px', padding: '5px 8px', background: '#0ea5e9', color: '#fff', borderRadius: '4px' }}>
                           <span style={{ color: '#fff', fontWeight: 900, fontSize: '11pt' }}>TỔNG CỘNG:</span>
                           <span style={{ marginLeft: 'auto', color: '#fff', fontWeight: 950, fontSize: '12pt' }}>{downloadingInvoice?.tongcong} đ</span>
                        </div>

                        <div className="p-row" style={{ marginTop: '4px' }}>
                           <span style={{ fontWeight: 800 }}>Đã đóng: <span style={{ color: '#059669 !important' }}>{downloadingInvoice?.dadong} đ</span></span>
                           <span style={{ marginLeft: 'auto', fontWeight: 800 }}>Còn nợ: <span style={{ color: '#dc2626 !important' }}>{downloadingInvoice?.conno} đ</span></span>
                        </div>

                        <div className="p-row" style={{ fontSize: '8.5pt' }}>
                           <span>HÌNH THỨC:</span>
                           <span className="p-value">{downloadingInvoice?.hinhthuc}</span>
                        </div>
                        {downloadingInvoice?.ghichu && (
                           <div className="p-row" style={{ fontSize: '8pt', fontStyle: 'italic' }}>
                              <span>Ghi chú: {downloadingInvoice.ghichu}</span>
                           </div>
                        )}
                     </div>

                     <div className="p-signatures">
                        <div className="sig-box">
                           <h4>Người nộp tiền</h4>
                           <p>(Ký, họ tên)</p>
                        </div>
                        <div className="sig-box">
                           <h4>Người lập phiếu</h4>
                           <p>(Ký, họ tên)</p>
                           <div className="sig-name">{downloadingInvoice?.nhanvien || cashier}</div>
                        </div>
                     </div>
                  </div>
               ))}
            </div>
            )}

            {downloadingNotice && (
            <div id="download-notice-node" className="print-a5-receipt" style={{ width: '148.5mm', height: '210mm', background: '#fff', display: 'flex', opacity: 0.01, position: 'relative', overflow: 'hidden' }}>
               <div className="receipt-copy" style={{ borderRight: 'none' }}>
                  {/* HEADER */}
                  <div className="p-header">
                     <div style={{ width: '80px' }}>
                        <img crossOrigin="anonymous" src={config?.logo || "/logo.png"} alt="logo" style={{ maxWidth: '70px', maxHeight: '50px', objectFit: 'contain' }} onError={(e) => { e.target.src = "/logo.png" }} />
                     </div>
                     <div style={{ flex: 1, textAlign: 'center' }}>
                        <h3 style={{ fontSize: '14pt' }}>{config?.tencongty || 'Tên Trường'}</h3>
                        <p style={{ fontSize: '10pt' }}>ĐC: {config?.diachicongty}</p>
                        <p style={{ fontSize: '10pt' }}>SĐT: {config?.sdtcongty}</p>
                     </div>
                     <div style={{ width: '100px', textAlign: 'right', fontSize: '9pt' }}>
                        <div style={{ fontWeight: 800 }}>Mã TB: {downloadingNotice?.mahd}</div>
                        <div style={{ fontSize: '8pt', opacity: 0.8 }}>{downloadingNotice ? new Date(downloadingNotice.ngaylap).toLocaleDateString("vi-VN") : "..."}</div>
                     </div>
                  </div>

                  <div className="p-title-area">
                     <h2 style={{ fontSize: '15pt' }}>THÔNG BÁO THU HỌC PHÍ</h2>
                  </div>

                  <div className="p-content">
                     <div className="p-row">
                        <span className="p-label">Họ tên:</span>
                        <span className="p-value" style={{ fontSize: '11pt' }}>{downloadingNotice?.tenhv}</span>
                        <span className="p-label" style={{ minWidth: '40px' }}>Lớp:</span>
                        <span className="p-value">{downloadingNotice?.tenlop}</span>
                     </div>
                     <div className="p-row">
                        <span className="p-label">SĐT liên hệ:</span>
                        <span className="p-value">{downloadingNotice?.sdt || ""}</span>
                        <span className="p-label" style={{ minWidth: '60px' }}>Đóng cho:</span>
                        <span className="p-value">{downloadingNotice?.thoiluong}</span>
                     </div>

                     <div style={{ marginTop: '8px', borderTop: '1px solid #000', paddingTop: '6px' }}>
                        <div className="p-row">
                           <span style={{ flex: 1 }}>- Học phí: <b>{downloadingNotice?.hocphi} đ</b></span>
                           <span style={{ flex: 1, textAlign: 'right' }}>- Tiền ăn: <b>{formatCurrency(downloadingNotice?.monthlyMealFee || 0)} đ</b></span>
                        </div>
                        <div className="p-row">
                           <span style={{ flex: 1 }}>- Ưu đãi: <b>{downloadingNotice?.giamhocphi} đ</b></span>
                           <span style={{ flex: 1, textAlign: 'right' }}>- Nợ cũ: <b>{formatCurrency(noCu)} đ</b></span>
                        </div>

                        {downloadingNotice?.phuthu && downloadingNotice.phuthu.length > 0 && (
                           <div style={{ margin: '4px 0', padding: '4px 8px', background: '#f9fafb', borderRadius: '4px', border: '1px solid #eee' }}>
                              {downloadingNotice.phuthu.map((pt, i) => (
                                 <div key={i} className="p-row" style={{ marginBottom: 0 }}>
                                    <span>+ {pt.name || 'Phụ thu'}:</span>
                                    <span style={{ marginLeft: 'auto' }}><b>{formatCurrency(pt.amount)} đ</b></span>
                                 </div>
                              ))}
                           </div>
                        )}

                        {downloadingNotice?.actualTuitionRefund > 0 && (
                           <div style={{ margin: '2px 0', borderTop: '1px dashed #ddd', paddingTop: '4px' }}>
                              <div className="p-row" style={{ fontSize: '8.5pt' }}>
                                 <span style={{ marginLeft: 'auto' }}>Hoàn HP: <b>-{formatCurrency(Math.round(downloadingNotice?.actualTuitionRefund || 0))} đ</b></span>
                              </div>
                           </div>
                        )}
                        
                        {downloadingNotice?.actualMealRefund > 0 && (
                           <div style={{ margin: '2px 0', borderTop: '1px dashed #ddd', paddingTop: '4px' }}>
                              <div className="p-row" style={{ fontSize: '8.5pt' }}>
                                 <span style={{ marginLeft: 'auto' }}>Hoàn TA: <b>-{formatCurrency(Math.round(downloadingNotice?.actualMealRefund || 0))} đ</b></span>
                              </div>
                           </div>
                        )}
                     </div>

                     <div className="p-row" style={{ marginTop: '8px', padding: '5px 8px', background: '#0ea5e9', color: '#fff', borderRadius: '4px' }}>
                        <span style={{ color: '#fff', fontWeight: 900, fontSize: '11pt' }}>TỔNG CẦN NỘP:</span>
                        <span style={{ marginLeft: 'auto', color: '#fff', fontWeight: 900, fontSize: '12pt' }}>{downloadingNotice?.tongcong} đ</span>
                     </div>

                     <div className="p-row" style={{ fontSize: '8.5pt', marginTop: '5px' }}>
                        <span>HÌNH THỨC:</span>
                        <span className="p-value">{downloadingNotice?.hinhthuc}</span>
                     </div>
                     {downloadingNotice?.ghichu && (
                        <div className="p-row" style={{ fontSize: '8pt', fontStyle: 'italic' }}>
                           <span>Ghi chú: {downloadingNotice.ghichu}</span>
                        </div>
                     )}
                     <div style={{ fontSize: '7pt', marginTop: '5px', color: '#ef4444', fontWeight: 600 }}>
                        * Quý phụ huynh vui lòng hoàn thành học phí trước ngày 10 hàng tháng. Trân trọng!
                     </div>
                  </div>

                  <div className="p-signatures">
                     <div className="sig-box">
                        <h4>Người nộp tiền</h4>
                        <p>(Ký, họ tên)</p>
                     </div>
                     <div className="sig-box">
                        <h4>Nhà trường</h4>
                        <p>(Ký, đóng dấu)</p>
                        <div className="sig-name">{cashier}</div>
                     </div>
                  </div>
               </div>
            </div>
            )}
         </div>,
         document.body
         )}

         {(downloadingNotice || downloadingInvoice) && (
            <div style={{ zIndex: 9999, position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.8)" }}>
               <div style={{ padding: "20px 40px", background: "white", borderRadius: "8px", boxShadow: "0 4px 20px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", alignItems: "center", gap: "15px" }}>
                  <div style={{ border: "4px solid #e2e8f0", borderTop: "4px solid #0ea5e9", borderRadius: "50%", width: "40px", height: "40px", animation: "im-spin 1s linear infinite" }}></div>
                  <p style={{ fontWeight: "bold", color: "#0f172a", margin: 0, fontSize: "1.1rem" }}>Đang chuẩn bị file in...</p>
                  <p style={{ color: "#64748b", margin: 0, fontSize: "0.9rem" }}>Vui lòng đợi trong giây lát</p>
               </div>
               <style>{`@keyframes im-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
         )}

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


