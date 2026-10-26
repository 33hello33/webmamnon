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

// Số ngày công: hỗ trợ số thập phân (VD 0.5 ngày)
const pNum = (val) => {
   if (val === undefined || val === null || val === '') return 0;
   const sVal = String(val).replace(/,/g, '.').replace(/%/g, '');
   if (sVal === '-') return 0;
   const parsed = parseFloat(sVal);
   return isNaN(parsed) ? 0 : parsed;
};

const fDay = (val) => {
   const n = pNum(val);
   return Number.isInteger(n) ? `${n}.0` : String(Math.round(n * 100) / 100);
};

const fDayTotal = (n) => (Number.isInteger(n) ? `${n}` : String(Math.round(n * 100) / 100));

// Trên phiếu lương: giá trị 0 hiển thị "-"
const fSlip = (val) => (pCur(val) === 0 ? '-' : fCur(val));

const BHXH_EMPLOYEE_RATE = 0.105;

const SALARY_DAY_FIELDS = [
   { key: 'ngaycong_thucte', label: 'Ngày công thực tế' },
   { key: 'nghiphep_nam', label: 'Nghỉ phép năm' },
   { key: 'nghile_tet', label: 'Nghỉ lễ, Tết, cưới hỏi, tang sư' },
   { key: 'nghiviec_rieng', label: 'Nghỉ việc riêng' },
   { key: 'nghiom', label: 'Nghỉ ốm' },
   { key: 'nghikhongphep', label: 'Nghỉ không phép' }
];

// Các cột mới của mẫu phiếu lương (xem supabase/migrations/20261026120000_payslip_template.sql)
const SALARY_TEMPLATE_COLUMNS = [
   'chitiet_ngaycong', 'luong_nghiphep', 'hotro_sinhnhat', 'thuong_hocvien', 'hotro_kidscamp',
   'luong_bhxh', 'thue_tncn', 'ghichu_trukhoac'
];

// Chi tiết ngày công được lưu trong 1 cột json: chitiet_ngaycong
const buildDayInfo = (formData) => ({
   thucte: pNum(formData.ngaycong_thucte),
   nghiphep_nam: pNum(formData.nghiphep_nam),
   nghile_tet: pNum(formData.nghile_tet),
   nghiviec_rieng: pNum(formData.nghiviec_rieng),
   nghiom: pNum(formData.nghiom),
   nghikhongphep: pNum(formData.nghikhongphep)
});

const PAYSLIP_MIGRATION_FILE = 'supabase/migrations/20261026120000_payslip_template.sql';

const isMissingColumnError = (err) => {
   if (!err) return false;
   const code = err.code || '';
   const msg = `${err.message || ''} ${err.details || ''}`;
   return code === '42703' || code === 'PGRST204' || /column .* does not exist|could not find the .* column|schema cache/i.test(msg);
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

   // Form data for Pay Slip - mẫu phiếu lương mới
   const [formData, setFormData] = useState({
      manv: '',
      tennv: '',
      chucvu: '',
      // Ngày công (lưu dạng chuỗi để nhập số thập phân)
      ngaycong_thucte: '26',
      nghiphep_nam: '0',
      nghile_tet: '0',
      nghiviec_rieng: '0',
      nghiom: '0',
      nghikhongphep: '0',
      // Khoản thu nhập (nhập tay)
      luongcoban: 0,
      luong_nghiphep: 0,
      hotro_sinhnhat: 0,
      thuong_hocvien: 0,
      hotro_kidscamp: 0,
      // Khoản khấu trừ
      luong_bhxh: 0,
      thue_tncn: 0,
      khautru_khac: 0,
      ghichu_trukhoac: '',
      // Meta
      hinhthuc: walletOptions.length > 0 ? walletOptions[0].name : 'Tiền mặt',
      nguoilap: currentUser?.tennv || currentUser?.manv || 'Quản lý',
      nguoiduyet: 'Người nhận lương',
      ghichu: ''
   });

   // Bảng tbl_luong đã có các cột của mẫu phiếu lương mới hay chưa
   const [schemaReady, setSchemaReady] = useState(true);

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
            const valid = (data || []).filter(e => {
               const st = (e.trangthai || '').trim().toLowerCase();
               return st !== 'đã nghỉ' && st !== 'đã xóa';
            });
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
            const dayInfo = (data.chitiet_ngaycong && typeof data.chitiet_ngaycong === 'object') ? data.chitiet_ngaycong : {};
            const dayValue = (key, fallback) => fDay(dayInfo[key] === undefined || dayInfo[key] === null ? fallback : dayInfo[key]);
            setFormData({
               manv: data.manv || emp.manv,
               tennv: data.tennv || emp.tennv,
               chucvu: data.chucvu || emp.role || 'Nhân viên',
               ngaycong_thucte: dayValue('thucte', 26),
               nghiphep_nam: dayValue('nghiphep_nam', 0),
               nghile_tet: dayValue('nghile_tet', 0),
               nghiviec_rieng: dayValue('nghiviec_rieng', 0),
               nghiom: dayValue('nghiom', 0),
               nghikhongphep: dayValue('nghikhongphep', 0),
               luongcoban: pCur(data.luongcoban),
               luong_nghiphep: pCur(data.luong_nghiphep),
               hotro_sinhnhat: pCur(data.hotro_sinhnhat),
               thuong_hocvien: pCur(data.thuong_hocvien),
               hotro_kidscamp: pCur(data.hotro_kidscamp),
               luong_bhxh: pCur(data.luong_bhxh) || Math.round(pCur(data.khautru_bhxh) / BHXH_EMPLOYEE_RATE),
               thue_tncn: pCur(data.thue_tncn),
               khautru_khac: pCur(data.khautru_khac),
               ghichu_trukhoac: data.ghichu_trukhoac || '',
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
               ngaycong_thucte: '26',
               nghiphep_nam: '0',
               nghile_tet: '0',
               nghiviec_rieng: '0',
               nghiom: '0',
               nghikhongphep: '0',
               luongcoban: 0,
               luong_nghiphep: 0,
               hotro_sinhnhat: 0,
               thuong_hocvien: 0,
               hotro_kidscamp: 0,
               luong_bhxh: 0,
               thue_tncn: 0,
               khautru_khac: 0,
               ghichu_trukhoac: '',
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

   // Kiểm tra bảng lương đã có các cột của mẫu phiếu lương mới
   const ensureSalarySchema = useCallback(async () => {
      const probe = SALARY_TEMPLATE_COLUMNS.join(',');
      const { error } = await supabase.from('tbl_luong').select(probe).limit(1);
      if (!error) {
         setSchemaReady(true);
         return true;
      }
      if (!isMissingColumnError(error)) {
         setSchemaReady(true);
         return true;
      }
      const baseRes = await baseSupabase.from('tbl_luong').select(probe).limit(1);
      const ready = !baseRes.error;
      setSchemaReady(ready);
      return ready;
   }, []);

   useEffect(() => {
      ensureSalarySchema();
   }, [ensureSalarySchema]);

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

   const handleDayChange = (field, rawValue) => {
      const cleaned = String(rawValue).replace(/,/g, '.').replace(/[^\d.]/g, '');
      setFormData(prev => ({ ...prev, [field]: cleaned }));
   };

   // Calculations - mẫu phiếu lương mới (các khoản nhập tay, không tự tính lại theo ngày công)
   const tongNgayCong = SALARY_DAY_FIELDS.reduce((sum, f) => sum + pNum(formData[f.key]), 0);
   const luongThangNay = pCur(formData.luongcoban);
   const luongNghiPhep = pCur(formData.luong_nghiphep);
   const hotroSinhNhat = pCur(formData.hotro_sinhnhat);
   const thuongHocVien = pCur(formData.thuong_hocvien);
   const hotroKidscamp = pCur(formData.hotro_kidscamp);
   const tongThuNhap = luongThangNay + luongNghiPhep + hotroSinhNhat + thuongHocVien + hotroKidscamp;
   const mucLuongBhxh = pCur(formData.luong_bhxh);
   const tienBhxh = Math.round(mucLuongBhxh * BHXH_EMPLOYEE_RATE);
   const thueTncn = pCur(formData.thue_tncn);
   const truKhac = pCur(formData.khautru_khac);
   const tongPhaiTru = tienBhxh + thueTncn + truKhac;
   const thucNhan = tongThuNhap - tongPhaiTru;
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
         if (!(await ensureSalarySchema())) {
            setWarningModal({
               isOpen: true,
               title: 'Chưa nâng cấp cấu trúc dữ liệu',
               message: `Bảng lương (tbl_luong) chưa có các cột của mẫu phiếu lương mới nên chưa thể lưu. Vui lòng chạy file ${PAYSLIP_MIGRATION_FILE} trong Supabase SQL Editor rồi bấm "Lưu lên tài chính" lại.`
            });
            return;
         }
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
            // Ngày công (lưu trong 1 cột json)
            chitiet_ngaycong: buildDayInfo(formData),
            // Thu nhập
            luongcoban: luongThangNay,
            luong_nghiphep: luongNghiPhep,
            hotro_sinhnhat: hotroSinhNhat,
            thuong_hocvien: thuongHocVien,
            hotro_kidscamp: hotroKidscamp,
            tongthunhap: tongThuNhap,
            // Khấu trừ
            luong_bhxh: mucLuongBhxh,
            khautru_bhxh: tienBhxh,
            thue_tncn: thueTncn,
            khautru_khac: truKhac,
            ghichu_trukhoac: formData.ghichu_trukhoac || '',
            tongkhautru: tongPhaiTru,
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
         ['NGÀY CÔNG TRONG THÁNG'],
         [...SALARY_DAY_FIELDS.map(f => f.label), 'Tổng ngày công tính lương'],
         [...SALARY_DAY_FIELDS.map(f => fDay(formData[f.key])), fDayTotal(tongNgayCong)],
         [''],
         ['KHOẢN THU NHẬP', '', ''],
         ['STT', 'NỘI DUNG', 'SỐ TIỀN (đ)'],
         ['1', 'Lương tháng này & Phụ cấp', fCur(luongThangNay)],
         ['2', 'Lương nghỉ phép, lễ, cưới hỏi, tang sư', fCur(luongNghiPhep)],
         ['3', 'Hỗ trợ sinh nhật, cưới hỏi, tang sư', fCur(hotroSinhNhat)],
         ['4', 'Tiền thưởng học viên', fCur(thuongHocVien)],
         ['5', 'Hỗ trợ KidsCamp', fCur(hotroKidscamp)],
         ['', 'TỔNG THU NHẬP (1+2+3+4+5)', fCur(tongThuNhap)],
         [''],
         ['KHOẢN KHẤU TRỪ', '', '', ''],
         ['STT', 'NỘI DUNG', 'SỐ TIỀN (đ)', 'GHI CHÚ'],
         ['1', 'Mức lương đóng BHXH', fCur(mucLuongBhxh), ''],
         ['2', 'Khấu trừ BHXH/BHYT/BHTN (10,5% LCB)', fCur(tienBhxh), ''],
         ['3', 'Thuế TNCN', fCur(thueTncn), ''],
         ['4', 'Trừ khác', fCur(truKhac), formData.ghichu_trukhoac || ''],
         ['', 'TỔNG KHẤU TRỪ', fCur(tongPhaiTru), ''],
         [''],
         ['THỰC NHẬN (Tổng thu nhập - Tổng khấu trừ)', fCur(thucNhan)],
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

               {!schemaReady && (
                  <div className="ts-schema-alert">
                     <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                     <div>
                        <strong>Chưa nâng cấp cấu trúc dữ liệu phiếu lương.</strong> Bảng <code>tbl_luong</code> chưa có
                        các cột ngày công / thu nhập mới nên chưa thể lưu phiếu. Vui lòng chạy file
                        <code> {PAYSLIP_MIGRATION_FILE}</code> trong Supabase SQL Editor rồi bấm
                        <button type="button" className="ts-schema-retry" onClick={() => ensureSalarySchema()}>Kiểm tra lại</button>.
                     </div>
                  </div>
               )}

               {/* PAY SLIP SHEET - Exact Table Replica */}
               <div className="ts-sheet-wrapper">
                  <div className="ts-pay-sheet">

                     {/* Sheet Title */}
                     <div className="ts-sheet-header">
                        <h2>PHIẾU LƯƠNG NHÂN VIÊN</h2>
                        <p className="ts-sheet-sub">Tháng {monthStr} • {formData.tennv || 'Chưa chọn nhân viên'}</p>
                     </div>

                     {/* THÔNG TIN NHÂN VIÊN */}
                     <div className="ts-section">
                        <div className="ts-section-title">
                           <Users size={15} /> Thông tin nhân viên
                        </div>
                        <table className="ts-form-table">
                           <tbody>
                              <tr>
                                 <td className="ts-ft-label">Tháng</td>
                                 <td className="ts-ft-value">
                                    <div className="ts-inline-flex">
                                       <input
                                          type="text"
                                          className="ts-ft-input fw-bold"
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
                                 <td className="ts-ft-label">Mã nhân viên</td>
                                 <td className="ts-ft-value">
                                    <input
                                       type="text"
                                       className="ts-ft-input fw-bold text-primary"
                                       placeholder="Nhập mã NV..."
                                       value={formData.manv}
                                       onChange={(e) => handleInputChange('manv', e.target.value)}
                                    />
                                 </td>
                              </tr>
                              <tr>
                                 <td className="ts-ft-label">Họ và tên</td>
                                 <td className="ts-ft-value">
                                    <input
                                       type="text"
                                       className="ts-ft-input fw-bold"
                                       value={formData.tennv}
                                       onChange={(e) => handleInputChange('tennv', e.target.value)}
                                    />
                                 </td>
                                 <td className="ts-ft-label">Chức vụ</td>
                                 <td className="ts-ft-value">
                                    <input
                                       type="text"
                                       className="ts-ft-input"
                                       value={formData.chucvu}
                                       onChange={(e) => handleInputChange('chucvu', e.target.value)}
                                    />
                                 </td>
                              </tr>
                           </tbody>
                        </table>
                     </div>

                     {/* NGÀY CÔNG TRONG THÁNG */}
                     <div className="ts-section">
                        <div className="ts-section-title">Ngày công trong tháng</div>
                        <table className="ts-days-table">
                           <thead>
                              <tr>
                                 {SALARY_DAY_FIELDS.map(f => (
                                    <th key={f.key}>{f.label}</th>
                                 ))}
                              </tr>
                           </thead>
                           <tbody>
                              <tr>
                                 {SALARY_DAY_FIELDS.map(f => (
                                    <td key={f.key} className="ts-day-cell">
                                       <input
                                          type="text"
                                          inputMode="decimal"
                                          className="ts-day-input"
                                          value={formData[f.key]}
                                          onChange={(e) => handleDayChange(f.key, e.target.value)}
                                       />
                                    </td>
                                 ))}
                              </tr>
                              <tr className="ts-days-total">
                                 <td colSpan={5}>Tổng ngày công tính lương</td>
                                 <td className="ts-days-total-value">{fDayTotal(tongNgayCong)} ngày</td>
                              </tr>
                           </tbody>
                        </table>
                     </div>

                     {/* KHOẢN THU NHẬP */}
                     <div className="ts-section">
                        <div className="ts-section-title">Khoản thu nhập</div>
                        <table className="ts-money-table">
                           <thead>
                              <tr>
                                 <th className="ts-col-stt">STT</th>
                                 <th>Nội dung</th>
                                 <th className="ts-col-amount">Số tiền (đ)</th>
                              </tr>
                           </thead>
                           <tbody>
                              <tr>
                                 <td className="ts-stt">1</td>
                                 <td>Lương tháng này &amp; Phụ cấp</td>
                                 <td className="ts-amount"><input type="text" inputMode="numeric" className="ts-amount-input" value={fCur(formData.luongcoban)} onChange={(e) => handleNumberChange('luongcoban', e.target.value)} /></td>
                              </tr>
                              <tr>
                                 <td className="ts-stt">2</td>
                                 <td>Lương nghỉ phép, lễ, cưới hỏi, tang sư</td>
                                 <td className="ts-amount"><input type="text" inputMode="numeric" className="ts-amount-input" value={fCur(formData.luong_nghiphep)} onChange={(e) => handleNumberChange('luong_nghiphep', e.target.value)} /></td>
                              </tr>
                              <tr>
                                 <td className="ts-stt">3</td>
                                 <td>Hỗ trợ sinh nhật, cưới hỏi, tang sư</td>
                                 <td className="ts-amount"><input type="text" inputMode="numeric" className="ts-amount-input" value={fCur(formData.hotro_sinhnhat)} onChange={(e) => handleNumberChange('hotro_sinhnhat', e.target.value)} /></td>
                              </tr>
                              <tr>
                                 <td className="ts-stt">4</td>
                                 <td>Tiền thưởng học viên</td>
                                 <td className="ts-amount"><input type="text" inputMode="numeric" className="ts-amount-input" value={fCur(formData.thuong_hocvien)} onChange={(e) => handleNumberChange('thuong_hocvien', e.target.value)} /></td>
                              </tr>
                              <tr>
                                 <td className="ts-stt">5</td>
                                 <td>Hỗ trợ KidsCamp</td>
                                 <td className="ts-amount"><input type="text" inputMode="numeric" className="ts-amount-input" value={fCur(formData.hotro_kidscamp)} onChange={(e) => handleNumberChange('hotro_kidscamp', e.target.value)} /></td>
                              </tr>
                              <tr className="ts-total-row">
                                 <td colSpan={2}>TỔNG THU NHẬP (1+2+3+4+5)</td>
                                 <td className="ts-amount ts-amount-static">{fCur(tongThuNhap)}</td>
                              </tr>
                           </tbody>
                        </table>
                     </div>

                     {/* KHOẢN KHẤU TRỪ */}
                     <div className="ts-section">
                        <div className="ts-section-title">Khoản khấu trừ</div>
                        <table className="ts-money-table">
                           <thead>
                              <tr>
                                 <th className="ts-col-stt">STT</th>
                                 <th>Nội dung</th>
                                 <th className="ts-col-amount">Số tiền (đ)</th>
                                 <th className="ts-col-note">Ghi chú</th>
                              </tr>
                           </thead>
                           <tbody>
                              <tr>
                                 <td className="ts-stt">1</td>
                                 <td>Mức lương đóng BHXH</td>
                                 <td className="ts-amount"><input type="text" inputMode="numeric" className="ts-amount-input" value={fCur(formData.luong_bhxh)} onChange={(e) => handleNumberChange('luong_bhxh', e.target.value)} /></td>
                                 <td className="ts-note-cell" rowSpan={4}>
                                    <textarea
                                       className="ts-note-input ts-note-area"
                                       placeholder="Ghi chú trừ khác (VD: Đi trễ 30 phút)..."
                                       value={formData.ghichu_trukhoac}
                                       onChange={(e) => handleInputChange('ghichu_trukhoac', e.target.value)}
                                    />
                                 </td>
                              </tr>
                              <tr>
                                 <td className="ts-stt">2</td>
                                 <td>Khấu trừ BHXH/BHYT/BHTN (10,5% LCB)</td>
                                 <td className="ts-amount ts-amount-static">{fCur(tienBhxh)}</td>
                              </tr>
                              <tr>
                                 <td className="ts-stt">3</td>
                                 <td>Thuế TNCN</td>
                                 <td className="ts-amount"><input type="text" inputMode="numeric" className="ts-amount-input" value={fCur(formData.thue_tncn)} onChange={(e) => handleNumberChange('thue_tncn', e.target.value)} /></td>
                              </tr>
                              <tr>
                                 <td className="ts-stt">4</td>
                                 <td>Trừ khác</td>
                                 <td className="ts-amount"><input type="text" inputMode="numeric" className="ts-amount-input" value={fCur(formData.khautru_khac)} onChange={(e) => handleNumberChange('khautru_khac', e.target.value)} /></td>
                              </tr>
                              <tr className="ts-total-row">
                                 <td colSpan={2}>TỔNG KHẤU TRỪ</td>
                                 <td className="ts-amount ts-amount-static">{fCur(tongPhaiTru)}</td>
                              </tr>
                           </tbody>
                        </table>
                     </div>

                     {/* THỰC NHẬN */}
                     <div className="ts-net-row">
                        <div className="ts-net-label">
                           Thực nhận
                           <span>(Tổng thu nhập - Tổng khấu trừ)</span>
                        </div>
                        <div className="ts-net-value">{fCur(thucNhan)} đ</div>
                     </div>

                     <div className="ts-bangchu-row">
                        <strong>Bằng chữ</strong>
                        <span className="ts-bangchu-text">{bangChuText}</span>
                     </div>

                     <div className="ts-section">
                        <table className="ts-form-table">
                           <tbody>
                              <tr>
                                 <td className="ts-ft-label">Hình thức chi trả</td>
                                 <td className="ts-ft-value">
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
                                 <td className="ts-ft-label">Ghi chú</td>
                                 <td className="ts-ft-value">
                                    <input
                                       type="text"
                                       className="ts-ft-input"
                                       placeholder="Nhập ghi chú chi tiết phiếu lương (nếu có)..."
                                       value={formData.ghichu}
                                       onChange={(e) => handleInputChange('ghichu', e.target.value)}
                                    />
                                 </td>
                              </tr>
                           </tbody>
                        </table>
                     </div>

                     {/* Chữ ký */}
                     <div className="ts-signature-row">
                        <div className="ts-sig-col">
                           <div className="ts-sig-title fw-bold">Người lập</div>
                           <input
                              type="text"
                              className="ts-sig-input"
                              value={formData.nguoilap}
                              onChange={(e) => handleInputChange('nguoilap', e.target.value)}
                           />
                        </div>
                        <div className="ts-sig-col">
                           <div className="ts-sig-title fw-bold">Người nhận lương</div>
                           <input
                              type="text"
                              className="ts-sig-input"
                              value={formData.nguoiduyet}
                              onChange={(e) => handleInputChange('nguoiduyet', e.target.value)}
                           />
                        </div>
                     </div>

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

               <div className="p-section-title">Thông tin nhân viên</div>
               <table className="p-day-table">
                  <tbody>
                     <tr>
                        <td className="p-label">Tháng</td>
                        <td><b>{monthStr}</b></td>
                        <td className="p-label">Mã nhân viên</td>
                        <td><b>{formData.manv}</b></td>
                     </tr>
                     <tr>
                        <td className="p-label">Họ và tên</td>
                        <td><b>{formData.tennv}</b></td>
                        <td className="p-label">Chức vụ</td>
                        <td>{formData.chucvu}</td>
                     </tr>
                  </tbody>
               </table>

               <div className="p-section-title">Ngày công trong tháng</div>
               <table className="p-day-table">
                  <tbody>
                     <tr className="p-day-head">
                        {SALARY_DAY_FIELDS.map(f => (
                           <th key={f.key}>{f.label}</th>
                        ))}
                     </tr>
                     <tr>
                        {SALARY_DAY_FIELDS.map(f => (
                           <td key={f.key} className="p-center">{fDay(formData[f.key])}</td>
                        ))}
                     </tr>
                     <tr className="p-bold">
                        <td colSpan={5}>Tổng ngày công tính lương</td>
                        <td className="p-right">{fDayTotal(tongNgayCong)} ngày</td>
                     </tr>
                  </tbody>
               </table>

               <div className="p-section-title">Khoản thu nhập</div>
               <table className="p-day-table">
                  <tbody>
                     <tr className="p-day-head">
                        <th className="p-col-stt">STT</th>
                        <th>Nội dung</th>
                        <th className="p-col-amount">Số tiền (đ)</th>
                     </tr>
                     <tr><td className="p-center">1</td><td>Lương tháng này &amp; Phụ cấp</td><td className="p-right">{fSlip(luongThangNay)}</td></tr>
                     <tr><td className="p-center">2</td><td>Lương nghỉ phép, lễ, cưới hỏi, tang sư</td><td className="p-right">{fSlip(luongNghiPhep)}</td></tr>
                     <tr><td className="p-center">3</td><td>Hỗ trợ sinh nhật, cưới hỏi, tang sư</td><td className="p-right">{fSlip(hotroSinhNhat)}</td></tr>
                     <tr><td className="p-center">4</td><td>Tiền thưởng học viên</td><td className="p-right">{fSlip(thuongHocVien)}</td></tr>
                     <tr><td className="p-center">5</td><td>Hỗ trợ KidsCamp</td><td className="p-right">{fSlip(hotroKidscamp)}</td></tr>
                     <tr className="p-bold">
                        <td colSpan={2}>TỔNG THU NHẬP (1+2+3+4+5)</td>
                        <td className="p-right">{fCur(tongThuNhap)}</td>
                     </tr>
                  </tbody>
               </table>

               <div className="p-section-title">Khoản khấu trừ</div>
               <table className="p-day-table">
                  <tbody>
                     <tr className="p-day-head">
                        <th className="p-col-stt">STT</th>
                        <th>Nội dung</th>
                        <th className="p-col-amount">Số tiền (đ)</th>
                        <th className="p-col-note">Ghi chú</th>
                     </tr>
                     <tr><td className="p-center">1</td><td>Mức lương đóng BHXH</td><td className="p-right">{fSlip(mucLuongBhxh)}</td><td rowSpan={4}>{formData.ghichu_trukhoac}</td></tr>
                     <tr><td className="p-center">2</td><td>Khấu trừ BHXH/BHYT/BHTN (10,5% LCB)</td><td className="p-right">{fSlip(tienBhxh)}</td></tr>
                     <tr><td className="p-center">3</td><td>Thuế TNCN</td><td className="p-right">{fSlip(thueTncn)}</td></tr>
                     <tr><td className="p-center">4</td><td>Trừ khác</td><td className="p-right">{fSlip(truKhac)}</td></tr>
                     <tr className="p-bold">
                        <td colSpan={2}>TỔNG KHẤU TRỪ</td>
                        <td className="p-right">{fCur(tongPhaiTru)}</td>
                     </tr>
                  </tbody>
               </table>

               <table className="p-day-table p-net-table">
                  <tbody>
                     <tr className="p-net">
                        <td>THỰC NHẬN (Tổng thu nhập - Tổng khấu trừ)</td>
                        <td className="p-right">{fCur(thucNhan)} đ</td>
                     </tr>
                     <tr>
                        <td className="p-label">Bằng chữ</td>
                        <td className="p-italic">{bangChuText}</td>
                     </tr>
                     {formData.ghichu && (
                        <tr>
                           <td className="p-label">Ghi chú</td>
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
