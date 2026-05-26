import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';
import './components/ParentPremiumUI.css';
import './components/ChatManager.css';
import { supabase } from './supabase';
import { useConfig } from './ConfigContext';
import { User, Lock, Loader2, LogIn, AlertCircle, CheckCircle2, Search } from 'lucide-react';
import ParentPortal from './components/ParentPortal';
import TeacherPortal from './components/TeacherPortal';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_MONTH_MS = 30 * ONE_DAY_MS;

function Login() {
   const [username, setUsername] = useState('');
   const [password, setPassword] = useState('');
   const [loading, setLoading] = useState(false);
   const [message, setMessage] = useState({ type: '', text: '' });
   const { config } = useConfig();
   const navigate = useNavigate();

   const [loginMode, setLoginMode] = useState('parent');
   const [parentData, setParentData] = useState(null);

   const [attendanceUser, setAttendanceUser] = useState(null);
   const [attClasses, setAttClasses] = useState([]);
   const [attAllStudents, setAttAllStudents] = useState([]);

   const clearAuthSession = () => {
      localStorage.removeItem('auth_session');
   };

   const clearParentSession = () => {
      localStorage.removeItem('parent_session');
   };

   const buildAuthSession = (user) => ({
      user,
      username: user?.username || '',
      password: user?.password || '',
      loginTime: Date.now(),
      loginType: user?.role === 'Giáo viên' ? 'attendance' : 'dashboard'
   });

   const persistAuthSession = (user) => {
      localStorage.setItem('auth_session', JSON.stringify(buildAuthSession(user)));
   };

   const buildParentSession = (parentSessionData, loginUsername, loginPassword) => ({
      data: parentSessionData,
      username: loginUsername || '',
      password: loginPassword || '',
      loginTime: Date.now()
   });

   const persistParentSession = (parentSessionData, loginUsername, loginPassword) => {
      localStorage.setItem('parent_session', JSON.stringify(buildParentSession(parentSessionData, loginUsername, loginPassword)));
   };

   const preloadTeacherData = async (user) => {
      setAttendanceUser(user);
      setLoginMode('attendance');

      const { data: allCls } = await supabase
         .from('tbl_lop')
         .select('*')
         .or('daxoa.neq."Đã Xóa",daxoa.is.null');

      const teacherClasses = (allCls || []).filter(
         c => c.manv === user.manv || c.manv === user.username || c.manv === user.tennv || c.manv === user.id
      );
      setAttClasses(teacherClasses);

      if (teacherClasses.length > 0) {
         const classIds = teacherClasses.map(c => c.malop);
         const { data: allSts } = await supabase
            .from('tbl_hv')
            .select('mahv, tenhv, malop, imgpath')
            .in('malop', classIds)
            .or('trangthai.neq."Đã Nghỉ",trangthai.is.null');
         setAttAllStudents(allSts || []);
      } else {
         setAttAllStudents([]);
      }
   };

   const authenticateStaff = async (loginUsername, loginPassword) => {
      const { data, error } = await supabase
         .from('tbl_nv')
         .select('*')
         .eq('username', loginUsername)
         .eq('password', loginPassword)
         .maybeSingle();

      if (error) throw new Error('Lỗi kết nối cơ sở dữ liệu.');
      if (!data) return { ok: false, reason: 'invalid' };
      if (data.trangthai === 'Đã Nghỉ') return { ok: false, reason: 'inactive' };

      return { ok: true, user: data };
   };

   const completeStaffLogin = async (user, options = {}) => {
      const { showSuccessMessage = true } = options;
      persistAuthSession(user);

      if (user.role === 'Giáo viên') {
         await preloadTeacherData(user);
         if (showSuccessMessage) {
            setMessage({ type: 'success', text: 'Đăng nhập thành công!' });
         }
         return;
      }

      if (showSuccessMessage) {
         setMessage({ type: 'success', text: 'Đăng nhập thành công! Đang chuyển hướng...' });
      }
      navigate('/dashboard');
   };

   const tryAutoReLogin = async (session) => {
      const savedUsername = session?.username || session?.user?.username || '';
      const savedPassword = session?.password || session?.user?.password || '';

      if (!savedUsername) {
         clearAuthSession();
         return false;
      }

      setUsername(savedUsername);
      setPassword('');
      setLoginMode('login');

      if (!savedPassword) {
         clearAuthSession();
         return false;
      }

      const result = await authenticateStaff(savedUsername, savedPassword);
      if (!result.ok) {
         clearAuthSession();
         return false;
      }

      await completeStaffLogin(result.user, { showSuccessMessage: false });
      return true;
   };

   const fetchParentPortalData = async (studentRecord) => {
      const mahv = studentRecord.mahv;
      const { data: feeRows } = await supabase.from('tbl_thongbao').select('*').eq('mahv', mahv).order('ngaylap', { ascending: false }).limit(20);
      const { data: invoiceRows } = await supabase.from('tbl_hd').select('*').eq('mahv', mahv).order('ngaylap', { ascending: false }).limit(20);
      const { data: attendances } = await supabase.from('tbl_diemdanh').select('*').eq('mahv', mahv).order('ngay', { ascending: false }).limit(30);

      const isDeletedRecord = (record) => {
         const deletedValue = String(record?.daxoa || '').trim().toLowerCase();
         return deletedValue === 'đã xóa' || deletedValue === 'da xoa';
      };

      const feeData = (feeRows || []).find(row => !isDeletedRecord(row)) || null;
      const invoices = (invoiceRows || []).filter(row => !isDeletedRecord(row));

      let teacherManv = null;
      let tenLop = null;
      const { data: classData } = await supabase.from('tbl_lop').select('manv, tenlop').eq('malop', studentRecord.malop).maybeSingle();
      if (classData) {
         teacherManv = classData.manv;
         tenLop = classData.tenlop;
      } else {
         const { data: firstNv } = await supabase.from('tbl_nv').select('manv').limit(1).maybeSingle();
         teacherManv = firstNv?.manv || null;
      }

      let teacherInfo = null;
      if (teacherManv) {
         const { data: nvData } = await supabase.from('tbl_nv').select('tennv, role, sdt').eq('manv', teacherManv).maybeSingle();
         teacherInfo = nvData;
      }

      return {
         student: { ...studentRecord, tenlop: tenLop },
         latestFee: feeData || null,
         invoices: invoices || [],
         attendances: attendances || [],
         teacherManv,
         teacherInfo
      };
   };

   const authenticateParent = async (loginUsername, loginPassword) => {
      const { data, error } = await supabase
         .from('tbl_hv')
         .select('*')
         .eq('username', loginUsername)
         .eq('password', loginPassword)
         .maybeSingle();

      if (error) throw new Error('Lỗi hệ thống khi tra cứu dữ liệu.');
      if (!data) return { ok: false };

      return { ok: true, student: data };
   };

   const completeParentLogin = async (studentRecord, loginUsername, loginPassword) => {
      const parentDataObj = await fetchParentPortalData(studentRecord);
      setParentData(parentDataObj);
      persistParentSession(parentDataObj, loginUsername, loginPassword);
   };

   const tryAutoParentReLogin = async (session) => {
      const savedUsername = session?.username || session?.data?.student?.username || '';
      const savedPassword = session?.password || session?.data?.student?.password || '';

      if (!savedUsername) {
         clearParentSession();
         return false;
      }

      setUsername(savedUsername);
      setPassword('');
      setLoginMode('parent');

      if (!savedPassword) {
         clearParentSession();
         return false;
      }

      const result = await authenticateParent(savedUsername, savedPassword);
      if (!result.ok) {
         clearParentSession();
         return false;
      }

      await completeParentLogin(result.student, savedUsername, savedPassword);
      return true;
   };

   useEffect(() => {
      const theme = localStorage.getItem('app_theme') || 'kindergarten';
      document.body.setAttribute('data-theme', theme);

      let isCancelled = false;

      const restoreParentSession = async () => {
         const savedSession = localStorage.getItem('parent_session');
         if (!savedSession) return;

         try {
            const session = JSON.parse(savedSession);
            const currentTime = Date.now();

            if (!session.loginTime || currentTime - session.loginTime < ONE_MONTH_MS) {
               if (!isCancelled) {
                  setParentData(session.data || session);
               }
               return;
            }

            const relogged = await tryAutoParentReLogin(session);
            if (!relogged && !isCancelled) {
               setMessage({ type: 'error', text: 'Phiên phụ huynh đã hết hạn. Vui lòng nhập lại mật khẩu.' });
            }
         } catch (e) {
            clearParentSession();
         }
      };

      restoreParentSession();

      return () => {
         isCancelled = true;
      };
   }, []);

   useEffect(() => {
      let isCancelled = false;

      const restoreStaffSession = async () => {
         const sessionStr = localStorage.getItem('auth_session');
         if (!sessionStr) return;

         try {
            const session = JSON.parse(sessionStr);
            const currentTime = Date.now();

            if (currentTime - session.loginTime < ONE_DAY_MS) {
               if (session.loginType === 'attendance' || session.user?.role === 'Giáo viên') {
                  if (!isCancelled) {
                     await preloadTeacherData(session.user);
                  }
                  return;
               }

               navigate('/dashboard');
               return;
            }

            const relogged = await tryAutoReLogin(session);
            if (!relogged && !isCancelled) {
               setMessage({ type: 'error', text: 'Phiên đăng nhập đã hết hạn. Vui lòng nhập lại mật khẩu.' });
            }
         } catch (e) {
            clearAuthSession();
         }
      };

      restoreStaffSession();

      return () => {
         isCancelled = true;
      };
   }, [navigate]);

   const handleParentLogin = async (e) => {
      e.preventDefault();
      if (!username || !password) {
         setMessage({ type: 'error', text: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.' });
         return;
      }

      setLoading(true);
      setMessage({ type: '', text: '' });
      try {
         const result = await authenticateParent(username, password);

         if (!result.ok) {
            setMessage({ type: 'error', text: 'Tên đăng nhập hoặc mật khẩu phụ huynh không đúng.' });
            setLoading(false);
            return;
         }

         await completeParentLogin(result.student, username, password);
      } catch (err) {
         console.error(err);
         setMessage({ type: 'error', text: 'Lỗi hệ thống khi tra cứu dữ liệu.' });
      }
      setLoading(false);
   };

   const handleLogin = async (e) => {
      e.preventDefault();
      if (!username || !password) {
         setMessage({ type: 'error', text: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.' });
         return;
      }

      setLoading(true);
      setMessage({ type: '', text: '' });

      try {
         const result = await authenticateStaff(username, password);
         if (!result.ok) {
            if (result.reason === 'inactive') {
               setMessage({ type: 'error', text: 'Tài khoản đã nghỉ việc.' });
            } else {
               setMessage({ type: 'error', text: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
            }
            return;
         }

         await completeStaffLogin(result.user);
      } catch (err) {
         console.error(err);
         setMessage({ type: 'error', text: err.message || 'Đã xảy ra lỗi không xác định.' });
      } finally {
         setLoading(false);
      }
   };

   return (
      <div className="app-container">
         <div id="login-box-target" className="login-box" style={{
            maxWidth: parentData || (loginMode === 'attendance' && attendanceUser) ? '1200px' : '400px',
            width: '95%',
            transition: 'all 0.3s ease',
            padding: parentData || (loginMode === 'attendance' && attendanceUser) ? '1rem' : '3rem',
            margin: parentData || (loginMode === 'attendance' && attendanceUser) ? '1rem auto' : '2rem auto',
            height: parentData || (loginMode === 'attendance' && attendanceUser) ? 'calc(100vh - 2rem)' : 'auto',
            display: 'flex',
            flexDirection: 'column',
            overflow: parentData || (loginMode === 'attendance' && attendanceUser) ? 'auto' : 'visible'
         }}>

            {!parentData && !(loginMode === 'attendance' && attendanceUser) && (
               <div className="login-tabs" style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {config?.phuhuynh && (
                     <button
                        type="button"
                        className={`login-tab-btn ${loginMode === 'parent' ? 'active' : ''}`}
                        onClick={() => { setLoginMode('parent'); setMessage({ type: '', text: '' }); }}
                        style={{ flex: 1, minWidth: '90px', padding: '0.5rem 0', background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.9rem' }}>
                        Phụ Huynh
                     </button>
                  )}
                  <button
                     type="button"
                     className={`login-tab-btn ${loginMode === 'login' || loginMode === 'attendance' ? 'active' : ''}`}
                     onClick={() => { setLoginMode('login'); setMessage({ type: '', text: '' }); }}
                     style={{ flex: 1, minWidth: '90px', padding: '0.5rem 0', background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.9rem' }}>
                     Giáo Viên
                  </button>
               </div>
            )}

            {!(loginMode === 'attendance' && attendanceUser) && !parentData ? (
               <>
                  <div className="login-header">
                     <div className="logo-container" style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                        <img
                           src={config?.logo || '/logo.png'}
                           alt="Logo"
                           style={{ height: '70px', objectFit: 'contain' }}
                           onError={(e) => { e.target.style.display = 'none'; }}
                        />
                     </div>
                     <h2>{config?.tenweb || 'Hệ thống Quản lý'}</h2>
                     <p>{loginMode === 'login' ? (config?.motaweb || 'Truy cập hệ thống quản lý cơ sở') : loginMode === 'attendance' ? 'Đăng nhập ghi danh học sinh' : 'Nhập mã học sinh xem học phí & điểm danh'}</p>
                  </div>

                  {message.text && (
                     <div className={`message-alert ${message.type}`}>
                        {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                        <span>{message.text}</span>
                     </div>
                  )}

                  <form onSubmit={loginMode === 'login' ? handleLogin : handleParentLogin} className="login-form">
                     <div className="input-group">
                        <div className="input-icon"><User size={18} /></div>
                        <input type="text" placeholder={loginMode === 'login' ? 'Tên đăng nhập nhân viên' : 'Tên đăng nhập phụ huynh'} value={username} onChange={(e) => setUsername(e.target.value)} />
                     </div>

                     <div className="input-group">
                        <div className="input-icon"><Lock size={18} /></div>
                        <input type="password" placeholder="Mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} />
                     </div>

                     <button type="submit" className={`submit-btn ${loading ? 'loading' : ''}`} disabled={loading} style={loginMode === 'parent' ? { background: '#10b981' } : {}}>
                        {loading ? <Loader2 className="spinner" size={20} /> : (
                           <>
                              <span>{loginMode === 'parent' ? 'Vào Tra Cứu' : 'Đăng Nhập'}</span>
                              {loginMode === 'parent' ? <Search size={18} /> : <LogIn size={18} />}
                           </>
                        )}
                     </button>
                  </form>
               </>
            ) : loginMode === 'attendance' && attendanceUser ? (
               <TeacherPortal
                  attendanceUser={attendanceUser}
                  initialClasses={attClasses}
                  initialAllStudents={attAllStudents}
                  onLogout={() => {
                     if ('clearAppBadge' in navigator) {
                        navigator.clearAppBadge().catch(console.error);
                     }
                     clearAuthSession();
                     setAttendanceUser(null);
                     setAttClasses([]);
                     setAttAllStudents([]);
                     setLoginMode('login');
                     setUsername('');
                     setPassword('');
                  }}
               />
            ) : (
               <ParentPortal
                  parentData={parentData}
                  setParentData={(data) => {
                     if (!data && 'clearAppBadge' in navigator) {
                        navigator.clearAppBadge().catch(console.error);
                     }
                     setParentData(data);
                     if (!data) localStorage.removeItem('parent_session');
                  }}
               />
            )}
         </div>
      </div>
   );
}

export default Login;
