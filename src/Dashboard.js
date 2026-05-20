import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';
import {
  LayoutDashboard,
  Wallet,
  Receipt,
  ShoppingCart,
  Users,
  Briefcase,
  AlertTriangle,
  GraduationCap,
  LogOut,
  Bell,
  Settings,
  Menu,
  X,
  BarChart3,
  Key,
  MessageSquare,
  BookOpen,
  Activity
} from 'lucide-react';
import { supabase } from './supabase';
import { useConfig } from './ConfigContext';
import StudentManager from './components/StudentManager';
import DebtManager from './components/DebtManager';
import EmployeeManager from './components/EmployeeManager';
import Overview from './components/Overview';
import InvoiceManager from './components/InvoiceManager';
import ProductManager from './components/ProductManager';
import SalesPOS from './components/SalesPOS';
import TaskManager from './components/TaskManager';
import FinanceManager from './components/FinanceManager';
import ConfigManager from './components/ConfigManager';
import Statistics from './components/Statistics';
import ChatManager from './components/ChatManager';
import SystemLogs from './components/SystemLogs';

const ALL_TABS = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  {
    id: 'finances',
    label: 'Quản lý thu chi',
    icon: Wallet,
    subTabs: [
      { id: 'phieuchi', label: 'QL phiếu thu/chi' },
      { id: 'hoadon', label: 'QL phiếu thu HP' },
      { id: 'nhapkho', label: 'QL Nhập kho' },
      { id: 'billhang', label: 'QL bill hàng' }
    ]
  },
  { id: 'student_list', label: 'Học sinh', icon: GraduationCap },
  {
    id: 'students',
    label: 'Quản lý lớp học',
    icon: BookOpen,
    subTabs: [
      { id: 'classes', label: 'Lớp' },
      { id: 'attendance_today', label: 'Danh sách đi học' },
      { id: 'attendance', label: 'Điểm danh' },
      { id: 'leave_list', label: 'Danh sách nghỉ' },
      { id: 'ngoaikhoa_reg', label: 'Đăng ký ngoại khóa' }
    ]
  },
  { id: 'invoices', label: 'Thu học phí', icon: Receipt },
  {
    id: 'sales',
    label: 'Bán hàng',
    icon: ShoppingCart,
    subTabs: [
      { id: 'pos', label: 'Bán hàng' },
      { id: 'products', label: 'Quản lý kho hàng' }
    ]
  },
  { id: 'debts', label: 'Quản lý nợ', icon: AlertTriangle },
  { id: 'chat', label: 'Phụ huynh', icon: MessageSquare },
  { id: 'employees', label: 'Nhân viên', icon: Users },
  { id: 'tasks', label: 'Công việc', icon: Briefcase },
  { id: 'statistics', label: 'Thống kê', icon: BarChart3 },
  { id: 'system_logs', label: 'Lịch sử', icon: Activity, adminOnly: true },
  { id: 'config', label: 'Cấu hình', icon: Settings }
];

function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [activeSubTab, setActiveSubTab] = useState('students');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('app_theme') || 'kindergarten');
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [employeesMap, setEmployeesMap] = useState({});
   useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const { config } = useConfig();
  const navigate = useNavigate();
  const [isChangePassOpen, setIsChangePassOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [changePassData, setChangePassData] = useState({ oldPass: '', newPass: '', confirmPass: '' });
  const [changePassLoading, setChangePassLoading] = useState(false);
  const [changePassMessage, setChangePassMessage] = useState({ type: '', text: '' });
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const getVisibleTabs = () => {
    if (!user) return [];
    
    // First apply global config flags
    let filtered = ALL_TABS;
    if (config) {
      if (config.giaoviec === false) filtered = filtered.filter(t => t.id !== 'tasks');
      if (config.thongke === false) filtered = filtered.filter(t => t.id !== 'statistics');
      if (config.chat === false) filtered = filtered.filter(t => t.id !== 'chat');
    }

    if (user.role === 'Quản lý') return filtered;

    // Check phanquyenrole
    const pq = config?.phanquyenrole?.[user.role];
    if (!pq) return filtered.filter(t => t.id === 'overview'); // Safe fallback
    if (pq.full) return filtered;

    return filtered.filter(t => {
      if (t.adminOnly) return false;
      return (pq.tabs || []).includes(t.id);
    });
  };

  const visibleTabs = getVisibleTabs();

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleLog = (e) => {
      const mota = e.detail?.mota || '';
      if (mota.includes('tbl_diemdanh') || mota.includes('ĐIỂM DANH') || mota.includes('hv_messages') || mota.includes('documents')) return;
      
      const newLog = { ...e.detail, isLocal: true };
      setLogs(prev => {
        // Avoid local duplicate if id matches something later, wait simple push
        return [newLog, ...prev].slice(0, 30);
      });
    };
    window.addEventListener('app_log_inserted', handleLog);

    let channel = null;

    if (user?.role === 'Quản lý') {
      // Fetch employee map
      supabase.from('tbl_nv').select('manv, tennv, username').then(({ data }) => {
        if (data) {
          const map = {};
          data.forEach(nv => {
            const name = nv.tennv || nv.username;
            if (nv.manv) map[nv.manv] = name;
            if (nv.username) map[nv.username] = name;
          });
          setEmployeesMap(map);
        }
      });

      // Fetch initial 30 logs (excluding noisy actions)
      supabase.from('tbl_log')
        .select('*')
        .not('mota', 'ilike', '%tbl_diemdanh%')
        .not('mota', 'ilike', '%ĐIỂM DANH%')
        .not('mota', 'ilike', '%hv_messages%')
        .not('mota', 'ilike', '%documents%')
        .order('created_at', { ascending: false })
        .limit(30)
        .then(({ data }) => {
          if (data) {
            setLogs(data);
          }
        });

      // Listen to global changes across devices
      channel = supabase.channel('realtime_logs')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tbl_log' }, (payload) => {
          const mota = payload.new?.mota || '';
          if (mota.includes('tbl_diemdanh') || mota.includes('ĐIỂM DANH') || mota.includes('hv_messages') || mota.includes('documents')) return;

          setLogs(prev => {
            const exists = prev.some(l => l.id === payload.new.id);
            if (exists) return prev;
            // Also try to remove temporary local logs that match roughly timestamp and mota
            const filtered = prev.filter(l => !(l.isLocal && l.mota === payload.new.mota && new Date(payload.new.created_at) - new Date(l.created_at) < 5000));
            return [payload.new, ...filtered].slice(0, 30);
          });
        })
        .subscribe();
    }

    // Fetch unread messages count globally for sidebar
    const fetchUnreadChatCount = async () => {
      if (!user) return;

      let studentIds = null;
      if (user.role === 'Giáo viên') {
        // Fetch teacher's classes first
        const { data: teacherClasses } = await supabase
          .from('tbl_lop')
          .select('malop')
          .or(`manv.eq.${user.manv},manv.eq.${user.username},manv.eq.${user.tennv}`);
        
        if (teacherClasses && teacherClasses.length > 0) {
          const classIds = teacherClasses.map(c => c.malop);
          const { data: myStudents } = await supabase
            .from('tbl_hv')
            .select('mahv')
            .in('malop', classIds);
          if (myStudents) {
            studentIds = myStudents.map(s => s.mahv);
          }
        } else {
          // Teacher has no classes
          setUnreadChatCount(0);
          if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(console.error);
          return;
        }
      }

      let query = supabase
        .from('hv_messages')
        .select('content, manv, description, mahv')
        .is('is_read', false);
      
      if (studentIds) {
        query = query.in('mahv', studentIds);
      }
        
      const { data } = await query;
        
      if (data) {
        let count = 0;
        data.forEach(d => {
          const isPH = d.description === 'PH' || (!d.manv);
          if (isPH) {
            const isGopY = d.content?.includes('📬 [HÒM THƯ GÓP Ý - GỬI HIỆU TRƯỞNG]');
            if (isGopY && user.role !== 'Quản lý' && user.role !== 'Hiệu trưởng') return;
            count++;
          }
        });
        setUnreadChatCount(count);

        if ('setAppBadge' in navigator) {
          if (count > 0) navigator.setAppBadge(count).catch(console.error);
          else navigator.clearAppBadge().catch(console.error);
        }
      }
    };
    
    if (user) {
      fetchUnreadChatCount();
      
      const chatChannel = supabase.channel('global_chat_unread')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hv_messages' }, (payload) => {
          const isPH = payload.new.description === 'PH' || (!payload.new.manv);
          if (isPH) {
            if (Notification.permission === 'granted') {
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(registration => {
                  registration.showNotification('Tin nhắn mới từ phụ huynh', { body: payload.new.content || 'Bạn có một tệp đính kèm mới', icon: '/logo192.png' });
                }).catch(() => {
                  new Notification('Tin nhắn mới từ phụ huynh', { body: payload.new.content || 'Bạn có một tệp đính kèm mới', icon: '/logo192.png' });
                });
              } else {
                new Notification('Tin nhắn mới từ phụ huynh', { body: payload.new.content || 'Bạn có một tệp đính kèm mới', icon: '/logo192.png' });
              }
            }
          }
          fetchUnreadChatCount();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hv_messages' }, () => fetchUnreadChatCount())
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'hv_messages' }, () => fetchUnreadChatCount())
        .subscribe();
        
      return () => {
        window.removeEventListener('app_log_inserted', handleLog);
        if (channel) supabase.removeChannel(channel);
        supabase.removeChannel(chatChannel);
      };
    }

    return () => {
      window.removeEventListener('app_log_inserted', handleLog);
      if (channel) supabase.removeChannel(channel);
    };
  }, [user]);

  const handleThemeChange = (e) => {
    const newTheme = e.target.value;
    setTheme(newTheme);
    localStorage.setItem('app_theme', newTheme);
  };

  useEffect(() => {
    // Session validation (24 hours / 1 day)
    const sessionStr = localStorage.getItem('auth_session');
    if (!sessionStr) {
      navigate('/login');
      return;
    }

    try {
      const session = JSON.parse(sessionStr);
      const currentTime = new Date().getTime();
      const oneDay = 24 * 60 * 60 * 1000;

      if (currentTime - session.loginTime > oneDay) {
        localStorage.removeItem('auth_session');
        navigate('/login');
      } else {
        setUser(session.user);
      }
    } catch (e) {
      localStorage.removeItem('auth_session');
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => {
    if (user && visibleTabs.length > 0 && !visibleTabs.some(t => t.id === activeTab)) {
      setActiveTab('overview');
    }
  }, [visibleTabs, activeTab, user]);

  const handleLogout = () => {
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(console.error);
    }
    localStorage.removeItem('auth_session');
    navigate('/login');
  };

  const renderContent = () => {
    const currentTab = ALL_TABS.find(t => t.id === activeTab);
    return (
      <div className="content-inner animate-fade-in">
        <div className="content-header hidden-mobile">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {currentTab?.icon && <currentTab.icon size={24} className="text-primary" />}
            <h2>{currentTab?.label || 'Đang tải...'}</h2>
          </div>
          <div className="top-actions" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div className="theme-selector">
              <select
                value={theme}
                onChange={handleThemeChange}
                className="theme-select"
                style={{
                  padding: '0.45rem 1rem',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  outline: 'none',
                  background: 'white',
                  color: '#334155',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}
              >
                <option value="light">☀️ Sáng (Mặc định)</option>
                <option value="kindergarten">🎨 Mầm Non</option>
              </select>
            </div>

            <div className="top-user-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {user?.role === 'Quản lý' && (
                <div className="notification-bell" style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowLogs(!showLogs)}
                    title="Thông báo hệ thống"
                    style={{ background: 'white', border: '1px solid #cbd5e1', cursor: 'pointer', position: 'relative', padding: '0.45rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Bell size={18} color="#334155" />
                    {logs.length > 0 && <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: 'white', borderRadius: '50%', padding: '0 5px', fontSize: '0.65rem', fontWeight: 'bold' }}>New</span>}
                  </button>
                  {showLogs && (
                    <div style={{ position: 'absolute', right: 0, top: '45px', background: 'white', width: '380px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', borderRadius: '12px', zIndex: 1000, maxHeight: '500px', overflowY: 'auto', border: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <h4 style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', margin: 0, position: 'sticky', top: 0, background: 'white', zIndex: 2 }}>Lịch sử Hệ thống</h4>
                      {logs.length === 0 ? <div style={{ padding: '1rem', color: '#64748b' }}>Chưa có hoạt động</div> : logs.map((l, i) => {
                        let empStr = 'Hệ thống tự động';
                        if (l.manv) {
                          const ten = l.tbl_nv?.tennv || employeesMap[l.manv];
                          empStr = ten ? `${ten} (${l.manv})` : l.manv;
                        }
                        return (
                          <div key={l.id || i} style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
                              <div style={{ fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
                                <div style={{ background: '#e2e8f0', color: '#475569', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>👤</div>
                                <span>{empStr}</span>
                              </div>
                              <span style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'right', whiteSpace: 'nowrap', marginTop: '4px' }}>
                                {new Date(l.created_at || Date.now()).toLocaleString('vi-VN')}
                              </span>
                            </div>
                            <div style={{ color: '#334155', lineHeight: 1.5, background: l.mota?.includes('Đã xóa') || l.mota?.includes('Xóa dòng') ? '#fff1f2' : (l.mota?.includes('[LỖI]') ? '#fff7ed' : '#f8fafc'), padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px dashed #cbd5e1', fontSize: '0.85rem' }}>
                              {(() => {
                                const m = l.mota || '';
                                if (!m) return 'Không có mô tả chi tiết';
                                if (m.startsWith('Đã') || m.startsWith('[LỖI]')) return m;

                                // Translate old technical logs on the fly
                                const tableNames = {
                                  'tbl_hanghoa': 'Sản phẩm/Hàng hóa',
                                  'tbl_billhanghoa': 'Hóa đơn bán hàng',
                                  'tbl_hd': 'Phiếu thu HP',
                                  'tbl_nv': 'Nhân viên',
                                  'tbl_hv': 'Học viên',
                                  'tbl_lop': 'Lớp học',
                                  'tbl_diemdanh': 'Điểm danh',
                                  'tbl_thu': 'Phiếu thu',
                                  'tbl_chi': 'Phiếu chi',
                                  'tbl_thongbao': 'Thông báo học phí',
                                  'tbl_task': 'Công việc',
                                  'tbl_chamcong': 'Chấm công',
                                  'tbl_luong': 'Phiếu lương'
                                };
                                const regex = /\[(.*?)\] Bảng: (.*)/;
                                const match = m.match(regex);
                                if (match) {
                                  let actionType = match[1].toLowerCase();
                                  let table = match[2].trim();
                                  let actionLabel = actionType.includes('nhập mới') ? 'Đã thêm' : (actionType.includes('sửa') ? 'Đã cập nhật' : (actionType.includes('xóa') ? 'Đã xóa' : actionType));
                                  let tableLabel = tableNames[table] || table;
                                  let res = `${actionLabel} ${tableLabel.toLowerCase()}`;
                                  
                                  // Add detail if available in our new format
                                  const detailMatch = m.match(/\| Chi tiết: (.*?)(?: \||$|\()/);
                                  if (detailMatch) res += `: ${detailMatch[1]}`;
                                  
                                  return res;
                                }
                                return m;
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* User Dropdown */}
              <div className="user-dropdown-container" style={{ position: 'relative' }}>
                <div
                  className="user-avatar-trigger"
                  onMouseEnter={(e) => {
                    const tooltip = e.currentTarget.querySelector('.user-tooltip');
                    if (tooltip) tooltip.style.opacity = '1';
                  }}
                  onMouseLeave={(e) => {
                    const tooltip = e.currentTarget.querySelector('.user-tooltip');
                    if (tooltip) tooltip.style.opacity = '0';
                  }}
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}
                >
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '12px', background: '#3b82f6', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1rem',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)', border: '2px solid white'
                  }}>
                    {user?.tennv?.charAt(0).toUpperCase() || user?.username?.charAt(0).toUpperCase()}
                  </div>

                  {/* Tooltip on hover */}
                  <div className="user-tooltip" style={{
                    position: 'absolute', top: '110%', right: '0', background: '#1e293b', color: 'white',
                    padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', whiteSpace: 'nowrap',
                    pointerEvents: 'none', opacity: '0', transition: '0.2s', zIndex: 1100, fontWeight: 600,
                    boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
                  }}>
                    {user?.tennv || user?.username} ({user?.role})
                    <div style={{ position: 'absolute', bottom: '100%', right: '14px', border: '6px solid transparent', borderBottomColor: '#1e293b' }}></div>
                  </div>
                </div>

                {/* Dropdown Menu */}
                {isUserMenuOpen && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 1050 }} onClick={() => setIsUserMenuOpen(false)}></div>
                    <div style={{
                      position: 'absolute', top: '120%', right: 0, background: 'white', width: '200px',
                      borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0',
                      overflow: 'hidden', zIndex: 1100, animation: 'contentFadeIn 0.2s ease'
                    }}>
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{user?.tennv || user?.username}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{user?.role}</div>
                      </div>
                      <div style={{ padding: '6px' }}>
                        <button
                          onClick={() => { setIsChangePassOpen(true); setIsUserMenuOpen(false); }}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                            border: 'none', background: 'none', borderRadius: '10px', color: '#475569',
                            cursor: 'pointer', transition: '0.2s', textAlign: 'left', fontWeight: 600, fontSize: '0.85rem'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                        >
                          <Key size={16} color="#6366f1" /> Đổi mật khẩu
                        </button>
                        <button
                          onClick={handleLogout}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                            border: 'none', background: 'none', borderRadius: '10px', color: '#ef4444',
                            cursor: 'pointer', transition: '0.2s', textAlign: 'left', fontWeight: 600, fontSize: '0.85rem'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                        >
                          <LogOut size={16} /> Đăng xuất
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
        <div className="card-container">
          <div className="placeholder-card" style={{
            padding: ['finances', 'students', 'student_list', 'debts', 'employees', 'overview', 'invoices', 'sales', 'tasks', 'config'].includes(currentTab?.id) ? '0' : '0',
            background: ['finances', 'students', 'student_list', 'debts', 'employees', 'overview', 'invoices', 'sales', 'tasks', 'config'].includes(currentTab?.id) ? 'transparent' : 'white',
            boxShadow: ['finances', 'students', 'student_list', 'debts', 'employees', 'overview', 'invoices', 'sales', 'tasks', 'config'].includes(currentTab?.id) ? 'none' : '0 4px 20px rgba(0,0,0,0.03)',
            border: ['finances', 'students', 'student_list', 'debts', 'employees', 'overview', 'invoices', 'sales', 'tasks', 'config'].includes(currentTab?.id) ? 'none' : '1px solid #f1f5f9'
          }}>
            {currentTab?.id === 'overview' && <Overview setActiveTab={setActiveTab} setActiveSubTab={setActiveSubTab} />}
            {currentTab?.id === 'statistics' && <Statistics />}
            {currentTab?.id === 'chat' && <ChatManager currentUser={user} />}
            {currentTab?.id === 'finances' && <FinanceManager activeSubTab={activeSubTab} setActiveSubTab={setActiveSubTab} currentUser={user} />}
            {currentTab?.id === 'invoices' && <InvoiceManager />}
            {currentTab?.id === 'sales' && activeSubTab === 'pos' && <SalesPOS />}
            {currentTab?.id === 'sales' && activeSubTab === 'products' && <ProductManager currentUser={user} />}
            {currentTab?.id === 'tasks' && <TaskManager />}
            {currentTab?.id === 'student_list' && <StudentManager activeSubTab="students" />}
            {currentTab?.id === 'students' && <StudentManager activeSubTab={activeSubTab} />}
            {currentTab?.id === 'debts' && <DebtManager />}
            {currentTab?.id === 'employees' && <EmployeeManager currentUser={user} />}
            {currentTab?.id === 'system_logs' && <SystemLogs />}
            {currentTab?.id === 'config' && <ConfigManager />}
          </div>
        </div>
      </div>
    );
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!changePassData.oldPass || !changePassData.newPass || !changePassData.confirmPass) {
      setChangePassMessage({ type: 'error', text: 'Vui lòng nhập đầy đủ thông tin' });
      return;
    }
    if (changePassData.newPass !== changePassData.confirmPass) {
      setChangePassMessage({ type: 'error', text: 'Mật khẩu mới không khớp' });
      return;
    }
    if (changePassData.oldPass !== user.password) {
      setChangePassMessage({ type: 'error', text: 'Mật khẩu cũ không đúng' });
      return;
    }

    setChangePassLoading(true);
    setChangePassMessage({ type: '', text: '' });

    try {
      const { error } = await supabase
        .from('tbl_nv')
        .update({ password: changePassData.newPass })
        .eq('manv', user.manv);

      if (error) throw error;

      setChangePassMessage({ type: 'success', text: 'Đổi mật khẩu thành công!' });
      // Update local user state
      const updatedUser = { ...user, password: changePassData.newPass };
      setUser(updatedUser);
      // Update session
      const sessionStr = localStorage.getItem('auth_session');
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        session.user = updatedUser;
        localStorage.setItem('auth_session', JSON.stringify(session));
      }

      setTimeout(() => {
        setIsChangePassOpen(false);
        setChangePassData({ oldPass: '', newPass: '', confirmPass: '' });
        setChangePassMessage({ type: '', text: '' });
      }, 1500);
    } catch (err) {
      console.error(err);
      setChangePassMessage({ type: 'error', text: 'Lỗi khi cập nhật mật khẩu' });
    } finally {
      setChangePassLoading(false);
    }
  };

  if (!user) return null; // Or a loading spinner

  return (
    <div className="dashboard-layout">
      {/* Mobile Overlay */}
      {mobileOpen && <div className="mobile-overlay" onClick={() => setMobileOpen(false)}></div>}

      {/* Sidebar */}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-mark" style={{ background: 'transparent' }}>
              <img
                src={config?.logo || ''}
                alt="Logo"
                style={{ width: '32px', height: '32px', objectFit: 'contain', borderRadius: '4px' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
            {!collapsed && <span className="logo-text">{config?.tenweb || 'EASY4SCHOOL'}</span>}
          </div>
          <button className="collapse-btn hidden-mobile" onClick={() => setCollapsed(!collapsed)}>
            <Menu size={20} />
          </button>
          <button className="close-btn hidden-desktop" onClick={() => setMobileOpen(false)}>
            <X size={24} />
          </button>
        </div>

        <div className="sidebar-nav">
          <h4 className="nav-title">{!collapsed ? 'MENU CHÍNH' : 'MENU'}</h4>
          <ul>
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <li key={tab.id} className="nav-item-wrapper">
                  <button
                    className={`nav-btn ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab(tab.id);
                      if (tab.subTabs && tab.subTabs.length > 0) {
                        setActiveSubTab(tab.subTabs[0].id);
                      }
                      if (!tab.subTabs) {
                        setMobileOpen(false);
                      }
                    }}
                  >
                    <Icon size={20} className="nav-icon" />
                    {!collapsed && <span className="nav-label">{tab.label}</span>}
                    {!collapsed && tab.id === 'chat' && unreadChatCount > 0 && (
                      <div style={{ marginLeft: 'auto', background: '#ef4444', color: 'white', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', fontWeight: 'bold' }}>
                        +{unreadChatCount}
                      </div>
                    )}
                  </button>

                  {/* Render SubTabs */}
                  {isActive && tab.subTabs && !collapsed && (
                    <div className="subtabs-sidebar">
                      {tab.subTabs.map(subTab => (
                        <button
                          key={subTab.id}
                          className={`sidebar-subtab-btn ${activeSubTab === subTab.id ? 'active' : ''}`}
                          onClick={() => {
                            setActiveSubTab(subTab.id);
                            setMobileOpen(false);
                          }}
                        >
                          <div className="subtab-dot"></div>
                          <span>{subTab.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {!collapsed && (
          <div className="sidebar-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '15px', color: '#64748b', fontSize: '0.75rem', textAlign: 'center' }}>
            EASY4SCHOOL &copy; {new Date().getFullYear()}
          </div>
        )}
      </aside>

      {/* Change Password Modal */}
      {isChangePassOpen && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={20} className="text-primary" /> Đổi Mật Khẩu
              </h3>
              <button className="close-btn" onClick={() => setIsChangePassOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {changePassMessage.text && (
                <div className={`message-alert ${changePassMessage.type}`} style={{ marginBottom: '1.5rem' }}>
                  <span>{changePassMessage.text}</span>
                </div>
              )}
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Mật khẩu cũ</label>
                  <input
                    type="password"
                    value={changePassData.oldPass}
                    onChange={e => setChangePassData({ ...changePassData, oldPass: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Mật khẩu mới</label>
                  <input
                    type="password"
                    value={changePassData.newPass}
                    onChange={e => setChangePassData({ ...changePassData, newPass: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Xác nhận mật khẩu mới</label>
                  <input
                    type="password"
                    value={changePassData.confirmPass}
                    onChange={e => setChangePassData({ ...changePassData, confirmPass: e.target.value })}
                    required
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setIsChangePassOpen(false)} style={{ flex: 1 }}>Hủy</button>
                  <button type="submit" className="btn btn-primary" disabled={changePassLoading} style={{ flex: 2 }}>
                    {changePassLoading ? 'Đang lưu...' : 'Lưu mật khẩu'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="main-content">
        <div className="mobile-top-bar hidden-desktop">
          <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)}>
            <Menu size={24} />
          </button>

          <div className="mobile-top-title">
            {ALL_TABS.find(t => t.id === activeTab)?.label}
          </div>

          <div className="user-profile compact" onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} style={{ cursor: 'pointer', position: 'relative' }}>
            <div className="avatar">
              {user?.tennv ? user.tennv.charAt(0).toUpperCase() : user?.username?.charAt(0).toUpperCase()}
            </div>
            {/* Dropdown Menu Mobile */}
            {isUserMenuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 1050 }} onClick={(e) => { e.stopPropagation(); setIsUserMenuOpen(false); }}></div>
                <div style={{
                  position: 'absolute', top: '120%', right: 0, background: 'white', width: '200px',
                  borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0',
                  overflow: 'hidden', zIndex: 1100, animation: 'contentFadeIn 0.2s ease'
                }} onClick={e => e.stopPropagation()}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{user?.tennv || user?.username}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{user?.role}</div>
                  </div>
                  <div style={{ padding: '6px' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setIsChangePassOpen(true); setIsUserMenuOpen(false); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                        border: 'none', background: 'none', borderRadius: '10px', color: '#475569',
                        cursor: 'pointer', transition: '0.2s', textAlign: 'left', fontWeight: 600, fontSize: '0.85rem'
                      }}
                    >
                      <Key size={16} color="#6366f1" /> Đổi mật khẩu
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleLogout(); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                        border: 'none', background: 'none', borderRadius: '10px', color: '#ef4444',
                        cursor: 'pointer', transition: '0.2s', textAlign: 'left', fontWeight: 600, fontSize: '0.85rem'
                      }}
                    >
                      <LogOut size={16} /> Đăng xuất
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        {renderContent()}
      </main>
    </div>
  );
}

export default Dashboard;
