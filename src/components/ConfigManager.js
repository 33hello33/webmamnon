import React, { useState, useEffect } from 'react';
import { supabase, insertLog } from '../supabase';
import { createPortal } from 'react-dom';
import { useConfig } from '../ConfigContext';
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
  Users
} from 'lucide-react';
import './ConfigManager.css';

const formatCurrency = (val) => {
  if (!val && val !== 0) return '';
  return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const ROLES = ['Quản lý', 'Nhân viên VP', 'Giáo viên'];
const TAB_OPTIONS = [
  { id: 'statistics', label: 'Thống kê' },
  { id: 'chat', label: 'Phụ huynh' },
  { id: 'finances', label: 'Quản lý thu chi' },
  { id: 'invoices', label: 'Xuất hóa đơn' },
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
  const [syncingSecrets, setSyncingSecrets] = useState(false);

  useEffect(() => {
    if (config) {
      setFormData({
        ...config,
        hangmucthu: Array.isArray(config.hangmucthu) ? config.hangmucthu.join('\n') : '',
        hangmucchi: Array.isArray(config.hangmucchi) ? config.hangmucchi.join('\n') : '',
        phanquyenrole: config.phanquyenrole || {
          'Quản lý': { full: true },
          'Nhân viên VP': { full: false, tabs: [] },
          'Giáo viên': { full: false, tabs: [] }
        },
        tinhhocphi: config.tinhhocphi || {
          available: ['khoa', 'buoi', 'thang'],
          selected: ['khoa', 'buoi', 'thang']
        },
        cotdiemdanh: config.cotdiemdanh || {
          available: ['comat', 'vangP', 'vangKP'],
          selected: ['comat', 'vangP', 'vangKP']
        },
        nghilientiep: typeof config.nghilientiep === 'string' ? JSON.parse(config.nghilientiep) : (config.nghilientiep || {
          songaynghilientiep: 7,
          phantramgiam: 50
        }),
        trutienan: typeof config.trutienan === 'string' && config.trutienan.trim().startsWith('{') ? JSON.parse(config.trutienan) : config.trutienan
      });
    }
  }, [config]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      handleExchangeCode(code);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleExchangeCode = async (code) => {
    const savedClientId = localStorage.getItem('gdrive_pending_client_id');
    if (!savedClientId) return;

    setLoading(true);
    setMsg({ type: 'info', text: 'Đang xác thực với Google...' });
    try {
      const { data, error } = await supabase.functions.invoke('super-task', {
        body: { 
          action: 'exchange-code',
          code,
          client_id: savedClientId,
          redirect_uri: window.location.origin
        }
      });
      if (error) throw error;
      setMsg({ type: 'success', text: 'Kết nối Google Drive thành công! Refresh Token đã được lưu an toàn.' });
      localStorage.removeItem('gdrive_pending_client_id');
    } catch (err) {
      setMsg({ type: 'error', text: 'Lỗi xác thực Google: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

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
      ngayquahan: Math.max(0, parseInt(formData.ngayquahan) || 0)
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

      // Sync folder ID to function logic if needed
      if (payload.gdrive_enabled) {
        try {
          await supabase.functions.invoke('super-task', {
            body: {
              action: 'sync-config',
              FOLDER_ID: payload.gdrive_folder_id
            }
          });
        } catch (syncErr) {
          console.warn('Sync failed:', syncErr);
        }
      }

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
      // 1. Upload to assets bucket (might need policy)
      const fileName = `logo_${Date.now()}.png`;
      const { error } = await supabase.storage.from('assets').upload(fileName, file);

      if (error) {
        // Alt: base64 if no bucket
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
          setFormData({ ...formData, logo: reader.result });
          setMsg({ type: 'success', text: 'Đã cập nhật Logo (Local Base64).' });
        };
        return;
      }

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(fileName);
      setFormData({ ...formData, logo: publicUrl });
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

  const connectGoogle = () => {
    const client_id = formData.gdrive_client_id;
    if (!client_id) {
      return setMsg({ type: 'error', text: 'Vui lòng nhập Client ID (Web Application) trước.' });
    }
    localStorage.setItem('gdrive_pending_client_id', client_id);
    const redirect_uri = window.location.origin;
    const scope = 'https://www.googleapis.com/auth/drive';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=code&scope=${scope}&access_type=offline&prompt=select_account consent`;
    window.location.href = authUrl;
  };

  const renderTruTienAnModal = () => {
    if (!isTruTienAnModalOpen) return null;

    return createPortal(
      <div className="config-modal-overlay">
        <div className="config-modal">
          <div className="modal-header">
            <h3>Cấu hình mức trừ tiền ăn</h3>
            <button className="btn-close" onClick={() => setIsTruTienAnModalOpen(false)}>×</button>
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
                  <button className="btn-remove-tier" onClick={() => handleRemoveTier(key)}>×</button>
                </div>
              ))}
              <button className="btn-add-tier" onClick={handleAddTier}>
                <Plus size={16} /> Thêm mức mới
              </button>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-confirm" onClick={() => setIsTruTienAnModalOpen(false)}>Xong</button>
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
            <div className="logo-upload">
              <label>Logo Web (Favicon & Sidebar)</label>
              <div className="logo-preview-box">
                {formData.logo ? <img src={formData.logo} alt="Preview" /> : <div className="no-img">No Logo</div>}
                <div className="upload-overlay">
                  <Upload size={24} />
                  <input type="file" accept="image/png" onChange={handleLogoUpload} />
                </div>
              </div>
              <p className="hint">Chỉ chấp nhận .png | Max 2MB</p>
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
              <label>Số trợ giảng tối đa (1-3)</label>
              <input type="number" min="1" max="3" value={formData.sonhanvientrogiang} onChange={e => setFormData({ ...formData, sonhanvientrogiang: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Gia hạn thêm (Số ngày quá hạn)</label>
              <input type="number" min="0" value={formData.ngayquahan || 0} onChange={e => setFormData({ ...formData, ngayquahan: e.target.value })} />
            </div>
          </div>
        </section>

        {/* Row 2.5: Google Drive Config */}
        <section className="config-section">
          <div className="section-title">
            <Cloud size={20} />
            <h3>Cloud Storage (Google Drive)</h3>
            <div className="status-badge" style={{ marginLeft: 'auto', background: formData.gdrive_enabled ? '#dcfce7' : '#f3f4f6', color: formData.gdrive_enabled ? '#166534' : '#6b7280', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
              {formData.gdrive_enabled ? 'Đã kích hoạt' : 'Chưa kích hoạt'}
            </div>
          </div>
          <div className="gdrive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '10px 15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ padding: '8px', background: formData.gdrive_enabled ? '#dcfce7' : '#f1f5f9', borderRadius: '6px', color: formData.gdrive_enabled ? '#16a34a' : '#64748b' }}>
                    <Cloud size={20} />
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, display: 'block' }}>Kích hoạt lưu trữ Google Drive</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Tải hình ảnh, tệp tin trực tiếp lên Drive thay vì Supabase</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={formData.gdrive_enabled}
                  onChange={e => setFormData({ ...formData, gdrive_enabled: e.target.checked })}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
              </label>
            </div>

            {formData.gdrive_enabled && (
              <>
                <div className="form-group">
                  <label>Client ID (OAuth 2.0)</label>
                  <input
                    type="text"
                    value={formData.gdrive_client_id || ''}
                    onChange={e => setFormData({ ...formData, gdrive_client_id: e.target.value })}
                    placeholder="VD: 12345-abc.apps.googleusercontent.com"
                  />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <button
                    type="button"
                    className="btn-test-gdrive"
                    onClick={connectGoogle}
                    style={{ padding: '10px 20px', borderRadius: '8px', background: '#2563eb', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Key size={16} /> Đăng nhập & Kết nối Google
                  </button>
                  <p className="hint" style={{ marginTop: '5px' }}>
                    * Nhấn nút để cấp quyền truy cập vào Drive của bạn. Chỉ cần thực hiện một lần.
                  </p>
                </div>
                <div className="form-group">
                  <label>Folder ID Thống nhất (Giao diện chung)</label>
                  <input
                    type="text"
                    value={formData.gdrive_folder_id || ''}
                    onChange={e => setFormData({ ...formData, gdrive_folder_id: e.target.value })}
                    placeholder="ID từ URL thư mục..."
                  />
                  <p className="hint" style={{ marginTop: '5px' }}>
                    ⚠️ Đừng quên thiết lập thư mục này ở chế độ <strong>Công khai (View)</strong> để phụ huynh có thể xem.
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
                <div style={{ marginTop: '0.8rem', padding: '10px', background: '#fff5f7', borderRadius: '8px', border: '1px solid #fce7f3' }}>
                  <div className="section-subtitle" style={{ fontSize: '0.8rem', fontWeight: 800, color: '#be185d', marginBottom: '8px', textTransform: 'uppercase' }}>Hoàn học phí liên tiếp</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Nghỉ ≥ (ngày)</label>
                      <input
                        type="number"
                        min="1"
                        value={formData.nghilientiep?.songaynghilientiep || 7}
                        onChange={(e) => setFormData({
                          ...formData,
                          nghilientiep: { ...formData.nghilientiep, songaynghilientiep: parseInt(e.target.value) || 0 }
                        })}
                        style={{ fontSize: '0.9rem', padding: '4px 8px' }}
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Giảm (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.nghilientiep?.phantramgiam || 0}
                        onChange={(e) => setFormData({
                          ...formData,
                          nghilientiep: { ...formData.nghilientiep, phantramgiam: parseInt(e.target.value) || 0 }
                        })}
                        style={{ fontSize: '0.9rem', padding: '4px 8px' }}
                      />
                    </div>
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
            </div>
          </div>
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
      </form>
    </div>
  );
};

export default ConfigManager;
