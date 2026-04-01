import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';
import { supabase } from './supabase';
import { useConfig } from './ConfigContext';
import { User, Lock, Loader2, LogIn, AlertCircle, CheckCircle2, Search, Key, X, LogOut, Users, Download } from 'lucide-react';

function Login() {
   const [username, setUsername] = useState('');
   const [password, setPassword] = useState('');
   const [loading, setLoading] = useState(false);
   const [message, setMessage] = useState({ type: '', text: '' });
   const { config } = useConfig();
   const navigate = useNavigate();

   // ----- Parent Module States -----
   const [loginMode, setLoginMode] = useState('login'); // 'login' | 'parent' | 'attendance'
   const [parentMahv, setParentMahv] = useState('');
   const [parentData, setParentData] = useState(null);
   const [parentTab, setParentTab] = useState('fee-tab'); // 'fee-tab' | 'attendance-tab' | 'chat-tab'
   const [chatMessages, setChatMessages] = useState([]);
   const [chatLoading, setChatLoading] = useState(false);
   const [chatInput, setChatInput] = useState('');
   const [chatDocuments, setChatDocuments] = useState([]);

   // ----- Attendance Features -----
   const [attendanceUser, setAttendanceUser] = useState(null);
   const [attDate, setAttDate] = useState(() => {
      const d = new Date();
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().split('T')[0];
   });
   const [attClasses, setAttClasses] = useState([]);
   const [attSelectedClass, setAttSelectedClass] = useState('');
   const [attStudents, setAttStudents] = useState([]);
   const [attRecords, setAttRecords] = useState({});
   const [lessonContent, setLessonContent] = useState('');
   const [isChangePassOpen, setIsChangePassOpen] = useState(false);
   const [changePassData, setChangePassData] = useState({ oldPass: '', newPass: '', confirmPass: '' });
   const [changePassLoading, setChangePassLoading] = useState(false);
   const [changePassMessage, setChangePassMessage] = useState({ type: '', text: '' });

   const getWalletsFromConfig = () => {
      if (!config) return [];
      const wallets = [];
      if (config.vi1?.name) wallets.push(config.vi1);
      if (config.vi2?.name) wallets.push(config.vi2);
      if (config.vi3?.name) wallets.push(config.vi3);
      if (config.vi4?.name) wallets.push(config.vi4);
      return wallets;
   };
   const wallets = getWalletsFromConfig();
   const getQRUrl = () => {
      const fee = parentData?.latestFee;
      if (!fee) return '';
      console.log(fee);
      const matched = wallets.find(w =>
         fee.hinhthuc?.includes(w.name)
      );

      if (!matched) return '';

      let nameSuffix = '';
      if (parentData?.student?.tenhv) {
         const parts = parentData.student.tenhv.trim().split(' ');
         nameSuffix = parts.length >= 2 ? ' ' + parts.slice(-2).join(' ') : ' ' + parentData.student.tenhv;
      }

      return `https://img.vietqr.io/image/${matched.bankId}-${matched.accNo}-compact2.png
?amount=${encodeURIComponent((fee.tongcong || "0").replace(/,/g, ""))}
&addInfo=${encodeURIComponent(parentMahv + nameSuffix)}
&accountName=${encodeURIComponent(matched.accName)}`;

   };
   const formatMonthYear = (dateStr) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
   };

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
         setParentMahv(mahv);

         const { data: feeData } = await supabase
            .from('tbl_thongbao')
            .select('*')
            .eq('mahv', mahv)
            .order('ngaylap', { ascending: false })
            .limit(1)
            .maybeSingle();

         const { data: invoices } = await supabase
            .from('tbl_hd')
            .select('*')
            .eq('mahv', mahv)
            .neq('daxoa', 'Đã xóa')
            .order('ngaylap', { ascending: false })
            .limit(10);

         const { data: attendances } = await supabase
            .from('tbl_diemdanh')
            .select('*')
            .eq('mahv', mahv)
            .order('ngay', { ascending: false })
            .limit(30);

         // Lấy thông tin giáo viên phụ trách lớp
         let teacherManv = null;
         const { data: classData } = await supabase
            .from('tbl_lop')
            .select('manv')
            .eq('malop', stData.malop)
            .maybeSingle();

         if (classData?.manv) {
            teacherManv = classData.manv;
         } else {
            // Nếu lớp chưa có GV hoặc học sinh chưa vào lớp, lấy đại 1 NV bất kỳ làm mặc định
            const { data: firstNv } = await supabase
               .from('tbl_nv')
               .select('manv')
               .limit(1)
               .maybeSingle();
            teacherManv = firstNv?.manv || null;
         }

         setParentData({
            student: stData,
            latestFee: feeData || null,
            invoices: invoices || [],
            attendances: attendances || [],
            teacherManv: teacherManv
         });
         setParentTab('fee-tab');

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
               // Chế độ Điểm danh
               setAttendanceUser(user);
               setLoginMode('attendance');
               const { data: allCls } = await supabase.from('tbl_lop').select('*').neq('daxoa', 'Đã Xóa');
               if (allCls) {
                  setAttClasses(allCls.filter(c => c.manv === user.manv || c.manv === user.username || c.manv === user.tennv || c.manv === user.id));
               }
               setMessage({ type: 'success', text: 'Đăng nhập thành công!' });
            } else {
               // Chế độ Quản lý / Nhân viên VP
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

   useEffect(() => {
      const loadData = async () => {
         if (!attSelectedClass) { setAttStudents([]); setAttRecords({}); setLessonContent(''); return; }

         // Lấy danh sách mahv từ bảng tbl_hv (Thay thế tbl_lichhoc_hv)
         const { data: stFound } = await supabase.from('tbl_hv').select('mahv, tenhv').eq('malop', attSelectedClass).neq('trangthai', 'Đã Nghỉ');
         const studentsFound = stFound || [];
         setAttStudents(studentsFound);

         const { data: rec } = await supabase.from('tbl_diemdanh').select('*').eq('malop', attSelectedClass).eq('ngay', attDate);
         const rMap = {};
         studentsFound.forEach(student => {
            const existing = (rec || []).find(r => r.mahv === student.mahv);
            if (existing) {
               rMap[student.mahv] = { trangthai: existing.trangthai, ghichu: existing.ghichu, id: existing.id };
            } else {
               rMap[student.mahv] = { trangthai: 'Có mặt', ghichu: '' };
            }
         });
         setAttRecords(rMap);

         // Tải nội dung dạy
         const { data: nd } = await supabase.from('tbl_noidungday').select('noidungday').eq('malop', attSelectedClass).eq('ngay', attDate).maybeSingle();
         setLessonContent(nd ? nd.noidungday : '');
      };
      if (attendanceUser && loginMode === 'attendance') loadData();
   }, [attSelectedClass, attDate, attendanceUser, loginMode]);

   const handleUpdateRecord = (mahv, field, value) => {
      setAttRecords(prev => ({ ...prev, [mahv]: { ...(prev[mahv] || {}), [field]: value } }));
   };

   const handleSaveAttendance = async () => {
      if (!attSelectedClass) return window.alert('Chưa chọn lớp!');
      setLoading(true);
      try {
         for (const st of attStudents) {
            const rec = attRecords[st.mahv];
            if (!rec || !rec.trangthai) continue;
            const payload = {
               mahv: st.mahv, malop: attSelectedClass, ngay: attDate,
               trangthai: rec.trangthai, ghichu: rec.ghichu || '',
               manv: attendanceUser.manv || attendanceUser.username
            };
            if (rec.id) await supabase.from('tbl_diemdanh').update(payload).eq('id', rec.id);
            else await supabase.from('tbl_diemdanh').insert([payload]);
         }

         // Lưu nội dung dạy
         const { data: exists } = await supabase.from('tbl_noidungday').select('id').eq('malop', attSelectedClass).eq('ngay', attDate).maybeSingle();
         if (exists) {
            await supabase.from('tbl_noidungday').update({ noidungday: lessonContent }).eq('id', exists.id);
         } else {
            await supabase.from('tbl_noidungday').insert([{ malop: attSelectedClass, ngay: attDate, noidungday: lessonContent }]);
         }

         window.alert('Lưu điểm danh & nội dung dạy thành công!');
      } catch (err) { console.error(err); window.alert('Lỗi lưu điểm danh'); }
      setLoading(false);
   };

   const handleChangePassword = async (e) => {
      e.preventDefault();
      setChangePassLoading(true);
      setChangePassMessage({ type: '', text: '' });

      if (changePassData.newPass !== changePassData.confirmPass) {
         setChangePassMessage({ type: 'error', text: 'Mật khẩu mới và xác nhận mật khẩu không khớp.' });
         setChangePassLoading(false);
         return;
      }
      if (changePassData.newPass.length < 6) {
         setChangePassMessage({ type: 'error', text: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
         setChangePassLoading(false);
         return;
      }

      try {
         // Verify old password first
         const { data: userCheck, error: checkError } = await supabase
            .from('tbl_nv')
            .select('id')
            .eq('manv', attendanceUser.manv)
            .eq('password', changePassData.oldPass)
            .single();

         if (checkError || !userCheck) {
            setChangePassMessage({ type: 'error', text: 'Mật khẩu cũ không đúng.' });
            setChangePassLoading(false);
            return;
         }

         // Update password
         const { error: updateError } = await supabase
            .from('tbl_nv')
            .update({ password: changePassData.newPass })
            .eq('manv', attendanceUser.manv);

         if (updateError) {
            throw updateError;
         }

         setChangePassMessage({ type: 'success', text: 'Mật khẩu đã được thay đổi thành công!' });
         setChangePassData({ oldPass: '', newPass: '', confirmPass: '' }); // Clear form
         setTimeout(() => setIsChangePassOpen(false), 2000); // Close modal after success
      } catch (err) {
         console.error('Error changing password:', err);
         setChangePassMessage({ type: 'error', text: 'Lỗi khi thay đổi mật khẩu. Vui lòng thử lại.' });
      } finally {
         setChangePassLoading(false);
      }
   };

   useEffect(() => {
      // Check if session exists and is valid (1 hour)
      const sessionStr = localStorage.getItem('auth_session');
      if (sessionStr) {
         try {
            const session = JSON.parse(sessionStr);
            const currentTime = new Date().getTime();
            const oneHour = 60 * 60 * 1000;
            if (currentTime - session.loginTime < oneHour) {
               navigate('/dashboard');
            } else {
               localStorage.removeItem('auth_session'); // Expired
            }
         } catch (e) {
            localStorage.removeItem('auth_session');
         }
      }
   }, [navigate]);

   useEffect(() => {
      if (!parentData || parentTab !== 'chat-tab') return;

      const fetchChatMessages = async () => {
         setChatLoading(true);
         const { data } = await supabase
            .from('hv_messages')
            .select('*')
            .eq('mahv', parentData.student.mahv)
            .order('created_at', { ascending: true });
         if (data) setChatMessages(data);
         setChatLoading(false);
      };

      const fetchChatDocs = async () => {
         const { data } = await supabase
            .from('documents')
            .select('*')
            .eq('mahv', parentData.student.mahv)
            .order('created_at', { ascending: false });
         if (data) setChatDocuments(data || []);
      };

      fetchChatMessages();
      fetchChatDocs();

      const channel = supabase
         .channel(`parent_chat_${parentData.student.mahv}`)
         .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'hv_messages',
            filter: `mahv=eq.${parentData.student.mahv}`
         }, (payload) => {
            setChatMessages(prev => {
               const exists = prev.some(m => m.id === payload.new.id);
               if (exists) return prev;
               return [...prev, payload.new];
            });
         })
         .subscribe();

      return () => { supabase.removeChannel(channel); };
   }, [parentData, parentTab]);

   const handleSendChat = async (e) => {
      e.preventDefault();
      if (!chatInput.trim() || !parentData) return;

      const newMessage = {
         mahv: parentData.student.mahv,
         manv: parentData.teacherManv, // Sử dụng mã nhân viên đã tìm được khi login
         content: chatInput,
         description: 'PH'
      };

      const { data, error } = await supabase.from('hv_messages').insert([newMessage]).select();
      if (error) {
         console.error('Lỗi khi gửi tin nhắn:', error);
         return;
      }
      if (data) {
         setChatInput('');
         setChatMessages(prev => [...prev, data[0]]);
      }
   };

   return (
      <div className="app-container">
         <div className="login-box" style={{
            maxWidth: parentData || (loginMode === 'attendance' && attendanceUser) ? '900px' : '400px',
            width: '100%',
            transition: 'all 0.3s ease',
            background: parentData || (loginMode === 'attendance' && attendanceUser) ? '#ffffff' : 'rgba(30, 41, 59, 0.7)',
            color: parentData || (loginMode === 'attendance' && attendanceUser) ? '#0f172a' : '#f8fafc',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: parentData || (loginMode === 'attendance' && attendanceUser) ? '2rem' : '3rem'
         }}>

            {!parentData && !(loginMode === 'attendance' && attendanceUser) && (
               <div className="login-tabs" style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                     type="button"
                     onClick={() => { setLoginMode('login'); setMessage({ type: '', text: '' }); }}
                     style={{ flex: 1, minWidth: '90px', padding: '0.5rem 0', background: 'none', border: 'none', fontWeight: 600, color: loginMode === 'login' || loginMode === 'attendance' ? '#3b82f6' : '#64748b', borderBottom: loginMode === 'login' || loginMode === 'attendance' ? '3px solid #3b82f6' : 'none', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.9rem' }}>
                     Nhân Viên
                  </button>
                  <button
                     type="button"
                     onClick={() => { setLoginMode('parent'); setMessage({ type: '', text: '' }); }}
                     style={{ flex: 1, minWidth: '90px', padding: '0.5rem 0', background: 'none', border: 'none', fontWeight: 600, color: loginMode === 'parent' ? '#10b981' : '#64748b', borderBottom: loginMode === 'parent' ? '3px solid #10b981' : 'none', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.9rem' }}>
                     Phụ Huynh
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
                        <input type="text" placeholder={loginMode === 'login' ? "Tên đăng nhập nhân viên" : "Tên đăng nhập phụ huynh"} value={username} onChange={(e) => setUsername(e.target.value)} />
                     </div>

                     <div className="input-group">
                        <div className="input-icon"><Lock size={18} /></div>
                        <input type="password" placeholder="Mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} />
                     </div>

                     <button type="submit" className={`submit-btn ${loading ? 'loading' : ''}`} disabled={loading} style={loginMode === 'parent' ? { background: '#10b981' } : (attendanceUser ? { background: '#ec4899' } : {})}>
                        {loading ? <Loader2 className="spinner" size={20} /> : (
                           <>
                              <span>{loginMode === 'parent' ? 'Vào Tra Cứu' : (attendanceUser ? 'Vào Điểm Danh' : 'Đăng Nhập ')}</span>
                              {loginMode === 'parent' ? <Search size={18} /> : <LogIn size={18} />}
                           </>
                        )}
                     </button>
                  </form>
               </>
            ) : loginMode === 'attendance' && attendanceUser ? (
               <div className="attendance-portal" style={{ textAlign: 'left', animation: 'fadeIn 0.3s ease' }}>
                  <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
                     <div>
                        <h2 style={{ fontSize: '1.4rem', margin: 0 }}>Điểm Danh Lớp Học</h2>
                        <p style={{ color: '#64748b', margin: 0, marginTop: '5px' }}>Tài khoản: <strong>{attendanceUser.tennv || attendanceUser.username}</strong></p>
                     </div>
                     <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                           onClick={() => setIsChangePassOpen(true)}
                           title="Đổi mật khẩu"
                           style={{ width: '36px', height: '36px', background: '#f5f3ff', color: '#5b21b6', border: '1px solid #ddd6fe', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}
                        >
                           <Key size={18} />
                        </button>
                        <button
                           onClick={() => { setAttendanceUser(null); setPassword(''); }}
                           title="Đăng xuất"
                           style={{ width: '36px', height: '36px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fee2e2', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}
                        >
                           <LogOut size={18} />
                        </button>
                     </div>
                  </div>

                  {/* Change Password Modal */}
                  {isChangePassOpen && (
                     <div className="modal-overlay" style={{ zIndex: 1200, position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <div className="modal-content" style={{ background: 'white', padding: '2rem', borderRadius: '12px', maxWidth: '400px', width: '90%', color: '#0f172a' }}>
                           <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                                 <Key size={20} className="text-primary" /> Đổi Mật Khẩu
                              </h3>
                              <button className="close-btn" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setIsChangePassOpen(false)}><X size={20} /></button>
                           </div>
                           <div className="modal-body">
                              {changePassMessage.text && (
                                 <div className={`message-alert ${changePassMessage.type}`} style={{ marginBottom: '1.5rem', padding: '0.75rem', borderRadius: '6px', background: changePassMessage.type === 'error' ? '#fef2f2' : '#f0fdf4', color: changePassMessage.type === 'error' ? '#dc2626' : '#16a34a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>{changePassMessage.text}</span>
                                 </div>
                              )}
                              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                 <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', textAlign: 'left' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Mật khẩu cũ</label>
                                    <input
                                       type="password"
                                       value={changePassData.oldPass}
                                       onChange={e => setChangePassData({ ...changePassData, oldPass: e.target.value })}
                                       required
                                       style={{ padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                                    />
                                 </div>
                                 <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', textAlign: 'left' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Mật khẩu mới</label>
                                    <input
                                       type="password"
                                       value={changePassData.newPass}
                                       onChange={e => setChangePassData({ ...changePassData, newPass: e.target.value })}
                                       required
                                       style={{ padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                                    />
                                 </div>
                                 <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', textAlign: 'left' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Xác nhận mật khẩu mới</label>
                                    <input
                                       type="password"
                                       value={changePassData.confirmPass}
                                       onChange={e => setChangePassData({ ...changePassData, confirmPass: e.target.value })}
                                       required
                                       style={{ padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                                    />
                                 </div>
                                 <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                    <button type="button" className="btn btn-outline" onClick={() => setIsChangePassOpen(false)} style={{ flex: 1, padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', cursor: 'pointer' }}>Hủy</button>
                                    <button type="submit" className="btn btn-primary" disabled={changePassLoading} style={{ flex: 2, padding: '0.6rem', border: 'none', borderRadius: '6px', background: '#3b82f6', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                                       {changePassLoading ? 'Đang lưu...' : 'Lưu mật khẩu'}
                                    </button>
                                 </div>
                              </form>
                           </div>
                        </div>
                     </div>
                  )}
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                     {attendanceUser.role !== 'Giáo viên' && (
                        <div style={{ flex: 1, minWidth: '150px' }}>
                           <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#334155' }}>Ngày điểm danh bù</label>
                           <input type="date" value={attDate} onChange={e => setAttDate(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                        </div>
                     )}
                     <div style={{ flex: 2, minWidth: '200px' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#334155' }}>Chọn Lớp</label>
                        <select value={attSelectedClass} onChange={e => setAttSelectedClass(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                           <option value="">-- {attClasses.length > 0 ? 'Chọn Lớp' : 'Không có lớp phân công'} --</option>
                           {attClasses.map(c => <option key={c.malop} value={c.malop}>{c.tenlop || c.malop}</option>)}
                        </select>

                        {attSelectedClass && (
                           <div style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: '#2563eb', fontWeight: 600 }}>
                              Lịch học: {attClasses.find(c => c.malop === attSelectedClass)?.thoigianbieu || 'Chưa cập nhật'}
                           </div>
                        )}
                     </div>
                  </div>

                  {attSelectedClass && (
                     <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#db2777' }}>Nội dung buổi dạy hôm nay</label>
                        <textarea
                           placeholder="Nhập kiến thức đã dạy, bài tập về nhà..."
                           value={lessonContent}
                           onChange={e => setLessonContent(e.target.value)}
                           rows="3"
                           style={{ width: '100%', padding: '0.8rem', border: '2px solid #fbcfe8', borderRadius: '8px', fontSize: '0.95rem', fontFamily: 'inherit' }}
                        />
                     </div>
                  )}

                  {attSelectedClass && (
                     <>
                        <div className="attendance-portal-list">
                           {attStudents.length > 0 ? attStudents.map(st => {
                              const rec = attRecords[st.mahv] || {};
                              return (
                                 <div key={st.mahv} className="attendance-portal-card">
                                    {/* Student Info Section */}
                                    <div>
                                       <span className="portal-att-label">Học Sinh</span>
                                       <strong style={{ fontSize: '1.1rem', color: '#0f172a' }}>{st.tenhv}</strong>
                                       <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>{st.mahv}</div>
                                    </div>

                                    {/* Attendance Options Section */}
                                    <div>
                                       <span className="portal-att-label">Điểm Danh</span>
                                       <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                          {(!config?.cotdiemdanh?.selected || config.cotdiemdanh.selected.includes('comat')) && (
                                             <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#16a34a', fontWeight: 700, fontSize: '0.95rem', background: rec.trangthai === 'Có mặt' ? '#f0fdf4' : 'transparent', padding: '0.4rem 0.75rem', borderRadius: '8px', border: rec.trangthai === 'Có mặt' ? '1px solid #bbf7d0' : '1px solid #e2e8f0', transition: '0.2s' }}>
                                                <input type="radio" name={`tt_${st.mahv}`} checked={rec.trangthai === 'Có mặt'} onChange={() => handleUpdateRecord(st.mahv, 'trangthai', 'Có mặt')} /> Có mặt
                                             </label>
                                          )}
                                          {(!config?.cotdiemdanh?.selected || config.cotdiemdanh.selected.includes('vangP')) && (
                                             <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#d97706', fontWeight: 700, fontSize: '0.95rem', background: rec.trangthai === 'Nghỉ phép' ? '#fffbeb' : 'transparent', padding: '0.4rem 0.75rem', borderRadius: '8px', border: rec.trangthai === 'Nghỉ phép' ? '1px solid #fef3c7' : '1px solid #e2e8f0', transition: '0.2s' }}>
                                                <input type="radio" name={`tt_${st.mahv}`} checked={rec.trangthai === 'Nghỉ phép'} onChange={() => handleUpdateRecord(st.mahv, 'trangthai', 'Nghỉ phép')} /> Nghỉ phép
                                             </label>
                                          )}
                                          {(!config?.cotdiemdanh?.selected || config.cotdiemdanh.selected.includes('vangKP')) && (
                                             <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#dc2626', fontWeight: 700, fontSize: '0.95rem', background: rec.trangthai === 'Nghỉ không phép' ? '#fef2f2' : 'transparent', padding: '0.4rem 0.75rem', borderRadius: '8px', border: rec.trangthai === 'Nghỉ không phép' ? '1px solid #fee2e2' : '1px solid #e2e8f0', transition: '0.2s' }}>
                                                <input type="radio" name={`tt_${st.mahv}`} checked={rec.trangthai === 'Nghỉ không phép'} onChange={() => handleUpdateRecord(st.mahv, 'trangthai', 'Nghỉ không phép')} /> Nghỉ KP
                                             </label>
                                          )}
                                       </div>
                                    </div>

                                    {/* Note Input Section */}
                                    <div>
                                       <span className="portal-att-label">Ghi chú / Nhận xét</span>
                                       <textarea placeholder="Nhận xét riêng..." value={rec.ghichu || ''} onChange={e => handleUpdateRecord(st.mahv, 'ghichu', e.target.value)} rows="2" style={{ width: '100%', padding: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '10px', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem', outline: 'none' }} />
                                    </div>
                                 </div>
                              );
                           }) : (
                              <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: '#64748b', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #e2e8f0' }}>
                                 <p style={{ fontWeight: 600, fontSize: '1rem' }}>Lớp không có học sinh đang kích hoạt.</p>
                                 <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Vui lòng kiểm tra trạng thái học sinh trong phần quản lý.</p>
                              </div>
                           )}
                        </div>
                        {attStudents.length > 0 && (
                           <button onClick={handleSaveAttendance} disabled={loading} style={{ width: '100%', padding: '1rem', marginTop: '1.5rem', background: '#ec4899', color: 'white', fontWeight: 700, border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                              {loading ? <Loader2 size={20} className="spinner" /> : 'Lưu Danh Sách Điểm Danh'}
                           </button>
                        )}
                     </>
                  )}
               </div>
            ) : (
               <div id="parent-dashboard" className="parent-dashboard-container">
                  <div className="parent-header">
                     <div className="parent-header-left">
                        <img src={config?.logo || '/logo.png'} alt="Logo" style={{ height: '45px' }} onError={(e) => { e.target.style.display = 'none'; }} />
                        <h2 style={{ color: '#0f172a', margin: 0 }}>Tra cứu thẻ: <span style={{ color: '#3b82f6', fontWeight: 800 }}>{parentData.student.tenhv}</span></h2>
                     </div>
                     <button onClick={() => setParentData(null)} style={{ padding: '0.6rem 1.25rem', background: '#64748b', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', transition: '0.2s' }}>Quay lại tìm</button>
                  </div>

                  <div className="parent-nav-tabs">
                     <div onClick={() => setParentTab('fee-tab')} className={`parent-nav-tab ${parentTab === 'fee-tab' ? 'active-blue' : ''}`}>
                        Xem Thông Báo
                     </div>
                     <div onClick={() => setParentTab('attendance-tab')} className={`parent-nav-tab ${parentTab === 'attendance-tab' ? 'active-green' : ''}`}>
                        Bảng Điểm Danh
                     </div>
                     <div onClick={() => setParentTab('chat-tab')} className={`parent-nav-tab ${parentTab === 'chat-tab' ? 'active-purple' : ''}`}>
                        Trao Đổi Với Staff
                     </div>
                  </div>

                  {parentTab === 'fee-tab' && (
                     <div id="fee-tab" className="parent-tab-content active" style={{ animation: 'contentFadeIn 0.3s ease' }}>
                        {parentData.latestFee ? (
                           <div className="parent-card-grid">
                              <div className="glass-card" style={{ background: 'rgba(59, 130, 246, 0.04)', padding: '1.75rem', borderRadius: '16px', border: '1px solid #bfdbfe' }}>
                                 <h3 style={{ marginTop: 0, marginBottom: '1.25rem', color: '#1e3a8a', fontSize: '1.25rem' }}>📢 Thông báo học phí chờ đóng</h3>
                                 <div id="latest-fee-info" style={{ fontSize: '1.05rem', lineHeight: '1.8', color: '#334155' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0.75rem' }}>
                                       <div style={{ background: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}><span style={{ color: '#64748b', fontSize: '0.9em' }}>Ngày bắt đầu: </span><br /><strong>{parentData.latestFee.ngaybatdau ? new Date(parentData.latestFee.ngaybatdau).toLocaleDateString('vi-VN') : '--/--/----'}</strong></div>
                                       <div style={{ background: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}><span style={{ color: '#64748b', fontSize: '0.9em' }}>Ngày kết thúc: </span><br /><strong>{parentData.latestFee.ngayketthuc ? new Date(parentData.latestFee.ngayketthuc).toLocaleDateString('vi-VN') : '--/--/----'}</strong></div>
                                       <div style={{ background: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}><span style={{ color: '#64748b', fontSize: '0.9em' }}>Thời lượng/Đóng: </span><br /><strong>{parentData.latestFee.sobuoihoc || '0'}</strong></div>
                                       <div style={{ background: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}><span style={{ color: '#64748b', fontSize: '0.9em' }}>Phụ phí/Vắng KP: </span><br /><strong>{parentData.latestFee.phuphi || '0'}</strong></div>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.25rem', fontSize: '1.1rem' }}>
                                       <span style={{ color: '#64748b' }}>Học phí gốc:</span>
                                       <strong>{parentData.latestFee.hocphi || '0'} đ</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #94a3b8', paddingBottom: '0.5rem', marginBottom: '0.5rem', fontSize: '1.1rem' }}>
                                       <span style={{ color: '#64748b' }}>Giảm học phí (-):</span>
                                       <strong style={{ color: '#10b981' }}>{parentData.latestFee.giamhocphi || '0'} đ</strong>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', alignItems: 'center' }}>
                                       <span style={{ fontWeight: 600, fontSize: '1.2rem', color: '#0f172a' }}>Phải Đóng (VNĐ):</span>
                                       <strong style={{ color: '#ef4444', fontSize: '1.6rem' }}>{parentData.latestFee.tongcong || '0'}</strong>
                                    </div>

                                    <div style={{ background: '#fef2f2', padding: '0.75rem 1rem', borderRadius: '8px', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                       <span style={{ color: '#b91c1c', fontWeight: 600 }}>Cần nộp trước thời điểm hạn chót:</span>
                                       <strong style={{ color: '#b91c1c' }}>{new Date(new Date(parentData.latestFee.ngaylap).setDate(new Date(parentData.latestFee.ngaylap).getDate() + 10)).toLocaleDateString('vi-VN')}</strong>
                                    </div>

                                    {parentData.latestFee.ghichu && (
                                       <div style={{ marginTop: '0.5rem', fontSize: '0.95rem' }}>
                                          Lịch sử đã đóng <i style={{ color: '#475569' }}>"{parentData.latestFee.ghichu}"</i>
                                       </div>
                                    )}
                                 </div>
                              </div>
                              <div className="glass-card text-center" style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0', background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }}>
                                 <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.15rem' }}>1-Chạm Qua App Ngân Hàng</h3>
                                 <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.25rem', lineHeight: 1.5 }}>Vui lòng mở ứng dụng ngân hàng và bấm quét QRCode này để auto-điền số tiền chính xác cần đóng.</p>
                                 <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'inline-block' }}>
                                    <img id="qr-payment" src={getQRUrl()} alt="QR Code" style={{ width: '100%', maxWidth: '220px', borderRadius: '8px', display: 'block' }} />
                                 </div>
                              </div>
                           </div>
                        ) : (
                           <div style={{ padding: '2.5rem', textAlign: 'center', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #cbd5e1', fontSize: '1.15rem', color: '#475569' }}>Hệ thống không ghi nhận có bản giấy thông báo học phí nào tới hạn nhắc đóng.</div>
                        )}

                        <h3 style={{ marginTop: '2.5rem', marginBottom: '1rem', color: '#1e293b', fontSize: '1.25rem' }}>📝 Thông tin 10 lần đóng học phí gần nhất được xác nhận tại cơ sở</h3>
                        <div className="table-container" style={{ overflowX: 'auto', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                           <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
                              <thead>
                                 <tr style={{ background: '#f8fafc' }}>
                                    <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>Lần đóng (Date)</th>
                                    <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>Lớp</th>
                                    <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>Bắt đầu</th>
                                    <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>Kết thúc</th>
                                    <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>Tổng Phí</th>
                                    <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>Khách đã gửi</th>
                                    <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>Phân biệt qua</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {parentData.invoices.length > 0 ? parentData.invoices.map((inv, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                       <td style={{ padding: '1rem' }}>{inv.ngaylap ? new Date(inv.ngaylap).toLocaleDateString('vi-VN') : '-'}</td>
                                       <td style={{ padding: '1rem', fontWeight: 700, color: '#2563eb' }}>{inv.tenlop || '-'}</td>
                                       <td style={{ padding: '1rem' }}>{inv.ngaybatdau ? new Date(inv.ngaybatdau).toLocaleDateString('vi-VN') : '-'}</td>
                                       <td style={{ padding: '1rem' }}>{inv.ngayketthuc ? new Date(inv.ngayketthuc).toLocaleDateString('vi-VN') : '-'}</td>
                                       <td style={{ padding: '1rem', fontWeight: 600 }}>{inv.tongcong || '0'} đ</td>
                                       <td style={{ padding: '1rem', fontWeight: 700, color: '#16a34a' }}>{inv.dadong || '0'} đ</td>
                                       <td style={{ padding: '1rem' }}>{inv.hinhthuc || ''}</td>
                                    </tr>
                                 )) : (
                                    <tr><td colSpan="7" style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>Trung tâm chưa xác nhận có xuất phiếu hóa đơn nào cho thẻ học sinh này!</td></tr>
                                 )}
                              </tbody>
                           </table>
                        </div>
                     </div>
                  )}

                  {parentTab === 'attendance-tab' && (
                     <div id="attendance-tab" className="parent-tab-content" style={{ animation: 'contentFadeIn 0.3s ease' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '1.25rem', color: '#1e293b', fontSize: '1.25rem' }}>⏱ Lịch sử điểm danh (Quét trích xuất: 30 buổi gần nhất)</h3>
                        <div className="table-container" style={{ overflowX: 'auto', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                           <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '500px' }}>
                              <thead>
                                 <tr style={{ background: '#f8fafc' }}>
                                    <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>Ngày tới trung tâm</th>
                                    <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>Khảo sát tình trạng có mặt</th>
                                    <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>Lời nhắc (Nếu có/Tùy chọn)</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {parentData.attendances.length > 0 ? parentData.attendances.map((att, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                       <td style={{ padding: '1rem', fontWeight: 600, color: '#334155' }}>{att.ngay ? new Date(att.ngay).toLocaleDateString('vi-VN') : '-'}</td>
                                       <td style={{ padding: '1rem' }}>
                                          <span style={{
                                             background: att.trangthai === 'Có mặt' ? '#dcfce7' : att.trangthai?.includes('Vắng') ? '#fee2e2' : '#fef3c7',
                                             color: att.trangthai === 'Có mặt' ? '#16a34a' : att.trangthai?.includes('Vắng') ? '#dc2626' : '#d97706',
                                             padding: '0.3rem 0.75rem',
                                             borderRadius: '99px',
                                             fontSize: '0.9rem',
                                             fontWeight: 700
                                          }}>
                                             {att.trangthai || '-'}
                                          </span>
                                       </td>
                                       <td style={{ padding: '1rem', color: '#64748b' }}>{att.ghichu || '_'}</td>
                                    </tr>
                                 )) : (
                                    <tr><td colSpan="3" style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>Giáo viên chưa cập nhật các phiên điểm danh mới nhất lên Server.</td></tr>
                                 )}
                              </tbody>
                           </table>
                        </div>
                     </div>
                  )}

                  {parentTab === 'chat-tab' && (
                     <div id="chat-tab" className="parent-tab-content active" style={{ animation: 'contentFadeIn 0.3s ease' }}>
                        <div className="parent-chat-layout" style={{
                           display: 'grid',
                           gridTemplateColumns: 'minmax(0, 1fr) 280px',
                           gap: '1.5rem',
                           background: '#f1f5f9',
                           borderRadius: '16px',
                           padding: '1rem',
                           minHeight: '500px',
                           maxHeight: '600px'
                        }}>
                           {/* Chat Window */}
                           <div style={{ display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                              <div style={{ padding: '0.85rem 1rem', background: 'white', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                 <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#8b5cf6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>SV</div>
                                 <div>
                                    <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{parentData.student.tenhv} - {parentData.student.mahv}</h4>
                                    <span style={{ fontSize: '0.75rem', color: '#10b981' }}>● Kênh đang kết nối</span>
                                 </div>
                              </div>

                              <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: '#f8fafc' }}>
                                 {chatLoading ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Loader2 className="spinner" size={24} /></div>
                                 ) : (
                                    <>
                                       {chatMessages.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: '2rem' }}>Bắt đầu nhắn tin với giáo viên tại đây...</div>}
                                       {chatMessages.reduce((acc, m, idx) => {
                                          const date = new Date(m.created_at).toLocaleDateString('vi-VN');
                                          const prevDate = idx > 0 ? new Date(chatMessages[idx - 1].created_at).toLocaleDateString('vi-VN') : null;
                                          if (date !== prevDate) {
                                             acc.push(<div key={`date-${idx}`} style={{ textAlign: 'center', margin: '15px 0', position: 'relative' }}>
                                                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: '#e2e8f0' }}></div>
                                                <span style={{ position: 'relative', background: '#f8fafc', padding: '0 10px', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700 }}>{date}</span>
                                             </div>);
                                          }

                                          const isMine = m.description === 'PH';
                                          acc.push(
                                             <div key={m.id || idx} style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '80%', display: 'flex', flexDirection: 'column' }}>
                                                <div style={{
                                                   padding: '0.6rem 0.9rem',
                                                   borderRadius: isMine ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                                                   background: isMine ? '#8b5cf6' : 'white',
                                                   color: isMine ? 'white' : '#1e293b',
                                                   boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                                   fontSize: '0.9rem',
                                                   border: isMine ? 'none' : '1px solid #e2e8f0'
                                                }}>
                                                   {m.content && <div>{m.content}</div>}
                                                   {m.image_url && <img src={m.image_url} alt="img" style={{ maxWidth: '100%', borderRadius: '4px', marginTop: '5px' }} />}
                                                   {m.file_url && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }} onClick={() => window.open(m.file_url, '_blank')}>
                                                      <LogIn size={14} /> <span style={{ color: 'inherit', textDecoration: 'none' }}>{m.file_name || 'Tài liệu'}</span>
                                                   </div>}
                                                </div>
                                                <span style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '3px', alignSelf: isMine ? 'flex-end' : 'flex-start' }}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                             </div>
                                          );
                                          return acc;
                                       }, [])}
                                    </>
                                 )}
                              </div>

                              <form onSubmit={handleSendChat} style={{ padding: '0.75rem', background: 'white', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '10px' }}>
                                 <input
                                    type="text"
                                    placeholder="Nhập nội dung trao đổi..."
                                    value={chatInput}
                                    onChange={e => setChatInput(e.target.value)}
                                    style={{ flex: 1, padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc', fontSize: '0.9rem' }}
                                 />
                                 <button type="submit" disabled={!chatInput.trim()} style={{ background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '8px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                    <LogIn size={20} style={{ transform: 'rotate(-90deg)' }} />
                                 </button>
                              </form>
                           </div>

                           {/* Info Sidebar */}
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
                              <div style={{ background: 'white', borderRadius: '12px', padding: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                                    <AlertCircle size={14} /> Thông tin liên hệ
                                 </div>
                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <div style={{ fontSize: '0.85rem' }}><span style={{ color: '#94a3b8' }}>Họ tên:</span> <strong>{parentData.student.tenhv}</strong></div>
                                    <div style={{ fontSize: '0.85rem' }}><span style={{ color: '#94a3b8' }}>ID Thẻ:</span> {parentData.student.mahv}</div>
                                    <div style={{ fontSize: '0.85rem' }}><span style={{ color: '#94a3b8' }}>Địa chỉ:</span> {parentData.student.diachi || 'Chưa cập nhật'}</div>
                                 </div>
                              </div>

                              <div style={{ background: 'white', borderRadius: '12px', padding: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                                    <Users size={14} /> Thành viên (2)
                                 </div>
                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                       <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#dc2626', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>QT</div>
                                       <div>
                                          <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>Quản trị viên</div>
                                          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Điều hành</div>
                                       </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                       <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#10b981', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>PH</div>
                                       <div>
                                          <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>Phụ huynh</div>
                                          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Thành viên</div>
                                       </div>
                                    </div>
                                 </div>
                              </div>

                              <div style={{ background: 'white', borderRadius: '12px', padding: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', flex: 1 }}>
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                                    <Search size={14} /> Kho tài liệu ({chatDocuments.length})
                                 </div>
                                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    {chatDocuments.length > 0 ? chatDocuments.slice(0, 4).map(doc => (
                                       <div key={doc.id} style={{ background: '#f8fafc', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', textAlign: 'center' }} onClick={() => window.open(doc.file_url, '_blank')}>
                                          <div style={{ height: '45px', background: '#f1f5f9', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '6px' }}>
                                             <AlertCircle size={18} style={{ color: '#94a3b8' }} />
                                          </div>
                                          <div style={{ fontSize: '0.6rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
                                       </div>
                                    )) : <div style={{ gridColumn: 'span 2', textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', padding: '1rem' }}>Chưa có tài liệu</div>}
                                 </div>
                              </div>
                           </div>
                        </div>
                     </div>
                  )}
               </div>
            )}
         </div>

         {/* Decorative background elements */}
         <div className="blob blob-1"></div>
         <div className="blob blob-2"></div>
         <div className="blob blob-3"></div>
      </div>
   );
}

export default Login;
