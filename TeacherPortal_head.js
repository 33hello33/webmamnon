import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useConfig } from '../ConfigContext';
import { uploadToR2 } from '../utils/cloudflareR2';
import { compressImage } from '../utils/imageUtils';
import { triggerPushNotification } from '../utils/pushNotifications';
import ChatMessageContent from './ChatMessageContent';
import ChatMediaAttachment from './ChatMediaAttachment';
import { Loader2, Key, X, LogOut, Download, Image, FileText, CalendarCheck, Paperclip, Send, ArrowLeft, Phone, Search, MessageSquare, Heart, Bell } from 'lucide-react';

function TeacherPortal({ attendanceUser, initialClasses, initialAllStudents, onLogout }) {
   const { config } = useConfig();
   const [loading, setLoading] = useState(false);

   const getDateLimit = () => {
      const dateLimit = new Date();
      if (attDateFilter === 'Hôm nay') dateLimit.setHours(0, 0, 0, 0);
      else if (attDateFilter === 'Tuần này') dateLimit.setDate(dateLimit.getDate() - 7);
      else dateLimit.setMonth(dateLimit.getMonth() - 1);
      return dateLimit;
   };

   const getClassDisplayName = (malop) => {
      const cls = attClasses.find(c => c.malop === malop) || initialClasses?.find(c => c.malop === malop);
      return cls?.tenlop || malop || '--';
   };

   const getMessagePreview = (message) => {
      if (!message) return '--';
      if (message.content) return message.content;
      if (message.image_url) return '[Hình ảnh]';
      if (message.file_mime_type?.toLowerCase().startsWith('video/')) return '[Video]';
      if (message.file_url) return '[Tài liệu]';
      return '...';
   };

   const getFilteredChatStudents = () => {
      const dateLimit = getDateLimit();

      const filtered = attAllStudents.filter(s => {
         const matchesSearch = s.tenhv?.toLowerCase().includes(attSearchQuery.toLowerCase()) || s.mahv?.toLowerCase().includes(attSearchQuery.toLowerCase());
         if (!matchesSearch) return false;

         if (attStatFilter === 'ALL') return true;

         const studentMsgs = attLatestMessages.filter(m => m.mahv === s.mahv);
         return studentMsgs.some(m => {
            if (new Date(m.created_at) < dateLimit) return false;
            const isPH = m.description === 'PH' || (!m.manv);
            if (!isPH) return false;
            const type = getNotifType(m.content);
            if (attStatFilter === 'XIN_NGHI') return type === 'Xin nghỉ';
            if (attStatFilter === 'BAO_THUOC') return type === 'Báo thuốc';
            if (attStatFilter === 'DOI_NGUOI') return type === 'Đổi người đón';
            if (attStatFilter === 'VE_TRE') return type === 'Về trễ';
            if (attStatFilter === 'GUI_TIN_NHAN') return type === 'Tin nhắn';
            return false;
         });
      });

      // Pre-map latest message timestamps for efficient sorting
      const latestTimeMap = {};
      attLatestMessages.forEach(m => {
         if (!latestTimeMap[m.mahv]) {
            latestTimeMap[m.mahv] = new Date(m.created_at).getTime();
         }
      });

      // Sort students: latest message first; students with no messages go to the bottom
      return filtered.sort((a, b) => {
         const timeA = latestTimeMap[a.mahv] || 0;
         const timeB = latestTimeMap[b.mahv] || 0;
         return timeB - timeA;
      });
   };

   const getTeacherStaffDisplayName = (staffId) => {
      if (!staffId) return 'Nhà trường';
      return attStaffDirectory[staffId] || staffId;
   };

   const getTeacherChatSenderName = (message) => {
      if (!message) return '';
      if (message.description === 'PH' || !message.manv) {
         return attChatSelectedStudent?.tenhv ? `Phụ huynh bé ${attChatSelectedStudent.tenhv}` : 'Phụ huynh';
      }

      const currentStaffId = attendanceUser?.manv || attendanceUser?.username;
      if (message.manv === currentStaffId) return 'Bạn';
      return getTeacherStaffDisplayName(message.manv);
   };

   useEffect(() => {
      if ('Notification' in window && Notification.permission === 'default') {
         Notification.requestPermission();
      }
   }, []);

   useEffect(() => {
      const fetchStaffDirectory = async () => {
         const { data, error } = await supabase.from('tbl_nv').select('manv, tennv');
         if (error) {
            console.error('Error fetching teacher staff directory:', error);
            return;
         }

         const nextDirectory = {};
         (data || []).forEach((staff) => {
            if (staff?.manv) nextDirectory[staff.manv] = staff.tennv || staff.manv;
         });
         setAttStaffDirectory(nextDirectory);
      };

      fetchStaffDirectory();
   }, []);

   useEffect(() => {
      const handleResize = () => setIsMobileChatView(window.innerWidth <= 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
   }, []);

   useEffect(() => {
      if (attendanceUser?.manv || attendanceUser?.username) {
         subscribeTeacherPushNotifications().catch(console.error);
      }
   }, [attendanceUser?.manv, attendanceUser?.username]);

   // ----- Attendance Features -----
   const [attDate, setAttDate] = useState(() => {
      const d = new Date();
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().split('T')[0];
   });
   const [attClasses, setAttClasses] = useState(initialClasses || []);
   const [attSelectedClass, setAttSelectedClass] = useState('');
   const [attStudents, setAttStudents] = useState([]);
   const [attRecords, setAttRecords] = useState({});
   const [lessonContent, setLessonContent] = useState('');
   const [isChangePassOpen, setIsChangePassOpen] = useState(false);
   const [changePassData, setChangePassData] = useState({ oldPass: '', newPass: '', confirmPass: '' });
   const [changePassLoading, setChangePassLoading] = useState(false);
   const [changePassMessage, setChangePassMessage] = useState({ type: '', text: '' });

   // ----- Teacher Chat States -----
   const [attTab, setAttTab] = useState('attendance'); // 'attendance' | 'chat' | 'health'
   const [attChatSelectedStudent, setAttChatSelectedStudent] = useState(null);
   const [attUnreadCounts, setAttUnreadCounts] = useState({});
   const [attLatestMessages, setAttLatestMessages] = useState([]);
   const [attChatMessages, setAttChatMessages] = useState([]);
   const [attChatLoading, setAttChatLoading] = useState(false);
   const [attChatInput, setAttChatInput] = useState('');
   const [attChatDocuments, setAttChatDocuments] = useState([]);
   const [attSearchQuery, setAttSearchQuery] = useState('');
   const [attAllStudents, setAttAllStudents] = useState(initialAllStudents || []);
   const attScrollRef = React.useRef();
   const [attChatView, setAttChatView] = useState('dashboard'); // 'dashboard' | 'chat'
   const [attStatFilter, setAttStatFilter] = useState('ALL');
   const [attDateFilter, setAttDateFilter] = useState('Hôm nay');
   const [attReports, setAttReports] = useState({ xinNghi: 0, baoThuoc: 0, guiTinNhan: 0, doiNguoi: 0, veTre: 0 });
   const [uploading, setUploading] = useState(false);
   const [isMobileChatView, setIsMobileChatView] = useState(() => window.innerWidth <= 768);
   const [attStaffDirectory, setAttStaffDirectory] = useState({});
   const [isClassBroadcastOpen, setIsClassBroadcastOpen] = useState(false);
   const [classBroadcastText, setClassBroadcastText] = useState('');
   const [classBroadcastImage, setClassBroadcastImage] = useState(null);
   const [classBroadcastClassId, setClassBroadcastClassId] = useState('');

   const syncAppBadge = (count) => {
      const badgeCount = Number.isFinite(count) ? Math.max(0, count) : 0;

      if ('setAppBadge' in navigator) {
         if (badgeCount > 0) navigator.setAppBadge(badgeCount).catch(console.error);
         else if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(console.error);
      }

      if (navigator.serviceWorker?.controller) {
         navigator.serviceWorker.controller.postMessage({
            type: 'SYNC_APP_BADGE',
            count: badgeCount
         });
      }
   };

   const subscribeTeacherPushNotifications = async () => {
      if (!attendanceUser?.manv && !attendanceUser?.username) {
         console.warn('Chưa xác định được tài khoản giáo viên để bật thông báo.');
         return;
      }
      if (!('serviceWorker' in navigator)) {
         console.warn('Trình duyệt không hỗ trợ Service Worker.');
         return;
      }
      if (!('PushManager' in window)) {
         console.warn('Trình duyệt không hỗ trợ Push Notifications.');
         return;
      }

      try {
         const permission = await Notification.requestPermission();
         if (permission !== 'granted') {
            console.warn('Người dùng đã từ chối nhận thông báo.');
            return;
         }

         const registration = await navigator.serviceWorker.ready;
         const publicVapidKey = process.env.REACT_APP_VAPID_PUBLIC_KEY || '';

         const urlBase64ToUint8Array = (base64String) => {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = window.atob(base64);
            const outputArray = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) {
               outputArray[i] = rawData.charCodeAt(i);
            }
            return outputArray;
         };

         const existingSubscription = await registration.pushManager.getSubscription();
         const subscription = existingSubscription || await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
         });

         const teacherId = attendanceUser.manv || attendanceUser.username;
         const { error: dbError } = await supabase.from('push_subscriptions').upsert({
            user_id: teacherId,
            role: 'teacher',
            subscription,
            updated_at: new Date().toISOString()
         }, { onConflict: 'user_id' });

         if (dbError) throw dbError;

         console.log(existingSubscription ? 'Thông báo đã được bật sẵn cho giáo viên.' : 'Đã bật thông báo cho giáo viên thành công!');
      } catch (err) {
         console.error('Lỗi khi đăng ký nhận thông báo cho giáo viên:', err);
         console.error('Có lỗi khi bật thông báo: ' + err.message);
      }
   };

   useEffect(() => {
      setAttClasses(initialClasses || []);
      setAttAllStudents(initialAllStudents || []);
   }, [initialClasses, initialAllStudents]);

   useEffect(() => {
      const loadData = async () => {
         if (!attSelectedClass) { setAttStudents([]); setAttRecords({}); setLessonContent(''); return; }

         // Lấy danh sách học sinh từ bảng tbl_hv
         const { data: stFound, error: stError } = await supabase.from('tbl_hv').select('*').eq('malop', attSelectedClass);
         if (stError) console.error('Error fetching students:', stError);

         // Lọc bỏ học sinh đã nghỉ ở phía client để tránh lỗi cú pháp truy vấn
         const studentsFound = (stFound || []).filter(s => s.trangthai !== 'Đã Nghỉ');

         // Lấy thông tin sức khỏe mới nhất từ suckhoedinhky
         if (studentsFound.length > 0) {
            const stIds = studentsFound.map(s => s.mahv);
            const { data: healthData } = await supabase.from('suckhoedinhky').select('*').in('mahv', stIds).order('ngay', { ascending: false });
            if (healthData) {
               studentsFound.forEach(s => {
                  const latest = healthData.find(h => h.mahv === s.mahv);
                  if (latest) {
                     s.chieucao = latest.chieucao;
                     s.cannang = latest.cannang;
                  }
               });
            }
         }
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
      };
      if (attendanceUser) loadData();
   }, [attSelectedClass, attDate, attendanceUser]);

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

         window.alert('Lưu điểm danh thành công!');
      } catch (err) { console.error(err); window.alert('Lỗi lưu điểm danh'); }
      setLoading(false);
   };

   const handleSaveHealth = async () => {
      if (!attSelectedClass) return window.alert('Chưa chọn lớp!');
      setLoading(true);
      try {
         const today = new Date().toISOString();
         for (const st of attStudents) {
            // 1. Lưu vào bảng lịch sử sức khỏe định kỳ
            const healthPayload = {
               mahv: st.mahv,
               chieucao: st.chieucao || '',
               cannang: st.cannang || '',
               ngay: today
            };
            const { data: insertedHealth, error: healthError } = await supabase.from('suckhoedinhky').insert([healthPayload]).select();
            if (!healthError && insertedHealth && insertedHealth.length > 0) {
               await triggerPushNotification(supabase, 'suckhoedinhky', insertedHealth[0]);
            }

            // 2. Cập nhật nhận xét vào bảng học viên (tinhtrangsk)
            const hvPayload = {};
            if (st.hasOwnProperty('ghichusuckhoe')) hvPayload.ghichusuckhoe = st.ghichusuckhoe;
            else if (st.hasOwnProperty('tinhtrangsk')) hvPayload.tinhtrangsk = st.ghichusuckhoe || st.tinhtrangsk;

            if (Object.keys(hvPayload).length > 0) {
               await supabase.from('tbl_hv').update(hvPayload).eq('mahv', st.mahv);
            }
         }
         window.alert('Lưu thông tin sức khỏe thành công!');
      } catch (err) { console.error(err); window.alert('Lỗi lưu sức khỏe: ' + err.message); }
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

         const { error: updateError } = await supabase
            .from('tbl_nv')
            .update({ password: changePassData.newPass })
            .eq('manv', attendanceUser.manv);

         if (updateError) throw updateError;

         setChangePassMessage({ type: 'success', text: 'Mật khẩu đã được thay đổi thành công!' });
         setChangePassData({ oldPass: '', newPass: '', confirmPass: '' });
         setTimeout(() => setIsChangePassOpen(false), 2000);
      } catch (err) {
         console.error('Error changing password:', err);
         setChangePassMessage({ type: 'error', text: 'Lỗi khi thay đổi mật khẩu. Vui lòng thử lại.' });
      } finally {
         setChangePassLoading(false);
      }
   };

   const fetchAttUnreads = async () => {
      if (!attendanceUser || attAllStudents.length === 0) return;

      const studentIds = attAllStudents.map(s => s.mahv);
      if (studentIds.length === 0) return;

      const { data } = await supabase
         .from('hv_messages')
         .select('content, mahv, manv, description')
         .in('mahv', studentIds)
         .is('is_read', false);

      if (data) {
         const counts = {};
         let totalUnread = 0;
         data.forEach(d => {
            const isPH = d.description === 'PH' || (!d.manv);
            if (isPH) {
               if (d.content?.includes('📬 [HÒM THƯ GÓP Ý - GỬI HIỆU TRƯỞNG]')) return;
               counts[d.mahv] = (counts[d.mahv] || 0) + 1;
               totalUnread++;
            }
         });
         setAttUnreadCounts(counts);

         syncAppBadge(totalUnread);
      } else {
         setAttUnreadCounts({});
         syncAppBadge(0);
      }
   };

   const fetchAttSummaries = async () => {
      if (!attendanceUser) return;

      let dateLimit = new Date();
      if (attDateFilter === 'Hôm nay') dateLimit.setHours(0, 0, 0, 0);
      else if (attDateFilter === 'Tuần này') dateLimit.setDate(dateLimit.getDate() - 7);
      else dateLimit.setMonth(dateLimit.getMonth() - 1);

      const { data: msgs } = await supabase.from('hv_messages').select('*').order('created_at', { ascending: false });

      if (msgs) {
         setAttLatestMessages(msgs);
         const reps = { xinNghi: 0, baoThuoc: 0, guiTinNhan: 0, doiNguoi: 0, veTre: 0 };
         msgs.forEach(m => {
            if (new Date(m.created_at) < dateLimit) return;
            const content = m.content?.toUpperCase() || '';
            const isPH = m.description === 'PH' || (!m.manv);
            if (!isPH) return;

            if (content.includes('XIN NGHỈ') || content.includes('XIN NGHI')) reps.xinNghi++;
            else if (content.includes('DẶN THUỐC') || content.includes('DAN THUOC')) reps.baoThuoc++;
            else if (content.includes('ĐỔI NGƯỜI') || content.includes('DOI NGUOI')) reps.doiNguoi++;
            else if (content.includes('VỀ TRỄ') || content.includes('VE TRE')) reps.veTre++;
            else reps.guiTinNhan++;
         });
         setAttReports(reps);
      }
   };

   const getNotifType = (content) => {
      if (!content) return null;
      const c = content.toUpperCase();
      if (c.includes('XIN NGHỈ') || c.includes('XIN NGHI')) return 'Xin nghỉ';
      if (c.includes('DẶN THUỐC') || c.includes('DAN THUOC')) return 'Báo thuốc';
      if (c.includes('ĐỔI NGƯỜI') || c.includes('DOI NGUOI')) return 'Đổi người đón';
      if (c.includes('VỀ TRỄ') || c.includes('VE TRE')) return 'Về trễ';
      return 'Tin nhắn';
   };

   useEffect(() => {
      const fetchAllStudentsData = async () => {
         if (attendanceUser && attTab === 'chat' && attAllStudents.length === 0) {
            const { data: allCls } = await supabase.from('tbl_lop').select('*').or('daxoa.neq."Đã Xóa",daxoa.is.null');
            if (allCls) {
               const teacherClasses = allCls.filter(c => c.manv === attendanceUser.manv || c.manv === attendanceUser.username || c.manv === attendanceUser.tennv || c.manv === attendanceUser.id);
               if (teacherClasses.length > 0) {
                  const classIds = teacherClasses.map(c => c.malop);
                  const { data: allSts } = await supabase.from('tbl_hv').select('mahv, tenhv, malop, imgpath').in('malop', classIds).or('trangthai.neq."Đã Nghỉ",trangthai.is.null');
                  if (allSts) setAttAllStudents(allSts);
               }
            }
         }
      };
      fetchAllStudentsData();
      if (attendanceUser) {
         fetchAttUnreads();
         if (attTab === 'chat') {
            fetchAttSummaries();
            const interval = setInterval(() => { fetchAttSummaries(); fetchAttUnreads(); }, 30000);
            return () => clearInterval(interval);
         }
      }
   }, [attendanceUser, attTab, attDateFilter, attAllStudents]);

   useEffect(() => {
      if (attendanceUser) {
         fetchAttUnreads();
         fetchAttSummaries();
         const channel = supabase.channel('teacher_chat_monitor')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hv_messages' }, (payload) => {
               const isPH = payload.new.description === 'PH' || (!payload.new.manv);
               if (isPH) {
                  // Only notify if student is in teacher's classes
                  if (attAllStudents.some(s => s.mahv === payload.new.mahv)) {
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
               }
               fetchAttUnreads(); fetchAttSummaries();
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hv_messages' }, () => {
               fetchAttUnreads(); fetchAttSummaries();
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'hv_messages' }, () => {
               fetchAttUnreads(); fetchAttSummaries();
            })
            .subscribe();
         return () => supabase.removeChannel(channel);
      }
   }, [attendanceUser, attDateFilter]);

   useEffect(() => {
      if (attTab === 'chat' && attChatSelectedStudent) {
         const markAsRead = async () => {
            setAttUnreadCounts(prev => {
               const next = { ...prev };
               delete next[attChatSelectedStudent.mahv];
               return next;
            });
            await supabase.from('hv_messages').update({ is_read: true }).eq('mahv', attChatSelectedStudent.mahv).is('is_read', false);
            fetchAttUnreads();
         };
         markAsRead();

         const fetchMessages = async () => {
            setAttChatLoading(true);
            const { data } = await supabase.from('hv_messages').select('*').eq('mahv', attChatSelectedStudent.mahv).order('created_at', { ascending: true });
            if (data) setAttChatMessages(data);
            setAttChatLoading(false);
            setTimeout(() => { if (attScrollRef.current) attScrollRef.current.scrollTop = attScrollRef.current.scrollHeight; }, 100);
         };

         const fetchDocs = async () => {
            const { data } = await supabase.from('documents').select('*').eq('mahv', attChatSelectedStudent.mahv).order('created_at', { ascending: false });
            if (data) setAttChatDocuments(data);
         };

         fetchMessages();
         fetchDocs();

         const threadChannel = supabase.channel(`att_thread_${attChatSelectedStudent.mahv}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hv_messages', filter: `mahv=eq.${attChatSelectedStudent.mahv}` }, (payload) => {
               setAttChatMessages(prev => {
                  if (prev.some(m => m.id === payload.new.id)) return prev;
                  return [...prev, payload.new];
               });
               setTimeout(() => { if (attScrollRef.current) attScrollRef.current.scrollTop = attScrollRef.current.scrollHeight; }, 100);
            }).subscribe();

         return () => supabase.removeChannel(threadChannel);
      }
   }, [attTab, attChatSelectedStudent]);

   const handleAttSendChat = async (e) => {
      e.preventDefault();
      if (!attChatInput.trim() || !attChatSelectedStudent || !attendanceUser) return;
      const newMessage = {
         mahv: attChatSelectedStudent.mahv,
         manv: attendanceUser.manv || attendanceUser.username,
         content: attChatInput
      };
      const { data, error } = await supabase.from('hv_messages').insert([newMessage]).select();
      if (!error && data) {
         await triggerPushNotification(supabase, 'hv_messages', data[0]);
         setAttChatInput('');
         setTimeout(() => { if (attScrollRef.current) attScrollRef.current.scrollTop = attScrollRef.current.scrollHeight; }, 100);
      }
   };

   const handleAttFileUpload = async (e, type) => {
      const fileInput = e.target.files[0];
      if (!fileInput || !attChatSelectedStudent || !attendanceUser) return;

      setUploading(true);
      try {
         let file = fileInput;
         if (type === 'image') { try { file = await compressImage(fileInput, 150); } catch (err) { } }

         let finalUrl = '';
         if (config.r2_enabled) {
            finalUrl = await uploadToR2(file, config.r2_endpoint, config.r2_access_key_id, config.r2_secret_access_key, config.r2_bucket_name, config.r2_public_url);
         } else {
            const fileName = `${attChatSelectedStudent.mahv}_${Date.now()}_${file.name}`;
            const folder = type === 'image' ? 'chat-images' : 'chat-files';
            const { error } = await supabase.storage.from('assets').upload(`${folder}/${fileName}`, file);
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(`${folder}/${fileName}`);
            finalUrl = publicUrl;
         }

         const msgPayload = {
            mahv: attChatSelectedStudent.mahv,
            manv: attendanceUser.manv || attendanceUser.username,
            content: '',
            image_url: type === 'image' ? finalUrl : null,
            file_url: type !== 'image' ? finalUrl : null,
            file_name: file.name,
            file_mime_type: file.type
         };

         const { data } = await supabase.from('hv_messages').insert([msgPayload]).select();
         if (data) {
            await triggerPushNotification(supabase, 'hv_messages', data[0]);
            setTimeout(() => { if (attScrollRef.current) attScrollRef.current.scrollTop = attScrollRef.current.scrollHeight; }, 100);
         }

         const newDoc = {
            mahv: attChatSelectedStudent.mahv,
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

   const getBroadcastClassOptions = () => {
      const classMap = new Map();

      attAllStudents.forEach((student) => {
         if (!student?.mahv || !student?.malop || classMap.has(student.malop)) return;
         classMap.set(student.malop, {
            malop: student.malop,
            label: getClassDisplayName(student.malop)
         });
      });

      return Array.from(classMap.values());
   };

   const openClassBroadcastModal = () => {
      const classOptions = getBroadcastClassOptions();
      if (classOptions.length === 0) {
         window.alert('Kh\u00f4ng c\u00f3 l\u1edbp n\u00e0o \u0111\u1ec3 g\u1eedi th\u00f4ng b\u00e1o.');
         return;
      }

      setClassBroadcastClassId(attChatSelectedStudent?.malop || classBroadcastClassId || classOptions[0].malop);
      setIsClassBroadcastOpen(true);
   };

   const closeClassBroadcastModal = () => {
      setIsClassBroadcastOpen(false);
      setClassBroadcastText('');
      setClassBroadcastImage(null);
      setClassBroadcastClassId('');
   };

   const handleClassBroadcastImageChange = (e) => {
      const selectedFile = e.target.files?.[0] || null;
      setClassBroadcastImage(selectedFile);
      e.target.value = '';
   };

   const handleBroadcastToClass = async (e) => {
      e.preventDefault();
      if (!attendanceUser) return;

      const messageText = classBroadcastText.trim();
      if (false && !messageText && !classBroadcastImage) {
         window.alert('Vui lòng nhập nội dung hoặc chọn hình để gửi.');
         return;
      }

      if (!messageText && !classBroadcastImage) {
         window.alert('Vui l\u00f2ng nh\u1eadp n\u1ed9i dung ho\u1eb7c ch\u1ecdn h\u00ecnh \u0111\u1ec3 g\u1eedi.');
         return;
      }

      if (!classBroadcastClassId) {
         window.alert('Vui l\u00f2ng ch\u1ecdn l\u1edbp c\u1ea7n g\u1eedi.');
         return;
      }

      const classStudents = attAllStudents.filter(
         (student) => student?.mahv && student.malop === classBroadcastClassId
      );

      if (classStudents.length === 0) {
         window.alert('Kh\u00f4ng t\u00ecm th\u1ea5y h\u1ecdc sinh n\u00e0o trong l\u1edbp n\u00e0y.');
         return;
      }
      setUploading(true);
      try {
         let uploadedImageUrl = null;
         let uploadedImageName = null;
         let uploadedImageType = null;

         if (classBroadcastImage) {
            let file = classBroadcastImage;
            try {
               file = await compressImage(classBroadcastImage, 150);
            } catch (err) { }

            if (config.r2_enabled) {
               uploadedImageUrl = await uploadToR2(file, config.r2_endpoint, config.r2_access_key_id, config.r2_secret_access_key, config.r2_bucket_name, config.r2_public_url);
            } else {
               const fileName = `${classBroadcastClassId || 'class'}_${Date.now()}_${file.name}`;
               const { error } = await supabase.storage.from('assets').upload(`chat-images/${fileName}`, file);
               if (error) throw error;
               const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(`chat-images/${fileName}`);
               uploadedImageUrl = publicUrl;
            }

            uploadedImageName = classBroadcastImage.name;
            uploadedImageType = classBroadcastImage.type;
         }

         const staffId = attendanceUser.manv || attendanceUser.username;
         const payloads = [{
            malop: classBroadcastClassId,
            manv: staffId,
            title: 'THÔNG BÁO',
            content: messageText,
            image_url: uploadedImageUrl,
            file_url: null,
            file_name: uploadedImageName,
            file_mime_type: uploadedImageType
         }];

         const { data: insertedAnnouncements, error: insertError } = await supabase.from('class_announcements').insert(payloads).select();
         if (insertError) throw insertError;

         for (const announcement of insertedAnnouncements || []) {
            await triggerPushNotification(supabase, 'class_announcements', announcement);
         }

         if (false && uploadedImageUrl) {
            const documentPayloads = classStudents.map((student) => ({
               mahv: student.mahv,
               name: uploadedImageName || 'Thong bao lop',
               category: 'Ảnh',
               file_url: uploadedImageUrl,
               mime_type: uploadedImageType
            }));
            await supabase.from('documents').insert(documentPayloads);
         }

         closeClassBroadcastModal();
         setTimeout(() => {
            if (attScrollRef.current) attScrollRef.current.scrollTop = attScrollRef.current.scrollHeight;
         }, 100);
      } catch (err) {
         window.alert('L\u1ed7i khi g\u1eedi th\u00f4ng b\u00e1o c\u1ea3 l\u1edbp: ' + err.message);
      } finally {
         setUploading(false);
      }
   };

   return (
      <div className="attendance-portal" style={{ textAlign: 'left', animation: 'fadeIn 0.3s ease' }}>
         <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
            <div>
               <h2 style={{ fontSize: '1.4rem', margin: 0 }}>{attTab === 'attendance' ? 'Điểm Danh Lớp Học' : 'Trung Tâm Tin Nhắn'}</h2>
               <p style={{ color: '#64748b', margin: 0, marginTop: '5px' }}>Tài khoản: <strong>{attendanceUser.tennv || attendanceUser.username}</strong></p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
               <button onClick={subscribeTeacherPushNotifications} title="Bật thông báo PWA" style={{ width: '36px', height: '36px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}>
                  <Bell size={18} />
               </button>
               <button onClick={() => setIsChangePassOpen(true)} title="Đổi mật khẩu" style={{ width: '36px', height: '36px', background: '#f5f3ff', color: '#5b21b6', border: '1px solid #ddd6fe', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}>
                  <Key size={18} />
               </button>
               <button onClick={onLogout} title="Đăng xuất" style={{ width: '36px', height: '36px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fee2e2', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}>
                  <LogOut size={18} />
               </button>
            </div>
         </div>

         {/* Tab Navigation */}
         <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: '#f1f5f9', padding: '0.4rem', borderRadius: '12px' }}>
            <button onClick={() => setAttTab('attendance')} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', background: attTab === 'attendance' ? 'white' : 'transparent', color: attTab === 'attendance' ? '#ec4899' : '#64748b', boxShadow: attTab === 'attendance' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: '0.2s' }}>
               <CalendarCheck size={18} /> Điểm danh
            </button>
            <button onClick={() => setAttTab('chat')} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', background: attTab === 'chat' ? 'white' : 'transparent', color: attTab === 'chat' ? '#ec4899' : '#64748b', boxShadow: attTab === 'chat' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: '0.2s', position: 'relative' }}>
               <MessageSquare size={18} /> Trò chuyện
               {Object.values(attUnreadCounts).reduce((a, b) => a + b, 0) > 0 && (
                  <span style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#ef4444', color: 'white', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px', border: '2px solid white' }}>
                     {Object.values(attUnreadCounts).reduce((a, b) => a + b, 0)}
                  </span>
               )}
            </button>
            <button onClick={() => setAttTab('health')} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', background: attTab === 'health' ? 'white' : 'transparent', color: attTab === 'health' ? '#ec4899' : '#64748b', boxShadow: attTab === 'health' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: '0.2s' }}>
               <Heart size={18} /> Sức khỏe
            </button>
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
                           <input type="password" value={changePassData.oldPass} onChange={e => setChangePassData({ ...changePassData, oldPass: e.target.value })} required style={{ padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                        </div>
                        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', textAlign: 'left' }}>
                           <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Mật khẩu mới</label>
                           <input type="password" value={changePassData.newPass} onChange={e => setChangePassData({ ...changePassData, newPass: e.target.value })} required style={{ padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                        </div>
                        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', textAlign: 'left' }}>
                           <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Xác nhận mật khẩu mới</label>
                           <input type="password" value={changePassData.confirmPass} onChange={e => setChangePassData({ ...changePassData, confirmPass: e.target.value })} required style={{ padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                           <button type="button" onClick={() => setIsChangePassOpen(false)} style={{ flex: 1, padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: 'white', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}>Hủy</button>
                           <button type="submit" className="btn btn-primary" disabled={changePassLoading} style={{ flex: 2, padding: '0.6rem', border: 'none', borderRadius: '6px', background: '#3b82f6', color: 'white', fontWeight: 600, cursor: 'pointer' }}>{changePassLoading ? 'Đang lưu...' : 'Lưu mật khẩu'}</button>
                        </div>
                     </form>
                  </div>
               </div>
            </div>
         )}

         {attTab === 'attendance' && (
            <div className="attendance-tab-content">
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
                  <>
                     <div className="attendance-portal-list">
                        {attStudents.length > 0 ? attStudents.map(st => {
                           const rec = attRecords[st.mahv] || {};
                           return (
                              <div key={st.mahv} className="attendance-portal-card">
                                 <div>
                                    <strong style={{ fontSize: '1.1rem', color: '#0f172a' }}>{st.tenhv}</strong>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>{st.mahv}</div>
                                 </div>
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
                                             <input type="radio" name={`tt_${st.mahv}`} checked={rec.trangthai === 'Nghỉ phép'} onChange={() => handleUpdateRecord(st.mahv, 'trangthai', 'Nghỉ phép')} /> Nghỉ P
                                          </label>
                                       )}
                                       {(!config?.cotdiemdanh?.selected || config.cotdiemdanh.selected.includes('vangKP')) && (
                                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#dc2626', fontWeight: 700, fontSize: '0.95rem', background: rec.trangthai === 'Nghỉ không phép' ? '#fef2f2' : 'transparent', padding: '0.4rem 0.75rem', borderRadius: '8px', border: rec.trangthai === 'Nghỉ không phép' ? '1px solid #fee2e2' : '1px solid #e2e8f0', transition: '0.2s' }}>
                                             <input type="radio" name={`tt_${st.mahv}`} checked={rec.trangthai === 'Nghỉ không phép'} onChange={() => handleUpdateRecord(st.mahv, 'trangthai', 'Nghỉ không phép')} /> Nghỉ KP
                                          </label>
                                       )}
                                    </div>
                                 </div>
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
         )}
         {attTab === 'health' && (
            <div className="health-tab-content" style={{ animation: 'fadeIn 0.3s ease' }}>
               <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', color: '#334155' }}>Chọn Lớp</label>
                  <select value={attSelectedClass} onChange={e => setAttSelectedClass(e.target.value)} style={{ width: '100%', padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                     <option value="">-- {attClasses.length > 0 ? 'Chọn Lớp' : 'Không có lớp phân công'} --</option>
                     {attClasses.map(c => <option key={c.malop} value={c.malop}>{c.tenlop || c.malop}</option>)}
                  </select>
               </div>

               {attSelectedClass && (
                  <>
                     <div className="attendance-portal-list">
                        {attStudents.length > 0 ? attStudents.map(st => (
                           <div key={st.mahv} className="attendance-portal-card" style={{ borderLeft: '4px solid #ec4899', padding: '1.2rem' }}>
                              <div style={{ marginBottom: '12px' }}>
                                 <strong style={{ fontSize: '1.1rem', color: '#0f172a' }}>{st.tenhv}</strong>
                                 <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>{st.mahv}</div>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '12px' }}>
                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Chiều cao (cm)</label>
                                    <input type="number" value={st.chieucao || ''} onChange={e => setAttStudents(prev => prev.map(s => s.mahv === st.mahv ? { ...s, chieucao: e.target.value } : s))} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }} />
                                 </div>
                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Cân nặng (kg)</label>
                                    <input type="number" step="0.1" value={st.cannang || ''} onChange={e => setAttStudents(prev => prev.map(s => s.mahv === st.mahv ? { ...s, cannang: e.target.value } : s))} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }} />
                                 </div>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                 <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Nhận xét sức khỏe</label>
                                 <textarea
                                    placeholder="Nhận xét tình trạng sức khỏe của bé..."
                                    value={st.hasOwnProperty('ghichusuckhoe') ? (st.ghichusuckhoe || '') : (st.tinhtrangsk || '')}
                                    onChange={e => setAttStudents(prev => prev.map(s => s.mahv === st.mahv ? (s.hasOwnProperty('ghichusuckhoe') ? { ...s, ghichusuckhoe: e.target.value } : { ...s, tinhtrangsk: e.target.value }) : s))}
                                    rows="2"
                                    style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', resize: 'vertical', fontSize: '0.9rem', fontFamily: 'inherit' }}
                                 />
                              </div>
                           </div>
                        )) : (
                           <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: '#64748b', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #e2e8f0' }}>Lớp không có học sinh.</div>
                        )}
                     </div>
                     {attStudents.length > 0 && (
                        <button onClick={handleSaveHealth} disabled={loading} style={{ width: '100%', padding: '1rem', marginTop: '1.5rem', background: '#ec4899', color: 'white', fontWeight: 700, border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 6px -1px rgba(236, 72, 153, 0.3)' }}>
                           {loading ? <Loader2 size={20} className="spinner" /> : 'Lưu Thông Tin Sức Khỏe'}
                        </button>
                     )}
                  </>
               )}
            </div>
         )}

         {attTab === 'chat' && (
            <div className="teacher-chat-portal" style={{ animation: 'fadeIn 0.3s ease', minHeight: '600px' }}>
               {attChatView === 'dashboard' ? (
                  <div className="chat-dashboard" style={{ padding: '0', background: 'transparent' }}>
                     <div className="chat-filters-row" style={{ marginBottom: '1.5rem', gap: '1rem', display: 'flex', flexDirection: isMobileChatView ? 'column' : 'row' }}>
                        <div className="filter-group">
                           <div style={{ display: 'flex', gap: '0.75rem', flexDirection: isMobileChatView ? 'column' : 'row', alignItems: isMobileChatView ? 'stretch' : 'center' }}>
                              <div className="search-input-wrapper" style={{ width: '100%', maxWidth: isMobileChatView ? '100%' : '300px' }}>
                                 <Search size={18} className="search-icon-inside" />
                                 <input type="text" placeholder={'T\u00ecm theo t\u00ean/m\u00e3...'} value={attSearchQuery} onChange={(e) => setAttSearchQuery(e.target.value)} />
                              </div>
                              <button
                                 type="button"
                                 onClick={openClassBroadcastModal}
                                 title={'G\u1eedi th\u00f4ng b\u00e1o c\u1ea3 l\u1edbp'}
                                 style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0.8rem 1rem', minWidth: isMobileChatView ? '100%' : '160px', background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: '12px', color: '#be185d', cursor: 'pointer', fontWeight: 700 }}
                              >
                                 <Bell size={16} />
                                 <span>{'G\u1eedi c\u1ea3 l\u1edbp'}</span>
                              </button>
                           </div>
                        </div>
                        <div className="filter-group">
                           <div className="date-filters">
                              {['Hôm nay', 'Tuần này', 'Tháng này'].map(f => (
                                 <button key={f} className={`date-filter-btn ${attDateFilter === f ? 'active' : ''}`} onClick={() => setAttDateFilter(f)}>
                                    {f}
                                 </button>
                              ))}
                           </div>
                        </div>
                     </div>

                     <div className="quick-reports-container" style={{ gridTemplateColumns: isMobileChatView ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: '1.5rem', gap: isMobileChatView ? '0.75rem' : undefined }}>
                        <div className="report-card xin-nghi" onClick={() => setAttStatFilter(attStatFilter === 'XIN_NGHI' ? 'ALL' : 'XIN_NGHI')} style={{ outline: attStatFilter === 'XIN_NGHI' ? '3px solid #ef4444' : 'none' }}>
                           <span className="report-label">Xin nghỉ</span>
                           <span className="report-value">{String(attReports.xinNghi).padStart(2, '0')}</span>
                        </div>
                        <div className="report-card bao-thuoc" onClick={() => setAttStatFilter(attStatFilter === 'BAO_THUOC' ? 'ALL' : 'BAO_THUOC')} style={{ outline: attStatFilter === 'BAO_THUOC' ? '3px solid #854d0e' : 'none' }}>
                           <span className="report-label">Báo thuốc</span>
                           <span className="report-value">{String(attReports.baoThuoc).padStart(2, '0')}</span>
                        </div>
                        <div className="report-card gui-tin-nhan" onClick={() => setAttStatFilter(attStatFilter === 'GUI_TIN_NHAN' ? 'ALL' : 'GUI_TIN_NHAN')} style={{ outline: attStatFilter === 'GUI_TIN_NHAN' ? '3px solid #3b82f6' : 'none' }}>
                           <span className="report-label">Tin nhắn</span>
                           <span className="report-value">{String(attReports.guiTinNhan).padStart(2, '0')}</span>
                        </div>
                        <div className="report-card doi-nguoi" onClick={() => setAttStatFilter(attStatFilter === 'DOI_NGUOI' ? 'ALL' : 'DOI_NGUOI')} style={{ outline: attStatFilter === 'DOI_NGUOI' ? '3px solid #065f46' : 'none' }}>
                           <span className="report-label">Đổi người</span>
                           <span className="report-value">{String(attReports.doiNguoi).padStart(2, '0')}</span>
                        </div>
                        <div className="report-card ve-tre" onClick={() => setAttStatFilter(attStatFilter === 'VE_TRE' ? 'ALL' : 'VE_TRE')} style={{ outline: attStatFilter === 'VE_TRE' ? '3px solid #7c3aed' : 'none' }}>
                           <span className="report-label">Về trễ</span>
                           <span className="report-value">{String(attReports.veTre).padStart(2, '0')}</span>
                        </div>
                     </div>

                     {isMobileChatView && (
                        <div style={{ display: 'grid', gap: '0.85rem' }}>
                           {(() => {
                              const filtered = getFilteredChatStudents();
                              const dateLimit = getDateLimit();

                              if (filtered.length === 0) {
                                 return <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', background: '#fff', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>Không có dữ liệu phù hợp</div>;
                              }

                              return filtered.map(st => {
                                 const studentMsgs = attLatestMessages.filter(m => m.mahv === st.mahv);
                                 let msgToShow = studentMsgs[0];

                                 if (attStatFilter !== 'ALL') {
                                    const matchingMsg = studentMsgs.find(m => {
                                       if (new Date(m.created_at) < dateLimit) return false;
                                       const isPH = m.description === 'PH' || (!m.manv);
                                       if (!isPH) return false;
                                       const type = getNotifType(m.content);
                                       if (attStatFilter === 'XIN_NGHI') return type === 'Xin nghỉ';
                                       if (attStatFilter === 'BAO_THUOC') return type === 'Báo thuốc';
                                       if (attStatFilter === 'DOI_NGUOI') return type === 'Đổi người đón';
                                       if (attStatFilter === 'VE_TRE') return type === 'Về trễ';
                                       if (attStatFilter === 'GUI_TIN_NHAN') return type === 'Tin nhắn';
                                       return false;
                                    });
                                    if (matchingMsg) msgToShow = matchingMsg;
                                 }

                                 const unread = attUnreadCounts[st.mahv] || 0;
                                 const type = getNotifType(msgToShow?.content);

                                 return (
                                    <button
                                       key={st.mahv}
                                       onClick={() => { setAttChatSelectedStudent(st); setAttChatView('chat'); }}
                                       style={{ textAlign: 'left', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '0.95rem', background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)', boxShadow: '0 8px 20px rgba(15, 23, 42, 0.05)', cursor: 'pointer' }}
                                    >
                                       <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem' }}>
                                          <div style={{ width: '42px', height: '42px', flexShrink: 0, borderRadius: '14px', background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                             {st.tenhv?.charAt(0)}
                                          </div>
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                                                <div style={{ fontSize: '0.98rem', fontWeight: 700, color: '#0f172a' }}>{st.tenhv}</div>
                                                {unread > 0 && <span style={{ background: '#ef4444', color: 'white', fontSize: '0.72rem', padding: '2px 7px', borderRadius: '999px', fontWeight: 700 }}>+{unread}</span>}
                                             </div>
                                             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.55rem' }}>
                                                <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>{getClassDisplayName(st.malop)}</span>
                                                <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                                                   {msgToShow ? new Date(msgToShow.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                                </span>
                                             </div>
                                             {type && (
                                                <div style={{ marginBottom: '0.5rem' }}>
                                                   <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, background: '#fce7f3', color: '#be185d' }}>
                                                      {type}
                                                   </span>
                                                </div>
                                             )}
                                             <div style={{ fontSize: '0.83rem', color: '#475569', lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                                {getMessagePreview(msgToShow)}
                                             </div>
                                          </div>
                                       </div>
                                    </button>
                                 );
                              });
                           })()}
                        </div>
                     )}

                     <div className="chat-table-wrapper" style={{ borderRadius: '12px', display: isMobileChatView ? 'none' : 'block' }}>
                        <table className="chat-data-table">
                           <thead>
                              <tr>
                                 <th>Học sinh</th>
                                 <th>Lớp</th>
                                 <th>Thông báo mới nhất</th>
                                 <th>Thời gian</th>
                              </tr>
                           </thead>
                           <tbody>
                              {(() => {
                                 const filtered = getFilteredChatStudents();
                                 const dateLimit = getDateLimit();

                                 if (filtered.length === 0) {
                                    return <tr><td colSpan="4" className="no-results" style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Không có dữ liệu phù hợp</td></tr>
                                 }

                                 return filtered.map(st => {
                                    const studentMsgs = attLatestMessages.filter(m => m.mahv === st.mahv);
                                    let msgToShow = studentMsgs[0];

                                    if (attStatFilter !== 'ALL') {
                                       const matchingMsg = studentMsgs.find(m => {
                                          if (new Date(m.created_at) < dateLimit) return false;
                                          const isPH = m.description === 'PH' || (!m.manv);
                                          if (!isPH) return false;
                                          const type = getNotifType(m.content);
                                          if (attStatFilter === 'XIN_NGHI') return type === 'Xin nghỉ';
                                          if (attStatFilter === 'BAO_THUOC') return type === 'Báo thuốc';
                                          if (attStatFilter === 'DOI_NGUOI') return type === 'Đổi người đón';
                                          if (attStatFilter === 'VE_TRE') return type === 'Về trễ';
                                          if (attStatFilter === 'GUI_TIN_NHAN') return type === 'Tin nhắn';
                                          return false;
                                       });
                                       if (matchingMsg) msgToShow = matchingMsg;
                                    }

                                    const unread = attUnreadCounts[st.mahv] || 0;
                                    const type = getNotifType(msgToShow?.content);

                                    return (
                                       <tr key={st.mahv} onClick={() => { setAttChatSelectedStudent(st); setAttChatView('chat'); }} style={{ cursor: 'pointer' }}>
                                          <td className="student-name-cell">
                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ec4899', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem' }}>
                                                   {st.tenhv?.charAt(0)}
                                                </div>
                                                <span>{st.tenhv}</span>
                                                {unread > 0 && <span style={{ background: '#ef4444', color: 'white', fontSize: '0.7rem', padding: '1px 5px', borderRadius: '4px' }}>+{unread}</span>}
                                             </div>
                                          </td>
                                          <td>{getClassDisplayName(st.malop)}</td>
                                          <td>
                                             {msgToShow ? (
                                                <div style={{ fontSize: '0.8rem', color: '#475569', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={msgToShow.content}>
                                                   {msgToShow.content || (msgToShow.image_url ? '📷 [Hình ảnh]' : (msgToShow.file_url ? '📎 [Tài liệu]' : '...'))}
                                                </div>
                                             ) : <span style={{ color: '#cbd5e1' }}>--</span>}
                                          </td>
                                          <td className="time-cell">
                                             {msgToShow ? new Date(msgToShow.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                          </td>
                                       </tr>
                                    );
                                 });
                              })()}
                           </tbody>
                        </table>
                     </div>
                  </div>
               ) : (
                  <div className="teacher-chat-container" style={{ display: 'flex', flexDirection: 'column', height: '600px', background: '#f8fafc', borderRadius: '16px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                     <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div style={{ padding: '0.75rem 1rem', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                           <button onClick={() => { setAttChatSelectedStudent(null); setAttChatView('dashboard'); }} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', cursor: 'pointer' }}>
                              <ArrowLeft size={18} />
                           </button>
                           <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                              {attChatSelectedStudent.tenhv?.charAt(0)}
                           </div>
                           <div style={{ flex: 1 }}>
                              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>{attChatSelectedStudent.tenhv}</h4>
                              <div style={{ fontSize: '0.7rem', color: '#22c55e', fontWeight: 600 }}>Phụ huynh đang trực tuyến</div>
                           </div>
                           <button style={{ padding: '8px', background: '#f1f5f9', border: 'none', borderRadius: '8px', color: '#64748b' }}>
                              <Phone size={18} />
                           </button>
                        </div>

                        <div ref={attScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                           {attChatLoading ? (
                              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><Loader2 size={24} className="spinner" /></div>
                           ) : attChatMessages.length === 0 ? (
                              <div style={{ textAlign: 'center', margin: 'auto', color: '#94a3b8', fontSize: '0.85rem' }}>Bắt đầu trò chuyện với phụ huynh của {attChatSelectedStudent.tenhv}</div>
                           ) : (
                              attChatMessages.filter(m => !m.content?.includes('📬 [HÒM THƯ GÓP Ý - GỬI HIỆU TRƯỞNG]')).map((m, idx) => {
                                 const isMe = m.manv === (attendanceUser.manv || attendanceUser.username) && m.description !== 'PH';
                                 const senderName = getTeacherChatSenderName(m);
                                 return (
                                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '85%', alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                                       <div style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: '4px', padding: '0 4px', fontWeight: 700 }}>
                                          {senderName}
                                       </div>
                                       {m.content && (
                                          <div style={{
                                             padding: '8px 12px', borderRadius: isMe ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                                             background: isMe ? '#ec4899' : 'white', color: isMe ? 'white' : '#1e293b',
                                             boxShadow: '0 1px 2px rgba(0,0,0,0.05)', fontSize: '0.9rem', lineHeight: 1.4
                                          }}>
                                             <ChatMessageContent content={m.content} isOwnMessage={isMe} />
                                          </div>
                                       )}
                                       {m.image_url && (
                                          <div style={{ marginTop: '4px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                             <img src={m.image_url} alt="chat" style={{ maxWidth: '100%', maxHeight: '250px', display: 'block' }} />
                                          </div>
                                       )}
                                       {m.file_url && <ChatMediaAttachment fileUrl={m.file_url} fileName={m.file_name} mimeType={m.file_mime_type} isOwnMessage={isMe} />}
                                       <span style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '2px' }}>
                                          {new Date(m.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                       </span>
                                    </div>
                                 );
                              })
                           )}
                        </div>

                        <div style={{ padding: '0.75rem 1rem', background: 'white', borderTop: '1px solid #e2e8f0' }}>
                           <form onSubmit={handleAttSendChat} style={{ display: 'flex', alignItems: 'center', gap: isMobileChatView ? '6px' : '8px', width: '100%' }}>
                              <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                                 <label style={{ cursor: 'pointer', padding: '6px', color: '#64748b', flexShrink: 0 }}>
                                    <Image size={20} />
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleAttFileUpload(e, 'image')} disabled={uploading} />
                                 </label>
                                 <label style={{ cursor: 'pointer', padding: '6px', color: '#64748b', flexShrink: 0 }}>
                                    <Paperclip size={20} />
                                    <input type="file" style={{ display: 'none' }} onChange={(e) => handleAttFileUpload(e, 'file')} disabled={uploading} />
                                 </label>
                              </div>
                              <input type="text" placeholder="Nhập tin nhắn..." value={attChatInput} onChange={(e) => setAttChatInput(e.target.value)} style={{ flex: 1, minWidth: 0, width: 0, padding: '0.6rem 1rem', background: '#f1f5f9', border: 'none', borderRadius: '20px', fontSize: '16px', outline: 'none' }} />
                              <button type="submit" disabled={!attChatInput.trim() && !uploading} style={{ width: '36px', height: '36px', minWidth: '36px', flexShrink: 0, borderRadius: '50%', background: '#ec4899', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: (!attChatInput.trim() && !uploading) ? 0.5 : 1 }}>
                                 {uploading ? <Loader2 size={18} className="spinner" /> : <Send size={18} />}
                              </button>
                           </form>
                        </div>
                     </div>
                  </div>
               )}
            </div>
         )}

         {isClassBroadcastOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
               <div style={{ width: '100%', maxWidth: '520px', background: 'white', borderRadius: '20px', boxShadow: '0 25px 50px rgba(15, 23, 42, 0.25)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
                     <div>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{'G\u1eedi th\u00f4ng b\u00e1o c\u1ea3 l\u1edbp'}</h3>
                        <div style={{ marginTop: '0.25rem', fontSize: '0.82rem', color: '#64748b' }}>
                           {'L\u1edbp'} {getClassDisplayName(classBroadcastClassId)} {'\u2022'} {attAllStudents.filter(student => student?.mahv && student.malop === classBroadcastClassId).length} {'h\u1ecdc sinh'}
                        </div>
                     </div>
                     <button type="button" onClick={closeClassBroadcastModal} style={{ width: '34px', height: '34px', borderRadius: '50%', border: 'none', background: '#f1f5f9', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <X size={18} />
                     </button>
                  </div>

                  <form onSubmit={handleBroadcastToClass} style={{ padding: '1.25rem', display: 'grid', gap: '1rem' }}>
                     <select
                        value={classBroadcastClassId}
                        onChange={(e) => setClassBroadcastClassId(e.target.value)}
                        style={{ width: '100%', padding: '0.9rem 1rem', borderRadius: '14px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.95rem', background: 'white' }}
                     >
                        {getBroadcastClassOptions().map((cls) => (
                           <option key={cls.malop} value={cls.malop}>
                              {cls.label}
                           </option>
                        ))}
                     </select>

                     <textarea
                        value={classBroadcastText}
                        onChange={(e) => setClassBroadcastText(e.target.value)}
                        placeholder={'Nh\u1eadp n\u1ed9i dung th\u00f4ng b\u00e1o cho c\u1ea3 l\u1edbp...'}
                        rows={5}
                        style={{ width: '100%', resize: 'vertical', minHeight: '130px', padding: '0.9rem 1rem', borderRadius: '16px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.95rem', lineHeight: 1.5, fontFamily: 'inherit' }}
                     />

                     <div style={{ display: 'grid', gap: '0.75rem' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.55rem', padding: '0.85rem 1rem', borderRadius: '14px', border: '1px dashed #f9a8d4', background: '#fdf2f8', color: '#be185d', cursor: 'pointer', fontWeight: 700 }}>
                           <Image size={18} />
                           <span>{'Ch\u1ecdn h\u00ecnh th\u00f4ng b\u00e1o'}</span>
                           <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleClassBroadcastImageChange} disabled={uploading} />
                        </label>

                        {classBroadcastImage && (
                           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.75rem 0.9rem', background: '#fff7ed', borderRadius: '12px', border: '1px solid #fed7aa', color: '#9a3412' }}>
                              <div style={{ minWidth: 0 }}>
                                 <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{'H\u00ecnh \u0111\u00e3 ch\u1ecdn'}</div>
                                 <div style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{classBroadcastImage.name}</div>
                              </div>
                              <button type="button" onClick={() => setClassBroadcastImage(null)} style={{ border: 'none', background: 'transparent', color: '#9a3412', cursor: 'pointer', fontWeight: 700 }}>
                                 {'B\u1ecf'}
                              </button>
                           </div>
                        )}
                     </div>

                     <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                        <button type="button" onClick={closeClassBroadcastModal} disabled={uploading} style={{ padding: '0.8rem 1.1rem', borderRadius: '12px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', cursor: 'pointer', fontWeight: 700 }}>
                           {'H\u1ee7y'}
                        </button>
                        <button
                           type="submit"
                           disabled={uploading || (!classBroadcastText.trim() && !classBroadcastImage)}
                           style={{ padding: '0.8rem 1.15rem', borderRadius: '12px', border: 'none', background: '#ec4899', color: 'white', cursor: 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.55rem', opacity: uploading || (!classBroadcastText.trim() && !classBroadcastImage) ? 0.65 : 1 }}
                        >
                           {uploading ? <Loader2 size={18} className="spinner" /> : <Send size={18} />}
                           <span>{'G\u1eedi t\u1edbi c\u1ea3 l\u1edbp'}</span>
                        </button>
                     </div>
                  </form>
               </div>
            </div>
         )}
      </div>
   );
}

export default TeacherPortal;
