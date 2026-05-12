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

function Login() {
   const [username, setUsername] = useState('');
   const [password, setPassword] = useState('');
   const [loading, setLoading] = useState(false);
   const [message, setMessage] = useState({ type: '', text: '' });
   const { config } = useConfig();
   const navigate = useNavigate();

   const [loginMode, setLoginMode] = useState('login'); // 'login' | 'parent' | 'attendance'
   const [parentData, setParentData] = useState(null);
   
   const [attendanceUser, setAttendanceUser] = useState(null);
   const [attClasses, setAttClasses] = useState([]);
   const [attAllStudents, setAttAllStudents] = useState([]);

   useEffect(() => {
      const theme = localStorage.getItem('app_theme') || 'kindergarten';
      document.body.setAttribute('data-theme', theme);

      const savedSession = localStorage.getItem('parent_session');
      if (savedSession) {
         try {
            const session = JSON.parse(savedSession);
            if (Date.now() < session.expiry) {
               setParentData(session.data);
            } else {
               localStorage.removeItem('parent_session');
            }
         } catch (e) {
            localStorage.removeItem('parent_session');
         }
      }
   }, []);

   useEffect(() => {
      const sessionStr = localStorage.getItem('auth_session');
      if (sessionStr) {
         try {
            const session = JSON.parse(sessionStr);
            const currentTime = new Date().getTime();
            const oneHour = 60 * 60 * 1000;
            if (currentTime - session.loginTime < oneHour) {
               navigate('/dashboard');
            } else {
               localStorage.removeItem('auth_session');
            }
         } catch (e) {
            localStorage.removeItem('auth_session');
         }
      }
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
         const { data: stData, error: stErr } = await supabase
            .from('tbl_hv')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .maybeSingle();

         if (stErr || !stData) {
            setMessage({ type: 'error', text: 'Tên đăng nhập hoặc mật khẩu phụ huynh không đúng.' });
            setLoading(false);
            return;
         }

         const mahv = stData.mahv;
         const { data: feeData } = await supabase.from('tbl_thongbao').select('*').eq('mahv', mahv).order('ngaylap', { ascending: false }).limit(1).maybeSingle();
         const { data: invoices } = await supabase.from('tbl_hd').select('*').eq('mahv', mahv).or('daxoa.neq."Đã xóa",daxoa.is.null').order('ngaylap', { ascending: false }).limit(10);
         const { data: attendances } = await supabase.from('tbl_diemdanh').select('*').eq('mahv', mahv).order('ngay', { ascending: false }).limit(30);

         let teacherManv = null;
         const { data: classData } = await supabase.from('tbl_lop').select('manv').eq('malop', stData.malop).maybeSingle();
         if (classData?.manv) {
            teacherManv = classData.manv;
         } else {
            const { data: firstNv } = await supabase.from('tbl_nv').select('manv').limit(1).maybeSingle();
            teacherManv = firstNv?.manv || null;
         }

         let teacherInfo = null;
         if (teacherManv) {
            const { data: nvData } = await supabase.from('tbl_nv').select('tennv, role, sdt').eq('manv', teacherManv).maybeSingle();
            teacherInfo = nvData;
         }

         const parentDataObj = {
            student: stData,
            latestFee: feeData || null,
            invoices: invoices || [],
            attendances: attendances || [],
            teacherManv: teacherManv,
            teacherInfo: teacherInfo
         };
         setParentData(parentDataObj);

         localStorage.setItem('parent_session', JSON.stringify({
            data: parentDataObj,
            expiry: Date.now() + (60 * 60 * 1000)
         }));
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
      setLoading(true); setMessage({ type: '', text: '' });
      try {
         const { data, error } = await supabase.from('tbl_nv').select('*').eq('username', username).eq('password', password);
         if (error) {
            setMessage({ type: 'error', text: 'Lỗi kết nối cơ sở dữ liệu.' });
         } else if (data && data.length > 0) {
            const user = data[0];
            if (user.trangthai === 'Đã Nghỉ') {
               setMessage({ type: 'error', text: 'Tài khoản đã nghỉ việc.' });
            } else if (user.role === 'Giáo viên') {
               setAttendanceUser(user);
               setLoginMode('attendance');
               const { data: allCls } = await supabase.from('tbl_lop').select('*').or('daxoa.neq."Đã Xóa",daxoa.is.null');
               if (allCls) {
                  const teacherClasses = allCls.filter(c => c.manv === user.manv || c.manv === user.username || c.manv === user.tennv || c.manv === user.id);
                  setAttClasses(teacherClasses);
                  
                  if (teacherClasses.length > 0) {
                     const classIds = teacherClasses.map(c => c.malop);
                     const { data: allSts } = await supabase.from('tbl_hv').select('mahv, tenhv, malop, imgpath').in('malop', classIds).or('trangthai.neq."Đã Nghỉ",trangthai.is.null');
                     if (allSts) setAttAllStudents(allSts);
                  }
               }
               setMessage({ type: 'success', text: 'Đăng nhập thành công!' });
            } else {
               setMessage({ type: 'success', text: `Đăng nhập thành công! Đang chuyển hướng...` });
               const sessionData = { user, loginTime: new Date().getTime() };
               localStorage.setItem('auth_session', JSON.stringify(sessionData));
               setTimeout(() => navigate('/dashboard'), 1000);
            }
         } else {
            setMessage({ type: 'error', text: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
         }
      } catch (err) {
         console.error(err);
         setMessage({ type: 'error', text: 'Đã xảy ra lỗi không xác định.' });
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
                  <button
                     type="button"
                     className={`login-tab-btn ${loginMode === 'login' || loginMode === 'attendance' ? 'active' : ''}`}
                     onClick={() => { setLoginMode('login'); setMessage({ type: '', text: '' }); }}
                     style={{ flex: 1, minWidth: '90px', padding: '0.5rem 0', background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.9rem' }}>
                     Nhân Viên
                  </button>
                  {config?.phuhuynh && (
                     <button
                        type="button"
                        className={`login-tab-btn ${loginMode === 'parent' ? 'active' : ''}`}
                        onClick={() => { setLoginMode('parent'); setMessage({ type: '', text: '' }); }}
                        style={{ flex: 1, minWidth: '90px', padding: '0.5rem 0', background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.9rem' }}>
                        Phụ Huynh
                     </button>
                  )}
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
                        <input type="text" placeholder={loginMode === 'login' ? "Tên đăng nhập nhân viên" : "Tên đăng nhập phụ huynh"} value={username} onChange={(e) => setUsername(e.target.value)} />
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
                     setAttendanceUser(null);
                     setPassword('');
                  }}
               />
            ) : (
               <ParentPortal
                  parentData={parentData}
                  setParentData={(data) => {
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
