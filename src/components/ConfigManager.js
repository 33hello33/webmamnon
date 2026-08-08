import React, { useState, useEffect } from 'react';
import { supabase, insertLog, SUPABASE_SCHEMA } from '../supabase';
import { uploadToR2 } from '../utils/cloudflareR2';
import { createPortal } from 'react-dom';
import { useConfig } from '../ConfigContext';
import { DEFAULT_CONSECUTIVE_REFUND_CONFIG, normalizeConsecutiveRefundConfig } from '../utils/consecutiveLeaveRefund';
import { normalizeLateFeeConfig } from '../utils/lateFeeConfig';
import HolidayManager from './HolidayManager';
import {
  Save,
  Upload,
  Globe,
  Building2,
  Wallet,
  ListChecks,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  DollarSign,
  Cloud,
  ExternalLink,
  FileJson,
  RefreshCw,
  Key,
  Plus,
  LayoutDashboard,
  MessageSquare,
  BarChart3,
  Briefcase,
  Users,
  CalendarDays
} from 'lucide-react';
import './ConfigManager.css';

const formatCurrency = (val) => {
  if (!val && val !== 0) return '';
  return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const ROLES = ['Quản lý', 'Nhân viên VP'];
const TAB_OPTIONS = [
  { id: 'statistics', label: 'Thống kê' },
  { id: 'chat', label: 'Phụ huynh' },
  { id: 'finances', label: 'Quản lý thu chi' },
  { id: 'invoices', label: 'Thu học phí' },
  { id: 'sales', label: 'Bán hàng' },
  { id: 'timesheet', label: 'Chấm công' },
  { id: 'employees', label: 'Nhân viên' },
  { id: 'tasks', label: 'Công việc' },
  { id: 'debts', label: 'Quản lý nợ' },
  { id: 'students', label: 'Quản lý lớp học' },
  { id: 'export_excel', label: 'Xuất Excel (Quyền)' }
];

const ConfigManager = () => {
  const { config, refreshConfig } = useConfig();
  const [formData, setFormData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [isTruTienAnModalOpen, setIsTruTienAnModalOpen] = useState(false);
  const [isNghiLienTiepModalOpen, setIsNghiLienTiepModalOpen] = useState(false);
  const [syncingSecrets, setSyncingSecrets] = useState(false);

  useEffect(() => {
    if (config) {
      setFormData({
        ...config,
        hangmucthu: Array.isArray(config.hangmucthu) ? config.hangmucthu.join('\n') : '',
        hangmucchi: Array.isArray(config.hangmucchi) ? config.hangmucchi.join('\n') : '',
        phanquyenrole: config.phanquyenrole || {
          'Quản lý': { full: true },
          'Nhân viên VP': { full: false, tabs: [] }
        },
        tinhhocphi: config.tinhhocphi || {
          available: ['khoa', 'buoi', 'thang'],
          selected: ['khoa', 'buoi', 'thang']
        },
        cotdiemdanh: config.cotdiemdanh || {
          available: ['comat', 'vangP', 'vangKP', 'traTre1', 'traTre2', 'traTre3'],
          selected: ['comat', 'vangP', 'vangKP']
        },
        nghilientiep: normalizeConsecutiveRefundConfig(config.nghilientiep, config),
        tientratre: normalizeLateFeeConfig(config.tientratre),
        trutienan: typeof config.trutienan === 'string' && config.trutienan.trim().startsWith('{') ? JSON.parse(config.trutienan) : config.trutienan,
        tiendangoai: config.tiendangoai || '0',
        xinnghitruocmaygio: config.xinnghitruocmaygio || '08:00'
      });
    }
  }, [config]);



  if (!formData) return <div className="loading-state"><Loader2 className="spinner" /> Đang tải cấu hình...</div>;

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: '', text: '' });

    const payload = {
      ...formData,
      hangmucthu: formData.hangmucthu.split('\n').map(s => s.trim()).filter(s => s),
      hangmucchi: formData.hangmucchi.split('\n').map(s => s.trim()).filter(s => s),
      sonhanvientrogiang: Math.max(0, Math.min(3, parseInt(formData.sonhanvientrogiang) || 0)),
      ngayquahan: Math.max(0, parseInt(formData.ngayquahan) || 0),
      nghilientiep: normalizeConsecutiveRefundConfig(formData.nghilientiep, formData),
      tientratre: formData.tientratre
    };

    try {
      const { data: existing } = await supabase.from('tbl_config').select('id').single();
      let error;
      if (existing) {
        ({ error } = await supabase.from('tbl_config').update(payload).eq('id', existing.id));
      } else {
        ({ error } = await supabase.from('tbl_config').insert([payload]));
      }

      if (error) throw error;



      setMsg({ type: 'success', text: 'Đã lưu cấu hình hệ thống thành công!' });
      insertLog(`[CẤU HÌNH] Cập nhật tham số hệ thống`);
      refreshConfig();
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: 'Lỗi khi lưu cấu hình: ' + err.message });
    }
    setLoading(false);
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.png')) {
      return setMsg({ type: 'error', text: 'Vui lòng chỉ upload file PNG.' });
    }

    try {
      const fileName = `${SUPABASE_SCHEMA}/config/logo_${Date.now()}.png`;
      let logoUrl = '';
      let r2Success = false;

      if (config?.r2_endpoint && config?.r2_access_key_id && config?.r2_secret_access_key && config?.r2_bucket_name) {
        try {
          logoUrl = await uploadToR2(
            file,
            config.r2_endpoint,
            config.r2_access_key_id,
            config.r2_secret_access_key,
            config.r2_bucket_name,
            config.r2_public_url,
            { key: fileName }
          );
          if (logoUrl) r2Success = true;
        } catch (r2Err) {
          console.warn('R2 logo upload failed, falling back to Supabase Storage:', r2Err);
        }
      }

      if (!r2Success) {
        const { error } = await supabase.storage.from('assets').upload(fileName, file);

        if (error) {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = async () => {
            setFormData({ ...formData, logo: reader.result, appleicon: reader.result });
            setMsg({ type: 'success', text: 'Đã cập nhật Logo (Local Base64).' });
          };
          return;
        }

        const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(fileName);
        logoUrl = publicUrl;
      }

      setFormData({ ...formData, logo: logoUrl, appleicon: logoUrl });
      setMsg({ type: 'success', text: 'Đã tải lên logo mới thành công!' });
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: 'Lỗi upload: ' + err.message });
    }
  };

  const togglePermission = (role, tabId) => {
    const pq = { ...formData.phanquyenrole };
    if (!pq[role]) pq[role] = { full: false, tabs: [] };

    if (pq[role].tabs.includes(tabId)) {
      pq[role].tabs = pq[role].tabs.filter(id => id !== tabId);
    } else {
      pq[role].tabs = [...pq[role].tabs, tabId];
    }
    setFormData({ ...formData, phanquyenrole: pq });
  };

  const toggleFull = (role) => {
    const pq = { ...formData.phanquyenrole };
    if (!pq[role]) pq[role] = { full: false, tabs: [] };
    pq[role].full = !pq[role].full;
    setFormData({ ...formData, phanquyenrole: pq });
  };

  const handleToggleTinhHocPhi = (val) => {
    const thp = { ...formData.tinhhocphi };
    if (!thp.selected) thp.selected = [];

    if (thp.selected.includes(val)) {
      thp.selected = thp.selected.filter(i => i !== val);
    } else {
      thp.selected = [...thp.selected, val];
    }
    setFormData({ ...formData, tinhhocphi: thp });
  };

  const handleToggleCotDiemDanh = (val) => {
    const cdd = { ...formData.cotdiemdanh };
    if (!cdd.selected) cdd.selected = [];

    if (cdd.selected.includes(val)) {
      cdd.selected = cdd.selected.filter(i => i !== val);
    } else {
      cdd.selected = [...cdd.selected, val];
    }
    setFormData({ ...formData, cotdiemdanh: cdd });
  };

  const trutienanTiers = (typeof formData.trutienan === 'object' && formData.trutienan !== null) ? formData.trutienan : {};
  const consecutiveRefundConfig = normalizeConsecutiveRefundConfig(formData.nghilientiep, formData);

  const handleAddConsecutiveRefundTier = () => {
    const newTiers = { ...consecutiveRefundConfig };
    const existingKeys = Object.keys(newTiers)
      .map((key) => parseInt(key, 10))
      .filter((key) => Number.isFinite(key) && key > 0)
      .sort((left, right) => left - right);
    let nextKey = existingKeys.length > 0 ? existingKeys[existingKeys.length - 1] + 1 : 6;
    while (newTiers[String(nextKey)]) {
      nextKey += 1;
    }
    newTiers[String(nextKey)] = { phantramgiam: 0 };
    setFormData({ ...formData, nghilientiep: newTiers });
  };

  const handleUpdateConsecutiveRefundTier = (oldKey, newKey, percent) => {
    const newTiers = { ...consecutiveRefundConfig };
    const previous = newTiers[oldKey];
    const parsedNewKey = parseInt(String(newKey).replace(/\D/g, ''), 10);
    const safeKey = Number.isFinite(parsedNewKey) && parsedNewKey > 0 ? String(parsedNewKey) : oldKey;
    delete newTiers[oldKey];
    newTiers[safeKey] = {
      phantramgiam: Math.max(0, Math.min(100, parseInt(percent, 10) || 0)),
      ...(previous && typeof previous === 'object' ? previous : {})
    };
    newTiers[safeKey].phantramgiam = Math.max(0, Math.min(100, parseInt(percent, 10) || 0));
    setFormData({
      ...formData,
      nghilientiep: newTiers
    });
  };

  const handleRemoveConsecutiveRefundTier = (key) => {
    const newTiers = { ...consecutiveRefundConfig };
    delete newTiers[key];
    setFormData({
      ...formData,
      nghilientiep: Object.keys(newTiers).length > 0 ? newTiers : DEFAULT_CONSECUTIVE_REFUND_CONFIG
    });
  };

  const handleAddTier = () => {
    const newTiers = { ...trutienanTiers };
    newTiers["0"] = { tru_nghi: 0 };
    setFormData({ ...formData, trutienan: newTiers });
  };

  const handleUpdateTier = (oldKey, newKey, truNghi) => {
    const newTiers = { ...trutienanTiers };
    const val = newTiers[oldKey];
    delete newTiers[oldKey];
    newTiers[newKey] = { tru_nghi: parseInt(truNghi) || 0 };
    setFormData({ ...formData, trutienan: newTiers });
  };

  const handleRemoveTier = (key) => {
    const newTiers = { ...trutienanTiers };
    delete newTiers[key];
    setFormData({ ...formData, trutienan: newTiers });
  };



  const renderTruTienAnModal = () => {
    if (!isTruTienAnModalOpen) return null;

    return createPortal(
      <div className="config-modal-overlay">
        <div className="config-modal">
          <div className="modal-header">
            <h3>Cấu hình mức trừ tiền ăn</h3>
            <button type="button" className="btn-close" onClick={() => setIsTruTienAnModalOpen(false)}>×</button>
          </div>
          <div className="modal-body">
            <p className="hint" style={{ marginBottom: '1rem', color: 'black' }}>
              Thiết lập số tiền hoàn trả (trừ) mỗi ngày nghỉ có phép dựa trên mức học phí tháng.
              Ví dụ: Nếu tiền ăn là 650,000đ thì trừ 20,000đ/ngày.
            </p>
            <div className="tier-list">
              <div className="tier-header">
                <span>Mức tiền ăn (VNĐ)</span>
                <span>Tiền trừ/ngày (VNĐ)</span>
                <span></span>
              </div>
              {Object.entries(trutienanTiers).map(([key, val]) => (
                <div key={key} className="tier-item">
                  <input
                    type="text"
                    value={formatCurrency(key)}
                    onChange={(e) => handleUpdateTier(key, e.target.value.replace(/,/g, ''), val.tru_nghi)}
                    placeholder="VD: 650000"
                  />
                  <input
                    type="text"
                    value={formatCurrency(val.tru_nghi)}
                    onChange={(e) => handleUpdateTier(key, key, e.target.value.replace(/,/g, ''))}
                    placeholder="VD: 20000"
                  />
                  <button type="button" className="btn-remove-tier" onClick={() => handleRemoveTier(key)}>×</button>
                </div>
              ))}
              <button type="button" className="btn-add-tier" onClick={handleAddTier}>
                <Plus size={16} /> Thêm mức mới
              </button>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-confirm" onClick={() => setIsTruTienAnModalOpen(false)}>Xong</button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const renderNghiLienTiepModal = () => {
    if (!isNghiLienTiepModalOpen) return null;

    return createPortal(
      <div className="config-modal-overlay">
        <div className="config-modal">
          <div className="modal-header">
            <h3>Cấu hình hoàn học phí liên tiếp</h3>
            <button type="button" className="btn-close" onClick={() => setIsNghiLienTiepModalOpen(false)}>×</button>
          </div>
          <div className="modal-body">
            <p className="hint" style={{ marginBottom: '1rem', color: 'black' }}>
              Thiết lập các mức hoàn học phí theo số ngày nghỉ phép liên tiếp.
              Hệ thống sẽ chọn mức cao nhất phù hợp cho từng đợt nghỉ.
            </p>
            <div className="tier-list">
              <div className="tier-header">
                <span>Số ngày nghỉ</span>
                <span>Giảm (%)</span>
                <span></span>
              </div>
              {Object.entries(consecutiveRefundConfig).map(([key, val]) => (
                <div key={key} className="tier-item">
                  <input
                    type="number"
                    min="1"
                    value={key}
                    onChange={(e) => handleUpdateConsecutiveRefundTier(key, e.target.value.replace(/\D/g, ''), val?.phantramgiam)}
                    placeholder="VD: 6"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={val?.phantramgiam || 0}
                    onChange={(e) => handleUpdateConsecutiveRefundTier(key, key, e.target.value)}
                    placeholder="VD: 30"
                  />
                  <button type="button" className="btn-remove-tier" onClick={() => handleRemoveConsecutiveRefundTier(key)}>×</button>
                </div>
              ))}
              <button type="button" className="btn-add-tier" onClick={handleAddConsecutiveRefundTier}>
                <Plus size={16} /> Thêm mức mới
              </button>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-confirm" onClick={() => setIsNghiLienTiepModalOpen(false)}>Xong</button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <div className="config-manager">
      <div className="config-header">
        <div className="h-left">
          <ShieldCheck size={28} className="text-primary" />
          <div>
            <h2>Cấu hình Hệ thống</h2>
            <p>Dành cho Quản trị viên - Thiết lập thương hiệu & phân quyền</p>
          </div>
        </div>
        <button onClick={handleSave} className="btn-save" disabled={loading}>
          {loading ? <Loader2 size={18} className="spinner" /> : <Save size={18} />}
          <span>Lưu thay đổi</span>
        </button>
      </div>

      {msg.text && (
        <div className={`config-alert ${msg.type}`}>
          {msg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{msg.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="config-body">
        {/* Row 1: Brand & Logo */}
        <section className="config-section main-row">
          <div className="section-title">
            <Globe size={20} />
            <h3>Nhận diện Thương hiệu</h3>
          </div>
          <div className="brand-grid">
            <div className="logo-upload-group" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <div className="logo-upload">
                <label>Logo Web (Favicon, Apple Touch Icon & Sidebar)</label>
                <div className="logo-preview-box">
                  {formData.logo ? <img src={formData.logo} alt="Preview" /> : <div className="no-img">No Logo</div>}
                  <div className="upload-overlay">
                    <Upload size={24} />
                    <input type="file" accept="image/png" onChange={handleLogoUpload} />
                  </div>
                </div>
                <p className="hint">Chỉ chấp nhận .png | Max 2MB</p>
              </div>
            </div>
            <div className="form-fields">
              <div className="form-group">
                <label>Tên Website</label>
                <input type="text" value={formData.tenweb} onChange={e => setFormData({ ...formData, tenweb: e.target.value })} placeholder="VD: EASY4SCHOOL" />
              </div>
              <div className="form-group">
                <label>Mô tả Website (Meta Desc)</label>
                <input type="text" value={formData.motaweb} onChange={e => setFormData({ ...formData, motaweb: e.target.value })} placeholder="VD: Hệ thống quản lý trung tâm ngoại ngữ..." />
              </div>
            </div>
          </div>
        </section>

        {/* Row 2: Company Info */}
        <section className="config-section">
          <div className="section-title">
            <Building2 size={20} />
            <h3>Thông tin Công ty</h3>
          </div>
          <div className="company-grid">
            <div className="form-group">
              <label>Tên Công ty (In trên phiếu)</label>
              <input type="text" value={formData.tencongty} onChange={e => setFormData({ ...formData, tencongty: e.target.value })} placeholder="VD: CÔNG TY TNHH ABC" />
            </div>
            <div className="form-group">
              <label>Địa chỉ</label>
              <input type="text" value={formData.diachicongty} onChange={e => setFormData({ ...formData, diachicongty: e.target.value })} placeholder="Số nhà, đường, quận..." />
            </div>
            <div className="form-group">
              <label>Số điện thoại</label>
              <input type="text" value={formData.sdtcongty} onChange={e => setFormData({ ...formData, sdtcongty: e.target.value })} placeholder="0xxx.xxx.xxx" />
            </div>
            <div className="form-group">
              <label>Số Giáo viên tối đa (1-3)</label>
              <input type="number" min="1" max="3" value={formData.sonhanvientrogiang} onChange={e => setFormData({ ...formData, sonhanvientrogiang: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Gia hạn thêm (Số ngày quá hạn)</label>
              <input type="number" min="0" value={formData.ngayquahan || 0} onChange={e => setFormData({ ...formData, ngayquahan: e.target.value })} />
            </div>
          </div>
        </section>

        {/* Row 2.5: Cloudflare R2 Config */}
        <section className="config-section">
          <div className="section-title">
            <Cloud size={20} />
            <h3>Cloud Storage (Cloudflare R2)</h3>
            <div className="status-badge" style={{ marginLeft: 'auto', background: formData.r2_enabled ? '#dcfce7' : '#f3f4f6', color: formData.r2_enabled ? '#166534' : '#6b7280', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
              {formData.r2_enabled ? 'Đã kích hoạt' : 'Chưa kích hoạt'}
            </div>
          </div>
          <div className="gdrive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '10px 15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ padding: '8px', background: formData.r2_enabled ? '#dcfce7' : '#f1f5f9', borderRadius: '6px', color: formData.r2_enabled ? '#16a34a' : '#64748b' }}>
                    <Cloud size={20} />
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, display: 'block' }}>Kích hoạt lưu trữ Cloudflare R2</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Tải hình ảnh, tệp tin trực tiếp lên R2 tương thích S3 thay vì Supabase</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={formData.r2_enabled}
                  onChange={e => setFormData({ ...formData, r2_enabled: e.target.checked })}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
              </label>
            </div>

            {formData.r2_enabled && (
              <>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>R2 Endpoint URL</label>
                  <input
                    type="text"
                    value={formData.r2_endpoint || ''}
                    onChange={e => setFormData({ ...formData, r2_endpoint: e.target.value })}
                    placeholder="VD: https://<account_id>.r2.cloudflarestorage.com"
                  />
                </div>
                <div className="form-group">
                  <label>Access Key ID</label>
                  <input
                    type="text"
                    value={formData.r2_access_key_id || ''}
                    onChange={e => setFormData({ ...formData, r2_access_key_id: e.target.value })}
                    placeholder="Nhập Access Key ID"
                  />
                </div>
                <div className="form-group">
                  <label>Secret Access Key</label>
                  <input
                    type="password"
                    value={formData.r2_secret_access_key || ''}
                    onChange={e => setFormData({ ...formData, r2_secret_access_key: e.target.value })}
                    placeholder="Nhập Secret Access Key"
                  />
                </div>
                <div className="form-group">
                  <label>Bucket Name</label>
                  <input
                    type="text"
                    value={formData.r2_bucket_name || ''}
                    onChange={e => setFormData({ ...formData, r2_bucket_name: e.target.value })}
                    placeholder="VD: my-storage-bucket"
                  />
                </div>
                <div className="form-group">
                  <label>Public URL Mặc định (Custom Domain)</label>
                  <input
                    type="text"
                    value={formData.r2_public_url || ''}
                    onChange={e => setFormData({ ...formData, r2_public_url: e.target.value })}
                    placeholder="VD: https://media.example.com"
                  />
                  <p className="hint" style={{ marginTop: '5px' }}>
                    * Link kết nối tới domain truy cập công khai của Bucket.
                  </p>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Row 3: Wallets */}
        {formData.hienvithuchi && (
          <section className="config-section">
            <div className="section-title">
              <Wallet size={20} />
              <h3>Cấu hình Thanh toán (QR VietQR)</h3>
            </div>
            <div className="wallets-grid">
              {[1, 2, 3, 4].map(num => {
                const viKey = `vi${num}`;
                const vi = formData[viKey] || {};
                return (
                  <div key={viKey} className="wallet-card">
                    <div className="w-header">Ví / Ngân hàng {num}</div>
                    <div className="w-body">
                      <input type="text" placeholder="Tên hiển thị" value={vi.name || ''} onChange={e => setFormData({ ...formData, [viKey]: { ...vi, name: e.target.value } })} />
                      <input type="text" placeholder="Bank ID (Bin)" value={vi.bankId || ''} onChange={e => setFormData({ ...formData, [viKey]: { ...vi, bankId: e.target.value } })} />
                      <input type="text" placeholder="Số tài khoản" value={vi.accNo || ''} onChange={e => setFormData({ ...formData, [viKey]: { ...vi, accNo: e.target.value } })} />
                      <input type="text" placeholder="Tên chủ tài khoản" value={vi.accName || ''} onChange={e => setFormData({ ...formData, [viKey]: { ...vi, accName: e.target.value } })} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Row 4: Categories & Tuition Config */}
        <section className="config-section categories-row">
          <div className="cat-col" style={{ flex: 1.5 }}>
            <div className="section-title">
              <ListChecks size={20} />
              <h3>Hạng mục Thu</h3>
            </div>
            <textarea rows="6" value={formData.hangmucthu} onChange={e => setFormData({ ...formData, hangmucthu: e.target.value })} placeholder="Nhập mỗi dòng một hạng mục..." />
          </div>
          <div className="cat-col" style={{ flex: 1.5 }}>
            <div className="section-title">
              <ListChecks size={20} />
              <h3>Hạng mục Chi</h3>
            </div>
            <textarea rows="6" value={formData.hangmucchi} onChange={e => setFormData({ ...formData, hangmucchi: e.target.value })} placeholder="Nhập mỗi dòng một hạng mục..." />
          </div>
          <div className="cat-col" style={{ flex: 1, minWidth: '200px' }}>
            <div className="section-title">
              <DollarSign size={20} />
              <h3>Cấu hình Tính học phí</h3>
            </div>
            <div className="tuition-config-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={formData.tinhhocphi?.selected?.includes('khoa')}
                  onChange={() => handleToggleTinhHocPhi('khoa')}
                />
                <span>Học phí theo Khóa</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={formData.tinhhocphi?.selected?.includes('thang')}
                  onChange={() => handleToggleTinhHocPhi('thang')}
                />
                <span>Học phí theo Tháng</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={formData.tinhhocphi?.selected?.includes('buoi')}
                  onChange={() => handleToggleTinhHocPhi('buoi')}
                />
                <span>Học phí theo Buổi</span>
              </label>
              <div style={{ marginTop: '0.5rem', borderTop: '1px solid #eee', paddingTop: '0.5rem' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', color: '#db2777', fontWeight: 700 }}>Số tiền ăn trừ/ngày nghỉ</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setIsTruTienAnModalOpen(true)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        fontSize: '0.85rem',
                        background: '#fdf2f8',
                        border: '1px solid #fce7f3',
                        borderRadius: '8px',
                        color: '#be185d',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {Object.keys(trutienanTiers).length > 0 ? `Đã cấu hình ${Object.keys(trutienanTiers).length} mức` : 'Nhấp để cấu hình chi tiết'}
                    </button>
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: '#db2777', fontWeight: 700 }}>Số tiền học trừ/ngày nghỉ</label>
                  <input
                    type="text"
                    value={formatCurrency(formData.trutiennghi || '')}
                    onChange={(e) => setFormData({ ...formData, trutiennghi: e.target.value.replace(/,/g, '').replace(/\D/g, '') })}
                    placeholder="VD: 20,000"
                    style={{ fontSize: '0.9rem', padding: '4px 8px' }}
                  />
                </div>
                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: '#db2777', fontWeight: 700 }}>Số tiền trừ dã ngoại</label>
                  <input
                    type="text"
                    value={formatCurrency(formData.tiendangoai || '')}
                    onChange={(e) => setFormData({ ...formData, tiendangoai: e.target.value.replace(/,/g, '').replace(/\D/g, '') })}
                    placeholder="VD: 50,000"
                    style={{ fontSize: '0.9rem', padding: '4px 8px' }}
                  />
                </div>
                <div style={{ marginTop: '0.8rem', padding: '10px', background: '#fff5f7', borderRadius: '8px', border: '1px solid #fce7f3' }}>
                  <div className="section-subtitle" style={{ fontSize: '0.8rem', fontWeight: 800, color: '#be185d', marginBottom: '8px', textTransform: 'uppercase' }}>Hoàn học phí liên tiếp</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setIsNghiLienTiepModalOpen(true)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        fontSize: '0.85rem',
                        background: '#fdf2f8',
                        border: '1px solid #fce7f3',
                        borderRadius: '8px',
                        color: '#be185d',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {Object.keys(consecutiveRefundConfig).length > 0 ? `Đã cấu hình ${Object.keys(consecutiveRefundConfig).length} mức` : 'Nhấp để cấu hình chi tiết'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="cat-col" style={{ flex: 1, minWidth: '200px' }}>
            <div className="section-title">
              <ListChecks size={20} />
              <h3>Cấu hình Điểm danh</h3>
            </div>
            <div className="tuition-config-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={formData.cotdiemdanh?.selected?.includes('comat')}
                  onChange={() => handleToggleCotDiemDanh('comat')}
                />
                <span>Có mặt</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={formData.cotdiemdanh?.selected?.includes('vangP')}
                  onChange={() => handleToggleCotDiemDanh('vangP')}
                />
                <span>Nghỉ phép</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={formData.cotdiemdanh?.selected?.includes('vangKP')}
                  onChange={() => handleToggleCotDiemDanh('vangKP')}
                />
                <span>Nghỉ không phép</span>
              </label>

              <div style={{ marginTop: '0.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>Phí trả trễ</div>

                {['traTre1', 'traTre2', 'traTre3'].map((key, index) => {
                  const label = `Trả trễ ${index + 1}`;
                  const isChecked = formData.cotdiemdanh?.selected?.includes(key);
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem', width: '100px' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleCotDiemDanh(key)}
                        />
                        <span>{label}</span>
                      </label>
                      {isChecked && (
                        <input
                          type="text"
                          value={formatCurrency(formData.tientratre?.[key]?.amount || 0)}
                          onChange={(e) => {
                            const val = e.target.value.replace(/,/g, '').replace(/\D/g, '');
                            setFormData(prev => ({
                              ...prev,
                              tientratre: {
                                ...prev.tientratre,
                                [key]: {
                                  ...(prev.tientratre?.[key] || {}),
                                  label,
                                  amount: parseInt(val, 10) || 0
                                }
                              }
                            }));
                          }}
                          placeholder="Mức phí (VNĐ)"
                          style={{ padding: '4px 8px', fontSize: '0.85rem', width: '120px' }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', color: '#1e293b', fontWeight: 700 }}>Hạn chót xin nghỉ học (HH:mm)</label>
                  <input
                    type="time"
                    value={formData.xinnghitruocmaygio || '08:00'}
                    onChange={e => setFormData({ ...formData, xinnghitruocmaygio: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  />
                  <p className="hint" style={{ marginTop: '5px', fontSize: '0.75rem', color: '#64748b' }}>
                    Sau giờ này, đơn xin nghỉ trong ngày sẽ tự động tính là **Nghỉ không phép**.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="config-section">
          <div className="section-title">
            <CalendarDays size={20} />
            <h3>Ngày nghỉ lễ</h3>
          </div>
          <HolidayManager />
        </section>

        {/* Row 5: Roles & Permissions */}
        <section className="config-section">
          <div className="section-title">
            <ShieldCheck size={20} />
            <h3>Phân quyền Vai trò (Permissions)</h3>
          </div>
          <div className="roles-table-container">
            <table className="roles-table">
              <thead>
                <tr>
                  <th>Chức năng / Menu</th>
                  {ROLES.map(r => <th key={r}>{r}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>TOÀN QUYỀN (FULL)</strong></td>
                  {ROLES.map(r => (
                    <td key={r}>
                      <input type="checkbox" checked={formData.phanquyenrole[r]?.full} onChange={() => toggleFull(r)} />
                    </td>
                  ))}
                </tr>
                {TAB_OPTIONS.map(opt => (
                  <tr key={opt.id}>
                    <td>{opt.label}</td>
                    {ROLES.map(r => (
                      <td key={r}>
                        <input
                          type="checkbox"
                          disabled={formData.phanquyenrole[r]?.full}
                          checked={formData.phanquyenrole[r]?.full || formData.phanquyenrole[r]?.tabs?.includes(opt.id)}
                          onChange={() => togglePermission(r, opt.id)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {renderTruTienAnModal()}
        {renderNghiLienTiepModal()}
      </form>
    </div>
  );
};

export default ConfigManager;
