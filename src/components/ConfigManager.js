import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useConfig } from '../ConfigContext';
import { getOAuthToken } from '../utils/googleDrive';
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
  Key,
  FileJson,
  RefreshCw
} from 'lucide-react';
import './ConfigManager.css';

const formatCurrency = (val) => {
  if (!val && val !== 0) return '';
  return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const ROLES = ['Quản lý', 'Nhân viên VP', 'Giáo viên'];
const TAB_OPTIONS = [
  { id: 'statistics', label: 'Thống kê' },
  { id: 'chat', label: 'Kênh Chat' },
  { id: 'finances', label: 'Quản lý thu chi' },
  { id: 'invoices', label: 'Xuất hóa đơn' },
  { id: 'sales', label: 'Bán hàng' },
  { id: 'timesheet', label: 'Chấm công' },
  { id: 'employees', label: 'Nhân viên' },
  { id: 'tasks', label: 'Công việc' },
  { id: 'debts', label: 'Quản lý nợ' },
  { id: 'students', label: 'Quản lý học sinh' },
  { id: 'export_excel', label: 'Xuất Excel (Quyền)' }
];

const ConfigManager = () => {
  const { config, refreshConfig } = useConfig();
  const [formData, setFormData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testingGDrive, setTestingGDrive] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

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
        }
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
      setMsg({ type: 'success', text: 'Đã lưu cấu hình hệ thống thành công!' });
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
                 <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Phương thức xác thực</label>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                       <button 
                          type="button"
                          className={`btn-auth-type ${formData.gdrive_auth_type === 'oauth' ? 'active' : ''}`}
                          onClick={() => setFormData({ ...formData, gdrive_auth_type: 'oauth' })}
                          style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid', borderColor: formData.gdrive_auth_type === 'oauth' ? '#2563eb' : '#e2e8f0', background: formData.gdrive_auth_type === 'oauth' ? '#eff6ff' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}
                       >
                          <Key size={16} /> User OAuth (Đăng nhập cá nhân)
                       </button>
                       <button 
                          type="button"
                          className={`btn-auth-type ${formData.gdrive_auth_type === 'service' ? 'active' : ''}`}
                          onClick={() => setFormData({ ...formData, gdrive_auth_type: 'service' })}
                          style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid', borderColor: formData.gdrive_auth_type === 'service' ? '#2563eb' : '#e2e8f0', background: formData.gdrive_auth_type === 'service' ? '#eff6ff' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}
                       >
                          <FileJson size={16} /> Service Account (Tự động)
                       </button>
                    </div>
                 </div>

                 {formData.gdrive_auth_type === 'oauth' ? (
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
                            disabled={testingGDrive || !formData.gdrive_client_id}
                            onClick={async () => {
                               setTestingGDrive(true);
                               try {
                                  await getOAuthToken(formData.gdrive_client_id);
                                  setMsg({ type: 'success', text: 'Kết nối Google Drive thành công! Bạn hiện có thể tải tệp lên.' });
                               } catch (err) {
                                  setMsg({ type: 'error', text: 'Lỗi kết nối: ' + err.message });
                               } finally {
                                  setTestingGDrive(false);
                               }
                            }}
                            style={{ padding: '10px 20px', borderRadius: '8px', background: '#2563eb', color: 'white', border: 'none', cursor: (testingGDrive || !formData.gdrive_client_id) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: (testingGDrive || !formData.gdrive_client_id) ? 0.6 : 1 }}
                         >
                            {testingGDrive ? <Loader2 size={16} className="spinner" /> : <RefreshCw size={16} />}
                            {sessionStorage.getItem('gdrive_token') ? 'Đã kết nối (Nhấn để kết nối lại)' : 'Đăng nhập & Kết nối Google'}
                         </button>
                         {!formData.gdrive_client_id && <p style={{ fontSize: '11px', color: '#b91c1c', marginTop: '5px' }}>* Vui lòng điền Client ID trước khi kết nối</p>}
                      </div>
                      <div className="form-group">
                        <label>Folder ID Thống nhất</label>
                        <input 
                           type="text" 
                           value={formData.gdrive_folder_id || ''} 
                           onChange={e => setFormData({ ...formData, gdrive_folder_id: e.target.value })} 
                           placeholder="ID từ URL thư mục..." 
                        />
                      </div>
                    </>
                 ) : (
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                       <label>Tệp Key JSON của Service Account</label>
                       <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.5rem' }}>
                          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cbd5e1', padding: '20px', borderRadius: '12px', cursor: 'pointer', background: '#f8fafc' }}>
                             <FileJson size={32} style={{ color: '#64748b', marginBottom: '8px' }} />
                             <span style={{ fontWeight: 600 }}>Tải lên file JSON</span>
                             <span style={{ fontSize: '11px', color: '#94a3b8' }}>Kéo thả hoặc click để chọn tệp .json</span>
                             <input 
                                type="file" 
                                accept=".json" 
                                style={{ display: 'none' }} 
                                onChange={async (e) => {
                                   const file = e.target.files[0];
                                   if (!file) return;
                                   try {
                                      const text = await file.text();
                                      const json = JSON.parse(text);
                                      if (json.type !== 'service_account') throw new Error('Không phải file Service Account JSON hợp lệ');
                                      setFormData({ 
                                         ...formData, 
                                         gdrive_service_json: json,
                                         gdrive_client_id: json.client_id, // For tracking
                                      });
                                      setMsg({ type: 'success', text: 'Đã nhận file Service Account JSON: ' + json.client_email });
                                   } catch (err) {
                                      setMsg({ type: 'error', text: 'Lỗi đọc file JSON: ' + err.message });
                                   }
                                }} 
                             />
                          </label>
                          {formData.gdrive_service_json && (
                             <div style={{ flex: 1.5, background: '#f0fdf4', padding: '15px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: 600, marginBottom: '5px' }}>
                                   <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }}></div>
                                   Đã kết nối Key JSON
                                </div>
                                <div style={{ fontSize: '12px', color: '#166534', wordBreak: 'break-all' }}>
                                   <strong>Email:</strong> {formData.gdrive_service_json.client_email}<br/>
                                   <strong>Project ID:</strong> {formData.gdrive_service_json.project_id}<br/>
                                   <button 
                                      type="button"
                                      onClick={() => setFormData({ ...formData, gdrive_service_json: null })}
                                      style={{ marginTop: '10px', fontSize: '11px', color: '#b91c1c', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                   >
                                      Gỡ bỏ key
                                   </button>
                                </div>
                             </div>
                          )}
                       </div>
                       <div className="form-group" style={{ marginTop: '1rem' }}>
                          <label>Folder ID Thống nhất (Giao diện chung)</label>
                          <input 
                             type="text" 
                             value={formData.gdrive_folder_id || ''} 
                             onChange={e => setFormData({ ...formData, gdrive_folder_id: e.target.value })} 
                             placeholder="ID từ URL thư mục đã được chia sẻ quyền xem/ghi..." 
                          />
                          <p className="hint" style={{ marginTop: '5px' }}>
                             ⚠️ <strong>Lưu ý quan trọng:</strong> Bạn phải <strong>Chia sẻ (Share)</strong> thư mục Google Drive đó cho email Service Account ở trên với quyền <strong>Editor</strong>.
                          </p>
                       </div>
                    </div>
                 )}
               </>
            )}
          </div>
          {formData.gdrive_enabled && formData.gdrive_auth_type === 'oauth' && (
             <div className="gdrive-instructions" style={{ marginTop: '1.5rem', padding: '15px', background: '#eff6ff', borderRadius: '12px', fontSize: '12px', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                <p style={{ fontWeight: 600, marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                   <Key size={14} /> Hướng dẫn thiết lập OAuth 2.0:
                </p>
                <ol style={{ paddingLeft: '20px', lineHeight: '1.6' }}>
                   <li>Bật <strong>Google Drive API</strong> trong Google Cloud Console.</li>
                   <li>Tạo <strong>OAuth 2.0 Client ID</strong> (Web Application).</li>
                   <li>Thêm <code>{window.location.origin}</code> vào <strong>Authorized JavaScript origins</strong>.</li>
                </ol>
                <div style={{ marginTop: '10px' }}>
                   <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#2563eb', fontWeight: 600 }}>
                     Mở Google Cloud Console <ExternalLink size={12} />
                   </a>
                </div>
             </div>
          )}
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
                  <input
                    type="text"
                    value={formatCurrency(formData.trutienan || '')}
                    onChange={(e) => setFormData({ ...formData, trutienan: e.target.value.replace(/,/g, '').replace(/\D/g, '') })}
                    placeholder="VD: 30,000"
                    style={{ fontSize: '0.9rem', padding: '4px 8px' }}
                  />
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
      </form>
    </div>
  );
};

export default ConfigManager;
