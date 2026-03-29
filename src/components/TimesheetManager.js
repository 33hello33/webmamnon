import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase';
import { Search, Calendar, FileText, Download, Users, ChevronLeft, ChevronRight, Save, Clock, AlertCircle, CheckCircle, X, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import './TimesheetManager.css';
import { useConfig } from '../ConfigContext';

export default function TimesheetManager() {
   const { config } = useConfig();
   const walletsConfig = (config ? [
      { id: 'vi1', name: config.vi1?.name || '' },
      { id: 'vi2', name: config.vi2?.name || '' },
      { id: 'vi3', name: config.vi3?.name || '' },
      { id: 'vi4', name: config.vi4?.name || '' }
   ].filter(w => w.name && w.name.trim() !== '') : []);

   const [employees, setEmployees] = useState([]);
   const [activeTeacher, setActiveTeacher] = useState(null);
   const [classesList, setClassesList] = useState([]);
   const [statsMap, setStatsMap] = useState({});
   const [searchTeacher, setSearchTeacher] = useState('');
   const [loading, setLoading] = useState(true);

   // Extras
   const [extras, setExtras] = useState([{ label: 'Tiền Trợ Cấp (Cơm, Xe,...)', amount: 0 }]);
   const [note, setNote] = useState('');

   // Modals
   const [warningModal, setWarningModal] = useState({ isOpen: false, title: '', message: '' });
   const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
   const [paymentMethod, setPaymentMethod] = useState('Tiền mặt');

   // Calendar Modal
   const [showCalendar, setShowCalendar] = useState(false);
   const [calendarClass, setCalendarClass] = useState(null);
   const [currentDate, setCurrentDate] = useState(new Date());

   // Teaching schedule for the month
   const [scheduleData, setScheduleData] = useState([]);
   const [dirtySchedule, setDirtySchedule] = useState({});
   const [showSubjectMenu, setShowSubjectMenu] = useState(null);

   const [showMobileDetails, setShowMobileDetails] = useState(false);
   const [globalDate, setGlobalDate] = useState(new Date());

   // Base data fetch
   useEffect(() => {
      const fetchBase = async () => {
         setLoading(true);
         try {
            const { data: nvData } = await supabase
               .from('tbl_nv')
               .select('*')
               .in('role', ['Giáo viên', 'Trợ giảng'])
               .eq('trangthai', 'Đang Làm');
            setEmployees(nvData || []);
         } catch (err) {
            console.error(err);
         } finally {
            setLoading(false);
         }
      };
      fetchBase();
   }, []);



   const formatCurrency = (val) => {
      if (val === 0) return '0';
      if (!val) return '';
      return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
   };

   const loadTeacherStats = async (teacher, targetDate) => {
      if (!teacher) return;

      const startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1, 0, 0, 0);
      const endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);

      const localStart = new Date(startDate.getTime() - startDate.getTimezoneOffset() * 60000).toISOString();
      const localEnd = new Date(endDate.getTime() - endDate.getTimezoneOffset() * 60000).toISOString();

      try {
         // 1. Get their own classes (as main teacher or TA)
         const { data: allClassesData } = await supabase.from('tbl_lop').select('*');
         const maxTa = parseInt(process.env.REACT_APP_MAX_TA || '0', 10);

         const ownClasses = (allClassesData || []).filter(c => {
            if (c.manv === teacher.manv) return true;
            for (let i = 1; i <= maxTa; i++) {
               if (c[`manv${i}`] === teacher.manv) return true;
            }

            return false;
         });

         // 2. Get substituted classes (where they taught but they don't own the class)
         const { data: subClassesRaw } = await supabase.from('tbl_chamconggv')
            .select('malop')
            .eq('manv', teacher.manv)
            .eq('trangthai', 'Dạy Thay')
            .gte('ngayday', localStart)
            .lte('ngayday', localEnd);

         const ownClassIds = new Set((ownClasses || []).map(c => c.malop));
         const subClassIds = new Set((subClassesRaw || []).map(c => c.malop));
         ownClassIds.forEach(id => subClassIds.delete(id));

         let mergedClasses = [...(ownClasses || []).map(c => ({ ...c, isSub: false }))];

         if (subClassIds.size > 0) {
            const { data: otherClasses } = await supabase.from('tbl_lop').select('*').in('malop', Array.from(subClassIds));
            if (otherClasses) {
               mergedClasses = [...mergedClasses, ...otherClasses.map(c => ({ ...c, isSub: true }))];
            }
         }

         setClassesList(mergedClasses);

         // 3. Get total sessions (Có dạy + Dạy Thay) for each class IN THIS MONTH
         const { data: attendanceInfo } = await supabase.from('tbl_chamconggv')
            .select('malop, trangthai')
            .eq('manv', teacher.manv)
            .gte('ngayday', localStart)
            .lte('ngayday', localEnd);

         const counts = {};
         (attendanceInfo || []).forEach(row => {
            if (row.trangthai === 'Có dạy' || row.trangthai === 'Dạy Thay') {
               counts[row.malop] = (counts[row.malop] || 0) + 1;
            }
         });

         // 4. Get recent salary definition for this teacher from the JSON content of the latest slip
         const { data: recentSlips } = await supabase.from('tbl_phieuchamcong')
            .select('*')
            .eq('manv', teacher.manv)
            .is('daxoa', null)
            .order('ngaylap', { ascending: false })
            .limit(1);

         const lastSlip = recentSlips && recentSlips.length > 0 ? recentSlips[0] : null;
         let lastParsedRows = [];
         if (lastSlip && lastSlip.noidung) {
            try { lastParsedRows = JSON.parse(lastSlip.noidung); } catch (e) { }
         }

         // Helper to find rate from last slip for a specific class
         const findRateForClass = (tenlop, thoigian) => {
            const entry = lastParsedRows.find(r =>
               r["Hạng mục"] === `${tenlop} (${thoigian || '-'})` &&
               (r["Phân loại"] === "Lớp chính" || r["Phân loại"] === "Dạy thay")
            );
            return entry ? parseInt(entry["Đơn giá"] || '0', 10) : null;
         };

         const sMap = {};
         mergedClasses.forEach(c => {
            const lastRate = findRateForClass(c.tenlop, c.thoigianbieu);
            sMap[c.malop] = {
               count: counts[c.malop] || 0,
               rate: lastRate || parseInt(teacher.luongtheobuoi || '100000', 10)
            };
         });
         setStatsMap(sMap);

         // 5. Restore Extras from the last slip
         const lastExtras = lastParsedRows
            .filter(r => r["Phân loại"] === "Phụ cấp / Thưởng")
            .map(r => ({ label: r["Hạng mục"], amount: parseInt(r["Đơn giá"] || '0', 10) }));

         if (lastExtras.length > 0) setExtras(lastExtras);
         else setExtras([{ label: 'Tiền Trợ Cấp (Cơm, Xe,...)', amount: 0 }]);

         // Restore Note from the last slip if any
         setNote(lastSlip?.ghichu || '');

      } catch (err) {
         console.error(err);
      }
   };

   useEffect(() => {
      if (activeTeacher) {
         loadTeacherStats(activeTeacher, globalDate);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [activeTeacher, globalDate]);

   const handleSelectTeacher = (teacher) => {
      setActiveTeacher(teacher);
      setShowMobileDetails(true);
      setExtras([{ label: 'Tiền Trợ Cấp (Cơm, Xe,...)', amount: 0 }]);
      setNote('');
      setClassesList([]);
      setStatsMap({});
      setPaymentMethod(walletsConfig.length > 0 ? walletsConfig[0].name : 'Tiền mặt');
   };

   const handleRateChange = (malop, value) => {
      const rawVal = value.replace(/,/g, '').replace(/\D/g, '');
      const num = parseInt(rawVal, 10) || 0;
      setStatsMap(prev => ({
         ...prev,
         [malop]: { ...prev[malop], rate: num }
      }));
   };

   const shiftGlobalMonth = (offset) => {
      const newD = new Date(globalDate);
      newD.setMonth(newD.getMonth() + offset);
      setGlobalDate(newD);
   };

   const openCalendar = async (cls) => {
      setCalendarClass(cls);
      setDirtySchedule({});
      setShowCalendar(true);
      setCurrentDate(globalDate); // sync calendar to global month picker
      await loadScheduleForMonth(cls.malop, globalDate.getFullYear(), globalDate.getMonth());
   };

   const loadScheduleForMonth = async (malop, year, month) => {
      // Start and end of the month
      const startDate = new Date(year, month, 1, 0, 0, 0);
      const endDate = new Date(year, month + 1, 0, 23, 59, 59);

      // Fix timezone formatting
      const localStart = new Date(startDate.getTime() - startDate.getTimezoneOffset() * 60000).toISOString();
      const localEnd = new Date(endDate.getTime() - endDate.getTimezoneOffset() * 60000).toISOString();

      try {
         const { data } = await supabase.from('tbl_chamconggv')
            .select('*')
            .eq('malop', malop)
            .gte('ngayday', localStart)
            .lte('ngayday', localEnd);

         setScheduleData(data || []);
      } catch (err) {
         console.error(err);
      }
   };

   const shiftMonth = async (offset) => {
      const newDate = new Date(currentDate);
      newDate.setMonth(newDate.getMonth() + offset);
      setCurrentDate(newDate);
      if (calendarClass) {
         await loadScheduleForMonth(calendarClass.malop, newDate.getFullYear(), newDate.getMonth());
      }
   };

   // Calendar logic
   const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
   const getFirstDayOfMonth = (year, month) => {
      let d = new Date(year, month, 1).getDay();
      // Adjust Sunday (0) to 6, others to d-1 for Monday-start
      return d === 0 ? 6 : d - 1;
   };

   const currentYear = currentDate.getFullYear();
   const currentMonth = currentDate.getMonth();
   const daysInMonth = getDaysInMonth(currentYear, currentMonth);
   const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

   const getDaySchedule = (day) => {
      const dateStrPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      if (dirtySchedule[day] !== undefined) {
         return dirtySchedule[day]; // local override, could be null if deleted
      }

      // Check DB fetched data
      const record = scheduleData.find(r => r.ngayday.startsWith(dateStrPrefix));
      return record || null;
   };

   const handleDayClick = (day) => {
      const existing = getDaySchedule(day);
      if (existing && existing.trangthai === 'Có dạy' && existing.manv === activeTeacher.manv) {
         // Toggle off
         setDirtySchedule(prev => ({ ...prev, [day]: null }));
      } else {
         // Toggle on for active teacher
         const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+07:00`;
         setDirtySchedule(prev => ({
            ...prev, [day]: {
               manv: activeTeacher.manv,
               malop: calendarClass.malop,
               ngayday: dateStr,
               trangthai: 'Có dạy',
               _id: existing?.id, // track original ID to update/delete
               _isSub: false
            }
         }));
      }
   };

   const handleDayContextMenu = (e, day) => {
      e.preventDefault();
      setShowSubjectMenu({ day, x: e.clientX, y: e.clientY });
   };

   const assignSubstitute = (day, substituteTeacher) => {
      const existing = getDaySchedule(day);
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+07:00`;
      setDirtySchedule(prev => ({
         ...prev, [day]: {
            manv: substituteTeacher.manv,
            malop: calendarClass.malop,
            ngayday: dateStr,
            trangthai: 'Dạy Thay',
            _id: existing?.id,
            _subName: substituteTeacher.tennv || substituteTeacher.manv
         }
      }));
      setShowSubjectMenu(null);
   };

   const saveCalendar = async () => {
      setLoading(true);
      try {
         const updates = [];
         const inserts = [];
         const deletes = [];

         for (const [day, data] of Object.entries(dirtySchedule)) {
            const original = scheduleData.find(r => r.ngayday.startsWith(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`));

            if (data === null) {
               if (original) deletes.push(original.id);
            } else {
               if (data._id) {
                  updates.push({
                     id: data._id,
                     manv: data.manv,
                     trangthai: data.trangthai,
                  });
               } else {
                  inserts.push({
                     malop: data.malop,
                     manv: data.manv,
                     ngayday: data.ngayday,
                     trangthai: data.trangthai
                  });
               }
            }
         }

         if (deletes.length > 0) {
            await supabase.from('tbl_chamconggv').delete().in('id', deletes);
         }
         if (updates.length > 0) {
            for (let u of updates) {
               await supabase.from('tbl_chamconggv').update({ manv: u.manv, trangthai: u.trangthai }).eq('id', u.id);
            }
         }
         if (inserts.length > 0) {
            await supabase.from('tbl_chamconggv').insert(inserts);
         }

         setDirtySchedule({});
         await loadScheduleForMonth(calendarClass.malop, currentYear, currentMonth);
         // Refetch class teaching counts
         loadTeacherStats(activeTeacher, globalDate);

      } catch (err) {
         console.error(err);
         alert("Lỗi khi lưu lịch chấm công!");
      } finally {
         setLoading(false);
      }
   };

   // Export File logic

   const [isPrinting, setIsPrinting] = useState(false);

   useEffect(() => {
      const handleAfterPrint = () => setIsPrinting(false);
      window.addEventListener('afterprint', handleAfterPrint);
      return () => window.removeEventListener('afterprint', handleAfterPrint);
   }, []);

   const calculateTotal = () => {
      let total = 0;
      classesList.forEach(cls => {
         const stats = statsMap[cls.malop];
         if (stats) {
            total += stats.count * stats.rate;
         }
      });
      extras.forEach(ex => {
         total += ex.amount;
      });
      return total;
   };

   const handleAddExtra = () => {
      setExtras([...extras, { label: 'Mục bổ sung', amount: 0 }]);
   };

   const handleRemoveExtra = (index) => {
      setExtras(extras.filter((_, i) => i !== index));
   };

   const handleUpdateExtra = (index, field, value) => {
      const newExtras = [...extras];
      if (field === 'amount') {
         const rawVal = value.replace(/,/g, '').replace(/\D/g, '');
         newExtras[index][field] = parseInt(rawVal, 10) || 0;
      } else {
         newExtras[index][field] = value;
      }
      setExtras(newExtras);
   };

   const handleExportExcel = () => {
      if (!activeTeacher) return;

      // Merge current extras into exported notes for Excel row
      const extrasStr = extras.filter(ex => ex.amount > 0).map(ex => `${ex.label}: ${formatCurrency(ex.amount)}`).join(' | ');
      const finalNote = note ? `${note}${extrasStr ? ' | ' + extrasStr : ''}` : extrasStr;

      const excelData = [
         ['BẢNG KÊ CHI TIẾT LƯƠNG GIẢNG VIÊN'],
         [`Kỳ chấm công: Tháng ${globalDate.getMonth() + 1} / ${globalDate.getFullYear()}`],
         ['Tên giảng viên:', activeTeacher.tennv],
         ['Ngày xuất:', new Date().toLocaleDateString('vi-VN')],
         [''],
         ['STT', 'Tên Lớp', 'Lịch Học', 'Phân Loại', 'Số buổi dạy', 'Lương/Buổi', 'Thành tiền']
      ];

      let idx = 1;
      let totalClassSalary = 0;
      classesList.forEach(c => {
         const stats = statsMap[c.malop];
         if (stats) {
            const amt = stats.count * stats.rate;
            totalClassSalary += amt;
            excelData.push([
               idx++,
               c.tenlop,
               `${c.thoigianbieu || '-'} (${c.giohoc || '-'})`,
               c.isSub ? 'Dạy thay' : 'Lớp chính',
               stats.count,
               stats.rate,
               amt
            ]);
         }
      });

      excelData.push(['', '', '', '', '', 'TỔNG LƯƠNG GIẢNG DẠY', totalClassSalary]);
      // Add dynamic extras
      extras.forEach(ex => {
         excelData.push(['', '', '', '', '', ex.label, ex.amount]);
      });
      excelData.push(['Ghi chú:', finalNote]);
      excelData.push(['TỔNG THỰC NHẬN (VNĐ):', formatCurrency(calculateTotal())]);

      const ws = XLSX.utils.aoa_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Chấm công");

      XLSX.writeFile(wb, `ChamCong_${activeTeacher.manv}_${globalDate.getMonth() + 1}_${globalDate.getFullYear()}.xlsx`);
   };

   const handlePrint = () => {
      setIsPrinting(true);
      setTimeout(() => {
         window.print();
      }, 500);
   };

   const filteredEmployees = employees.filter(e => {
      const n = (e.tennv || '').toLowerCase();
      const m = (e.manv || '').toLowerCase();
      const s = searchTeacher.toLowerCase();
      return n.includes(s) || m.includes(s);
   });

   const handleCreateTimesheet = async () => {
      if (!activeTeacher) return;

      const numTotal = calculateTotal();
      if (numTotal === 0) {
         setWarningModal({
            isOpen: true,
            title: 'Lỗi',
            message: 'Tổng thanh toán ước tính đang là 0đ. Hệ thống không thể xuất/trả phiếu lương rỗng!'
         });
         return;
      }

      setLoading(true);
      try {
         const luongThangStr = `${String(globalDate.getMonth() + 1).padStart(2, '0')}/${globalDate.getFullYear()}`;

         // Kiểm tra trùng lặp
         const { data: existingRecords, error: checkError } = await supabase
            .from('tbl_phieuchamcong')
            .select('id')
            .eq('manv', activeTeacher.manv)
            .eq('luongthang', luongThangStr)
            .is('daxoa', null);

         if (checkError) throw checkError;

         if (existingRecords && existingRecords.length > 0) {
            setWarningModal({
               isOpen: true,
               title: 'Phát hiện Trùng Lặp',
               message: `Giảng viên ${activeTeacher.tennv} đã được chốt và xuất Phiếu Lương cho Tháng ${luongThangStr} rồi!\nNếu bạn cố ý làm lại, xin hãy vào tab Tài chính > QL Phiếu Lương, xóa đi Phiếu lương bị sai để hệ thống cho phép tạo lại.`
            });
            setLoading(false);
            return;
         }

         // Generate internal content as a unified list of items for the JSON record
         const finalRows = [];
         classesList.forEach(c => {
            const stats = statsMap[c.malop];
            if (stats && stats.count > 0) {
               finalRows.push({
                  "Hạng mục": `${c.tenlop} (${c.thoigianbieu || '-'})`,
                  "Phân loại": c.isSub ? "Dạy thay" : "Lớp chính",
                  "Số lượng": String(stats.count),
                  "Đơn giá": String(stats.rate),
                  "Thành tiền": String(stats.count * stats.rate)
               });
            }
         });

         // Append extras to the JSON rows
         extras.filter(ex => ex.amount > 0).forEach(ex => {
            finalRows.push({
               "Hạng mục": ex.label,
               "Phân loại": "Phụ cấp / Thưởng",
               "Số lượng": "1",
               "Đơn giá": String(ex.amount),
               "Thành tiền": String(ex.amount)
            });
         });

         const noidungJSON = JSON.stringify(finalRows);
         const localNow = new Date(new Date() - new Date().getTimezoneOffset() * 60000).toISOString();

         const { error } = await supabase.from('tbl_phieuchamcong').insert({
            manv: activeTeacher.manv,
            tennv: activeTeacher.tennv || activeTeacher.manv,
            ngaylap: localNow,
            noidung: noidungJSON,
            tongcong: String(numTotal),
            ghichu: note || '',
            hinhthuc: paymentMethod,
            luongthang: luongThangStr,
            daxacnhan: false
         });

         if (error) {
            console.error(error);
            setWarningModal({ isOpen: true, title: 'Lỗi', message: "Lỗi kết nối CSDL, thử lại sau: " + error.message });
         } else {
            setSuccessModal({
               isOpen: true,
               title: 'Xuất Phiếu Thành Công!',
               message: 'Phiếu lương đã được ghi nhận. Di chuyển qua bộ phận Kế Toán (Tab Tài Chính) để xác nhận chuyển tiền!'
            });
         }
      } catch (err) {
         console.error(err);
         setWarningModal({ isOpen: true, title: 'Lỗi Không Xác Định', message: 'Hệ thống gián đoạn, vui lòng tải lại trang và thử lại.' });
      } finally {
         setLoading(false);
      }
   };

   return (
      <div className={`timesheet-manager animate-fade-in ${showMobileDetails ? 'mobile-show-details' : ''}`}>

         <div className="tm-layout">
            {/* Left panel */}
            <div className="tm-left-pane">
               <div className="tm-search">
                  <Search size={20} className="text-muted" />
                  <input
                     type="text"
                     placeholder="Tìm mã, tên giáo viên..."
                     value={searchTeacher}
                     onChange={(e) => setSearchTeacher(e.target.value)}
                  />
               </div>
               <div className="tm-employee-list">
                  {filteredEmployees.map(emp => (
                     <div
                        key={emp.manv}
                        className={`tm-employee-card ${activeTeacher?.manv === emp.manv ? 'active' : ''}`}
                        onClick={() => handleSelectTeacher(emp)}
                     >
                        <div className="tm-card-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <Users size={16} />
                           {emp.tennv}
                        </div>
                        <div className="tm-card-sub">{emp.manv} - {emp.role || 'Giáo viên'}</div>
                     </div>
                  ))}
                  {filteredEmployees.length === 0 && <div className="text-center p-3 text-muted">Không tìm thấy giáo viên.</div>}
               </div>
            </div>

            {/* Right panel */}
            <div className={`tm-right-pane ${showMobileDetails ? 'active' : ''}`}>
               {!activeTeacher ? (
                  <div className="tm-empty-state">
                     <Clock size={48} className="text-muted" style={{ opacity: 0.3, marginBottom: '20px' }} />
                     <h3>Chọn Giảng Viên</h3>
                     <p>Bấm vào danh sách bên trái để lấy danh sách lớp học và bắt đầu chấm công ghi nhận lương.</p>
                  </div>
               ) : (
                  <div className="tm-content">
                     {/* Mobile Header Actions */}
                     <div className="mobile-header-actions">
                        <button className="btn-back" onClick={() => setShowMobileDetails(false)}>
                           <X size={20} /> Quay lại danh sách
                        </button>
                     </div>

                     {/* Lecturer Info Compact */}
                     <div className="tm-teacher-section-compact" style={{ padding: '0 1.5rem', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', padding: '12px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
                           <div style={{ display: 'flex', gap: '5px' }}>
                              <span style={{ color: '#64748b', fontWeight: 600 }}>Mã GV:</span>
                              <span style={{ color: '#1e293b', fontWeight: 700 }}>{activeTeacher.manv}</span>
                           </div>
                           <div style={{ display: 'flex', gap: '5px' }}>
                              <span style={{ color: '#64748b', fontWeight: 600 }}>Tên GV:</span>
                              <span className="text-primary" style={{ fontWeight: 800 }}>{activeTeacher.tennv}</span>
                           </div>
                           <div style={{ display: 'flex', gap: '5px' }}>
                              <span style={{ color: '#64748b', fontWeight: 600 }}>Chức vụ:</span>
                              <span style={{ color: '#1e293b', fontWeight: 700 }}>{activeTeacher.role || 'Giáo viên'}</span>
                           </div>
                        </div>
                     </div>

                     {/* Header Controls */}
                     <div className="tm-header">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                           <h2 className="tm-title" style={{ width: '100%', textAlign: 'center' }}>Chi Tiết Bảng Công: <span className="text-primary">{activeTeacher.tennv}</span></h2>

                           {/* Global Month Picker Centered */}
                           <div className="tm-global-month" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', width: '100%', maxWidth: '280px' }}>
                              <button className="tm-btn-icon" onClick={() => shiftGlobalMonth(-1)} style={{ padding: '6px' }}>
                                 <ChevronLeft size={18} />
                              </button>
                              <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', flex: 1, textAlign: 'center' }}>
                                 Tháng {globalDate.getMonth() + 1} / {globalDate.getFullYear()}
                              </span>
                              <button className="tm-btn-icon" onClick={() => shiftGlobalMonth(1)} style={{ padding: '6px' }}>
                                 <ChevronRight size={18} />
                              </button>
                           </div>
                        </div>

                        <div className="tm-actions">
                           <button className="tm-btn-outline" onClick={handleExportExcel}><Download size={18} /> Xuất Excel</button>
                           <button className="tm-btn-primary" onClick={handlePrint}><FileText size={18} /> In Phiếu A5 (PDF)</button>
                        </div>
                     </div>

                     {/* Classes Table / Mobile Cards */}
                     <div className="tm-card">
                        <div className="tm-table-wrapper">
                           <table className="tm-table">
                              <thead>
                                 <tr>
                                    <th>STT</th>
                                    <th>Tên Lớp</th>
                                    <th>Lịch Học</th>
                                    <th>Vai Trò</th>
                                    <th className="text-center">Số Buổi Dạy</th>
                                    <th className="text-right">Lương/Buổi (VNĐ)</th>
                                    <th className="text-center">Lịch</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {classesList.map(cls => {
                                    const stats = statsMap[cls.malop] || { count: 0, rate: 0 };
                                    return (
                                       <tr key={cls.malop}>
                                          <td className="text-slate-500">{classesList.indexOf(cls) + 1}</td>
                                          <td className="font-bold text-slate-800">{cls.tenlop}</td>
                                          <td className="text-sm text-slate-600">
                                             {cls.thoigianbieu || '-'} ({cls.giohoc || '-'})
                                          </td>
                                          <td>
                                             {cls.isSub
                                                ? <span className="tm-badge-warning">Dạy thay</span>
                                                : <span className="tm-badge-success">Lớp chính</span>}
                                          </td>
                                          <td className="text-center font-bold text-primary">{stats.count}</td>
                                          <td className="text-right">
                                             <input
                                                type="text"
                                                className="tm-salary-input text-right font-bold"
                                                value={formatCurrency(stats.rate)}
                                                onChange={(e) => handleRateChange(cls.malop, e.target.value)}
                                                style={{ width: '120px', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                             />
                                          </td>
                                          <td className="text-center">
                                             <button
                                                className="tm-btn-icon text-primary"
                                                title="Chấm công chi tiết bằng lịch"
                                                onClick={() => openCalendar(cls)}
                                             >
                                                <Calendar size={18} />
                                             </button>
                                          </td>
                                       </tr>
                                    )
                                 })}
                                 {classesList.length === 0 && (
                                    <tr>
                                       <td colSpan="7" className="text-center p-4 text-muted font-italic">Giáo viên này chưa phụ trách lớp nào trong hệ thống.</td>
                                    </tr>
                                 )}
                              </tbody>
                           </table>
                        </div>

                        {/* Mobile Card List for Classes */}
                        <div className="tm-mobile-cards">
                           {classesList.map(cls => {
                              const stats = statsMap[cls.malop] || { count: 0, rate: 0 };
                              return (
                                 <div key={cls.malop} className="tm-class-card">
                                    <div className="tm-class-card-header">
                                       <div>
                                          <div className="tm-class-name">{cls.tenlop}</div>
                                          <div className="tm-class-id">{cls.thoigianbieu || '-'} ({cls.giohoc || '-'})</div>
                                       </div>
                                       {cls.isSub
                                          ? <span className="tm-badge-warning">Thay</span>
                                          : <span className="tm-badge-success">Chính</span>}
                                    </div>
                                    <div className="tm-class-card-body">
                                       <div className="tm-stat">
                                          <label>Số buổi:</label>
                                          <span className="text-primary font-bold">{stats.count}</span>
                                       </div>
                                       <div className="tm-stat">
                                          <label>Lương/buổi:</label>
                                          <input
                                             type="text"
                                             value={formatCurrency(stats.rate)}
                                             onChange={(e) => handleRateChange(cls.malop, e.target.value)}
                                          />
                                       </div>
                                    </div>
                                    <button className="tm-btn-calendar-mobile" onClick={() => openCalendar(cls)}>
                                       <Calendar size={16} /> Chấm công chi tiết
                                    </button>
                                 </div>
                              );
                           })}
                           {classesList.length === 0 && (
                              <div className="text-center p-4 text-muted bg-slate-50 rounded-lg">Chưa phụ trách lớp nào.</div>
                           )}
                        </div>
                     </div>

                     {/* Extras & Summary */}
                     <div className="tm-summary-section">
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>
                           <div className="tm-extras-dynamic" style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
                              {extras.map((ex, idx) => (
                                 <div className="tm-input-group" key={idx} style={{ position: 'relative' }}>
                                    <input
                                       className="tm-extra-label-input"
                                       value={ex.label}
                                       onChange={(e) => handleUpdateExtra(idx, 'label', e.target.value)}
                                       style={{ border: 'none', background: 'transparent', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px', outline: 'none', display: 'block', width: '100%' }}
                                    />
                                    <div className="tm-input-wrapper">
                                       <input
                                          type="text"
                                          value={formatCurrency(ex.amount)}
                                          onChange={(e) => handleUpdateExtra(idx, 'amount', e.target.value)}
                                       />
                                       <span>₫</span>
                                       {extras.length > 1 && (
                                          <button onClick={() => handleRemoveExtra(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', marginLeft: '5px', cursor: 'pointer' }}><X size={14} /></button>
                                       )}
                                    </div>
                                 </div>
                              ))}
                              <button onClick={handleAddExtra} style={{ alignSelf: 'center', background: '#eff6ff', border: '1px dashed #3b82f6', color: '#3b82f6', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem', fontWeight: 600 }}>
                                 <Plus size={14} /> Thêm mục
                              </button>
                           </div>

                           <div className="tm-note-section">
                              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Ghi chú công & lương:</label>
                              <textarea
                                 placeholder="Nhập thông tin ghi chú (nếu có)..."
                                 value={note}
                                 onChange={(e) => setNote(e.target.value)}
                                 style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', minHeight: '60px', outline: 'none', resize: 'none' }}
                              />
                           </div>
                        </div>

                        <div className="tm-total">
                           <div className="tm-payment-method-select" style={{ marginBottom: '15px' }}>
                               <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>💳 Hình thức chi trả:</label>
                               <select 
                                 value={paymentMethod} 
                                 onChange={(e) => setPaymentMethod(e.target.value)}
                                 style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', outline: 'none', background: '#fff' }}
                               >
                                  {walletsConfig.length === 0 && <option value="Tiền mặt">Tiền mặt</option>}
                                  {walletsConfig.map(w => (
                                     <option key={w.id} value={w.name}>{w.name}</option>
                                  ))}
                               </select>
                            </div>

                           <span>Tổng Thanh Toán Ước Tính:</span>
                           <h2 className="text-success" style={{ marginBottom: '10px' }}>{formatCurrency(calculateTotal())} ₫</h2>
                           <button
                              onClick={handleCreateTimesheet}
                              style={{ padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 6px rgba(16, 185, 129, 0.2)', transition: '0.2s' }}
                              onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                              onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                           >
                              Xuất Phiếu Lương Lên Tài Chính
                           </button>
                        </div>
                     </div>

                  </div>
               )}
            </div>
         </div>

         {/* Print Version A5 */}
         {isPrinting && activeTeacher && createPortal(
            <div className="print-a5-receipt" id="print-timesheet">
               {/* HEADER */}
               <div className="p-header" style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                     <h3 style={{ margin: 0 }}>
                        {process.env.REACT_APP_COMPANY_NAME || 'Anh Ngữ Kỹ Năng E - Skills'}
                     </h3>
                     <p>{process.env.REACT_APP_COMPANY_ADDRESS || 'ĐC: 668 Phùng Hưng, An Phước, Đồng Nai'}</p>
                     <p>{process.env.REACT_APP_COMPANY_PHONE || 'SĐT: 0327.797.787'}</p>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                     <div>Giảng viên: <b>{activeTeacher.manv}</b></div>
                     <div>
                        Ngày in:{" "}
                        {new Date().toLocaleDateString("vi-VN")}
                     </div>
                     <img
                        src={process.env.REACT_APP_LOGO_URL || "/logo.png"}
                        alt="logo"
                        style={{ width: 80, marginTop: 5 }}
                     />
                  </div>
               </div>

               {/* TITLE */}
               <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "18pt", margin: "10px 0" }}>
                  PHIẾU LƯƠNG GIẢNG VIÊN
               </div>

               {/* INFO */}
               <div style={{ fontSize: "13pt", lineHeight: "1.8" }}>

                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                     <div>Họ và tên: <b>{activeTeacher.tennv}</b></div>
                     <div>Kỳ lương: <b>Tháng {globalDate.getMonth() + 1} / {globalDate.getFullYear()}</b></div>
                  </div>

                  <div>
                     Chức vụ: <b>{activeTeacher.chucvu || 'Giảng Viên'}</b>
                  </div>

                  {/* BẢNG LƯƠNG */}
                  <div style={{ marginTop: '15px', marginBottom: '15px' }}>
                     <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid black', fontSize: '12pt' }}>
                        <thead>
                           <tr>
                              <th style={{ border: '1px solid black', padding: '5px', textAlign: 'left' }}>Tên Lớp Phụ Trách</th>
                              <th style={{ border: '1px solid black', padding: '5px' }}>Lịch Học</th>
                              <th style={{ border: '1px solid black', padding: '5px' }}>Phân Loại</th>
                              <th style={{ border: '1px solid black', padding: '5px' }}>Buổi</th>
                              <th style={{ border: '1px solid black', padding: '5px', textAlign: 'right' }}>Đơn Giá / Buổi</th>
                              <th style={{ border: '1px solid black', padding: '5px', textAlign: 'right' }}>Thành Tiền</th>
                           </tr>
                        </thead>
                        <tbody>
                           {classesList.map(c => {
                              const stats = statsMap[c.malop] || { count: 0, rate: 0 };
                              if (stats.count === 0) return null;
                              return (
                                 <tr key={c.malop}>
                                    <td style={{ border: '1px solid black', padding: '5px' }}>{c.tenlop}</td>
                                    <td style={{ border: '1px solid black', padding: '5px', fontSize: '10pt' }}>{c.thoigianbieu} ({c.giohoc})</td>
                                    <td style={{ border: '1px solid black', padding: '5px', textAlign: 'center' }}>{c.isSub ? 'Dạy thay' : 'Lớp chính'}</td>
                                    <td style={{ border: '1px solid black', padding: '5px', textAlign: 'center' }}>{stats.count}</td>
                                    <td style={{ border: '1px solid black', padding: '5px', textAlign: 'right' }}>{formatCurrency(stats.rate)}</td>
                                    <td style={{ border: '1px solid black', padding: '5px', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(stats.count * stats.rate)}</td>
                                 </tr>
                              )
                           })}
                        </tbody>
                     </table>
                  </div>

                  {/* TIỀN TIỂU MỤC */}
                  <div style={{ marginTop: '10px' }}>
                     {extras.filter(ex => ex.amount > 0).map((ex, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                           <div>{ex.label}:</div>
                           <div>{formatCurrency(ex.amount)} ₫</div>
                        </div>
                     ))}
                     {extras.filter(ex => ex.amount > 0).length === 0 && (
                        <div style={{ color: '#999', fontSize: '10pt' }}>* Không có phụ cấp/thưởng thêm</div>
                     )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", margin: '15px 0' }}>
                     <div style={{ fontWeight: "bold" }}>TỔNG THỰC NHẬN: <span style={{ fontSize: '15pt' }}>{formatCurrency(calculateTotal())} ₫</span></div>
                  </div>

                  <div style={{ fontSize: '11pt', borderTop: '1px dashed #ccc', paddingTop: '10px' }}>
                     Ghi chú: {note || '........................................................................'}
                  </div>
               </div>

               {/* FOOTER */}
               <div style={{ marginTop: 40, fontSize: "12pt", display: "flex", justifyContent: "space-between" }}>

                  <div>
                     <b>Ngày ..... tháng ..... Năm 20 .....</b> <br /><br />
                     <div style={{ textAlign: "center" }}>
                        Nhân viên lập phiếu <br />
                        (Ký và ghi rõ họ tên)<br /><br /><br /><br />
                     </div>
                  </div>

                  <div style={{ textAlign: "center" }}>
                     <br /><br />
                     Người nhận tiền <br />(Ký và ghi rõ họ tên)<br /><br /><br /><br />
                     <b>{activeTeacher.tennv}</b>
                  </div>

               </div>
            </div>,
            document.body
         )}

         {/* Calendar Modal */}
         {showCalendar && calendarClass && createPortal(
            <div className="tm-modal-overlay">
               <div className="tm-calendar-modal animate-slide-up">
                  <div className="tm-cal-header">
                     <div>
                        <h3>Lịch Dạy Lớp: <span className="text-primary">{calendarClass.tenlop}</span></h3>
                        <p style={{ fontSize: '10pt' }}>Nhấp trái chuột: Bật/Tắt điểm danh. Nhấp phải chuột: Chọn người dạy thay.</p>
                     </div>
                     <button className="tm-close-btn" onClick={() => setShowCalendar(false)}>
                        Đóng Lịch
                     </button>
                  </div>

                  <div className="tm-cal-controls">
                     <button onClick={() => shiftMonth(-1)}><ChevronLeft size={20} /></button>
                     <h2 className="tm-current-month">Tháng {currentMonth + 1} / {currentYear}</h2>
                     <button onClick={() => shiftMonth(1)}><ChevronRight size={20} /></button>
                  </div>

                  <div className="tm-cal-grid">
                     <div className="tm-cal-day-header">T2</div>
                     <div className="tm-cal-day-header">T3</div>
                     <div className="tm-cal-day-header">T4</div>
                     <div className="tm-cal-day-header">T5</div>
                     <div className="tm-cal-day-header">T6</div>
                     <div className="tm-cal-day-header text-danger">T7</div>
                     <div className="tm-cal-day-header text-danger">CN</div>

                     {/* Empty cells before month begins */}
                     {Array.from({ length: firstDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="tm-cal-cell empty"></div>
                     ))}

                     {/* Days of the month */}
                     {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const schedule = getDaySchedule(day);

                        let cellClass = "";
                        let textStatus = "";
                        if (schedule) {
                           if (schedule.trangthai === 'Có dạy' && schedule.manv === activeTeacher.manv) {
                              cellClass = "active-teach";
                              textStatus = "Có dạy";
                           } else if (schedule.trangthai === 'Dạy Thay') {
                              // If active teacher IS the substitute
                              if (schedule.manv === activeTeacher.manv) {
                                 cellClass = "active-sub";
                                 textStatus = "Đã đi dạy thay";
                              } else {
                                 cellClass = "other-sub";
                                 textStatus = `Được dạy thay bởi: ${schedule._subName || schedule.manv}`;
                              }
                           } else if (schedule.manv !== activeTeacher.manv && schedule.trangthai === 'Có dạy') {
                              // Some other teacher holds owner status somehow?
                              textStatus = "Giáo viên khác dạy";
                           }
                        }

                        return (
                           <div
                              key={`day-${day}`}
                              className={`tm-cal-cell ${cellClass}`}
                              onClick={() => handleDayClick(day)}
                              onContextMenu={(e) => handleDayContextMenu(e, day)}
                           >
                              <span className="tm-day-num">{day}</span>
                              {textStatus && <span className="tm-status-text">{textStatus}</span>}
                              {Object.keys(dirtySchedule).includes(day.toString()) && <div className="tm-dirty-dot"></div>}
                           </div>
                        );
                     })}
                  </div>

                  <div className="tm-cal-footer">
                     {loading && <span className="text-muted">Đang cập nhật dữ liệu...</span>}
                     {!loading && Object.keys(dirtySchedule).length > 0 && <span className="text-warning">Bạn đang có thay đổi chưa lưu!</span>}
                     <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
                        <button className="tm-btn-outline" onClick={() => { setShowCalendar(false); setDirtySchedule({}); }}>Hủy Thay Đổi</button>
                        <button className="tm-btn-primary" onClick={saveCalendar} disabled={loading}><Save size={18} /> Lưu Lịch Chấm Công</button>
                     </div>
                  </div>

               </div>
            </div>,
            document.body
         )}

         {/* Context Menu for Substitute Teacher */}
         {showSubjectMenu && createPortal(
            <div
               className="tm-context-menu"
               style={{ top: showSubjectMenu.y + 5 + 'px', left: showSubjectMenu.x + 5 + 'px' }}
               onMouseLeave={() => setShowSubjectMenu(null)}
            >
               <div className="context-header">Chọn Giáo Viên Dạy Thay</div>
               <div className="context-list">
                  {employees.filter(e => e.manv !== activeTeacher.manv).map(emp => (
                     <div
                        key={emp.manv}
                        className="context-item"
                        onClick={() => assignSubstitute(showSubjectMenu.day, emp)}
                     >
                        {emp.tennv} ({emp.manv})
                     </div>
                  ))}
               </div>
            </div>,
            document.body
         )}

         {/* Warning Modal */}
         {warningModal.isOpen && createPortal(
            <div className="im-modal-overlay">
               <div className="im-warning-modal animate-slide-up">
                  <button className="im-close-btn" onClick={() => setWarningModal({ ...warningModal, isOpen: false })}>
                     <X size={20} />
                  </button>
                  <div className="im-warning-icon">
                     <AlertCircle size={52} />
                  </div>
                  <h3>{warningModal.title}</h3>
                  <p style={{ whiteSpace: 'pre-line' }}>{warningModal.message}</p>
                  <div className="im-warning-actions">
                     <button className="im-btn-warn-ok" onClick={() => setWarningModal({ ...warningModal, isOpen: false })}>
                        Đã Hiểu & Kiểm Tra Lại
                     </button>
                  </div>
               </div>
            </div>,
            document.body
         )}

         {/* Success Modal */}
         {successModal.isOpen && createPortal(
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
                        Hoàn Thành
                     </button>
                  </div>
               </div>
            </div>,
            document.body
         )}
      </div>
   );
}
