import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';
import { supabase } from './supabase';
import { useConfig } from './ConfigContext';
import { User, Lock, Loader2, LogIn, AlertCircle, CheckCircle2, Search, Key, X, LogOut, Users, Download, Image, FileText, CalendarX, Clock, Pill, UserPlus, Paperclip, Send, MoreVertical, Trash2, Phone, ArrowLeft, MoreHorizontal, Bell, MessageSquare, Heart, Activity, UserMinus, CreditCard, Wallet, CalendarCheck, UserCheck, MessageCircle, Newspaper } from 'lucide-react';
import { uploadToGDrive } from './utils/googleDrive';
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
         if (config.gdrive_enabled) {
            const gResult = await uploadToGDrive(
               file,
               config.gdrive_folder_id?.trim(),
               config.gdrive_client_id,
               '', // apiKey
               config.gdrive_auth_type || 'oauth',
               config.gdrive_service_json
            );
            finalUrl = type === 'image'
               ? `https://drive.google.com/thumbnail?id=${gResult.id}&sz=w1000`
               : `https://drive.google.com/file/d/${gResult.id}/view`;
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
               <div id="parent-dashboard" className="parent-dashboard-container" style={parentTab === 'chat-tab' ? { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' } : {}}>
                   {/* Parent Header with Avatar & Logout */}
                   <div className="parent-portal-header" style={{ display: 'grid', gridTemplateColumns: 'minmax(40px, 1fr) auto minmax(40px, 1fr)', alignItems: 'center', marginBottom: '20px', padding: '0 5px' }}>
                      <div className="header-left">
                         {parentTab !== 'menu' && (
                            <button 
                               onClick={() => setParentTab('menu')} 
                               style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '50%', cursor: 'pointer', transition: '0.2s' }}
                               title="Quay lại Menu"
                            >
                               <ArrowLeft size={20} />
                            </button>
                         )}
                      </div>

                      <div className="portal-logo" style={{ textAlign: 'center' }}>
                         <img src={config?.logo || '/logo.png'} alt="Logo" style={{ height: '40px', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; }} />
                      </div>
                      
                      <div className="header-right" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                         <div className="parent-user-section" style={{ position: 'relative' }}>
                            <div 
                               className="parent-avatar" 
                               onClick={() => setIsParentMenuOpen(!isParentMenuOpen)}
                               style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#3b82f6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', cursor: 'pointer', border: '2px solid white', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                               {parentData.student.tenhv?.charAt(0).toUpperCase() || 'P'}
                            </div>
                            
                            {isParentMenuOpen && (
                               <>
                                  <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setIsParentMenuOpen(false)}></div>
                                  <div style={{ position: 'absolute', top: '120%', right: 0, background: 'white', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', minWidth: '160px', zIndex: 101, overflow: 'hidden', animation: 'contentFadeIn 0.2s ease' }}>
                                     <div style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Học sinh:</div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b' }}>{parentData.student.tenhv}</div>
                                     </div>
                                     <div style={{ padding: '5px' }}>
                                        <button 
                                           onClick={() => {
                                              setParentData(null);
                                              localStorage.removeItem('parent_session');
                                           }}
                                           style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', border: 'none', background: 'none', borderRadius: '8px', color: '#ef4444', fontWeight: 700, cursor: 'pointer', transition: '0.2s', textAlign: 'left', fontSize: '0.85rem' }}
                                           onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                                           onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                           <LogOut size={16} /> Đăng xuất
                                        </button>
                                     </div>
                                  </div>
                               </>
                            )}
                         </div>
                      </div>
                   </div>



                  {parentTab === 'menu' && (
                     <div className="parent-vertical-menu fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '1rem 0' }}>
                        <button onClick={() => setParentTab('notices-tab')} className="menu-item-btn">
                           <Bell className="menu-icon" /> BẢNG TIN
                        </button>
                        <button onClick={() => setParentTab('attendance-tab')} className="menu-item-btn">
                           <CalendarCheck className="menu-icon" /> ĐIỂM DANH
                        </button>
                        <button onClick={() => setParentTab('fee-tab')} className="menu-item-btn">
                           <CreditCard className="menu-icon" /> HỌC PHÍ
                        </button>
                        <button onClick={() => {
                           setLeaveType('today');
                           setLeaveForm({ from: '', to: '', reason: '' });
                           setIsLeaveModalOpen(true);
                        }} className="menu-item-btn">
                           <UserMinus className="menu-icon" /> XIN NGHỈ
                        </button>
                        <button onClick={() => {
                           setPickupForm({ name: '', phone: '', relation: '', reason: '' });
                           setIsPickupModalOpen(true);
                        }} className="menu-item-btn">
                           <Users className="menu-icon" /> ĐỔI NGƯỜI ĐÓN
                        </button>
                        <button onClick={() => {
                           setMedicineForm({ name: '', usage: '' });
                           setIsMedicineModalOpen(true);
                        }} className="menu-item-btn">
                           <Pill className="menu-icon" /> DẶN THUỐC
                        </button>
                        <button onClick={() => setParentTab('health-tab')} className="menu-item-btn">
                           <Heart className="menu-icon" /> SỨC KHỎE CỦA CON
                        </button>
                        <button onClick={() => setParentTab('chat-tab')} className="menu-item-btn">
                           <MessageSquare className="menu-icon" /> CHAT VỚI GV
                        </button>
                        <button onClick={() => setIsFeedbackModalOpen(true)} className="menu-item-btn">
                           <MessageCircle className="menu-icon" /> GÓP Ý
                        </button>

                        <style>{`
                           .menu-item-btn {
                              width: 100%;
                              padding: 1.25rem;
                              background: white;
                              border: 1px solid #e2e8f0;
                              border-radius: 12px;
                              display: flex;
                              align-items: center;
                              justify-content: center;
                              gap: 15px;
                              font-weight: 800;
                              font-size: 1.1rem;
                              color: #1e293b;
                              cursor: pointer;
                              transition: all 0.2s;
                              box-shadow: 0 2px 4px rgba(0,0,0,0.02);
                              text-transform: uppercase;
                           }
                           .menu-item-btn:hover {
                              background: #f8fafc;
                              border-color: #3b82f6;
                              color: #3b82f6;
                              transform: translateY(-2px);
                              box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
                           }
                           .menu-icon {
                              width: 22px;
                              height: 22px;
                              color: #3b82f6;
                           }
                        `}</style>
                     </div>
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

                        {/* Section 2: Teacher Updates (Text, Images, Files) */}
                        <div className="teacher-updates-section">
                           <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', color: '#1e293b' }}>
                              <Newspaper size={20} style={{ color: '#8b5cf6' }} /> Hoạt động lớp & Tài liệu
                           </h3>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                              {chatMessages.filter(m => m.description === 'THONG_BAO').length > 0 ? (
                                 [...chatMessages].filter(m => m.description === 'THONG_BAO').reverse().map((m, idx) => (
                                    <div key={idx} style={{ background: 'white', padding: '15px', borderRadius: '16px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                       <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#8b5cf6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
                                             {parentData.teacherInfo?.tennv?.charAt(0) || 'GV'}
                                          </div>
                                          <div>
                                             <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>{parentData.teacherInfo?.tennv || 'Giáo viên'}</div>
                                             <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{new Date(m.created_at).toLocaleString('vi-VN')}</div>
                                          </div>
                                       </div>
                                       
                                       {m.content && <div style={{ fontSize: '0.95rem', color: '#334155', lineHeight: '1.6', marginBottom: '10px' }}>{m.content}</div>}
                                       
                                       {m.image_url && (
                                          <div style={{ borderRadius: '12px', overflow: 'hidden', marginTop: '10px', border: '1px solid #f1f5f9' }}>
                                             <img src={m.image_url} alt="Shared" style={{ width: '100%', maxHeight: '400px', objectFit: 'cover', cursor: 'pointer' }} onClick={() => window.open(m.image_url, '_blank')} />
                                          </div>
                                       )}

                                       {m.file_url && (
                                          <div 
                                             onClick={() => window.open(m.file_url, '_blank')}
                                             style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '12px', marginTop: '10px', cursor: 'pointer', border: '1px solid #e2e8f0', transition: '0.2s' }}
                                             onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                             onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}>
                                             <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#e0f2fe', color: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <FileText size={20} />
                                             </div>
                                             <div style={{ flex: 1, overflow: 'hidden' }}>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.file_name || 'Tài liệu'}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Bấm để tải về</div>
                                             </div>
                                             <Download size={18} style={{ color: '#94a3b8' }} />
                                          </div>
                                       )}
                                    </div>
                                 ))
                              ) : (
                                 <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>Chưa có hoạt động hay tài liệu nào được chia sẻ.</div>
                              )}
                           </div>
                        </div>
                     </div>
                  )}

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
                              <thead className="mobile-hidden">
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
                                    <tr key={idx} className="responsive-tr" style={{ borderBottom: '1px solid #f1f5f9' }}>
                                       <td data-label="Lần đóng" style={{ padding: '1rem' }}>{inv.ngaylap ? new Date(inv.ngaylap).toLocaleDateString('vi-VN') : '--'}</td>
                                       <td data-label="Lớp" style={{ padding: '1rem', fontWeight: 700, color: '#2563eb' }}>{inv.tenlop || inv.malop || '--'}</td>
                                       <td data-label="Bắt đầu" style={{ padding: '1rem' }}>{inv.ngaybatdau ? new Date(inv.ngaybatdau).toLocaleDateString('vi-VN') : '--'}</td>
                                       <td data-label="Kết thúc" style={{ padding: '1rem' }}>{inv.ngayketthuc ? new Date(inv.ngayketthuc).toLocaleDateString('vi-VN') : '--'}</td>
                                       <td data-label="Tổng phí" style={{ padding: '1rem', fontWeight: 600 }}>{inv.tongcong || '0'} đ</td>
                                       <td data-label="Đã đóng" style={{ padding: '1rem', fontWeight: 700, color: '#16a34a' }}>{inv.thucnhan || '0'} đ</td>
                                       <td data-label="Hình thức" style={{ padding: '1rem' }}>{inv.ghichu || '--'}</td>
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
                              <thead className="mobile-hidden">
                                 <tr style={{ background: '#f8fafc' }}>
                                    <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>Ngày tới trung tâm</th>
                                    <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>Tình trạng</th>
                                    <th style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>Lời nhắc (Nếu có/Tùy chọn)</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {parentData.attendances.length > 0 ? parentData.attendances.map((att, idx) => (
                                    <tr key={idx} className="responsive-tr" style={{ borderBottom: '1px solid #f1f5f9' }}>
                                       <td data-label="Ngày" style={{ padding: '1rem', fontWeight: 600, color: '#334155' }}>{att.ngay ? new Date(att.ngay).toLocaleDateString('vi-VN') : '-'}</td>
                                       <td data-label="Trạng thái" style={{ padding: '1rem' }}>
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
                                       <td data-label="Ghi chú" style={{ padding: '1rem', color: '#64748b' }}>{att.ghichu || '_'}</td>
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
                     <div id="chat-tab" className="parent-tab-content active" style={{ animation: 'contentFadeIn 0.3s ease', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                        <div className="chat-manager-layout chat-thread-view zalo-mode" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                           <div className="chat-main-col" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                              <div className="chat-main-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                                 <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>

                                    <div className="header-avatar" style={{ position: 'relative' }}>
                                       {parentData.teacherInfo?.tennv ? (
                                          <div className="avatar-placeholder" style={{ background: '#8b5cf6', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>{parentData.teacherInfo.tennv.charAt(0)}</div>
                                       ) : (
                                          <div className="avatar-placeholder" style={{ background: '#cbd5e1', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>GV</div>
                                       )}
                                    </div>
                                    <div className="header-info">
                                       <h4>{parentData.teacherInfo?.tennv || 'Giáo viên phụ trách'}</h4>
                                       <span className="status-online">Đang hoạt động trao đổi trực tiếp</span>
                                    </div>
                                 </div>
                                 <div className="header-right">
                                    {/* Removed MoreHorizontal button */}
                                 </div>
                              </div>

                              <div className="chat-messages" style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', background: '#f8fafc' }}>
                                 {chatLoading ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Loader2 className="spinner" size={24} /></div>
                                 ) : (
                                    <>
                                       {chatMessages.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: '2rem' }}>Bắt đầu nhắn tin với giáo viên tại đây...</div>}
                                       {chatMessages.reduce((acc, m, idx) => {
                                          const date = new Date(m.created_at).toLocaleDateString('vi-VN');
                                          const prevDate = idx > 0 ? new Date(chatMessages[idx - 1].created_at).toLocaleDateString('vi-VN') : null;
                                          if (date !== prevDate) {
                                             acc.push(<div key={`date-${idx}`} style={{ textAlign: 'center', margin: '20px 0', position: 'relative' }}>
                                                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: '#e2e8f0' }}></div>
                                                <span style={{ position: 'relative', background: '#f8fafc', padding: '0 12px', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700 }}>{date}</span>
                                             </div>);
                                          }

                                          const isMine = m.description === 'PH';
                                          acc.push(
                                             <div key={m.id || idx} className={`message-row ${isMine ? 'mine' : 'theirs'}`}>
                                                <div className="message-bubble-wrapper">
                                                   <div className="message-bubble">
                                                      {m.content && <div className="msg-text">{m.content}</div>}
                                                      {m.image_url && (
                                                         <div className="msg-image shadow-sm" style={{ borderRadius: '8px', overflow: 'hidden', marginTop: '5px' }}>
                                                            <img src={m.image_url} alt="img" style={{ maxWidth: '100%', cursor: 'pointer' }} onClick={() => window.open(m.image_url, '_blank')} />
                                                         </div>
                                                      )}
                                                      {m.file_url && (
                                                         <div className="msg-file" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: isMine ? 'rgba(255,255,255,0.1)' : '#f1f5f9', borderRadius: '8px', marginTop: '5px', cursor: 'pointer' }} onClick={() => window.open(m.file_url, '_blank')}>
                                                            <FileText size={18} /> <span>{m.file_name || 'Tài liệu'}</span>
                                                         </div>
                                                      )}
                                                      <div className="msg-time" style={{ fontSize: '0.65rem', color: isMine ? 'rgba(255,255,255,0.7)' : '#94a3b8', marginTop: '4px', textAlign: 'right' }}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                   </div>
                                                </div>
                                             </div>
                                          );
                                          return acc;
                                       }, [])}
                                    </>
                                 )}
                              </div>

                              <div className="chat-input-area chat-input-sticky">
                                 <form className="chat-input-toolbar" onSubmit={handleSendChat} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc', padding: '8px 12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <div className="toolbar-left" style={{ display: 'flex', gap: '10px' }}>
                                       <label style={{ cursor: 'pointer', color: '#64748b' }}>
                                          <Image size={20} />
                                          <input type="file" accept="image/*" hidden onChange={e => handleFileUpload(e, 'image')} disabled={uploading} />
                                       </label>
                                       <label style={{ cursor: 'pointer', color: '#64748b' }}>
                                          <Paperclip size={20} />
                                          <input type="file" hidden onChange={e => handleFileUpload(e, 'file')} disabled={uploading} />
                                       </label>
                                    </div>
                                    <input
                                       type="text"
                                       placeholder={uploading ? "Đang tải..." : "Nhập nội dung..."}
                                       value={chatInput}
                                       onChange={e => setChatInput(e.target.value)}
                                       disabled={uploading}
                                       style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '0.9rem' }}
                                    />
                                    <button type="submit" disabled={!chatInput.trim() || uploading} style={{ background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                       {uploading ? <Loader2 size={18} className="spinner" /> : <Send size={18} />}
                                    </button>
                                 </form>
                              </div>
                           </div>
                        </div>
                     </div>
                  )}
               </div>
            )}

            {parentTab === 'health-tab' && (
               <div className="parent-tab-content active fade-in" style={{ paddingBottom: '2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '1.5rem', background: 'white', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                     <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e11d48' }}>
                        <Heart size={28} />
                     </div>
                     <div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>Theo Dõi Sức Khỏe</h2>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>Thông tin thể chất và tình trạng sức khỏe của {parentData.student.tenhv}</p>
                     </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '1.5rem' }}>
                     <div style={{ background: 'white', padding: '1.5rem', borderRadius: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <div style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase' }}>CÂN NẶNG (Hàng tháng)</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a' }}>
                           {parentData.student.ghichu?.match(/Cân nặng:\s*([\d.]+kg)/)?.[1] || 'Chưa cập nhật'}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#22c55e', fontWeight: 600, marginTop: '4px' }}>Cập nhật lần cuối: Tháng {new Date().getMonth() + 1}</div>
                     </div>
                     <div style={{ background: 'white', padding: '1.5rem', borderRadius: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <div style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase' }}>CHIỀU CAO (3 tháng)</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a' }}>
                           {parentData.student.ghichu?.match(/Chiều cao:\s*([\d.]+cm)/)?.[1] || 'Chưa cập nhật'}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 600, marginTop: '4px' }}>Dự kiến đo lại: Tháng {((new Date().getMonth() + 3) % 12) + 1}</div>
                     </div>
                  </div>

                  <div style={{ background: 'white', padding: '1.5rem', borderRadius: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
                     <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}><AlertCircle size={20} /> CẢNH BÁO SỨC KHỎE TẠI TRƯỜNG</h3>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {chatMessages.filter(m => m.mota?.includes('🔔') && (m.mota?.includes('ngã') || m.mota?.includes('sốt') || m.mota?.includes('bệnh'))).length > 0 ? (
                           chatMessages.filter(m => m.mota?.includes('🔔') && (m.mota?.includes('ngã') || m.mota?.includes('sốt') || m.mota?.includes('bệnh'))).map((m, i) => (
                              <div key={i} style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '12px', fontSize: '0.9rem', color: '#b91c1c' }}>
                                 <strong>{new Date(m.created_at).toLocaleDateString('vi-VN')}:</strong> {m.mota}
                              </div>
                           ))
                        ) : (
                           <div style={{ padding: '2rem', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', color: '#94a3b8' }}>
                              <CheckCircle2 size={32} style={{ marginBottom: '10px', color: '#22c55e' }} />
                              <p style={{ margin: 0 }}>Bé chưa có thông báo sức khỏe bất thường nào tại trường.</p>
                           </div>
                        )}
                     </div>
                  </div>

                  <div style={{ background: 'white', padding: '1.5rem', borderRadius: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#7c3aed' }}><Pill size={20} /> QUẢN LÝ THUỐC & LỜI DẶN</h3>
                        <button 
                           onClick={() => {
                              setMedicineForm({ name: '', usage: '' });
                              setIsMedicineModalOpen(true);
                           }}
                           style={{ padding: '6px 12px', borderRadius: '8px', background: '#ede9fe', color: '#7c3aed', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                           Dặn thuốc mới
                        </button>
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {chatMessages.filter(m => m.mota?.includes('💊 LỜI DẶN THUỐC')).length > 0 ? (
                           chatMessages.filter(m => m.mota?.includes('💊 LỜI DẶN THUỐC')).slice(0, 5).map((m, i) => (
                              <div key={i} style={{ padding: '12px', background: '#f5f3ff', border: '1px solid #ede9fe', borderRadius: '12px', fontSize: '0.9rem' }}>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: 800, color: '#5b21b6' }}>{new Date(m.created_at).toLocaleDateString('vi-VN')}</span>
                                    <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{new Date(m.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                                 </div>
                                 <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: '#1e293b' }}>{m.mota.replace('💊 LỜI DẶN THUỐC\n', '').trim()}</pre>
                              </div>
                           ))
                        ) : (
                           <p style={{ margin: 0, textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>Chưa có lịch sử dặn thuốc.</p>
                        )}
                     </div>
                  </div>
               </div>
            )}

            {/* Leave Request Modal */}
            {isLeaveModalOpen && (
               <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }}>
                  <div className="modal-content fade-in" style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '450px', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
                     <div style={{ padding: '1.5rem', background: '#fef2f2', borderBottom: '1px solid #fee2e2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, color: '#991b1b', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}><UserMinus size={22} /> Xin Nghỉ Học</h3>
                        <button onClick={() => setIsLeaveModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}><X size={24} /></button>
                     </div>
                     <form onSubmit={handleLeaveSubmit} style={{ padding: '2rem' }}>
                        <div style={{ marginBottom: '1.5rem' }}>
                           <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>CHỌN THỜI GIAN</label>
                           <div style={{ display: 'flex', gap: '8px' }}>
                              <button 
                                 type="button" 
                                 onClick={() => setLeaveType('today')}
                                 style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid', borderColor: leaveType === 'today' ? '#e11d48' : '#e2e8f0', background: leaveType === 'today' ? '#fff1f2' : 'white', color: leaveType === 'today' ? '#e11d48' : '#64748b', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                                 Hôm nay
                              </button>
                              <button 
                                 type="button" 
                                 onClick={() => setLeaveType('tomorrow')}
                                 style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid', borderColor: leaveType === 'tomorrow' ? '#e11d48' : '#e2e8f0', background: leaveType === 'tomorrow' ? '#fff1f2' : 'white', color: leaveType === 'tomorrow' ? '#e11d48' : '#64748b', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                                 Ngày mai
                              </button>
                              <button 
                                 type="button" 
                                 onClick={() => {
                                    setLeaveType('custom');
                                    const today = new Date().toISOString().split('T')[0];
                                    if(!leaveForm.from) setLeaveForm({...leaveForm, from: today, to: today});
                                 }}
                                 style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid', borderColor: leaveType === 'custom' ? '#e11d48' : '#e2e8f0', background: leaveType === 'custom' ? '#fff1f2' : 'white', color: leaveType === 'custom' ? '#e11d48' : '#64748b', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                                 Tùy chọn
                              </button>
                           </div>
                        </div>

                        {leaveType === 'custom' && (
                           <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '1.5rem' }}>
                              <div>
                                 <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>TỪ NGÀY</label>
                                 <input 
                                    type="date" 
                                    value={leaveForm.from}
                                    onChange={e => setLeaveForm({...leaveForm, from: e.target.value})}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                                    required 
                                 />
                              </div>
                              <div>
                                 <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>ĐẾN NGÀY</label>
                                 <input 
                                    type="date" 
                                    value={leaveForm.to}
                                    onChange={e => setLeaveForm({...leaveForm, to: e.target.value})}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                                    required 
                                 />
                              </div>
                           </div>
                        )}

                        <div style={{ marginBottom: '2rem' }}>
                           <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>LÝ DO NGHỈ</label>
                           <textarea 
                              placeholder="Nhập lý do bé nghỉ học..."
                              value={leaveForm.reason}
                              onChange={e => setLeaveForm({...leaveForm, reason: e.target.value})}
                              rows="3"
                              style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none', resize: 'none' }}
                              required
                           ></textarea>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                           <button type="button" onClick={() => setIsLeaveModalOpen(false)} style={{ flex: 1, padding: '1rem', borderRadius: '12px', background: '#f1f5f9', color: '#475569', fontWeight: 700, border: 'none', cursor: 'pointer' }}>Hủy</button>
                           <button type="submit" style={{ flex: 2, padding: '1rem', borderRadius: '12px', background: '#e11d48', color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(225, 29, 72, 0.3)' }}>Gửi Lời Xin Nghỉ</button>
                        </div>
                     </form>
                  </div>
               </div>
            )}

            {/* Pickup Change Modal */}
            {isPickupModalOpen && (
               <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }}>
                  <div className="modal-content fade-in" style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '450px', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
                     <div style={{ padding: '1.5rem', background: '#f0fdf4', borderBottom: '1px solid #dcfce7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, color: '#166534', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}><Users size={22} /> Đổi Người Đón Bé</h3>
                        <button onClick={() => setIsPickupModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534' }}><X size={24} /></button>
                     </div>
                     <form onSubmit={handlePickupSubmit} style={{ padding: '2rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '1.5rem' }}>
                           <div>
                              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>TÊN NGƯỜI ĐÓN</label>
                              <input 
                                 type="text" 
                                 value={pickupForm.name}
                                 onChange={e => setPickupForm({...pickupForm, name: e.target.value})}
                                 style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.95rem', outline: 'none' }}
                                 placeholder="Họ và tên..."
                                 required 
                              />
                           </div>
                           <div>
                              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>SỐ ĐIỆN THOẠI</label>
                              <input 
                                 type="tel" 
                                 value={pickupForm.phone}
                                 onChange={e => setPickupForm({...pickupForm, phone: e.target.value})}
                                 style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.95rem', outline: 'none' }}
                                 placeholder="Số điện thoại..."
                                 required 
                              />
                           </div>
                        </div>
                        <div style={{ marginBottom: '1.5rem' }}>
                           <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>QUAN HỆ (Vd: Ông nội, Cô, Di...)</label>
                           <input 
                              type="text" 
                              value={pickupForm.relation}
                              onChange={e => setPickupForm({...pickupForm, relation: e.target.value})}
                              style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.95rem', outline: 'none' }}
                              placeholder="Mối quan hệ với bé..."
                              required 
                           />
                        </div>
                        <div style={{ marginBottom: '2rem' }}>
                           <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>LÝ DO ĐỔI NGƯỜI</label>
                           <textarea 
                              placeholder="Lý do thay đổi người đón..."
                              value={pickupForm.reason}
                              onChange={e => setPickupForm({...pickupForm, reason: e.target.value})}
                              rows="2"
                              style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.95rem', outline: 'none', resize: 'none' }}
                              required
                           ></textarea>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                           <button type="button" onClick={() => setIsPickupModalOpen(false)} style={{ flex: 1, padding: '1rem', borderRadius: '12px', background: '#f8fafc', color: '#475569', fontWeight: 700, border: 'none', cursor: 'pointer' }}>Hủy</button>
                           <button type="submit" style={{ flex: 2, padding: '1rem', borderRadius: '12px', background: '#16a34a', color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)' }}>Xác Nhận Thay Đổi</button>
                        </div>
                     </form>
                  </div>
               </div>
            )}

            {/* Medicine Modal */}
            {isMedicineModalOpen && (
               <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }}>
                  <div className="modal-content fade-in" style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '450px', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
                     <div style={{ padding: '1.5rem', background: '#f5f3ff', borderBottom: '1px solid #ede9fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, color: '#5b21b6', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}><Pill size={22} /> Dặn Thuốc Cho Bé</h3>
                        <button onClick={() => setIsMedicineModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5b21b6' }}><X size={24} /></button>
                     </div>
                     <form onSubmit={handleMedicineSubmit} style={{ padding: '2rem' }}>
                        <div style={{ marginBottom: '1.5rem' }}>
                           <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>TÊN THUỐC</label>
                           <input 
                              type="text" 
                              value={medicineForm.name}
                              onChange={e => setMedicineForm({...medicineForm, name: e.target.value})}
                              style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                              placeholder="Nhập tên các loại thuốc..."
                              required 
                           />
                        </div>
                        <div style={{ marginBottom: '2rem' }}>
                           <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>CÁCH DÙNG & LIỀU LƯỢNG</label>
                           <textarea 
                              placeholder="Ví dụ: Uống 1 viên sau ăn trưa, bôi kem 2 lần/ngày..."
                              value={medicineForm.usage}
                              onChange={e => setMedicineForm({...medicineForm, usage: e.target.value})}
                              rows="4"
                              style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none', resize: 'none' }}
                              required
                           ></textarea>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                           <button type="button" onClick={() => setIsMedicineModalOpen(false)} style={{ flex: 1, padding: '1rem', borderRadius: '12px', background: '#f8fafc', color: '#475569', fontWeight: 700, border: 'none', cursor: 'pointer' }}>Hủy</button>
                           <button type="submit" style={{ flex: 2, padding: '1rem', borderRadius: '12px', background: '#7c3aed', color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)' }}>Xác Nhận Dặn Thuốc</button>
                        </div>
                     </form>
                  </div>
               </div>
            )}

            {/* Feedback Modal */}
            {isFeedbackModalOpen && (
               <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }}>
                  <div className="modal-content fade-in" style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '500px', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
                     <div style={{ padding: '1.5rem', background: '#f0f9ff', borderBottom: '1px solid #e0f2fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, color: '#0369a1', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}><MessageCircle size={22} /> Hòm Thư Góp Ý</h3>
                        <button onClick={() => setIsFeedbackModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0369a1' }}><X size={24} /></button>
                     </div>
                     <form onSubmit={handleFeedbackSubmit} style={{ padding: '2rem' }}>
                        <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                           <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0ea5e9', margin: '0 auto 1rem' }}>
                              <Send size={28} />
                           </div>
                           <h4 style={{ margin: '0 0 5px 0', color: '#0f172a' }}>Gửi trực tiếp cho Hiệu trưởng</h4>
                           <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>Ý kiến của quý phụ huynh giúp chúng tôi cải thiện chất lượng giáo dục tốt hơn.</p>
                        </div>
                        <div style={{ marginBottom: '2rem' }}>
                           <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>NỘI DUNG GÓP Ý</label>
                           <textarea 
                              placeholder="Nhập ý kiến đóng góp, phản hồi của quý phụ huynh..."
                              value={feedbackContent}
                              onChange={e => setFeedbackContent(e.target.value)}
                              rows="6"
                              style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '1rem', outline: 'none', resize: 'none', transition: 'border-color 0.2s' }}
                              onFocus={e => e.target.style.borderColor = '#0ea5e9'}
                              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                              required
                           ></textarea>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                           <button type="button" onClick={() => setIsFeedbackModalOpen(false)} style={{ flex: 1, padding: '1rem', borderRadius: '12px', background: '#f1f5f9', color: '#475569', fontWeight: 700, border: 'none', cursor: 'pointer' }}>Đóng</button>
                           <button type="submit" disabled={feedbackLoading} style={{ flex: 2, padding: '1rem', borderRadius: '12px', background: '#0ea5e9', color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(14, 165, 233, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                              {feedbackLoading ? <Loader2 size={18} className="spinner" /> : <><Send size={18} /> Gửi Góp Ý</>}
                           </button>
                        </div>
                     </form>
                  </div>
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
