import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useConfig } from '../ConfigContext';
import { supabase } from '../supabase';
import {
  Users, BookOpen, GraduationCap, CalendarCheck,
  UserCheck, UserX, TrendingUp, TrendingDown, Wallet, Calendar, CreditCard, Banknote
} from 'lucide-react';
import './Overview.css';

const parseCurrency = (val) => {
  if (!val) return 0;
  const str = val.toString().replace(/,/g, '').trim();
  return parseInt(str, 10) || 0;
};

const isNotDeleted = (item) => {
  if (!item) return false;
  const status = (item.trangthai || '').toLowerCase();
  const daxoa = (item.daxoa || '').toLowerCase();
  return status !== 'đã xóa' && daxoa !== 'đã xóa';
};

const formatLocalTimestamp = (date, isEnd) => {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  // Nếu là ngày hôm nay và là mốc kết thúc, lấy đúng giờ hiện tại
  const today = new Date();
  const isToday = y === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (isEnd && isToday) {
    const hh = String(today.getHours()).padStart(2, '0');
    const mm = String(today.getMinutes()).padStart(2, '0');
    const ss = String(today.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d}T${hh}:${mm}:${ss}+07:00`;
  }

  return `${y}-${m}-${d}T${isEnd ? '23:59:59' : '00:00:00'}+07:00`;
};

const getCalculatedDateRange = (val) => {
  if (val === 'Tùy chọn ngày') return null;
  const today = new Date();
  let startObj, endObj;

  if (val === 'Hôm nay') {
    startObj = today;
    endObj = today;
  } else if (val === 'Trong tuần này') {
    const day = today.getDay() || 7;
    startObj = new Date(today);
    startObj.setDate(today.getDate() - day + 1);
    endObj = today;
  } else if (val === 'Trong tháng này') {
    startObj = new Date(today.getFullYear(), today.getMonth(), 1);
    endObj = today;
  } else if (val === 'Trong tháng trước') {
    startObj = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    endObj = new Date(today.getFullYear(), today.getMonth(), 0);
  } else if (val === 'Trong 3 tháng trước') {
    startObj = new Date(today.getFullYear(), today.getMonth() - 2, 1); // 3 tháng bao gồm tháng này, tháng trước, tháng trước nữa
    endObj = today;
  }

  return {
    start: formatLocalTimestamp(startObj, false),
    end: formatLocalTimestamp(endObj, true),
    startObj,
    endObj
  };
};

// Mapping chính xác: mỗi bảng dùng cột ngày nào
const TABLE_DATE_COL = {
  tbl_phieuchi: 'ngaylap',
  tbl_hd: 'ngaylap',
  tbl_billhanghoa: 'ngaylap',
  tbl_nhapkho: 'ngaynhap',
  tbl_diemdanh: 'ngay',
  tbl_thongbao: 'ngaylap',
};

const safeFetch = async (table, start, end) => {
  const col = TABLE_DATE_COL[table] || 'ngaylap';
  const { data, error } = await supabase.from(table).select('*')
    .or(table === 'tbl_diemdanh' ? 'id.neq.-1' : 'daxoa.neq."Đã Xóa",daxoa.is.null') // Only for tables having daxoa
    .gte(col, start)
    .lte(col, end);
  if (error) {
    if (error.code === '42P01') return []; // bảng chưa tồn tại
    console.warn(`safeFetch(${table}): ${error.message}`);
    return [];
  }
  return data || [];
};

export default function Overview({ setActiveTab, setActiveSubTab }) {
  const { config } = useConfig();

  const walletsConfig = useMemo(() => (config ? [
    { id: 'vi1', name: config.vi1?.name || '' },
    { id: 'vi2', name: config.vi2?.name || '' },
    { id: 'vi3', name: config.vi3?.name || '' },
    { id: 'vi4', name: config.vi4?.name || '' }
  ].filter(w => w.name.trim() !== '') : []), [config]);

  const exactMatchWallet = useCallback((val) => {
    const s = (val || '').trim();
    const matched = walletsConfig.find(w => w.name === s || s.includes(w.name));
    return matched ? matched.id : null;
  }, [walletsConfig]);

  const initW = useCallback(() => {
    let out = {};
    walletsConfig.forEach(w => out[w.id] = 0);
    return out;
  }, [walletsConfig]);

  const [topMetrics, setTopMetrics] = useState({
    hv: 0, lop: 0, nv: 0, lopHomNay: 0, diHoc: 0, nghiHoc: 0
  });

  const [totalsDateFilter, setTotalsDateFilter] = useState('Trong tháng này');
  const [totalsDateRange, setTotalsDateRange] = useState({ start: '', end: '' });
  const [financeData, setFinanceData] = useState({ thu: 0, no: 0, chi: 0 });
  const [loadingTotals, setLoadingTotals] = useState(false);

  const [walletsDateFilter, setWalletsDateFilter] = useState('Trong tháng này');
  const [walletsDateRange, setWalletsDateRange] = useState({ start: '', end: '' });
  const [walletStats, setWalletStats] = useState({
    thu: initW(),
    chi: initW(),
  });
  const [loadingWallets, setLoadingWallets] = useState(false);

  const loadTopMetrics = useCallback(async () => {
    try {
      const { count: hvCount } = await supabase.from('tbl_hv').select('*', { count: 'exact', head: true }).neq('trangthai', 'Đã Nghỉ');
      const { count: nvCount } = await supabase.from('tbl_nv').select('*', { count: 'exact', head: true }).neq('trangthai', 'Đã Nghỉ');

      const { data: lopData, error: lopErr } = await supabase.from('tbl_lop').select('malop, daxoa, tenlop').order('tenlop');
      if (lopErr) throw lopErr;
 
      const validClasses = (lopData || []).filter(c => (c.daxoa || '').toLowerCase() !== 'đã xóa' && (c.daxoa || '').toLowerCase() !== 'kết thúc');

      const today = new Date();
      const tzOffset = today.getTimezoneOffset() * 60000;
      const localNow = new Date(today - tzOffset);
      const todayIso = localNow.toISOString().split('T')[0];

      const { data: att } = await supabase.from('tbl_diemdanh').select('trangthai').eq('ngay', todayIso);
      const presentCount = (att || []).filter(a => (a.trangthai || '').toLowerCase() === 'có mặt').length;
      const absentCount = (att || []).filter(a => {
        const s = (a.trangthai || '').toLowerCase();
        return s.includes('nghỉ') || s.includes('không phép') || s.includes('vắng');
      }).length;

      setTopMetrics({ hv: hvCount || 0, nv: nvCount || 0, lop: validClasses.length, diHoc: presentCount, nghiHoc: absentCount });
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadTotals = useCallback(async (startD, endD) => {
    setLoadingTotals(true);
    try {
      const bill = await safeFetch('tbl_billhanghoa', startD, endD);
      const phieuChi = await safeFetch('tbl_phieuchi', startD, endD);
      const hd = await safeFetch('tbl_hd', startD, endD);
      const nhapkho = await safeFetch('tbl_nhapkho', startD, endD);

      const validBill = bill.filter(isNotDeleted);
      const validPC = phieuChi.filter(isNotDeleted);
      const validHD = hd.filter(isNotDeleted);

      const tongDaThu = validPC.filter(p => (p.loaiphieu || '').trim() === 'Thu').reduce((a, b) => a + parseCurrency(b.chiphi), 0) +
        validHD.reduce((a, b) => a + parseCurrency(b.dadong), 0) +
        validBill.reduce((a, b) => a + parseCurrency(b.dadong), 0);

      const noHD = validHD.reduce((a, b) => a + parseCurrency(b.conno), 0);
      const noBill = validBill.reduce((a, b) => a + parseCurrency(b.conno), 0);
      const tongNo = noHD + noBill;

      const tongChi = validPC.filter(p => (p.loaiphieu || '').trim() === 'Chi').reduce((a, b) => a + parseCurrency(b.chiphi), 0) +
        nhapkho.filter(isNotDeleted).reduce((a, b) => a + parseCurrency(b.thanhtien), 0);

      setFinanceData({ thu: tongDaThu, no: tongNo, chi: tongChi });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTotals(false);
    }
  }, []);

  const loadWallets = useCallback(async (startD, endD) => {
    setLoadingWallets(true);
    try {
      const bill = await safeFetch('tbl_billhanghoa', startD, endD);
      const phieuChi = await safeFetch('tbl_phieuchi', startD, endD);
      const hd = await safeFetch('tbl_hd', startD, endD);
      const nhapkho = await safeFetch('tbl_nhapkho', startD, endD);

      const validBill = bill.filter(isNotDeleted);
      const validPC = phieuChi.filter(isNotDeleted);
      const validHD = hd.filter(isNotDeleted);

      let wThu = initW();
      let wChi = initW();

      validPC.forEach(p => {
        const ht = exactMatchWallet(p.hinhthuc);
        const loai = (p.loaiphieu || '').trim();
        const val = parseCurrency(p.chiphi);
        if (ht) {
          if (loai === 'Thu') wThu[ht] += val;
          else if (loai === 'Chi') wChi[ht] += val;
        }
      });
      validHD.forEach(b => {
        const ht = exactMatchWallet(b.hinhthuc);
        const val = parseCurrency(b.dadong);
        if (ht) wThu[ht] += val;
      });
      validBill.forEach(b => {
        const ht = exactMatchWallet(b.hinhthuc);
        const val = parseCurrency(b.dadong);
        if (ht) wThu[ht] += val;
      });
      nhapkho.filter(isNotDeleted).forEach(b => {
        const ht = exactMatchWallet(b.hinhthuc);
        const val = parseCurrency(b.thanhtien);
        if (ht) wChi[ht] += val;
      });

      setWalletStats({ thu: wThu, chi: wChi });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingWallets(false);
    }
  }, [initW, exactMatchWallet]);

  // Initialize
  useEffect(() => {
    const initRange = getCalculatedDateRange('Trong tháng này');
    if (initRange) {
      if (initRange) {
        setTotalsDateRange({ start: initRange.start, end: initRange.end });
        setWalletsDateRange({ start: initRange.start, end: initRange.end });
      }
    }
    loadTopMetrics();
  }, [loadTopMetrics]);

  // Update wallet storage when config loads
  useEffect(() => {
    if (config) {
      setWalletStats({
        thu: initW(),
        chi: initW()
      });
      if (walletsDateRange.start && walletsDateRange.end) {
        loadWallets(walletsDateRange.start, walletsDateRange.end);
      }
    }
  }, [config, initW, loadWallets, walletsDateRange.start, walletsDateRange.end]);

  useEffect(() => {
    if (walletsDateRange.start && walletsDateRange.end) {
      loadWallets(walletsDateRange.start, walletsDateRange.end);
    }
  }, [walletsDateRange, loadWallets]);

  // ----- TOTALS LOGIC -----
  const handleTotalsFilterChange = (e) => {
    const val = e.target.value;
    setTotalsDateFilter(val);
    const range = getCalculatedDateRange(val);
    if (range) setTotalsDateRange({ start: range.start, end: range.end });
  };

  const handleTotalsDateInput = (field, value) => {
    setTotalsDateFilter('Tùy chọn ngày');
    const newDate = value;
    setTotalsDateRange(prev => {
      const updated = { ...prev, [field]: field === 'start' ? `${newDate}T00:00:00+07:00` : `${newDate}T23:59:59+07:00` };
      return updated;
    });
  };

  useEffect(() => {
    if (totalsDateRange.start && totalsDateRange.end) {
      loadTotals(totalsDateRange.start, totalsDateRange.end);
    }
  }, [totalsDateRange, loadTotals]);


  // ----- WALLETS LOGIC -----
  const handleWalletsFilterChange = (e) => {
    const val = e.target.value;
    setWalletsDateFilter(val);
    const range = getCalculatedDateRange(val);
    if (range) setWalletsDateRange({ start: range.start, end: range.end });
  };

  const handleWalletsDateInput = (field, value) => {
    setWalletsDateFilter('Tùy chọn ngày');
    const newDate = value;
    setWalletsDateRange(prev => {
      const updated = { ...prev, [field]: field === 'start' ? `${newDate}T00:00:00+07:00` : `${newDate}T23:59:59+07:00` };
      return updated;
    });
  };

  return (
    <div className="overview-dashboard animate-fade-in">
      <div className="top-cards-grid">
        <div className="o-card blue" onClick={() => { setActiveTab('students'); setActiveSubTab('students'); }} style={{ cursor: 'pointer' }}>
          <div className="o-icon"><GraduationCap size={26} /></div>
          <div className="o-data">
            <span>Tổng Học Sinh</span>
            <h3>{topMetrics.hv}</h3>
          </div>
        </div>
        <div className="o-card green" onClick={() => { setActiveTab('students'); setActiveSubTab('classes'); }} style={{ cursor: 'pointer' }}>
          <div className="o-icon"><BookOpen size={26} /></div>
          <div className="o-data">
            <span>Tổng Lớp Học</span>
            <h3>{topMetrics.lop}</h3>
          </div>
        </div>
        <div className="o-card purple" onClick={() => setActiveTab('employees')} style={{ cursor: 'pointer' }}>
          <div className="o-icon"><Users size={26} /></div>
          <div className="o-data">
            <span>Tổng Nhân Viên</span>
            <h3>{topMetrics.nv}</h3>
          </div>
        </div>

        <div className="o-card success" onClick={() => { setActiveTab('students'); setActiveSubTab('attendance_today'); }} style={{ cursor: 'pointer' }}>
          <div className="o-icon"><UserCheck size={26} /></div>
          <div className="o-data">
            <span>Đi Học Hôm Nay</span>
            <h3>{topMetrics.diHoc}</h3>
          </div>
        </div>
        <div className="o-card danger" onClick={() => { setActiveTab('students'); setActiveSubTab('leave_list'); }} style={{ cursor: 'pointer' }}>
          <div className="o-icon"><UserX size={26} /></div>
          <div className="o-data">
            <span>Nghỉ Học Hôm Nay</span>
            <h3>{topMetrics.nghiHoc}</h3>
          </div>
        </div>
      </div>

      <div className="financial-divider"></div>

      {/* ================= 1. BÁO CÁO TỔNG THỂ ================= */}
      <div className="financial-header">
        <div className="sh-title-group">
          <h2 className="sh-massive-title margin-0 text-slate-800">Báo cáo tài chính tổng hợp</h2>
          <div className="filter-group">
            <Calendar size={18} className="text-muted" />
            <select value={totalsDateFilter} onChange={handleTotalsFilterChange}>
              <option value="Hôm nay">Hôm nay</option>
              <option value="Trong tuần này">Trong tuần này</option>
              <option value="Trong tháng này">Trong tháng này</option>
              <option value="Trong tháng trước">Trong tháng trước</option>
              <option value="Trong 3 tháng trước">Trong 3 tháng trước</option>
              <option value="Tùy chọn ngày">Tùy chọn khoảng ngày...</option>
            </select>
          </div>
        </div>
        <div className="finance-filters">
          <div className="custom-dates animate-fade-in">
            <input type="date" value={totalsDateRange.start} onChange={e => handleTotalsDateInput('start', e.target.value)} />
            <span className="date-sep">đến</span>
            <input type="date" value={totalsDateRange.end} onChange={e => handleTotalsDateInput('end', e.target.value)} />
          </div>
        </div>
      </div>

      {loadingTotals ? (
        <div className="loading-state card-loading">Đang tổng hợp dữ liệu luồng tài chính...</div>
      ) : (
        <div className="finance-cards-grid animate-fade-in">
          <div className="f-card success">
            <div className="f-icon"><TrendingUp size={36} /></div>
            <div className="f-data">
              <span>TỔNG ĐÃ THU</span>
              <h2>{financeData.thu.toLocaleString('vi-VN')} đ</h2>
              <p>Tổng tiền đã thu thực tế</p>
            </div>
          </div>

          <div className="f-card danger">
            <div className="f-icon"><TrendingDown size={36} /></div>
            <div className="f-data">
              <span>TỔNG ĐÃ CHI</span>
              <h2>{financeData.chi.toLocaleString('vi-VN')} đ</h2>
              <p>Tổng tiền đã chi</p>
            </div>
          </div>

          <div className="f-card warning">
            <div className="f-icon"><Wallet size={36} /></div>
            <div className="f-data">
              <span>TỔNG NỢ CHƯA THU</span>
              <h2>{financeData.no.toLocaleString('vi-VN')} đ</h2>
              <p>Chưa thu đủ</p>
            </div>
          </div>
        </div>
      )}

      {config?.hienvithuchi && (
        <>
          <div className="financial-divider"></div>

          {/* ================= 2. BÁO CÁO VÍ THU/CHI ================= */}
          <div className="financial-header">
            <div className="sh-title-group">
              <h2 className="sh-standard-title margin-0 text-slate-800">Thống Kê Chi Tiết Ví</h2>
              <div className="filter-group">
                <CreditCard size={18} className="text-muted" />
                <select value={walletsDateFilter} onChange={handleWalletsFilterChange}>
                  <option value="Hôm nay">Hôm nay</option>
                  <option value="Trong tuần này">Trong tuần này</option>
                  <option value="Trong tháng này">Trong tháng này</option>
                  <option value="Trong tháng trước">Trong tháng trước</option>
                  <option value="Trong 3 tháng trước">Trong 3 tháng trước</option>
                  <option value="Tùy chọn ngày">Tùy chọn khoảng ngày...</option>
                </select>
              </div>
            </div>
            <div className="finance-filters">
              <div className="custom-dates custom-dates-sm animate-fade-in">
                <input type="date" value={walletsDateRange.start} onChange={e => handleWalletsDateInput('start', e.target.value)} />
                <span className="date-sep">đến</span>
                <input type="date" value={walletsDateRange.end} onChange={e => handleWalletsDateInput('end', e.target.value)} />
              </div>
            </div>
          </div>

          {loadingWallets ? (
            <div className="loading-state card-loading-sm">Đang tải biểu đồ ví...</div>
          ) : (
            <div className="wallets-grid animate-fade-in">
              {/* CỘT THU */}
              <div className="wallet-col thu-col">
                <div className="wallet-header">
                  <span className="text-success flex-center"><TrendingUp size={20} /> TỔNG VÍ THU</span>
                </div>
                <div className="wallet-cards">
                  {walletsConfig.map(w => (
                    <div className="w-card" key={w.id}>
                      <span className="w-label flex-center"><Banknote size={16} /> {w.name}</span>
                      <span className="w-amount">{(walletStats.thu[w.id] || 0).toLocaleString('vi-VN')} đ</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CỘT CHI */}
              <div className="wallet-col chi-col">
                <div className="wallet-header">
                  <span className="text-danger flex-center"><TrendingDown size={20} /> TỔNG VÍ CHI</span>
                </div>
                <div className="wallet-cards">
                  {walletsConfig.map(w => (
                    <div className="w-card" key={w.id}>
                      <span className="w-label flex-center"><Banknote size={16} /> {w.name}</span>
                      <span className="w-amount">{(walletStats.chi[w.id] || 0).toLocaleString('vi-VN')} đ</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
}
