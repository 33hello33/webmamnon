import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase, baseSupabase, generateId, insertLog } from '../supabase';
import { Search, Save, Download, Users, ChevronLeft, ChevronRight, CheckCircle, AlertCircle, ArrowRight, Printer } from 'lucide-react';
import * as XLSX from 'xlsx';
import './TimesheetManager.css';
import { useConfig } from '../ConfigContext';

// Vietnamese Currency Reader helper
const READ_NUMBER_VN = (number) => {
   const defaultNumbers = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
   const units = ['', 'nghìn', 'triệu', 'tỉ', 'nghìn tỉ', 'triệu tỉ'];

   function readGroup(group, isFull) {
      let text = '';
      const tram = Math.floor(group / 100);
      const chuc = Math.floor((group % 100) / 10);
      const donvi = group % 10;

      if (isFull || tram > 0) {
         text += defaultNumbers[tram] + ' trăm ';
      }

      if (chuc === 0) {
         if ((isFull || tram > 0) && donvi > 0) text += 'lẻ ';
      } else if (chuc === 1) {
         text += 'mười ';
      } else {
         text += defaultNumbers[chuc] + ' mươi ';
      }

      if (donvi > 0) {
         if (donvi === 1 && chuc > 1) {
            text += 'mốt ';
         } else if (donvi === 5 && chuc > 0) {
            text += 'lăm ';
         } else {
            text += defaultNumbers[donvi] + ' ';
         }
      }
      return text.trim();
   }

   if (number === 0) return 'Không đồng';
   if (!number || isNaN(number)) return '';
   if (number < 0) return 'Âm ' + READ_NUMBER_VN(-number);

   let strVal = Math.floor(number).toString();
   let i = 0;
   let result = '';

   while (strVal.length > 0) {
      let groupLen = strVal.length % 3 || 3;
      let groupVal = parseInt(strVal.substring(0, groupLen), 10);
      strVal = strVal.substring(groupLen);

      if (groupVal > 0) {
         let groupText = readGroup(groupVal, i > 0);
         result += groupText + ' ' + units[strVal.length / 3] + ' ';
      }
      i++;
   }

   result = result.trim();
   if (!result) return 'Không đồng';

   // Capitalize first letter and append 'đồng'
   return result.charAt(0).toUpperCase() + result.slice(1) + ' đồng';
};

const pCur = (val) => {
   if (val === undefined || val === null || val === '') return 0;
   const sVal = String(val).replace(/,/g, '');
   if (sVal === '-') return 0;
   const parsed = parseInt(sVal, 10);
   return isNaN(parsed) ? 0 : parsed;
};

const fCur = (val) => {
   if (val === undefined || val === null || val === '') return '0';
   const sVal = String(val).replace(/,/g, '');
   if (sVal === '-') return '-';
   const parsed = parseInt(sVal, 10);
   return isNaN(parsed) ? '0' : parsed.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

export default function TimesheetManager({ currentUser, setActiveTab, setActiveSubTab }) {
   const { config } = useConfig();
   const schoolName = config?.tencongty || process.env.REACT_APP_COMPANY_NAME;

   const walletOptions = useMemo(() => (config ? [
      { id: 'vi1', name: config.vi1?.name || '' },
      { id: 'vi2', name: config.vi2?.name || '' },
      { id: 'vi3', name: config.vi3?.name || '' },
      { id: 'vi4', name: config.vi4?.name || '' }
   ].filter(w => w.name && w.name.trim() !== '') : []), [config]);

   const [employees, setEmployees] = useState([]);
   const [searchTeacher, setSearchTeacher] = useState('');
   const [selectedEmployee, setSelectedEmployee] = useState(null);
   const [loading, setLoading] = useState(false);
   const [saving, setSaving] = useState(false);

   // Month state (defaults to current month: MM/YYYY)
   const [currentDate, setCurrentDate] = useState(new Date());

   // Form data for Pay Slip
   const [formData, setFormData] = useState({
      manv: '',
      tennv: '',
      chucvu: '',
      // Earnings
      luongcoban: 0,
      chuyencan: 0,
      phucap_bhxh: 0,
      phucap_trachnhiem: 0,
      phucap_dilai: 0,
      phucap_chuyenmon: 0,
      phucap_khac: 0,
      thuongle: 0,
      tangluong: 0,
      // Deductions
      khautru_bhxh: 0,
      tamung: 0,
      khautru_khac: 0,
      // Meta
      hinhthuc: walletOptions.length > 0 ? walletOptions[0].name : 'Tiền mặt',
      nguoilap: currentUser?.tennv || currentUser?.manv || 'Quản lý',
      nguoiduyet: 'Người nhận lương',
      ghichu: ''
   });

   const [existingRecord, setExistingRecord] = useState(null);
   const [successModal, setSuccessModal] = useState({ isOpen: false, message: '', recordId: '' });
   const [warningModal, setWarningModal] = useState({ isOpen: false, title: '', message: '' });

   const monthStr = `${String(currentDate.getMonth() + 1).padStart(2, '0')}/${currentDate.getFullYear()}`;

   // 1. Fetch employees
   useEffect(() => {
      const fetchEmployees = async () => {
         setLoading(true);
         try {
            const { data } = await supabase
               .from('tbl_nv')
               .select('*')
               .order('manv', { ascending: true });
            const valid = (data || []).filter(e => e.trangthai !== 'Đã nghỉ' && e.trangthai !== 'Đã xóa');
            setEmployees(valid);
            if (valid.length > 0) {
               setSelectedEmployee(prev => prev || valid[0]);
            }
         } catch (err) {
            console.error('Lỗi lấy danh sách NV:', err);
         } finally {
            setLoading(false);
         }
      };
      fetchEmployees();
   }, []);

   // 2. Fetch or initialize salary record for selected employee & month
   const loadSalaryForEmployee = useCallback(async (emp, dateObj) => {
      if (!emp) return;
      const targetMonthStr = `${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
      setLoading(true);
      try {
         let { data, error } = await supabase
            .from('tbl_luong')
            .select('*')
            .eq('manv', emp.manv)
            .eq('thang', targetMonthStr)
            .maybeSingle();

         if (error && (error.message || '').toLowerCase().includes('schema cache')) {
            const baseRes = await baseSupabase
               .from('tbl_luong')
               .select('*')
               .eq('manv', emp.manv)
               .eq('thang', targetMonthStr)
               .maybeSingle();
            data = baseRes.data;
            error = baseRes.error;
         }

         if (!error && data) {
            setExistingRecord(data);
            setFormData({
               manv: data.manv || emp.manv,
               tennv: data.tennv || emp.tennv,
               chucvu: data.chucvu || emp.role || 'Nhân viên',
               luongcoban: pCur(data.luongcoban),
               chuyencan: pCur(data.chuyencan),
               phucap_bhxh: pCur(data.phucap_bhxh),
               phucap_trachnhiem: pCur(data.phucap_trachnhiem),
               phucap_dilai: pCur(data.phucap_dilai),
               phucap_chuyenmon: pCur(data.phucap_chuyenmon),
               phucap_khac: pCur(data.phucap_khac),
               thuongle: pCur(data.thuongle),
               tangluong: pCur(data.tangluong),
               khautru_bhxh: pCur(data.khautru_bhxh),
               tamung: pCur(data.tamung),
               khautru_khac: pCur(data.khautru_khac),
               hinhthuc: data.hinhthuc || (walletOptions.length > 0 ? walletOptions[0].name : 'Tiền mặt'),
               nguoilap: data.nguoilap || currentUser?.tennv || currentUser?.manv || 'Quản lý',
               nguoiduyet: data.nguoiduyet || 'Người nhận lương',
               ghichu: data.ghichu || ''
            });
         } else {
            setExistingRecord(null);
            setFormData({
               manv: emp.manv,
               tennv: emp.tennv,
               chucvu: emp.role || 'Nhân viên',
               luongcoban: pCur(emp.luongcoban || emp.luongtheobuoi || 0),
               chuyencan: 0,
               phucap_bhxh: 0,
               phucap_trachnhiem: 0,
               phucap_dilai: 0,
               phucap_chuyenmon: 0,
               phucap_khac: 0,
               thuongle: 0,
               tangluong: 0,
               khautru_bhxh: 0,
               tamung: 0,
               khautru_khac: 0,
               hinhthuc: walletOptions.length > 0 ? walletOptions[0].name : 'Tiền mặt',
               nguoilap: currentUser?.tennv || currentUser?.manv || 'Quản lý',
               nguoiduyet: 'Người nhận lương',
               ghichu: ''
            });
         }
      } catch (err) {
         console.error('Lỗi tải phiếu lương:', err);
      } finally {
         setLoading(false);
      }
   }, [currentUser, walletOptions]);

   useEffect(() => {
      if (selectedEmployee) {
         loadSalaryForEmployee(selectedEmployee, currentDate);
      }
   }, [selectedEmployee, currentDate, loadSalaryForEmployee]);

   // Handlers
   const handleSelectEmployee = (emp) => {
      setSelectedEmployee(emp);
   };

   const shiftMonth = (offset) => {
      const newD = new Date(currentDate);
      newD.setMonth(newD.getMonth() + offset);
      setCurrentDate(newD);
   };

   const handleInputChange = (field, value) => {
      setFormData(prev => ({
         ...prev,
         [field]: value
      }));
   };

   const handleNumberChange = (field, rawValue) => {
      const num = pCur(rawValue);
      setFormData(prev => ({
         ...prev,
         [field]: num
      }));
   };

   // Calculations
   const tongThuNhap = (
      pCur(formData.luongcoban) +
      pCur(formData.chuyencan) +
      pCur(formData.phucap_bhxh) +
      pCur(formData.phucap_trachnhiem) +
      pCur(formData.phucap_dilai) +
      pCur(formData.phucap_chuyenmon) +
      pCur(formData.phucap_khac) +
      pCur(formData.thuongle) +
      pCur(formData.tangluong)
   );

   const tongKhauTru = (
      pCur(formData.khautru_bhxh) +
      pCur(formData.tamung) +
      pCur(formData.khautru_khac)
   );

   const thucNhan = tongThuNhap - tongKhauTru;
   const bangChuText = READ_NUMBER_VN(thucNhan);

   // Save to Finance
   const handleSaveToFinance = async () => {
      if (!formData.manv || !formData.tennv) {
         setWarningModal({
            isOpen: true,
            title: 'Chưa chọn nhân viên',
            message: 'Vui lòng chọn hoặc nhập mã và tên nhân viên trước khi lưu.'
         });
         return;
      }

      setSaving(true);
      try {
         let maphieuluong = existingRecord?.maphieuluong;
         if (!maphieuluong) {
            maphieuluong = await generateId('tbl_luong', 'maphieuluong', 'PL', 4);
         }

         const recordPayload = {
            maphieuluong,
            manv: formData.manv,
            tennv: formData.tennv,
            chucvu: formData.chucvu,
            thang: monthStr,
            luongcoban: pCur(formData.luongcoban),
            chuyencan: pCur(formData.chuyencan),
            phucap_bhxh: pCur(formData.phucap_bhxh),
            phucap_trachnhiem: pCur(formData.phucap_trachnhiem),
            phucap_dilai: pCur(formData.phucap_dilai),
            phucap_chuyenmon: pCur(formData.phucap_chuyenmon),
            phucap_khac: pCur(formData.phucap_khac),
            thuongle: pCur(formData.thuongle),
            tangluong: pCur(formData.tangluong),
            tongthunhap: tongThuNhap,
            khautru_bhxh: pCur(formData.khautru_bhxh),
            tamung: pCur(formData.tamung),
            khautru_khac: pCur(formData.khautru_khac),
            tongkhautru: tongKhauTru,
            thucnhan: thucNhan,
            bangchu: bangChuText,
            hinhthuc: formData.hinhthuc,
            nguoilap: formData.nguoilap || currentUser?.tennv || 'Hệ thống',
            nguoiduyet: formData.nguoiduyet || 'Người nhận lương',
            ghichu: formData.ghichu,
            trangthai: existingRecord?.trangthai || 'Chờ duyệt',
            ngaylap: existingRecord?.ngaylap || new Date().toISOString()
         };

         let res = await supabase.from('tbl_luong').upsert([recordPayload]);
         if (res.error) {
            console.warn('Query anchau.tbl_luong failed, trying public.tbl_luong fallback:', res.error);
            const baseRes = await baseSupabase.from('tbl_luong').upsert([recordPayload]);
            if (!baseRes.error) {
               res = baseRes;
            }
         }
         if (res.error) {
            throw new Error(res.error.message || res.error.details || JSON.stringify(res.error));
         }

         await insertLog(`[LƯU PHIẾU LƯƠNG] Mã: ${maphieuluong} | NV: ${formData.tennv} | Tháng: ${monthStr} | Thực nhận: ${fCur(thucNhan)}đ`);

         setSuccessModal({
            isOpen: true,
            message: `Đã lưu phiếu lương tháng ${monthStr} cho nhân viên ${formData.tennv} (${formData.manv}) thành công lên tài chính với trạng thái "Chờ duyệt"!`,
            recordId: maphieuluong
         });

         loadSalaryForEmployee(selectedEmployee, currentDate);

      } catch (err) {
         console.error('Lỗi khi lưu phiếu lương:', err);
         setWarningModal({
            isOpen: true,
            title: 'Lưu thất bại',
            message: 'Đã xảy ra lỗi khi lưu phiếu lương lên cơ sở dữ liệu: ' + (err.message || 'Lỗi không xác định')
         });
      } finally {
         setSaving(false);
      }
   };

   // Export to Excel
   const handleExportExcel = () => {
      if (!formData.manv) return;

      const excelData = [
         [`PHIẾU LƯƠNG NHÂN VIÊN`],
         [`Tháng: ${monthStr}`],
         [`Mã nhân viên: ${formData.manv}`],
         [`Họ và tên: ${formData.tennv}`],
         [`Chức vụ: ${formData.chucvu}`],
         [''],
         ['DANH MỤC', 'SỐ TIỀN (VNĐ)'],
         ['--- KHOẢN THU ---', ''],
         ['LƯƠNG CƠ BẢN', fCur(formData.luongcoban)],
         ['CHUYÊN CẦN', fCur(formData.chuyencan)],
         ['PHỤ CẤP BHXH/BHYT/BHTN', fCur(formData.phucap_bhxh)],
         ['PHỤ CẤP TRÁCH NHIỆM', fCur(formData.phucap_trachnhiem)],
         ['PHỤ CẤP ĐI LẠI', fCur(formData.phucap_dilai)],
         ['PHỤ CẤP CHUYÊN MÔN', fCur(formData.phucap_chuyenmon)],
         ['PHỤ CẤP KHÁC', fCur(formData.phucap_khac)],
         ['THƯỞNG LỄ', fCur(formData.thuongle)],
         ['TĂNG LƯƠNG', fCur(formData.tangluong)],
         ['TỔNG THU NHẬP', fCur(tongThuNhap)],
         [''],
         ['--- KHOẢN KHẤU TRỪ ---', ''],
         ['KHẤU TRỪ BHXH/BHYT/BHTN', fCur(formData.khautru_bhxh)],
         ['Tạm ứng', fCur(formData.tamung)],
         ['Khấu trừ khác', fCur(formData.khautru_khac)],
         ['TỔNG KHẤU TRỪ', fCur(tongKhauTru)],
         [''],
         ['THỰC NHẬN', fCur(thucNhan)],
         ['Bằng chữ', bangChuText],
         ['Ghi chú', formData.ghichu || ''],
         [''],
         ['Người lập', 'Người nhận lương'],
         [formData.nguoilap || '', formData.tennv || '']
      ];

      const ws = XLSX.utils.aoa_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "PhieuLuong");
      XLSX.writeFile(wb, `PhieuLuong_${formData.manv}_${monthStr.replace('/', '_')}.xlsx`);
   };

   // Print A4
   const handlePrint = () => {
      window.print();
   };

   const filteredEmployees = employees.filter(e => {
      const s = searchTeacher.toLowerCase();
      return (e.tennv || '').toLowerCase().includes(s) || (e.manv || '').toLowerCase().includes(s);
   });

   const navigateToSalaryApproval = () => {
      setSuccessModal({ isOpen: false, message: '', recordId: '' });
      if (setActiveTab) setActiveTab('finances');
      if (setActiveSubTab) setActiveSubTab('phieuluong');
   };

   return (
      <div className="timesheet-page animate-fade-in">
         <div className="ts-container">

            {/* Left sidebar: Employee selection list */}
            <div className="ts-left-panel">
               <div className="ts-panel-header">
                  <div className="ts-search-box">
                     <Search size={18} className="text-muted" />
                     <input
                        type="text"
                        placeholder="Tìm mã hoặc tên NV..."
                        value={searchTeacher}
                        onChange={(e) => setSearchTeacher(e.target.value)}
                     />
                  </div>
               </div>

               <div className="ts-employee-list">
                  {filteredEmployees.map(emp => (
                     <div
                        key={emp.manv}
                        className={`ts-emp-card ${selectedEmployee?.manv === emp.manv ? 'active' : ''}`}
                        onClick={() => handleSelectEmployee(emp)}
                     >
                        <div className="ts-emp-avatar">
                           <Users size={18} />
                        </div>
                        <div className="ts-emp-info">
                           <div className="ts-emp-name">{emp.tennv}</div>
                           <div className="ts-emp-sub">{emp.manv} • {emp.role || 'Nhân viên'}</div>
                        </div>
                     </div>
                  ))}
                  {filteredEmployees.length === 0 && (
                     <div className="ts-empty-list">Không tìm thấy nhân viên nào</div>
                  )}
               </div>
            </div>

            {/* Right panel: Main Pay Slip Sheet matching reference image */}
            <div className="ts-right-panel">

               {/* Top toolbar */}
               <div className="ts-toolbar">
                  <div className="ts-month-picker">
                     <button className="ts-btn-month" onClick={() => shiftMonth(-1)} title="Tháng trước">
                        <ChevronLeft size={18} />
                     </button>
                     <span className="ts-month-display">Kỳ lương: Tháng {monthStr}</span>
                     <button className="ts-btn-month" onClick={() => shiftMonth(1)} title="Tháng sau">
                        <ChevronRight size={18} />
                     </button>
                  </div>

                  <div className="ts-actions">
                     <button className="ts-btn-secondary" onClick={handleExportExcel}>
                        <Download size={16} /> Xuất Excel
                     </button>
                     <button className="ts-btn-secondary" onClick={handlePrint}>
                        <Printer size={16} /> In Phiếu A4
                     </button>
                     <button
                        className="ts-btn-primary"
                        onClick={handleSaveToFinance}
                        disabled={saving || loading}
                     >
                        <Save size={18} /> {saving ? 'Đang lưu...' : 'Lưu lên tài chính'}
                     </button>
                  </div>
               </div>

               {/* PAY SLIP SHEET - Exact Table Replica */}
               <div className="ts-sheet-wrapper">
                  <div className="ts-pay-sheet">

                     {/* Sheet Title */}
                     <div className="ts-sheet-header">
                        <h2>PHIẾU LƯƠNG NHÂN VIÊN</h2>
                     </div>

                     {/* Sheet Table Grid */}
                     <table className="ts-grid-table">
                        <tbody>
                           {/* Tháng */}
                           <tr>
                              <td className="ts-cell-label fw-bold">Tháng</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <div className="ts-inline-flex">
                                    <input
                                       type="text"
                                       className="ts-input-raw"
                                       value={monthStr}
                                       onChange={(e) => {
                                          const parts = e.target.value.split('/');
                                          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                                             const m = parseInt(parts[0], 10) - 1;
                                             const y = parseInt(parts[1], 10);
                                             if (m >= 0 && m <= 11 && y > 2000) {
                                                setCurrentDate(new Date(y, m, 1));
                                             }
                                          }
                                       }}
                                    />
                                    {existingRecord && (
                                       <span className={`ts-badge-status ${existingRecord.trangthai === 'Đã chi' ? 'bg-success' : 'bg-warning'}`}>
                                          {existingRecord.trangthai || 'Chờ duyệt'}
                                       </span>
                                    )}
                                 </div>
                              </td>
                           </tr>

                           {/* Mã nhân viên */}
                           <tr>
                              <td className="ts-cell-label fw-bold">Mã nhân viên</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <input
                                    type="text"
                                    className="ts-input-raw text-primary fw-bold"
                                    placeholder="Nhập mã NV..."
                                    value={formData.manv}
                                    onChange={(e) => handleInputChange('manv', e.target.value)}
                                 />
                              </td>
                           </tr>

                           {/* Họ và tên */}
                           <tr>
                              <td className="ts-cell-label fw-bold">Họ và tên</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <input
                                    type="text"
                                    className="ts-input-raw fw-bold"
                                    value={formData.tennv}
                                    onChange={(e) => handleInputChange('tennv', e.target.value)}
                                 />
                              </td>
                           </tr>

                           {/* Chức vụ */}
                           <tr>
                              <td className="ts-cell-label fw-bold">Chức vụ</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <input
                                    type="text"
                                    className="ts-input-raw"
                                    value={formData.chucvu}
                                    onChange={(e) => handleInputChange('chucvu', e.target.value)}
                                 />
                              </td>
                           </tr>

                           {/* HEADER SECTION 1: KHOẢN THU */}
                           <tr className="ts-section-header">
                              <td colSpan="4" className="fw-bold">KHOẢN THU</td>
                           </tr>

                           {/* LƯƠNG CƠ BẢN */}
                           <tr>
                              <td className="ts-cell-label">LƯƠNG CƠ BẢN</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <input
                                    type="text"
                                    className="ts-input-num"
                                    value={fCur(formData.luongcoban)}
                                    onChange={(e) => handleNumberChange('luongcoban', e.target.value)}
                                 />
                              </td>
                           </tr>

                           {/* CHUYÊN CẦN */}
                           <tr>
                              <td className="ts-cell-label">CHUYÊN CẦN</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <input
                                    type="text"
                                    className="ts-input-num"
                                    value={fCur(formData.chuyencan)}
                                    onChange={(e) => handleNumberChange('chuyencan', e.target.value)}
                                 />
                              </td>
                           </tr>

                           {/* PHỤ CẤP BHXH/BHYT/BHTN */}
                           <tr>
                              <td className="ts-cell-label">PHỤ CẤP BHXH/BHYT/BHTN</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <input
                                    type="text"
                                    className="ts-input-num"
                                    value={fCur(formData.phucap_bhxh)}
                                    onChange={(e) => handleNumberChange('phucap_bhxh', e.target.value)}
                                 />
                              </td>
                           </tr>

                           {/* PHỤ CẤP TRÁCH NHIỆM */}
                           <tr>
                              <td className="ts-cell-label">PHỤ CẤP TRÁCH NHIỆM</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <input
                                    type="text"
                                    className="ts-input-num"
                                    value={fCur(formData.phucap_trachnhiem)}
                                    onChange={(e) => handleNumberChange('phucap_trachnhiem', e.target.value)}
                                 />
                              </td>
                           </tr>

                           {/* PHỤ CẤP ĐI LẠI */}
                           <tr>
                              <td className="ts-cell-label">PHỤ CẤP ĐI LẠI</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <input
                                    type="text"
                                    className="ts-input-num"
                                    value={fCur(formData.phucap_dilai)}
                                    onChange={(e) => handleNumberChange('phucap_dilai', e.target.value)}
                                 />
                              </td>
                           </tr>

                           {/* PHỤ CẤP CHUYÊN MÔN */}
                           <tr>
                              <td className="ts-cell-label">PHỤ CẤP CHUYÊN MÔN</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <input
                                    type="text"
                                    className="ts-input-num"
                                    value={fCur(formData.phucap_chuyenmon)}
                                    onChange={(e) => handleNumberChange('phucap_chuyenmon', e.target.value)}
                                 />
                              </td>
                           </tr>

                           {/* PHỤ CẤP KHÁC */}
                           <tr>
                              <td className="ts-cell-label">PHỤ CẤP KHÁC</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <input
                                    type="text"
                                    className="ts-input-num"
                                    value={fCur(formData.phucap_khac)}
                                    onChange={(e) => handleNumberChange('phucap_khac', e.target.value)}
                                 />
                              </td>
                           </tr>

                           {/* THƯỞNG LỄ */}
                           <tr>
                              <td className="ts-cell-label">THƯỞNG LỄ</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <input
                                    type="text"
                                    className="ts-input-num"
                                    value={fCur(formData.thuongle)}
                                    onChange={(e) => handleNumberChange('thuongle', e.target.value)}
                                 />
                              </td>
                           </tr>

                           {/* TĂNG LƯƠNG */}
                           <tr>
                              <td className="ts-cell-label">TĂNG LƯƠNG</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <input
                                    type="text"
                                    className="ts-input-num"
                                    value={fCur(formData.tangluong)}
                                    onChange={(e) => handleNumberChange('tangluong', e.target.value)}
                                 />
                              </td>
                           </tr>

                           {/* TỔNG THU NHẬP */}
                           <tr className="ts-row-total">
                              <td className="ts-cell-label fw-bold text-uppercase">TỔNG THU NHẬP</td>
                              <td className="ts-cell-input-td fw-bold text-success" colSpan="3">
                                 {fCur(tongThuNhap)} ₫
                              </td>
                           </tr>

                           {/* HEADER SECTION 2: KHOẢN KHẤU TRỪ */}
                           <tr className="ts-section-header">
                              <td colSpan="4" className="fw-bold">KHOẢN KHẤU TRỪ</td>
                           </tr>

                           {/* KHẤU TRỪ BHXH/BHYT/BHTN */}
                           <tr>
                              <td className="ts-cell-label">KHẤU TRỪ BHXH/BHYT/BHTN</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <input
                                    type="text"
                                    className="ts-input-num text-danger"
                                    value={fCur(formData.khautru_bhxh)}
                                    onChange={(e) => handleNumberChange('khautru_bhxh', e.target.value)}
                                 />
                              </td>
                           </tr>

                           {/* Tạm ứng */}
                           <tr>
                              <td className="ts-cell-label">Tạm ứng</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <input
                                    type="text"
                                    className="ts-input-num text-danger"
                                    value={fCur(formData.tamung)}
                                    onChange={(e) => handleNumberChange('tamung', e.target.value)}
                                 />
                              </td>
                           </tr>

                           {/* Khấu trừ khác */}
                           <tr>
                              <td className="ts-cell-label">Khấu trừ khác</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <input
                                    type="text"
                                    className="ts-input-num text-danger"
                                    value={fCur(formData.khautru_khac)}
                                    onChange={(e) => handleNumberChange('khautru_khac', e.target.value)}
                                 />
                              </td>
                           </tr>

                           {/* TỔNG KHẤU TRỪ */}
                           <tr className="ts-row-total">
                              <td className="ts-cell-label fw-bold text-uppercase">TỔNG KHẤU TRỪ</td>
                              <td className="ts-cell-input-td fw-bold text-danger" colSpan="3">
                                 {fCur(tongKhauTru)} ₫
                              </td>
                           </tr>

                           {/* THỰC NHẬN */}
                           <tr className="ts-row-net">
                              <td className="ts-cell-label fw-bold text-uppercase fs-lg">THỰC NHẬN</td>
                              <td className="ts-cell-input-td fw-bold text-primary fs-lg" colSpan="3">
                                 {fCur(thucNhan)} ₫
                              </td>
                           </tr>

                           {/* Bằng chữ */}
                           <tr>
                              <td className="ts-cell-label fw-bold">Bằng chữ</td>
                              <td className="ts-cell-input-td fst-italic" colSpan="3">
                                 {bangChuText}
                              </td>
                           </tr>

                           {/* Hình thức thanh toán & Ghi chú */}
                           <tr>
                              <td className="ts-cell-label fw-bold">Hình thức chi trả</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <select
                                    className="ts-select-raw"
                                    value={formData.hinhthuc}
                                    onChange={(e) => handleInputChange('hinhthuc', e.target.value)}
                                 >
                                    {walletOptions.length === 0 && <option value="Tiền mặt">Tiền mặt</option>}
                                    {walletOptions.map(w => (
                                       <option key={w.id} value={w.name}>{w.name}</option>
                                    ))}
                                 </select>
                              </td>
                           </tr>

                           <tr>
                              <td className="ts-cell-label fw-bold">Ghi chú</td>
                              <td className="ts-cell-input-td" colSpan="3">
                                 <input
                                    type="text"
                                    className="ts-input-raw"
                                    placeholder="Nhập ghi chú chi tiết phiếu lương (nếu có)..."
                                    value={formData.ghichu}
                                    onChange={(e) => handleInputChange('ghichu', e.target.value)}
                                 />
                              </td>
                           </tr>

                           {/* Signatures block */}
                           <tr className="ts-signature-row">
                              <td colSpan="2" className="ts-sig-col">
                                 <div className="ts-sig-title fw-bold">Người lập</div>
                                 <input
                                    type="text"
                                    className="ts-sig-input"
                                    value={formData.nguoilap}
                                    onChange={(e) => handleInputChange('nguoilap', e.target.value)}
                                 />
                              </td>
                              <td colSpan="2" className="ts-sig-col">
                                 <div className="ts-sig-title fw-bold">Người nhận lương</div>
                                 <input
                                    type="text"
                                    className="ts-sig-input"
                                    value={formData.nguoiduyet}
                                    onChange={(e) => handleInputChange('nguoiduyet', e.target.value)}
                                 />
                              </td>
                           </tr>

                        </tbody>
                     </table>

                  </div>
               </div>

            </div>

         </div>

         {/* Success Modal Portaled to Document Body */}
         {successModal.isOpen && createPortal(
            <div className="ts-modal-overlay">
               <div className="ts-modal-card">
                  <CheckCircle size={48} color="#10b981" />
                  <h3>Lưu Phiếu Lương Thành Công!</h3>
                  <p>{successModal.message}</p>
                  <div className="ts-modal-actions">
                     <button className="ts-btn-secondary" onClick={() => setSuccessModal({ isOpen: false, message: '', recordId: '' })}>
                        Tiếp tục nhập NV khác
                     </button>
                     <button className="ts-btn-primary" onClick={navigateToSalaryApproval}>
                        Tới QL phiếu lương duyệt chi <ArrowRight size={16} />
                     </button>
                  </div>
               </div>
            </div>,
            document.body
         )}

         {/* Warning Modal Portaled to Document Body */}
         {warningModal.isOpen && createPortal(
            <div className="ts-modal-overlay">
               <div className="ts-modal-card">
                  <AlertCircle size={48} color="#f59e0b" />
                  <h3>{warningModal.title}</h3>
                  <p>{warningModal.message}</p>
                  <div className="ts-modal-actions">
                     <button className="ts-btn-primary" onClick={() => setWarningModal({ isOpen: false, title: '', message: '' })}>
                        Đóng
                     </button>
                  </div>
               </div>
            </div>,
            document.body
         )}

         {/* Printable A4 Template Portaled to Document Body */}
         {createPortal(
            <div className="print-pay-slip-a4">
               <div className="p-header">
                  <h3>{schoolName.toUpperCase()}</h3>
                  <p>BẢNG PHIẾU LƯƠNG NHÂN VIÊN - THÁNG {monthStr}</p>
               </div>

               <table className="p-table">
                  <tbody>
                     <tr>
                        <td className="fw-bold" style={{ width: '35%' }}>Mã nhân viên:</td>
                        <td><b>{formData.manv}</b></td>
                     </tr>
                     <tr>
                        <td className="fw-bold">Họ và tên:</td>
                        <td><b>{formData.tennv}</b></td>
                     </tr>
                     <tr>
                        <td className="fw-bold">Chức vụ:</td>
                        <td>{formData.chucvu}</td>
                     </tr>
                     <tr className="p-section-header">
                        <td colSpan="2">KHOẢN THU</td>
                     </tr>
                     <tr><td>LƯƠNG CƠ BẢN</td><td className="text-right">{fCur(formData.luongcoban)} ₫</td></tr>
                     <tr><td>CHUYÊN CẦN</td><td className="text-right">{fCur(formData.chuyencan)} ₫</td></tr>
                     <tr><td>PHỤ CẤP BHXH/BHYT/BHTN</td><td className="text-right">{fCur(formData.phucap_bhxh)} ₫</td></tr>
                     <tr><td>PHỤ CẤP TRÁCH NHIỆM</td><td className="text-right">{fCur(formData.phucap_trachnhiem)} ₫</td></tr>
                     <tr><td>PHỤ CẤP ĐI LẠI</td><td className="text-right">{fCur(formData.phucap_dilai)} ₫</td></tr>
                     <tr><td>PHỤ CẤP CHUYÊN MÔN</td><td className="text-right">{fCur(formData.phucap_chuyenmon)} ₫</td></tr>
                     <tr><td>PHỤ CẤP KHÁC</td><td className="text-right">{fCur(formData.phucap_khac)} ₫</td></tr>
                     <tr><td>THƯỞNG LỄ</td><td className="text-right">{fCur(formData.thuongle)} ₫</td></tr>
                     <tr><td>TĂNG LƯƠNG</td><td className="text-right">{fCur(formData.tangluong)} ₫</td></tr>
                     <tr className="p-total-row"><td>TỔNG THU NHẬP</td><td className="text-right fw-bold">{fCur(tongThuNhap)} ₫</td></tr>
                     <tr className="p-section-header">
                        <td colSpan="2">KHOẢN KHẤU TRỪ</td>
                     </tr>
                     <tr><td>KHẤU TRỪ BHXH/BHYT/BHTN</td><td className="text-right">{fCur(formData.khautru_bhxh)} ₫</td></tr>
                     <tr><td>Tạm ứng</td><td className="text-right">{fCur(formData.tamung)} ₫</td></tr>
                     <tr><td>Khấu trừ khác</td><td className="text-right">{fCur(formData.khautru_khac)} ₫</td></tr>
                     <tr className="p-total-row"><td>TỔNG KHẤU TRỪ</td><td className="text-right fw-bold">{fCur(tongKhauTru)} ₫</td></tr>
                     <tr className="p-net-row">
                        <td className="fw-bold fs-lg">THỰC NHẬN</td>
                        <td className="text-right fw-bold fs-lg">{fCur(thucNhan)} VNĐ</td>
                     </tr>
                     <tr>
                        <td className="fw-bold">Bằng chữ:</td>
                        <td className="fst-italic">{bangChuText}</td>
                     </tr>
                     {formData.ghichu && (
                        <tr>
                           <td className="fw-bold">Ghi chú:</td>
                           <td>{formData.ghichu}</td>
                        </tr>
                     )}
                  </tbody>
               </table>

               <div className="p-footer">
                  <div className="p-sig">
                     <p className="fw-bold">Người lập</p>
                     <br /><br /><br />
                     <p><b>{formData.nguoilap}</b></p>
                  </div>
                  <div className="p-sig">
                     <p className="fw-bold">Người nhận lương</p>
                     <br /><br /><br />
                     <p><b>{formData.tennv}</b></p>
                  </div>
               </div>
            </div>,
            document.body
         )}

      </div>
   );
}
