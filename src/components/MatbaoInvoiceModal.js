import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FileCheck2, Settings, X, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { createMatBaoInvoice } from '../utils/matbaoService';
import { supabase, insertLog } from '../supabase';

const fCur = (val) => {
  if (val === undefined || val === null || val === '') return '0';
  const sVal = String(val).replace(/,/g, '');
  if (sVal === '-') return '-';
  const parsed = parseInt(sVal, 10);
  return isNaN(parsed) ? '0' : parsed.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const pCur = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  const sVal = String(val).replace(/,/g, '');
  if (sVal === '-') return 0;
  const parsed = parseInt(sVal, 10);
  return isNaN(parsed) ? 0 : parsed;
};

export default function MatbaoInvoiceModal({
  isOpen,
  onClose,
  initialData,
  templates = [],
  onOpenConfig,
  onSuccess
}) {
  const [invoice] = useState(initialData?.invoice || null);
  const [buyer, setBuyer] = useState(initialData?.buyer || {});
  const [items, setItems] = useState(initialData?.items || []);
  const [options, setOptions] = useState(initialData?.options || {
    mauSo: '1',
    kiHieu: 'C26TAT',
    loaiHDon: 0,
    hinhThucTT: 'TM/CK',
    ghiChu: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleBuyerChange = (field, value) => {
    setBuyer(prev => ({ ...prev, [field]: value }));
  };

  const handleItemChange = (idx, field, value) => {
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleOptionChange = (field, value) => {
    setOptions(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!invoice || loading) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await createMatBaoInvoice({
        invoice,
        buyer,
        items,
        options
      });

      setLoading(false);
      setResult(res);
      setError('');

      // Cập nhật daxuathddo trong database
      try {
        await supabase
          .from('tbl_hd')
          .update({ daxuathddo: true })
          .eq('mahd', invoice.mahd);
      } catch (dbErr) {
        console.warn('Lỗi ghi daxuathddo:', dbErr);
      }

      insertLog(`[XUẤT HĐ ĐỎ MẮT BÃO] Phiếu thu: ${invoice.mahd} | Tra cứu: ${res.maTraCuu || '_'} | Số HĐ: ${res.shDon || 0} | Ký hiệu: ${res.khhDon || '_'}`);

      if (onSuccess) {
        onSuccess(invoice.mahd, res);
      }
    } catch (err) {
      console.error('Lỗi xuất hóa đơn Mắt Bão:', err);
      setLoading(false);
      setError(err.message || 'Có lỗi xảy ra khi gọi API Mắt Bão.');
    }
  };

  const totalAmount = items.reduce((sum, it) => sum + ((Number(it.sl) || 1) * (Number(it.gia) || 0)), 0);

  return createPortal(
    <div
      className="fm-modal-overlay"
      style={{
        zIndex: 99999,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        margin: 0,
        padding: '1.5rem',
        boxSizing: 'border-box'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="fm-modal animate-slide-up"
        style={{
          maxWidth: '750px',
          width: '100%',
          maxHeight: '90vh',
          background: 'white',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
          overflow: 'hidden',
          margin: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fm-modal-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ background: '#fee2e2', color: '#dc2626', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center' }}>
              <FileCheck2 size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b', fontWeight: 800 }}>Xuất Hóa Đơn Đỏ (Mắt Bão - MIFI)</h3>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Phiếu thu: <b>{invoice?.mahd}</b> | Học sinh: <b>{buyer?.ten}</b></span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button type="button" onClick={onOpenConfig} title="Cấu hình tài khoản Mắt Bão" style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>
              <Settings size={14} /> Cấu hình API
            </button>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Báo lỗi nếu có */}
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#b91c1c', fontSize: '0.88rem' }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Lỗi xuất hóa đơn:</strong> {error}
              </div>
            </div>
          )}

          {/* Kết quả thành công nếu có */}
          {result && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '1rem', color: '#166534' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <CheckCircle2 size={20} color="#16a34a" />
                <strong style={{ fontSize: '1rem' }}>Tạo hóa đơn thành công trên hệ thống Mắt Bão!</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', fontSize: '0.88rem', marginTop: '0.5rem', background: 'white', padding: '0.75rem', borderRadius: '6px', border: '1px solid #dcfce7' }}>
                <div>Mã tra cứu: <b style={{ color: '#1e293b' }}>{result.maTraCuu}</b></div>
                <div>Mẫu số / Ký hiệu: <b>{result.khmshDon}/{result.khhDon}</b></div>
                <div>Số HĐ: <b style={{ color: '#2563eb' }}>{result.shDon || '0 (HĐ Nháp)'}</b></div>
                <div>Ngày lập: <b>{new Date(result.nLap).toLocaleDateString('vi-VN')}</b></div>
              </div>

              {result.urlDownloadPDF && (
                <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
                  <a href={result.urlDownloadPDF} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#16a34a', color: 'white', padding: '0.6rem 1rem', borderRadius: '8px', fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                    <ExternalLink size={16} /> Xem / Tải PDF Hóa Đơn Đỏ
                  </a>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} id="form-matbao-invoice">
            {/* THÔNG TIN NGƯỜI MUA / HỌC SINH */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: '#1e293b' }}>
                1. Thông tin người mua / Phụ huynh
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Tên đơn vị / Người mua (*)</label>
                  <input type="text" required value={buyer.ten || ''} onChange={e => handleBuyerChange('ten', e.target.value)} style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }} placeholder="Tên cá nhân hoặc công ty..." />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Mã số thuế (nếu xuất cty)</label>
                  <input type="text" value={buyer.mst || ''} onChange={e => handleBuyerChange('mst', e.target.value)} style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }} placeholder="VD: 0302712571" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Số điện thoại</label>
                  <input type="text" value={buyer.sdt || ''} onChange={e => handleBuyerChange('sdt', e.target.value)} style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Địa chỉ (*)</label>
                  <input type="text" required value={buyer.diachi || ''} onChange={e => handleBuyerChange('diachi', e.target.value)} style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }} placeholder="Địa chỉ giao dịch..." />
                </div>
              </div>
            </div>

            {/* DANH SÁCH DỊCH VỤ / SẢN PHẨM TRÊN HÓA ĐƠN */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#1e293b' }}>2. Chi tiết dịch vụ / Tiền học</h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Tổng cộng: <b style={{ color: '#2563eb', fontSize: '1rem' }}>{fCur(totalAmount)} ₫</b></span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#e2e8f0', color: '#334155' }}>
                      <th style={{ padding: '6px', textAlign: 'left', borderRadius: '4px 0 0 4px' }}>Nội dung</th>
                      <th style={{ padding: '6px', textAlign: 'center', width: '70px' }}>ĐVT</th>
                      <th style={{ padding: '6px', textAlign: 'center', width: '70px' }}>SL</th>
                      <th style={{ padding: '6px', textAlign: 'right', width: '120px' }}>Đơn giá</th>
                      <th style={{ padding: '6px', textAlign: 'right', width: '130px', borderRadius: '0 4px 4px 0' }}>Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.id || idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px' }}>
                          <input type="text" value={item.ten} onChange={e => handleItemChange(idx, 'ten', e.target.value)} style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }} />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input type="text" value={item.dvt} onChange={e => handleItemChange(idx, 'dvt', e.target.value)} style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem', textAlign: 'center' }} />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input type="number" min="1" value={item.sl} onChange={e => handleItemChange(idx, 'sl', parseInt(e.target.value, 10) || 1)} style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem', textAlign: 'center' }} />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input type="text" value={fCur(item.gia)} onChange={e => handleItemChange(idx, 'gia', pCur(e.target.value))} style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem', textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '6px', textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>
                          {fCur((item.sl || 1) * (item.gia || 0))} ₫
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* CẤU HÌNH PHÁT HÀNH & KÝ HIỆU */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: '#1e293b' }}>3. Tùy chọn hóa đơn</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Mẫu số (*)</label>
                  <input type="text" required value={options.mauSo} onChange={e => handleOptionChange('mauSo', e.target.value)} style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }} placeholder="VD: 1 hoặc 2" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Ký hiệu mẫu HĐ (*)</label>
                  {templates.length > 0 ? (
                    <select value={options.kiHieu} onChange={e => {
                      const tmpl = templates.find(t => t.khhDon === e.target.value);
                      handleOptionChange('kiHieu', e.target.value);
                      if (tmpl?.khmshDon) handleOptionChange('mauSo', tmpl.khmshDon);
                    }} style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}>
                      {templates.map((t, i) => (
                        <option key={i} value={t.khhDon}>{t.khhDon} - {t.thDon} (Mẫu {t.khmshDon})</option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" required value={options.kiHieu} onChange={e => handleOptionChange('kiHieu', e.target.value)} style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }} placeholder="VD: C26TAT" />
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Loại hóa đơn (*)</label>
                  <select value={options.loaiHDon} onChange={e => handleOptionChange('loaiHDon', Number(e.target.value))} style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}>
                    <option value={0}>0 - Hóa đơn nháp (Khuyên dùng)</option>
                    <option value={1}>1 - Tạo & Phát hành chính thức</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Hình thức thanh toán</label>
                  <input type="text" value={options.hinhThucTT} onChange={e => handleOptionChange('hinhThucTT', e.target.value)} style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }} placeholder="TM/CK" />
                </div>
              </div>
            </div>
          </form>
        </div>

        <div className="fm-modal-footer" style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', justifyContent: 'flex-end', background: '#f8fafc', flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: 600 }}>Đóng</button>
          <button type="submit" form="form-matbao-invoice" disabled={loading} style={{ padding: '0.6rem 1.5rem', borderRadius: '8px', border: 'none', background: '#dc2626', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', opacity: loading ? 0.7 : 1 }}>
            {loading ? (
              <>Đang tạo HĐ Mắt Bão...</>
            ) : (
              <><FileCheck2 size={16} /> Tạo Hóa Đơn Đỏ Mắt Bão</>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
