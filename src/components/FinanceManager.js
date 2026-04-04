import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useConfig } from '../ConfigContext';
import { createPortal } from 'react-dom';
import { supabase, generateId } from '../supabase';
import {
   Search, Plus, TrendingDown, Users, Package, ShoppingCart,
   Activity, GraduationCap, DownloadCloud, Trash2, CheckCircle2, X,
   Printer, History, Clock, Edit
} from 'lucide-react';

import './FinanceManager.css';

const pCur = (val) => parseInt(String(val || 0).replace(/,/g, ''), 10) || 0;
const safeParse = (arr) => (arr || []).filter(item => {
   if (typeof item.daxoa === 'string') return item.daxoa?.toLowerCase() !== 'đã xóa';
   return item.daxoa !== true;
});

// Moved inside component to use config
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
   if (number < 0) return 'Âm ' + READ_NUMBER_VN(-number);

   let result = '';
   let unitPos = 0;
   let n = Math.floor(number);
   do {
      let group = n % 1000;
      n = Math.floor(n / 1000);
      if (group > 0 || (unitPos === 0 && n === 0)) {
         let str = readGroup(group, n > 0);
         if (str) {
            result = str + ' ' + units[unitPos] + ' ' + result;
         }
      }
      unitPos++;
   } while (n > 0);

   result = result.replace(/\s+/g, ' ').trim() + ' đồng';
   return result.charAt(0).toUpperCase() + result.slice(1);
};

export default function FinanceManager({ activeSubTab, setActiveSubTab, currentUser }) {
   const { config } = useConfig();
   const walletsConfig = useMemo(() => (config ? [
      { id: 'vi1', name: config.vi1?.name || '' },
      { id: 'vi2', name: config.vi2?.name || '' },
      { id: 'vi3', name: config.vi3?.name || '' },
      { id: 'vi4', name: config.vi4?.name || '' }
   ].filter(w => w.name.trim() !== '') : []), [config]);
   const [data, setData] = useState([]);
   const [loading, setLoading] = useState(false);
   const [searchTerm, setSearchTerm] = useState('');

   const [dateFilter, setDateFilter] = useState('this_month');
   const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
   const [activeDateRangeStr, setActiveDateRangeStr] = useState('');
   const [hinhThucFilter, setHinhThucFilter] = useState('');
   const [stats, setStats] = useState({
      phieuChi: 0, chiLuong: 0, nhapKho: 0, thuHocPhi: 0, thuBanHang: 0, thuKhac: 0
   });

   const [balanceModal, setBalanceModal] = useState(false);
   const [canDoiModal, setCanDoiModal] = useState(false);
   const [balanceData, setBalanceData] = useState({ vi1: '', vi2: '', vi3: '', vi4: '' });
   const [canDoiData, setCanDoiData] = useState({ vi1: '', vi2: '', vi3: '', vi4: '', noidung: 'Cân đối dòng tiền định kỳ' });
   const [initialBalances, setInitialBalances] = useState({ ngaylap: null, vi1: 0, vi2: 0, vi3: 0, vi4: 0 });
   const [currentBalances, setCurrentBalances] = useState({ vi1: 0, vi2: 0, vi3: 0, vi4: 0 });

   const [addPhieuModal, setAddPhieuModal] = useState({ isOpen: false, type: 'Chi' });
   const [phieuData, setPhieuData] = useState({
      hangmucchi: '',
      nguoinhan: '',
      mota: '',
      chiphi: '',
      manv: '',
      hinhthuc: walletsConfig[0]?.name || 'Tiền mặt'
   });

   const [printReceipt, setPrintReceipt] = useState(null);
   const [printLuong, setPrintLuong] = useState(null);
   const [printHoaDon, setPrintHoaDon] = useState(null);
   const [printBill, setPrintBill] = useState(null);
   const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', actionType: '', payload: null });
   const [deletePassword, setDeletePassword] = useState('');

   const [sortConfig, setSortConfig] = useState({ key: '', direction: '' });

   const [editHoaDonModal, setEditHoaDonModal] = useState(false);
   const [editHoaDonData, setEditHoaDonData] = useState(null);

   // Batch Import
   const [productList, setProductList] = useState([]);
   const [isBatchImportOpen, setIsBatchImportOpen] = useState(false);
   const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
   const [historyData, setHistoryData] = useState([]);
   const [batchImportData, setBatchImportData] = useState({
      nhacungcap: '',
      hinhthuc: walletsConfig[0]?.name || 'Tiền mặt',
      manv: '',
      rows: []
   });

   const fetchBalances = useCallback(async () => {
      const { data } = await supabase.from('tbl_tiendauky').select('*').order('ngaylap', { ascending: false }).limit(1);

      let init = { id: null, ngaylap: null, vi1: 0, vi2: 0, vi3: 0, vi4: 0 };
      if (data && data.length > 0) {
         init = {
            id: data[0].id,
            ngaylap: data[0].ngaylap,
            vi1: pCur(data[0].vi1),
            vi2: pCur(data[0].vi2),
            vi3: pCur(data[0].vi3),
            vi4: pCur(data[0].vi4)
         };
      }
      setInitialBalances(init);

      let pChiQ = supabase.from('tbl_phieuchi').select('*');
      let pKhoQ = supabase.from('tbl_nhapkho').select('*');
      let pHdQ = supabase.from('tbl_hd').select('*');
      let pBillQ = supabase.from('tbl_billhanghoa').select('*');

      if (init.ngaylap) {
         pChiQ = pChiQ.gte('ngaylap', init.ngaylap);
         pKhoQ = pKhoQ.gte('ngaynhap', init.ngaylap);
         pHdQ = pHdQ.gte('ngaylap', init.ngaylap);
         pBillQ = pBillQ.gte('ngaylap', init.ngaylap);
      }

      const [resChi, resKho, resHd, resBill] = await Promise.all([pChiQ, pKhoQ, pHdQ, pBillQ]);

      let netVi = { vi1: 0, vi2: 0, vi3: 0, vi4: 0 };
      const addFlow = (hinhthuc, amount, isIncome) => {
         let val = isIncome ? amount : -amount;
         if (!hinhthuc) return;
         const matchedVi = walletsConfig.find(w => hinhthuc.toLowerCase() === w.name.toLowerCase() || hinhthuc.toLowerCase().includes(w.name.toLowerCase()));
         if (matchedVi) {
            netVi[matchedVi.id] += val;
         }
      };

      safeParse(resChi.data).forEach(c => addFlow(c.hinhthuc, pCur(c.chiphi), c.loaiphieu === 'Thu'));
      safeParse(resKho.data).forEach(c => addFlow(c.hinhthuc, pCur(c.thanhtien), false));
      safeParse(resHd.data).forEach(c => addFlow(c.hinhthuc, pCur(c.dadong), true));
      safeParse(resBill.data).forEach(c => addFlow(c.hinhthuc, pCur(c.tongcong), true));

      setCurrentBalances({
         vi1: init.vi1 + netVi.vi1,
         vi2: init.vi2 + netVi.vi2,
         vi3: init.vi3 + netVi.vi3,
         vi4: init.vi4 + netVi.vi4
      });
   }, [walletsConfig]);

   const requestSort = (key) => {
      let direction = 'ascending';
      if (sortConfig.key === key && sortConfig.direction === 'ascending') {
         direction = 'descending';
      }
      setSortConfig({ key, direction });
   };

   const SortIcon = ({ columnKey }) => {
      return (
         <span style={{ fontSize: '0.8rem', marginLeft: '4px', opacity: sortConfig.key === columnKey ? 1 : 0.3, display: 'inline-block' }}>
            {sortConfig.key === columnKey && sortConfig.direction === 'descending' ? '▼' : '▲'}
         </span>
      );
   };

   const handlePrint = (record) => {
      setPrintReceipt(record);
      setTimeout(() => {
         window.print();
      }, 500);
   };

   const handlePrintLuong = (record) => {
      setPrintLuong(record);
      setTimeout(() => {
         window.print();
      }, 500);
   };

   const handlePrintHoaDon = (record) => {
      const hv = hvMap[record.mahv] || {};
      const enriched = {
         ...record,
         tenhv: hv.tenhv,
         sdt: hv.sdt
      };
      setPrintHoaDon(enriched);

      setTimeout(() => {
         window.print();
      }, 500);
   };

   const handlePrintBill = (record) => {
      const hv = hvMap[record.mahv] || {};
      const enriched = {
         ...record,
         tenhv: hv.tenhv,
         sdt: hv.sdt
      };
      setPrintBill(enriched);

      setTimeout(() => {
         window.print();
      }, 500);
   };


   const executeConfirmAction = async () => {
      setConfirmDialog(prev => ({ ...prev, isOpen: false }));

      if (confirmDialog.actionType === 'CONFIRM_LUONG') {
         const id = confirmDialog.payload;
         const { error } = await supabase.from('tbl_phieuchamcong').update({ daxacnhan: true }).eq('id', id);
         if (error) alert("Lỗi khi xác nhận: " + error.message);
         else {
            fetchData();
            fetchBalances();
         }
      } else if (confirmDialog.actionType === 'DELETE') {
         const auth = JSON.parse(localStorage.getItem('auth_session') || '{}');
         if (deletePassword !== auth.user?.password) {
            alert('Mật khẩu không đúng, vui lòng thử lại!');
            return;
         }

         const { idField, idVal, table } = confirmDialog.payload;
         const { error } = await supabase.from(table).update({ daxoa: 'Đã xóa' }).eq(idField, idVal);
         if (error) alert('Lỗi khi xoá: ' + error.message);
         else fetchData();
      } else if (confirmDialog.actionType === 'CONFIRM_CANDOI') {
         const auth = JSON.parse(localStorage.getItem('auth_session') || '{}');
         if (deletePassword !== auth.user?.password) {
            alert('Mật khẩu của bạn không đúng, vui lòng thử lại!');
            return;
         }
         const currentUser = auth.user?.username || auth.user?.tennv || 'Tài khoản ẩn';
         const manv = auth.user?.manv || '';
         const now = new Date();
         const localNow = new Date(now - now.getTimezoneOffset() * 60000).toISOString();
         const slipTime = new Date(now - now.getTimezoneOffset() * 60000 - 1000).toISOString();

         try {
            // 1. Insert into tbl_candoidongtien (Log)
            const { error: err1 } = await supabase.from('tbl_candoidongtien').insert([{
               noidung: canDoiData.noidung,
               manv: manv,
               vi1: { dauky: initialBalances.vi1, truoc: currentBalances.vi1, sau: pCur(canDoiData.vi1) },
               vi2: { dauky: initialBalances.vi2, truoc: currentBalances.vi2, sau: pCur(canDoiData.vi2) },
               vi3: { dauky: initialBalances.vi3, truoc: currentBalances.vi3, sau: pCur(canDoiData.vi3) },
               vi4: { dauky: initialBalances.vi4, truoc: currentBalances.vi4, sau: pCur(canDoiData.vi4) }
            }]);

            if (err1) throw err1;

            // 3. Create NEW Milestone (tbl_tiendauky)
            const { error: res2Err } = await supabase.from('tbl_tiendauky').insert([{
               ngaylap: localNow,
               vi1: canDoiData.vi1.toString(),
               vi2: canDoiData.vi2.toString(),
               vi3: canDoiData.vi3.toString(),
               vi4: canDoiData.vi4.toString(),
               nguoilap: currentUser
            }]);

            if (res2Err) throw res2Err;

            setCanDoiModal(false);
            fetchBalances();
            fetchData();
            alert('Cân đối dòng tiền thành công!');

         } catch (err) {
            console.error(err);
            alert('Đã xảy ra lỗi khi cân đối: ' + err.message);
         }
      } else if (confirmDialog.actionType === 'EDIT_HOADON') {
         const auth = JSON.parse(localStorage.getItem('auth_session') || '{}');
         if (deletePassword !== auth.user?.password) {
            alert('Mật khẩu của bạn không đúng, vui lòng thử lại!');
            return;
         }
         const r = confirmDialog.payload;
         const { error } = await supabase.from('tbl_hd')
            .update({
               hocphi: r.hocphi,
               giamhocphi: r.giamhocphi,
               phuthu: r.phuthu ? (typeof r.phuthu === 'string' ? r.phuthu : JSON.stringify(r.phuthu)) : null,
               tongcong: r.tongcong.toString(),
               dadong: r.dadong.toString(),
               conno: r.conno.toString(),
               hinhthuc: r.hinhthuc,
               ghichu: r.ghichu
            })
            .eq('mahd', r.mahd);

         if (error) alert("Lỗi khi cập nhật hóa đơn: " + error.message);
         else {
            setEditHoaDonModal(false);
            fetchData();
            fetchBalances();
            alert("Cập nhật hóa đơn thành công!");
         }
      }
   };

   const handleConfirmLuong = (id) => {
      setConfirmDialog({
         isOpen: true,
         title: 'Xác nhận duyệt lương',
         message: 'Bạn có chắc chắn muốn xác nhận đã chuyển khoản / chi trả tiền lương tháng này cho bộ hồ sơ này không? Danh sách quỹ sẽ được ghi nhận.',
         actionType: 'CONFIRM_LUONG',
         payload: id
      });
   };

   const parseNoidung = (nd) => {
      if (!nd || typeof nd !== 'string') return { headers: [], rows: [] };

      try {
         const obj = JSON.parse(nd);
         if (Array.isArray(obj) && obj.length > 0) {
            const headers = Object.keys(obj[0]);
            const rows = obj.map(o => headers.map(h => o[h] || ''));
            return { headers, rows };
         }
         if (Array.isArray(obj) && obj.length === 0) return { headers: [], rows: [] };
      } catch (e) { }

      const lines = nd.split(/\r\n|\n|\r/).filter(l => l.trim() !== '');
      if (lines.length === 0) return { headers: [], rows: [] };

      const splitCsvLine = (str) => {
         const arr = [];
         let quote = false;
         let col = '';
         for (let i = 0; i < str.length; i++) {
            let c = str[i];
            if (c === '"' && str[i + 1] === '"') { col += '"'; i++; }
            else if (c === '"') { quote = !quote; }
            else if (c === ',' && !quote) { arr.push(col.trim()); col = ''; }
            else { col += c; }
         }
         arr.push(col.trim());
         return arr;
      };

      const headers = splitCsvLine(lines[0]);
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
         const cells = splitCsvLine(lines[i]);
         while (cells.length < headers.length) cells.push("");
         if (cells.length > headers.length) cells.splice(headers.length);
         rows.push(cells);
      }
      return { headers, rows };
   };

   useEffect(() => {
      const handleAfterPrint = () => {
         setPrintReceipt(null);
         setPrintLuong(null);
         setPrintHoaDon(null);
         setPrintBill(null);
      };
      window.addEventListener('afterprint', handleAfterPrint);
      return () => window.removeEventListener('afterprint', handleAfterPrint);
   }, [fetchBalances]);

   // Relational mappings
   const [hvMap, setHvMap] = useState({});
   const [nvMap, setNvMap] = useState({});
   const [hhMap, setHhMap] = useState({});

   useEffect(() => {
      const fetchDicts = async () => {
         const { data: hvs } = await supabase.from('tbl_hv').select('mahv, tenhv, sdtba, sdtme');
         const hVM = {};
         (hvs || []).forEach(h => {
            hVM[h.mahv] = {
               tenhv: h.tenhv,
               sdt: h.sdtba || h.sdtme || ''
            };
         });
         setHvMap(hVM);

         const { data: nvs } = await supabase.from('tbl_nv').select('manv, tennv');
         const nVM = {}; (nvs || []).forEach(n => nVM[n.manv] = n.tennv); setNvMap(nVM);

         const { data: hhs } = await supabase.from('tbl_hanghoa').select('*');
         const hhM = {}; (hhs || []).forEach(h => hhM[h.mahang] = h.tenhang); setHhMap(hhM);
         setProductList((hhs || []).filter(h => h.daxoa !== 'Đã Xóa'));
      };
      fetchDicts();
      fetchBalances();
   }, [fetchBalances]);



   const handleSaveBalances = async (e) => {
      e.preventDefault();
      const auth = JSON.parse(localStorage.getItem('auth_session') || '{}');
      const currentUser = auth.user?.username || auth.user?.tennv || 'Tài khoản ẩn';
      const localNow = new Date(new Date() - new Date().getTimezoneOffset() * 60000).toISOString();
      await supabase.from('tbl_tiendauky').insert([{
         ngaylap: localNow,
         vi1: balanceData.vi1 ? balanceData.vi1.toString() : '0',
         vi2: balanceData.vi2 ? balanceData.vi2.toString() : '0',
         vi3: balanceData.vi3 ? balanceData.vi3.toString() : '0',
         vi4: balanceData.vi4 ? balanceData.vi4.toString() : '0',
         nguoilap: currentUser
      }]);
      setBalanceModal(false);
      fetchBalances();
   };

   const handleOpenHistory = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('tbl_candoidongtien').select('*').order('id', { ascending: false });
      if (error) {
         alert('Lỗi khi tải lịch sử: ' + error.message);
      } else {
         setHistoryData(data || []);
         setIsHistoryModalOpen(true);
      }
      setLoading(false);
   };

   const handleOpenCanDoi = () => {
      setCanDoiData({
         vi1: currentBalances.vi1.toString(),
         vi2: currentBalances.vi2.toString(),
         vi3: currentBalances.vi3.toString(),
         vi4: currentBalances.vi4.toString(),
         noidung: 'Cân đối dòng tiền định kỳ'
      });
      setCanDoiModal(true);
   };

   const handleSaveCanDoi = (e) => {
      e.preventDefault();
      setDeletePassword('');
      setConfirmDialog({
         isOpen: true,
         title: 'Xác nhận cân đối dòng tiền',
         message: 'Hành động này sẽ cập nhật số thực tế hiện có trong các ví và tạo mốc đầu kỳ mới. Bạn có chắc chắn không?',
         actionType: 'CONFIRM_CANDOI',
         payload: null
      });
   };

   const getDateRange = useCallback(() => {
      const today = new Date();
      let startObj, endObj;

      switch (dateFilter) {
         case 'today':
            startObj = new Date(today); endObj = new Date(today); break;
         case 'yesterday':
            startObj = new Date(today); startObj.setDate(startObj.getDate() - 1);
            endObj = new Date(today); endObj.setDate(endObj.getDate() - 1); break;
         case '7days':
            startObj = new Date(today); startObj.setDate(startObj.getDate() - 7);
            endObj = new Date(today); break;
         case 'this_month':
            startObj = new Date(today.getFullYear(), today.getMonth(), 1);
            endObj = new Date(today); break;
         case 'last_month':
            startObj = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            endObj = new Date(today.getFullYear(), today.getMonth(), 0); break;
         case 'custom':
            startObj = customDateRange.start ? new Date(customDateRange.start) : new Date(today);
            endObj = customDateRange.end ? new Date(customDateRange.end) : new Date(today);
            break;
         default:
            startObj = null; endObj = null;
      }

      const formatLocalTimestamp = (date, isEnd) => {
         if (!date) return null;
         const y = date.getFullYear();
         const m = String(date.getMonth() + 1).padStart(2, '0');
         const d = String(date.getDate()).padStart(2, '0');

         const now = new Date();
         const isToday = y === now.getFullYear() &&
            date.getMonth() === now.getMonth() &&
            date.getDate() === now.getDate();

         if (isEnd && isToday) {
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');
            return `${y}-${m}-${d}T${hh}:${mm}:${ss}+07:00`;
         }

         return `${y}-${m}-${d}T${isEnd ? '23:59:59' : '00:00:00'}+07:00`;
      };

      return {
         start: formatLocalTimestamp(startObj, false),
         end: formatLocalTimestamp(endObj, true),
         startObj,
         endObj
      };
   }, [dateFilter, customDateRange]);

   const fetchData = useCallback(async () => {
      setLoading(true);
      const { start, end, startObj, endObj } = getDateRange();

      const formatDisplayDate = (d) => {
         if (!d) return '';
         return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      };

      if (startObj && endObj) {
         setActiveDateRangeStr(`(Từ ${formatDisplayDate(startObj)} đến ${formatDisplayDate(endObj)})`);
      } else {
         setActiveDateRangeStr('');
      }

      const sumBy = (arr, field) => safeParse(arr).reduce((sum, item) => sum + pCur(item[field]), 0);

      const buildQuery = (table, dateField) => {
         let q = supabase.from(table).select('*');
         if (start) q = q.gte(dateField, start);
         if (end) q = q.lte(dateField, end);
         return q;
      };

      const [resChi, resKho, resHd, resBill] = await Promise.all([
         buildQuery('tbl_phieuchi', 'ngaylap'),
         buildQuery('tbl_nhapkho', 'ngaynhap'),
         buildQuery('tbl_hd', 'ngaylap'),
         buildQuery('tbl_billhanghoa', 'ngaylap')
      ]);

      const chiList = safeParse(resChi.data || []).filter(c => !c.daxoa);
      const khoList = safeParse(resKho.data || []).filter(c => !c.daxoa);
      const hdList = safeParse(resHd.data || []).filter(c => !c.daxoa);
      const billList = safeParse(resBill.data || []).filter(c => !c.daxoa);

      const filterByWallet = (list) => {
         if (!hinhThucFilter) return list;
         return list.filter(item => {
            const val = item.hinhthuc || item.Hinhthuc;
            return val && val.toLowerCase() === hinhThucFilter.toLowerCase();
         });
      };

      const finalChi = filterByWallet(chiList);
      const finalKho = filterByWallet(khoList);
      const finalHd = filterByWallet(hdList);
      const finalBill = filterByWallet(billList);

      setStats({
         phieuChi: finalChi.filter(c => !c.loaiphieu || c.loaiphieu === 'Chi').reduce((s, c) => s + pCur(c.chiphi), 0),
         thuKhac: finalChi.filter(c => c.loaiphieu === 'Thu').reduce((s, c) => s + pCur(c.chiphi), 0),
         nhapKho: finalKho.reduce((s, k) => s + pCur(k.thanhtien), 0),
         thuHocPhi: finalHd.reduce((s, h) => s + pCur(h.dadong), 0),
         thuBanHang: finalBill.reduce((s, b) => s + pCur(b.tongcong), 0)
      });

      let activeDataRaw = [];
      if (activeSubTab === 'phieuchi') activeDataRaw = chiList;
      else if (activeSubTab === 'hoadon') activeDataRaw = hdList;
      else if (activeSubTab === 'nhapkho') activeDataRaw = khoList;
      else if (activeSubTab === 'billhang' || activeSubTab === 'billhanghoa') activeDataRaw = billList;

      let orderBy = activeSubTab === 'nhapkho' ? 'ngaynhap' : 'ngaylap';
      const sorted = safeParse(activeDataRaw).sort((a, b) => new Date(b[orderBy]) - new Date(a[orderBy]));
      setData(sorted);

      setLoading(false);
   }, [activeSubTab, getDateRange, hinhThucFilter]);

   useEffect(() => {
      setSearchTerm('');
      fetchData();
   }, [fetchData]);

   const fCur = (val) => {
      if (!val) return '0';
      const parsed = parseInt(String(val).replace(/,/g, ''), 10);
      return isNaN(parsed) ? '0' : parsed.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
   };

   const formatDate = (isoStr) => {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
   };

   const formatDateRaw = (isoStr) => {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
   };

   const handleExportExcel = () => {
      let headers = [];
      let mappedData = [];
      if (activeSubTab === 'phieuchi') {
         headers = ['Mã phiếu', 'Ngày lập', 'Loại', 'Hạng mục', 'Mô tả', 'Số tiền', 'Hình thức', 'Nhân viên'];
         mappedData = data.map(i => [i.maphieuchi, formatDate(i.ngaylap), i.loaiphieu || 'Chi', i.hangmucchi, i.mota, fCur(i.chiphi), i.hinhthuc, nvMap[i.manv] || i.manv]);
      } else {
         alert('Chưa hỗ trợ xuất cho tab này'); return;
      }

      const csvContent = '\uFEFF' + [headers.join(',')].concat(mappedData.map(row => row.map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(','))).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `DanhSach_${activeSubTab}_${new Date().getTime()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
   };

   const handleSavePhieu = async (e) => {
      e.preventDefault();
      const codeType = addPhieuModal.type === 'Thu' ? 'PT' : 'PC';
      const maphieuchi = await generateId('tbl_phieuchi', 'maphieuchi', codeType, 4);

      const finalMota = phieuData.nguoinhan ? `[Người giao dịch: ${phieuData.nguoinhan}] ${phieuData.mota}` : phieuData.mota;

      const now = new Date();
      const localNow = new Date(now - now.getTimezoneOffset() * 60000).toISOString().replace('Z', '+07:00');

      const { error } = await supabase.from('tbl_phieuchi').insert([{
         maphieuchi: maphieuchi,
         ngaylap: localNow,
         hangmucchi: phieuData.hangmucchi,
         mota: finalMota,
         chiphi: pCur(phieuData.chiphi).toString(),
         manv: phieuData.manv || null,
         loaiphieu: addPhieuModal.type,
         hinhthuc: phieuData.hinhthuc
      }]);

      if (!error) {
         setAddPhieuModal({ isOpen: false, type: 'Chi' });
         // Alert or message? Using alert as consistent with existing code
         alert(`Tạo phiếu ${addPhieuModal.type} thành công!`);
         setTimeout(() => {
            fetchData();
            fetchBalances();
         }, 300);
      } else {
         alert('Lỗi tạo phiếu: ' + error.message);
      }
   };

   const handleOpenBatchImport = () => {
      setBatchImportData({
         nhacungcap: '',
         hinhthuc: walletsConfig.length > 0 ? walletsConfig[0].name : 'Tiền mặt',
         manv: currentUser?.manv || '',
         rows: [{ id: Date.now(), mahang: '', soluongThem: '', gianhap: '' }]
      });
      setIsBatchImportOpen(true);
   };

   const handleRowChange = (id, field, val) => {
      setBatchImportData(prev => ({
         ...prev,
         rows: prev.rows.map(r => r.id === id ? { ...r, [field]: val } : r)
      }));
   };

   const handleAddRow = () => {
      setBatchImportData(prev => ({
         ...prev,
         rows: [...prev.rows, { id: Date.now(), mahang: '', soluongThem: '', gianhap: '' }]
      }));
   };

   const handleRemoveRow = (id) => {
      setBatchImportData(prev => ({
         ...prev,
         rows: prev.rows.filter(r => r.id !== id)
      }));
   };

   const handleSaveBatchImport = async (e) => {
      e.preventDefault();
      const localNow = new Date(new Date() - new Date().getTimezoneOffset() * 60000).toISOString();
      const validRows = batchImportData.rows.filter(r => r.mahang && parseInt(r.soluongThem) > 0);

      if (validRows.length === 0) {
         alert('Vui lòng chọn ít nhất 1 mặt hàng với số lượng > 0!');
         return;
      }

      const { data: recentNK } = await supabase.from('tbl_nhapkho').select('manhapkho').order('manhapkho', { ascending: false }).limit(1);
      let nextNum = 1;
      if (recentNK && recentNK.length > 0 && recentNK[0].manhapkho) {
         const numPart = recentNK[0].manhapkho.replace(/\D/g, '');
         if (!isNaN(parseInt(numPart, 10))) nextNum = parseInt(numPart, 10) + 1;
      }

      for (let i = 0; i < validRows.length; i++) {
         const row = validRows[i];
         const spRaw = productList.find(p => p.mahang === row.mahang);

         const rawSoluongThem = parseInt(row.soluongThem) || 0;
         const oldQty = parseInt(spRaw?.soluong) || 0;
         const totalQuantity = oldQty + rawSoluongThem;

         let rawGianhap = row.gianhap.toString().replace(/,/g, '');
         if (!rawGianhap) rawGianhap = (spRaw?.gianhap || 0).toString();

         const thanhtien = (rawSoluongThem * parseInt(rawGianhap || 0)).toString();
         const newMaNK = `NK${String(nextNum + i).padStart(5, '0')}`;

         await supabase.from('tbl_hanghoa').update({
            soluong: totalQuantity,
            gianhap: rawGianhap
         }).eq('mahang', row.mahang);

         await supabase.from('tbl_nhapkho').insert([{
            manhapkho: newMaNK,
            ngaynhap: localNow,
            mahang: row.mahang,
            gianhap: rawGianhap,
            soluong: rawSoluongThem,
            thanhtien: thanhtien,
            manv: batchImportData.manv || null,
            nhacungcap: batchImportData.nhacungcap || '',
            hinhthuc: batchImportData.hinhthuc || (walletsConfig.length > 0 ? walletsConfig[0].name : 'Tiền mặt')
         }]);
      }

      setIsBatchImportOpen(false);
      fetchData();

      const { data: hhs } = await supabase.from('tbl_hanghoa').select('*');
      setProductList((hhs || []).filter(h => h.daxoa !== 'Đã Xóa'));
   };

   const handleDelete = (idField, idVal, table) => {
      setDeletePassword('');
      setConfirmDialog({
         isOpen: true,
         title: 'Xác nhận xoá bản ghi',
         message: `Bạn có chắc muốn chuyển bản ghi [${idVal}] vào thùng rác không? Dữ liệu thống kê thu chi trước đó có thể bị biến động.`,
         actionType: 'DELETE',
         payload: { idField, idVal, table }
      });
   };

   const handleEditHoaDon = (record) => {
      setEditHoaDonData({ ...record });
      setEditHoaDonModal(true);
   };

   const renderContent = () => {
      let filteredData = [...data];
      if (searchTerm) {
         const lowerQ = searchTerm.toLowerCase();
         filteredData = filteredData.filter(item => {
            // Check raw data
            const rawMatch = JSON.stringify(item).toLowerCase().includes(lowerQ);
            if (rawMatch) return true;

            // Tab-specific name search
            if (activeSubTab === 'hoadon') {
               const studentName = (hvMap[item.mahv]?.tenhv || '').toLowerCase();
               if (studentName.includes(lowerQ)) return true;
            } else if (activeSubTab === 'phieuluong') {
               const teacherName = (item.tennv || nvMap[item.manv] || '').toLowerCase();
               if (teacherName.includes(lowerQ)) return true;
            } else if (activeSubTab === 'nhapkho') {
               const productName = (hhMap[item.mahang] || '').toLowerCase();
               if (productName.includes(lowerQ)) return true;
            } else if (activeSubTab === 'phieuchi') {
               const operatorName = (nvMap[item.manv] || '').toLowerCase();
               if (operatorName.includes(lowerQ)) return true;
            } else if (activeSubTab === 'billhang' || activeSubTab === 'billhanghoa') {
               const studentName = (hvMap[item.mahv]?.tenhv || '').toLowerCase();
               const productName = (hhMap[item.mahang] || '').toLowerCase();
               if (studentName.includes(lowerQ) || productName.includes(lowerQ)) return true;
            }

            return false;
         });
      }
      if (hinhThucFilter) {
         filteredData = filteredData.filter(item => {
            const val = item.hinhthuc || item.Hinhthuc;
            return val && val.toLowerCase() === hinhThucFilter.toLowerCase();
         });
      }

      if (sortConfig.key) {
         filteredData.sort((a, b) => {
            let aVal = a[sortConfig.key];
            let bVal = b[sortConfig.key];

            if (sortConfig.key === 'maphieuchi' || sortConfig.key === 'mabill' || sortConfig.key === 'manhapkho') {
               aVal = String(aVal || '').toLowerCase();
               bVal = String(bVal || '').toLowerCase();
            } else if (sortConfig.key === 'ngaylap' || sortConfig.key === 'ngaynhap') {
               aVal = new Date(aVal || 0).getTime();
               bVal = new Date(bVal || 0).getTime();
            } else if (sortConfig.key === 'mahv') {
               // Try to extract name or fallback
               aVal = String(a.tenhv || a.mahv?.tenhv || a.mahv || '').toLowerCase();
               bVal = String(b.tenhv || b.mahv?.tenhv || b.mahv || '').toLowerCase();
            } else if (sortConfig.key === 'mahd') {
               aVal = parseInt(String(a.mahd || '').replace(/\D/g, '') || '0');
               bVal = parseInt(String(b.mahd || '').replace(/\D/g, '') || '0');
            } else if (sortConfig.key === 'chiphi' || sortConfig.key === 'tongcong' || sortConfig.key === 'dadong') {
               aVal = pCur(aVal);
               bVal = pCur(bVal);
            } else {
               if (typeof aVal === 'string') aVal = aVal.toLowerCase();
               if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            }

            if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
            return 0;
         });
      }

      if (loading) return <div className="fm-msg p-5 text-center text-muted">Đang trích xuất dữ liệu tài chính...</div>;
      if (filteredData.length === 0) return <div className="fm-msg p-5 text-center text-muted">Không tìm thấy bản ghi chứng từ nào.</div>;

      switch (activeSubTab) {
         case 'phieuchi':
            return (
               <>
                  <div className="table-scroll-wrapper">
                     <table className="fm-table">
                        <thead>
                           <tr>
                              <th onClick={() => requestSort('maphieuchi')} style={{ cursor: 'pointer', userSelect: 'none' }}>Mã Phiếu <SortIcon columnKey="maphieuchi" /></th>
                              <th>Loại</th>
                              <th onClick={() => requestSort('ngaylap')} style={{ cursor: 'pointer', userSelect: 'none' }}>Ngày Giao Dịch <SortIcon columnKey="ngaylap" /></th>
                              <th>Người Lập</th>
                              <th>Hạng Mục</th>
                              <th>Mô tả / Ghi chú</th>
                              <th>Hình thức</th>
                              <th className="text-right" onClick={() => requestSort('chiphi')} style={{ cursor: 'pointer', userSelect: 'none' }}>Giá Trị (VNĐ) <SortIcon columnKey="chiphi" /></th>
                              <th className="text-center">Hành động</th>
                           </tr>
                        </thead>
                        <tbody>
                           {filteredData.map(r => (
                              <tr key={r.maphieuchi}>
                                 <td className="fm-code font-semibold text-primary">{r.maphieuchi}</td>
                                 <td><span className={`fm-badge ${r.loaiphieu === 'Thu' ? 'bg-success' : 'bg-warning'}`}>{r.loaiphieu || 'Chi'}</span></td>
                                 <td>{formatDate(r.ngaylap)}</td>
                                 <td>{nvMap[r.manv] || r.manv || '_'}</td>
                                 <td className="font-medium">{r.hangmucchi}</td>
                                 <td className="fm-desc">{r.mota}</td>
                                 <td>{r.hinhthuc}</td>
                                 <td className="text-right font-bold" style={{ color: r.loaiphieu === 'Thu' ? '#16a34a' : '#dc2626' }}>
                                    {r.loaiphieu === 'Thu' ? '+' : '-'}{fCur(r.chiphi)}
                                 </td>
                                 <td className="fm-actions-td" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                                    <button title="In chứng từ" className="btn-blue" onClick={() => handlePrint(r)}><Printer size={16} /></button>
                                    <button title="Huỷ chứng từ" onClick={() => handleDelete('maphieuchi', r.maphieuchi, 'tbl_phieuchi')}><Trash2 size={16} /></button>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>

                  {/* Card View for Mobile */}
                  <div className="fm-card-list">
                     {filteredData.map(r => (
                        <div key={r.maphieuchi} className="fm-card">
                           <div className="fm-card-header">
                              <span className="fm-card-code">{r.maphieuchi}</span>
                              <span className={`fm-badge ${r.loaiphieu === 'Thu' ? 'bg-success' : 'bg-warning'}`}>{r.loaiphieu || 'Chi'}</span>
                           </div>
                           <div className="fm-card-body">
                              <div className="fm-card-row"><span>Ngày:</span> <span>{formatDate(r.ngaylap)}</span></div>
                              <div className="fm-card-row"><span>Hạng mục:</span> <span className="font-medium">{r.hangmucchi}</span></div>
                              <div className="fm-card-row"><span>Người lập:</span> <span>{nvMap[r.manv] || r.manv}</span></div>
                              <div className="fm-card-row price-row">
                                 <span>Giá trị:</span>
                                 <strong className={r.loaiphieu === 'Thu' ? 'text-success' : 'text-danger'}>
                                    {r.loaiphieu === 'Thu' ? '+' : '-'}{fCur(r.chiphi)}
                                 </strong>
                              </div>
                              <div className="fm-card-actions">
                                 <button className="btn-blue-sm" style={{ background: '#6366f1' }} onClick={() => handlePrint(r)}><Printer size={16} /> In</button>
                                 <button className="btn-danger-sm" onClick={() => handleDelete('maphieuchi', r.maphieuchi, 'tbl_phieuchi')}><Trash2 size={16} /> Xóa</button>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </>
            );
         case 'phieuluong':
            return (
               <>
                  <div className="table-scroll-wrapper">
                     <table className="fm-table">
                        <thead>
                           <tr>
                              <th>ID Phiếu</th>
                              <th>Ngày Lập</th>
                              <th>Hồ Sơ Nhận Lương</th>

                              <th>Ghi Chú</th>
                              <th>Hình Thức</th>
                              <th>Đã Xác Nhận</th>
                              <th className="text-right">Tổng Thanh Toán</th>
                              <th className="text-center">Hành động</th>
                           </tr>
                        </thead>
                        <tbody>
                           {filteredData.map(r => (
                              <tr key={r.id}>
                                 <td className="fm-code">{r.id}</td>
                                 <td>{formatDate(r.ngaylap)}</td>
                                 <td className="font-semibold text-primary">{r.tennv || nvMap[r.manv] || r.manv}</td>

                                 <td className="fm-desc">{r.ghichu}</td>
                                 <td>{r.hinhthuc}</td>
                                 <td><span className={`fm-badge ${r.daxacnhan ? 'bg-success' : 'bg-pending'}`}>{r.daxacnhan ? 'Đã duyệt' : 'Chờ ký'}</span></td>
                                 <td className="text-right font-bold text-success">{fCur(r.tongcong)}</td>
                                 <td className="fm-actions-td" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                                    {!r.daxacnhan && <button title="Xác nhận chi lương" className="btn-blue" onClick={() => handleConfirmLuong(r.id)}><CheckCircle2 size={16} /></button>}
                                    <button title="In phiếu" className="btn-blue" onClick={() => handlePrintLuong(r)}><Printer size={16} /></button>
                                    <button title="Hủy phiếu lương" onClick={() => handleDelete('id', r.id, 'tbl_phieuchamcong')}><Trash2 size={16} /></button>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>

                  {/* Card View for Mobile */}
                  <div className="fm-card-list">
                     {filteredData.map(r => (
                        <div key={r.id} className="fm-card">
                           <div className="fm-card-header">
                              <span className="fm-card-code">#{r.id}</span>
                              <span className={`fm-badge ${r.daxacnhan ? 'bg-success' : 'bg-pending'}`}>{r.daxacnhan ? 'Đã duyệt' : 'Chờ ký'}</span>
                           </div>
                           <div className="fm-card-body">
                              <div className="fm-card-row"><span>Nhân viên:</span> <strong className="text-primary">{r.tennv || nvMap[r.manv] || r.manv}</strong></div>
                              <div className="fm-card-row"><span>Ngày lập:</span> <span>{formatDate(r.ngaylap)}</span></div>
                              <div className="fm-card-row price-row">
                                 <span>Thanh toán:</span>
                                 <strong className="text-success">{fCur(r.tongcong)} ₫</strong>
                              </div>
                              <div className="fm-card-actions">
                                 {!r.daxacnhan && (
                                    <button className="btn-success-sm" onClick={() => handleConfirmLuong(r.id)}>
                                       <CheckCircle2 size={16} /> Duyệt
                                    </button>
                                 )}
                                 <button className="btn-blue-sm" style={{ background: '#6366f1' }} onClick={() => handlePrintLuong(r)}><Printer size={16} /> In</button>
                                 <button className="btn-danger-sm" onClick={() => handleDelete('id', r.id, 'tbl_phieuchamcong')}><Trash2 size={16} /> Xóa</button>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </>
            );
         case 'hoadon':
            return (
               <>
                  <div className="table-scroll-wrapper">
                     <table className="fm-table">
                        <thead>
                           <tr>
                              <th onClick={() => requestSort('mahd')} style={{ cursor: 'pointer', userSelect: 'none' }}>Mã HĐ <SortIcon columnKey="mahd" /></th>
                              <th onClick={() => requestSort('ngaylap')} style={{ cursor: 'pointer', userSelect: 'none' }}>Ngày lập <SortIcon columnKey="ngaylap" /></th>
                              <th onClick={() => requestSort('mahv')} style={{ cursor: 'pointer', userSelect: 'none' }}>Tên học sinh <SortIcon columnKey="mahv" /></th>
                              <th>Tên lớp</th>
                              <th>Người lập</th>
                              <th>Thời lượng</th>
                              <th>Ngày bắt đầu</th>
                              <th>Ngày kết thúc</th>
                              <th>Hình thức</th>
                              <th className="text-right" onClick={() => requestSort('tongcong')} style={{ cursor: 'pointer', userSelect: 'none' }}>Tổng Cộng <SortIcon columnKey="tongcong" /></th>
                              <th className="text-right" onClick={() => requestSort('dadong')} style={{ cursor: 'pointer', userSelect: 'none' }}>Đã Thu <SortIcon columnKey="dadong" /></th>
                              <th className="text-right">Nợ Cấn Trừ</th>
                              <th className="text-center">Hành động</th>
                           </tr>
                        </thead>
                        <tbody>
                           {filteredData.map(r => (
                              <tr key={r.mahd}>
                                 <td className="fm-code font-semibold">{r.mahd}</td>
                                 <td>{formatDate(r.ngaylap)}</td>
                                 <td className="font-semibold text-primary">{hvMap[r.mahv]?.tenhv || r.mahv?.tenhv || '_'}</td>
                                 <td>{r.tenlop}</td>
                                 <td>{r.nhanvien}</td>
                                 <td>{r.sobuoihoc ? `${r.sobuoihoc} buổi` : '_'}</td>
                                 <td>{r.ngaybatdau}</td>
                                 <td>{r.ngayketthuc}</td>
                                 <td>{r.hinhthuc}</td>
                                 <td className="text-right">{fCur(r.tongcong)}</td>
                                 <td className="text-right font-bold text-success">{fCur(r.dadong)}</td>
                                 <td className="text-right font-bold text-danger">{fCur(r.conno) !== '0' ? fCur(r.conno) : ''}</td>
                                 <td className="fm-actions-td" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                                    {currentUser?.role === 'Quản lý' && <button title="Sửa hóa đơn" className="btn-blue" onClick={() => handleEditHoaDon(r)}><Edit size={16} /></button>}
                                    <button title="In phiếu" className="btn-blue" onClick={() => handlePrintHoaDon(r)}><Printer size={16} /></button>
                                    <button title="Hủy hóa đơn" onClick={() => handleDelete('mahd', r.mahd, 'tbl_hd')}><Trash2 size={16} /></button>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>

                  {/* Card View for Mobile */}
                  <div className="fm-card-list">
                     {filteredData.map(r => (
                        <div key={r.mahd} className="fm-card">
                           <div className="fm-card-header">
                              <span className="fm-card-code">{r.mahd}</span>
                              <span className="text-muted">{formatDateRaw(r.ngaylap)}</span>
                           </div>
                           <div className="fm-card-body">
                              <div className="fm-card-row"><span>Học sinh:</span> <strong className="text-primary">{hvMap[r.mahv]?.tenhv || r.mahv?.tenhv || '_'}</strong></div>
                              <div className="fm-card-row"><span>Kết thúc:</span> <span>{r.ngayketthuc || '_'}</span></div>
                              <div className="fm-card-row">
                                 <span>Tổng cộng:</span>
                                 <strong className="text-slate-800">{fCur(r.tongcong)} ₫</strong>
                              </div>
                              {pCur(r.giamhocphi) > 0 && (
                                 <div className="fm-card-row">
                                    <span>Giảm trừ:</span>
                                    <strong className="text-orange-500">-{fCur(r.giamhocphi)} ₫</strong>
                                 </div>
                              )}
                              <div className="fm-card-row price-row">
                                 <span>Đã nộp:</span>
                                 <strong className="text-success">{fCur(r.dadong)} ₫</strong>
                              </div>
                              {pCur(r.conno) > 0 && (
                                 <div className="fm-card-row"><span>Còn nợ:</span> <strong className="text-danger">{fCur(r.conno)} ₫</strong></div>
                              )}
                              <div className="fm-card-actions">
                                 <button className="btn-blue-sm" style={{ background: '#0ea5e9' }} onClick={() => handleEditHoaDon(r)}><Edit size={16} /> Sửa</button>
                                 <button className="btn-blue-sm" style={{ background: '#6366f1' }} onClick={() => handlePrintHoaDon(r)}><Printer size={16} /> In</button>
                                 <button className="btn-danger-sm" onClick={() => handleDelete('mahd', r.mahd, 'tbl_hd')}><Trash2 size={16} /> Hủy</button>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </>
            );
         case 'nhapkho':
            return (
               <>
                  <div className="table-scroll-wrapper">
                     <table className="fm-table">
                        <thead>
                           <tr>
                              <th>Tracking Kho</th>
                              <th>Ngày Nhập</th>
                              <th>Mã & Tên Hàng Hoá</th>
                              <th>Nhà Cung Cấp</th>
                              <th>Nhân Viên Nhập</th>
                              <th>Hình thức</th>
                              <th className="text-center">Số Lượng</th>
                              <th className="text-right">Giá Nhập</th>
                              <th className="text-right">Tổng Giá Trị Nhập</th>
                              <th className="text-center">Hành động</th>
                           </tr>
                        </thead>
                        <tbody>
                           {filteredData.map(r => (
                              <tr key={r.manhapkho}>
                                 <td className="fm-code font-semibold text-warning">{r.manhapkho}</td>
                                 <td>{formatDate(r.ngaynhap)}</td>
                                 <td className="font-semibold text-primary">{hhMap[r.mahang] || r.mahang}</td>
                                 <td>{r.nhacungcap || '_'}</td>
                                 <td>{nvMap[r.manv] || r.manv}</td>
                                 <td>{r.hinhthuc}</td>
                                 <td className="text-center font-bold">+{r.soluong}</td>
                                 <td className="text-right">{fCur(r.gianhap)}</td>
                                 <td className="text-right font-bold text-danger">-{fCur(r.thanhtien)}</td>
                                 <td className="fm-actions-td" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                                    <button title="Hủy biên lai nhập" onClick={() => handleDelete('manhapkho', r.manhapkho, 'tbl_nhapkho')}><Trash2 size={16} /></button>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>

                  {/* Card View for Mobile */}
                  <div className="fm-card-list">
                     {filteredData.map(r => (
                        <div key={r.manhapkho} className="fm-card">
                           <div className="fm-card-header">
                              <span className="fm-card-code" style={{ color: '#f59e0b' }}>{r.manhapkho}</span>
                              <span className="text-muted">{formatDateRaw(r.ngaynhap)}</span>
                           </div>
                           <div className="fm-card-body">
                              <div className="fm-card-row"><span>Sản phẩm:</span> <strong className="text-primary">{hhMap[r.mahang] || r.mahang}</strong></div>
                              <div className="fm-card-row"><span>Số lượng:</span> <strong className="text-success">+{r.soluong}</strong></div>
                              <div className="fm-card-row price-row">
                                 <span>Tổng tiền nhập:</span>
                                 <strong className="text-danger">-{fCur(r.thanhtien)} ₫</strong>
                              </div>
                              <div className="fm-card-actions">
                                 <button className="btn-danger-sm" onClick={() => handleDelete('manhapkho', r.manhapkho, 'tbl_nhapkho')}><Trash2 size={16} /> Hủy nhập</button>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </>
            );
         case 'billhanghoa':
         case 'billhang':
            return (
               <>
                  <div className="table-scroll-wrapper">
                     <table className="fm-table">
                        <thead>
                           <tr>
                              <th onClick={() => requestSort('mabill')} style={{ cursor: 'pointer', userSelect: 'none' }}>Mã Bill <SortIcon columnKey="mabill" /></th>
                              <th onClick={() => requestSort('ngaylap')} style={{ cursor: 'pointer', userSelect: 'none' }}>Ngày Bán <SortIcon columnKey="ngaylap" /></th>
                              <th onClick={() => requestSort('mahv')} style={{ cursor: 'pointer', userSelect: 'none' }}>Tên Học Sinh <SortIcon columnKey="mahv" /></th>
                              <th>Danh Mục Sp</th>
                              <th>Chiết Khấu</th>
                              <th className="text-right" onClick={() => requestSort('tongcong')} style={{ cursor: 'pointer', userSelect: 'none' }}>Tổng Thu <SortIcon columnKey="tongcong" /></th>
                              <th className="text-right">Biên Lợi Nhuận</th>
                              <th>Hình thức</th>
                              <th>Người Bán</th>
                              <th className="text-center">Hành động</th>
                           </tr>
                        </thead>
                        <tbody>
                           {filteredData.map(r => (
                              <tr key={r.mabill}>
                                 <td className="fm-code font-semibold text-success">{r.mabill}</td>
                                 <td>{formatDate(r.ngaylap)}</td>
                                 <td className="font-medium">{hvMap[r.mahv]?.tenhv || r.mahv?.tenhv || 'Khách vãng lai'}</td>
                                 <td className="fm-desc" style={{ maxWidth: '220px' }}>
                                    {r.hanghoa && r.hanghoa.includes('Tên Hàng') ? `${r.hanghoa.split(/\\r\\n|\\n|\\r/).filter(Boolean).length - 1} Loại SP (Bấm in để xem)` : r.hanghoa}
                                 </td>
                                 <td>{fCur(r.chietkhau)}</td>
                                 <td className="text-right font-bold text-success">+{fCur(r.tongcong)}</td>
                                 <td className="text-right font-bold text-primary">{fCur(r.loinhuan)}</td>
                                 <td>{r.hinhthuc}</td>
                                 <td>{r.nhanvien}</td>
                                 <td className="fm-actions-td" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                                    <button title="In bill hàng" className="btn-blue" onClick={() => handlePrintBill(r)}><Printer size={16} /></button>
                                    <button title="Hủy bill hàng POS" onClick={() => handleDelete('mabill', r.mabill, 'tbl_billhanghoa')}><Trash2 size={16} /></button>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>

                  {/* Card View for Mobile */}
                  <div className="fm-card-list">
                     {filteredData.map(r => (
                        <div key={r.mabill} className="fm-card">
                           <div className="fm-card-header">
                              <span className="fm-card-code" style={{ color: '#10b981' }}>{r.mabill}</span>
                              <span className="text-muted">{formatDateRaw(r.ngaylap)}</span>
                           </div>
                           <div className="fm-card-body">
                              <div className="fm-card-row"><span>Khách hàng:</span> <strong className="text-primary">{hvMap[r.mahv]?.tenhv || r.mahv?.tenhv || 'Khách vãng lai'}</strong></div>
                              <div className="fm-card-row">
                                 <span>Hàng hóa:</span>
                                 <span className="text-slate-600">
                                    {(function () {
                                       if (!r.hanghoa) return '0 loại SP';
                                       if (!r.hanghoa.includes('Tên Hàng')) return r.hanghoa;
                                       // Split by real newline and carriage return
                                       const rows = r.hanghoa.split(/\r?\n/).filter(line => line.trim() !== "");
                                       return `${rows.length > 0 ? rows.length - 1 : 0} loại SP`;
                                    })()}
                                 </span>
                              </div>
                              <div className="fm-card-row price-row">
                                 <span>Tổng thu:</span>
                                 <strong className="text-success">+{fCur(r.tongcong)} ₫</strong>
                              </div>
                              <div className="fm-card-actions">
                                 <button className="btn-blue-sm" style={{ background: '#6366f1' }} onClick={() => handlePrintBill(r)}><Printer size={16} /> In</button>
                                 <button className="btn-danger-sm" onClick={() => handleDelete('mabill', r.mabill, 'tbl_billhanghoa')}><Trash2 size={16} /> Hủy</button>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </>
            );
         default:
            return <div className="p-5 text-center text-muted">Vui lòng chọn một phân hệ Quản lý Tài chính/Kho/Dịch vụ.</div>
      }
   };

   let extractedNguoiNhan = printReceipt?.nguoinhan || '';
   let extractedMota = printReceipt?.mota || printReceipt?.hangmucchi || '';

   if (printReceipt?.mota && printReceipt.mota.includes('[Người giao dịch: ')) {
      const match = printReceipt.mota.match(/\[Người giao dịch:\s*(.*?)\]\s*(.*)/);
      if (match) {
         extractedNguoiNhan = extractedNguoiNhan || match[1];
         extractedMota = match[2] || printReceipt.hangmucchi || '';
      }
   }

   return (
      <div className="finance-manager animate-fade-in">

         {/* STATS MATRIX */}
         <div className="fm-stats-layout">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.4rem' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="fm-date-filter">
                     <select value={dateFilter} onChange={e => {
                        setDateFilter(e.target.value);
                        if (e.target.value === 'custom') {
                           setCustomDateRange({
                              start: new Date().toISOString().split('T')[0],
                              end: new Date().toISOString().split('T')[0]
                           });
                        }
                     }}>
                        <option value="today">Hôm nay</option>
                        <option value="yesterday">Hôm qua</option>
                        <option value="7days">7 ngày qua</option>
                        <option value="this_month">Trong tháng này</option>
                        <option value="last_month">Tháng trước</option>
                        <option value="custom">Tùy chọn ngày...</option>
                        <option value="all">Toàn bộ thời gian</option>
                     </select>
                  </div>
                  {activeDateRangeStr && (
                     <span className="fm-date-range-display" style={{ fontSize: '0.9rem', color: '#10b981', fontWeight: 600, background: '#ecfdf5', padding: '0.35rem 0.8rem', borderRadius: '6px', border: '1px solid #10b981' }}>
                        {activeDateRangeStr}
                     </span>
                  )}
                  <div className="fm-hinhthuc-filter">
                     <select value={hinhThucFilter} onChange={e => setHinhThucFilter(e.target.value)} style={{ padding: '0.45rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                        <option value="">Tất cả hình thức</option>
                        {walletsConfig.length > 0 ? walletsConfig.map(w => (
                           <option key={w.id} value={w.name}>{w.name}</option>
                        )) : <option value="Tiền mặt">Tiền mặt</option>}
                     </select>
                  </div>
               </div>
               {dateFilter === 'custom' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', width: 'fit-content' }}>
                     <label style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>Từ:</label>
                     <input type="date" value={customDateRange.start} onChange={e => setCustomDateRange({ ...customDateRange, start: e.target.value })} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                     <label style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>Đến:</label>
                     <input type="date" value={customDateRange.end} onChange={e => setCustomDateRange({ ...customDateRange, end: e.target.value })} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                     <button onClick={fetchData} className="btn-blue" style={{ padding: '0.4rem 1.2rem', borderRadius: '6px', fontWeight: 600, border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer', boxShadow: '0 2px 4px rgba(59,130,246,0.3)' }}>Lọc Dữ Liệu</button>
                  </div>
               )}
            </div>

            {config?.hienvithuchi && (
               <div className="fm-stats-toprow">
                  <div className="fm-dau-ky-info" style={{ background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', flex: 1 }}>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <span className="text-muted" style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                           Ngày mốc: <strong style={{ color: '#334155' }}>{initialBalances.ngaylap ? formatDateRaw(initialBalances.ngaylap) : 'Chưa thiết lập'}</strong>
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                           {!initialBalances.id && (
                              <button className="fm-btn-add-dauky" onClick={() => {
                                 setBalanceData({ vi1: initialBalances.vi1, vi2: initialBalances.vi2, vi3: initialBalances.vi3, vi4: initialBalances.vi4 });
                                 setBalanceModal(true);
                              }}><Plus size={16} /> Thiết lập Đầu Kỳ</button>
                           )}
                           <button className="fm-btn-add-dauky" style={{ background: '#8b5cf6' }} onClick={handleOpenCanDoi}><Activity size={16} /> Cân Đối Dòng Tiền</button>
                           <button className="fm-btn-add-dauky" style={{ background: '#64748b' }} onClick={handleOpenHistory} title="Xem lịch sử biến động quỹ đầu kỳ"><Clock size={16} /> Lịch sử</button>
                        </div>
                     </div>
                  </div>

                  <div className="fm-top-right">
                     {walletsConfig.map(w => (
                        <div className="fm-wallet-card" key={w.id}>
                           <div className="fm-wc-row" style={{ marginBottom: '0.4rem' }}><span>{w.name}:</span> <strong style={{ color: '#0ea5e9', fontSize: '1.15rem' }}>{fCur(initialBalances[w.id])}</strong></div>
                           <div className="fm-wc-row"><span>Hiện tại:</span> <strong style={{ fontSize: '1.15rem', color: '#1e293b' }}>{fCur(currentBalances[w.id])}</strong></div>
                        </div>
                     ))}
                  </div>
               </div>
            )}

            <div className="fm-stats-grid">
               <div className="fm-stat-card" onClick={() => setActiveSubTab && setActiveSubTab('phieuchi')} style={{ cursor: 'pointer' }}>
                  <div className="fm-stat-icon ico-chi"><TrendingDown size={24} /></div>
                  <div className="fm-stat-info">
                     <span className="fm-stat-label">Phiếu chi</span>
                     <span className="fm-stat-value text-danger">{fCur(stats.phieuChi)}</span>
                  </div>
               </div>
               <div className="fm-stat-card" onClick={() => setActiveSubTab && setActiveSubTab('nhapkho')} style={{ cursor: 'pointer' }}>
                  <div className="fm-stat-icon ico-nhap"><Package size={24} /></div>
                  <div className="fm-stat-info">
                     <span className="fm-stat-label">Nhập kho</span>
                     <span className="fm-stat-value" style={{ color: '#ec4899' }}>{fCur(stats.nhapKho)}</span>
                  </div>
               </div>
               <div className="fm-stat-card" onClick={() => setActiveSubTab && setActiveSubTab('hoadon')} style={{ cursor: 'pointer' }}>
                  <div className="fm-stat-icon ico-hocphi"><GraduationCap size={24} /></div>
                  <div className="fm-stat-info">
                     <span className="fm-stat-label">Thu học phí</span>
                     <span className="fm-stat-value text-success">{fCur(stats.thuHocPhi)}</span>
                  </div>
               </div>
               <div className="fm-stat-card" onClick={() => setActiveSubTab && setActiveSubTab('billhang')} style={{ cursor: 'pointer' }}>
                  <div className="fm-stat-icon ico-banhang"><ShoppingCart size={24} /></div>
                  <div className="fm-stat-info">
                     <span className="fm-stat-label">Thu bán hàng</span>
                     <span className="fm-stat-value" style={{ color: '#14b8a6' }}>{fCur(stats.thuBanHang)}</span>
                  </div>
               </div>
               <div className="fm-stat-card" onClick={() => setActiveSubTab && setActiveSubTab('phieuchi')} style={{ cursor: 'pointer' }}>
                  <div className="fm-stat-icon ico-thukhac"><Activity size={24} /></div>
                  <div className="fm-stat-info">
                     <span className="fm-stat-label">Phiếu thu khác</span>
                     <span className="fm-stat-value text-primary">{fCur(stats.thuKhac)}</span>
                  </div>
               </div>
            </div>
         </div>

         <div className="fm-toolbar">
            <div className="fm-tb-left">
               <div className="fm-search">
                  <Search size={16} className="text-muted" />
                  <input
                     type="text"
                     value={searchTerm}
                     onChange={e => setSearchTerm(e.target.value)}
                     placeholder="Tìm kiếm..."
                  />
               </div>
            </div>
            <div className="fm-tb-right" style={{ display: 'flex', gap: '0.5rem' }}>
               {activeSubTab === 'phieuchi' ? (
                  <>
                     <button className="fm-btn-add-dauky" style={{ background: '#10b981' }} onClick={() => {
                        setPhieuData({ hangmucchi: '', nguoinhan: '', mota: '', chiphi: '', manv: currentUser?.manv || '', hinhthuc: walletsConfig[0]?.name || 'Tiền mặt' });
                        setAddPhieuModal({ isOpen: true, type: 'Thu' });
                     }}><Plus size={16} /> Thêm Phiếu Thu</button>
                     <button className="fm-btn-add-dauky" style={{ background: '#ef4444' }} onClick={() => {
                        setPhieuData({ hangmucchi: '', nguoinhan: '', mota: '', chiphi: '', manv: currentUser?.manv || '', hinhthuc: walletsConfig[0]?.name || 'Tiền mặt' });
                        setAddPhieuModal({ isOpen: true, type: 'Chi' });
                     }}><Plus size={16} /> Thêm Phiếu Chi</button>
                     <button className="fm-btn-export" onClick={handleExportExcel} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', border: '1px solid #cbd5e1', padding: '0.5rem 1rem', borderRadius: '6px', background: 'white', fontWeight: 600, cursor: 'pointer' }}><DownloadCloud size={16} /> Xuất ra Excel</button>
                  </>
               ) : activeSubTab === 'nhapkho' ? (
                  <>
                     <button className="fm-btn-add-dauky" style={{ background: '#3b82f6' }} onClick={handleOpenBatchImport}>
                        <Plus size={16} /> Nhập Hàng Loạt
                     </button>
                     <button className="fm-btn-export" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', border: '1px solid #cbd5e1', padding: '0.5rem 1rem', borderRadius: '6px', background: 'white', fontWeight: 600, cursor: 'pointer' }}>
                        <DownloadCloud size={16} /> Trích Xuất Dữ Liệu
                     </button>
                  </>
               ) : (
                  <button className="fm-btn-export" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', border: '1px solid #cbd5e1', padding: '0.5rem 1rem', borderRadius: '6px', background: 'white', fontWeight: 600, cursor: 'pointer' }}>
                     <DownloadCloud size={16} /> Trích Xuất Dữ Liệu
                  </button>
               )}
            </div>
         </div>

         <div className="fm-content-block">
            {renderContent()}
         </div>


         {balanceModal && document.body && createPortal(
            <div className="fm-modal-overlay">
               <div className="fm-modal animate-slide-up" style={{ maxWidth: '400px' }}>
                  <div className="fm-modal-header" style={{ padding: '1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>Nhập Tiền Đầu Kỳ</h3>
                     <button onClick={() => setBalanceModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
                  </div>
                  <form onSubmit={handleSaveBalances} style={{ padding: '1.5rem' }}>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {walletsConfig.map(w => (
                           <div key={w.id}>
                              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>{w.name} (VNĐ)</label>
                              <input type="text" value={fCur(balanceData[w.id])} onChange={e => setBalanceData({ ...balanceData, [w.id]: e.target.value.replace(/,/g, '') })} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1rem', fontVariantNumeric: 'tabular-nums' }} />
                           </div>
                        ))}
                        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0.5rem 0' }}>* Ghi đè mốc đầu kỳ tính từ thời điểm xác nhận hiện tại.</p>
                        <button type="submit" style={{ width: '100%', padding: '0.85rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', marginTop: '0.5rem' }}>
                           Xác Nhận Lưu Mốc
                        </button>
                     </div>
                  </form>
               </div>
            </div>,
            document.body
         )}

         {addPhieuModal.isOpen && document.body && createPortal(
            <div className="fm-modal-overlay" style={{ zIndex: 9999 }}>
               <div className="fm-modal animate-slide-up" style={{ maxWidth: '540px', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                  <div className="fm-modal-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b', fontWeight: 800 }}>Thêm Phiếu {addPhieuModal.type} Mới</h3>
                     <button onClick={() => setAddPhieuModal({ isOpen: false, type: 'Chi' })} style={{ background: '#f8fafc', border: 'none', cursor: 'pointer', color: '#64748b', padding: '6px', borderRadius: '8px' }}><X size={20} /></button>
                  </div>
                  <form onSubmit={handleSavePhieu} style={{ padding: '1.25rem 1.5rem' }}>
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                           <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Hạng mục</label>
                           <select
                              required
                              value={phieuData.hangmucchi}
                              onChange={e => setPhieuData({ ...phieuData, hangmucchi: e.target.value })}
                              style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }}
                           >
                              <option value="">-- Chọn hạng mục {addPhieuModal.type} --</option>
                              {(() => {
                                 const raw = addPhieuModal.type === 'Thu' ? config?.hangmucthu : config?.hangmucchi;
                                 if (!raw) return [];
                                 if (Array.isArray(raw)) return raw;
                                 if (typeof raw === 'string') return raw.split(',').map(s => s.trim()).filter(Boolean);
                                 return [];
                              })().map((s, idx) => (
                                 <option key={idx} value={s}>{s}</option>
                              ))}
                              <option value="Khác">Khác</option>
                           </select>
                        </div>
                        <div>
                           <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>{addPhieuModal.type === 'Chi' ? 'Người nhận' : 'Người nộp'}</label>
                           <input type="text" required placeholder="Tên khách hàng/NCC" value={phieuData.nguoinhan} onChange={e => setPhieuData({ ...phieuData, nguoinhan: e.target.value })} style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }} />
                        </div>
                     </div>

                     <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Nội dung chi tiết</label>
                        <textarea rows={2} required placeholder="Nhập ghi chú bổ sung cho phiếu..." value={phieuData.mota} onChange={e => setPhieuData({ ...phieuData, mota: e.target.value })} style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', resize: 'none' }} />
                     </div>

                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                        <div>
                           <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Số tiền (VNĐ)</label>
                           <input type="text" required value={fCur(phieuData.chiphi)} onChange={e => setPhieuData({ ...phieuData, chiphi: e.target.value.replace(/,/g, '') })} style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #3b82f6', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', fontVariantNumeric: 'tabular-nums', background: '#eff6ff' }} />
                        </div>
                        <div>
                           <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Hình thức</label>
                           <select required value={phieuData.hinhthuc} onChange={e => setPhieuData({ ...phieuData, hinhthuc: e.target.value })} style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }}>
                              {walletsConfig.length === 0 && <option value="Tiền mặt">Tiền mặt</option>}
                              {walletsConfig.map(w => (
                                 <option key={w.id} value={w.name}>{w.name}</option>
                              ))}
                           </select>
                        </div>
                     </div>

                     <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Người lập phiếu</label>
                        <select disabled value={phieuData.manv} style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', background: '#f8fafc', cursor: 'not-allowed' }}>
                           <option value={phieuData.manv}>{nvMap[phieuData.manv] || phieuData.manv || '-- Nhân viên xác nhận --'}</option>
                        </select>
                     </div>

                     <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" onClick={() => setAddPhieuModal({ isOpen: false, type: 'Chi' })} style={{ flex: 1, padding: '0.85rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>Hủy bỏ</button>
                        <button type="submit" style={{ flex: 2, padding: '0.85rem', background: addPhieuModal.type === 'Thu' ? '#10b981' : '#ef4444', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                           Xác Nhận Lưu Phiếu {addPhieuModal.type}
                        </button>
                     </div>
                  </form>
               </div>
            </div>,
            document.body
         )}

         {isBatchImportOpen && document.body && createPortal(
            <div className="fm-modal-overlay" style={{ zIndex: 9999 }}>
               <div className="fm-modal animate-slide-up" style={{ maxWidth: '850px', width: '95%' }}>
                  <div className="fm-modal-header" style={{ padding: '1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>Nhập Lô Hàng Hoá</h3>
                     <button type="button" onClick={() => setIsBatchImportOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
                  </div>
                  <form onSubmit={handleSaveBatchImport} style={{ padding: '1.5rem', maxHeight: '75vh', overflowY: 'auto' }}>
                     <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 200px' }}>
                           <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>Nhà Cung Cấp</label>
                           <input type="text" value={batchImportData.nhacungcap} onChange={e => setBatchImportData({ ...batchImportData, nhacungcap: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} placeholder="VD: NPP Hà Nội" />
                        </div>
                        <div style={{ flex: '1 1 200px' }}>
                           <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>Hình Thức Thanh Toán</label>
                           <select value={batchImportData.hinhthuc} onChange={e => setBatchImportData({ ...batchImportData, hinhthuc: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                              {walletsConfig.length === 0 && <option value="Tiền mặt">Tiền mặt</option>}
                              {walletsConfig.map(w => (
                                 <option key={w.id} value={w.name}>{w.name}</option>
                              ))}
                           </select>
                        </div>
                        <div style={{ flex: '1 1 200px' }}>
                           <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>Nhân Viên Nhập</label>
                           <select disabled value={batchImportData.manv} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'not-allowed' }}>
                              <option value={batchImportData.manv}>{nvMap[batchImportData.manv] || batchImportData.manv || '-- Nhân viên --'}</option>
                           </select>
                        </div>
                     </div>

                     <div style={{ marginBottom: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                        <h4 style={{ margin: '0 0 1rem 0', color: '#334155' }}>Danh sách sản phẩm nhập</h4>
                        {batchImportData.rows.map((row, i) => (
                           <div key={row.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                              <div style={{ flex: '2 1 250px' }}>
                                 <select required value={row.mahang} onChange={e => {
                                    const prod = productList.find(p => p.mahang === e.target.value);
                                    handleRowChange(row.id, 'mahang', e.target.value);
                                    if (prod) handleRowChange(row.id, 'gianhap', fCur(prod.gianhap || 0));
                                 }} style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                    <option value="">-- Chọn hàng hoá... --</option>
                                    {productList.map(p => (
                                       <option key={p.mahang} value={p.mahang}>{p.tenhang} ({p.mahang})</option>
                                    ))}
                                 </select>
                              </div>
                              <div style={{ flex: '1 1 100px' }}>
                                 <input type="number" min="1" required placeholder="SL nhập" value={row.soluongThem} onChange={e => handleRowChange(row.id, 'soluongThem', e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                              </div>
                              <div style={{ flex: '1.5 1 150px' }}>
                                 <input type="text" required placeholder="Giá nhập/SP" value={row.gianhap} onChange={e => handleRowChange(row.id, 'gianhap', fCur(e.target.value.replace(/\D/g, '')))} style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'right' }} />
                              </div>
                              <div style={{ flex: '1.5 1 150px', display: 'flex', alignItems: 'center', height: '100%' }}>
                                 <input type="text" disabled value={fCur((parseInt(row.soluongThem || 0) * parseInt((row.gianhap || '').toString().replace(/,/g, '') || 0)))} style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 600, textAlign: 'right' }} />
                              </div>
                              {batchImportData.rows.length > 1 && (
                                 <button type="button" onClick={() => handleRemoveRow(row.id)} style={{ padding: '0.65rem', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer' }}><Trash2 size={18} /></button>
                              )}
                           </div>
                        ))}
                        <button type="button" onClick={handleAddRow} style={{ marginTop: '0.5rem', background: 'none', border: '1px dashed #cbd5e1', color: '#3b82f6', padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                           <Plus size={16} /> Thêm dòng sản phẩm
                        </button>
                     </div>

                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                           Tổng giá trị nhập lô: <span style={{ color: '#ef4444', marginLeft: '0.5rem' }}>{fCur(batchImportData.rows.reduce((sum, r) => sum + (parseInt(r.soluongThem || 0) * parseInt((r.gianhap || '').toString().replace(/,/g, '') || 0)), 0))} VNĐ</span>
                        </div>
                        <button type="submit" style={{ padding: '0.85rem 2rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}>
                           Xác Nhận Nhập Kho Lô Hàng
                        </button>
                     </div>
                  </form>
               </div>
            </div>,
            document.body
         )}

         {/* PRINT TEMPLATE - PHIẾU THU CHI */}
         {printReceipt && document.body && createPortal(
            <div className="print-a5-receipt" style={{ position: 'relative', overflow: 'hidden' }}>
               {/* WATERMARK WAVY LINES */}
               <div style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 0,
                  opacity: 0.25,
                  pointerEvents: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 10 Q 25 20 50 10 T 100 10' fill='none' stroke='%230066cc' stroke-width='0.5'/%3E%3Cpath d='M0 5 Q 25 15 50 5 T 100 5' fill='none' stroke='%230066cc' stroke-width='0.3' opacity='0.5'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'repeat'
               }} />
               <div style={{ position: 'relative', zIndex: 1 }}>
                  <div className="p-header" style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     {/* LEFT: Logo */}
                     <div style={{ width: '180px', textAlign: 'left' }}>
                        <img crossOrigin="anonymous" src={config?.logo || "/logo.png"} alt="logo" style={{ maxWidth: '160px', maxHeight: '100px', objectFit: 'contain' }} onError={(e) => { e.target.src = "/logo.png" }} />
                     </div>

                     {/* CENTER: Info */}
                     <div style={{ flex: 1, textAlign: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, textTransform: 'uppercase' }}>
                           {config?.tencongty || 'Tên Công Ty'}
                        </h3>
                        <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Địa chỉ: {config?.diachicongty}</p>
                        <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Số điện thoại: {config?.sdtcongty}</p>
                     </div>

                     {/* RIGHT: Info */}
                     <div style={{ width: '150px', textAlign: 'right', fontSize: '14px' }}>
                        <div>Mã phiếu: <b style={{ fontWeight: 950 }}>{printReceipt.maphieuchi}</b></div>
                        <div>Ngày lập: <span style={{ fontWeight: 600 }}>{new Date(printReceipt.ngaylap).toLocaleDateString("vi-VN")}</span></div>
                     </div>
                  </div>

                  {/* TITLE */}
                  <div style={{ textAlign: "center", fontWeight: "950", fontSize: "24pt", margin: "20px 0", color: '#000', textTransform: 'uppercase', textDecoration: 'underline' }}>
                     {printReceipt.loaiphieu === 'Thu' ? 'PHIẾU THU' : 'PHIẾU CHI'}
                  </div>

                  <div className="p-content">
                     <div className="p-row">
                        <span className="p-label">Họ tên {printReceipt.loaiphieu === 'Thu' ? 'người nộp tiền' : 'người nhận tiền'}:</span>
                        <span className="p-value font-medium">{extractedNguoiNhan}</span>
                     </div>
                     <div className="p-row">
                        <span className="p-label">Lý do {printReceipt.loaiphieu === 'Thu' ? 'thu' : 'chi'}:</span>
                        <span className="p-value">{extractedMota}</span>
                     </div>
                     <div className="p-row">
                        <span className="p-label">Số tiền:</span>
                        <span className="p-value"><strong style={{ fontSize: '1.1rem' }}>{fCur(printReceipt.chiphi)} VNĐ</strong></span>
                     </div>
                     <div className="p-row">
                        <span className="p-label">Viết bằng chữ:</span>
                        <span className="p-value" style={{ fontStyle: 'italic', fontWeight: 'bold' }}>{READ_NUMBER_VN(pCur(printReceipt.chiphi))}</span>
                     </div>
                  </div>

                  <div className="p-signatures">
                     <div className="sig-date" style={{ gridColumn: '1 / -1', textAlign: 'right', fontStyle: 'italic', marginBottom: '15px', paddingRight: '20px' }}>
                        Ngày {new Date(printReceipt.ngaylap).getDate().toString().padStart(2, '0')} tháng {(new Date(printReceipt.ngaylap).getMonth() + 1).toString().padStart(2, '0')} năm {new Date(printReceipt.ngaylap).getFullYear()}
                     </div>
                     <div className="sig-box">
                        <h4>Giám đốc</h4>
                        <p>(Ký, họ tên)</p>
                     </div>
                     <div className="sig-box">
                        <h4>Kế toán</h4>
                        <p>(Ký, họ tên)</p>
                     </div>
                     <div className="sig-box">
                        <h4>Người lập phiếu</h4>
                        <p>(Ký, họ tên)</p>
                        <div className="sig-name">{nvMap[printReceipt.manv] || printReceipt.manv || ''}</div>
                     </div>
                     <div className="sig-box">
                        <h4>{printReceipt.loaiphieu === 'Thu' ? 'Người nộp tiền' : 'Người nhận tiền'}</h4>
                        <p>(Ký, họ tên)</p>
                        <div className="sig-name">{extractedNguoiNhan}</div>
                     </div>
                  </div>

                  <div className="p-footer-note">
                     <strong>Đã nhận đủ số tiền: </strong>
                     <span style={{ fontStyle: 'italic' }}>{READ_NUMBER_VN(pCur(printReceipt.chiphi))}</span>
                  </div>
               </div>
            </div>,
            document.body
         )}

         {/* PRINT TEMPLATE - PHIẾU LƯƠNG */}
         {printLuong && document.body && createPortal(
            <div className="print-a5-receipt" style={{ position: 'relative', overflow: 'hidden' }}>
               {/* WATERMARK WAVY LINES */}
               <div style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 0,
                  opacity: 0.25,
                  pointerEvents: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 10 Q 25 20 50 10 T 100 10' fill='none' stroke='%230066cc' stroke-width='0.5'/%3E%3Cpath d='M0 5 Q 25 15 50 5 T 100 5' fill='none' stroke='%230066cc' stroke-width='0.3' opacity='0.5'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'repeat'
               }} />
               <div style={{ position: 'relative', zIndex: 1 }}>
                  {/* HEADER */}
                  <div className="p-header" style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     {/* LEFT: Logo */}
                     <div style={{ width: '180px', textAlign: 'left' }}>
                        <img crossOrigin="anonymous" src={config?.logo || "/logo.png"} alt="logo" style={{ maxWidth: '160px', maxHeight: '100px', objectFit: 'contain' }} onError={(e) => { e.target.src = "/logo.png" }} />
                     </div>

                     {/* CENTER: Info */}
                     <div style={{ flex: 1, textAlign: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, textTransform: 'uppercase' }}>
                           {config?.tencongty || 'Tên Công Ty'}
                        </h3>
                        <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Địa chỉ: {config?.diachicongty}</p>
                        <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Số điện thoại: {config?.sdtcongty}</p>
                     </div>

                     {/* RIGHT: Info */}
                     <div style={{ width: '150px', textAlign: 'right', fontSize: '14px' }}>
                        <div>GV: <b style={{ fontWeight: 950 }}>{printLuong.manv}</b></div>
                        <div>Ngày in: <span style={{ fontWeight: 600 }}>{new Date().toLocaleDateString("vi-VN")}</span></div>
                     </div>
                  </div>

                  {/* TITLE */}
                  <div style={{ textAlign: "center", fontWeight: "950", fontSize: "24pt", margin: "10px 0", color: '#000', textTransform: 'uppercase', textDecoration: 'underline' }}>
                     PHIẾU LƯƠNG GIẢNG VIÊN
                  </div>

                  {/* INFO */}
                  <div style={{ fontSize: "13pt", lineHeight: "1.8" }}>

                     <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>Họ và tên: <b>{printLuong.tennv || nvMap[printLuong.manv] || printLuong.manv}</b></div>
                        <div>Kỳ lương: <b>Tháng {printLuong.luongthang || ((new Date(printLuong.ngaylap).getMonth() + 1).toString().padStart(2, '0') + '/' + new Date(printLuong.ngaylap).getFullYear())}</b></div>
                     </div>

                     <div>
                        Chức vụ: <b>Giảng Viên / Trợ Giảng</b>
                     </div>

                     {/* BẢNG LƯƠNG */}
                     <div style={{ marginTop: '15px', marginBottom: '15px' }}>
                        {(() => {
                           const dt = parseNoidung(printLuong.noidung);
                           return (
                              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid black', fontSize: '12pt' }}>
                                 <thead>
                                    <tr>
                                       {dt.headers.map((h, i) => {
                                          return <th key={i} style={{ border: '1px solid black', padding: '5px', textAlign: i === 0 ? 'left' : 'center' }}>{h}</th>
                                       })}
                                    </tr>
                                 </thead>
                                 <tbody>
                                    {dt.rows.map((row, rIdx) => (
                                       <tr key={rIdx}>
                                          {row.map((cell, cIdx) => {
                                             const h = dt.headers[cIdx];
                                             const lower = (h || '').toLowerCase();
                                             const isMoney = lower.includes('lương') || lower.includes('tiền') || lower.includes('đơn giá') || lower.includes('tổng');
                                             return (
                                                <td key={cIdx} style={{ border: '1px solid black', padding: '5px', textAlign: isMoney ? 'right' : cIdx === 0 ? 'left' : 'center', fontWeight: lower.includes('thành tiền') ? 'bold' : 'normal' }}>
                                                   {isMoney && cell ? fCur(cell) : cell}
                                                </td>
                                             );
                                          })}
                                       </tr>
                                    ))}
                                 </tbody>
                              </table>
                           );
                        })()}
                     </div>

                     <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div style={{ flex: 1 }}></div>
                     </div>

                     <div style={{ display: "flex", justifyContent: "space-between", margin: '15px 0' }}>
                        <div style={{ fontWeight: "bold" }}>TỔNG THỰC NHẬN: <span style={{ fontSize: '15pt' }}>{fCur(printLuong.tongcong)} ₫</span></div>
                     </div>

                     <div style={{ fontSize: '11pt', borderTop: '1px dashed #ccc', paddingTop: '10px' }}>
                        Ghi chú: {printLuong.ghichu || '........................................................................'}
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
                        <b>{printLuong.tennv || nvMap[printLuong.manv] || printLuong.manv}</b>
                     </div>

                  </div>
               </div>
            </div>,
            document.body
         )}

         {/* PRINT TEMPLATE - PHIẾU THU HỌC PHÍ */}
         {printHoaDon && document.body && createPortal(
            <div className="print-a5-receipt" style={{ position: 'relative', overflow: 'hidden', padding: '30px', background: 'white', color: '#000', width: '800px', fontFamily: 'Arial, sans-serif' }}>
               {/* WATERMARK WAVY LINES */}
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
                        <div>Mã HĐ: <b style={{ fontWeight: 950 }}>{printHoaDon.mahd}</b></div>
                        <div>Ngày lập: <span style={{ fontWeight: 600 }}>{new Date(printHoaDon.ngaylap).toLocaleDateString("vi-VN")}</span></div>
                     </div>
                  </div>

                  <div style={{ textAlign: "center", fontWeight: "950", fontSize: "20pt", margin: "15px 0", color: '#000', textTransform: 'uppercase', textDecoration: 'underline' }}>
                     BIÊN LAI THU HỌC PHÍ
                  </div>

                  <div style={{ fontSize: "14pt", lineHeight: "1.8", margin: '20px 0' }}>
                     <div style={{ display: "flex", justifyContent: "space-between", marginBottom: '5px' }}>
                        <div>Họ và tên: <b>{hvMap[printHoaDon.mahv]?.tenhv || printHoaDon.tenhv || '_'}</b></div>
                        <div>SĐT: <b>{hvMap[printHoaDon.mahv]?.sdt || printHoaDon.sdt || ""}</b></div>
                     </div>
                     <div>Khóa học: <b>{printHoaDon.tenlop}</b></div>
                     <div>
                        Tháng đóng học phí/Thời lượng: <b>{printHoaDon.thoiluong || "..."}</b>
                     </div>
                     <div style={{ marginTop: '5px' }}>
                        Hình thức đóng tiền: <b>{printHoaDon.hinhthuc || "..."}</b>
                     </div>
                     <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '15px 0' }} />

                     <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>Học phí: <b>{fCur(printHoaDon.hocphi)} đ</b></div>
                        <div>Giảm HP: <b>{fCur(printHoaDon.giamhocphi)} đ</b></div>
                        <div>Nợ cũ: <b>{fCur(printHoaDon.nocu || 0)} đ</b></div>
                     </div>

                     {printHoaDon.phuthu && (() => {
                        try {
                           const pts = typeof printHoaDon.phuthu === 'string' ? JSON.parse(printHoaDon.phuthu) : printHoaDon.phuthu;
                           if (Array.isArray(pts) && pts.length > 0) {
                              return (
                                 <div style={{ marginTop: '5px', padding: '5px', background: '#f9fafb', borderRadius: '4px' }}>
                                    {pts.map((pt, i) => (
                                       <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12pt' }}>
                                          <span>+ {pt.name || 'Phụ thu'}:</span>
                                          <b>{fCur(pt.amount)} đ</b>
                                       </div>
                                    ))}
                                 </div>
                              );
                           }
                        } catch (e) { }
                        return null;
                     })()}

                     <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", marginTop: '5px' }}>
                        <div>Tổng cộng: <b>{fCur(printHoaDon.tongcong)} đ</b></div>
                        <div>Đã đóng: <b style={{ color: '#059669' }}>{fCur(printHoaDon.dadong)} đ</b></div>
                        <div>Còn lại: <b style={{ color: '#dc2626' }}>{fCur(printHoaDon.conno)} đ</b></div>
                     </div>

                     <div style={{ marginTop: '10px' }}>
                        Ghi chú: {printHoaDon.ghichu || ""}
                     </div>
                  </div>

                  {/* FOOTER */}
                  <div style={{ marginTop: 40, fontSize: "12pt", display: "flex", justifyContent: "space-between" }}>
                     <div>
                        Facebook: Trường Lá - E Skills School <br />
                        SĐT/Zalo: {config?.sdtcongty}
                     </div>
                     <div style={{ textAlign: "center" }}>
                        Nhân viên thu tiền <br /><br /><br />
                        <b>{printHoaDon.nhanvien}</b>
                     </div>
                  </div>

                  <div style={{ marginTop: "30px", textAlign: "center", fontStyle: "italic", borderTop: '1px dashed #ccc', paddingTop: '10px', fontSize: '10pt' }}>
                     Lưu ý: Hóa đơn này có giá trị xác nhận việc đóng phí. Vui lòng giữ lại để đối chiếu khi cần thiết.
                  </div>
               </div>
            </div>,
            document.body
         )}

         {/* PRINT TEMPLATE - PHIẾU BILL HÀNG POS */}
         {printBill && document.body && createPortal(
            <div className="print-a5-receipt" style={{ position: 'relative', overflow: 'hidden' }}>
               {/* WATERMARK WAVY LINES */}
               <div style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 0,
                  opacity: 0.25,
                  pointerEvents: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 10 Q 25 20 50 10 T 100 10' fill='none' stroke='%230066cc' stroke-width='0.5'/%3E%3Cpath d='M0 5 Q 25 15 50 5 T 100 5' fill='none' stroke='%230066cc' stroke-width='0.3' opacity='0.5'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'repeat'
               }} />
               <div style={{ position: 'relative', zIndex: 1 }}>
                  {/* HEADER */}
                  <div className="p-header" style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     {/* LEFT: Logo */}
                     <div style={{ width: '180px', textAlign: 'left' }}>
                        <img crossOrigin="anonymous" src={config?.logo || "/logo.png"} alt="logo" style={{ maxWidth: '160px', maxHeight: '100px', objectFit: 'contain' }} onError={(e) => { e.target.src = "/logo.png" }} />
                     </div>

                     {/* CENTER: Info */}
                     <div style={{ flex: 1, textAlign: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, textTransform: 'uppercase' }}>
                           {config?.tencongty || 'Tên Công Ty'}
                        </h3>
                        <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Địa chỉ: {config?.diachicongty}</p>
                        <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Số điện thoại: {config?.sdtcongty}</p>
                     </div>

                     {/* RIGHT: Info */}
                     <div style={{ width: '150px', textAlign: 'right', fontSize: '14px' }}>
                        <div>Mã Bill: <b style={{ fontWeight: 950 }}>{printBill.mabill}</b></div>
                        <div>Ngày lập: <span style={{ fontWeight: 600 }}>{new Date(printBill.ngaylap).toLocaleDateString("vi-VN")}</span></div>
                     </div>
                  </div>

                  {/* TITLE */}
                  <div style={{ textAlign: "center", fontWeight: "950", fontSize: "24pt", margin: "20px 0", color: '#000', textTransform: 'uppercase', textDecoration: 'underline' }}>
                     BIÊN LAI BÁN HÀNG
                  </div>

                  {/* INFO */}
                  <div style={{ fontSize: "13pt", lineHeight: "1.8" }}>

                     <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>Họ và tên: <b>{printBill.tenhv}</b></div>
                        <div>SĐT: <b>{printBill.sdt || ""}</b></div>
                     </div>

                     <div className="p-content" style={{ padding: '0' }}>
                        {(() => {
                           const dt = parseNoidung(printBill.hanghoa);
                           return (
                              <table className="p-luong-table">
                                 <thead>
                                    <tr>
                                       {dt.headers.map((h, i) => {
                                          const lower = (h || '').toLowerCase();
                                          const isMoney = lower.includes('lương') || lower.includes('tiền') || lower.includes('đơn giá') || lower.includes('tổng');
                                          const isCenter = lower.includes('số');
                                          return <th key={i} className={isMoney ? 'text-right' : isCenter ? 'text-center' : ''}>{h}</th>
                                       })}
                                    </tr>
                                 </thead>
                                 <tbody>
                                    {dt.rows.map((row, rIdx) => (
                                       <tr key={rIdx}>
                                          {row.map((cell, cIdx) => {
                                             const h = dt.headers[cIdx];
                                             const lower = (h || '').toLowerCase();
                                             const isMoney = lower.includes('đơn giá') || lower.includes('thành tiền');
                                             const isCenter = lower.includes('số') || lower.includes('dvt');
                                             return (
                                                <td key={cIdx} className={isMoney ? 'text-right' : isCenter ? 'text-center' : ''}>
                                                   {isMoney && cell ? fCur(cell) : cell}
                                                </td>
                                             );
                                          })}
                                       </tr>
                                    ))}
                                 </tbody>
                              </table>
                           );
                        })()
                        }
                     </div>
                     <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
                        <div>CK giảm: {fCur(printBill.chietkhau)}</div>
                        <div>Tổng cộng: {fCur(printBill.tongcong)}</div>
                        <div>Đã đóng: {fCur(printBill.dadong)}</div>
                        <div>Còn lại: {fCur(printBill.conno)}</div>
                     </div>

                     <div>
                        Ghi chú: {printBill.ghichu || ""}
                     </div>
                  </div>

                  {/* FOOTER */}
                  <div style={{ marginTop: 40, fontSize: "12pt", display: "flex", justifyContent: "space-between" }}>

                     <div>
                        {config?.tencongty || 'Tên Công Ty'} <br />
                        SĐT/Zalo: {config?.sdtcongty}
                     </div>

                     <div style={{ textAlign: "center" }}>
                        Nhân viên thu tiền <br /><br /><br />
                        <b>{printBill.nhanvien}</b>
                     </div>

                  </div>
               </div>
            </div>,
            document.body
         )}


         {/* Removed duplicate batch import portal */}
         {canDoiModal && document.body && createPortal(
            <div className="fm-modal-overlay" style={{ zIndex: 1100, position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
               <div className="fm-modal animate-slide-up" style={{ maxWidth: '420px', maxHeight: '90vh', background: 'white', borderRadius: '16px', display: 'flex', flexDirection: 'column', width: '90%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                  <div className="fm-modal-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                     <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b' }}>Cân Đối Dòng Tiền</h3>
                     <button onClick={() => setCanDoiModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '5px' }}><X size={20} /></button>
                  </div>
                  <form onSubmit={handleSaveCanDoi} style={{ padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                           <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>Nội dung cân đối</label>
                           <input type="text" required value={canDoiData.noidung} onChange={e => setCanDoiData({ ...canDoiData, noidung: e.target.value })} style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }} placeholder="Lý do cân đối số dư..." />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                           {walletsConfig.map(w => (
                              <div key={w.id} style={{ background: 'white', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                 <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</label>
                                 <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                    <span>Đầu kỳ:</span> <b>{fCur(initialBalances[w.id])}</b>
                                 </div>
                                 <div style={{ fontSize: '0.75rem', color: '#0ea5e9', display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                    <span>Sổ sách:</span> <b>{fCur(currentBalances[w.id])}</b>
                                 </div>
                                 <input type="text" required value={fCur(canDoiData[w.id])} onChange={e => setCanDoiData({ ...canDoiData, [w.id]: e.target.value.replace(/,/g, '') })} style={{ width: '100%', padding: '0.55rem', marginTop: '0.3rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1.05rem', fontWeight: 700, color: '#8b5cf6', textAlign: 'right' }} placeholder="Đầu kỳ mới..." />
                                 {(() => {
                                    const truoc = currentBalances[w.id] || 0;
                                    const sau = pCur(canDoiData[w.id]);
                                    const chenhLech = truoc - sau;
                                    if (chenhLech === 0) return null;
                                    const isDeficit = chenhLech > 0;
                                    return (
                                       <div style={{ fontSize: '0.75rem', fontWeight: 800, color: isDeficit ? '#ef4444' : '#10b981', textAlign: 'right', marginTop: '4px', background: isDeficit ? '#fef2f2' : '#f0fdf4', padding: '2px 6px', borderRadius: '4px' }}>
                                          {isDeficit ? '↓ Chênh lệch: -' : '↑ Chênh lệch: +'}{fCur(Math.abs(chenhLech))}
                                       </div>
                                    );
                                 })()}
                              </div>
                           ))}
                        </div>

                        <div style={{ padding: '0.85rem', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fef3c7', fontSize: '0.85rem', color: '#92400e' }}>
                           <p style={{ margin: 0, lineHeight: '1.4' }}>Cập nhật số tiền <b>Đầu kỳ mới</b> để hệ thống bắt đầu thống kê lại theo mốc thực tế.</p>
                        </div>

                        <button type="submit" style={{ width: '100%', padding: '0.85rem', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '1.05rem', boxShadow: '0 4px 10px rgba(139, 92, 246, 0.2)', marginTop: '0.5rem' }}>
                           Xác Nhận Cân Đối
                        </button>
                     </div>
                  </form>
               </div>
            </div>,
            document.body
         )}

         {isHistoryModalOpen && document.body && createPortal(
            <div className="fm-modal-overlay" style={{ zIndex: 1200, position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
               <div className="fm-modal animate-slide-up" style={{ maxWidth: '800px', width: '95%', maxHeight: '85vh', background: 'white', borderRadius: '20px', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)' }}>
                  <div className="fm-modal-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '12px', color: '#64748b' }}><History size={24} /></div>
                        <div>
                           <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b', fontWeight: 800 }}>Lịch Sử Cân Đối Quỹ</h3>
                           <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>Theo dõi các đợt cập nhật số dư thực tế</p>
                        </div>
                     </div>
                     <button onClick={() => setIsHistoryModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b', padding: '8px', borderRadius: '10px', transition: 'all 0.2s' }}><X size={20} /></button>
                  </div>
                  <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
                     {historyData.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Chưa có bản ghi cân đối nào.</div>
                     ) : (
                        <div className="history-timeline" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                           {historyData.map((h, idx) => (
                              <div key={h.id} style={{ position: 'relative', borderLeft: '2px solid #e2e8f0', paddingLeft: '1.5rem', paddingBottom: '0.5rem' }}>
                                 <div style={{ position: 'absolute', left: '-9px', top: '0', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', border: '3px solid #8b5cf6' }}></div>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', background: '#f8fafc', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>{formatDate(h.created_at || h.id)}</span>
                                    <span style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 600 }}>NV: {nvMap[h.manv] || h.manv}</span>
                                 </div>
                                 <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontWeight: 800, marginBottom: '0.75rem', color: '#475569', fontSize: '1rem' }}>📝 {h.noidung}</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                                       {walletsConfig.map(w => {
                                          const diff = h[w.id] || {};
                                          const truoc = pCur(diff.truoc) || 0;
                                          const sau = pCur(diff.sau) || 0;
                                          return (
                                             <div key={w.id} style={{ background: 'white', padding: '10px 14px', borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 850, color: '#475569', marginBottom: '8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>{w.name}</div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem' }}>
                                                   <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                                                      <span>Đầu kỳ cũ:</span>
                                                      <span style={{ fontWeight: 600 }}>{fCur(diff.dauky || 0)}</span>
                                                   </div>
                                                   <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                                                      <span>Sổ sách:</span>
                                                      <span style={{ fontWeight: 600 }}>{fCur(truoc)}</span>
                                                   </div>
                                                   <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 850, color: '#1e293b', borderTop: '1px dashed #e2e8f0', paddingTop: '4px', marginTop: '2px' }}>
                                                      <span>Đầu kỳ mới:</span>
                                                      <span style={{ color: '#8b5cf6' }}>{fCur(sau)}</span>
                                                   </div>
                                                   {(() => {
                                                      const chenhLech = truoc - sau;
                                                      if (chenhLech === 0) return null;
                                                      return (
                                                         <div style={{ fontSize: '0.75rem', fontWeight: 800, color: chenhLech > 0 ? '#ef4444' : '#10b981', textAlign: 'right', marginTop: '2px', background: chenhLech > 0 ? '#fef2f2' : '#f0fdf4', padding: '2px 6px', borderRadius: '4px', alignSelf: 'flex-end' }}>
                                                            {chenhLech > 0 ? '↓ Chênh lệch: -' : '↑ Chênh lệch: +'}{fCur(Math.abs(chenhLech))}
                                                         </div>
                                                      );
                                                   })()}
                                                </div>
                                             </div>
                                          );
                                       })}
                                    </div>
                                 </div>
                              </div>
                           ))}
                        </div>
                     )}
                  </div>
               </div>
            </div>,
            document.body
         )}

         {editHoaDonModal && editHoaDonData && document.body && createPortal(
            <div className="fm-modal-overlay" style={{ zIndex: 1150 }}>
               <div className="fm-modal animate-slide-up" style={{ maxWidth: '500px', background: '#fff', borderRadius: '20px' }}>
                  <div className="fm-modal-header" style={{ padding: '1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b' }}>Chỉnh Sửa Hóa Đơn {editHoaDonData.mahd}</h3>
                     <button onClick={() => setEditHoaDonModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
                  </div>
                  <form style={{ padding: '1.5rem' }} onSubmit={(e) => {
                     e.preventDefault();
                     setDeletePassword('');
                     setConfirmDialog({
                        isOpen: true,
                        title: 'Xác nhận chỉnh sửa',
                        message: 'Mọi thay đổi về số tiền sẽ ảnh hưởng đến báo cáo tài chính và công nợ của học sinh. Bạn có chắc chắn muốn cập nhật không?',
                        actionType: 'EDIT_HOADON',
                        payload: editHoaDonData
                     });
                  }}>
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                           <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Học phí gốc (đ)</label>
                           <input type="text" value={fCur(editHoaDonData.hocphi)} onChange={e => {
                              const val = pCur(e.target.value);
                              const old = pCur(editHoaDonData.hocphi);
                              const diff = val - old;
                              const newTong = pCur(editHoaDonData.tongcong) + diff;
                              setEditHoaDonData({ ...editHoaDonData, hocphi: fCur(val), tongcong: newTong, conno: newTong - pCur(editHoaDonData.dadong) });
                           }} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                        </div>
                        <div>
                           <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Giảm trừ (đ)</label>
                           <input type="text" value={fCur(editHoaDonData.giamhocphi)} onChange={e => {
                              const val = pCur(e.target.value);
                              const old = pCur(editHoaDonData.giamhocphi);
                              const diff = val - old;
                              const newTong = pCur(editHoaDonData.tongcong) - diff;
                              setEditHoaDonData({ ...editHoaDonData, giamhocphi: fCur(val), tongcong: newTong, conno: newTong - pCur(editHoaDonData.dadong) });
                           }} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                        </div>
                     </div>

                     <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Phụ thu</label>
                        {(() => {
                           let pts = [];
                           try {
                              pts = typeof editHoaDonData.phuthu === 'string' ? JSON.parse(editHoaDonData.phuthu) : (Array.isArray(editHoaDonData.phuthu) ? editHoaDonData.phuthu : []);
                           } catch (e) { }
                           return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                 {pts.map((pt, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '0.5rem' }}>
                                       <input type="text" value={pt.name} onChange={e => {
                                          const newPts = [...pts];
                                          newPts[i].name = e.target.value;
                                          setEditHoaDonData({ ...editHoaDonData, phuthu: newPts });
                                       }} style={{ flex: 2, padding: '0.4rem', borderRadius: '6px', border: '1px solid #e2e8f0' }} placeholder="Tên phụ thu" />
                                       <input type="text" value={fCur(pt.amount)} onChange={e => {
                                          const oldPtVal = pts[i].amount || 0;
                                          const newPtVal = pCur(e.target.value);
                                          const diff = newPtVal - oldPtVal;
                                          const newPts = [...pts];
                                          newPts[i].amount = newPtVal;
                                          const newTong = pCur(editHoaDonData.tongcong) + diff;
                                          setEditHoaDonData({ ...editHoaDonData, phuthu: newPts, tongcong: newTong, conno: newTong - pCur(editHoaDonData.dadong) });
                                       }} style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', border: '1px solid #e2e8f0' }} placeholder="Số tiền" />
                                       <button type="button" onClick={() => {
                                          const deletedVal = pts[i].amount || 0;
                                          const newPts = pts.filter((_, idx) => idx !== i);
                                          const newTong = pCur(editHoaDonData.tongcong) - deletedVal;
                                          setEditHoaDonData({ ...editHoaDonData, phuthu: newPts, tongcong: newTong, conno: newTong - pCur(editHoaDonData.dadong) });
                                       }} style={{ background: '#fee2e2', border: 'none', color: '#ef4444', borderRadius: '6px', padding: '0.4rem' }}><X size={14} /></button>
                                    </div>
                                 ))}
                                 <button type="button" onClick={() => {
                                    const newPts = [...pts, { name: '', amount: 0 }];
                                    setEditHoaDonData({ ...editHoaDonData, phuthu: newPts });
                                 }} style={{ background: '#f1f5f9', border: '1px dashed #cbd5e1', padding: '0.4rem', borderRadius: '6px', fontSize: '0.8rem' }}>+ Thêm phụ thu</button>
                              </div>
                           );
                        })()}
                     </div>

                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                           <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#0ea5e9' }}>Đã nộp (đ)</label>
                           <input type="text" value={fCur(editHoaDonData.dadong)} onChange={e => {
                              const val = pCur(e.target.value);
                              setEditHoaDonData({ ...editHoaDonData, dadong: val, conno: pCur(editHoaDonData.tongcong) - val });
                           }} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #0ea5e9', fontWeight: 700 }} />
                        </div>
                        <div>
                           <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#ef4444' }}>Còn nợ (đ)</label>
                           <input disabled type="text" value={fCur(editHoaDonData.conno)} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #fecaca', background: '#fef2f2', fontWeight: 700 }} />
                        </div>
                     </div>

                     <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Hình thức thanh toán</label>
                        <select value={editHoaDonData.hinhthuc} onChange={e => setEditHoaDonData({ ...editHoaDonData, hinhthuc: e.target.value })} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                           {walletsConfig.length > 0 ? walletsConfig.map(w => <option key={w.id} value={w.name}>{w.name}</option>) : <option value="Tiền mặt">Tiền mặt</option>}
                        </select>
                     </div>

                     <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Ghi chú</label>
                        <textarea value={editHoaDonData.ghichu} onChange={e => setEditHoaDonData({ ...editHoaDonData, ghichu: e.target.value })} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', resize: 'none' }} rows={2} />
                     </div>

                     <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" onClick={() => setEditHoaDonModal(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', background: '#f1f5f9', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Hủy</button>
                        <button type="submit" style={{ flex: 2, padding: '0.75rem', borderRadius: '10px', background: '#3b82f6', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Lưu Thay Đổi</button>
                     </div>
                  </form>
               </div>
            </div>,
            document.body
         )}

         {confirmDialog.isOpen && document.body && createPortal(
            <div className="fm-modal-overlay" style={{ zIndex: 2000, position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
               <div className="fm-modal-content animate-slide-up" style={{ backgroundColor: 'white', maxWidth: '400px', width: '90%', borderRadius: '16px', textAlign: 'center', padding: '2.5rem 1.75rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
                     {confirmDialog.actionType === 'DELETE' ? (
                        <div style={{ background: '#fee2e2', padding: '1.25rem', borderRadius: '50%', color: '#ef4444' }}>
                           <Trash2 size={36} />
                        </div>
                     ) : (
                        <div style={{ background: '#dcfce3', padding: '1.25rem', borderRadius: '50%', color: '#22c55e' }}>
                           <CheckCircle2 size={36} />
                        </div>
                     )}
                  </div>
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.75rem', color: '#0f172a' }}>
                     {confirmDialog.title}
                  </h3>
                  <p style={{ color: '#64748b', fontSize: '1rem', marginBottom: confirmDialog.actionType === 'DELETE' ? '1rem' : '2.5rem', lineHeight: 1.6 }}>
                     {confirmDialog.message}
                  </p>

                  {(confirmDialog.actionType === 'DELETE' || confirmDialog.actionType === 'CONFIRM_CANDOI' || confirmDialog.actionType === 'EDIT_HOADON') && (
                     <div style={{ marginBottom: '2rem', textAlign: 'left' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Xác nhận mật khẩu:</label>
                        <input
                           type="password"
                           value={deletePassword}
                           onChange={(e) => setDeletePassword(e.target.value)}
                           onKeyDown={(e) => e.key === 'Enter' && executeConfirmAction()}
                           placeholder="Mật khẩu của bạn..."
                           autoFocus
                           style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', transition: 'all 0.2s' }}
                        />
                     </div>
                  )}
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                     <button
                        onClick={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
                        style={{ padding: '0.75rem 1.5rem', borderRadius: '10px', border: '1px solid #cbd5e1', background: 'white', fontWeight: 600, color: '#475569', cursor: 'pointer', flex: 1, fontSize: '1rem', transition: 'all 0.2s' }}
                     >
                        Quay lại
                     </button>
                     <button
                        onClick={() => executeConfirmAction()}
                        style={{
                           padding: '0.75rem 1.5rem',
                           borderRadius: '10px',
                           border: 'none',
                           background: confirmDialog.actionType === 'DELETE' ? '#ef4444' : (confirmDialog.actionType === 'CONFIRM_CANDOI' ? '#8b5cf6' : (confirmDialog.actionType === 'EDIT_HOADON' ? '#3b82f6' : '#22c55e')),
                           color: 'white',
                           fontWeight: 600,
                           cursor: 'pointer',
                           flex: 1,
                           fontSize: '1rem',
                           boxShadow: confirmDialog.actionType === 'DELETE' ? '0 4px 14px 0 rgba(239, 68, 68, 0.39)' : (confirmDialog.actionType === 'EDIT_HOADON' ? '0 4px 14px 0 rgba(59, 130, 246, 0.39)' : '0 4px 14px 0 rgba(34, 197, 94, 0.39)'),
                           transition: 'all 0.2s'
                        }}
                     >
                        {confirmDialog.actionType === 'DELETE' ? 'Xoá ngay' : (confirmDialog.actionType === 'EDIT_HOADON' ? 'Cập nhật' : 'Đồng ý')}
                     </button>
                  </div>
               </div>
            </div>,
            document.body
         )}
      </div>
   );
}
