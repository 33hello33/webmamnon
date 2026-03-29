import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabase';
import { useConfig } from '../ConfigContext';
import './Statistics.css';
import {
  Users,
  DollarSign,
  TrendingUp,
  Award,
  Calendar,
  Filter,
  RefreshCw,
  PieChart as PieIcon,
  BarChart3 as BarIcon,
  LineChart as LineIcon
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Pie, Bar, Line, Doughnut } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';

// Register ChartJS modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartDataLabels
);

export default function Statistics() {
  const { config } = useConfig();
  const [dateFilter, setDateFilter] = useState('this_month');
  const [customDateRange, setCustomDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [activeDateRangeStr, setActiveDateRangeStr] = useState('');

  const [summary, setSummary] = useState({
    totalCustomers: 0,
    totalRevenue: 0,
    totalOrders: 0,
    newCustomersThisMonth: 0,
    topStaff: 'Cập nhật sau'
  });

  const [loading, setLoading] = useState(false);

  // Chart Data States
  const [cocauThuChiData, setCocauThuChiData] = useState(null);
  const [tangTruongDoanhThuData, setTangTruongDoanhThuData] = useState(null);
  const [tangTruongLoiNhuanData, setTangTruongLoiNhuanData] = useState(null);
  const [cocaDoanhThuLopData, setCocaDoanhThuLopData] = useState(null);
  const [thongKeNoLopData, setThongKeNoLopData] = useState(null);
  const [tangTruongHocSinhData, setTangTruongHocSinhData] = useState(null);
  const [siSoTungLopData, setSiSoTungLopData] = useState(null);
  const [staffRevenue, setStaffRevenue] = useState([]);

  const parseCurrency = (text) => {
    if (!text) return 0;
    return parseFloat(text.toString().replace(/,/g, '')) || 0;
  };

  const parseAmount = (val) => {
    if (val === null || val === undefined) return 0;
    const str = val.toString().replace(/[^\d]/g, '');
    return str ? parseInt(str, 10) : 0;
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
      case 'all':
        startObj = null; endObj = null; break;
      default:
        startObj = new Date(today.getFullYear(), today.getMonth(), 1);
        endObj = new Date(today);
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
      
      return `${y}-${m}-${d}T${isEnd ? '23:59:59.999' : '00:00:00.000'}+07:00`;
    };

    return {
      start: formatLocalTimestamp(startObj, false),
      end: formatLocalTimestamp(endObj, true),
      startObj,
      endObj
    };
  }, [dateFilter, customDateRange]);

  const fetchOverview = async (start, end) => {
    const fromTS = start || '1970-01-01T00:00:00+07:00';
    const toTS = end || '2999-12-31T23:59:59+07:00';
    const firstDayOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01T00:00:00+07:00`;

    try {
      // 1. Total active students
      const { count: totalCustomers } = await supabase
        .from('tbl_hv')
        .select('*', { count: 'exact', head: true })
        .neq('trangthai', 'Đã Nghỉ');

      // 2. Revenue from tbl_hd & tbl_billhanghoa
      const [resHd, resBill] = await Promise.all([
        supabase.from('tbl_hd')
          .select('dadong')
          .or('daxoa.neq."Đã Xóa",daxoa.is.null')
          .gte('ngaylap', fromTS)
          .lte('ngaylap', toTS),
        supabase.from('tbl_billhanghoa')
          .select('dadong')
          .or('daxoa.neq."Đã Xóa",daxoa.is.null')
          .gte('ngaylap', fromTS)
          .lte('ngaylap', toTS)
      ]);

      const revenueHd = resHd.data?.reduce((sum, item) => sum + parseCurrency(item.dadong), 0) || 0;
      const revenueBill = resBill.data?.reduce((sum, item) => sum + parseCurrency(item.dadong), 0) || 0;

      const totalRevenue = revenueHd + revenueBill;
      const totalOrders = (resHd.data?.length || 0) + (resBill.data?.length || 0);

      // 3. New students this month
      const { count: todayCustomers } = await supabase
        .from('tbl_hv')
        .select('*', { count: 'exact', head: true })
        .gte('ngaynhaphoc', firstDayOfMonth);

      setSummary({
        totalCustomers: totalCustomers || 0,
        totalRevenue,
        totalOrders,
        newCustomersThisMonth: todayCustomers || 0,
        topStaff: 'Sẽ cập nhật'
      });
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCoCauThuChi = async (start, end) => {
    const fromTS = start || '1970-01-01T00:00:00+07:00';
    const toTS = end || '2999-12-31T23:59:59+07:00';

    try {
      const [resHd, resBill, resChi, resThu, resNhap] = await Promise.all([
        supabase.from('tbl_hd').select('dadong').neq('daxoa', 'Đã Xóa').gte('ngaylap', fromTS).lte('ngaylap', toTS),
        supabase.from('tbl_billhanghoa').select('dadong').neq('daxoa', 'Đã Xóa').gte('ngaylap', fromTS).lte('ngaylap', toTS),
        supabase.from('tbl_phieuchi').select('chiphi').or('daxoa.neq."Đã Xóa",daxoa.is.null').eq('loaiphieu', 'Chi').gte('ngaylap', fromTS).lte('ngaylap', toTS),
        supabase.from('tbl_phieuchi').select('chiphi').or('daxoa.neq."Đã Xóa",daxoa.is.null').eq('loaiphieu', 'Thu').gte('ngaylap', fromTS).lte('ngaylap', toTS),
        supabase.from('tbl_nhapkho').select('thanhtien').or('daxoa.neq."Đã Xóa",daxoa.is.null').gte('ngaynhap', fromTS).lte('ngaynhap', toTS)
      ]);

      const details = {
        'Học phí': resHd.data?.reduce((sum, i) => sum + parseAmount(i.dadong), 0) || 0,
        'Bán hàng': resBill.data?.reduce((sum, i) => sum + parseAmount(i.dadong), 0) || 0,
        'Thu khác': resThu.data?.reduce((sum, i) => sum + parseAmount(i.chiphi), 0) || 0,
        'Phiếu chi': resChi.data?.reduce((sum, i) => sum + parseAmount(i.chiphi), 0) || 0,
        'Nhập kho': resNhap.data?.reduce((sum, i) => sum + parseAmount(i.thanhtien), 0) || 0
      };

      const labels = Object.keys(details).filter(k => details[k] > 0);
      const data = labels.map(l => details[l]);

      setCocauThuChiData({
        labels,
        datasets: [{
          data,
          backgroundColor: ['#10B981', '#34D399', '#60A5FA', '#F87171', '#FB923C', '#A78BFA'],
          borderWidth: 1
        }]
      });
    } catch (err) {
      console.error(err);
    }
  };

  const fetchGrowthCharts = async () => {
    const today = new Date();
    const startDateObj = new Date(today.getFullYear(), today.getMonth() - 11, 1);
    
    // Format YYYY-MM-DD for simpler filtering on timestamp columns
    const startDateSmall = `${startDateObj.getFullYear()}-${String(startDateObj.getMonth() + 1).padStart(2, '0')}-01`;

    try {
      const [resHd, resBill, resChi, resThu, resNhap, resHv] = await Promise.all([
        supabase.from('tbl_hd').select('ngaylap, dadong').or('daxoa.neq."Đã Xóa",daxoa.is.null').gte('ngaylap', startDateSmall).limit(10000),
        supabase.from('tbl_billhanghoa').select('ngaylap, dadong').or('daxoa.neq."Đã Xóa",daxoa.is.null').gte('ngaylap', startDateSmall).limit(10000),
        supabase.from('tbl_phieuchi').select('ngaylap, chiphi').or('daxoa.neq."Đã Xóa",daxoa.is.null').eq('loaiphieu', 'Chi').gte('ngaylap', startDateSmall).limit(10000),
        supabase.from('tbl_phieuchi').select('ngaylap, chiphi').or('daxoa.neq."Đã Xóa",daxoa.is.null').eq('loaiphieu', 'Thu').gte('ngaylap', startDateSmall).limit(10000),
        supabase.from('tbl_nhapkho').select('ngaynhap, thanhtien').or('daxoa.neq."Đã Xóa",daxoa.is.null').gte('ngaynhap', startDateSmall).limit(10000),
        supabase.from('tbl_hv').select('ngaynhaphoc').neq('trangthai', 'Đã Nghỉ').gte('ngaynhaphoc', startDateSmall).limit(10000)
      ]);

      const monthlyRevenue = {};
      const monthlyProfit = {};
      const monthlyHs = {};
      const months = [];

      for (let i = 11; i >= 0; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        monthlyRevenue[key] = 0;
        monthlyProfit[key] = 0;
        monthlyHv[key] = 0;
        months.push(key);
      }

      const extractYearMonth = (dateStr) => {
        if (!dateStr) return null;
        const s = dateStr.toString();
        // Case YYYY-MM-DD...
        if (s.includes('-') && s.indexOf('-') === 4) {
          return s.substring(0, 7);
        }
        // Case DD/MM/YYYY...
        if (s.includes('/')) {
          const parts = s.split('/');
          if (parts.length >= 3) {
            const y = parts[2].substring(0, 4);
            const m = parts[1].padStart(2, '0');
            return `${y}-${m}`;
          }
        }
        // Fallback to Date object
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        }
        return null;
      };

      // Process Invoices & Bills
      (resHd.data || []).forEach(item => {
        const key = extractYearMonth(item.ngaylap);
        if (key && monthlyRevenue.hasOwnProperty(key)) {
          const val = parseAmount(item.dadong);
          monthlyRevenue[key] += val;
          monthlyProfit[key] += val;
        }
      });
      (resBill.data || []).forEach(item => {
        const key = extractYearMonth(item.ngaylap);
        if (key && monthlyRevenue.hasOwnProperty(key)) {
          const val = parseAmount(item.dadong);
          monthlyRevenue[key] += val;
          monthlyProfit[key] += val;
        }
      });

      // Process Income (Thu)
      (resThu.data || []).forEach(item => {
        const key = extractYearMonth(item.ngaylap);
        if (key && monthlyProfit.hasOwnProperty(key)) monthlyProfit[key] += parseAmount(item.chiphi);
      });

      // Process Expenses (Chi)
      (resChi.data || []).forEach(item => {
        const key = extractYearMonth(item.ngaylap);
        if (key && monthlyProfit.hasOwnProperty(key)) monthlyProfit[key] -= parseAmount(item.chiphi);
      });

      // Process Purchase (NhapKho)
      (resNhap.data || []).forEach(item => {
        const key = extractYearMonth(item.ngaynhap);
        if (key && monthlyProfit.hasOwnProperty(key)) monthlyProfit[key] -= parseAmount(item.thanhtien);
      });

      // Process Students
      (resHv.data || []).forEach(item => {
        const key = extractYearMonth(item.ngaynhaphoc);
        if (key && monthlyHs.hasOwnProperty(key)) monthlyHs[key]++;
      });

      const monthLabels = months.map(m => `${m.split('-')[1]}/${m.split('-')[0]}`);

      setTangTruongDoanhThuData({
        labels: monthLabels,
        datasets: [{
          label: 'Doanh thu',
          data: months.map(m => monthlyRevenue[m]),
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          tension: 0.4,
          fill: true
        }]
      });

      setTangTruongLoiNhuanData({
        labels: monthLabels,
        datasets: [{
          label: 'Lợi nhuận',
          data: months.map(m => monthlyProfit[m]),
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4,
          fill: true
        }]
      });

      setTangTruongHocSinhData({
        labels: monthLabels,
        datasets: [{
          label: 'Học sinh mới',
          data: months.map(m => monthlyHs[m]),
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          tension: 0.4,
          fill: true
        }]
      });

    } catch (err) {
      console.error(err);
    }
  };

  const fetchClassStats = async (start, end) => {
    const fromTS = start || '1970-01-01T00:00:00+07:00';
    const toTS = end || '2999-12-31T23:59:59+07:00';
    
    try {
      const [resHd, resBill, resLop, resLichHocActive] = await Promise.all([
        supabase.from('tbl_hd').select('*').or('daxoa.neq."Đã Xóa",daxoa.is.null').gte('ngaylap', fromTS).lte('ngaylap', toTS),
        supabase.from('tbl_billhanghoa').select('*, tbl_hv(tenhv)').or('daxoa.neq."Đã Xóa",daxoa.is.null').gte('ngaylap', fromTS).lte('ngaylap', toTS),
        supabase.from('tbl_lop').select('malop, tenlop'),
        supabase.from('tbl_hv').select('mahv, malop, tbl_lop(tenlop)').neq('trangthai', 'Đã Nghỉ')
      ]);
 
      const dataByClass = {};
      const debtByClass = {};
      const staffRevMap = {};
 
      const cleanLabel = (l) => l?.toString().trim().replace(/[\r\n]+/g, '') || 'Khác';
 
      resHd.data?.forEach(item => {
        const l = cleanLabel(item.tenlop);
        if (!dataByClass[l]) dataByClass[l] = { hp: 0, sale: 0 };
        dataByClass[l].hp += parseAmount(item.dadong);
        debtByClass[l] = (debtByClass[l] || 0) + parseAmount(item.conno);
 
        const nv = item.nhanvien || 'Hệ thống';
        staffRevMap[nv] = (staffRevMap[nv] || 0) + parseAmount(item.dadong);
      });
 
      // Ánh xạ mahv -> tenlop đầu tiên tìm thấy (Thay thế tbl_lichhoc_hv bằng tbl_hv)
      const studentToClassMap = {};
      const sisoMap = {};
 
      resLichHocActive.data?.forEach(hv => {
        if (!studentToClassMap[hv.mahv]) {
          studentToClassMap[hv.mahv] = hv.tbl_lop?.tenlop;
        }
        if (hv.malop) {
          sisoMap[hv.malop] = (sisoMap[hv.malop] || 0) + 1;
        }
      });
 
      resBill.data?.forEach(item => {
        const foundTenLop = studentToClassMap[item.mahv];
        const l = cleanLabel(foundTenLop);
        if (!dataByClass[l]) dataByClass[l] = { hp: 0, sale: 0 };
        dataByClass[l].sale += parseAmount(item.dadong);
        debtByClass[l] = (debtByClass[l] || 0) + parseAmount(item.conno);

        const nv = item.nhanvien || 'Hệ thống';
        staffRevMap[nv] = (staffRevMap[nv] || 0) + parseAmount(item.dadong);
      });

      const sortedStaff = Object.keys(staffRevMap).map(name => ({
        name,
        revenue: staffRevMap[name]
      })).sort((a, b) => b.revenue - a.revenue);
      setStaffRevenue(sortedStaff);

      const classLabels = Object.keys(dataByClass).sort();
      setCocaDoanhThuLopData({
        labels: classLabels,
        datasets: [
          { label: 'Học phí', data: classLabels.map(l => dataByClass[l].hp), backgroundColor: '#10B981' },
          { label: 'Bán hàng', data: classLabels.map(l => dataByClass[l].sale), backgroundColor: '#3B82F6' }
        ]
      });

      const debtLabels = Object.keys(debtByClass).filter(l => debtByClass[l] > 0).sort();
      setThongKeNoLopData({
        labels: debtLabels,
        datasets: [{
          label: 'Tiền nợ',
          data: debtLabels.map(l => debtByClass[l]),
          backgroundColor: '#EF4444'
        }]
      });

      const classSiso = resLop.data?.map(l => ({ 
        label: l.tenlop, 
        count: sisoMap[l.malop] || 0 
      })).filter(l => l.count > 0);

      setSiSoTungLopData({
        labels: classSiso?.map(l => l.label),
        datasets: [{
          data: classSiso?.map(l => l.count),
          backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']
        }]
      });

    } catch (err) {
      console.error(err);
    }
  };

  const loadAll = async () => {
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

    await Promise.all([
      fetchOverview(start, end),
      fetchCoCauThuChi(start, end),
      fetchGrowthCharts(),
      fetchClassStats(start, end)
    ]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, [dateFilter]); // Retrigger when non-custom filter changes

  useEffect(() => {
    if (dateFilter === 'custom') {
      loadAll();
    }
  }, [customDateRange.start, customDateRange.end]);

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' },
      datalabels: { display: false }
    }
  };

  const currencyFormatter = (val) => new Intl.NumberFormat('vi-VN').format(val) + ' đ';

  return (
    <div className="statistics-container animate-fade-in">
      <div className="stat-header">
        <div className="stat-header-left">
          <h2>Phân tích & Thống kê</h2>
          <p>Báo cáo chi tiết hoạt động kinh doanh {activeDateRangeStr}</p>
        </div>
        
        <div className="stat-header-right">
          <div className="filter-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div className="filter-card">
              <Filter size={18} color="#64748b" />
              <select
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                style={{ border: 'none', outline: 'none', fontWeight: 600, color: '#334155', background: 'transparent', cursor: 'pointer' }}
              >
                <option value="today">Hôm nay</option>
                <option value="yesterday">Hôm qua</option>
                <option value="7days">7 ngày qua</option>
                <option value="this_month">Trong tháng này</option>
                <option value="last_month">Tháng trước</option>
                <option value="custom">Tùy chọn ngày...</option>
                <option value="all">Toàn bộ thời gian</option>
              </select>
            </div>

            <button onClick={loadAll} disabled={loading} className="refresh-btn" style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '0.65rem 1rem', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {loading ? '...' : 'Làm mới'}
            </button>
          </div>

          {dateFilter === 'custom' && (
            <div className="custom-date-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
              <input
                type="date"
                value={customDateRange.start}
                onChange={e => setCustomDateRange({ ...customDateRange, start: e.target.value })}
                style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 8px', fontSize: '0.85rem', flex: 1 }}
              />
              <span style={{ color: '#94a3b8' }}>→</span>
              <input
                type="date"
                value={customDateRange.end}
                onChange={e => setCustomDateRange({ ...customDateRange, end: e.target.value })}
                style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 8px', fontSize: '0.85rem', flex: 1 }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-item">
          <div className="chart-title">
            <PieIcon size={20} className="text-primary" />
            <h3>Cơ cấu Thu - Chi</h3>
          </div>
          <div className="chart-canvas-container">
            {cocauThuChiData && <Pie data={cocauThuChiData} options={{ ...commonOptions, plugins: { ...commonOptions.plugins, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${currencyFormatter(c.raw)}` } } } }} />}
          </div>
        </div>

        <div className="chart-item">
          <div className="chart-title">
            <LineIcon size={20} style={{ color: '#10B981' }} />
            <h3>Tăng trưởng doanh thu (12 tháng)</h3>
          </div>
          <div className="chart-canvas-container">
            {tangTruongDoanhThuData && <Line data={tangTruongDoanhThuData} options={commonOptions} />}
          </div>
        </div>

        <div className="chart-item">
          <div className="chart-title">
            <TrendingUp size={20} style={{ color: '#3B82F6' }} />
            <h3>Tăng trưởng lợi nhuận</h3>
          </div>
          <div className="chart-canvas-container">
            {tangTruongLoiNhuanData && <Line data={tangTruongLoiNhuanData} options={commonOptions} />}
          </div>
        </div>

        <div className="chart-item">
          <div className="chart-title">
            <BarIcon size={20} style={{ color: '#F59E0B' }} />
            <h3>Cơ cấu doanh thu theo lớp</h3>
          </div>
          <div className="chart-canvas-container">
            {cocaDoanhThuLopData && <Bar data={cocaDoanhThuLopData} options={{ ...commonOptions, scales: { x: { stacked: true }, y: { stacked: true } } }} />}
          </div>
        </div>

        <div className="chart-item">
          <div className="chart-title">
            <BarIcon size={20} style={{ color: '#EF4444' }} />
            <h3>Thống kê nợ theo lớp</h3>
          </div>
          <div className="chart-canvas-container">
            {thongKeNoLopData && <Bar data={thongKeNoLopData} options={{ ...commonOptions, plugins: { ...commonOptions.plugins, datalabels: { display: true, anchor: 'end', align: 'top', formatter: (v) => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v } } }} />}
          </div>
        </div>

        <div className="chart-item">
          <div className="chart-title">
            <Users size={20} style={{ color: '#F59E0B' }} />
            <h3>Tăng trưởng học sinh mới</h3>
          </div>
          <div className="chart-canvas-container">
            {tangTruongHocSinhData && <Line data={tangTruongHocSinhData} options={commonOptions} />}
          </div>
        </div>

        <div className="chart-item">
          <div className="chart-title">
            <PieIcon size={20} style={{ color: '#8B5CF6' }} />
            <h3>Sĩ số từng lớp</h3>
          </div>
          <div className="chart-canvas-container">
            {siSoTungLopData && <Doughnut data={siSoTungLopData} options={{ ...commonOptions, plugins: { ...commonOptions.plugins, legend: { position: 'right' } } }} />}
          </div>
        </div>
      </div>
    </div>
  );
}
