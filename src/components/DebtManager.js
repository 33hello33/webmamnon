import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../supabase';
import { useConfig } from '../ConfigContext';
import { BadgeDollarSign, Clock, CheckCircle, Receipt, X } from 'lucide-react';
import { toPng } from 'html-to-image';
import './DebtManager.css';

const parseCsvCart = (csv) => {
  if (!csv) return [];
  try {
    const lines = csv.split('\n');
    if (lines.length <= 1) return []; // header only
    const items = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      // CSV simple parser (handle quotes)
      const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
      const clean = parts.map(p => p.replace(/^"|"$/g, ''));
      if (clean.length >= 6) {
        items.push({
          mahang: clean[0],
          tenhang: clean[1],
          dvt: clean[2],
          qty: parseInt(clean[3]) || 0,
          giaban: clean[4],
          thanhtien: clean[5]
        });
      }
    }
    return items;
  } catch (e) {
    console.error('Lỗi parse CSV:', e);
    return [];
  }
};

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
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Tiền mặt');
  const [downloadingInvoice, setDownloadingInvoice] = useState(null);
  const [previewImg, setPreviewImg] = useState(null);

  const auth = JSON.parse(localStorage.getItem('auth_session') || '{}');
  const cashier = auth.user?.manv || auth.user?.manv || '';

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

      // Update old record to 0 debt
      const { error: updateErr } = await supabase.from(tableName)
        .update({ conno: '0' })
        .eq(idField, selectedDebt.mahd);

      if (updateErr) throw updateErr;

      // Generate New ID based on type
      const { data: recentRecords } = await supabase.from(tableName).select(idField).order(idField, { ascending: false }).limit(1);
      let nextNum = 1;
      const idPrefix = selectedDebt.loai === 'Hóa Đơn' ? 'HD' : 'BH';
      if (recentRecords && recentRecords.length > 0) {
        const lastFullId = recentRecords[0][idField] || '';
        const numPart = lastFullId.replace(/\D/g, '');
        if (!isNaN(parseInt(numPart, 10))) nextNum = parseInt(numPart, 10) + 1;
      }
      const newMaID = `${idPrefix}${String(nextNum).padStart(5, '0')}`;

      const localNow = new Date(new Date() - new Date().getTimezoneOffset() * 60000).toISOString();

      let malop = '';
      const stClass = classes.find(c => c.tenlop === selectedDebt.tenlop);
      if (stClass) malop = stClass.malop;

      const formatCurrency = (val) => {
        if (val === 0) return '0';
        if (!val) return '';
        return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      };

      let oldThoiLuong = '';
      if (selectedDebt.loai === 'Hóa Đơn') {
        const { data: oldInfo } = await supabase.from('tbl_hd')
          .select('thoiluong')
          .eq('mahd', selectedDebt.mahd)
          .single();

        if (oldInfo) {
          oldThoiLuong = oldInfo.thoiluong || '';
        }
      }

      let insertErr = null;
      if (selectedDebt.loai === 'Hóa Đơn') {
        const insertData = {
          mahd: newMaID,
          ngaylap: localNow,
          mahv: selectedDebt.mahv,
          tenlop: selectedDebt.tenlop || '',
          nhanvien: cashier,
          hocphi: '0',
          giamhocphi: '0',
          tongcong: '0',
          dadong: formatCurrency(payVal),
          conno: formatCurrency(newConno),
          hinhthuc: paymentMethod,
          ghichu: paymentNote,
          daxoa: null,
          thoiluong: oldThoiLuong,
          malop: malop
        };
        const res = await supabase.from('tbl_hd').insert([insertData]);
        insertErr = res.error;
      } else {
        const insertData = {
          mabill: newMaID,
          ngaylap: localNow,
          mahv: selectedDebt.mahv,
          hanghoa: selectedDebt.hanghoa || '', // Keep items info for the new record
          nhanvien: cashier,
          chietkhau: '0',
          tongcong: '0',
          dadong: formatCurrency(payVal),
          conno: formatCurrency(newConno),
          noidung: paymentNote,
          daxoa: null,
          loinhuan: '0',
          hinhthuc: paymentMethod,
          daxacnhan: true
        };
        const res = await supabase.from('tbl_billhanghoa').insert([insertData]);
        insertErr = res.error;
      }

      if (insertErr) throw insertErr;

      setPaymentSuccess('Trả nợ thành công! ' + (selectedDebt.loai === 'Hóa Đơn' ? 'Đã tạo hóa đơn HD...' : 'Đã tạo bill BH...'));
      setDebtList(prev => prev.filter(d => d.mahd !== selectedDebt.mahd));

      // Trigger auto download
      const targetStudent = students.find(s => s.mahv === selectedDebt.mahv) || {};
      setDownloadingInvoice({
        loai: selectedDebt.loai,
        mahd: newMaID,
        ngaylap: localNow,
        tenhv: selectedDebt.tenhv,
        sdt: targetStudent.sdt || '',
        tenlop: selectedDebt.tenlop || '',
        hocphi: '0',
        giamhocphi: '0',
        tongcong: formatCurrency(payVal + newConno),
        dadong: formatCurrency(payVal),
        conno: formatCurrency(newConno),
        hinhthuc: paymentMethod,
        ghichu: paymentNote,
        nhanvien: cashier,
        thoiluong: oldThoiLuong,
        nocu: formatCurrency(oldDebtVal),
        monthlyMealFee: 0,
        phuthu: [],
        deductionSum: 0,
        mabill: newMaID,
        cart: parseCsvCart(selectedDebt.hanghoa),
        tongcong_num: payVal + newConno
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
    if (downloadingInvoice) {
      const processPng = async () => {
        try {
          await new Promise(r => setTimeout(r, 1200));
          const nodeId = downloadingInvoice.loai === 'Hóa Đơn' ? 'download-invoice-node' : 'pos-print-temp';
          const node = document.getElementById(nodeId);
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
            await new Promise(r => setTimeout(r, 600));

            const dataUrl = await toPng(node, { cacheBust: true, backgroundColor: '#ffffff' });

            node.style.position = 'static';
            node.style.opacity = '0.01';

            if (window.innerWidth <= 991) {
              setPreviewImg(dataUrl);
            } else {
              const link = document.createElement('a');
              const fileNamePrefix = downloadingInvoice.loai === 'Hóa Đơn' ? 'BienLai_TraNo' : 'Bill_TraNo';
              link.download = `${fileNamePrefix}_${downloadingInvoice.tenhv}_${downloadingInvoice.mahd}.png`;
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
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: classData } = await supabase.from('tbl_lop').select('malop, tenlop');
        const cMap = classData || [];
        setClasses(cMap);

        const { data: stdRaw } = await supabase.from('tbl_hv').select('*');
        const studentsList = (stdRaw || []).map(s => {
          // Normalize keys to lowercase for robust access
          const normalized = {};
          Object.keys(s).forEach(key => {
            normalized[key.toLowerCase()] = s[key];
          });
          return {
            ...normalized,
            mahv: normalized.mahv || normalized.mahv,
            tenhv: normalized.tenhv || '',
            malop_list: normalized.malop ? [normalized.malop] : []
          };
        });
        setStudents(studentsList);

        // Fetch Hợp Đồng (HD)
        const { data: hdData } = await supabase.from('tbl_hd')
          .select('mahd, mahv, conno, tenlop, daxoa, ngaylap, ngayketthuc');

        // Fetch Bill Hàng Hóa (Cho dù bảng chưa tạo cũng sẽ không crash hệ thống)
        let billData = [];
        const { data: bData, error } = await supabase.from('tbl_billhanghoa')
          .select('mabill, mahv, conno, daxoa, hanghoa, noidung');
        if (!error && bData) billData = bData;

        // Remove 'Đã Xóa' as requested
        const validHd = (hdData || []).filter(h => (h.daxoa || '') !== 'Đã Xóa');
        const validBill = billData.filter(b => (b.daxoa || '') !== 'Đã Xóa');

        const parseCur = (v) => parseInt(String(v || '0').replace(/,/g, ''), 10) || 0;
        const formatCur = (val) => {
          const num = parseCur(val);
          return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        };

        // BẢNG 1: Tổng Hợp Danh Sách Còn Nợ
        const mergedTemp = [];
        validHd.forEach(hd => {
          const debtNum = parseCur(hd.conno);
          if (debtNum > 0) {
            const currentMaHV = String(hd.mahv || '').trim().toLowerCase();
            const std = studentsList.find(s => String(s.mahv || '').trim().toLowerCase() === currentMaHV) || {};

            mergedTemp.push({
              mahv: hd.mahv,
              tenhv: std.tenhv || 'Không rõ',
              conno: formatCur(hd.conno),
              tenlop: hd.tenlop || '',
              loai: 'Hóa Đơn',
              mahd: hd.mahd
            });
          }
        });

        validBill.forEach(bill => {
          const debtNum = parseCur(bill.conno);
          if (debtNum > 0) {
            const currentMaHV = String(bill.mahv || '').trim().toLowerCase();
            const std = studentsList.find(s => String(s.mahv || '').trim().toLowerCase() === currentMaHV) || {};

            let tenLopBill = '';
            if (std.malop_list && std.malop_list.length > 0) {
              const firstMalop = std.malop_list[0];
              const stClass = cMap.find(c => c.malop === firstMalop);
              if (stClass) tenLopBill = stClass.tenlop;
            }

            mergedTemp.push({
              mahv: bill.mahv,
              tenhv: std.tenhv || 'Không rõ',
              conno: formatCur(bill.conno),
              tenlop: tenLopBill,
              loai: 'Bill Hàng',
              mahd: bill.mabill,
              hanghoa: bill.hanghoa,
              noidung: bill.noidung
            });
          }
        });

        setDebtList(mergedTemp);

        // BẢNG 2: Danh Sách Quá Hạn Đóng Tiền
        const overdueTemp = [];
        // Lọc các học sinh không phải 'Đã Nghỉ'
        const activeStudents = studentsList.filter(s => (s.trangthai || '') !== 'Đã Nghỉ');

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
        <div className="debt-stat-card danger">
          <div className="stat-icon-box danger">
            <BadgeDollarSign size={24} />
          </div>
          <div className="stat-info">
            <label>Tổng Tiền Nợ</label>
            <div className="value">
              {debtList.reduce((sum, d) => sum + (parseInt(String(d.conno).replace(/,/g, ''), 10) || 0), 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
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
                        <td className="text-right font-bold text-danger">
                          {d.conno}
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
                        <span className="debt-amount">{d.conno} ₫</span>
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
              <h3>Báo động trễ hạn đóng học phí (Quá hạn khóa học)</h3>
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

      {/* SUCCESS MODAL / PREVIEW FOR MOBILE */}
      {previewImg && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '10px', maxWidth: '100%', maxHeight: '80vh', overflow: 'auto', marginBottom: '15px' }}>
            <img src={previewImg} alt="Preview Invoice" style={{ width: '100%', height: 'auto', display: 'block' }} />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
               onClick={() => setPreviewImg(null)}
               style={{ padding: '12px 24px', borderRadius: '8px', background: '#fff', color: '#333', fontWeight: 600, border: 'none', cursor: 'pointer' }}
            >
               Đóng
            </button>
            <a
               href={previewImg}
               download={`BienLai_${selectedDebt?.tenhv}.png`}
               style={{ padding: '12px 24px', borderRadius: '8px', background: '#3b82f6', color: '#fff', fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}
            >
               Tải xuống
            </a>
          </div>
        </div>
      )}

      {/* HIDDEN TEMPLATE FOR INVOICE PNG EXPORT (Same as InvoiceManager) */}
      <div style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', overflow: 'hidden', opacity: 0.01, zIndex: -100, pointerEvents: 'none', background: '#ffffff' }}>
        <div id="download-invoice-node" style={{ position: 'relative', overflow: 'hidden', padding: '30px', background: 'white', color: '#000', width: '800px', fontFamily: 'Arial, sans-serif' }}>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ width: '180px', textAlign: 'left' }}>
                {config?.logo && <img crossOrigin="anonymous" src={config.logo} alt="logo" style={{ maxWidth: '160px', maxHeight: '160px', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                {!config?.logo && <div style={{ height: 20 }}></div>}
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, textTransform: 'uppercase' }}>
                  {config?.tencongty || 'Tên Công Ty'}
                </h2>
                <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Địa chỉ: {config?.diachicongty}</p>
              </div>
              <div style={{ width: '150px', textAlign: 'right', fontSize: '14px' }}>
                <div>Mã HĐ: <b style={{ fontWeight: 950 }}>{downloadingInvoice?.mahd}</b></div>
                <div>Ngày lập: <span style={{ fontWeight: 600 }}>{downloadingInvoice ? new Date(downloadingInvoice.ngaylap).toLocaleDateString("vi-VN") : ""}</span></div>
              </div>
            </div>
            <div style={{ textAlign: "center", fontWeight: "950", fontSize: "20pt", margin: "15px 0", color: '#000', textTransform: 'uppercase', textDecoration: 'underline' }}>
              BIÊN LAI THU HỌC PHÍ (THANH TOÁN NỢ)
            </div>
            <div style={{ fontSize: "14pt", lineHeight: "1.8", margin: '20px 0' }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: '5px' }}>
                <div>Họ và tên: <b>{downloadingInvoice?.tenhv}</b></div>
                <div>SĐT: <b>{downloadingInvoice?.sdt || ""}</b></div>
              </div>
              <div>Khóa học: <b>{downloadingInvoice?.tenlop}</b></div>
              <div>
                Tháng đóng học phí/Thời lượng: <b>{downloadingInvoice?.thoiluong || "..."}</b>
              </div>
              <div style={{ marginTop: '5px' }}>
                Hình thức đóng tiền: <b>{downloadingInvoice?.hinhthuc || "..."}</b>
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '15px 0' }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>Số tiền trả nợ: <b style={{ fontSize: '16pt', color: '#059669' }}>{downloadingInvoice?.dadong} đ</b></div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: '10px' }}>
                <div>Dư nợ trước trả: <b>{downloadingInvoice?.nocu} đ</b></div>
                <div>Còn nợ sau trả: <b style={{ color: '#dc2626' }}>{downloadingInvoice?.conno} đ</b></div>
              </div>
              <div style={{ marginTop: '10px' }}>
                Ghi chú: {downloadingInvoice?.ghichu || ""}
              </div>
            </div>
            <div style={{ marginTop: 40, fontSize: "12pt", display: "flex", justifyContent: "space-between" }}>
              <div>
                Facebook: {config?.tencongty} <br />
                SĐT/Zalo: {config?.sdtcongty}
              </div>
              <div style={{ textAlign: "center" }}>
                Nhân viên thu tiền <br /><br /><br />
                <b>{downloadingInvoice?.nhanvien}</b>
              </div>
            </div>
            <div style={{ marginTop: "30px", textAlign: "center", fontStyle: "italic", borderTop: '1px dashed #ccc', paddingTop: '10px', fontSize: '10pt' }}>
              Lưu ý: Hóa đơn này có giá trị xác nhận việc đóng phí. Vui lòng giữ lại để đối chiếu khi cần thiết.
            </div>
          </div>
        </div>
      </div>

      {/* HIDDEN TEMPLATE FOR BILL HANG HOA PNG EXPORT (Same as SalesPOS) */}
      <div style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', overflow: 'hidden', opacity: 0.01, zIndex: -100, pointerEvents: 'none', background: '#ffffff' }}>
        <div id="pos-print-temp" style={{ position: 'relative', overflow: 'hidden', padding: '30px', background: 'white', color: '#000', width: '800px', fontFamily: 'Arial, sans-serif' }}>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0 }}>{config?.tencongty || 'Tên Công Ty'}</h3>
                <p style={{ margin: '4px 0' }}>ĐC: {config?.diachicongty}</p>
                <p style={{ margin: '4px 0' }}>SĐT: {config?.sdtcongty}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>Mã Bill: <b>{downloadingInvoice?.mahd || '...'}</b></div>
                <div>Ngày lập: {downloadingInvoice ? new Date(downloadingInvoice.ngaylap).toLocaleDateString('vi-VN') : '...'}</div>
                {config?.logo && <img src={config.logo} alt="logo" crossOrigin="anonymous" style={{ width: 80, marginTop: 5 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                {!config?.logo && <div style={{ height: 20 }}></div>}
              </div>
            </div>

            <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "18pt", margin: "10px 0" }}>
              BIÊN LAI BÁN HÀNG (THANH TOÁN NỢ)
            </div>

            <div style={{ fontSize: "13pt", lineHeight: "1.8", marginBottom: '15px' }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>Họ và tên: <b>{downloadingInvoice?.tenhv || 'Khách vãng lai'}</b></div>
                <div>SĐT: <b>{downloadingInvoice?.sdt || "_"}</b></div>
              </div>
            </div>

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
                {downloadingInvoice?.cart?.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px' }}>{c.tenhang}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>{c.qty}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{c.giaban}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>{c.thanhtien}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: '15px', padding: '12px 0', borderTop: '2.5px solid #333', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12pt" }}>
                <div>Nợ trước trả: <b>{downloadingInvoice?.nocu} đ</b></div>
                <div>Tổng bill: <b style={{ fontSize: '14pt' }}>{downloadingInvoice?.tongcong} đ</b></div>
                <div style={{ color: '#0ea5e9', fontWeight: 'bold' }}>Hình thức: {downloadingInvoice?.hinhthuc}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5pt", paddingTop: '8px', borderTop: '1px dashed #ddd', fontWeight: 'bold' }}>
                <div style={{ color: '#16a34a' }}>Đã trả: {downloadingInvoice?.dadong} đ</div>
                <div style={{ color: (parseInt(String(downloadingInvoice?.conno).replace(/\D/g, '')) > 0 ? '#ef4444' : '#16a34a') }}>
                  Nợ còn lại: {downloadingInvoice?.conno} đ
                </div>
              </div>
            </div>

            <div style={{ marginTop: 40, fontSize: "12pt", display: "flex", justifyContent: "space-between" }}>
              <div>
                Facebook: {config?.tencongty} <br />
                SĐT/Zalo: {config?.sdtcongty}
              </div>
              <div style={{ textAlign: "center" }}>
                Nhân viên thu tiền <br /><br /><br />
                <b>{downloadingInvoice?.nhanvien}</b>
              </div>
            </div>

            <div style={{ marginTop: "30px", textAlign: "center", fontStyle: "italic", borderTop: '1px dashed #ccc', paddingTop: '10px', fontSize: '10pt' }}>
              Cảm ơn quý khách đã tin dùng dịch vụ của chúng tôi!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
