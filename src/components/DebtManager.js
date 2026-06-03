import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../supabase';
import { useConfig } from '../ConfigContext';
import { BadgeDollarSign, Clock, CheckCircle, X } from 'lucide-react';
import { toPng } from 'html-to-image';
import './DebtManager.css';

export default function DebtManager() {
  const { config } = useConfig();
  const walletsConfig = (config ? [
    { id: 'vi1', name: config.vi1?.name || '' },
    { id: 'vi2', name: config.vi2?.name || '' },
    { id: 'vi3', name: config.vi3?.name || '' },
    { id: 'vi4', name: config.vi4?.name || '' }
  ].filter(w => w.name && w.name.trim() !== '') : []);

  const [classes, setClasses] = useState([]);
  const [debtList, setDebtList] = useState([]);
  const [overdueList, setOverdueList] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Tiền mặt');
  const [downloadingPayment, setDownloadingPayment] = useState(null);
  const [previewImg, setPreviewImg] = useState(null);

  const auth = JSON.parse(localStorage.getItem('auth_session') || '{}');
  const cashier = auth.user?.tennv || auth.user?.username || 'Thu Ngân';

  const formatCurrency = (val) => {
    if (val === 0 || val === '0') return '0';
    if (!val) return '';
    const num = typeof val === 'number' ? val : parseInt(String(val).replace(/,/g, ''), 10);
    if (isNaN(num)) return String(val);
    const isNeg = num < 0;
    const absNum = Math.abs(num);
    const formatted = absNum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (isNeg ? '-' : '') + formatted;
  };

  const openPaymentModal = (debtItem) => {
    setSelectedDebt(debtItem);
    // Tự động set số tiền trả = số tiền nợ (Học phí = Nợ cũ)
    setPaymentAmount(formatCurrency(debtItem.conno));
    setPaymentNote(`trả nợ ${debtItem.mahd}`);
    setPaymentError('');
    setPaymentSuccess('');
    setPaymentMethod(walletsConfig.length > 0 ? walletsConfig[0].name : 'Tiền mặt');
    setShowPaymentModal(true);
  };

  useEffect(() => {
    if (downloadingPayment) {
      const processPng = async () => {
        try {
          await new Promise(r => setTimeout(r, 1000));
          const node = document.getElementById('download-debt-receipt-node');
          if (node) {
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

            node.style.position = 'static';
            node.style.opacity = '0.01';

            if (window.innerWidth <= 991) {
              setPreviewImg(dataUrl);
            } else {
              const link = document.createElement('a');
              link.download = `BienLai_TraNo_${downloadingPayment.tenhv}_${downloadingPayment.mahd}.png`;
              link.href = dataUrl;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }
          }
        } catch (err) {
          console.error('Lỗi xuất PNG trả nợ:', err);
        } finally {
          setDownloadingPayment(null);
        }
      };
      processPng();
    }
  }, [downloadingPayment]);

  const handleConfirmPayment = async () => {
    const payVal = parseInt(String(paymentAmount).replace(/,/g, ''), 10);
    if (isNaN(payVal) || payVal <= 0) {
      setPaymentError('Vui lòng nhập số tiền hợp lệ lớn hơn 0');
      return;
    }

    setIsProcessing(true);
    setPaymentError('');

    try {
      const oldDebtVal = typeof selectedDebt.conno === 'number' ? selectedDebt.conno : parseInt(String(selectedDebt.conno).replace(/,/g, ''), 10) || 0;
      const newConno = oldDebtVal - payVal;

      const tableName = selectedDebt.loai === 'Học Phí' ? 'tbl_hd' : 'tbl_billhanghoa';
      const idField = selectedDebt.loai === 'Học Phí' ? 'mahd' : 'mabill';

      const { error: updateErr } = await supabase.from(tableName)
        .update({ conno: '0' })
        .eq(idField, selectedDebt.mahd);

      if (updateErr) throw updateErr;

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

      const formatCurrencyLocal = (val) => {
        if (val === 0) return '0';
        if (!val) return '';
        return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      };

      let oldNgayBatDau = null;
      let oldNgayKetThuc = null;
      let oldSoBuoiHoc = '';
      let oldThoiLuong = '';

      if (selectedDebt.loai === 'Hóa Đơn') {
        const { data: oldInfo } = await supabase.from('tbl_hd')
          .select('ngaybatdau, ngayketthuc, sobuoihoc, thoiluong')
          .eq('mahd', selectedDebt.mahd)
          .single();

        if (oldInfo) {
          oldNgayBatDau = oldInfo.ngaybatdau;
          oldNgayKetThuc = oldInfo.ngayketthuc;
          oldSoBuoiHoc = oldInfo.sobuoihoc || '';
          oldThoiLuong = oldInfo.thoiluong || '';
        }
      }

      const insertData = {
        mahd: newMaHD,
        ngaylap: localNow,
        mahv: selectedDebt.mahv,
        tenlop: selectedDebt.tenlop || '',
        ngaybatdau: oldNgayBatDau,
        ngayketthuc: oldNgayKetThuc,
        // Học phí = Nợ cũ (theo yêu cầu)
        hocphi: formatCurrencyLocal(oldDebtVal),
        giamhocphi: '0',
        tongcong: formatCurrencyLocal(oldDebtVal),
        dadong: formatCurrencyLocal(payVal),
        conno: formatCurrencyLocal(newConno),
        hinhthuc: paymentMethod,
        ghichu: paymentNote,
        daxoa: null,
        sobuoihoc: oldSoBuoiHoc,
        thoiluong: oldThoiLuong,
        malop: malop,
        manv: auth.user?.manv || auth.user?.username || ''
      };

      const { error: insertErr } = await supabase.from('tbl_hd').insert([insertData]);
      if (insertErr) throw insertErr;

      setPaymentSuccess('Trả nợ thành công! Đã cập nhật hóa đơn.');
      setDebtList(prev => prev.filter(d => d.mahd !== selectedDebt.mahd));

      // Trigger download PNG
      setDownloadingPayment({
        ...insertData,
        tenhv: selectedDebt.tenhv,
        nhanvien: cashier
      });

      setTimeout(() => {
        setShowPaymentModal(false);
      }, 1500);

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
        const { data: classData } = await supabase.from('tbl_lop').select('malop, tenlop');
        const cMap = classData || [];
        setClasses(cMap);

        const { data: stdRaw } = await supabase.from('tbl_hv').select('mahv, tenhv, trangthai, malop');
        const students = (stdRaw || []).map(s => ({
          ...s,
          malop_list: s.malop ? [s.malop] : []
        }));

        // Fetch Hợp Đồng (HD)
        const { data: hdData } = await supabase.from('tbl_hd')
          .select('mahd, mahv, conno, tenlop, daxoa, ngaylap, ngayketthuc');

        // Fetch Bill Hàng Hóa (Cho dù bảng chưa tạo cũng sẽ không crash hệ thống)
        let billData = [];
        const { data: bData, error } = await supabase.from('tbl_billhanghoa')
          .select('mabill, mahv, conno, daxoa');
        if (!error && bData) billData = bData;

        // Remove 'Đã Xóa' as requested
        const validHd = (hdData || []).filter(h => (h.daxoa || '').toLowerCase() !== 'đã xóa');
        const validBill = billData.filter(b => (b.daxoa || '').toLowerCase() !== 'đã xóa');

        // BẢNG 1: Tổng Hợp Danh Sách Còn Nợ
        const mergedTemp = [];
        validHd.forEach(hd => {
          if (hd.conno && hd.conno !== '0' && hd.conno !== 0) {
            const std = students.find(s => s.mahv === hd.mahv) || {};
            mergedTemp.push({
              mahv: hd.mahv,
              tenhv: std.tenhv || 'Không rõ',
              conno: hd.conno,
              tenlop: hd.tenlop || '',
              loai: 'Học Phí',
              mahd: hd.mahd
            });
          }
        });

        validBill.forEach(bill => {
          if (bill.conno && bill.conno !== '0' && bill.conno !== 0) {
            const std = students.find(s => s.mahv === bill.mahv) || {};
            const firstMalop = std.malop_list && std.malop_list.length > 0 ? std.malop_list[0] : null;
            const stClass = cMap.find(c => c.malop === firstMalop);
            mergedTemp.push({
              mahv: bill.mahv,
              tenhv: std.tenhv || 'Không rõ',
              conno: bill.conno,
              tenlop: stClass ? stClass.tenlop : '',
              loai: 'Bill Hàng',
              mahd: bill.mabill
            });
          }
        });

        setDebtList(mergedTemp);

        // BẢNG 2: Danh Sách Quá Hạn Đóng Tiền
        const overdueTemp = [];
        // Lọc các học sinh không phải 'Đã Nghỉ'
        const activeStudents = students.filter(s => (s.trangthai || '') !== 'Đã Nghỉ');

        const today = new Date();
        const localNow = new Date(today - today.getTimezoneOffset() * 60000);
        const todayIso = localNow.toISOString().split('T')[0];

        activeStudents.forEach(std => {
          // SELECT DISTINCT ON (hd.MaHV) ... ORDER BY hd.MaHV, hd.NgayLap DESC, hd.MaHD DESC
          const stHds = validHd.filter(h => h.mahv === std.mahv);
          if (stHds.length === 0) return;

          stHds.sort((a, b) => {
            const dA = a.ngaylap ? new Date(a.ngaylap).getTime() : 0;
            const dB = b.ngaylap ? new Date(b.ngaylap).getTime() : 0;
            if (dA !== dB) return dB - dA;
            const mha = a.mahd || '';
            const mhb = b.mahd || '';
            return mhb.localeCompare(mha);
          });

          const latestHd = stHds[0]; // Bản ghi mới nhất của học sinh đó

          // Logic: Nếu qua ngày kết thúc + ngayquahan thì mới load vào table Báo động
          const nqh = parseInt(config?.ngayquahan || 0, 10);
          const ngayKetThucObj = new Date(latestHd.ngayketthuc);
          const ngayBaoDongObj = new Date(ngayKetThucObj);
          ngayBaoDongObj.setDate(ngayBaoDongObj.getDate() + nqh);

          const alarmDateIso = ngayBaoDongObj.toISOString().split('T')[0];

          if (latestHd.ngayketthuc && alarmDateIso < todayIso) {
            overdueTemp.push({
              mahv: std.mahv,
              tenhv: std.tenhv || 'Không rõ',
              ngayketthuc: latestHd.ngayketthuc,
              ngaylap: latestHd.ngaylap,
              tenlop: latestHd.tenlop
            });
          }
        });

        setOverdueList(overdueTemp);

      } catch (err) {
        console.error("Lỗi khi load dữ liệu Quản lý nợ:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [config?.ngayquahan]);

  if (loading) {
    return <div className="loading-state">Đang rà soát doanh thu và nợ...</div>;
  }

  return (
    <div className="debt-manager animate-fade-in">
      {/* 📊 Thống kê tổng quan */}
      <div className="debt-stats-row">
        <div className="debt-stat-card">
          <div className="stat-icon-box warning">
            <BadgeDollarSign size={24} />
          </div>
          <div className="stat-info">
            <label>Tổng Chứng Từ Nợ</label>
            <div className="value">{debtList.length} <span>Phiếu</span></div>
          </div>
        </div>
        <div className={`debt-stat-card ${debtList.reduce((sum, d) => sum + (parseInt(String(d.conno).replace(/,/g, '')) || 0), 0) > 0 ? 'danger' : 'success'}`}>
          <div className={`stat-icon-box ${debtList.reduce((sum, d) => sum + (parseInt(String(d.conno).replace(/,/g, '')) || 0), 0) > 0 ? 'danger' : 'success'}`}>
            <BadgeDollarSign size={24} />
          </div>
          <div className="stat-info">
            <label>Tổng Tiền Nợ</label>
            <div className="value">
              {formatCurrency(debtList.reduce((sum, d) => sum + (parseInt(String(d.conno).replace(/,/g, '')) || 0), 0))} ₫
            </div>
          </div>
        </div>
        <div className="debt-stat-card overdue">
          <div className="stat-icon-box danger">
            <Clock size={24} />
          </div>
          <div className="stat-info">
            <label>Quá Hạn Đóng Phí</label>
            <div className="value">{overdueList.length} <span>Học sinh</span></div>
          </div>
        </div>
      </div>

      <div className="debt-layout">

        {/* Table 1: Danh sách còn nợ */}
        <div className="debt-card">
          <div className="debt-header">
            <div className="debt-title">
              <BadgeDollarSign size={20} className="text-warning" />
              <h3>Danh sách học sinh còn nợ</h3>
            </div>
            <span className="debt-badge warning">{debtList.length} Chứng từ</span>
          </div>
          <div className="debt-body">
            <div className="table-scroll-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mã HS</th>
                    <th>Tên Học Sinh</th>
                    <th>Phân Loại</th>
                    <th>Mã Phiếu</th>
                    <th>Tên Lớp</th>
                    <th className="text-right">Số Tiền Nợ</th>
                    <th className="text-center">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {debtList.length > 0 ? (
                    debtList.map((d, idx) => (
                      <tr key={`${d.mahd}-${idx}`}>
                        <td className="font-medium text-slate-500">{d.mahv}</td>
                        <td className="font-bold text-slate-800">{d.tenhv}</td>
                        <td>
                          <span className={`status-badge ${d.loai === 'Hóa Đơn' ? 'success' : 'primary'}`}>
                            {d.loai}
                          </span>
                        </td>
                        <td className="font-medium">{d.mahd}</td>
                        <td>{d.tenlop}</td>
                        <td className={`text-right font-bold ${parseInt(String(d.conno).replace(/,/g, '')) > 0 ? 'text-danger' : 'text-success'}`}>
                          {formatCurrency(d.conno)}
                          {parseInt(String(d.conno).replace(/,/g, '')) < 0 && <span style={{ fontSize: '0.7rem', marginLeft: '4px' }}>(Tiền dư)</span>}
                        </td>
                        <td className="text-center">
                          <button
                            style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                            onClick={() => openPaymentModal(d)}
                          >
                            Trả nợ
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="empty-state">Tuyệt vời! Tất cả học sinh đã thanh toán đủ tiền kỳ này.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ✅ CARD LIST (mobile) */}
            <div className="debt-card-list">
              {debtList.length > 0 ? (
                debtList.map((d, idx) => (
                  <div key={`${d.mahd}-${idx}`} className="debt-item-card">
                    <div className="card-header">
                      <div className="student-info">
                        <span className="student-name">{d.tenhv}</span>
                        <span className="student-id">#{d.mahv}</span>
                      </div>
                      <span className={`status-badge ${d.loai === 'Học Phí' ? 'success' : 'primary'}`}>
                        {d.loai}
                      </span>
                    </div>
                    <div className="card-body">
                      <div className="info-line">
                        <span><strong>Mã phiếu:</strong> {d.mahd}</span>
                        <span><strong>Lớp:</strong> {d.tenlop}</span>
                      </div>
                      <div className="info-line amount-row">
                        <span className="debt-amount">{d.conno.toLocaleString()} ₫</span>
                        <button className="btn-pay" onClick={() => openPaymentModal(d)}>Trả nợ</button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">Không có học sinh nào còn nợ tiền.</div>
              )}
            </div>
          </div>
        </div>

        {/* Table 2: Quá hạn đóng tiền */}
        <div className="debt-card">
          <div className="debt-header">
            <div className="debt-title">
              <Clock size={20} className="text-danger" />
              <h3>Báo động trễ hạn đóng học phí (Quá hạn đóng)</h3>
            </div>
            <span className="debt-badge danger">{overdueList.length} Học sinh</span>
          </div>
          <div className="debt-body">
            <div className="table-scroll-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mã HS</th>
                    <th>Tên Học Sinh</th>
                    <th>Tên Lớp</th>
                    <th>Ngày Lập HĐ</th>
                    <th className="text-danger">Ngày Kết Thúc (Deadline)</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueList.length > 0 ? (
                    overdueList.map((d, idx) => {
                      const formattedLap = new Date(d.ngaylap).toLocaleDateString('vi-VN');
                      const formattedKetThuc = new Date(d.ngayketthuc).toLocaleDateString('vi-VN');
                      return (
                        <tr key={idx}>
                          <td className="font-medium text-slate-500">{d.mahv}</td>
                          <td className="font-bold text-slate-800">{d.tenhv}</td>
                          <td>{d.tenlop}</td>
                          <td className="text-muted">{formattedLap}</td>
                          <td className="font-bold text-danger text-lg">{formattedKetThuc}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="5" className="empty-state">Rất tốt! Không có học sinh nào đang học vượt khung thời gian đóng phí.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ✅ CARD LIST (mobile) */}
            <div className="debt-card-list">
              {overdueList.length > 0 ? (
                overdueList.map((d, idx) => (
                  <div key={idx} className="debt-item-card overdue">
                    <div className="card-header">
                      <div className="student-info">
                        <span className="student-name">{d.tenhv}</span>
                        <span className="student-id">#{d.mahv}</span>
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="info-line">
                        <span><strong>Lớp:</strong> {d.tenlop}</span>
                      </div>
                      <div className="info-line">
                        <span><strong>Ngày lập HĐ:</strong> {new Date(d.ngaylap).toLocaleDateString('vi-VN')}</span>
                      </div>
                      <div className="info-line deadline-row">
                        <span className="deadline-label">Hạn kết thúc:</span>
                        <span className="deadline-date">{new Date(d.ngayketthuc).toLocaleDateString('vi-VN')}</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">Không có học sinh nào quá hạn đóng phí.</div>
              )}
            </div>
          </div>
        </div>

      </div>

      {showPaymentModal && selectedDebt && ReactDOM.createPortal(
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content animate-slide-up" style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '400px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.25rem', color: '#1e293b' }}>Thanh Toán Nợ</h3>

            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Học sinh:</span>
              <span style={{ fontWeight: 'bold' }}>{selectedDebt.tenhv}</span>
            </div>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Lớp:</span>
              <span style={{ fontWeight: 'bold' }}>{selectedDebt.tenlop}</span>
            </div>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Số phiếu nợ:</span>
              <span style={{ fontWeight: 'bold', color: '#ef4444' }}>{selectedDebt.mahd}</span>
            </div>
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Số tiền nợ:</span>
              <span style={{ fontWeight: 'bold', color: parseInt(String(selectedDebt.conno).replace(/,/g, '')) > 0 ? '#ef4444' : '#16a34a', fontSize: '1.1rem' }}>
                {formatCurrency(selectedDebt.conno)} ₫
                {parseInt(String(selectedDebt.conno).replace(/,/g, '')) < 0 && <span style={{ fontSize: '0.8rem', marginLeft: '4px' }}>(Tiền dư)</span>}
              </span>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#334155', fontWeight: 500 }}>Số tiền trả nợ (VNĐ)</label>
              <input
                type="text"
                value={paymentAmount}
                onChange={(e) => {
                  const rawValue = e.target.value.replace(/,/g, '').replace(/\D/g, '');
                  if (!rawValue) {
                    setPaymentAmount('');
                    return;
                  }
                  const num = parseInt(rawValue, 10);
                  setPaymentAmount(num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));
                }}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none' }}
                placeholder="Nhập số tiền..."
              />
              <small style={{ color: '#64748b', display: 'block', marginTop: '4px' }}>Có thể nhập dư để trừ nợ cho hóa đơn sau tại phần nợ cũ</small>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#334155', fontWeight: 500 }}>Ghi chú</label>
              <input
                type="text"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#334155', fontWeight: 500 }}>💳 Hình thức thanh toán</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none', background: '#fff' }}
              >
                {walletsConfig.length === 0 && <option value="Tiền mặt">Tiền mặt</option>}
                {walletsConfig.map(w => (
                  <option key={w.id} value={w.name}>{w.name}</option>
                ))}
              </select>
            </div>

            {paymentError && <div style={{ color: '#ef4444', marginBottom: '16px', fontSize: '0.9rem' }}>{paymentError}</div>}
            {paymentSuccess && <div style={{ color: '#10b981', marginBottom: '16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle size={16} /> {paymentSuccess}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setShowPaymentModal(false)}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer' }}
                disabled={isProcessing}
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmPayment}
                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 500, cursor: 'pointer' }}
                disabled={isProcessing}
              >
                {isProcessing ? 'Đang xử lý...' : 'Xác nhận trả nợ'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* HIDDEN TEMPLATE FOR DEBT RECEIPT PNG EXPORT */}
      <div style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', overflow: 'hidden', opacity: 0.01, zIndex: -100, pointerEvents: 'none', background: '#ffffff' }}>
        <div id="download-debt-receipt-node" style={{ position: 'relative', overflow: 'hidden', padding: '30px', background: 'white', color: '#000', width: '800px', fontFamily: 'Arial, sans-serif' }}>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ width: '180px', textAlign: 'left' }}>
                {config?.logo && <img crossOrigin="anonymous" src={config.logo} alt="logo" style={{ maxWidth: '160px', maxHeight: '160px', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, textTransform: 'uppercase' }}>{config?.tencongty || 'Tên Công Ty'}</h2>
                <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Địa chỉ: {config?.diachicongty}</p>
              </div>
              <div style={{ width: '150px', textAlign: 'right', fontSize: '14px' }}>
                <div>Số phiếu: <b style={{ fontWeight: 950 }}>{downloadingPayment?.mahd}</b></div>
                <div>Ngày lập: <span style={{ fontWeight: 600 }}>{downloadingPayment ? new Date(downloadingPayment.ngaylap).toLocaleDateString("vi-VN") : ""}</span></div>
              </div>
            </div>
            <div style={{ textAlign: "center", fontWeight: "950", fontSize: "20pt", margin: "15px 0", color: '#000', textTransform: 'uppercase', textDecoration: 'underline' }}>
              BIÊN LAI THU HÀNG / NỢ
            </div>
            <div style={{ fontSize: "14pt", lineHeight: "1.8", margin: '20px 0' }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: '5px' }}>
                <div>Họ và tên: <b style={{ fontWeight: 950 }}>{downloadingPayment?.tenhv}</b></div>
              </div>
              <div>Lớp học: <b style={{ fontWeight: 900 }}>{downloadingPayment?.tenlop}</b></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>Hình thức: <b style={{ fontWeight: 900 }}>{downloadingPayment?.hinhthuc || "..."}</b></div>
              </div>

              <div style={{ borderTop: '2px solid #000', marginTop: '15px', paddingTop: '10px' }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: '5px' }}>
                  <div>Học phí: <b style={{ fontWeight: 900 }}>{downloadingPayment?.hocphi} đ</b></div>
                  {/* Bỏ chữ nợ cũ ở đây theo yêu cầu */}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "950", borderTop: '2.5px solid #000', borderBottom: '2px solid #000', padding: '10px 0', marginTop: '10px', fontSize: '18pt', background: '#f8fafc' }}>
                <div style={{ color: '#000' }}>TỔNG CỘNG:</div>
                <div style={{ color: '#000' }}>{downloadingPayment?.tongcong} đ</div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14pt", marginTop: '5px' }}>
                <div>Đã đóng: <b style={{ color: '#059669' }}>{downloadingPayment?.dadong} đ</b></div>
                <div>Còn lại: <b style={{ color: '#dc2626' }}>{downloadingPayment?.conno} đ</b></div>
              </div>

              <div style={{ marginTop: '10px' }}>
                Ghi chú: {downloadingPayment?.ghichu || ""}
              </div>
            </div>
            <div style={{ marginTop: 40, fontSize: "12pt", display: "flex", justifyContent: "space-between" }}>
              <div>
                Facebook: {config?.tencongty} <br />
                SĐT/Zalo: {config?.sdtcongty}
              </div>
              <div style={{ textAlign: "center" }}>
                Nhân viên thu tiền <br /><br /><br />
                <b>{downloadingPayment?.nhanvien}</b>
              </div>
            </div>
          </div>
        </div>
      </div>

      {previewImg && (
        <div className="modal-overlay" onClick={() => setPreviewImg(null)} style={{ zIndex: 10000, position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: '15px' }}>
          <div className="modal-content animate-slide-up" onClick={e => e.stopPropagation()} style={{ padding: '20px', maxWidth: '100%', width: '450px', background: 'white', borderRadius: '12px', position: 'relative' }}>
            <button onClick={() => setPreviewImg(null)} style={{ position: 'absolute', right: 10, top: 10, border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={20} /></button>
            <p style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: '10px', color: '#0369a1', fontSize: '1rem' }}>
              NHẤN GIỮ HÌNH ĐỂ LƯU / CHIA SẺ BIÊN LAI
            </p>
            <img src={previewImg} alt="Preview Receipt" style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: '8px' }} />
            <div style={{ marginTop: '15px', textAlign: 'center' }}>
              <button onClick={() => setPreviewImg(null)} style={{ width: '100%', padding: '10px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>HOÀN TẤT</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
