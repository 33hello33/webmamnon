import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../supabase';
import { useConfig } from '../ConfigContext';
import { BadgeDollarSign, Clock, CheckCircle } from 'lucide-react';
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

  const auth = JSON.parse(localStorage.getItem('auth_session') || '{}');
  const cashier = auth.user?.tennv || auth.user?.username || 'Thu Ngân';

  const openPaymentModal = (debtItem) => {
    setSelectedDebt(debtItem);
    setPaymentAmount('');
    setPaymentNote(`trả nợ ${debtItem.mahd}`);
    setPaymentError('');
    setPaymentSuccess('');
    setPaymentMethod(walletsConfig.length > 0 ? walletsConfig[0].name : 'Tiền mặt');
    setShowPaymentModal(true);
  };

  const handleConfirmPayment = async () => {
    const payVal = parseInt(String(paymentAmount).replace(/,/g, ''), 10);
    if (isNaN(payVal) || payVal <= 0) {
      setPaymentError('Vui lòng nhập số tiền hợp lệ lớn hơn 0');
      return;
    }

    setIsProcessing(true);
    setPaymentError('');

    try {
      const oldDebtVal = parseInt(String(selectedDebt.conno).replace(/,/g, ''), 10) || 0;
      const newConno = oldDebtVal - payVal;

      const tableName = selectedDebt.loai === 'Hóa Đơn' ? 'tbl_hd' : 'tbl_billhanghoa';
      const idField = selectedDebt.loai === 'Hóa Đơn' ? 'mahd' : 'mabill';

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

      const formatCurrency = (val) => {
        if (val === 0) return '0';
        if (!val) return '';
        return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      };

      let oldNgayBatDau = null;
      let oldNgayKetThuc = null;
      let oldSoBuoiHoc = '';

      if (selectedDebt.loai === 'Hóa Đơn') {
        const { data: oldInfo } = await supabase.from('tbl_hd')
          .select('ngaybatdau, ngayketthuc, sobuoihoc')
          .eq('mahd', selectedDebt.mahd)
          .single();

        if (oldInfo) {
          oldNgayBatDau = oldInfo.ngaybatdau;
          oldNgayKetThuc = oldInfo.ngayketthuc;
          oldSoBuoiHoc = oldInfo.sobuoihoc || '';
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
        hocphi: '0',
        giamhocphi: '0',
        phuphi: '0',
        dsphuphi: '',
        tongcong: '0',
        dadong: formatCurrency(payVal),
        conno: formatCurrency(newConno),
        hinhthuc: paymentMethod,
        ghichu: paymentNote,
        daxoa: null,
        sobuoihoc: oldSoBuoiHoc,
        malop: malop
      };

      const { error: insertErr } = await supabase.from('tbl_hd').insert([insertData]);
      if (insertErr) throw insertErr;

      setPaymentSuccess('Trả nợ thành công! Đã cập nhật hóa đơn.');
      setDebtList(prev => prev.filter(d => d.mahd !== selectedDebt.mahd));

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
        const validHd = (hdData || []).filter(h => (h.daxoa || '') !== 'Đã Xóa');
        const validBill = billData.filter(b => (b.daxoa || '') !== 'Đã Xóa');

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
              loai: 'Hóa Đơn',
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
        // Lọc các học viên không phải 'Đã Nghỉ'
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

          const latestHd = stHds[0]; // Bản ghi mới nhất của học viên đó

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
        <div className="debt-stat-card danger">
          <div className="stat-icon-box danger">
            <BadgeDollarSign size={24} />
          </div>
          <div className="stat-info">
            <label>Tổng Tiền Nợ</label>
            <div className="value">
              {debtList.reduce((sum, d) => sum + (parseInt(String(d.conno).replace(/,/g, ''), 10) || 0), 0).toLocaleString()} 
              <span>₫</span>
            </div>
          </div>
        </div>
        <div className="debt-stat-card overdue">
          <div className="stat-icon-box danger">
            <Clock size={24} />
          </div>
          <div className="stat-info">
            <label>Quá Hạn Đóng Phí</label>
            <div className="value">{overdueList.length} <span>Học viên</span></div>
          </div>
        </div>
      </div>

      <div className="debt-layout">

        {/* Table 1: Danh sách còn nợ */}
        <div className="debt-card">
          <div className="debt-header">
            <div className="debt-title">
              <BadgeDollarSign size={20} className="text-warning" />
              <h3>Danh sách học viên còn nợ</h3>
            </div>
            <span className="debt-badge warning">{debtList.length} Chứng từ</span>
          </div>
          <div className="debt-body">
            <div className="table-scroll-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mã HV</th>
                    <th>Tên Học Viên</th>
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
                        <td className="text-right font-bold text-danger">
                          {d.conno.toLocaleString()}
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
                      <td colSpan="7" className="empty-state">Tuyệt vời! Tất cả học viên đã thanh toán đủ tiền kỳ này.</td>
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
                      <span className={`status-badge ${d.loai === 'Hóa Đơn' ? 'success' : 'primary'}`}>
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
                <div className="empty-state">Không có học viên nào còn nợ tiền.</div>
              )}
            </div>
          </div>
        </div>

        {/* Table 2: Quá hạn đóng tiền */}
        <div className="debt-card">
          <div className="debt-header">
            <div className="debt-title">
              <Clock size={20} className="text-danger" />
              <h3>Báo động trễ hạn đóng học phí (Quá hạn khóa học)</h3>
            </div>
            <span className="debt-badge danger">{overdueList.length} Học viên</span>
          </div>
          <div className="debt-body">
            <div className="table-scroll-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mã HV</th>
                    <th>Tên Học Viên</th>
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
                      <td colSpan="5" className="empty-state">Rất tốt! Không có học viên nào đang học vượt khung thời gian đóng phí.</td>
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
                <div className="empty-state">Không có học viên nào quá hạn đóng phí.</div>
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
              <span style={{ color: '#64748b' }}>Học viên:</span>
              <span style={{ fontWeight: 'bold' }}>{selectedDebt.tenhv}</span>
            </div>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Lớp:</span>
              <span style={{ fontWeight: 'bold' }}>{selectedDebt.tenlop}</span>
            </div>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Mã HĐ nợ:</span>
              <span style={{ fontWeight: 'bold', color: '#ef4444' }}>{selectedDebt.mahd}</span>
            </div>
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Số tiền nợ:</span>
              <span style={{ fontWeight: 'bold', color: '#ef4444', fontSize: '1.1rem' }}>{selectedDebt.conno.toLocaleString()} ₫</span>
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
    </div>
  );
}
