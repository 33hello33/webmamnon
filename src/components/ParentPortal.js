import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useConfig } from '../ConfigContext';
import { uploadToR2 } from '../utils/cloudflareR2';
import { compressImage } from '../utils/imageUtils';
import { Search, ArrowLeft, UserMinus, Bell, CalendarCheck, Heart, MessageSquare, Pill, Users, Utensils, Image, MessageCircle, LogOut, FileText, Download, Loader2, Send, CreditCard, Wallet, Paperclip, MoreVertical, X, Activity, Settings, QrCode, Newspaper, ChevronLeft, ChevronRight } from 'lucide-react';

function ParentPortal({ parentData, setParentData }) {
   const { config } = useConfig();
   const [parentTab, setParentTab] = useState('menu');
   const [chatMessages, setChatMessages] = useState([]);
   const [chatLoading, setChatLoading] = useState(false);
   const [chatInput, setChatInput] = useState('');
   const [chatDocuments, setChatDocuments] = useState([]);
   const [parentNotices, setParentNotices] = useState([]);
   const [uploading, setUploading] = useState(false);
   const [showChatInfo, setShowChatInfo] = useState(false);
   const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
   const [leaveType, setLeaveType] = useState('today');
   const [leaveForm, setLeaveForm] = useState({ from: '', to: '', reason: '' });
   const [isPickupModalOpen, setIsPickupModalOpen] = useState(false);
   const [pickupForm, setPickupForm] = useState({ name: '', phone: '', relation: '', reason: '' });
   const [isMedicineModalOpen, setIsMedicineModalOpen] = useState(false);
   const [medicineForm, setMedicineForm] = useState({ name: '', usage: '' });
   const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
   const [feedbackContent, setFeedbackContent] = useState('');
   const [feedbackLoading, setFeedbackLoading] = useState(false);
   const [unreadChatCount, setUnreadChatCount] = useState(0);
   const [previewImage, setPreviewImage] = useState(null);
   const [calendarDate, setCalendarDate] = useState(new Date());
   const [monthlyAttendance, setMonthlyAttendance] = useState([]);
   const [calendarLoading, setCalendarLoading] = useState(false);
   const [healthHistory, setHealthHistory] = useState([]);
   const [healthLoading, setHealthLoading] = useState(false);
   const [ngoaiKhoaLoading, setNgoaiKhoaLoading] = useState(false);
   const [ngoaiKhoaReg, setNgoaiKhoaReg] = useState(null);
   const [showDeclineReason, setShowDeclineReason] = useState(false);
   const [ngoaiKhoaReason, setNgoaiKhoaReason] = useState('');
   const chatEndRef = useRef(null);
   const chatContainerRef = useRef(null);
   const [hasMoreChat, setHasMoreChat] = useState(true);
   const [isLoadMoreChat, setIsLoadMoreChat] = useState(false);

   useEffect(() => {
      if ('Notification' in window && Notification.permission === 'default') {
         Notification.requestPermission();
      }
   }, []);

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
      if (data) {
         setChatMessages(prev => [...prev, data[0]]);
         setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
   };

   const fetchChatMessages = async (isLoadMore = false) => {
      if (!parentData) return;
      if (isLoadMore) setIsLoadMoreChat(true);
      else setChatLoading(true);

      const currentCount = isLoadMore ? chatMessages.length : 0;
      const pageSize = 20;

      const { data, error } = await supabase
         .from('hv_messages')
         .select('*')
         .eq('mahv', parentData.student.mahv)
         .order('created_at', { ascending: false })
         .range(currentCount, currentCount + pageSize - 1);

      if (error) {
         console.error('Error fetching chat:', error);
      } else if (data) {
         const reversed = [...data].reverse();
         if (isLoadMore) {
            const oldHeight = chatContainerRef.current?.scrollHeight || 0;
            setChatMessages(prev => [...reversed, ...prev]);
            if (data.length < pageSize) setHasMoreChat(false);

            // Maintain scroll position after prepending
            setTimeout(() => {
               if (chatContainerRef.current) {
                  chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight - oldHeight;
               }
            }, 0);
         } else {
            setChatMessages(reversed);
            setHasMoreChat(data.length === pageSize);
            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50);
         }
      }

      if (isLoadMore) setIsLoadMoreChat(false);
      else setChatLoading(false);
   };

   const handleChatScroll = (e) => {
      if (e.target.scrollTop === 0 && hasMoreChat && !chatLoading && !isLoadMoreChat) {
         fetchChatMessages(true);
      }
   };

   const handleLeaveSubmit = async (e) => {
      e.preventDefault();
      let fromDateStr = leaveForm.from;
      let toDateStr = leaveForm.to;

      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      if (leaveType === 'today') {
         fromDateStr = toDateStr = todayStr;
      } else if (leaveType === 'tomorrow') {
         const tomorrow = new Date();
         tomorrow.setDate(tomorrow.getDate() + 1);
         fromDateStr = toDateStr = tomorrow.toISOString().split('T')[0];
      }

      if (!fromDateStr || !toDateStr || !leaveForm.reason) {
         alert('Vui lòng nhập đầy đủ thông tin xin nghỉ.');
         return;
      }

      const msg = `🔔 XIN NGHỈ HỌC\n- Bé: ${parentData.student.tenhv}\n- Từ ngày: ${new Date(fromDateStr).toLocaleDateString('vi-VN')}\n- Đến ngày: ${new Date(toDateStr).toLocaleDateString('vi-VN')}\n- Lý do: ${leaveForm.reason}`;
      await sendQuickMessage(msg);

      // Insert into tbl_diemdanh
      try {
         const start = new Date(fromDateStr);
         const end = new Date(toDateStr);
         const configTimeStr = config?.xinnghitruocmaygio || '08:00';
         const [cfgHour, cfgMin] = configTimeStr.split(':').map(Number);
         const cfgTimeTotal = cfgHour * 60 + cfgMin;

         let current = new Date(start);
         while (current <= end) {
            const currDateStr = current.toISOString().split('T')[0];
            let trangthai = 'Nghỉ phép';

            if (currDateStr === todayStr) {
               const now = new Date();
               const currentTimeTotal = now.getHours() * 60 + now.getMinutes();
               if (currentTimeTotal > cfgTimeTotal) {
                  trangthai = 'Nghỉ không phép';
               }
            } else if (currDateStr < todayStr) {
               trangthai = 'Nghỉ không phép';
            }

            const payload = {
               mahv: parentData.student.mahv,
               malop: parentData.student.malop,
               ngay: currDateStr,
               trangthai: trangthai,
               ghichu: leaveForm.reason,
               manv: parentData.teacherManv || 'parent'
            };

            // Check if record exists
            const { data: existing } = await supabase.from('tbl_diemdanh').select('id').eq('mahv', payload.mahv).eq('ngay', payload.ngay).maybeSingle();
            if (existing) {
               await supabase.from('tbl_diemdanh').update(payload).eq('id', existing.id);
            } else {
               await supabase.from('tbl_diemdanh').insert([payload]);
            }

            current.setDate(current.getDate() + 1);
         }
      } catch (err) {
         console.error('Lỗi khi cập nhật điểm danh:', err);
      }

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
         let targetManv = null;
         const { data: managers } = await supabase.from('tbl_nv').select('manv').or('role.eq.Quản lý,role.eq.Hiệu trưởng').limit(1);
         if (managers && managers.length > 0) {
            targetManv = managers[0].manv;
         } else {
            targetManv = parentData.teacherManv;
         }
         const newMessage = {
            mahv: parentData.student.mahv,
            manv: targetManv,
            content: `📬 [HÒM THƯ GÓP Ý - GỬI HIỆU TRƯỞNG]\nNội dung: ${feedbackContent}`,
            description: 'PH',
            is_read: false
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
      const matched = wallets.find(w => fee.hinhthuc?.includes(w.name));
      if (!matched) return '';
      let nameSuffix = '';
      if (parentData?.student?.tenhv) {
         const parts = parentData.student.tenhv.trim().split(' ');
         nameSuffix = parts.length >= 2 ? ' ' + parts.slice(-2).join(' ') : ' ' + parentData.student.tenhv;
      }
      return `https://img.vietqr.io/image/${matched.bankId}-${matched.accNo}-compact2.png?amount=${encodeURIComponent((fee.tongcong || "0").replace(/,/g, ""))}&addInfo=${encodeURIComponent(parentData.student.mahv + nameSuffix)}&accountName=${encodeURIComponent(matched.accName)}`;
   };

   const formatMonthYear = (dateStr) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
   };

   const tuitionStatus = (() => {
      const latestNotify = parentData?.latestFee;
      const latestInv = parentData?.invoices?.[0];

      if (!latestNotify && !latestInv) return { text: 'Thanh toán', isPaid: true };

      const notifyTime = latestNotify ? new Date(latestNotify.ngaylap).getTime() : 0;
      const invTime = latestInv ? new Date(latestInv.ngaylap).getTime() : 0;

      if (notifyTime > invTime) {
         const monthText = latestNotify.thang || formatMonthYear(latestNotify.ngaylap);
         return {
            text: `Cần thanh toán Học phí tháng ${monthText}`,
            isPaid: false
         };
      } else {
         return {
            text: 'Học phí đã thanh toán',
            isPaid: true
         };
      }
   })();

   const fetchHealthHistory = async () => {
      if (!parentData) return;
      setHealthLoading(true);
      try {
         const { data, error } = await supabase
            .from('suckhoedinhky')
            .select('*')
            .eq('mahv', parentData.student.mahv)
            .order('ngay', { ascending: false });
         if (error) throw error;
         setHealthHistory(data || []);
      } catch (err) {
         console.error('Error fetching health history:', err);
      } finally {
         setHealthLoading(false);
      }
   };

   const fetchNgoaiKhoaRegistration = async () => {
      if (!parentData) return;
      setNgoaiKhoaLoading(true);
      try {
         const { data, error } = await supabase
            .from('dangkyngoaikhoa')
            .select('*')
            .eq('mahv', parentData.student.mahv)
            .order('ngaydangky', { ascending: false })
            .limit(1);
         if (error) throw error;
         if (data && data.length > 0) {
            setNgoaiKhoaReg(data[0]);
            setNgoaiKhoaReason(data[0].lydo || '');
            setShowDeclineReason(!data[0].codangky);
         } else {
            setNgoaiKhoaReg(null);
         }
      } catch (err) {
         console.error('Error fetching registration:', err);
      } finally {
         setNgoaiKhoaLoading(false);
      }
   };

   const handleNgoaiKhoaSubmit = async (codangky) => {
      if (!parentData) return;
      if (!codangky && !ngoaiKhoaReason.trim()) {
         alert('Vui lòng nhập lý do không đăng ký.');
         return;
      }

      setNgoaiKhoaLoading(true);
      try {
         const payload = {
            mahv: parentData.student.mahv,
            codangky: codangky,
            lydo: codangky ? '' : ngoaiKhoaReason,
            ngaydangky: new Date().toISOString()
         };

         const { data, error } = await supabase.from('dangkyngoaikhoa').insert([payload]).select();
         if (error) throw error;

         alert(codangky ? 'Đăng ký ngoại khóa thành công!' : 'Đã ghi nhận ý kiến không tham gia của phụ huynh.');
         if (data) setNgoaiKhoaReg(data[0]);
      } catch (err) {
         console.error('Error submitting registration:', err);
         alert('Có lỗi xảy ra khi gửi đăng ký.');
      } finally {
         setNgoaiKhoaLoading(false);
      }
   };

   const fetchUnreads = async () => {
      if (!parentData) return;
      const { data } = await supabase.from('hv_messages').select('manv, description').eq('mahv', parentData.student.mahv).is('is_read', false);
      if (data) {
         let count = 0;
         data.forEach(d => {
            const isTeacher = Boolean(d.manv && d.manv.trim() !== '' && d.description !== 'PH');
            if (isTeacher) count++;
         });
         setUnreadChatCount(count);
         if ('setAppBadge' in navigator) {
            if (count > 0) navigator.setAppBadge(count).catch(console.error);
            else navigator.clearAppBadge().catch(console.error);
         }
      }
   };

   useEffect(() => {
      if (!parentData) return;

      const unreadChan = supabase.channel(`parent_unread_${parentData.student.mahv}`)
         .on('postgres_changes', { event: '*', schema: 'public', table: 'hv_messages', filter: `mahv=eq.${parentData.student.mahv}` }, () => { fetchUnreads(); }).subscribe();

      fetchUnreads();

      // If we are on the menu, we only care about unread count for the badge
      if (parentTab === 'menu') {
         return () => {
            supabase.removeChannel(unreadChan);
         };
      }

      // Rest of the tab-specific data fetching
      const fetchChatDocs = async () => {
         const { data } = await supabase.from('documents').select('*').eq('mahv', parentData.student.mahv).order('created_at', { ascending: false });
         if (data) setChatDocuments(data || []);
      };
      const fetchParentNotices = async () => {
         const { data: generalNotices } = await supabase.from('tbl_thongbao').select('*').eq('mahv', parentData.student.mahv).order('ngaylap', { ascending: false }).limit(10);
         const { data: classAnnouncements } = await supabase.from('class_announcements').select('*').eq('malop', parentData.student.malop).order('created_at', { ascending: false }).limit(10);

         const combined = [
            ...(generalNotices || []).map(n => ({ ...n, type: 'general', date: n.ngaylap, title: n.tieude, content: n.ghichu })),
            ...(classAnnouncements || []).map(n => ({ ...n, type: 'class', date: n.created_at, title: n.title, content: n.content, image_url: n.image_url, file_url: n.file_url, file_name: n.file_name }))
         ].sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return dateB - dateA;
         });

         setParentNotices(combined);
      };

      const fetchMonthlyAttendance = async () => {
         if (!parentData) return;
         setCalendarLoading(true);
         const year = calendarDate.getFullYear();
         const month = calendarDate.getMonth();
         const startDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
         const endDay = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;

         try {
            const { data } = await supabase.from('tbl_diemdanh').select('*').eq('mahv', parentData.student.mahv).gte('ngay', startDay).lte('ngay', endDay);
            setMonthlyAttendance(data || []);
         } catch (err) { console.error(err); }
         finally { setCalendarLoading(false); }
      };

      if (parentTab === 'chat-tab') { fetchChatMessages(); fetchChatDocs(); }
      if (parentTab === 'notices-tab' || parentTab === 'menu-tab') fetchParentNotices();
      if (parentTab === 'attendance-tab') fetchMonthlyAttendance();
      if (parentTab === 'health-tab') fetchHealthHistory();
      if (parentTab === 'ngoaikhoa-tab') {
         fetchParentNotices();
         fetchNgoaiKhoaRegistration();
      }

      const showNotification = (title, body) => {
         if (Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/logo192.png' });
         }
      };

      const channel = supabase.channel(`parent_chat_${parentData.student.mahv}`)
         .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hv_messages', filter: `mahv=eq.${parentData.student.mahv}` }, (payload) => {
            const isMe = payload.new.description === 'PH';
            if (!isMe) {
               showNotification('Tin nhắn mới từ nhà trường', payload.new.content || 'Bạn có một tệp đính kèm mới');
            }
            setChatMessages(prev => {
               const exists = prev.some(m => m.id === payload.new.id);
               if (exists) return prev;
               setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
               return [...prev, payload.new];
            });
         }).subscribe();

      return () => {
         if (channel) supabase.removeChannel(channel);
         supabase.removeChannel(unreadChan);
      };
   }, [parentData, parentTab, calendarDate]);

   useEffect(() => {
      if (parentTab === 'chat-tab' && parentData) {
         const markAsRead = async () => {
            setUnreadChatCount(0);
            if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(console.error);
            const { data: toUpdate } = await supabase.from('hv_messages').select('id, manv, description').eq('mahv', parentData.student.mahv).is('is_read', false);
            if (toUpdate) {
               const ids = toUpdate.filter(d => Boolean(d.manv && d.manv.trim() !== '' && d.description !== 'PH')).map(d => d.id);
               if (ids.length > 0) await supabase.from('hv_messages').update({ is_read: true }).in('id', ids);
            }
         };
         markAsRead();
      }
   }, [parentTab, parentData]);

   useEffect(() => {
      if (parentTab === 'chat-tab') {
         // chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
         // Handled inside fetchChatMessages or new message logic
      }
   }, [parentTab]);

   const handleSendChat = async (e) => {
      e.preventDefault();
      if (!chatInput.trim() || !parentData) return;
      const newMessage = {
         mahv: parentData.student.mahv,
         manv: parentData.teacherManv,
         content: chatInput,
         description: 'PH'
      };
      const { data, error } = await supabase.from('hv_messages').insert([newMessage]).select();
      if (error) { console.error('Lỗi khi gửi tin nhắn:', error); return; }
      if (data) {
         setChatInput('');
         setChatMessages(prev => [...prev, data[0]]);
         setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
   };

   const handleFileUpload = async (e, type) => {
      const fileInput = e.target.files[0];
      if (!fileInput || !parentData) return;

      setUploading(true);
      try {
         let file = fileInput;
         if (type === 'image') {
            try { file = await compressImage(fileInput, 100); } catch (err) { console.error('Compression failed:', err); }
         }

         let finalUrl = '';
         if (config.r2_enabled) {
            finalUrl = await uploadToR2(file, config.r2_endpoint, config.r2_access_key_id, config.r2_secret_access_key, config.r2_bucket_name, config.r2_public_url);
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

   return (
      <div id="parent-dashboard" className="parent-premium-mobile">
         {parentTab === 'menu' && (
            <div className="premium-home">
               <div className="premium-sidebar">
                  <div className="premium-header">
                     <div className="premium-header-top">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                           <div className="premium-avatar-container">
                              <img src={parentData.student.imgpath || parentData.student.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(parentData.student.tenhv || 'P')}&background=random`} alt="Avatar" />
                           </div>
                           <div className="premium-header-info">
                              <h1 className="premium-user-name">{parentData.student.tenhv}</h1>
                              <div className="premium-user-sub">Lớp: {parentData.student.tenlop || parentData.student.malop || 'Chưa xếp lớp'}</div>
                              <div className="premium-user-sub">GV: {parentData.teacherInfo?.tennv || 'Chưa cập nhật'}</div>
                           </div>
                        </div>
                        <div className="premium-logo-avatar">
                           <img src={config?.logo || '/logo.png'} alt="Logo" onError={(e) => e.target.src = 'https://ui-avatars.com/api/?name=S&background=random'} />
                        </div>
                     </div>
                  </div>

                  <div className="premium-quick-cards">
                     <div className="premium-card" onClick={() => setParentTab('attendance-tab')}>
                        <div className="premium-card-icon"><QrCode size={20} /></div>
                        <div className="premium-card-content">
                           <span className="premium-card-label">Xem</span>
                           <span className="premium-card-title">Điểm danh</span>
                        </div>
                     </div>
                     <div className="premium-card" onClick={() => setParentTab('fee-tab')}>
                        <div className="premium-card-icon" style={{ color: tuitionStatus.isPaid ? '#16a34a' : '#ef4444', background: tuitionStatus.isPaid ? '#f0fdf4' : '#fef2f2' }}><CreditCard size={20} /></div>
                        <div className="premium-card-content">
                           <span className="premium-card-label">Học phí</span>
                           <span className="premium-card-title" style={{ fontSize: '0.85rem' }}>{tuitionStatus.text}</span>
                        </div>
                     </div>
                  </div>

                  <div className="premium-banner" onClick={() => setIsLeaveModalOpen(true)}>
                     <div className="premium-banner-icon"><UserMinus size={24} /></div>
                     <div className="premium-banner-content">
                        <div className="premium-banner-title">Xin nghỉ học trực tuyến</div>
                        <div className="premium-banner-subtitle">(Nhấn để gửi đơn xin nghỉ cho giáo viên)</div>
                     </div>
                     <ArrowLeft size={20} style={{ transform: 'rotate(180deg)' }} />
                  </div>
               </div>

               <div className="premium-main-content">
                  <div className="premium-section-title">Nhóm dịch vụ</div>
                  <div className="premium-service-grid">
                     <div className="premium-service-item" onClick={() => setParentTab('notices-tab')}>
                        <div className="premium-service-icon-wrapper">
                           <Bell size={24} />
                           <span className="service-new-badge">Mới</span>
                        </div>
                        <span className="premium-service-label">Bảng tin<br />nhà trường</span>
                     </div>
                     <div className="premium-service-item" onClick={() => setParentTab('attendance-tab')}>
                        <div className="premium-service-icon-wrapper"><CalendarCheck size={24} /></div>
                        <span className="premium-service-label">Theo dõi<br />điểm danh</span>
                     </div>
                     <div className="premium-service-item" onClick={() => setParentTab('health-tab')}>
                        <div className="premium-service-icon-wrapper" style={{ color: '#ec4899' }}><Heart size={24} /></div>
                        <span className="premium-service-label">Hồ sơ<br />sức khỏe</span>
                     </div>
                     <div className="premium-service-item" onClick={() => setParentTab('chat-tab')}>
                        <div className="premium-service-icon-wrapper" style={{ color: '#3b82f6', position: 'relative' }}>
                           <MessageSquare size={24} />
                           {unreadChatCount > 0 && <span className="service-new-badge" style={{ background: '#ef4444', color: 'white', position: 'absolute', top: '-6px', right: '-12px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold', border: '1.5px solid white' }}>+{unreadChatCount}</span>}
                        </div>
                        <span className="premium-service-label">Liên lạc GV</span>
                     </div>
                  </div>

                  <div className="premium-section-title">
                     Tiện ích yêu thích
                  </div>
                  <div className="premium-utility-grid">
                     <div className="premium-utility-item" onClick={() => { setMedicineForm({ name: '', usage: '' }); setIsMedicineModalOpen(true); }}>
                        <div className="premium-utility-icon-wrapper" style={{ color: '#8b5cf6' }}><Pill size={24} /></div>
                        <span className="premium-utility-label">Dặn thuốc</span>
                     </div>
                     <div className="premium-utility-item" onClick={() => { setPickupForm({ name: '', phone: '', relation: '', reason: '' }); setIsPickupModalOpen(true); }}>
                        <div className="premium-utility-icon-wrapper" style={{ color: '#f59e0b' }}><Users size={24} /></div>
                        <span className="premium-utility-label">Đổi người đón</span>
                     </div>
                     <div className="premium-utility-item" onClick={() => setParentTab('menu-tab')}>
                        <div className="premium-utility-icon-wrapper" style={{ color: '#10b981' }}><Utensils size={24} /></div>
                        <span className="premium-utility-label">Thực đơn</span>
                     </div>
                     <div className="premium-utility-item" onClick={() => setParentTab('ngoaikhoa-tab')}>
                        <div className="premium-utility-icon-wrapper" style={{ color: '#ec4899' }}><Image size={24} /></div>
                        <span className="premium-utility-label">Ngoại khóa</span>
                     </div>
                     <div className="premium-utility-item" onClick={() => setIsFeedbackModalOpen(true)}>
                        <div className="premium-utility-icon-wrapper" style={{ color: '#6366f1' }}><MessageCircle size={24} /></div>
                        <span className="premium-utility-label">Góp ý</span>
                     </div>
                     <div className="premium-utility-item" onClick={() => {
                        setParentData(null);
                        localStorage.removeItem('parent_session');
                     }}>
                        <div className="premium-utility-icon-wrapper" style={{ color: '#ef4444' }}><LogOut size={24} /></div>
                        <span className="premium-utility-label">Đăng xuất</span>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {parentTab !== 'menu' && (
            <div className="premium-tab-container">
               <div className="premium-tab-pane-header" style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', gap: '15px', padding: '20px 20px 10px', background: 'white', borderRadius: '24px 24px 0 0' }}>
                  <button onClick={() => setParentTab('menu')} style={{ background: '#f2f2f7', border: 'none', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1d1d1f' }}>
                     <ArrowLeft size={20} />
                  </button>
                  <h2 style={{ margin: 0, fontSize: '1.2rem' }}>
                     {parentTab === 'notices-tab' ? 'Bảng tin' :
                        parentTab === 'attendance-tab' ? 'Điểm danh' :
                           parentTab === 'fee-tab' ? 'Học phí' :
                              parentTab === 'health-tab' ? 'Sức khỏe' :
                                 parentTab === 'menu-tab' ? 'Thực đơn' :
                                    parentTab === 'ngoaikhoa-tab' ? 'Ngoại khóa' :
                                       parentTab === 'chat-tab' ? 'Liên lạc GV' : ''}
                  </h2>
               </div>

               <div className="premium-tab-content-wrapper" style={{ padding: parentTab === 'chat-tab' ? '0' : '20px', background: 'white', borderRadius: '0 0 24px 24px', minHeight: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column' }}>
                  {parentTab === 'notices-tab' && (
                     <div id="notices-tab" className="parent-tab-content active" style={{ animation: 'contentFadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="notices-section">
                           <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', color: '#1e293b' }}>
                              <Bell size={20} className="text-primary" /> Thông báo từ nhà trường
                           </h3>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {parentNotices.length > 0 ? parentNotices.map((notice, idx) => (
                                 <div key={idx} style={{ background: 'white', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                       <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{new Date(notice.date).toLocaleDateString('vi-VN')}</span>
                                       <span style={{ fontSize: '0.75rem', background: notice.type === 'class' ? '#f5f3ff' : '#eff6ff', color: notice.type === 'class' ? '#8b5cf6' : '#2563eb', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                          {notice.type === 'class' ? 'Bảng tin lớp' : 'Thông báo'}
                                       </span>
                                    </div>
                                    <div style={{ color: '#1e293b', fontWeight: 600, fontSize: '1rem', marginBottom: '5px' }}>{notice.title || (notice.type === 'class' ? 'Thông báo từ lớp' : 'Thông báo học phí/Phát sinh')}</div>
                                    <div style={{ color: '#475569', fontSize: '0.9rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{notice.content}</div>

                                    {notice.image_url && (
                                       <div
                                          style={{ marginTop: '10px', borderRadius: '8px', overflow: 'hidden', cursor: 'zoom-in', background: '#f1f5f9', border: '1px solid #e2e8f0' }}
                                          onClick={() => setPreviewImage(notice.image_url)}
                                       >
                                          <img src={notice.image_url} alt="announcement" style={{ width: '100%', maxHeight: '180px', objectFit: 'contain', display: 'block' }} />
                                       </div>
                                    )}

                                    {notice.file_url && (
                                       <a href={notice.file_url} target="_blank" rel="noreferrer" style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: '#f8fafc', borderRadius: '8px', textDecoration: 'none', color: '#475569', fontSize: '0.85rem', border: '1px solid #e2e8f0' }}>
                                          <FileText size={16} />
                                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{notice.file_name || 'Xem tệp đính kèm'}</span>
                                          <Download size={16} />
                                       </a>
                                    )}
                                 </div>
                              )) : (
                                 <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>Không có thông báo mới.</div>
                              )}
                           </div>
                        </div>
                     </div>
                  )}

                  {parentTab === 'menu-tab' && (
                     <div id="menu-tab" className="parent-tab-content active" style={{ animation: 'contentFadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="notices-section">
                           <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', color: '#166534' }}>
                              <Utensils size={20} /> Thực đơn hàng ngày
                           </h3>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                              {parentNotices.filter(n => n.title === 'THỰC ĐƠN').length > 0 ? parentNotices.filter(n => n.title === 'THỰC ĐƠN').map((menu, idx) => (
                                 <div key={idx} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                    <div style={{ padding: '15px', borderBottom: '1px solid #f1f5f9', background: '#f0fdf4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                       <span style={{ fontWeight: 800, color: '#166534' }}>Thực đơn mới</span>
                                       <span style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>{new Date(menu.date).toLocaleDateString('vi-VN')}</span>
                                    </div>
                                    <div style={{ padding: '15px' }}>
                                       <p style={{ margin: '0 0 10px 0', color: '#475569', fontSize: '0.95rem' }}>{menu.content}</p>
                                       {menu.image_url && (
                                          <div
                                             style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', cursor: 'zoom-in' }}
                                             onClick={() => setPreviewImage(menu.image_url)}
                                          >
                                             <img src={menu.image_url} alt="menu" style={{ width: '100%', display: 'block' }} />
                                          </div>
                                       )}
                                    </div>
                                 </div>
                              )) : (
                                 <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #e2e8f0' }}>
                                    <Utensils size={40} style={{ marginBottom: '15px', opacity: 0.3 }} />
                                    <p>Hiện chưa có thực đơn mới nào được cập nhật.</p>
                                 </div>
                              )}
                           </div>
                        </div>
                     </div>
                  )}

                  {parentTab === 'ngoaikhoa-tab' && (
                     <div id="ngoaikhoa-tab" className="parent-tab-content active" style={{ animation: 'contentFadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="notices-section">
                           <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', color: '#be185d' }}>
                              <Image size={20} /> Hoạt động ngoại khóa mới nhất
                           </h3>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                              {parentNotices.filter(n => n.title === 'NGOẠI KHÓA').length > 0 ? (
                                 parentNotices.filter(n => n.title === 'NGOẠI KHÓA').slice(0, 1).map((item, idx) => (
                                    <div key={idx} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                       <div style={{ padding: '15px', borderBottom: '1px solid #f1f5f9', background: '#fdf2f8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontWeight: 800, color: '#be185d' }}>Thông tin ngoại khóa</span>
                                          <span style={{ fontSize: '0.8rem', color: '#be185d', fontWeight: 600 }}>{new Date(item.date).toLocaleDateString('vi-VN')}</span>
                                       </div>
                                       <div style={{ padding: '15px' }}>
                                          <p style={{ margin: '0 0 15px 0', color: '#475569', fontSize: '0.95rem', lineHeight: '1.6' }}>{item.content}</p>
                                          {item.image_url && (
                                             <div
                                                style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', cursor: 'zoom-in', marginBottom: '20px' }}
                                                onClick={() => setPreviewImage(item.image_url)}
                                             >
                                                <img src={item.image_url} alt="ngoaikhoa" style={{ width: '100%', display: 'block' }} />
                                             </div>
                                          )}

                                          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                                             <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                                <button
                                                   onClick={() => {
                                                      setShowDeclineReason(false);
                                                      handleNgoaiKhoaSubmit(true);
                                                   }}
                                                   disabled={ngoaiKhoaLoading}
                                                   style={{
                                                      flex: 1, padding: '12px', borderRadius: '12px',
                                                      background: ngoaiKhoaReg?.codangky === true ? '#16a34a' : 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
                                                      color: 'white', border: 'none', fontWeight: 700,
                                                      opacity: ngoaiKhoaLoading ? 0.7 : 1, cursor: 'pointer',
                                                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                                   }}
                                                >
                                                   {ngoaiKhoaReg?.codangky === true ? 'Đã đăng ký ✓' : 'Đăng ký tham gia'}
                                                </button>
                                                <button
                                                   onClick={() => setShowDeclineReason(true)}
                                                   disabled={ngoaiKhoaLoading}
                                                   style={{
                                                      flex: 1, padding: '12px', borderRadius: '12px',
                                                      background: (showDeclineReason || ngoaiKhoaReg?.codangky === false) ? '#64748b' : 'white',
                                                      color: (showDeclineReason || ngoaiKhoaReg?.codangky === false) ? 'white' : '#475569',
                                                      border: '1px solid #e2e8f0', fontWeight: 700,
                                                      cursor: 'pointer'
                                                   }}
                                                >
                                                   {ngoaiKhoaReg?.codangky === false ? 'Đã từ chối' : 'Không đăng ký'}
                                                </button>
                                             </div>

                                             {showDeclineReason && (
                                                <div style={{ animation: 'slideDown 0.3s ease' }}>
                                                   <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Lý do không tham gia:</label>
                                                   <textarea
                                                      placeholder="Nhập lý do..."
                                                      value={ngoaiKhoaReason}
                                                      onChange={e => setNgoaiKhoaReason(e.target.value)}
                                                      rows="2"
                                                      style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', outline: 'none', resize: 'none', marginBottom: '10px' }}
                                                   />
                                                   <button
                                                      onClick={() => handleNgoaiKhoaSubmit(false)}
                                                      disabled={ngoaiKhoaLoading || !ngoaiKhoaReason.trim()}
                                                      style={{ width: '100%', padding: '10px', borderRadius: '10px', background: '#475569', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                                                   >
                                                      {ngoaiKhoaLoading ? 'Đang gửi...' : 'Gửi lý do từ chối'}
                                                   </button>
                                                </div>
                                             )}
                                          </div>
                                       </div>
                                    </div>
                                 ))
                              ) : (
                                 <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #e2e8f0' }}>
                                    <Image size={40} style={{ marginBottom: '15px', opacity: 0.3 }} />
                                    <p>Hiện chưa có thông tin ngoại khóa mới nào.</p>
                                 </div>
                              )}
                           </div>
                        </div>
                     </div>
                  )}

                  {parentTab === 'attendance-tab' && (
                     <div id="attendance-tab" className="parent-tab-content active" style={{ animation: 'contentFadeIn 0.3s ease' }}>
                        <div style={{ background: 'white', borderRadius: '20px', padding: '15px', border: '1px solid #e2e8f0' }}>
                           <div className="calendar-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                              <button style={{ padding: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', color: '#64748b', cursor: 'pointer' }} onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
                              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Tháng {calendarDate.getMonth() + 1} - {calendarDate.getFullYear()}</h4>
                              <button style={{ padding: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', color: '#64748b', cursor: 'pointer' }} onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
                           </div>

                           <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                 {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => (
                                    <div key={d} style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: '#64748b', fontSize: '0.75rem' }}>{d}</div>
                                 ))}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', position: 'relative' }}>
                                 {(() => {
                                    const year = calendarDate.getFullYear();
                                    const month = calendarDate.getMonth();
                                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                                    const firstDay = new Date(year, month, 1).getDay();
                                    const startIdx = firstDay === 0 ? 6 : firstDay - 1;
                                    const cells = [];

                                    for (let i = 0; i < startIdx; i++) {
                                       cells.push(<div key={`b-${i}`} style={{ height: '70px', background: '#f8fafc', borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }} />);
                                    }

                                    for (let d = 1; d <= daysInMonth; d++) {
                                       const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                       const rec = monthlyAttendance.find(a => a.ngay === dateStr);
                                       let bg = 'white';
                                       let color = '#94a3b8';
                                       if (rec) {
                                          const s = (rec.trangthai || '').toLowerCase();
                                          if (s === 'có mặt') { bg = '#f0fdf4'; color = '#16a34a'; }
                                          else if (s === 'nghỉ phép') { bg = '#fffbeb'; color = '#d97706'; }
                                          else if (s === 'nghỉ không phép') { bg = '#fef2f2'; color = '#dc2626'; }
                                       }

                                       cells.push(
                                          <div key={d} style={{ height: '70px', padding: '4px', background: bg, borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                                             <div style={{ fontSize: '0.7rem', fontWeight: 700, color: color }}>{d}</div>
                                             {rec && (
                                                <>
                                                   <div style={{ fontSize: '0.65rem', fontWeight: 800, color: color, lineHeight: 1 }}>{rec.trangthai.split(' ')[0]}</div>
                                                   {rec.ghichu && <div style={{ fontSize: '0.6rem', color: '#64748b', lineHeight: 1.1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{rec.ghichu}</div>}
                                                </>
                                             )}
                                          </div>
                                       );
                                    }
                                    return cells;
                                 })()}
                                 {calendarLoading && (
                                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
                                       <Loader2 size={24} className="spinner" />
                                    </div>
                                 )}
                              </div>
                           </div>

                           <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'center', gap: '15px', flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 600 }}>
                                 <div style={{ width: '10px', height: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '2px' }}></div> Có mặt: {monthlyAttendance.filter(a => a.trangthai === 'Có mặt').length}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 600 }}>
                                 <div style={{ width: '10px', height: '10px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '2px' }}></div> Nghỉ phép: {monthlyAttendance.filter(a => a.trangthai === 'Nghỉ phép').length}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 600 }}>
                                 <div style={{ width: '10px', height: '10px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '2px' }}></div> Nghỉ KP: {monthlyAttendance.filter(a => a.trangthai === 'Nghỉ không phép').length}
                              </div>
                           </div>
                        </div>
                     </div>
                  )}

                  {parentTab === 'fee-tab' && (
                     <div id="fee-tab" className="parent-tab-content active" style={{ animation: 'contentFadeIn 0.3s ease' }}>
                        {parentData.latestFee ? (
                           <div className="fee-card-premium" style={{ background: tuitionStatus.isPaid ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' : 'linear-gradient(135deg, #b71c1c 0%, #d32f2f 100%)', color: 'white', padding: '25px', borderRadius: '20px', marginBottom: '20px', boxShadow: tuitionStatus.isPaid ? '0 10px 15px -3px rgba(22, 163, 74, 0.3)' : '0 10px 15px -3px rgba(183, 28, 28, 0.3)' }}>
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
                                 <div style={{ fontSize: '0.85rem' }}>Trạng thái: <span style={{ fontWeight: 700 }}>{tuitionStatus.isPaid ? 'Đã thanh toán' : (parentData.latestFee.status || 'Chờ thanh toán')}</span></div>
                                 {!tuitionStatus.isPaid && (
                                    <button onClick={() => {
                                       const qr = getQRUrl();
                                       if (qr) window.open(qr, '_blank');
                                       else alert('Không tìm thấy thông tin chuyển khoản cấu hình.');
                                    }} style={{ background: 'white', color: '#b71c1c', border: 'none', padding: '8px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>Thanh toán ngay</button>
                                 )}
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
                        <div style={{ background: 'white', borderRadius: '24px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px', borderBottom: '1px solid #f1f5f9', paddingBottom: '20px' }}>
                              <div style={{ width: '56px', height: '56px', background: '#fff1f2', color: '#e11d48', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(225, 29, 72, 0.15)' }}>
                                 <Heart size={32} />
                              </div>
                              <div>
                                 <div style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>Cân nặng & Chiều cao</div>
                                 <div style={{ fontWeight: 800, fontSize: '1.4rem', color: '#0f172a' }}>Hồ Sơ Sức Khỏe</div>
                              </div>
                           </div>

                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '25px' }}>
                              <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', padding: '20px', borderRadius: '16px', textAlign: 'center', border: '1px solid #bfdbfe' }}>
                                 <div style={{ fontSize: '0.85rem', color: '#1e40af', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}><Activity size={16} /> Chiều cao</div>
                                 <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#1e3a8a' }}>{healthHistory[0]?.chieucao || parentData.student.chieucao || '--'} <span style={{ fontSize: '1rem', fontWeight: 600 }}>cm</span></div>
                              </div>
                              <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', padding: '20px', borderRadius: '16px', textAlign: 'center', border: '1px solid #bbf7d0' }}>
                                 <div style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}><Activity size={16} /> Cân nặng</div>
                                 <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#14532d' }}>{healthHistory[0]?.cannang || parentData.student.cannang || '--'} <span style={{ fontSize: '1rem', fontWeight: 600 }}>kg</span></div>
                              </div>
                           </div>

                           <div style={{ padding: '20px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontWeight: 800, marginBottom: '10px', fontSize: '0.95rem' }}>
                                 <FileText size={18} className="text-primary" /> Nhận xét từ giáo viên:
                              </div>
                              <div style={{ fontSize: '1rem', color: '#334155', lineHeight: 1.6, fontStyle: parentData.student.ghichusuckhoe ? 'normal' : 'italic' }}>
                                 {parentData.student.ghichusuckhoe || parentData.student.tinhtrangsk || 'Hiện tại chưa có nhận xét mới về tình trạng sức khỏe của bé.'}
                              </div>
                           </div>
                        </div>

                        <div style={{ background: 'white', borderRadius: '24px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                           <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <CalendarCheck size={20} className="text-primary" /> Lịch sử theo dõi hàng tháng
                           </h3>

                           {healthLoading ? (
                              <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}><Loader2 size={30} className="spinner text-primary" /></div>
                           ) : healthHistory.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                 {healthHistory.map((record, idx) => {
                                    const date = new Date(record.ngay);
                                    return (
                                       <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                                          <div style={{ minWidth: '60px', textAlign: 'center', borderRight: '2px solid #e2e8f0', paddingRight: '15px' }}>
                                             <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Tháng</div>
                                             <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0f172a' }}>{date.getMonth() + 1}</div>
                                             <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8' }}>{date.getFullYear()}</div>
                                          </div>
                                          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                             <div>
                                                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Chiều cao</span>
                                                <strong style={{ fontSize: '1rem', color: '#3b82f6' }}>{record.chieucao} cm</strong>
                                             </div>
                                             <div>
                                                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Cân nặng</span>
                                                <strong style={{ fontSize: '1rem', color: '#10b981' }}>{record.cannang} kg</strong>
                                             </div>
                                          </div>
                                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                             {date.toLocaleDateString('vi-VN')}
                                          </div>
                                       </div>
                                    );
                                 })}
                              </div>
                           ) : (
                              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                                 <Activity size={32} style={{ marginBottom: '10px', opacity: 0.5 }} />
                                 <p style={{ margin: 0 }}>Chưa có dữ liệu lịch sử sức khỏe.</p>
                              </div>
                           )}
                        </div>
                     </div>
                  )}

                  {parentTab === 'chat-tab' && (
                     <div id="chat-tab" className="parent-tab-content active" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: '#f8fafc', borderRadius: '0 0 24px 24px' }}>
                        <div style={{ position: 'sticky', top: '66px', zIndex: 99, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'white', borderBottom: '1px solid #e2e8f0' }}>
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

                        <div ref={chatContainerRef} onScroll={handleChatScroll} style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '15px', minHeight: '400px' }}>
                           {isLoadMoreChat && (
                              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px' }}><Loader2 size={16} className="spinner" /></div>
                           )}
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
                                          <div style={{ padding: '10px 14px', borderRadius: isMe ? '16px 16px 2px 16px' : '16px 16px 16px 2px', background: isMe ? '#ec4899' : 'white', color: isMe ? 'white' : '#1e293b', boxShadow: isMe ? '0 4px 6px -1px rgba(236, 72, 153, 0.2)' : '0 1px 2px 0 rgba(0,0,0,0.05)', fontSize: '0.92rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                             {m.content}
                                          </div>
                                       )}
                                       {m.image_url && (
                                          <div
                                             style={{ marginTop: '5px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', background: 'white', padding: '4px', maxWidth: '100%', cursor: 'zoom-in' }}
                                             onClick={() => setPreviewImage(m.image_url)}
                                          >
                                             <img src={m.image_url} alt="chat" style={{ maxWidth: '100%', maxHeight: '300px', display: 'block', borderRadius: '8px', objectFit: 'contain' }} />
                                          </div>
                                       )}
                                       {m.file_url && (
                                          <a href={m.file_url} target="_blank" rel="noreferrer" style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: isMe ? '#be185d' : '#f1f5f9', color: isMe ? 'white' : '#1e293b', borderRadius: '12px', textDecoration: 'none', fontSize: '0.85rem' }}>
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
                           <div ref={chatEndRef} />
                        </div>

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
                                 <input type="text" placeholder={uploading ? "Đang tải tệp lên..." : "Nhập tin nhắn..."} value={chatInput} onChange={(e) => setChatInput(e.target.value)} disabled={uploading} style={{ width: '100%', padding: '12px 15px', background: '#f1f5f9', border: 'none', borderRadius: '24px', fontSize: '0.9rem', outline: 'none' }} />
                              </div>
                              <button type="submit" disabled={(!chatInput.trim() && !uploading) || uploading} style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#ec4899', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(236, 72, 153, 0.3)', opacity: (!chatInput.trim() && !uploading) ? 0.5 : 1 }}>
                                 {uploading ? <Loader2 size={20} className="spinner" /> : <Send size={20} />}
                              </button>
                           </form>
                        </div>
                     </div>
                  )}
               </div>
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
                     <textarea placeholder="Nhập nội dung góp ý của bạn..." value={feedbackContent} onChange={e => setFeedbackContent(e.target.value)} rows="5" style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', resize: 'none' }} />
                     <button type="submit" disabled={feedbackLoading} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: 'white', border: 'none', fontWeight: 800, fontSize: '1rem' }}>
                        {feedbackLoading ? <Loader2 size={20} className="spinner" /> : 'Gửi góp ý'}
                     </button>
                  </form>
               </div>
            </div>
         )}
         {/* Image Preview Overlay */}
         {previewImage && (
            <div
               style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
               onClick={() => setPreviewImage(null)}
            >
               <button
                  onClick={() => setPreviewImage(null)}
                  style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
               >
                  <X size={24} />
               </button>
               <img src={previewImage} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }} />
            </div>
         )}
      </div>
   );
}

export default ParentPortal;
