import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import { supabase, supabaseNoLog, insertLog } from '../supabase';
import { useConfig } from '../ConfigContext';
import { logger } from '../utils/logger';
import { FileText, DollarSign, AlertTriangle, UserX, BadgeDollarSign, Clock, CheckCircle, X, MessageSquare, Loader2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toPng } from 'html-to-image';
import { findZaloRecipient } from '../services/zaloHelper';
import './DebtManager.css';

const ZALO_BACKEND_URL = process.env.REACT_APP_ZALO_API_URL || 'http://localhost:5000';

// ── helpers ──────────────────────────────────────────────
const pCur = (val) => parseInt(String(val || 0).replace(/,/g, ''), 10) || 0;
const fCur = (val) => {
  const n = pCur(val);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const toVietnameseWords = (number) => {
  const nums = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  function readGroup(g, full) {
    let t = '', h = Math.floor(g / 100), c = Math.floor((g % 100) / 10), d = g % 10;
    if (full || h > 0) t += nums[h] + ' trăm ';
    if (c === 0) { if ((full || h > 0) && d > 0) t += 'lẻ '; }
    else if (c === 1) t += 'mười ';
    else t += nums[c] + ' mươi ';
    if (d > 0) {
      if (d === 1 && c > 1) t += 'mốt ';
      else if (d === 5 && c > 0) t += 'lăm ';
      else t += nums[d] + ' ';
    }
    return t.trim();
  }
  if (!number || number === 0) return 'Không đồng';
  const units = ['', 'nghìn', 'triệu', 'tỉ', 'nghìn tỉ'];
  let res = '', pos = 0, n = Math.floor(Math.abs(number));
  do {
    const g = n % 1000; n = Math.floor(n / 1000);
    if (g > 0) { const s = readGroup(g, n > 0); if (s) res = s + ' ' + units[pos] + ' ' + res; }
    pos++;
  } while (n > 0);
  res = res.replace(/\s+/g, ' ').trim() + ' đồng';
  return res.charAt(0).toUpperCase() + res.slice(1);
};

const parseCSVItems = (csv) => {
  if (!csv) return [];
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length <= 1) return [];
  return lines.slice(1).map(line => {
    const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    const clean = (s) => (s || '').replace(/^"|"$/g, '').replace(/""/g, '"');
    return {
      ma: clean(parts[0]), ten: clean(parts[1]), dvt: clean(parts[2]),
      sl: parseInt(parts[3]) || 0, dg: pCur(parts[4]), tt: pCur(parts[5])
    };
  });
};

// ─────────────────────────────────────────────────────────

export default function DebtManager({ setActiveTab, onSelectStudentForInvoice }) {
  const { config } = useConfig();
  const [sendingZaloMahv, setSendingZaloMahv] = useState(null);
  const walletsConfig = (config ? [
    { id: 'vi1', name: config.vi1?.name || '', bankId: config.vi1?.bankId || '', accNo: config.vi1?.accNo || '', accName: config.vi1?.accName || '' },
    { id: 'vi2', name: config.vi2?.name || '', bankId: config.vi2?.bankId || '', accNo: config.vi2?.accNo || '', accName: config.vi2?.accName || '' },
    { id: 'vi3', name: config.vi3?.name || '', bankId: config.vi3?.bankId || '', accNo: config.vi3?.accNo || '', accName: config.vi3?.accName || '' },
    { id: 'vi4', name: config.vi4?.name || '', bankId: config.vi4?.bankId || '', accNo: config.vi4?.accNo || '', accName: config.vi4?.accName || '' },
  ].filter(w => w.name && w.name.trim() !== '') : []);

  const getQRUrl = (hinhthuc, amount, mahv, mahd) => {
    const matched = walletsConfig.find(w => String(w.name).trim() === String(hinhthuc).trim());
    if (matched && matched.bankId && matched.accNo) {
      const info = encodeURIComponent(`${mahv} Tra no ${mahd}`);
      // Dùng .svg: img.vietqr.io trả 301 từ .png sang .svg và 301 không có header CORS
      return `https://img.vietqr.io/image/${matched.bankId}-${matched.accNo}-compact2.svg?amount=${amount}&addInfo=${info}&accountName=${encodeURIComponent(matched.accName || '')}`;
    }
    return null;
  };

  const [classes, setClasses] = useState([]);
  const [debtList, setDebtList] = useState([]);
  const [overdueList, setOverdueList] = useState([]);
  const [unpaidNewList, setUnpaidNewList] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Tiền mặt');

  // Print / Download states
  const [printHoaDon, setPrintHoaDon] = useState(null);   // template phiếu thu HP
  const [printBill, setPrintBill] = useState(null);        // template biên lai bán hàng
  const [previewImg, setPreviewImg] = useState(null);
  const [classFilter, setClassFilter] = useState('');

  const invoiceNodeRef = useRef(null);
  const billNodeRef = useRef(null);

  const auth = JSON.parse(localStorage.getItem('auth_session') || '{}');
  const cashier = auth.user?.tennv || auth.user?.username || 'Thu Ngân';

  const openPaymentModal = (debtItem) => {
    setSelectedDebt(debtItem);
    const oldDebtVal = pCur(debtItem.conno);
    if (oldDebtVal < 0) {
      setPaymentAmount(Math.abs(oldDebtVal).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','));
      setPaymentNote(`Hoàn tiền trả dư phiếu ${debtItem.mahd}`);
    } else {
      setPaymentAmount(oldDebtVal.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','));
      setPaymentNote(`Trả nợ phiếu ${debtItem.mahd}`);
    }
    setPaymentError('');
    setPaymentSuccess('');
    setPaymentMethod(walletsConfig.length > 0 ? walletsConfig[0].name : 'Tiền mặt');
    setShowPaymentModal(true);
  };

  // ── Gửi tin nhắn Zalo Nhắc nợ (zalonhacno) ────────────────
  const handleSendZaloRemindNo = async (debtItem) => {
    if (!debtItem || !debtItem.mahv) return;
    setSendingZaloMahv(debtItem.mahv);
    try {
      // 1. Lấy sdt học viên & lịch sử đóng tiền gần nhất
      const { data: hvInfo } = await supabase.from('tbl_hv').select('tenhv, sdt, sdtphuhuynh').eq('mahv', debtItem.mahv).single();
      let phone = (hvInfo?.sdt || debtItem.sdt || '').trim();
      let sdtphuhuynh = (hvInfo?.sdtphuhuynh || debtItem.sdtphuhuynh || '').trim();
      if (!phone && !sdtphuhuynh && !debtItem.mahv) {
        alert(`Học viên ${debtItem.tenhv} (${debtItem.mahv}) chưa có Số điện thoại hoặc mã học viên!`);
        return;
      }

      const { data: hdList } = await supabase.from('tbl_hd')
        .select('ngaylap')
        .eq('mahv', debtItem.mahv)
        .order('ngaylap', { ascending: false })
        .limit(1);

      let ngaydonggannhat = 'Chưa có';
      if (hdList && hdList.length > 0 && hdList[0].ngaylap) {
        ngaydonggannhat = new Date(hdList[0].ngaylap).toLocaleDateString('vi-VN');
      }

      // 2. Lấy mẫu zalonhacno từ config
      const rawTpl = config?.zalonhacno || 'Kính gửi Phụ huynh/Học viên [tenhv] (Mã: [mahv]), Lớp [lop]. Ngày đóng gần nhất là [ngaydonggannhat]. Hiện tại học viên còn nợ học phí là [sotiencanno] VNĐ. Rất mong Phụ huynh/Học viên hoàn tất học phí sớm.';
      const msgText = rawTpl
        .replace(/\[mahv\]/g, debtItem.mahv || '')
        .replace(/\[tenhv\]/g, debtItem.tenhv || hvInfo?.tenhv || '')
        .replace(/\[lop\]/g, debtItem.tenlop || '')
        .replace(/\[ngaydonggannhat\]/g, ngaydonggannhat)
        .replace(/\[sotiencanno\]/g, pCur(debtItem.conno).toLocaleString('vi-VN'));

      // 3. Tìm Zalo user ID từ SĐT, nếu không được thì tìm alias theo mã học viên
      const zaloRecipient = await findZaloRecipient({
        phone,
        sdtphuhuynh,
        mahv: debtItem.mahv,
        zaloBackendUrl: ZALO_BACKEND_URL
      });
      if (!zaloRecipient.found || !zaloRecipient.targetId) {
        alert(zaloRecipient.error || `Không tìm thấy tài khoản Zalo cho học viên ${debtItem.tenhv} (${debtItem.mahv})!`);
        return;
      }

      const targetId = zaloRecipient.targetId;

      // 4. Gửi tin nhắn
      const sendRes = await axios.post(`${ZALO_BACKEND_URL}/api/zalo/send-message`, {
        threadId: targetId,
        message: msgText,
        threadType: 'user'
      }, { timeout: 30000 });

      if (sendRes.data?.success || sendRes.status === 200) {
        alert(`Đã gửi tin nhắn nhắc nợ Zalo tới học viên ${debtItem.tenhv} thành công!`);
        insertLog(`[QUẢN LÝ NỢ] Đã gửi tin nhắn nhắc nợ Zalo cho học viên ${debtItem.tenhv} (${debtItem.mahv})`);
      } else {
        alert('Gửi tin nhắn Zalo không thành công.');
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi gửi tin nhắn Zalo nhắc nợ: ' + (err.response?.data?.error || err.message));
    } finally {
      setSendingZaloMahv(null);
    }
  };

  // ── Gửi tin nhắn Zalo Nhắc đóng trễ (zalodongtre) ──────────
  const handleSendZaloRemindDongTre = async (overdueItem) => {
    if (!overdueItem || !overdueItem.mahv) return;
    setSendingZaloMahv(overdueItem.mahv);
    try {
      // 1. Lấy sdt học viên
      const { data: hvInfo } = await supabase.from('tbl_hv').select('tenhv, sdt, sdtphuhuynh').eq('mahv', overdueItem.mahv).single();
      let phone = (hvInfo?.sdt || overdueItem.sdt || '').trim();
      let sdtphuhuynh = (hvInfo?.sdtphuhuynh || overdueItem.sdtphuhuynh || '').trim();
      if (!phone && !sdtphuhuynh && !overdueItem.mahv) {
        alert(`Học viên ${overdueItem.tenhv} (${overdueItem.mahv}) chưa có Số điện thoại hoặc mã học viên!`);
        return;
      }

      const ngayketthucFormatted = overdueItem.ngayketthuc ? new Date(overdueItem.ngayketthuc).toLocaleDateString('vi-VN') : 'N/A';

      // 2. Lấy mẫu zalodongtre từ config
      const rawTpl = config?.zalodongtre || 'Kính gửi Phụ huynh/Học viên [tenhv] (Mã: [mahv]), Lớp [lop]. Khóa học/học phí của học viên đã kết thúc vào ngày [ngayketthuc]. Xin vui lòng liên hệ trung tâm để đóng học phí gia hạn.';
      const msgText = rawTpl
        .replace(/\[mahv\]/g, overdueItem.mahv || '')
        .replace(/\[tenhv\]/g, overdueItem.tenhv || hvInfo?.tenhv || '')
        .replace(/\[lop\]/g, overdueItem.tenlop || '')
        .replace(/\[ngayketthuc\]/g, ngayketthucFormatted);

      // 3. Tìm Zalo user ID từ SĐT, nếu không được thì tìm alias theo mã học viên
      const zaloRecipient = await findZaloRecipient({
        phone,
        sdtphuhuynh,
        mahv: overdueItem.mahv,
        zaloBackendUrl: ZALO_BACKEND_URL
      });
      if (!zaloRecipient.found || !zaloRecipient.targetId) {
        alert(zaloRecipient.error || `Không tìm thấy tài khoản Zalo cho học viên ${overdueItem.tenhv} (${overdueItem.mahv})!`);
        return;
      }

      const targetId = zaloRecipient.targetId;

      // 4. Gửi tin nhắn
      const sendRes = await axios.post(`${ZALO_BACKEND_URL}/api/zalo/send-message`, {
        threadId: targetId,
        message: msgText,
        threadType: 'user'
      }, { timeout: 30000 });

      if (sendRes.data?.success || sendRes.status === 200) {
        alert(`Đã gửi tin nhắn nhắc đóng trễ Zalo tới học viên ${overdueItem.tenhv} thành công!`);
        insertLog(`[QUẢN LÝ NỢ] Đã gửi tin nhắn nhắc đóng trễ Zalo cho học viên ${overdueItem.tenhv} (${overdueItem.mahv})`);
      } else {
        alert('Gửi tin nhắn Zalo không thành công.');
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi gửi tin nhắn Zalo nhắc đóng trễ: ' + (err.response?.data?.error || err.message));
    } finally {
      setSendingZaloMahv(null);
    }
  };

  // ── Gửi tin nhắn Zalo Nhắc nợ HÀNG LOẠT ────────────────────
  const [isBulkSendingDebt, setIsBulkSendingDebt] = useState(false);
  const [bulkDebtProgress, setBulkDebtProgress] = useState({ current: 0, total: 0 });

  const handleBulkSendZaloRemindNo = async () => {
    const chatzaloEnabled = config?.chatzalo === true || config?.chatzalo === 'true';
    if (!chatzaloEnabled) {
      alert('Tính năng Chat Zalo đang bị tắt trong Cấu hình hệ thống.');
      return;
    }

    // Chỉ lấy các học viên thực sự còn nợ (conno > 0)
    const targets = filteredDebtList.filter(d => pCur(d.conno) > 0);
    if (targets.length === 0) {
      alert('Không có học viên nào đang nợ học phí để gửi nhắc nợ!');
      return;
    }

    const confirmMsg = `Bạn có chắc chắn muốn gửi Zalo nhắc nợ hàng loạt cho ${targets.length} học viên trong danh sách hiện tại không?`;
    if (!window.confirm(confirmMsg)) return;

    setIsBulkSendingDebt(true);
    setBulkDebtProgress({ current: 0, total: targets.length });

    let successCount = 0;
    let failCount = 0;
    let noPhoneCount = 0;

    const rawTpl = config?.zalonhacno || 'Kính gửi Phụ huynh/Học viên [tenhv] (Mã: [mahv]), Lớp [lop]. Ngày đóng gần nhất là [ngaydonggannhat]. Hiện tại học viên còn nợ học phí là [sotiencanno] VNĐ. Rất mong Phụ huynh/Học viên hoàn tất học phí sớm.';

    try {
      for (let i = 0; i < targets.length; i++) {
        const debtItem = targets[i];
        setBulkDebtProgress({ current: i + 1, total: targets.length });

        try {
          // Lấy thông tin học viên
          const { data: hvInfo } = await supabase.from('tbl_hv').select('tenhv, sdt, sdtphuhuynh').eq('mahv', debtItem.mahv).single();
          let phone = (hvInfo?.sdt || debtItem.sdt || '').trim();
          let sdtphuhuynh = (hvInfo?.sdtphuhuynh || debtItem.sdtphuhuynh || '').trim();
          if (!phone && !sdtphuhuynh && !debtItem.mahv) {
            noPhoneCount++;
            continue;
          }

          const { data: hdList } = await supabase.from('tbl_hd')
            .select('ngaylap')
            .eq('mahv', debtItem.mahv)
            .order('ngaylap', { ascending: false })
            .limit(1);

          let ngaydonggannhat = 'Chưa có';
          if (hdList && hdList.length > 0 && hdList[0].ngaylap) {
            ngaydonggannhat = new Date(hdList[0].ngaylap).toLocaleDateString('vi-VN');
          }

          const msgText = rawTpl
            .replace(/\[mahv\]/g, debtItem.mahv || '')
            .replace(/\[tenhv\]/g, debtItem.tenhv || hvInfo?.tenhv || '')
            .replace(/\[lop\]/g, debtItem.tenlop || '')
            .replace(/\[ngaydonggannhat\]/g, ngaydonggannhat)
            .replace(/\[sotiencanno\]/g, pCur(debtItem.conno).toLocaleString('vi-VN'));

          const zaloRecipient = await findZaloRecipient({
            phone,
            sdtphuhuynh,
            mahv: debtItem.mahv,
            zaloBackendUrl: ZALO_BACKEND_URL
          });
          if (!zaloRecipient.found || !zaloRecipient.targetId) {
            failCount++;
            continue;
          }

          const targetId = zaloRecipient.targetId;

          const sendRes = await axios.post(`${ZALO_BACKEND_URL}/api/zalo/send-message`, {
            threadId: targetId,
            message: msgText,
            threadType: 'user'
          });

          if (sendRes.data?.success || sendRes.status === 200) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (itemErr) {
          console.error(`Lỗi gửi nhắc nợ cho ${debtItem.mahv}:`, itemErr);
          failCount++;
        }

        // Delay 1.2s giữa các lần gửi để tránh spam/rate limit
        if (i < targets.length - 1) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }

      insertLog(`[QUẢN LÝ NỢ] Đã gửi nhắc nợ Zalo hàng loạt: Thành công ${successCount}/${targets.length}, Thất bại ${failCount}, Không có SĐT ${noPhoneCount}`);
      alert(`Hoàn thành gửi Zalo nhắc nợ hàng loạt!\n- Thành công: ${successCount}\n- Thất bại / không tìm thấy Zalo: ${failCount}\n- Không có SĐT: ${noPhoneCount}`);
    } finally {
      setIsBulkSendingDebt(false);
      setBulkDebtProgress({ current: 0, total: 0 });
    }
  };

  // ── Gửi tin nhắn Zalo Nhắc đóng trễ HÀNG LOẠT ──────────────
  const [isBulkSendingOverdue, setIsBulkSendingOverdue] = useState(false);
  const [bulkOverdueProgress, setBulkOverdueProgress] = useState({ current: 0, total: 0 });

  const handleBulkSendZaloRemindDongTre = async () => {
    const chatzaloEnabled = config?.chatzalo === true || config?.chatzalo === 'true';
    if (!chatzaloEnabled) {
      alert('Tính năng Chat Zalo đang bị tắt trong Cấu hình hệ thống.');
      return;
    }

    const targets = [...filteredOverdueList];
    if (targets.length === 0) {
      alert('Không có học viên nào quá hạn / sắp đến hạn để gửi nhắc đóng trễ!');
      return;
    }

    const confirmMsg = `Bạn có chắc chắn muốn gửi Zalo nhắc đóng trễ hàng loạt cho ${targets.length} học viên trong danh sách hiện tại không?`;
    if (!window.confirm(confirmMsg)) return;

    setIsBulkSendingOverdue(true);
    setBulkOverdueProgress({ current: 0, total: targets.length });

    let successCount = 0;
    let failCount = 0;
    let noPhoneCount = 0;

    const rawTpl = config?.zalodongtre || 'Kính gửi Phụ huynh/Học viên [tenhv] (Mã: [mahv]), Lớp [lop]. Khóa học/học phí của học viên đã kết thúc vào ngày [ngayketthuc]. Xin vui lòng liên hệ trung tâm để đóng học phí gia hạn.';

    try {
      for (let i = 0; i < targets.length; i++) {
        const overdueItem = targets[i];
        setBulkOverdueProgress({ current: i + 1, total: targets.length });

        try {
          const { data: hvInfo } = await supabase.from('tbl_hv').select('tenhv, sdt, sdtphuhuynh').eq('mahv', overdueItem.mahv).single();
          let phone = (hvInfo?.sdt || overdueItem.sdt || '').trim();
          let sdtphuhuynh = (hvInfo?.sdtphuhuynh || overdueItem.sdtphuhuynh || '').trim();
          if (!phone && !sdtphuhuynh && !overdueItem.mahv) {
            noPhoneCount++;
            continue;
          }

          const ngayketthucFormatted = overdueItem.ngayketthuc ? new Date(overdueItem.ngayketthuc).toLocaleDateString('vi-VN') : 'N/A';
          const msgText = rawTpl
            .replace(/\[mahv\]/g, overdueItem.mahv || '')
            .replace(/\[tenhv\]/g, overdueItem.tenhv || hvInfo?.tenhv || '')
            .replace(/\[lop\]/g, overdueItem.tenlop || '')
            .replace(/\[ngayketthuc\]/g, ngayketthucFormatted);

          const zaloRecipient = await findZaloRecipient({
            phone,
            sdtphuhuynh,
            mahv: overdueItem.mahv,
            zaloBackendUrl: ZALO_BACKEND_URL
          });
          if (!zaloRecipient.found || !zaloRecipient.targetId) {
            failCount++;
            continue;
          }

          const targetId = zaloRecipient.targetId;

          const sendRes = await axios.post(`${ZALO_BACKEND_URL}/api/zalo/send-message`, {
            threadId: targetId,
            message: msgText,
            threadType: 'user'
          });

          if (sendRes.data?.success || sendRes.status === 200) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (itemErr) {
          console.error(`Lỗi gửi nhắc đóng trễ cho ${overdueItem.mahv}:`, itemErr);
          failCount++;
        }

        if (i < targets.length - 1) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }

      insertLog(`[QUẢN LÝ NỢ] Đã gửi nhắc trễ Zalo hàng loạt: Thành công ${successCount}/${targets.length}, Thất bại ${failCount}, Không có SĐT ${noPhoneCount}`);
      alert(`Hoàn thành gửi Zalo nhắc đóng trễ hàng loạt!\n- Thành công: ${successCount}\n- Thất bại / không tìm thấy Zalo: ${failCount}\n- Không có SĐT: ${noPhoneCount}`);
    } finally {
      setIsBulkSendingOverdue(false);
      setBulkOverdueProgress({ current: 0, total: 0 });
    }
  };
  // ── xuất ảnh phiếu thu HP ──────────────────────────
  useEffect(() => {
    if (!printHoaDon) return;
    const run = async () => {
      await new Promise(r => setTimeout(r, 1000));
      const node = document.getElementById('dm-invoice-node');
      if (!node) return;
      node.style.position = 'fixed';
      node.style.top = '0'; node.style.left = '0';
      node.style.opacity = '1'; node.style.zIndex = '9999';
      const imgs = node.querySelectorAll('img');
      await Promise.all(Array.from(imgs).map(img =>
        img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 5000); })
      ));
      await new Promise(r => setTimeout(r, 400));
      try {
        const dataUrl = await toPng(node, { cacheBust: true, backgroundColor: '#ffffff' });
        node.style.position = 'static'; node.style.opacity = '0.01';
        if (window.innerWidth <= 991) {
          setPreviewImg(dataUrl);
        } else {
          const link = document.createElement('a');
          link.download = `PhieuThu_${printHoaDon.mahd}.png`;
          link.href = dataUrl; link.click();
        }
      } catch (e) { console.error(e); }
      finally { setPrintHoaDon(null); }
    };
    run();
  }, [printHoaDon]);

  // ── xuất ảnh bill hàng hóa ────────────────────────────
  useEffect(() => {
    if (!printBill) return;
    const run = async () => {
      await new Promise(r => setTimeout(r, 1000));
      const node = document.getElementById('dm-bill-node');
      if (!node) return;
      node.style.position = 'fixed';
      node.style.top = '0'; node.style.left = '0';
      node.style.opacity = '1'; node.style.zIndex = '9999';
      const imgs = node.querySelectorAll('img');
      await Promise.all(Array.from(imgs).map(img =>
        img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 5000); })
      ));
      await new Promise(r => setTimeout(r, 400));
      try {
        const dataUrl = await toPng(node, { cacheBust: true, backgroundColor: '#ffffff' });
        node.style.position = 'static'; node.style.opacity = '0.01';
        if (window.innerWidth <= 991) {
          setPreviewImg(dataUrl);
        } else {
          const link = document.createElement('a');
          link.download = `BillHang_${printBill.mabill}.png`;
          link.href = dataUrl; link.click();
        }
      } catch (e) { console.error(e); }
      finally { setPrintBill(null); }
    };
    run();
  }, [printBill]);

  const handleConfirmPayment = async () => {
    const payVal = parseInt(String(paymentAmount).replace(/,/g, ''), 10);
    if (isNaN(payVal) || payVal <= 0) {
      setPaymentError('Vui lòng nhập số tiền hợp lệ lớn hơn 0');
      return;
    }

    setIsProcessing(true);
    setPaymentError('');

    try {
      const oldCurVal = pCur(selectedDebt.conno);
      const isTraDu = oldCurVal < 0;
      const absOldVal = Math.abs(oldCurVal);
      const newConno = isTraDu ? (oldCurVal + payVal) : (oldCurVal - payVal);

      const tableName = selectedDebt.loai === 'Phiếu Thu' ? 'tbl_hd' : 'tbl_billhanghoa';
      const idField = selectedDebt.loai === 'Phiếu Thu' ? 'mahd' : 'mabill';

      const { error: updateErr } = await supabaseNoLog.from(tableName)
        .update({ conno: String(newConno) })
        .eq(idField, selectedDebt.mahd);
      if (updateErr) throw updateErr;

      // Tạo phiếu thu / chi mới ghi nhận khoản trả/hoàn
      const { data: recentHD } = await supabase.from('tbl_hd').select('mahd').order('mahd', { ascending: false }).limit(1);
      let nextNum = 1;
      if (recentHD && recentHD.length > 0 && recentHD[0].mahd) {
        const numPart = recentHD[0].mahd.replace(/\D/g, '');
        if (!isNaN(parseInt(numPart, 10))) nextNum = parseInt(numPart, 10) + 1;
      }
      const newMaHD = `HD${String(nextNum).padStart(5, '0')}`;
      const localNow = new Date(new Date() - new Date().getTimezoneOffset() * 60000).toISOString();

      let malop = '';
      const stClass = classes.find(c => c.tenlop === selectedDebt.tenlop);
      if (stClass) malop = stClass.malop;

      let oldNgayBatDau = selectedDebt.ngaybatdau || null;
      let oldNgayKetThuc = selectedDebt.ngayketthuc || null;
      let oldSoBuoiHoc = selectedDebt.sobuoihoc || '';
      if (selectedDebt.loai === 'Phiếu Thu') {
        const { data: oldInfo } = await supabase.from('tbl_hd')
          .select('ngaybatdau, ngayketthuc, sobuoihoc')
          .eq('mahd', selectedDebt.mahd).single();
        if (oldInfo) {
          oldNgayBatDau = oldInfo.ngaybatdau || oldNgayBatDau;
          oldNgayKetThuc = oldInfo.ngayketthuc || oldNgayKetThuc;
          oldSoBuoiHoc = oldInfo.sobuoihoc || oldSoBuoiHoc;
        }
      }

      const insertData = {
        mahd: newMaHD,
        ngaylap: localNow,
        mahv: selectedDebt.mahv,
        tenlop: selectedDebt.tenlop || '',
        ngaybatdau: oldNgayBatDau,
        ngayketthuc: oldNgayKetThuc,
        nhanvien: cashier,
        hocphi: fCur(isTraDu ? -payVal : absOldVal),
        giamhocphi: '0',
        phuphi: '0',
        dsphuphi: '',
        tongcong: fCur(isTraDu ? -payVal : absOldVal),
        dadong: fCur(isTraDu ? -payVal : payVal),
        conno: fCur(newConno),
        hinhthuc: paymentMethod,
        ghichu: paymentNote,
        daxoa: null,
        sobuoihoc: oldSoBuoiHoc,
        malop: malop
      };

      const { error: insertErr } = await supabaseNoLog.from('tbl_hd').insert([insertData]);
      if (insertErr) throw insertErr;

      const successMsg = isTraDu ? 'Hoàn tiền trả dư thành công! Đang tải phiếu...' : 'Trả nợ thành công! Đang tải phiếu...';
      setPaymentSuccess(successMsg);
      // manual log
      insertLog(isTraDu ? `[HOÀN TIỀN] Đã hoàn tiền trả dư cho học viên ${selectedDebt.tenhv} - ${selectedDebt.mahv} | Số tiền: ${fCur(payVal)} đ | Nội dung: ${paymentNote}` : `[THU NỢ] Đã thu nợ học viên ${selectedDebt.tenhv} - ${selectedDebt.mahv} | Số tiền: ${fCur(payVal)} đ | Nội dung: ${paymentNote}`);
      setDebtList(prev => prev.filter(d => d.mahd !== selectedDebt.mahd || newConno !== 0));

      // ── Kích hoạt xuất ảnh đúng loại ─────────────────
      if (selectedDebt.loai === 'Phiếu Thu') {
        // Lấy thêm thông tin HV
        const { data: hvInfo } = await supabase.from('tbl_hv').select('tenhv, sdt').eq('mahv', selectedDebt.mahv).single();
        setPrintHoaDon({
          mahd: newMaHD,
          ngaylap: localNow,
          tenhv: hvInfo?.tenhv || selectedDebt.tenhv,
          sdt: hvInfo?.sdt || '',
          mahv: selectedDebt.mahv,
          tenlop: selectedDebt.tenlop,
          ngaybatdau: oldNgayBatDau,
          ngayketthuc: oldNgayKetThuc,
          sobuoihoc: oldSoBuoiHoc,
          hocphi: fCur(isTraDu ? -payVal : absOldVal),
          giamhocphi: '0',
          nocu: '0',
          tongcong: fCur(isTraDu ? -payVal : absOldVal),
          dadong: fCur(isTraDu ? -payVal : payVal),
          conno: fCur(newConno),
          hinhthuc: paymentMethod,
          ghichu: paymentNote,
          nhanvien: cashier
        });
      } else {
        // Bill Hàng: lấy thông tin bill gốc để hiện danh sách hàng
        const { data: billInfo } = await supabase.from('tbl_billhanghoa')
          .select('hanghoa, noidung, tongcong')
          .eq('mabill', selectedDebt.mahd).single();
        const { data: hvInfo } = await supabase.from('tbl_hv').select('tenhv, sdt').eq('mahv', selectedDebt.mahv).single();
        setPrintBill({
          mabill: selectedDebt.mahd,
          ngaylap: localNow,
          tenhv: hvInfo?.tenhv || selectedDebt.tenhv,
          sdt: hvInfo?.sdt || '',
          cart: parseCSVItems(billInfo?.hanghoa || ''),
          nocu: isTraDu ? oldCurVal : absOldVal,
          tongcong_bill: pCur(billInfo?.tongcong || 0),
          dadong: isTraDu ? -payVal : payVal,
          conno: newConno,
          hinhthuc: paymentMethod,
          noidung: paymentNote,
          nhanvien: cashier
        });
      }

      setTimeout(() => { setShowPaymentModal(false); }, 1500);

    } catch (err) {
      console.error(err);
      setPaymentError('Lỗi cập nhật CSDL: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: classData } = await supabase.from('tbl_lop').select('malop, tenlop, daxoa');
        const cMap = classData || [];
        setClasses(cMap);

        const { data: stdRaw } = await supabase.from('tbl_hv').select('mahv, tenhv, trangthai, sdt');
        const { data: lhData } = await supabase
          .from('tbl_lichhoc_hv')
          .select('mahv, malop, trangthai')
          .or('trangthai.neq.finished,trangthai.is.null');
        const allStudents = (stdRaw || []).map(s => {
          const activeLh = (lhData || []).filter(l => 
            l.mahv === s.mahv && 
            String(l.trangthai || '').trim().toLowerCase() !== 'finished'
          );
          return {
            ...s,
            malop_list: [...new Set(activeLh.map(l => l.malop).filter(Boolean))]
          };
        });
        const students = allStudents.filter(s => !['Bảo Lưu', 'Đã Nghỉ'].includes((s.trangthai || '').trim()));

        const { data: hdData } = await supabase.from('tbl_hd')
          .select('mahd, malop, mahv, conno, tenlop, daxoa, ngaylap, ngaybatdau, ngayketthuc, sobuoihoc');

        let billData = [];
        const { data: bData, error } = await supabase.from('tbl_billhanghoa')
          .select('mabill, mahv, conno, daxoa, ngaylap');
        if (!error && bData) billData = bData;

        const isDeleted = (item) => {
          const status = String(item.daxoa || '').toLowerCase().trim();
          return status.includes('xóa') || status.includes('hủy') || item.daxoa === true || item.daxoa === 'true';
        };

        const validHd = (hdData || []).filter(h => !isDeleted(h));
        const validBill = (billData || []).filter(b => !isDeleted(b));

        const mergedTemp = [];

        // Nhóm Hóa Đơn theo mahv + lớp
        const hdByStdClass = {};
        validHd.forEach(hd => {
          if (!hd.mahv) return;
          const key = `${hd.mahv}_${hd.malop || hd.tenlop || 'nolop'}`;
          if (!hdByStdClass[key]) hdByStdClass[key] = [];
          hdByStdClass[key].push(hd);
        });

        Object.values(hdByStdClass).forEach(stHds => {
          stHds.sort((a, b) => {
            const dA = a.ngaylap ? new Date(a.ngaylap).getTime() : 0;
            const dB = b.ngaylap ? new Date(b.ngaylap).getTime() : 0;
            if (dA !== dB) return dB - dA;
            return (b.mahd || '').localeCompare(a.mahd || '');
          });
          const latestHd = stHds[0];
          if (pCur(latestHd.conno) !== 0) {
            const std = allStudents.find(s => s.mahv === latestHd.mahv) || {};
            const isNghi = (std.trangthai || '').trim().toLowerCase() === 'đã nghỉ';
            mergedTemp.push({
              mahv: latestHd.mahv, tenhv: std.tenhv || 'Không rõ', sdt: std.sdt || '', isNghi: isNghi, conno: latestHd.conno,
              tenlop: latestHd.tenlop || '', loai: 'Phiếu Thu', mahd: latestHd.mahd,
              malop: latestHd.malop || '',
              ngaybatdau: latestHd.ngaybatdau || null,
              ngayketthuc: latestHd.ngayketthuc || null,
              sobuoihoc: latestHd.sobuoihoc || ''
            });
          }
        });

        // Nhóm Bill POS theo mahv
        const billByStd = {};
        validBill.forEach(bill => {
          if (!bill.mahv) return;
          if (!billByStd[bill.mahv]) billByStd[bill.mahv] = [];
          billByStd[bill.mahv].push(bill);
        });

        Object.values(billByStd).forEach(stBills => {
          stBills.sort((a, b) => {
            const dA = a.ngaylap ? new Date(a.ngaylap).getTime() : 0;
            const dB = b.ngaylap ? new Date(b.ngaylap).getTime() : 0;
            if (dA !== dB) return dB - dA;
            return (b.mabill || '').localeCompare(a.mabill || '');
          });
          const latestBill = stBills[0];
          if (pCur(latestBill.conno) !== 0) {
            const std = allStudents.find(s => s.mahv === latestBill.mahv) || {};
            const isNghi = (std.trangthai || '').trim().toLowerCase() === 'đã nghỉ';
            const firstMalop = std.malop_list && std.malop_list.length > 0 ? std.malop_list[0] : null;
            const stClass = cMap.find(c => c.malop === firstMalop);
            mergedTemp.push({
              mahv: latestBill.mahv, tenhv: std.tenhv || 'Không rõ', sdt: std.sdt || '', isNghi: isNghi, conno: latestBill.conno,
              tenlop: stClass ? stClass.tenlop : '', loai: 'Bill Hàng', mahd: latestBill.mabill,
              malop: firstMalop || ''
            });
          }
        });

        mergedTemp.sort((a, b) => b.mahd.localeCompare(a.mahd));
        setDebtList(mergedTemp);

        // Báo động quá hạn & Học viên mới chưa có HĐ
        const overdueTemp = [];
        const unpaidNewTemp = [];
        const activeStudents = students.filter(s => (s.trangthai || '').trim() === 'Đang Học');
        const today = new Date();
        const localNow = new Date(today - today.getTimezoneOffset() * 60000);
        const todayIso = localNow.toISOString().split('T')[0];

        activeStudents.forEach(std => {
          const stHds = validHd.filter(h => h.mahv === std.mahv);
          const hasAnyInvoice = stHds.length > 0;

          // Học viên mới: chỉ xét những học viên chưa từng có biên lai trong tbl_hd
          if (!hasAnyInvoice) {
            (std.malop_list || []).forEach(malop => {
              const targetClass = cMap.find(c => c.malop === malop);
              if (!targetClass || targetClass.daxoa === 'Kết thúc' || targetClass.daxoa === 'Đã Xóa') return;

              unpaidNewTemp.push({
                mahv: std.mahv, tenhv: std.tenhv || 'Không rõ', sdt: std.sdt || '',
                malop: malop, tenlop: targetClass.tenlop || ''
              });
            });
          }

          if (stHds.length === 0) return;
          stHds.sort((a, b) => {
            const dA = a.ngaylap ? new Date(a.ngaylap).getTime() : 0;
            const dB = b.ngaylap ? new Date(b.ngaylap).getTime() : 0;
            if (dA !== dB) return dB - dA;
            return (b.mahd || '').localeCompare(a.mahd || '');
          });
          const latestHd = stHds[0];
          const targetClass = cMap.find(c => (latestHd.malop && c.malop === latestHd.malop) || c.tenlop === latestHd.tenlop);
          if (targetClass?.daxoa === 'Kết thúc' || targetClass?.daxoa === 'Đã Xóa') return;
          const nqh = parseInt(config?.ngayquahan || 0, 10);
          const ngayKetThucObj = new Date(latestHd.ngayketthuc);
          const ngayBaoDongObj = new Date(ngayKetThucObj);
          ngayBaoDongObj.setDate(ngayBaoDongObj.getDate() + nqh);
          const alarmDateIso = ngayBaoDongObj.toISOString().split('T')[0];
          if (latestHd.ngayketthuc && alarmDateIso <= todayIso) {
            overdueTemp.push({
              mahv: std.mahv, tenhv: std.tenhv || 'Không rõ', sdt: std.sdt || '',
              ngayketthuc: latestHd.ngayketthuc, ngaylap: latestHd.ngaylap, tenlop: latestHd.tenlop,
              malop: targetClass?.malop || '',
              isOverdue: latestHd.ngayketthuc < todayIso
            });
          }
        });
        setOverdueList(overdueTemp);
        setUnpaidNewList(unpaidNewTemp);

      } catch (err) {
        console.error('Lỗi khi load dữ liệu Quản lý nợ:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [config?.ngayquahan]);

  const filteredDebtList = React.useMemo(() => {
    return debtList.filter(d => !classFilter || d.malop === classFilter);
  }, [debtList, classFilter]);

  const filteredOverdueList = React.useMemo(() => {
    return overdueList.filter(d => !classFilter || d.malop === classFilter);
  }, [overdueList, classFilter]);

  const filteredUnpaidNewList = React.useMemo(() => {
    return unpaidNewList.filter(d => !classFilter || d.malop === classFilter);
  }, [unpaidNewList, classFilter]);

  // ── XUẤT EXCEL ──────────────────────────────────────────
  const handleExportDebtExcel = () => {
    if (!filteredDebtList.length) {
      alert('Danh sách còn nợ hiện đang trống!');
      return;
    }
    const data = filteredDebtList.map((d, index) => ({
      'STT': index + 1,
      'Mã HV': d.mahv,
      'Tên học viên': d.tenhv,
      'Số điện thoại': d.sdt || '',
      'Lớp học': d.tenlop || '',
      'Phân loại': d.loai || '',
      'Mã chứng từ': d.mahd,
      'Số tiền nợ (VNĐ)': pCur(d.conno),
      'Trạng thái': d.isNghi ? 'Đã nghỉ' : 'Đang học'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DS_ConNo');
    const dateStr = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
    XLSX.writeFile(wb, `DS_HocVien_ConNo_${dateStr}.xlsx`);
  };

  const handleExportOverdueExcel = () => {
    if (!filteredOverdueList.length) {
      alert('Danh sách thông báo quá hạn / đến hạn hiện đang trống!');
      return;
    }
    const data = filteredOverdueList.map((d, index) => ({
      'STT': index + 1,
      'Mã HV': d.mahv,
      'Tên học viên': d.tenhv,
      'Số điện thoại': d.sdt || '',
      'Lớp học': d.tenlop || '',
      'Ngày lập HĐ': d.ngaylap ? new Date(d.ngaylap).toLocaleDateString('vi-VN') : '',
      'Hạn deadline': d.ngayketthuc ? new Date(d.ngayketthuc).toLocaleDateString('vi-VN') : '',
      'Trạng thái': d.isOverdue ? 'Quá hạn' : 'Sắp đến hạn'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DS_QuaHan');
    const dateStr = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
    XLSX.writeFile(wb, `DS_DongHocPhi_QuaHan_${dateStr}.xlsx`);
  };

  const handleExportUnpaidNewExcel = () => {
    if (!filteredUnpaidNewList.length) {
      alert('Danh sách học viên mới chưa đóng học phí hiện đang trống!');
      return;
    }
    const data = filteredUnpaidNewList.map((d, index) => ({
      'STT': index + 1,
      'Mã HV': d.mahv,
      'Tên học viên': d.tenhv,
      'Số điện thoại': d.sdt || '',
      'Lớp học': d.tenlop || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'HVMoi_ChuaDongHP');
    const dateStr = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
    XLSX.writeFile(wb, `DS_HocVienMoi_ChuaDongHP_${dateStr}.xlsx`);
  };

  const handleExportAllExcel = () => {
    if (!filteredDebtList.length && !filteredOverdueList.length && !filteredUnpaidNewList.length) {
      alert('Không có dữ liệu để xuất Excel!');
      return;
    }
    const wb = XLSX.utils.book_new();

    if (filteredDebtList.length > 0) {
      const data1 = filteredDebtList.map((d, index) => ({
        'STT': index + 1,
        'Mã HV': d.mahv,
        'Tên học viên': d.tenhv,
        'Số điện thoại': d.sdt || '',
        'Lớp học': d.tenlop || '',
        'Phân loại': d.loai || '',
        'Mã chứng từ': d.mahd,
        'Số tiền nợ (VNĐ)': pCur(d.conno),
        'Trạng thái': d.isNghi ? 'Đã nghỉ' : 'Đang học'
      }));
      const ws1 = XLSX.utils.json_to_sheet(data1);
      XLSX.utils.book_append_sheet(wb, ws1, 'Học Viên Còn Nợ');
    }

    if (filteredOverdueList.length > 0) {
      const data2 = filteredOverdueList.map((d, index) => ({
        'STT': index + 1,
        'Mã HV': d.mahv,
        'Tên học viên': d.tenhv,
        'Số điện thoại': d.sdt || '',
        'Lớp học': d.tenlop || '',
        'Ngày lập HĐ': d.ngaylap ? new Date(d.ngaylap).toLocaleDateString('vi-VN') : '',
        'Hạn deadline': d.ngayketthuc ? new Date(d.ngayketthuc).toLocaleDateString('vi-VN') : '',
        'Trạng thái': d.isOverdue ? 'Quá hạn' : 'Sắp đến hạn'
      }));
      const ws2 = XLSX.utils.json_to_sheet(data2);
      XLSX.utils.book_append_sheet(wb, ws2, 'Đến Hạn - Quá Hạn');
    }

    if (filteredUnpaidNewList.length > 0) {
      const data3 = filteredUnpaidNewList.map((d, index) => ({
        'STT': index + 1,
        'Mã HV': d.mahv,
        'Tên học viên': d.tenhv,
        'Số điện thoại': d.sdt || '',
        'Lớp học': d.tenlop || ''
      }));
      const ws3 = XLSX.utils.json_to_sheet(data3);
      XLSX.utils.book_append_sheet(wb, ws3, 'HV Mới Chưa Đóng');
    }

    const dateStr = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
    XLSX.writeFile(wb, `BaoCao_QuanLyNo_${dateStr}.xlsx`);
  };

  if (loading) return <div className="loading-state">Đang rà soát doanh thu và nợ...</div>;

  return (
    <div className="debt-manager animate-fade-in">

      {/* ── STATS ── */}
      <div className="debt-stats-row">
        <div className="debt-stat-card warning">
          <div className="stat-icon-box warning"><FileText size={24} /></div>
          <div className="stat-info">
            <label>Tổng Chứng Từ Nợ</label>
            <div className="value">{filteredDebtList.length} <span>Phiếu</span></div>
          </div>
        </div>
        <div className="debt-stat-card danger">
          <div className="stat-icon-box danger"><DollarSign size={24} /></div>
          <div className="stat-info">
            <label>Tổng Tiền Nợ</label>
            <div className="value danger-text">
              {filteredDebtList.reduce((sum, d) => sum + (parseInt(String(d.conno).replace(/,/g, ''), 10) || 0), 0).toLocaleString()} <span>₫</span>
            </div>
          </div>
        </div>
        <div className="debt-stat-card overdue"
          onClick={() => setActiveTab && setActiveTab('invoices')}
          style={{ cursor: 'pointer' }}
          title="Click để xuất phiếu thu học phí">
          <div className="stat-icon-box overdue"><AlertTriangle size={24} /></div>
          <div className="stat-info">
            <label>Quá Hạn Đóng Phí</label>
            <div className="value">{filteredOverdueList.length} <span>Học viên</span></div>
          </div>
        </div>
        <div className="debt-stat-card primary"
          onClick={() => setActiveTab && setActiveTab('invoices')}
          style={{ cursor: 'pointer' }}
          title="Click để xuất phiếu thu học phí">
          <div className="stat-icon-box primary"><UserX size={24} /></div>
          <div className="stat-info">
            <label>Mới Chưa Đóng</label>
            <div className="value">{filteredUnpaidNewList.length} <span>Học viên</span></div>
          </div>
        </div>
      </div>

      {/* ── FILTER BAR ── */}
      <div className="debt-filter-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div className="filter-item">
          <label>Lọc theo lớp:</label>
          <select value={classFilter} onChange={e => setClassFilter(e.target.value)}>
            <option value="">-- Tất cả lớp --</option>
            {classes
              .filter(c => (c.daxoa || '').toLowerCase() !== 'đã xóa')
              .map(c => (
                <option key={c.malop} value={c.malop}>{c.tenlop} ({c.malop})</option>
              ))
            }
          </select>
        </div>

        <button
          onClick={handleExportAllExcel}
          style={{
            padding: '7px 14px',
            fontSize: '13px',
            borderRadius: '8px',
            background: '#10b981',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)'
          }}
          title="Tải toàn bộ dữ liệu quản lý nợ ra file Excel gồm 3 sheet"
        >
          <Download size={15} />
          <span>Tải Excel báo cáo</span>
        </button>
      </div>

      <div className="debt-layout">

        {/* ── TABLE 1: Còn nợ ── */}
        <div className="debt-card">
          <div className="debt-header">
            <div className="debt-title">
              <BadgeDollarSign size={20} className="text-warning" />
              <h3>Danh sách học viên còn nợ</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)'
                }}
                onClick={handleExportDebtExcel}
                title="Tải danh sách học viên còn nợ ra file Excel"
              >
                <Download size={14} />
                <span>Tải Excel</span>
              </button>
              {(config?.chatzalo === true || config?.chatzalo === 'true') && (
                <button
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    background: '#0068ff',
                    color: '#fff',
                    border: 'none',
                    cursor: isBulkSendingDebt ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(0, 104, 255, 0.2)'
                  }}
                  disabled={isBulkSendingDebt}
                  onClick={handleBulkSendZaloRemindNo}
                  title="Gửi tin nhắn Zalo nhắc nợ cho tất cả học viên còn nợ trong danh sách"
                >
                  {isBulkSendingDebt ? <Loader2 size={14} className="spinner" /> : <MessageSquare size={14} />}
                  <span>{isBulkSendingDebt ? `Đang nhắc (${bulkDebtProgress.current}/${bulkDebtProgress.total})...` : 'Nhắc nợ hàng loạt'}</span>
                </button>
              )}
              <span className="debt-badge warning">{filteredDebtList.length} Chứng từ</span>
            </div>
          </div>
          <div className="debt-body">
            <div className="table-scroll-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mã HV</th><th>Tên Học Viên</th><th>Phân Loại</th>
                    <th>Mã Phiếu</th><th>Tên Lớp</th>
                    <th className="text-right">Số Tiền Nợ</th>
                    <th className="text-center">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDebtList.length > 0 ? filteredDebtList.map((d, idx) => (
                    <tr key={`${d.mahd}-${idx}`}>
                      <td className="font-medium text-slate-500">{d.mahv}</td>
                      <td className="font-bold text-slate-800">
                        {d.tenhv}
                        {d.isNghi && <span style={{ color: '#ef4444', marginLeft: '6px', fontSize: '0.85em', fontWeight: 'bold' }}>(đã nghỉ)</span>}
                      </td>
                      <td><span className={`status-badge ${d.loai === 'Phiếu Thu' ? 'success' : 'primary'}`}>{d.loai}</span></td>
                      <td className="font-medium">{d.mahd}</td>
                      <td>{d.tenlop}</td>
                      <td className="text-right font-bold">
                        {pCur(d.conno) < 0 ? (
                          <span className="text-success font-bold">{Math.abs(pCur(d.conno)).toLocaleString()} ₫ (Trả dư)</span>
                        ) : (
                          <span className="text-danger font-bold">{pCur(d.conno).toLocaleString()} ₫</span>
                        )}
                      </td>
                      <td className="text-center">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <button style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', background: pCur(d.conno) < 0 ? '#10b981' : '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                            onClick={() => openPaymentModal(d)}>{pCur(d.conno) < 0 ? 'Hoàn tiền' : 'Trả nợ'}</button>
                          {(config?.chatzalo === true || config?.chatzalo === 'true') && pCur(d.conno) > 0 && (
                            <button
                              style={{
                                padding: '6px 10px',
                                fontSize: '12px',
                                borderRadius: '6px',
                                background: '#0068ff',
                                color: '#fff',
                                border: 'none',
                                cursor: sendingZaloMahv === d.mahv ? 'not-allowed' : 'pointer',
                                fontWeight: 500,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              disabled={sendingZaloMahv === d.mahv}
                              onClick={() => handleSendZaloRemindNo(d)}
                              title="Điền thông tin và gửi tin nhắn Zalo nhắc nợ"
                            >
                              {sendingZaloMahv === d.mahv ? <Loader2 size={13} className="spinner" /> : <MessageSquare size={13} />}
                              <span>Nhắc nợ</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="7" className="empty-state">Tuyệt vời! Tất cả học viên đã thanh toán đủ tiền kỳ này.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* CARD LIST mobile */}
            <div className="debt-card-list">
              {filteredDebtList.length > 0 ? filteredDebtList.map((d, idx) => (
                <div key={`${d.mahd}-${idx}`} className="debt-item-card">
                  <div className="card-header">
                    <div className="student-info">
                      <span className="student-name">
                        {d.tenhv}
                        {d.isNghi && <span style={{ color: '#ef4444', marginLeft: '6px', fontSize: '0.85em', fontWeight: 'bold' }}>(đã nghỉ)</span>}
                      </span>
                      <span className="student-id">#{d.mahv}</span>
                    </div>
                    <span className={`status-badge ${d.loai === 'Phiếu Thu' ? 'success' : 'primary'}`}>{d.loai}</span>
                  </div>
                  <div className="card-body">
                    <div className="info-line">
                      <span><strong>Mã phiếu:</strong> {d.mahd}</span>
                      <span><strong>Lớp:</strong> {d.tenlop}</span>
                    </div>
                    <div className="info-line amount-row">
                      <span className="debt-amount font-bold" style={{ color: pCur(d.conno) < 0 ? '#10b981' : '#ef4444' }}>
                        {pCur(d.conno) < 0 ? `${Math.abs(pCur(d.conno)).toLocaleString()} ₫ (Trả dư)` : `${pCur(d.conno).toLocaleString()} ₫`}
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn-pay" style={{ background: pCur(d.conno) < 0 ? '#10b981' : '#3b82f6' }} onClick={() => openPaymentModal(d)}>{pCur(d.conno) < 0 ? 'Hoàn tiền' : 'Trả nợ'}</button>
                        {(config?.chatzalo === true || config?.chatzalo === 'true') && pCur(d.conno) > 0 && (
                          <button
                            className="btn-pay"
                            style={{ background: '#0068ff', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            disabled={sendingZaloMahv === d.mahv}
                            onClick={() => handleSendZaloRemindNo(d)}
                            title="Điền thông tin và gửi tin nhắn Zalo nhắc nợ"
                          >
                            {sendingZaloMahv === d.mahv ? <Loader2 size={13} className="spinner" /> : <MessageSquare size={13} />}
                            <span>Nhắc nợ</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )) : <div className="empty-state">Không có học viên nào còn nợ tiền.</div>}
            </div>
          </div>
        </div>

        {/* ── TABLE 2: Quá hạn ── */}
        <div className="debt-card">
          <div className="debt-header">
            <div className="debt-title">
              <Clock size={20} className="text-danger" />
              <h3>Thông báo đóng học phí (Quá hạn hoặc sắp đến hạn)</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)'
                }}
                onClick={handleExportOverdueExcel}
                title="Tải danh sách học viên quá hạn / đến hạn ra file Excel"
              >
                <Download size={14} />
                <span>Tải Excel</span>
              </button>
              {(config?.chatzalo === true || config?.chatzalo === 'true') && (
                <button
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    background: '#0068ff',
                    color: '#fff',
                    border: 'none',
                    cursor: isBulkSendingOverdue ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(0, 104, 255, 0.2)'
                  }}
                  disabled={isBulkSendingOverdue}
                  onClick={handleBulkSendZaloRemindDongTre}
                  title="Gửi tin nhắn Zalo nhắc đóng trễ cho tất cả học viên quá hạn trong danh sách"
                >
                  {isBulkSendingOverdue ? <Loader2 size={14} className="spinner" /> : <MessageSquare size={14} />}
                  <span>{isBulkSendingOverdue ? `Đang nhắc (${bulkOverdueProgress.current}/${bulkOverdueProgress.total})...` : 'Nhắc trễ hàng loạt'}</span>
                </button>
              )}
              <span className="debt-badge danger">{filteredOverdueList.length} Học viên</span>
            </div>
          </div>
          <div className="debt-body">
            <div className="table-scroll-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mã HV</th><th>Tên Học Viên</th><th>Tên Lớp</th>
                    <th>Ngày Lập HĐ</th><th>Hạn Deadline</th><th className="text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOverdueList.length > 0 ? filteredOverdueList.map((d, idx) => (
                    <tr key={idx}>
                      <td className="font-medium text-slate-500">{d.mahv}</td>
                      <td className="font-bold text-slate-800">{d.tenhv}</td>
                      <td>{d.tenlop}</td>
                      <td className="text-muted">{new Date(d.ngaylap).toLocaleDateString('vi-VN')}</td>
                      <td className={`font-bold ${d.isOverdue ? 'text-danger' : 'text-primary'} text-lg`}>{new Date(d.ngayketthuc).toLocaleDateString('vi-VN')}</td>
                      <td className="text-center">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <span
                            className={`status-badge ${d.isOverdue ? 'danger' : 'warning'}`}
                            onClick={() => onSelectStudentForInvoice ? onSelectStudentForInvoice(d.mahv, d.malop) : (setActiveTab && setActiveTab('invoices'))}
                            style={{ cursor: 'pointer' }}
                            title="Click để xuất phiếu thu học phí"
                          >
                            {d.isOverdue ? 'Quá hạn' : 'Sắp đến hạn'}
                          </span>
                          {(config?.chatzalo === true || config?.chatzalo === 'true') && (
                            <button
                              style={{
                                padding: '5px 9px',
                                fontSize: '11px',
                                borderRadius: '6px',
                                background: '#0068ff',
                                color: '#fff',
                                border: 'none',
                                cursor: sendingZaloMahv === d.mahv ? 'not-allowed' : 'pointer',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              disabled={sendingZaloMahv === d.mahv}
                              onClick={() => handleSendZaloRemindDongTre(d)}
                              title="Điền thông tin và gửi tin nhắn Zalo nhắc đóng trễ"
                            >
                              {sendingZaloMahv === d.mahv ? <Loader2 size={12} className="spinner" /> : <MessageSquare size={12} />}
                              <span>Nhắc trễ</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="6" className="empty-state">Rất tốt! Không có học viên nào đang học vượt khung thời gian đóng phí.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="debt-card-list">
              {filteredOverdueList.length > 0 ? filteredOverdueList.map((d, idx) => (
                <div key={idx} className="debt-item-card overdue">
                  <div className="card-header">
                    <div className="student-info">
                      <span className="student-name">{d.tenhv}</span>
                      <span className="student-id">#{d.mahv}</span>
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="info-line"><span><strong>Lớp:</strong> {d.tenlop}</span></div>
                    <div className="info-line"><span><strong>Ngày lập HĐ:</strong> {new Date(d.ngaylap).toLocaleDateString('vi-VN')}</span></div>
                    <div className="info-line deadline-row">
                      <span className="deadline-label">Hạn kết thúc:</span>
                      <span className={`deadline-date ${d.isOverdue ? 'text-danger' : 'text-primary'}`}>{new Date(d.ngayketthuc).toLocaleDateString('vi-VN')}</span>
                    </div>
                    <div style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        className={`status-badge ${d.isOverdue ? 'danger' : 'warning'}`}
                        onClick={() => onSelectStudentForInvoice ? onSelectStudentForInvoice(d.mahv, d.malop) : (setActiveTab && setActiveTab('invoices'))}
                        style={{ cursor: 'pointer' }}
                        title="Click để xuất phiếu thu học phí"
                      >
                        {d.isOverdue ? 'Quá hạn' : 'Sắp đến hạn'}
                      </span>
                      {(config?.chatzalo === true || config?.chatzalo === 'true') && (
                        <button
                          className="btn-pay"
                          style={{ background: '#0068ff', fontSize: '11px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          disabled={sendingZaloMahv === d.mahv}
                          onClick={() => handleSendZaloRemindDongTre(d)}
                          title="Điền thông tin và gửi tin nhắn Zalo nhắc đóng trễ"
                        >
                          {sendingZaloMahv === d.mahv ? <Loader2 size={12} className="spinner" /> : <MessageSquare size={12} />}
                          <span>Nhắc trễ</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )) : <div className="empty-state">Không có học viên nào quá hạn đóng phí.</div>}
            </div>
          </div>
        </div>

        {/* ── TABLE 3: Học viên mới chưa đóng phí ── */}
        <div className="debt-card">
          <div className="debt-header">
            <div className="debt-title">
              <BadgeDollarSign size={20} className="text-primary" />
              <h3>Danh sách học viên mới chưa đóng học phí</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)'
                }}
                onClick={handleExportUnpaidNewExcel}
                title="Tải danh sách học viên mới chưa đóng học phí ra file Excel"
              >
                <Download size={14} />
                <span>Tải Excel</span>
              </button>
              <span className="debt-badge primary">{filteredUnpaidNewList.length} Học viên</span>
            </div>
          </div>
          <div className="debt-body">
            <div className="table-scroll-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mã HV</th><th>Tên Học Viên</th><th>Tên Lớp</th>
                    <th className="text-center">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUnpaidNewList.length > 0 ? filteredUnpaidNewList.map((d, idx) => (
                    <tr key={idx}>
                      <td className="font-medium text-slate-500">{d.mahv}</td>
                      <td className="font-bold text-slate-800">{d.tenhv}</td>
                      <td>{d.tenlop}</td>
                      <td className="text-center">
                        <button
                          style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                          onClick={() => onSelectStudentForInvoice ? onSelectStudentForInvoice(d.mahv, d.malop) : (setActiveTab && setActiveTab('invoices'))}
                          title="Click để chuyển sang Thu học phí"
                        >
                          Thu học phí
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="4" className="empty-state">Tất cả học viên mới đều đã có hóa đơn học phí.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="debt-card-list">
              {filteredUnpaidNewList.length > 0 ? filteredUnpaidNewList.map((d, idx) => (
                <div key={idx} className="debt-item-card primary">
                  <div className="card-header">
                    <div className="student-info">
                      <span className="student-name">{d.tenhv}</span>
                      <span className="student-id">#{d.mahv}</span>
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="info-line"><span><strong>Lớp:</strong> {d.tenlop}</span></div>
                    <div style={{ marginTop: '10px', textAlign: 'right' }}>
                        <button
                          style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                          onClick={() => onSelectStudentForInvoice ? onSelectStudentForInvoice(d.mahv, d.malop) : (setActiveTab && setActiveTab('invoices'))}
                        >
                          Thu học phí
                        </button>
                    </div>
                  </div>
                </div>
              )) : <div className="empty-state">Tất cả học viên mới đều đã có hóa đơn.</div>}
            </div>
          </div>
        </div>

      </div>

      {/* ── MODAL THANH TOÁN ── */}
      {showPaymentModal && selectedDebt && ReactDOM.createPortal(
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content animate-slide-up" style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '400px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.25rem', color: '#1e293b' }}>
              {selectedDebt && pCur(selectedDebt.conno) < 0 ? 'Xử Lý Hoàn Tiền Trả Dư' : 'Thanh Toán Nợ'}
            </h3>

            {[['Học viên', (
              <span key="name-field">
                {selectedDebt.tenhv}
                {selectedDebt.isNghi && <span style={{ color: '#ef4444', marginLeft: '6px', fontSize: '0.85em', fontWeight: 'bold' }}>(đã nghỉ)</span>}
              </span>
            )], ['Lớp', selectedDebt.tenlop], [selectedDebt && pCur(selectedDebt.conno) < 0 ? 'Mã HĐ trả dư' : 'Mã HĐ nợ', selectedDebt.mahd]].map(([lbl, val]) => (
              <div key={lbl} style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>{lbl}:</span>
                <span style={{ fontWeight: 'bold', color: lbl.includes('Mã') ? (pCur(selectedDebt.conno) < 0 ? '#10b981' : '#ef4444') : undefined }}>{val}</span>
              </div>
            ))}
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>{selectedDebt && pCur(selectedDebt.conno) < 0 ? 'Số tiền trả dư:' : 'Số tiền nợ:'}</span>
              <span style={{ fontWeight: 'bold', color: selectedDebt && pCur(selectedDebt.conno) < 0 ? '#10b981' : '#ef4444', fontSize: '1.1rem' }}>
                {selectedDebt ? Math.abs(pCur(selectedDebt.conno)).toLocaleString() : 0} ₫
              </span>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#334155', fontWeight: 500 }}>
                {selectedDebt && pCur(selectedDebt.conno) < 0 ? 'Số tiền hoàn trả (VNĐ)' : 'Số tiền trả nợ (VNĐ)'}
              </label>
              <input type="text" value={paymentAmount}
                onChange={e => {
                  const raw = e.target.value.replace(/,/g, '').replace(/\D/g, '');
                  if (!raw) { setPaymentAmount(''); return; }
                  setPaymentAmount(parseInt(raw, 10).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','));
                }}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none' }}
                placeholder="Nhập số tiền..." />
              <small style={{ color: '#64748b', display: 'block', marginTop: '4px' }}>
                {selectedDebt && pCur(selectedDebt.conno) < 0 ? 'Hệ thống sẽ cập nhật khấu trừ số dư của học viên' : 'Có thể nhập dư để trừ nợ cho phiếu sau tại phần nợ cũ'}
              </small>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#334155', fontWeight: 500 }}>Ghi chú</label>
              <input type="text" value={paymentNote} onChange={e => setPaymentNote(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none' }} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#334155', fontWeight: 500 }}>💳 Hình thức thanh toán</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none', background: '#fff' }}>
                {walletsConfig.length === 0 && <option value="Tiền mặt">Tiền mặt</option>}
                {walletsConfig.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
              </select>
            </div>

            {paymentError && <div style={{ color: '#ef4444', marginBottom: '16px', fontSize: '0.9rem' }}>{paymentError}</div>}
            {paymentSuccess && <div style={{ color: '#10b981', marginBottom: '16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle size={16} />{paymentSuccess}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setShowPaymentModal(false)}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer' }}
                disabled={isProcessing}>Hủy</button>
              <button onClick={handleConfirmPayment}
                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: selectedDebt && pCur(selectedDebt.conno) < 0 ? '#10b981' : '#3b82f6', color: '#fff', fontWeight: 500, cursor: 'pointer' }}
                disabled={isProcessing}>{isProcessing ? 'Đang xử lý...' : (selectedDebt && pCur(selectedDebt.conno) < 0 ? 'Xác nhận hoàn tiền' : 'Xác nhận trả nợ')}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── PREVIEW MOBILE ── */}
      {previewImg && (
        <div onClick={() => setPreviewImg(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '15px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '12px', padding: '20px', maxWidth: '100%', width: '450px', position: 'relative' }}>
            <button onClick={() => setPreviewImg(null)} style={{ position: 'absolute', right: 10, top: 10, border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={20} /></button>
            <p style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: '10px', color: '#0369a1' }}>NHẤN GIỮ HÌNH ĐỂ LƯU / CHIA SẺ</p>
            <img src={previewImg} alt="Preview" style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: '8px' }} />
            <div style={{ marginTop: '15px', textAlign: 'center' }}>
              <button onClick={() => setPreviewImg(null)} style={{ padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>HOÀN TẤT</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          HIDDEN TEMPLATES FOR PNG EXPORT
      ══════════════════════════════════════════════════ */}
      {/* HIDDEN TEMPLATE FOR INVOICE PNG EXPORT */}
      <div style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', overflow: 'hidden', opacity: 0.01, zIndex: -100, pointerEvents: 'none', background: '#ffffff' }}>
        <div id="dm-invoice-node" style={{ position: 'relative', overflow: 'hidden', padding: '30px', background: 'white', color: '#000', width: '800px', fontFamily: 'Arial, sans-serif' }}>
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
            <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0 }}>{config?.tencongty || 'Tên Công Ty'}</h3>
                <p style={{ margin: '4px 0' }}>ĐC: {config?.diachicongty}</p>
                <p style={{ margin: '4px 0' }}>SĐT: {config?.sdtcongty}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>Mã HĐ: <b>{printHoaDon?.mahd}</b></div>
                <div>Ngày lập: {printHoaDon ? new Date(printHoaDon.ngaylap).toLocaleDateString('vi-VN') : ''}</div>
                <img src={config?.logo || ""} alt="logo" crossOrigin="anonymous" style={{ width: 80, marginTop: 5 }} onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
            </div>
            <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "20pt", margin: "15px 0" }}>
              BIÊN LAI THU HỌC PHÍ
            </div>
            <div style={{ fontSize: "14pt", lineHeight: "1.8", margin: '20px 0' }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: '5px' }}>
                <div>Họ và tên: <b>{printHoaDon?.tenhv}</b></div>
                <div>SĐT: <b>{printHoaDon?.sdt || ""}</b></div>
              </div>
              <div>Khóa học: <b>{printHoaDon?.tenlop}</b></div>
              {printHoaDon?.sobuoihoc && (
                <div>Số buổi học: <b>{printHoaDon.sobuoihoc}</b></div>
              )}
              {(printHoaDon?.ngaybatdau || printHoaDon?.ngayketthuc) && (
                <div>
                  Ngày bắt đầu: <b>{printHoaDon?.ngaybatdau ? new Date(printHoaDon.ngaybatdau).toLocaleDateString('vi-VN') : '...'}</b> &nbsp;|&nbsp; Ngày kết thúc: <b>{printHoaDon?.ngayketthuc ? new Date(printHoaDon.ngayketthuc).toLocaleDateString('vi-VN') : '...'}</b>
                </div>
              )}
              <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '15px 0' }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>Học phí: <b>{printHoaDon?.hocphi} đ</b></div>
                <div>Giảm HP (Voucher): <b>{printHoaDon?.giamhocphi} đ</b></div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", marginTop: '5px' }}>
                <div>Tổng cộng: <b>{printHoaDon?.tongcong} đ</b></div>
                <div>Đã đóng: <b style={{ color: '#059669' }}>{printHoaDon?.dadong} đ</b></div>
                <div>{pCur(printHoaDon?.conno) < 0 ? 'Còn dư' : 'Còn lại'}: <b style={{ color: pCur(printHoaDon?.conno) < 0 ? '#10b981' : '#dc2626' }}>{fCur(Math.abs(pCur(printHoaDon?.conno)))} đ</b></div>
              </div>
              <div style={{ marginTop: '10px' }}>
                Ghi chú: {printHoaDon?.ghichu || ""}
              </div>
            </div>
            <div style={{ marginTop: 40, fontSize: "12pt", display: "flex", justifyContent: "space-between" }}>
              <div>
                {config?.tencongty || 'Tên Công Ty'} <br />
                SĐT/Zalo: {config?.sdtcongty}
              </div>
              <div style={{ textAlign: "center" }}>
                Nhân viên thu tiền <br /><br /><br />
                <b>{printHoaDon?.nhanvien}</b>
              </div>
            </div>
            <div style={{ marginTop: "30px", textAlign: "center", fontStyle: "italic", borderTop: '1px dashed #ccc', paddingTop: '10px', fontSize: '10pt' }}>
              Lưu ý: Phiếu thu này có giá trị xác nhận việc đóng phí. Vui lòng giữ lại để đối chiếu khi cần thiết.
            </div>
          </div>
        </div>

        {/* TEMPLATE 2: BIÊN LAI BÁN HÀNG — giống SalesPOS */}
        <div id="dm-bill-node" style={{
          position: 'relative', overflow: 'hidden', padding: '30px',
          background: 'white', color: '#000', width: '800px',
          fontFamily: 'Arial, sans-serif'
        }}>
          {printBill && (<>
            {/* watermark wavy */}
            <div style={{
              position: 'absolute', inset: 0, zIndex: 0, opacity: 0.2, pointerEvents: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 10 Q 25 20 50 10 T 100 10' fill='none' stroke='%230066cc' stroke-width='0.5'/%3E%3Cpath d='M0 5 Q 25 15 50 5 T 100 5' fill='none' stroke='%230066cc' stroke-width='0.3' opacity='0.5'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'repeat'
            }} />
            <div style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%) rotate(-30deg)',
              fontSize: '60pt', fontWeight: 'bold', color: 'rgba(0,102,204,0.05)', zIndex: 0, pointerEvents: 'none',
              whiteSpace: 'nowrap', textAlign: 'center', width: '150%'
            }}>
              {config?.tencongty || 'ĐÃ THANH TOÁN'}
            </div>

            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{config?.tencongty || 'Tên Công Ty'}</h3>
                  <p style={{ margin: '4px 0' }}>ĐC: {config?.diachicongty}</p>
                  <p style={{ margin: '4px 0' }}>SĐT: {config?.sdtcongty}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div>Mã Bill: <b>{printBill.mabill}</b></div>
                  <div>Ngày lập: {new Date(printBill.ngaylap).toLocaleDateString('vi-VN')}</div>
                  <img src={config?.logo || ''} alt="logo" crossOrigin="anonymous" style={{ width: 80, marginTop: 5 }} onError={(e) => { e.target.style.display = 'none'; }} />
                </div>
              </div>

              <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '18pt', margin: '10px 0' }}>
                BIÊN LAI THANH TOÁN NỢ HÀNG HÓA
              </div>

              <div style={{ fontSize: '13pt', lineHeight: '1.8', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>Họ và tên: <b>{printBill.tenhv || 'Khách vãng lai'}</b></div>
                  <div>SĐT: <b>{printBill.sdt || '_'}</b></div>
                </div>
              </div>

              {printBill.cart && printBill.cart.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid black', background: '#f8fafc' }}>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Tên Hàng</th>
                      <th style={{ padding: '10px', textAlign: 'center' }}>Số Lượng</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>Đơn giá</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printBill.cart.map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '10px' }}>{c.ten}</td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>{c.sl}</td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>{fCur(c.dg)}</td>
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>{fCur(c.dg * c.sl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div style={{ marginTop: '15px', padding: '12px 0', borderTop: '2.5px solid #333', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12pt' }}>
                  <div>Nợ hàng (gốc bill): <b>{fCur(printBill.nocu)}</b></div>
                  <div style={{ color: '#0ea5e9', fontWeight: 'bold' }}>Hình thức: {printBill.hinhthuc}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5pt', paddingTop: '8px', borderTop: '1px dashed #ddd', fontWeight: 'bold' }}>
                  <div style={{ color: '#16a34a' }}>Đã trả nợ: {fCur(printBill.dadong)}</div>
                  <div style={{ color: pCur(printBill.conno) > 0 ? '#ef4444' : '#16a34a' }}>{pCur(printBill.conno) < 0 ? 'Còn dư' : 'Còn lại'}: {fCur(Math.abs(pCur(printBill.conno)))}</div>
                </div>
                <div style={{ fontSize: '11pt', borderTop: '1px dashed #ccc', paddingTop: '8px' }}>
                  Bằng chữ: <i>{toVietnameseWords(printBill.dadong)}</i>
                </div>
                {printBill.noidung && <div style={{ fontSize: '11pt' }}>Ghi chú: {printBill.noidung}</div>}
              </div>

              <div style={{ marginTop: 40, fontSize: '12pt', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  {config?.tencongty || 'Tên Công ty'}<br />
                  SĐT/Zalo: {config?.sdtcongty || ''}
                </div>
                <div style={{ textAlign: 'center' }}>
                  Nhân viên thu tiền<br /><br /><br />
                  <b>{printBill.nhanvien}</b>
                </div>
              </div>

              <div style={{ marginTop: '30px', textAlign: 'center', fontStyle: 'italic', borderTop: '1px dashed #ccc', paddingTop: '10px', fontSize: '10pt' }}>
                Cảm ơn quý khách đã thanh toán nợ!
              </div>
            </div>
          </>)}
        </div>

      </div>

    </div>
  );
}
