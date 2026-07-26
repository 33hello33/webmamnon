import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';
import './components/ParentPremiumUI.css';
import './components/ChatManager.css';
import { supabase, supabaseCs1, supabaseCs2, setActiveSchema, getActiveSchema } from './supabase';
import { useConfig } from './ConfigContext';
import { User, Lock, Loader2, LogIn, AlertCircle, CheckCircle2, Search, Building } from 'lucide-react';
import ParentPortal from './components/ParentPortal';
import TeacherPortal from './components/TeacherPortal';
import { enrichParentChildren, fetchParentStudentPortalData } from './utils/parentPortalData';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_MONTH_MS = 30 * ONE_DAY_MS;
const TEACHER_PORTAL_ROLES = ['Giáo viên', 'Giáo viên BM'];

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
   const [pendingManagerUser, setPendingManagerUser] = useState(null);
   const [cs1Config, setCs1Config] = useState(null);

   useEffect(() => {
      supabaseCs1.from('tbl_config').select('*').maybeSingle().then(({ data }) => {
         if (data) setCs1Config(data);
      });
   }, []);

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
      schema: getActiveSchema(),
      loginType: TEACHER_PORTAL_ROLES.includes(user?.role) ? 'attendance' : 'dashboard'
   });

   const persistAuthSession = (user) => {
      localStorage.setItem('auth_session', JSON.stringify(buildAuthSession(user)));
   };

   const buildParentSession = (parentSessionData, loginUsername, loginPassword) => ({
      data: parentSessionData,
      username: loginUsername || '',
      password: loginPassword || '',
      loginTime: Date.now(),
      schema: getActiveSchema()
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

      const teacherIds = [user?.manv, user?.username, user?.tennv, user?.id]
         .map(value => String(value || '').trim())
         .filter(Boolean);
      const teacherFields = [
         'manv',
         ...Array.from({ length: Math.max(0, parseInt(config?.sonhanvientrogiang || '0', 10) || 0) }, (_, index) => `manv${index + 1}`),
         'manv4'
      ];
      const teacherClasses = (allCls || []).filter((c) =>
         teacherFields.some((field) => {
            const fieldValue = String(c?.[field] || '').trim();
            return fieldValue !== '' && teacherIds.includes(fieldValue);
         })
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
      const [res1, res2] = await Promise.all([
         supabaseCs1.from('tbl_nv').select('*').eq('username', loginUsername).eq('password', loginPassword).maybeSingle(),
         supabaseCs2.from('tbl_nv').select('*').eq('username', loginUsername).eq('password', loginPassword).maybeSingle()
      ]);

      if (res1.error && res2.error) throw new Error('Lỗi kết nối cơ sở dữ liệu.');

      const user1 = res1.data && res1.data.trangthai !== 'Đã Nghỉ' ? res1.data : null;
      const user2 = res2.data && res2.data.trangthai !== 'Đã Nghỉ' ? res2.data : null;

      if (!user1 && !user2) {
         if (res1.data?.trangthai === 'Đã Nghỉ' || res2.data?.trangthai === 'Đã Nghỉ') {
            return { ok: false, reason: 'inactive' };
         }
         return { ok: false, reason: 'invalid' };
      }

      const user = user1 || user2;
      const isManager = String(user?.role || '').trim().toLowerCase() === 'quản lý';

      if (isManager) {
         return { ok: true, isManager: true, user, user1, user2 };
      }

      const matchedSchema = user1 ? 'anchau' : 'golden';
      setActiveSchema(matchedSchema);
      return { ok: true, isManager: false, user, schema: matchedSchema };
   };

   const completeStaffLogin = async (user, options = {}) => {
      const { showSuccessMessage = true } = options;
      persistAuthSession(user);

      if (TEACHER_PORTAL_ROLES.includes(user?.role)) {
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

      if (session.schema) {
         setActiveSchema(session.schema);
      }

      const result = await authenticateStaff(savedUsername, savedPassword);
      if (!result.ok) {
         clearAuthSession();
         return false;
      }

      if (result.isManager) {
         if (session.schema) {
            setActiveSchema(session.schema);
         }
      }

      await completeStaffLogin(result.user, { showSuccessMessage: false });
      return true;
   };

   const authenticateParent = async (loginUsername, loginPassword) => {
      const [res1, res2] = await Promise.all([
         supabaseCs1.from('tbl_hv').select('*').eq('username', loginUsername).eq('password', loginPassword).order('tenhv', { ascending: true }),
         supabaseCs2.from('tbl_hv').select('*').eq('username', loginUsername).eq('password', loginPassword).order('tenhv', { ascending: true })
      ]);

      if (res1.error && res2.error) throw new Error('Lỗi hệ thống khi tra cứu dữ liệu.');

      const students1 = (res1.data || []).filter((student) => student?.trangthai !== 'Đã Nghỉ');
      const students2 = (res2.data || []).filter((student) => student?.trangthai !== 'Đã Nghỉ');

      if (students1.length === 0 && students2.length === 0) return { ok: false };

      const matchedSchema = students1.length > 0 ? 'anchau' : 'golden';
      const matchedStudents = students1.length > 0 ? students1 : students2;

      setActiveSchema(matchedSchema);
      return { ok: true, students: matchedStudents, schema: matchedSchema };
   };

   const completeParentLogin = async (studentRecords, loginUsername, loginPassword, options = {}) => {
      const children = await enrichParentChildren(supabase, studentRecords);
      const requestedStudentId = options.activeStudentId;
      const activeStudent = children.find((student) => student.mahv === requestedStudentId) || children[0];
      const parentDataObj = await fetchParentStudentPortalData(supabase, activeStudent);
      parentDataObj.children = children;
      parentDataObj.activeStudentId = parentDataObj.student?.mahv || activeStudent?.mahv || null;
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

      if (session.schema) {
         setActiveSchema(session.schema);
      }

      const result = await authenticateParent(savedUsername, savedPassword);
      if (!result.ok) {
         clearParentSession();
         return false;
      }

      await completeParentLogin(result.students, savedUsername, savedPassword, {
         activeStudentId: session?.data?.activeStudentId || session?.activeStudentId || session?.data?.student?.mahv || session?.student?.mahv
      });
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

            if (session.schema) {
               setActiveSchema(session.schema);
            }

            if (!session.loginTime || currentTime - session.loginTime < ONE_MONTH_MS) {
               if (!isCancelled) {
                  setParentData(session.data || session);
               }

               const savedUsername = session?.username || session?.data?.student?.username || '';
               const savedPassword = session?.password || session?.data?.student?.password || '';
               if (savedUsername && savedPassword) {
                  try {
                     const result = await authenticateParent(savedUsername, savedPassword);
                     if (result.ok && !isCancelled) {
                        await completeParentLogin(result.students, savedUsername, savedPassword, {
                           activeStudentId: session?.data?.activeStudentId || session?.activeStudentId || session?.data?.student?.mahv || session?.student?.mahv
                        });
                     }
                  } catch (refreshErr) {
                     console.warn('Background refresh thất bại, giữ dữ liệu cache:', refreshErr);
                  }
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

            if (session.schema) {
               setActiveSchema(session.schema);
            }

            if (currentTime - session.loginTime < ONE_DAY_MS) {
               if (session.loginType === 'attendance' || TEACHER_PORTAL_ROLES.includes(session.user?.role)) {
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

         await completeParentLogin(result.students, username, password);
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

         if (result.isManager) {
            setPendingManagerUser(result.user);
            setLoading(false);
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
                           src={cs1Config?.logo || config?.logo || '/logo.png'}
                           alt="Logo"
                           style={{ height: '70px', objectFit: 'contain' }}
                           onError={(e) => { e.target.style.display = 'none'; }}
                        />
                     </div>
                     <h2>{cs1Config?.tenweb || config?.tenweb || 'Hệ thống Quản lý'}</h2>
                     <p>{loginMode === 'login' ? (cs1Config?.motaweb || config?.motaweb || 'Truy cập hệ thống quản lý cơ sở') : loginMode === 'attendance' ? 'Đăng nhập ghi danh học sinh' : 'Nhập mã học sinh xem học phí & điểm danh'}</p>
                  </div>

                  {message.text && (
                     <div className={`message-alert ${message.type}`}>
                        {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                        <span>{message.text}</span>
                     </div>
                  )}

                  {pendingManagerUser ? (
                     <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem', color: '#4f46e5' }}>
                           <Building size={40} />
                        </div>
                        <h3 style={{ marginBottom: '0.5rem', color: '#1e293b', fontSize: '1.2rem', fontWeight: 600 }}>Chọn cơ sở để load dữ liệu</h3>
                        <p style={{ marginBottom: '1.5rem', color: '#64748b', fontSize: '0.9rem' }}>
                           Xin chào Quản lý <strong>{pendingManagerUser.tennv || pendingManagerUser.username}</strong>!
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                           <button
                              type="button"
                              className="submit-btn"
                              style={{ background: '#3b82f6', justifyContent: 'center', padding: '0.85rem' }}
                              onClick={async () => {
                                 setActiveSchema('anchau');
                                 await completeStaffLogin(pendingManagerUser);
                                 setPendingManagerUser(null);
                              }}
                           >
                              🏢 Cơ Sở An Châu
                           </button>
                           <button
                              type="button"
                              className="submit-btn"
                              style={{ background: '#8b5cf6', justifyContent: 'center', padding: '0.85rem' }}
                              onClick={async () => {
                                 setActiveSchema('golden');
                                 await completeStaffLogin(pendingManagerUser);
                                 setPendingManagerUser(null);
                              }}
                           >
                              🏢 Cơ Sở Golden
                           </button>
                           <button
                              type="button"
                              style={{ background: 'transparent', border: 'none', color: '#64748b', marginTop: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}
                              onClick={() => setPendingManagerUser(null)}
                           >
                              ← Quay lại đăng nhập
                           </button>
                        </div>
                     </div>
                  ) : (
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
                  )}
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
