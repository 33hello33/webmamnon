import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';
import './components/ParentPremiumUI.css';
import { supabase } from './supabase';
import { useConfig } from './ConfigContext';
import { User, Lock, Loader2, LogIn, AlertCircle, CheckCircle2, Search, Key, X, LogOut, Users, Download, Image, FileText, CalendarX, Clock, Pill, UserPlus, Paperclip, Send, MoreVertical, Trash2, Phone, ArrowLeft, MoreHorizontal, Bell, MessageSquare, Heart, Activity, UserMinus, CreditCard, Wallet, CalendarCheck, UserCheck, MessageCircle, Newspaper, Utensils, QrCode, Settings, Home, FileStack } from 'lucide-react';
import { uploadToR2 } from './utils/cloudflareR2';
import { compressImage } from './utils/imageUtils';

function Login() {
   const [username, setUsername] = useState('');
   const [password, setPassword] = useState('');
   const [loading, setLoading] = useState(false);
   const [message, setMessage] = useState({ type: '', text: '' });
   const { config } = useConfig();
   const navigate = useNavigate();

   useEffect(() => {
      const theme = localStorage.getItem('app_theme') || 'kindergarten';
      document.body.setAttribute('data-theme', theme);

      const savedSession = localStorage.getItem('parent_session');
      if (savedSession) {
         try {
            const session = JSON.parse(savedSession);
            if (Date.now() < session.expiry) {
               setParentData(session.data);
               setParentMahv(session.data.student.mahv);
               setParentTab('menu');
            } else {
               localStorage.removeItem('parent_session');
            }
         } catch (e) {
            localStorage.removeItem('parent_session');
         }
      }
   }, []);

   // ----- Parent Module States -----
   const [loginMode, setLoginMode] = useState('login'); // 'login' | 'parent' | 'attendance'
   const [parentMahv, setParentMahv] = useState('');
   const [parentData, setParentData] = useState(null);
   const [parentTab, setParentTab] = useState('menu'); // 'menu' | 'fee-tab' | 'attendance-tab' | 'chat-tab'
   const [chatMessages, setChatMessages] = useState([]);
   const [chatLoading, setChatLoading] = useState(false);
   const [chatInput, setChatInput] = useState('');
   const [chatDocuments, setChatDocuments] = useState([]);
   const [parentNotices, setParentNotices] = useState([]);
   const [parentLessons, setParentLessons] = useState([]);
   const [noticeTab, setNoticeTab] = useState('notices'); // 'notices', 'menu', 'schedule'
   const [uploading, setUploading] = useState(false);
   const [showChatInfo, setShowChatInfo] = useState(false);
   const [isParentMenuOpen, setIsParentMenuOpen] = useState(false);
   const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
   const [leaveType, setLeaveType] = useState('today'); // 'today', 'tomorrow', 'custom'
   const [leaveForm, setLeaveForm] = useState({ from: '', to: '', reason: '' });
   const [isPickupModalOpen, setIsPickupModalOpen] = useState(false);
   const [pickupForm, setPickupForm] = useState({ name: '', phone: '', relation: '', reason: '' });
   const [isMedicineModalOpen, setIsMedicineModalOpen] = useState(false);
   const [medicineForm, setMedicineForm] = useState({ name: '', usage: '' });
   const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
   const [feedbackContent, setFeedbackContent] = useState('');
   const [feedbackLoading, setFeedbackLoading] = useState(false);
   const [unreadChatCount, setUnreadChatCount] = useState(0);

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

   const handleLeaveSubmit = async (e) => {
      e.preventDefault();
      let fromDate = leaveForm.from;
      let toDate = leaveForm.to;

      if (leaveType === 'today') {
         fromDate = toDate = new Date().toISOString().split('T')[0];
      } else if (leaveType === 'tomorrow') {
         const tomorrow = new Date();
         tomorrow.setDate(tomorrow.getDate() + 1);
         fromDate = toDate = tomorrow.toISOString().split('T')[0];
      }

      if (!fromDate || !toDate || !leaveForm.reason) {
         alert('Vui lòng nhập đầy đủ thông tin xin nghỉ.');
         return;
      }
      const msg = `🔔 XIN NGHỈ HỌC\n- Bé: ${parentData.student.tenhv}\n- Từ ngày: ${new Date(fromDate).toLocaleDateString('vi-VN')}\n- Đến ngày: ${new Date(toDate).toLocaleDateString('vi-VN')}\n- Lý do: ${leaveForm.reason}`;
      await sendQuickMessage(msg);
      setIsLeaveModalOpen(false);
      setLeaveForm({ from: '', to: '', reason: '' });
      setLeaveType('today');
   };

   const handlePickupSubmit = async (e) => {
      e.preventDefault();
      if (!pickupForm.name || !pickupForm.phone || !pickupForm.relation || !pickupForm.reason) {
         alert('Vui lòng nhập đầy đủ thông tin người đón.');
         return;
      }
      const msg = `🔔 THÔNG BÁO ĐỔI NGƯỜI ĐÓN\n- Bé: ${parentData.student.tenhv}\n- Người đón thay: ${pickupForm.name}\n- SĐT: ${pickupForm.phone}\n- Quan hệ: ${pickupForm.relation}\n- Lý do: ${pickupForm.reason}`;
      await sendQuickMessage(msg);
      setIsPickupModalOpen(false);
      setPickupForm({ name: '', phone: '', relation: '', reason: '' });
   };

   const handleMedicineSubmit = async (e) => {
      e.preventDefault();
      if (!medicineForm.name || !medicineForm.usage) {
         alert('Vui lòng nhập đầy đủ thông tin dặn thuốc.');
         return;
      }
      const msg = `💊 LỜI DẶN THUỐC\n- Bé: ${parentData.student.tenhv}\n- Tên thuốc: ${medicineForm.name}\n- Cách dùng: ${medicineForm.usage}`;
      await sendQuickMessage(msg);
      setIsMedicineModalOpen(false);
      setMedicineForm({ name: '', usage: '' });
   };

   const handleFeedbackSubmit = async (e) => {
      e.preventDefault();
      if (!feedbackContent.trim()) {
         alert('Vui lòng nhập nội dung góp ý.');
         return;
      }
      setFeedbackLoading(true);
      try {
         // Tìm hiệu trưởng hoặc quản lý
         let targetManv = null;
         const { data: managers } = await supabase
            .from('tbl_nv')
            .select('manv')
            .or('role.eq.Quản lý,role.eq.Hiệu trưởng')
            .limit(1);

         if (managers && managers.length > 0) {
            targetManv = managers[0].manv;
         } else {
            targetManv = parentData.teacherManv; // Fallback to teacher if no manager found
         }

         const newMessage = {
            mahv: parentData.student.mahv,
            manv: targetManv,
            content: `📬 [HÒM THƯ GÓP Ý - GỬI HIỆU TRƯỞNG]\nNội dung: ${feedbackContent}`,
            description: 'PH'
         };

         const { error } = await supabase.from('hv_messages').insert([newMessage]);
         if (error) throw error;

         alert('Cảm ơn ý kiến góp ý của quý phụ huynh. Thông tin đã được gửi trực tiếp đến Ban Giám Hiệu.');
         setIsFeedbackModalOpen(false);
         setFeedbackContent('');
      } catch (err) {
         console.error(err);
         alert('Có lỗi xảy ra khi gửi góp ý.');
      } finally {
         setFeedbackLoading(false);
      }
   };

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
            .or('daxoa.neq."Đã xóa",daxoa.is.null')
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

         // Lấy chi tiết thông tin giáo viên
         let teacherInfo = null;
         if (teacherManv) {
            const { data: nvData } = await supabase
               .from('tbl_nv')
               .select('tennv, role, sdt')
               .eq('manv', teacherManv)
               .maybeSingle();
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

         // Save session for 1 hour
         localStorage.setItem('parent_session', JSON.stringify({
            data: parentDataObj,
            expiry: Date.now() + (60 * 60 * 1000)
         }));

         setParentTab('menu');

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
               const { data: allCls } = await supabase.from('tbl_lop').select('*').or('daxoa.neq."Đã Xóa",daxoa.is.null');
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
         const { data: stFound } = await supabase.from('tbl_hv').select('mahv, tenhv').eq('malop', attSelectedClass).or('trangthai.neq."Đã Nghỉ",trangthai.is.null');
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

   const handleFileUpload = async (e, type) => {
      const fileInput = e.target.files[0];
      if (!fileInput || !parentData) return;

      setUploading(true);
      try {
         let file = fileInput;
         if (type === 'image') {
            try {
               file = await compressImage(fileInput, 100);
            } catch (err) {
               console.error('Compression failed:', err);
            }
         }

         let finalUrl = '';
         if (config.r2_enabled) {
            finalUrl = await uploadToR2(
               file,
               config.r2_endpoint,
               config.r2_access_key_id,
               config.r2_secret_access_key,
               config.r2_bucket_name,
               config.r2_public_url
            );
         } else {
            const fileName = `${parentData.student.mahv}_${Date.now()}_${file.name}`;
            const folder = type === 'image' ? 'chat-images' : 'chat-files';
            const { error } = await supabase.storage.from('assets').upload(`${folder}/${fileName}`, file);
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(`${folder}/${fileName}`);
            finalUrl = publicUrl;
         }

         const msgPayload = {
            mahv: parentData.student.mahv,
            manv: parentData.teacherManv,
            content: '',
            image_url: type === 'image' ? finalUrl : null,
            file_url: type !== 'image' ? finalUrl : null,
            file_name: file.name,
            file_mime_type: file.type,
            description: 'PH'
         };

         const { data } = await supabase.from('hv_messages').insert([msgPayload]).select();
         if (data) setChatMessages(prev => [...prev, data[0]]);

         const newDoc = {
            mahv: parentData.student.mahv,
            name: file.name,
            category: type === 'image' ? 'Ảnh' : 'Tài liệu',
            file_url: finalUrl,
            mime_type: file.type
         };
         await supabase.from('documents').insert([newDoc]);
      } catch (err) {
         alert('Lỗi: ' + err.message);
      } finally {
         setUploading(false);
      }
   };

   const sendQuickMessage = async (content) => {
      if (!parentData) return;
      const newMessage = {
         mahv: parentData.student.mahv,
         manv: parentData.teacherManv,
         content: content,
         description: 'PH'
      };
      const { data, error } = await supabase.from('hv_messages').insert([newMessage]).select();
      if (error) {
         alert('Lỗi khi gửi thông báo: ' + error.message);
         return;
      }
      if (data) setChatMessages(prev => [...prev, data[0]]);
   };

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

      const fetchParentNotices = async () => {
         const { data } = await supabase
            .from('tbl_thongbao')
            .select('*')
            .eq('mahv', parentData.student.mahv)
            .order('ngaylap', { ascending: false })
            .limit(10);
         if (data) setParentNotices(data);
      };

      const fetchParentLessons = async () => {
         const { data } = await supabase
            .from('tbl_noidungday')
            .select('*')
            .eq('malop', parentData.student.malop)
            .order('ngay', { ascending: false })
            .limit(10);
         if (data) setParentLessons(data);
      };

      fetchChatMessages();
      fetchChatDocs();
      fetchParentNotices();
      fetchParentLessons();

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

      // ----- Thêm logic Đếm số lượt tin nhắn chưa đọc từ GV -----
      const fetchUnreads = async () => {
         const { data } = await supabase
            .from('hv_messages')
            .select('manv, description')
            .eq('mahv', parentData.student.mahv)
            .is('is_read', false);

         if (data) {
            let count = 0;
            data.forEach(d => {
               const isTeacher = Boolean(d.manv && d.manv.trim() !== '' && d.description !== 'PH');
               if (isTeacher) count++;
            });
            setUnreadChatCount(count);
            
            // Cập nhật badge trên icon màn hình chính (iOS 16.4+ / Android)
            if ('setAppBadge' in navigator) {
               if (count > 0) navigator.setAppBadge(count).catch(console.error);
               else navigator.clearAppBadge().catch(console.error);
            }
         }
      };
      
      const unreadChan = supabase.channel(`parent_unread_${parentData.student.mahv}`)
         .on('postgres_changes', { event: '*', schema: 'public', table: 'hv_messages', filter: `mahv=eq.${parentData.student.mahv}` }, () => {
            fetchUnreads();
         }).subscribe();
         
      fetchUnreads();
      // -------------------------------------------------------------

      return () => { 
         supabase.removeChannel(channel); 
         supabase.removeChannel(unreadChan);
      };
   }, [parentData, parentTab]);

   useEffect(() => {
      // Khi phụ huynh vào đọc tin nhắn, đánh dấu toàn bộ tin do GV gửi (có tồn tại manv) là đã đọc.
      if (parentTab === 'chat-tab' && parentData) {
         const markAsRead = async () => {
            setUnreadChatCount(0); // optimistic UI
            if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(console.error);
            
            const { data: toUpdate } = await supabase
               .from('hv_messages')
               .select('id, manv, description')
               .eq('mahv', parentData.student.mahv)
               .is('is_read', false);
               
            if (toUpdate) {
               const ids = toUpdate
                  .filter(d => Boolean(d.manv && d.manv.trim() !== '' && d.description !== 'PH'))
                  .map(d => d.id);
                  
               if (ids.length > 0) {
                  await supabase.from('hv_messages').update({ is_read: true }).in('id', ids);
               }
            }
         };
         markAsRead();
      }
   }, [parentTab, parentData]);

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
         <div id="login-box-target" className="login-box" style={{
            maxWidth: parentData || (loginMode === 'attendance' && attendanceUser) ? '1200px' : '400px',
            width: '95%',
            transition: 'all 0.3s ease',
            padding: parentData || (loginMode === 'attendance' && attendanceUser) ? (parentTab === 'chat-tab' ? '1rem' : '2rem') : '3rem',
            margin: parentTab === 'chat-tab' ? '1rem auto' : '2rem auto',
            height: parentTab === 'chat-tab' ? 'calc(100vh - 2rem)' : 'auto',
            display: 'flex',
            flexDirection: 'column',
            overflow: parentTab === 'chat-tab' ? 'hidden' : 'visible'
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
               <div id="parent-dashboard" className="parent-premium-mobile">
                  {parentTab === 'menu' && (
                     <div className="premium-home">
                        <div className="premium-sidebar">
                           {/* Premium Header */}
                           <div className="premium-header">
                              <div className="premium-header-top">
                                 <div className="premium-avatar-container">
                                    <img src={parentData.student.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(parentData.student.tenhv || 'P')}&background=random`} alt="Avatar" />
                                 </div>
                                 <h1 className="premium-user-name">{parentData.student.tenhv}</h1>
                                 <button className="premium-search-btn">
                                    <Search size={20} />
                                 </button>
                              </div>
                           </div>

                           {/* Quick Cards */}
                           <div className="premium-quick-cards">
                              <div className="premium-card" onClick={() => setParentTab('attendance-tab')}>
                                 <div className="premium-card-icon">
                                    <QrCode size={20} />
                                 </div>
                                 <div className="premium-card-content">
                                    <span className="premium-card-label">Xem</span>
                                    <span className="premium-card-title">Điểm danh</span>
                                 </div>
                              </div>
                              <div className="premium-card" onClick={() => setParentTab('fee-tab')}>
                                 <div className="premium-card-icon" style={{ color: '#16a34a', background: '#f0fdf4' }}>
                                    <CreditCard size={20} />
                                 </div>
                                 <div className="premium-card-content">
                                    <span className="premium-card-label">Học phí</span>
                                    <span className="premium-card-title">Thanh toán</span>
                                 </div>
                              </div>
                           </div>

                           {/* Action Banner moved to sidebar */}
                           <div className="premium-banner" onClick={() => setIsLeaveModalOpen(true)}>
                              <div className="premium-banner-icon">
                                 <UserMinus size={24} />
                              </div>
                              <div className="premium-banner-content">
                                 <div className="premium-banner-title">Xin nghỉ học trực tuyến</div>
                                 <div className="premium-banner-subtitle">(Nhấn để gửi đơn xin nghỉ cho giáo viên)</div>
                              </div>
                              <ArrowLeft size={20} style={{ transform: 'rotate(180deg)' }} />
                           </div>
                        </div>

                        <div className="premium-main-content">
                           {/* Service Groups */}
                           <div className="premium-section-title">
                              Nhóm dịch vụ
                           </div>
                           <div className="premium-service-grid">
                              <div className="premium-service-item" onClick={() => setParentTab('notices-tab')}>
                                 <div className="premium-service-icon-wrapper">
                                    <Bell size={24} />
                                    <span className="service-new-badge">Mới</span>
                                 </div>
                                 <span className="premium-service-label">Bảng tin<br />nhà trường</span>
                              </div>
                              <div className="premium-service-item" onClick={() => setParentTab('attendance-tab')}>
                                 <div className="premium-service-icon-wrapper">
                                    <CalendarCheck size={24} />
                                 </div>
                                 <span className="premium-service-label">Theo dõi<br />điểm danh</span>
                               </div>
                              <div className="premium-service-item" onClick={() => setParentTab('health-tab')}>
                                 <div className="premium-service-icon-wrapper" style={{ color: '#ec4899' }}>
                                    <Heart size={24} />
                                 </div>
                                 <span className="premium-service-label">Hồ sơ<br />sức khỏe</span>
                              </div>
                              <div className="premium-service-item" onClick={() => setParentTab('chat-tab')}>
                                 <div className="premium-service-icon-wrapper" style={{ color: '#3b82f6', position: 'relative' }}>
                                    <MessageSquare size={24} />
                                    {unreadChatCount > 0 && <span className="service-new-badge" style={{ background: '#ef4444', color: 'white', position: 'absolute', top: '-6px', right: '-12px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold', border: '1.5px solid white' }}>+{unreadChatCount}</span>}
                                 </div>
                                 <span className="premium-service-label">Dịch vụ<br />liên lạc</span>
                              </div>
                           </div>

                           {/* Utilities Grid */}
                           <div className="premium-section-title">
                              Tiện ích yêu thích
                              <span style={{ fontSize: '0.8rem', color: '#b71c1c', cursor: 'pointer' }}>Chỉnh sửa <Settings size={14} style={{ verticalAlign: 'middle' }} /></span>
                           </div>
                           <div className="premium-utility-grid">
                              <div className="premium-utility-item" onClick={() => { setMedicineForm({ name: '', usage: '' }); setIsMedicineModalOpen(true); }}>
                                 <div className="premium-utility-icon-wrapper" style={{ color: '#8b5cf6' }}>
                                    <Pill size={24} />
                                 </div>
                                 <span className="premium-utility-label">Dặn thuốc</span>
                              </div>
                              <div className="premium-utility-item" onClick={() => { setPickupForm({ name: '', phone: '', relation: '', reason: '' }); setIsPickupModalOpen(true); }}>
                                 <div className="premium-utility-icon-wrapper" style={{ color: '#f59e0b' }}>
                                    <Users size={24} />
                                 </div>
                                 <span className="premium-utility-label">Đổi người đón</span>
                              </div>
                              <div className="premium-utility-item" onClick={() => alert('Chức năng đang phát triển')}>
                                 <div className="premium-utility-icon-wrapper" style={{ color: '#10b981' }}>
                                    <Utensils size={24} />
                                 </div>
                                 <span className="premium-utility-label">Thực đơn</span>
                              </div>
                              <div className="premium-utility-item" onClick={() => alert('Chức năng đang phát triển')}>
                                 <div className="premium-utility-icon-wrapper" style={{ color: '#ec4899' }}>
                                    <Image size={24} />
                                 </div>
                                 <span className="premium-utility-label">Ngoại khóa</span>
                              </div>
                              <div className="premium-utility-item" onClick={() => setIsFeedbackModalOpen(true)}>
                                 <div className="premium-utility-icon-wrapper" style={{ color: '#6366f1' }}>
                                    <MessageCircle size={24} />
                                 </div>
                                 <span className="premium-utility-label">Góp ý</span>
                              </div>
                              <div className="premium-utility-item" onClick={() => {
                                 setParentData(null);
                                 localStorage.removeItem('parent_session');
                              }}>
                                 <div className="premium-utility-icon-wrapper" style={{ color: '#ef4444' }}>
                                    <LogOut size={24} />
                                 </div>
                                 <span className="premium-utility-label">Đăng xuất</span>
                              </div>
                           </div>
                        </div>
                     </div>
                  )}



                  {/* Other tabs wrapper for back button */}
                  {parentTab !== 'menu' && (
                     <>
                        <div className="premium-tab-pane-header" style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '20px 20px 10px', background: 'white' }}>
                        <button onClick={() => setParentTab('menu')} style={{ background: '#f2f2f7', border: 'none', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1d1d1f' }}>
                           <ArrowLeft size={20} />
                        </button>
                        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>
                           {parentTab === 'notices-tab' ? 'Bảng tin' :
                              parentTab === 'attendance-tab' ? 'Điểm danh' :
                                 parentTab === 'fee-tab' ? 'Học phí' :
                                    parentTab === 'health-tab' ? 'Sức khỏe' :
                                       parentTab === 'chat-tab' ? 'Liên lạc GV' : ''}
                        </h2>
                     </div>
                  </>
               )}
                  {parentTab === 'notices-tab' && (
                     <div id="notices-tab" className="parent-tab-content active" style={{ animation: 'contentFadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Section 1: Latest Formal Notices */}
                        <div className="notices-section">
                           <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', color: '#1e293b' }}>
                              <Bell size={20} className="text-primary" /> Thông báo từ nhà trường
                           </h3>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {parentNotices.length > 0 ? parentNotices.map((notice, idx) => (
                                 <div key={idx} style={{ background: 'white', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                       <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{new Date(notice.ngaylap).toLocaleDateString('vi-VN')}</span>
                                       <span style={{ fontSize: '0.75rem', background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>Thông báo</span>
                                    </div>
                                    <div style={{ color: '#1e293b', fontWeight: 600, fontSize: '1rem', marginBottom: '5px' }}>{notice.tieude || 'Thông báo học phí/Phát sinh'}</div>
                                    <div style={{ color: '#475569', fontSize: '0.9rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{notice.ghichu}</div>
                                 </div>
                              )) : (
                                 <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>Không có thông báo mới.</div>
                              )}
                           </div>
                        </div>

                        {/* Section 2: Lesson Content / Classroom Diary */}
                        <div className="lessons-section">
                           <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', color: '#1e293b' }}>
                              <Newspaper size={20} style={{ color: '#ec4899' }} /> Nhật ký lớp học ({parentData.student.tenlop})
                           </h3>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {parentLessons.length > 0 ? parentLessons.map((lesson, idx) => (
                                 <div key={idx} style={{ background: '#fffef2', padding: '15px', borderRadius: '12px', border: '1px solid #fef3c7', boxShadow: '0 2px 4px rgba(0,0,0,0.01)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                       <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 700 }}>{new Date(lesson.ngay).toLocaleDateString('vi-VN')}</span>
                                    </div>
                                    <div style={{ color: '#1e293b', fontSize: '0.95rem', lineHeight: '1.6' }}>{lesson.noidungday}</div>
                                 </div>
                              )) : (
                                 <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>Chưa có nội dung nhật ký lớp học.</div>
                              )}
                           </div>
                        </div>
                     </div>
                  )}

                  {parentTab === 'attendance-tab' && (
                     <div id="attendance-tab" className="parent-tab-content active" style={{ animation: 'contentFadeIn 0.3s ease' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                           {parentData.attendances.map((att, idx) => (
                              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                 <div>
                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{new Date(att.ngay).toLocaleDateString('vi-VN')}</div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{att.ghichu || 'Không có ghi chú'}</div>
                                 </div>
                                 <div style={{
                                    padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700,
                                    background: att.trangthai === 'Có mặt' ? '#f0fdf4' : att.trangthai === 'Nghỉ phép' ? '#fffbeb' : '#fef2f2',
                                    color: att.trangthai === 'Có mặt' ? '#16a34a' : att.trangthai === 'Nghỉ phép' ? '#d97706' : '#dc2626'
                                 }}>
                                    {att.trangthai}
                                 </div>
                              </div>
                           ))}
                           {parentData.attendances.length === 0 && <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>Chưa có dữ liệu điểm danh.</div>}
                        </div>
                     </div>
                  )}

                  {parentTab === 'fee-tab' && (
                     <div id="fee-tab" className="parent-tab-content active" style={{ animation: 'contentFadeIn 0.3s ease' }}>
                        {parentData.latestFee ? (
                           <div className="fee-card-premium" style={{ background: 'linear-gradient(135deg, #b71c1c 0%, #d32f2f 100%)', color: 'white', padding: '25px', borderRadius: '20px', marginBottom: '20px', boxShadow: '0 10px 15px -3px rgba(183, 28, 28, 0.3)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                                 <div>
                                    <div style={{ fontSize: '0.85rem', opacity: 0.9, marginBottom: '5px' }}>Học phí tháng {formatMonthYear(parentData.latestFee.ngaylap)}</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{parentData.latestFee.tongcong} <span style={{ fontSize: '1rem' }}>VNĐ</span></div>
                                 </div>
                                 <div style={{ background: 'rgba(255,255,255,0.2)', padding: '8px', borderRadius: '12px', height: 'fit-content' }}>
                                    <CreditCard size={24} />
                                 </div>
                              </div>
                              <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                 <div style={{ fontSize: '0.85rem' }}>Trạng thái: <span style={{ fontWeight: 700 }}>{parentData.latestFee.status || 'Chờ thanh toán'}</span></div>
                                 <button onClick={() => {
                                    const qr = getQRUrl();
                                    if (qr) window.open(qr, '_blank');
                                    else alert('Không tìm thấy thông tin chuyển khoản cấu hình.');
                                 }} style={{ background: 'white', color: '#b71c1c', border: 'none', padding: '8px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>Thanh toán ngay</button>
                              </div>
                           </div>
                        ) : (
                           <div className="fee-card-empty" style={{ background: '#f8fafc', border: '2px dashed #e2e8f0', padding: '30px', borderRadius: '20px', textAlign: 'center', color: '#94a3b8', marginBottom: '20px' }}>
                              <Wallet size={32} style={{ marginBottom: '10px', opacity: 0.5 }} />
                              <div>Chưa có thông báo học phí mới.</div>
                           </div>
                        )}

                        <div className="invoices-list">
                           <h3 style={{ fontSize: '1rem', color: '#1e293b', marginBottom: '15px' }}>Lịch sử biên lai</h3>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {parentData.invoices.map((inv, idx) => (
                                 <div key={idx} className="invoice-item-premium" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                       <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '8px', borderRadius: '10px' }}>
                                          <FileText size={20} />
                                       </div>
                                       <div>
                                          <div style={{ fontWeight: 600, color: '#1e293b' }}>Thanh toán tháng {inv.thang || formatMonthYear(inv.ngaylap)}</div>
                                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{new Date(inv.ngaylap).toLocaleDateString('vi-VN')}</div>
                                       </div>
                                    </div>
                                    <div style={{ fontWeight: 700, color: '#1e293b' }}>{inv.tongcong}</div>
                                 </div>
                              ))}
                              {parentData.invoices.length === 0 && <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '0.9rem' }}>Chưa có lịch sử biên lai.</div>}
                           </div>
                        </div>
                     </div>
                  )}

                  {parentTab === 'health-tab' && (
                     <div id="health-tab" className="parent-tab-content active" style={{ animation: 'contentFadeIn 0.3s ease' }}>
                        <div style={{ background: 'white', borderRadius: '20px', padding: '20px', border: '1px solid #e2e8f0' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '15px' }}>
                              <div style={{ width: '50px', height: '50px', background: '#fef2f2', color: '#ef4444', borderRadius: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                 <Heart size={28} />
                              </div>
                              <div>
                                 <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Cân nặng & Chiều cao</div>
                                 <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#1e293b' }}>Sức khỏe định kỳ</div>
                              </div>
                           </div>
                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                              <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '12px', textAlign: 'center' }}>
                                 <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '5px' }}>Chiều cao</div>
                                 <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#3b82f6' }}>{parentData.student.chieucao || '--'} <span style={{ fontSize: '0.85rem' }}>cm</span></div>
                              </div>
                              <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '12px', textAlign: 'center' }}>
                                 <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '5px' }}>Cân nặng</div>
                                 <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981' }}>{parentData.student.cannang || '--'} <span style={{ fontSize: '0.85rem' }}>kg</span></div>
                              </div>
                           </div>
                           <div style={{ marginTop: '20px', padding: '15px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #dbeafe' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2563eb', fontWeight: 700, marginBottom: '5px', fontSize: '0.9rem' }}>
                                 <Activity size={16} /> Nhận xét sức khỏe:
                              </div>
                              <div style={{ fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.5 }}>
                                 {parentData.student.ghichusuckhoe || 'Chưa có cập nhật mới về sức khỏe của bé.'}
                              </div>
                           </div>
                        </div>
                     </div>
                  )}

                  {parentTab === 'chat-tab' && (
                     <div id="chat-tab" className="parent-tab-content active" style={{
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                        overflow: 'hidden',
                        background: '#f8fafc',
                        margin: '-20px -20px -20px', // Bù lề của container
                        borderRadius: '0 0 24px 24px'
                     }}>
                        {/* Chat Internal Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'white', borderBottom: '1px solid #e2e8f0' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ position: 'relative' }}>
                                 <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                    {parentData.teacherInfo?.tennv?.charAt(0) || 'G'}
                                 </div>
                                 <span style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '12px', height: '12px', background: '#22c55e', border: '2px solid white', borderRadius: '50%' }}></span>
                              </div>
                              <div>
                                 <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>GV {parentData.teacherInfo?.tennv}</div>
                                 <div style={{ fontSize: '0.75rem', color: '#22c55e', fontWeight: 600 }}>Đang hoạt động</div>
                              </div>
                           </div>
                           <div style={{ display: 'flex', gap: '5px' }}>
                              <button style={{ padding: '8px', background: '#f1f5f9', border: 'none', borderRadius: '10px', color: '#64748b' }} onClick={() => setShowChatInfo(!showChatInfo)}>
                                 <MoreVertical size={20} />
                              </button>
                           </div>
                        </div>

                        {/* Chat Messages Area */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                           {chatLoading ? (
                              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><Loader2 size={24} className="spinner" /></div>
                           ) : chatMessages.length === 0 ? (
                              <div style={{ textAlign: 'center', margin: 'auto', maxWidth: '200px' }}>
                                 <div style={{ width: '60px', height: '60px', background: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 15px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                    <MessageSquare size={30} style={{ color: '#ec4899', opacity: 0.5 }} />
                                 </div>
                                 <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Bắt đầu trò chuyện với giáo viên phụ trách của bé.</p>
                              </div>
                           ) : (
                              chatMessages.map((m, idx) => {
                                 const isMe = m.description === 'PH';
                                 return (
                                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '85%', alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                                       {m.content && (
                                          <div style={{
                                             padding: '10px 14px',
                                             borderRadius: isMe ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                                             background: isMe ? '#ec4899' : 'white',
                                             color: isMe ? 'white' : '#1e293b',
                                             boxShadow: isMe ? '0 4px 6px -1px rgba(236, 72, 153, 0.2)' : '0 1px 2px 0 rgba(0,0,0,0.05)',
                                             fontSize: '0.92rem',
                                             lineHeight: 1.5,
                                             whiteSpace: 'pre-wrap'
                                          }}>
                                             {m.content}
                                          </div>
                                       )}
                                       {m.image_url && (
                                          <div style={{ marginTop: '5px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', background: 'white', padding: '4px', maxWidth: '100%' }}>
                                             <img src={m.image_url} alt="chat" style={{ maxWidth: '100%', maxHeight: '300px', display: 'block', borderRadius: '8px' }} />
                                          </div>
                                       )}
                                       {m.file_url && (
                                          <a href={m.file_url} target="_blank" rel="noreferrer" style={{
                                             marginTop: '5px',
                                             display: 'flex',
                                             alignItems: 'center',
                                             gap: '8px',
                                             padding: '10px 14px',
                                             background: isMe ? '#be185d' : '#f1f5f9',
                                             color: isMe ? 'white' : '#1e293b',
                                             borderRadius: '12px',
                                             textDecoration: 'none',
                                             fontSize: '0.85rem'
                                          }}>
                                             <FileText size={18} />
                                             <span style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.file_name || 'Tài liệu'}</span>
                                             <Download size={16} />
                                          </a>
                                       )}
                                       <span style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '4px', fontWeight: 600 }}>
                                          {new Date(m.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                       </span>
                                    </div>
                                 );
                              })
                           )}
                        </div>

                        {/* Chat Input Area */}
                        <div style={{ padding: '15px 16px', background: 'white', borderTop: '1px solid #e2e8f0' }}>
                           <form onSubmit={handleSendChat} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ display: 'flex', gap: '5px' }}>
                                 <label style={{ cursor: 'pointer', padding: '8px', color: '#64748b' }}>
                                    <Image size={22} />
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'image')} disabled={uploading} />
                                 </label>
                                 <label style={{ cursor: 'pointer', padding: '8px', color: '#64748b' }}>
                                    <Paperclip size={22} />
                                    <input type="file" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'file')} disabled={uploading} />
                                 </label>
                              </div>
                              <div style={{ flex: 1, position: 'relative' }}>
                                 <input
                                    type="text"
                                    placeholder={uploading ? "Đang tải tệp lên..." : "Nhập tin nhắn..."}
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    disabled={uploading}
                                    style={{
                                       width: '100%',
                                       padding: '12px 15px',
                                       background: '#f1f5f9',
                                       border: 'none',
                                       borderRadius: '24px',
                                       fontSize: '0.9rem',
                                       outline: 'none'
                                    }}
                                 />
                              </div>
                              <button
                                 type="submit"
                                 disabled={(!chatInput.trim() && !uploading) || uploading}
                                 style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '50%',
                                    background: '#ec4899',
                                    color: 'white',
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 6px -1px rgba(236, 72, 153, 0.3)',
                                    opacity: (!chatInput.trim() && !uploading) ? 0.5 : 1
                                 }}
                              >
                                 {uploading ? <Loader2 size={20} className="spinner" /> : <Send size={20} />}
                              </button>
                           </form>
                        </div>
                     </div>
                  )}
               </div>
            )}

            {/* Leave Request Modal */}
            {isLeaveModalOpen && (
               <div className="modal-overlay-premium" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.75)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <div className="modal-content-premium" style={{ width: '100%', maxWidth: '500px', background: 'white', borderRadius: '24px 24px 0 0', padding: '30px 20px', animation: 'slideUp 0.3s ease' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>Gửi đơn xin nghỉ học</h3>
                        <button onClick={() => setIsLeaveModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', color: '#64748b' }}>
                           <X size={18} />
                        </button>
                     </div>
                     <form onSubmit={handleLeaveSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                           <button type="button" onClick={() => setLeaveType('today')} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: leaveType === 'today' ? '2px solid #ec4899' : '1px solid #e2e8f0', background: leaveType === 'today' ? '#fdf2f8' : 'white', fontWeight: 700, color: leaveType === 'today' ? '#ec4899' : '#64748b' }}>Hôm nay</button>
                           <button type="button" onClick={() => setLeaveType('tomorrow')} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: leaveType === 'tomorrow' ? '2px solid #ec4899' : '1px solid #e2e8f0', background: leaveType === 'tomorrow' ? '#fdf2f8' : 'white', fontWeight: 700, color: leaveType === 'tomorrow' ? '#ec4899' : '#64748b' }}>Ngày mai</button>
                           <button type="button" onClick={() => setLeaveType('custom')} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: leaveType === 'custom' ? '2px solid #ec4899' : '1px solid #e2e8f0', background: leaveType === 'custom' ? '#fdf2f8' : 'white', fontWeight: 700, color: leaveType === 'custom' ? '#ec4899' : '#64748b' }}>Khác</button>
                        </div>
                        {leaveType === 'custom' && (
                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                              <div>
                                 <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Từ ngày</label>
                                 <input type="date" value={leaveForm.from} onChange={e => setLeaveForm({ ...leaveForm, from: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }} />
                              </div>
                              <div>
                                 <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Đến ngày</label>
                                 <input type="date" value={leaveForm.to} onChange={e => setLeaveForm({ ...leaveForm, to: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }} />
                              </div>
                           </div>
                        )}
                        <div>
                           <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Lý do xin nghỉ</label>
                           <textarea placeholder="Nhập lý do bé nghỉ (Sức khỏe, việc riêng...)" value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} rows="3" style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', resize: 'none' }} />
                        </div>
                        <button type="submit" style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', color: 'white', border: 'none', fontWeight: 800, fontSize: '1rem', boxShadow: '0 4px 6px -1px rgba(236, 72, 153, 0.4)' }}>Gửi đơn xin nghỉ</button>
                     </form>
                  </div>
               </div>
            )}

            {/* Pickup Modal */}
            {isPickupModalOpen && (
               <div className="modal-overlay-premium" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.75)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <div className="modal-content-premium" style={{ width: '100%', maxWidth: '500px', background: 'white', borderRadius: '24px 24px 0 0', padding: '30px 20px', animation: 'slideUp 0.3s ease' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>Thông báo đổi người đón</h3>
                        <button onClick={() => setIsPickupModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', color: '#64748b' }}>
                           <X size={18} />
                        </button>
                     </div>
                     <form onSubmit={handlePickupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div>
                           <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Họ tên người đón thay</label>
                           <input type="text" value={pickupForm.name} onChange={e => setPickupForm({ ...pickupForm, name: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                           <div>
                              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Số điện thoại</label>
                              <input type="tel" value={pickupForm.phone} onChange={e => setPickupForm({ ...pickupForm, phone: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }} />
                           </div>
                           <div>
                              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Quan hệ với bé</label>
                              <input type="text" placeholder="Ông/bà/chú..." value={pickupForm.relation} onChange={e => setPickupForm({ ...pickupForm, relation: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }} />
                           </div>
                        </div>
                        <div>
                           <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Lý do (tùy chọn)</label>
                           <input type="text" value={pickupForm.reason} onChange={e => setPickupForm({ ...pickupForm, reason: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }} />
                        </div>
                        <button type="submit" style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: 'white', border: 'none', fontWeight: 800, fontSize: '1rem', marginTop: '10px' }}>Gửi thông báo</button>
                     </form>
                  </div>
               </div>
            )}

            {/* Medicine Modal */}
            {isMedicineModalOpen && (
               <div className="modal-overlay-premium" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.75)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <div className="modal-content-premium" style={{ width: '100%', maxWidth: '500px', background: 'white', borderRadius: '24px 24px 0 0', padding: '30px 20px', animation: 'slideUp 0.3s ease' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>Dặn thuốc cho bé</h3>
                        <button onClick={() => setIsMedicineModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', color: '#64748b' }}>
                           <X size={18} />
                        </button>
                     </div>
                     <form onSubmit={handleMedicineSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div>
                           <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Tên loại thuốc</label>
                           <input type="text" value={medicineForm.name} onChange={e => setMedicineForm({ ...medicineForm, name: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }} />
                        </div>
                        <div>
                           <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Cách dùng & Liều lượng</label>
                           <textarea placeholder="Ví dụ: Uống 1 viên sau ăn trưa lúc 11h30..." value={medicineForm.usage} onChange={e => setMedicineForm({ ...medicineForm, usage: e.target.value })} rows="3" style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', resize: 'none' }} />
                        </div>
                        <button type="submit" style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', color: 'white', border: 'none', fontWeight: 800, fontSize: '1rem', marginTop: '10px' }}>Gửi lời dặn</button>
                     </form>
                  </div>
               </div>
            )}

            {/* Feedback Modal */}
            {isFeedbackModalOpen && (
               <div className="modal-overlay-premium" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.75)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <div className="modal-content-premium" style={{ width: '100%', maxWidth: '500px', background: 'white', borderRadius: '24px 24px 0 0', padding: '30px 20px', animation: 'slideUp 0.3s ease' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>Góp ý cho nhà trường</h3>
                        <button onClick={() => setIsFeedbackModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', color: '#64748b' }}>
                           <X size={18} />
                        </button>
                     </div>
                     <form onSubmit={handleFeedbackSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <p style={{ margin: -10, fontSize: '0.85rem', color: '#64748b', lineHeight: 1.4 }}>Ý kiến của bạn sẽ được gửi trực tiếp đến <strong style={{ color: '#ec4899' }}>Hiệu trưởng</strong>. Mọi thông tin sẽ được bảo mật và lắng nghe.</p>
                        <textarea
                           placeholder="Nhập nội dung góp ý của bạn..."
                           value={feedbackContent}
                           onChange={e => setFeedbackContent(e.target.value)}
                           rows="5"
                           style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', resize: 'none' }}
                        />
                        <button type="submit" disabled={feedbackLoading} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: 'white', border: 'none', fontWeight: 800, fontSize: '1rem' }}>
                           {feedbackLoading ? <Loader2 size={20} className="spinner" /> : 'Gửi góp ý'}
                        </button>
                     </form>
                  </div>
               </div>
            )}
         </div>
      </div>
   );
}

export default Login;

