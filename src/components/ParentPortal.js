import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useConfig } from '../ConfigContext';
import { uploadToR2 } from '../utils/cloudflareR2';
import { compressImage } from '../utils/imageUtils';
import { Search, ArrowLeft, UserMinus, Bell, CalendarCheck, Heart, MessageSquare, Pill, Users, Utensils, Image, MessageCircle, LogOut, FileText, Download, Loader2, Send, CreditCard, Wallet, Paperclip, MoreVertical, X, Activity, Settings, QrCode, Newspaper } from 'lucide-react';

function ParentPortal({ parentData, setParentData }) {
   const { config } = useConfig();
   const [parentTab, setParentTab] = useState('menu');
   const [chatMessages, setChatMessages] = useState([]);
   const [chatLoading, setChatLoading] = useState(false);
   const [chatInput, setChatInput] = useState('');
   const [chatDocuments, setChatDocuments] = useState([]);
   const [parentNotices, setParentNotices] = useState([]);
   const [parentLessons, setParentLessons] = useState([]);
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

   useEffect(() => {
      if (!parentData || parentTab !== 'chat-tab') return;
      const fetchChatMessages = async () => {
         setChatLoading(true);
         const { data } = await supabase.from('hv_messages').select('*').eq('mahv', parentData.student.mahv).order('created_at', { ascending: true });
         if (data) setChatMessages(data);
         setChatLoading(false);
      };
      const fetchChatDocs = async () => {
         const { data } = await supabase.from('documents').select('*').eq('mahv', parentData.student.mahv).order('created_at', { ascending: false });
         if (data) setChatDocuments(data || []);
      };
      const fetchParentNotices = async () => {
         const { data } = await supabase.from('tbl_thongbao').select('*').eq('mahv', parentData.student.mahv).order('ngaylap', { ascending: false }).limit(10);
         if (data) setParentNotices(data);
      };
      const fetchParentLessons = async () => {
         const { data } = await supabase.from('tbl_noidungday').select('*').eq('malop', parentData.student.malop).order('ngay', { ascending: false }).limit(10);
         if (data) setParentLessons(data);
      };

      fetchChatMessages(); fetchChatDocs(); fetchParentNotices(); fetchParentLessons();

      const channel = supabase.channel(`parent_chat_${parentData.student.mahv}`)
         .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hv_messages', filter: `mahv=eq.${parentData.student.mahv}` }, (payload) => {
            setChatMessages(prev => {
               const exists = prev.some(m => m.id === payload.new.id);
               if (exists) return prev;
               return [...prev, payload.new];
            });
         }).subscribe();

      const fetchUnreads = async () => {
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
      
      const unreadChan = supabase.channel(`parent_unread_${parentData.student.mahv}`)
         .on('postgres_changes', { event: '*', schema: 'public', table: 'hv_messages', filter: `mahv=eq.${parentData.student.mahv}` }, () => { fetchUnreads(); }).subscribe();
         
      fetchUnreads();

      return () => { supabase.removeChannel(channel); supabase.removeChannel(unreadChan); };
   }, [parentData, parentTab]);

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
                        <div className="premium-avatar-container">
                           <img src={parentData.student.imgpath || parentData.student.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(parentData.student.tenhv || 'P')}&background=random`} alt="Avatar" />
                        </div>
                        <h1 className="premium-user-name">{parentData.student.tenhv}</h1>
                        <button className="premium-search-btn"><Search size={20} /></button>
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
                        <div className="premium-card-icon" style={{ color: '#16a34a', background: '#f0fdf4' }}><CreditCard size={20} /></div>
                        <div className="premium-card-content">
                           <span className="premium-card-label">Học phí</span>
                           <span className="premium-card-title">Thanh toán</span>
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
                        <span className="premium-service-label">Dịch vụ<br />liên lạc</span>
                     </div>
                  </div>

                  <div className="premium-section-title">
                     Tiện ích yêu thích
                     <span style={{ fontSize: '0.8rem', color: '#b71c1c', cursor: 'pointer' }}>Chỉnh sửa <Settings size={14} style={{ verticalAlign: 'middle' }} /></span>
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
                     <div className="premium-utility-item" onClick={() => alert('Chức năng đang phát triển')}>
                        <div className="premium-utility-icon-wrapper" style={{ color: '#10b981' }}><Utensils size={24} /></div>
                        <span className="premium-utility-label">Thực đơn</span>
                     </div>
                     <div className="premium-utility-item" onClick={() => alert('Chức năng đang phát triển')}>
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
               <div className="premium-tab-pane-header" style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '20px 20px 10px', background: 'white', borderRadius: '24px 24px 0 0' }}>
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
                                 <div style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, background: att.trangthai === 'Có mặt' ? '#f0fdf4' : att.trangthai === 'Nghỉ phép' ? '#fffbeb' : '#fef2f2', color: att.trangthai === 'Có mặt' ? '#16a34a' : att.trangthai === 'Nghỉ phép' ? '#d97706' : '#dc2626' }}>
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
                     <div id="chat-tab" className="parent-tab-content active" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: '#f8fafc', borderRadius: '0 0 24px 24px' }}>
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

                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '15px', minHeight: '400px' }}>
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
                                          <div style={{ marginTop: '5px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', background: 'white', padding: '4px', maxWidth: '100%' }}>
                                             <img src={m.image_url} alt="chat" style={{ maxWidth: '100%', maxHeight: '300px', display: 'block', borderRadius: '8px' }} />
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
      </div>
   );
}

export default ParentPortal;
