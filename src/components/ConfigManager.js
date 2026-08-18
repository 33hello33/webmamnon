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
  Key,
  FileJson,
  RefreshCw,
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
  const [localTruTienAn, setLocalTruTienAn] = useState([]);

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
        trutienan: typeof config.trutienan === 'string' && config.trutienan.trim().startsWith('{') ? JSON.parse(config.trutienan) : config.trutienan,
        zalodongtre: config.zalodongtre || 'Kính gửi Phụ huynh/Học viên [tenhv] (Mã: [mahv]), Lớp [lop]. Khóa học/học phí của học viên đã kết thúc vào ngày [ngayketthuc]. Xin vui lòng liên hệ trung tâm để đóng học phí gia hạn.',
        zalonhacno: config.zalonhacno || 'Kính gửi Phụ huynh/Học viên [tenhv] (Mã: [mahv]), Lớp [lop]. Ngày đóng gần nhất là [ngaydonggannhat]. Hiện tại học viên còn nợ học phí là [sotiencanno] VNĐ. Rất mong Phụ huynh/Học viên hoàn tất học phí sớm.',
        zalonhacnghiphep: config.zalonhacnghiphep || 'Cảnh báo học tập: Học viên [tenhv] (Mã: [mahv]), Lớp [lop] đã nghỉ không phép 2 buổi liên tiếp. Lịch học: [lichhoc], Giờ học: [giohoc]. Kính mong phụ huynh kiểm tra và liên hệ với nhà trường.'
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

  const handleAppleIconUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.png')) {
      return setMsg({ type: 'error', text: 'Vui lòng chỉ upload file PNG.' });
    }

    try {
      // 1. Upload to assets bucket
      const fileName = `appleicon_${Date.now()}.png`;
      const { error } = await supabase.storage.from('assets').upload(fileName, file);

      if (error) {
        // Alt: base64 if no bucket
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
          setFormData({ ...formData, appleicon: reader.result });
          setMsg({ type: 'success', text: 'Đã cập nhật Apple Icon (Local Base64).' });
        };
        return;
      }

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(fileName);
      setFormData({ ...formData, appleicon: publicUrl });
      setMsg({ type: 'success', text: 'Đã tải lên Apple Icon mới thành công!' });
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: 'Lỗi upload: ' + err.message });
    }
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

  const openTruTienAnModal = () => {
    const arr = Object.entries(trutienanTiers).map(([k, v]) => ({
      id: Math.random().toString(),
      muc_tien: k,
      tru_nghi: v.tru_nghi
    }));
    setLocalTruTienAn(arr);
    setIsTruTienAnModalOpen(true);
  };

  const handleAddTierLocal = () => {
    setLocalTruTienAn([...localTruTienAn, { id: Math.random().toString(), muc_tien: "", tru_nghi: 0 }]);
  };

  const handleRemoveTierLocal = (idToRemove) => {
    setLocalTruTienAn(localTruTienAn.filter(t => t.id !== idToRemove));
  };

  const closeAndSaveTruTienAnModal = () => {
    const newTiers = {};
    localTruTienAn.forEach(item => {
      const m = String(item.muc_tien).replace(/,/g, '').trim();
      if (m !== "") {
        newTiers[m] = { tru_nghi: parseInt(item.tru_nghi) || 0 };
      }
    });
    setFormData({ ...formData, trutienan: newTiers });
    setIsTruTienAnModalOpen(false);
  };

  const renderTruTienAnModal = () => {
    if (!isTruTienAnModalOpen) return null;

    return createPortal(
      <div className="config-modal-overlay">
        <div className="config-modal">
          <div className="modal-header">
            <h3>Cấu hình mức trừ tiền ăn</h3>
            <button type="button" className="btn-close" onClick={closeAndSaveTruTienAnModal}>×</button>
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
              {localTruTienAn.map((item, index) => (
                <div key={item.id} className="tier-item">
                  <input
                    type="text"
                    value={formatCurrency(item.muc_tien)}
                    onChange={(e) => {
                      const arr = [...localTruTienAn];
                      arr[index].muc_tien = e.target.value.replace(/,/g, '');
                      setLocalTruTienAn(arr);
                    }}
                    placeholder="VD: 650000"
                  />
                  <input
                    type="text"
                    value={formatCurrency(item.tru_nghi)}
                    onChange={(e) => {
                      const arr = [...localTruTienAn];
                      arr[index].tru_nghi = e.target.value.replace(/,/g, '');
                      setLocalTruTienAn(arr);
                    }}
                    placeholder="VD: 20000"
                  />
                  <button type="button" className="btn-remove-tier" onClick={() => handleRemoveTierLocal(item.id)}>×</button>
                </div>
              ))}
              <button type="button" className="btn-add-tier" onClick={handleAddTierLocal}>
                <Plus size={16} /> Thêm mức mới
              </button>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-confirm" onClick={closeAndSaveTruTienAnModal}>Xong</button>
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
              <div className="logo-upload">
                <label>Apple Touch Icon</label>
                <div className="logo-preview-box">
                  {formData.appleicon ? <img src={formData.appleicon} alt="Preview" /> : <div className="no-img">No Icon</div>}
                  <div className="upload-overlay">
                    <Upload size={24} />
                    <input type="file" accept="image/png" onChange={handleAppleIconUpload} />
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
              <label>Số trợ giảng tối đa (1-3)</label>
              <input type="number" min="1" max="3" value={formData.sonhanvientrogiang} onChange={e => setFormData({ ...formData, sonhanvientrogiang: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Gia hạn thêm (Số ngày quá hạn)</label>
              <input type="number" min="0" value={formData.ngayquahan || 0} onChange={e => setFormData({ ...formData, ngayquahan: e.target.value })} />
            </div>
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

        {/* Zalo Templates Section */}
        <section className="config-section">
          <div className="section-title">
            <MessageSquare size={20} />
            <h3>Cấu hình Mẫu Tin nhắn Zalo Tự động</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-group">
              <label style={{ fontWeight: 600, color: '#0f172a' }}>Mẫu Zalo Đóng Trễ (Hết hạn học phí)</label>
              <textarea
                rows="3"
                value={formData.zalodongtre || ''}
                onChange={e => setFormData({ ...formData, zalodongtre: e.target.value })}
                placeholder="Nhập mẫu tin nhắn Zalo đóng trễ..."
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
              />
              <p className="hint" style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>Các biến khả dụng: <code>[tenhv]</code>, <code>[mahv]</code>, <code>[lop]</code>, <code>[ngayketthuc]</code></p>
            </div>

            <div className="form-group">
              <label style={{ fontWeight: 600, color: '#0f172a' }}>Mẫu Zalo Nhắc Nợ Học Phí</label>
              <textarea
                rows="3"
                value={formData.zalonhacno || ''}
                onChange={e => setFormData({ ...formData, zalonhacno: e.target.value })}
                placeholder="Nhập mẫu tin nhắn Zalo nhắc nợ..."
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
              />
              <p className="hint" style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>Các biến khả dụng: <code>[tenhv]</code>, <code>[mahv]</code>, <code>[lop]</code>, <code>[ngaydonggannhat]</code>, <code>[sotiencanno]</code></p>
            </div>

            <div className="form-group">
              <label style={{ fontWeight: 600, color: '#0f172a' }}>Mẫu Zalo Nhắc Nghỉ Không Phép</label>
              <textarea
                rows="3"
                value={formData.zalonhacnghiphep || ''}
                onChange={e => setFormData({ ...formData, zalonhacnghiphep: e.target.value })}
                placeholder="Nhập mẫu tin nhắn Zalo nhắc nghỉ học..."
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
              />
              <p className="hint" style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>Các biến khả dụng: <code>[tenhv]</code>, <code>[mahv]</code>, <code>[lop]</code>, <code>[lichhoc]</code>, <code>[giohoc]</code></p>
            </div>
          </div>
        </section>


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
                      onClick={openTruTienAnModal}
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
