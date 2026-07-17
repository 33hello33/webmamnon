import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useConfig } from '../ConfigContext';
import { uploadToR2 } from '../utils/cloudflareR2';
import { compressImage } from '../utils/imageUtils';
import { triggerPushNotification } from '../utils/pushNotifications';
import { saveImageToDevice } from '../utils/mobileImageSave';
import FileDropZone from './FileDropZone';
import ChatMessageContent from './ChatMessageContent';
import ChatMediaAttachment from './ChatMediaAttachment';
import { Loader2, Key, X, LogOut, Image, FileText, CalendarCheck, Paperclip, Send, ArrowLeft, Phone, Search, MessageSquare, Heart, Bell, Download } from 'lucide-react';
import { mergeFileLists, splitFilesByKind, toFileArray, uploadManagedFile } from '../utils/managedUploads';
import { buildGroupedMessageDescription, createMessageGroupId, groupAnnouncementsForDisplay, groupMessagesForDisplay } from '../utils/chatMessageGrouping';
import { getActiveNgoaiKhoaAnnouncements } from '../utils/ngoaiKhoaUtils';
import { fetchHolidayDates, isHoliday } from '../utils/holidays';

const resizeChatTextarea = (textarea, maxLines = 3) => {
   if (!textarea) return;

   textarea.style.height = 'auto';

   const computedStyle = window.getComputedStyle(textarea);
   const lineHeight = parseFloat(computedStyle.lineHeight) || 16;
   const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
   const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
   const borderTop = parseFloat(computedStyle.borderTopWidth) || 0;
   const borderBottom = parseFloat(computedStyle.borderBottomWidth) || 0;
   const maxHeight = Math.ceil((lineHeight * maxLines) + paddingTop + paddingBottom + borderTop + borderBottom);

   textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
   textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
};

const formatMessageTimestamp = (dateValue) => {
   if (!dateValue) return '--:--';
   const messageDate = new Date(dateValue);
   if (Number.isNaN(messageDate.getTime())) return '--:--';

   const now = new Date();
   const isSameDay =
      messageDate.getFullYear() === now.getFullYear() &&
      messageDate.getMonth() === now.getMonth() &&
      messageDate.getDate() === now.getDate();

   if (isSameDay) {
      return messageDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
   }

   const isSameYear = messageDate.getFullYear() === now.getFullYear();
   const dateText = isSameYear
      ? messageDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
      : messageDate.toLocaleDateString('vi-VN');

   return `${dateText} ${messageDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
};

const tuitionTransferProofCategory = 'Ảnh chuyển khoản học phí';
const TEACHER_CHAT_PAGE_SIZE = 10;

function TeacherPortal({ attendanceUser, initialClasses, initialAllStudents, onLogout }) {
   const { config } = useConfig();
   const [loading, setLoading] = useState(false);
   const [previewImage, setPreviewImage] = useState(null);
   const isBoMonTeacher = attendanceUser?.role === 'Giáo viên BM';

   const handleSavePreviewImage = async (imageUrl, filename = `anh-${Date.now()}.jpg`) => {
      if (!imageUrl) return;
      try {
         await saveImageToDevice(imageUrl, filename);
      } catch (error) {
         console.error('Không thể lưu ảnh:', error);
         window.open(imageUrl, '_blank', 'noopener,noreferrer');
      }
   };

   const normalizeAnnouncementTitle = (title) => String(title || '').trim().toUpperCase();

   const getDateLimit = () => {
      const dateLimit = new Date();
      dateLimit.setHours(0, 0, 0, 0);
      if (attDateFilter === 'Tuần này') dateLimit.setDate(dateLimit.getDate() - 6);
      else if (attDateFilter === 'Tháng này') dateLimit.setDate(1);
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

   const getMessageIdentity = (message) => (
      message?.id ?? `${message?.mahv || 'unknown'}-${message?.created_at || 'na'}-${message?.manv || 'na'}-${message?.content || ''}-${message?.file_url || ''}-${message?.image_url || ''}`
   );

   const sortMessagesByCreatedAt = (messages = [], ascending = true) => (
      [...messages].sort((a, b) => {
         const timeA = new Date(a?.created_at || 0).getTime();
         const timeB = new Date(b?.created_at || 0).getTime();
         return ascending ? timeA - timeB : timeB - timeA;
      })
   );

   const dedupeMessages = (messages = []) => {
      const uniqueMessages = new Map();
      messages.forEach((message) => {
         if (!message) return;
         uniqueMessages.set(getMessageIdentity(message), message);
      });
      return Array.from(uniqueMessages.values());
   };

   const mergeTeacherSummaryMessages = (currentMessages = [], incomingMessages = []) => {
      const allMessages = dedupeMessages([...currentMessages, ...incomingMessages]);
      const messagesByStudent = new Map();

      allMessages.forEach((message) => {
         if (!message?.mahv) return;
         if (!messagesByStudent.has(message.mahv)) messagesByStudent.set(message.mahv, []);
         messagesByStudent.get(message.mahv).push(message);
      });

      return Array.from(messagesByStudent.values()).flatMap((studentMessages) => (
         sortMessagesByCreatedAt(studentMessages, false).slice(0, TEACHER_CHAT_PAGE_SIZE)
      ));
   };

   const buildTeacherReports = (messages = []) => {
      const dateLimit = getDateLimit();
      const reportStudents = {
         xinNghi: new Set(),
         baoThuoc: new Set(),
         guiTinNhan: new Set(),
         doiNguoi: new Set(),
         veTre: new Set()
      };

      messages.forEach((message) => {
         if (new Date(message.created_at) < dateLimit) return;
         const content = message.content?.toUpperCase() || '';
         const isPH = message.description === 'PH' || (!message.manv);
         if (!isPH) return;

         if (content.includes('XIN NGHỈ') || content.includes('XIN NGHI')) reportStudents.xinNghi.add(message.mahv);
         else if (content.includes('DẶN THUỐC') || content.includes('DAN THUOC')) reportStudents.baoThuoc.add(message.mahv);
         else if (content.includes('ĐỔI NGƯỜI') || content.includes('DOI NGUOI')) reportStudents.doiNguoi.add(message.mahv);
         else if (content.includes('VỀ TRỄ') || content.includes('VE TRE')) reportStudents.veTre.add(message.mahv);
         else reportStudents.guiTinNhan.add(message.mahv);
      });

      return {
         xinNghi: reportStudents.xinNghi.size,
         baoThuoc: reportStudents.baoThuoc.size,
         guiTinNhan: reportStudents.guiTinNhan.size,
         doiNguoi: reportStudents.doiNguoi.size,
         veTre: reportStudents.veTre.size
      };
   };

   const mergeTeacherThreadMessages = (currentMessages = [], incomingMessages = []) => (
      sortMessagesByCreatedAt(dedupeMessages([...currentMessages, ...incomingMessages]), true)
   );

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

   const teacherIdentitySet = new Set(
      [attendanceUser?.manv, attendanceUser?.username, attendanceUser?.tennv, attendanceUser?.id]
         .map(value => String(value || '').trim())
         .filter(Boolean)
   );

   const teacherAssignmentFields = [
      'manv',
      ...Array.from({ length: Math.max(0, parseInt(config?.sonhanvientrogiang || '0', 10) || 0) }, (_, index) => `manv${index + 1}`),
      'manv4'
   ];

   const classBelongsToTeacher = (cls) => {
      if (!cls || teacherIdentitySet.size === 0) return false;
      return teacherAssignmentFields.some((field) => {
         const fieldValue = String(cls[field] || '').trim();
         return fieldValue !== '' && teacherIdentitySet.has(fieldValue);
      });
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

   // Auto-re-register push subscription silently when teacher logs in (only if already granted)
   useEffect(() => {
      const staffId = attendanceUser?.manv || attendanceUser?.username;
      if (!staffId) return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      if (Notification.permission !== 'granted') return;

      const refreshSubscription = async () => {
         try {
            const registration = await navigator.serviceWorker.ready;
            const existingSubscription = await registration.pushManager.getSubscription();
            if (!existingSubscription) return; // No subscription yet — user must click the Bell button

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

            const subscription = existingSubscription || await registration.pushManager.subscribe({
               userVisibleOnly: true,
               applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
            });

            const teacherIds = [...new Set([
               attendanceUser.manv,
               attendanceUser.username,
               attendanceUser.tennv
            ].map(v => String(v || '').trim()).filter(Boolean))];

            const payloads = teacherIds.map((id) => ({
               user_id: id,
               role: 'teacher',
               subscription,
               updated_at: new Date().toISOString()
            }));

            const { error: dbError } = await supabase
               .from('push_subscriptions')
               .upsert(payloads, { onConflict: 'user_id' });

            if (dbError) console.error('Lỗi khi làm mới subscription giáo viên:', dbError);
         } catch (err) {
            console.error('Lỗi khi tự động làm mới subscription giáo viên:', err);
         }
      };

      refreshSubscription();
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [attendanceUser?.manv, attendanceUser?.username]);

   // ----- Attendance Features -----
   const [attDate, setAttDate] = useState(() => {
      const d = new Date();
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().split('T')[0];
   });
   const [attHolidayDates, setAttHolidayDates] = useState([]);
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
   const [attTab, setAttTab] = useState('menu'); // 'menu' | 'attendance' | 'chat' | 'health' | 'notices' | 'curriculum'
   const [attChatSelectedStudent, setAttChatSelectedStudent] = useState(null);
   const [attUnreadCounts, setAttUnreadCounts] = useState({});
   const [attLatestMessages, setAttLatestMessages] = useState([]);
   const [attChatMessages, setAttChatMessages] = useState([]);
   const [attChatLoading, setAttChatLoading] = useState(false);
   const [attChatLoadingMore, setAttChatLoadingMore] = useState(false);
   const [attChatHasMore, setAttChatHasMore] = useState(false);
   const [attChatInput, setAttChatInput] = useState('');
   const [attChatDocuments, setAttChatDocuments] = useState([]);
   const [attSearchQuery, setAttSearchQuery] = useState('');
   const [attAllStudents, setAttAllStudents] = useState(initialAllStudents || []);
   const attScrollRef = React.useRef();
   const [attChatView, setAttChatView] = useState('dashboard'); // 'dashboard' | 'chat'
   const [attStatFilter, setAttStatFilter] = useState('ALL');
   const [attDateFilter, setAttDateFilter] = useState('Tuần này');
   const [attReports, setAttReports] = useState({ xinNghi: 0, baoThuoc: 0, guiTinNhan: 0, doiNguoi: 0, veTre: 0 });
   const [uploading, setUploading] = useState(false);
   const [isMobileChatView, setIsMobileChatView] = useState(() => window.innerWidth <= 768);
   const [attStaffDirectory, setAttStaffDirectory] = useState({});
   const [isClassBroadcastOpen, setIsClassBroadcastOpen] = useState(false);
   const [classBroadcastMode, setClassBroadcastMode] = useState('notice');
   const [classBroadcastText, setClassBroadcastText] = useState('');
   const [classBroadcastMedia, setClassBroadcastMedia] = useState([]);
   const [classBroadcastClassId, setClassBroadcastClassId] = useState('');
   const [attLatestHealthDate, setAttLatestHealthDate] = useState('');
   const [teacherAnnouncements, setTeacherAnnouncements] = useState([]);
   const [teacherAnnouncementsLoading, setTeacherAnnouncementsLoading] = useState(false);
   const [teacherChatDropActive, setTeacherChatDropActive] = useState(false);
   const mobileChatPanelHeight = '90dvh';
   const attChatInputRef = React.useRef(null);
   const attChatStudentIdRef = React.useRef('');
   // Ref keeps current student list accessible inside stable Realtime callbacks
   // without causing the channel to re-subscribe on every list change.
   const attAllStudentsRef = React.useRef(attAllStudents);

   useEffect(() => {
      resizeChatTextarea(attChatInputRef.current, 3);
   }, [attChatInput]);

   useEffect(() => {
      attChatStudentIdRef.current = attChatSelectedStudent?.mahv || '';
   }, [attChatSelectedStudent]);

   // Keep the ref in sync with state without triggering subscription re-runs
   useEffect(() => {
      attAllStudentsRef.current = attAllStudents;
   }, [attAllStudents]);

   // Service Worker push signal: refresh unreads immediately when a push arrives
   useEffect(() => {
      const handleSwMessage = (event) => {
         if (event.data?.type === 'PUSH_RECEIVED') {
            fetchAttUnreads();
         }
      };
      navigator.serviceWorker?.addEventListener('message', handleSwMessage);
      return () => navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

   // eslint-disable-next-line react-hooks/exhaustive-deps
   useEffect(() => {
      setAttReports(buildTeacherReports(attLatestMessages));
   }, [attLatestMessages, attDateFilter]);

   const syncAppBadge = (count) => {
      const badgeCount = Number.isFinite(count) ? Math.max(0, count) : 0;

      if ('setAppBadge' in navigator) {
         if (badgeCount > 0) navigator.setAppBadge(badgeCount).catch(console.error);
         else if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(console.error);
      }

      // Fallback for browsers/OS that don't support setAppBadge
      document.title = badgeCount > 0 ? `(${badgeCount}) Mầm Non` : 'Mầm Non';

      if ('serviceWorker' in navigator) {
         navigator.serviceWorker.ready.then(registration => {
            if (registration.active) {
               registration.active.postMessage({
                  type: 'SYNC_APP_BADGE',
                  count: badgeCount
               });
            }
         }).catch(console.error);
      }
   };

   const subscribeTeacherPushNotifications = async () => {
      if (!attendanceUser?.manv && !attendanceUser?.username) {
         alert('Chưa xác định được tài khoản giáo viên để bật thông báo.');
         return;
      }
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
         alert('Trình duyệt không hỗ trợ thông báo đẩy (Push Notifications).');
         return;
      }

      // Handle already-denied case without calling requestPermission (avoids long block)
      if (Notification.permission === 'denied') {
         alert('Bạn đã tắt thông báo cho trang này. Để bật lại, hãy vào Cài đặt trình duyệt → Quyền riêng tư → Thông báo và cho phép trang này.');
         return;
      }

      try {
         const permission = await Notification.requestPermission();
         if (permission !== 'granted') {
            alert('Bạn đã từ chối nhận thông báo. Hãy cho phép trong cài đặt trình duyệt để nhận được tin nhắn từ phụ huynh.');
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
         if (existingSubscription) {
            await existingSubscription.unsubscribe();
         }
         
         const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
         });

         const teacherIds = [...new Set([
            attendanceUser.manv,
            attendanceUser.username,
            attendanceUser.tennv
         ].map(value => String(value || '').trim()).filter(Boolean))];

         const payloads = teacherIds.map((teacherId) => ({
            user_id: teacherId,
            role: 'teacher',
            subscription,
            updated_at: new Date().toISOString()
         }));

         const { error: dbError } = await supabase
            .from('push_subscriptions')
            .upsert(payloads, { onConflict: 'user_id' });

         if (dbError) throw dbError;

         alert(existingSubscription ? 'Đã bật thông báo thành công (subscription đã có sẵn).' : 'Đã bật thông báo thành công!');
      } catch (err) {
         console.error('Lỗi khi đăng ký nhận thông báo cho giáo viên:', err);
         alert('Có lỗi xảy ra khi bật thông báo: ' + err.message);
      }
   };

   useEffect(() => {
      let cancelled = false;

      const loadTeacherScope = async () => {
         if (teacherIdentitySet.size === 0) {
            setAttClasses(initialClasses || []);
            setAttAllStudents(initialAllStudents || []);
            return;
         }

         try {
            const { data: allCls, error: classError } = await supabase
               .from('tbl_lop')
               .select('*')
               .or('daxoa.neq."Đã Xóa",daxoa.is.null');

            if (classError) throw classError;

            const teacherClasses = (allCls || []).filter(classBelongsToTeacher);
            if (cancelled) return;

            setAttClasses(teacherClasses);

            const classIds = teacherClasses.map(cls => cls.malop).filter(Boolean);
            if (classIds.length === 0) {
               setAttAllStudents([]);
               return;
            }

            const { data: allSts, error: studentError } = await supabase
               .from('tbl_hv')
               .select('mahv, tenhv, malop, imgpath')
               .in('malop', classIds)
               .or('trangthai.neq."Đã Nghỉ",trangthai.is.null');

            if (studentError) throw studentError;
            if (cancelled) return;

            setAttAllStudents(allSts || []);
         } catch (error) {
            console.error('Error loading teacher classes:', error);
            if (cancelled) return;
            setAttClasses(initialClasses || []);
            setAttAllStudents(initialAllStudents || []);
         }
      };

      loadTeacherScope();

      return () => {
         cancelled = true;
      };
   }, [initialClasses, initialAllStudents, attendanceUser?.manv, attendanceUser?.username, attendanceUser?.tennv, attendanceUser?.id, config?.sonhanvientrogiang]);

   useEffect(() => {
      if (attSelectedClass && !attClasses.some(cls => cls.malop === attSelectedClass)) {
         setAttSelectedClass('');
      }
   }, [attSelectedClass, attClasses]);

   useEffect(() => {
      const loadData = async () => {
         if (!attSelectedClass) {
            setAttStudents([]);
            setAttRecords({});
            setLessonContent('');
            setAttLatestHealthDate('');
            return;
         }

         // Lấy danh sách học sinh từ bảng tbl_hv
         const { data: stFound, error: stError } = await supabase
            .from('tbl_hv')
            .select('mahv, tenhv, trangthai, tinhtrangsk')
            .eq('malop', attSelectedClass);
         if (stError) console.error('Error fetching students:', stError);

         // Lọc bỏ học sinh đã nghỉ ở phía client để tránh lỗi cú pháp truy vấn
         const studentsFound = (stFound || []).filter(s => s.trangthai !== 'Đã Nghỉ');

         // Lấy thông tin sức khỏe mới nhất từ suckhoedinhky
         if (studentsFound.length > 0) {
            const stIds = studentsFound.map(s => s.mahv);
            const { data: healthData } = await supabase.from('suckhoedinhky').select('*').in('mahv', stIds).order('ngay', { ascending: false });
            if (healthData) {
               setAttLatestHealthDate(healthData[0]?.ngay || '');
               studentsFound.forEach(s => {
                  const latest = healthData.find(h => h.mahv === s.mahv);
                  if (latest) {
                     s.chieucao = latest.chieucao;
                     s.cannang = latest.cannang;
                  }
               });
            } else {
               setAttLatestHealthDate('');
            }
         } else {
            setAttLatestHealthDate('');
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

         // Tải nội dung dạy
         const { data: nd } = await supabase.from('tbl_noidungday').select('noidungday').eq('malop', attSelectedClass).eq('ngay', attDate).maybeSingle();
         setLessonContent(nd ? nd.noidungday : '');
      };
      if (attendanceUser) loadData();
   }, [attSelectedClass, attDate, attendanceUser]);

   useEffect(() => {
      const loadHolidayDates = async () => {
         const year = parseInt(String(attDate || '').slice(0, 4), 10) || new Date().getFullYear();
         const dates = await fetchHolidayDates(year);
         setAttHolidayDates(dates);
      };

      loadHolidayDates();
   }, [attDate]);

   const isAttendanceHoliday = isHoliday(attDate, attHolidayDates);

   const handleUpdateRecord = (mahv, field, value) => {
      setAttRecords(prev => ({ ...prev, [mahv]: { ...(prev[mahv] || {}), [field]: value } }));
   };

   const handleSaveAttendance = async () => {
      if (!attSelectedClass) return window.alert('Chưa chọn lớp!');
      if (isAttendanceHoliday) return window.alert('Ngày này là ngày nghỉ, không thể điểm danh.');
      setLoading(true);
      try {
         const existingAttendanceMap = new Map();
         const studentIds = attStudents.map(st => st.mahv).filter(Boolean);

         if (studentIds.length > 0) {
            const { data: existingRecords, error: existingError } = await supabase
               .from('tbl_diemdanh')
               .select('id, mahv, malop, ngay')
               .eq('malop', attSelectedClass)
               .eq('ngay', attDate)
               .in('mahv', studentIds)
               .order('id', { ascending: true });

            if (existingError) throw existingError;

            (existingRecords || []).forEach((record) => {
               const key = `${record.mahv}__${record.malop}__${record.ngay}`;
               if (!existingAttendanceMap.has(key)) {
                  existingAttendanceMap.set(key, record.id);
               }
            });
         }

         for (const st of attStudents) {
            const rec = attRecords[st.mahv];
            if (!rec || !rec.trangthai) continue;
            const payload = {
               mahv: st.mahv, malop: attSelectedClass, ngay: attDate,
               trangthai: rec.trangthai, ghichu: rec.ghichu || '',
               manv: attendanceUser.manv || attendanceUser.username
            };
            const recordKey = `${st.mahv}__${attSelectedClass}__${attDate}`;
            const existingId = rec.id || existingAttendanceMap.get(recordKey);

            if (existingId) {
               await supabase.from('tbl_diemdanh').update(payload).eq('id', existingId);
            } else {
               const { data: insertedRecords, error: insertError } = await supabase
                  .from('tbl_diemdanh')
                  .insert([payload])
                  .select('id, mahv, malop, ngay');

               if (insertError) throw insertError;

               const insertedRecord = insertedRecords?.[0];
               if (insertedRecord?.id) {
                  existingAttendanceMap.set(recordKey, insertedRecord.id);
               }
            }
         }

         setAttRecords(prev => {
            const next = { ...prev };
            attStudents.forEach((st) => {
               const recordKey = `${st.mahv}__${attSelectedClass}__${attDate}`;
               const existingId = existingAttendanceMap.get(recordKey);
               if (existingId && next[st.mahv]) {
                  next[st.mahv] = { ...next[st.mahv], id: existingId };
               }
            });
            return next;
         });

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
         setAttLatestHealthDate(today);
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

   const markTeacherThreadAsRead = async (studentId) => {
      if (!studentId) return;

      setAttUnreadCounts(prev => {
         if (!prev[studentId]) return prev;
         const next = { ...prev };
         delete next[studentId];
         return next;
      });

      await supabase
         .from('hv_messages')
         .update({ is_read: true })
         .eq('mahv', studentId)
         .is('is_read', false);

      fetchAttUnreads();
   };

   const openTeacherChatThread = async (student) => {
      if (!student?.mahv) return;

      setAttChatSelectedStudent(student);
      setAttChatView('chat');
      await markTeacherThreadAsRead(student.mahv);
   };

   const fetchAttSummaries = async () => {
      if (!attendanceUser) return;
      if (attAllStudents.length === 0) {
         setAttLatestMessages([]);
         return;
      }

      const studentIds = [...new Set(attAllStudents.map(student => student?.mahv).filter(Boolean))];
      if (studentIds.length === 0) {
         setAttLatestMessages([]);
         return;
      }

      const { data, error } = await supabase
         .from('tbl_hv')
         .select('mahv, hv_messages(id, mahv, manv, content, description, created_at, image_url, file_url, file_name, file_mime_type)')
         .in('mahv', studentIds)
         .limit(TEACHER_CHAT_PAGE_SIZE, { foreignTable: 'hv_messages' })
         .order('created_at', { foreignTable: 'hv_messages', ascending: false });

      if (error) {
         console.error('Error fetching teacher chat summaries:', error);
         return;
      }

      if (data) {
         const summaryMessages = data.flatMap((student) => student.hv_messages || []);
         setAttLatestMessages(mergeTeacherSummaryMessages([], summaryMessages));
      }
   };

   const refreshTeacherSummaryForStudent = async (studentId) => {
      if (!studentId) return;

      const { data, error } = await supabase
         .from('hv_messages')
         .select('id, mahv, manv, content, description, created_at, image_url, file_url, file_name, file_mime_type')
         .eq('mahv', studentId)
         .order('created_at', { ascending: false })
         .limit(TEACHER_CHAT_PAGE_SIZE);

      if (error) {
         console.error('Error refreshing teacher summary for student:', error);
         return;
      }

      setAttLatestMessages((prev) => {
         const otherMessages = prev.filter((message) => message.mahv !== studentId);
         return mergeTeacherSummaryMessages(otherMessages, data || []);
      });
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

   const isHiddenSystemChatMessage = (message) => {
      const content = String(message?.content || '').trim();
      return content.startsWith('Gửi phụ huynh Thông báo học phí ') || content.startsWith('Gửi phụ huynh Hóa đơn học phí ');
   };

   const fetchTeacherAnnouncements = async (type) => {
      if (!type) {
         setTeacherAnnouncements([]);
         return;
      }

      const classIds = (attClasses || []).map(cls => cls.malop).filter(Boolean);
      if (classIds.length === 0) {
         setTeacherAnnouncements([]);
         return;
      }

      setTeacherAnnouncementsLoading(true);
      try {
         const dateLimit = getDateLimit();
         let query = supabase
            .from('class_announcements')
            .select('*')
            .in('malop', classIds);

         if (type === 'ngoaikhoa') {
            query = query.eq('title', 'NGOẠI KHÓA');
         } else if (type === 'curriculum') {
            query = query.eq('title', 'CHƯƠNG TRÌNH HỌC');
         }

         if (type !== 'ngoaikhoa') {
            query = query.gte('created_at', dateLimit.toISOString());
         }

         query = query.order('created_at', { ascending: false })
            .limit(200);

         if (type !== 'curriculum') {
            query = query.eq('approved', true);
         }

         const { data, error } = await query;
         if (error) throw error;

         let filteredData = (data || []).filter((item) => {
            const title = normalizeAnnouncementTitle(item?.title);
            if (type === 'curriculum') return title === 'CHƯƠNG TRÌNH HỌC';
            if (type === 'ngoaikhoa') return title === 'NGOẠI KHÓA';
            if (type === 'notices') return title !== 'THỰC ĐƠN' && title !== 'NGOẠI KHÓA' && title !== 'CHƯƠNG TRÌNH HỌC';
            return true;
         });

         if (type === 'ngoaikhoa') {
            filteredData = filteredData.filter(item => !String(item?.content || '').startsWith('__NGOAI_KHOA_CLOSED__::'));
         }

         setTeacherAnnouncements(filteredData.slice(0, 50));
      } catch (error) {
         console.error('Error fetching teacher announcements:', error);
         setTeacherAnnouncements([]);
      } finally {
         setTeacherAnnouncementsLoading(false);
      }
   };

   // eslint-disable-next-line react-hooks/exhaustive-deps
   useEffect(() => {
      const fetchAllStudentsData = async () => {
         if (attendanceUser && attTab === 'chat' && attClasses.length > 0 && attAllStudents.length === 0) {
            const classIds = attClasses.map(c => c.malop).filter(Boolean);
            if (classIds.length > 0) {
               const { data: allSts } = await supabase
                  .from('tbl_hv')
                  .select('mahv, tenhv, malop, imgpath')
                  .in('malop', classIds)
                  .or('trangthai.neq."Đã Nghỉ",trangthai.is.null');
               if (allSts) setAttAllStudents(allSts);
            }
         }
      };
      fetchAllStudentsData();
      if (attendanceUser) {
         fetchAttUnreads();
         // No polling — Realtime subscription in the stable channel handles live updates
         if (attTab === 'chat') {
            fetchAttSummaries();
         }
      }
   }, [attendanceUser, attTab, attDateFilter, attAllStudents, attClasses]);

   // ── Stable global monitor — keyed only on teacher identity ─────────────────
   // Uses attAllStudentsRef so it NEVER needs to re-subscribe when the student
   // list loads or changes. Badge updates are event-driven, not polled.
   // eslint-disable-next-line react-hooks/exhaustive-deps
   useEffect(() => {
      if (!attendanceUser) return;
      const teacherId = attendanceUser.manv || attendanceUser.username || 'unknown';

      fetchAttUnreads();
      fetchAttSummaries();

      const channel = supabase.channel(`teacher_chat_monitor_${teacherId}`)
         .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hv_messages' }, (payload) => {
            const currentStudents = attAllStudentsRef.current;
            const isPH = payload.new.description === 'PH' || (!payload.new.manv);
            const belongsToTeacher = currentStudents.some(s => s.mahv === payload.new.mahv);

            if (isPH && belongsToTeacher) {
               if (Notification.permission === 'granted') {
                  if ('serviceWorker' in navigator) {
                     navigator.serviceWorker.ready.then(registration => {
                        registration.showNotification('Tin nhắn mới từ phụ huynh', { body: payload.new.content || 'Bạn có một tệp đính kèm mới', icon: '/appleicon.png' });
                     }).catch(() => {
                        new Notification('Tin nhắn mới từ phụ huynh', { body: payload.new.content || 'Bạn có một tệp đính kèm mới', icon: '/appleicon.png' });
                     });
                  } else {
                     new Notification('Tin nhắn mới từ phụ huynh', { body: payload.new.content || 'Bạn có một tệp đính kèm mới', icon: '/appleicon.png' });
                  }
               }
            }

            if (belongsToTeacher) {
               setAttLatestMessages((prev) => mergeTeacherSummaryMessages(prev, [payload.new]));
            }
            fetchAttUnreads();
         })
         .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hv_messages' }, (payload) => {
            if (attAllStudentsRef.current.some(s => s.mahv === payload.new.mahv)) {
               setAttLatestMessages((prev) => mergeTeacherSummaryMessages(prev.filter((message) => message.id !== payload.new.id), [payload.new]));
            }
            fetchAttUnreads();
         })
         .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'hv_messages' }, (payload) => {
            const studentId = payload.old?.mahv;
            const deletedId = payload.old?.id;
            if (studentId && attAllStudentsRef.current.some(s => s.mahv === studentId)) {
               setAttLatestMessages((prev) => prev.filter((message) => message.id !== deletedId));
               refreshTeacherSummaryForStudent(studentId);
            }
            fetchAttUnreads();
         })
         .subscribe();

      return () => {
         supabase.removeChannel(channel);
      };
   // Keyed only on teacher identity — NOT attAllStudents
   }, [attendanceUser?.manv, attendanceUser?.username]);

   const scrollTeacherChatToBottom = () => {
      setTimeout(() => {
         if (attScrollRef.current) attScrollRef.current.scrollTop = attScrollRef.current.scrollHeight;
      }, 100);
   };

   const loadOlderTeacherChatMessages = async () => {
      if (!attChatSelectedStudent?.mahv || !attChatHasMore || attChatLoadingMore || attChatLoading || attChatMessages.length === 0) return;

      const studentId = attChatSelectedStudent.mahv;
      const oldestCreatedAt = attChatMessages[0]?.created_at;
      if (!oldestCreatedAt) return;

      const scrollContainer = attScrollRef.current;
      const previousScrollTop = scrollContainer?.scrollTop || 0;
      const previousScrollHeight = scrollContainer?.scrollHeight || 0;

      setAttChatLoadingMore(true);
      try {
         const { data, error } = await supabase
            .from('hv_messages')
            .select('*')
            .eq('mahv', studentId)
            .lt('created_at', oldestCreatedAt)
            .order('created_at', { ascending: false })
            .limit(TEACHER_CHAT_PAGE_SIZE);

         if (error) throw error;
         if (attChatStudentIdRef.current !== studentId) return;

         const olderMessages = sortMessagesByCreatedAt(data || [], true);
         setAttChatHasMore((data || []).length === TEACHER_CHAT_PAGE_SIZE);

         if (olderMessages.length > 0) {
            setAttChatMessages((prev) => mergeTeacherThreadMessages(olderMessages, prev));
            setTimeout(() => {
               if (!attScrollRef.current) return;
               const nextScrollHeight = attScrollRef.current.scrollHeight;
               attScrollRef.current.scrollTop = nextScrollHeight - previousScrollHeight + previousScrollTop;
            }, 0);
         }
      } catch (error) {
         console.error('Error loading older teacher chat messages:', error);
      } finally {
         if (attChatStudentIdRef.current === studentId) {
            setAttChatLoadingMore(false);
         }
      }
   };

   const handleAttChatScroll = () => {
      if (!attScrollRef.current || attChatLoading || attChatLoadingMore || !attChatHasMore) return;
      if (attScrollRef.current.scrollTop <= 80) {
         loadOlderTeacherChatMessages();
      }
   };

   // eslint-disable-next-line react-hooks/exhaustive-deps
   useEffect(() => {
      if (attTab === 'chat' && attChatSelectedStudent) {
         let isActive = true;
         const markAsRead = async () => {
            await markTeacherThreadAsRead(attChatSelectedStudent.mahv);
         };
         markAsRead();

         const fetchMessages = async () => {
            setAttChatLoading(true);
            setAttChatLoadingMore(false);
            setAttChatHasMore(false);
            const studentId = attChatSelectedStudent.mahv;
            const { data, error } = await supabase
               .from('hv_messages')
               .select('*')
               .eq('mahv', studentId)
               .order('created_at', { ascending: false })
               .limit(TEACHER_CHAT_PAGE_SIZE);

            if (!isActive || attChatStudentIdRef.current !== studentId) return;

            if (error) {
               console.error('Error fetching teacher chat messages:', error);
               setAttChatMessages([]);
            } else {
               const nextMessages = sortMessagesByCreatedAt(data || [], true);
               setAttChatMessages(nextMessages);
               setAttChatHasMore((data || []).length === TEACHER_CHAT_PAGE_SIZE);
            }
            setAttChatLoading(false);
            scrollTeacherChatToBottom();
         };

         const fetchDocs = async () => {
            const { data } = await supabase.from('documents').select('*').eq('mahv', attChatSelectedStudent.mahv).order('created_at', { ascending: false });
            if (isActive && data) setAttChatDocuments(data.filter(doc => doc.category !== tuitionTransferProofCategory));
         };

         fetchMessages();
         fetchDocs();

         const threadChannel = supabase.channel(`att_thread_${attChatSelectedStudent.mahv}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hv_messages', filter: `mahv=eq.${attChatSelectedStudent.mahv}` }, (payload) => {
               setAttChatMessages(prev => {
                  if (prev.some(m => m.id === payload.new.id)) return prev;
                  return mergeTeacherThreadMessages(prev, [payload.new]);
               });
               const isParentMessage = payload.new.description === 'PH' || (!payload.new.manv);
               if (isParentMessage && !payload.new.is_read) {
                  markTeacherThreadAsRead(attChatSelectedStudent.mahv);
               }
               scrollTeacherChatToBottom();
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hv_messages', filter: `mahv=eq.${attChatSelectedStudent.mahv}` }, (payload) => {
               setAttChatMessages(prev => mergeTeacherThreadMessages(prev.filter(m => m.id !== payload.new.id), [payload.new]));
            }).subscribe();

         return () => {
            isActive = false;
            supabase.removeChannel(threadChannel);
         };
      }
   }, [attTab, attChatSelectedStudent]);

   useEffect(() => {
      if (attTab === 'notices') {
         fetchTeacherAnnouncements('notices');
      } else if (attTab === 'curriculum') {
         fetchTeacherAnnouncements('curriculum');
      } else if (attTab === 'ngoaikhoa') {
         fetchTeacherAnnouncements('ngoaikhoa');
      } else {
         setTeacherAnnouncements([]);
      }
   }, [attTab, attClasses, attDateFilter]);

   const mergeBroadcastFiles = (incomingFiles) => {
      setClassBroadcastMedia((prev) => mergeFileLists(prev, toFileArray(incomingFiles)));
   };

   const handleTeacherChatAttachmentUpload = async (selectedFiles, forcedType = null) => {
      const files = toFileArray(selectedFiles);
      if (!files.length || !attChatSelectedStudent || !attendanceUser) return;

      setUploading(true);
      try {
         const groupId = files.length > 1 ? createMessageGroupId(`chat-${attChatSelectedStudent.mahv}`) : '';
         const insertedMessages = [];
         const documentPayloads = [];

         for (const file of files) {
            const upload = await uploadManagedFile({
               file,
               config,
               supabase,
               prefix: attChatSelectedStudent.mahv
            });

            const attachmentType = forcedType || (upload.isImage ? 'image' : 'file');
            const msgPayload = {
               mahv: attChatSelectedStudent.mahv,
               manv: attendanceUser.manv || attendanceUser.username,
               content: '',
               image_url: attachmentType === 'image' ? upload.url : null,
               file_url: attachmentType !== 'image' ? upload.url : null,
               file_name: upload.fileName,
               file_mime_type: upload.mimeType,
               description: buildGroupedMessageDescription('', groupId),
               is_read: false
            };

            const { data, error } = await supabase.from('hv_messages').insert([msgPayload]).select();
            if (error) throw error;
            if (data?.[0]) {
               insertedMessages.push(data[0]);
               documentPayloads.push({
                  mahv: attChatSelectedStudent.mahv,
                  name: upload.fileName,
                  category: attachmentType === 'image' ? 'Ảnh' : 'Tài liệu',
                  file_url: upload.url,
                  mime_type: upload.mimeType
               });
            }
         }

         setAttChatMessages(prev => mergeTeacherThreadMessages(prev, insertedMessages));
         for (const message of insertedMessages) {
            await triggerPushNotification(supabase, 'hv_messages', message);
         }

         if (documentPayloads.length > 0) {
            const { data: docData, error: docError } = await supabase.from('documents').insert(documentPayloads).select();
            if (docError) throw docError;
            if (docData?.length) setAttChatDocuments(prev => [...docData, ...prev]);
         }

         setTimeout(() => {
            if (attScrollRef.current) attScrollRef.current.scrollTop = attScrollRef.current.scrollHeight;
         }, 100);
      } catch (err) {
         alert('Lỗi: ' + err.message);
      } finally {
         setUploading(false);
      }
   };

   const handleAttSendChat = async (e) => {
      e.preventDefault();
      if (!attChatInput.trim() || !attChatSelectedStudent || !attendanceUser) return;
      const newMessage = {
         mahv: attChatSelectedStudent.mahv,
         manv: attendanceUser.manv || attendanceUser.username,
         content: attChatInput,
         is_read: false
      };
      const { data, error } = await supabase.from('hv_messages').insert([newMessage]).select();
      if (!error && data) {
         setAttChatMessages(prev => mergeTeacherThreadMessages(prev, [data[0]]));
         await triggerPushNotification(supabase, 'hv_messages', data[0]);
         setAttChatInput('');
         setTimeout(() => { if (attScrollRef.current) attScrollRef.current.scrollTop = attScrollRef.current.scrollHeight; }, 100);
      }
   };

   const toggleAttChatReaction = async (message) => {
      if (!message?.id) return;
      const nextReaction = !Boolean(message.reaction);

      setAttChatMessages(prev => prev.map(m => m.id === message.id ? { ...m, reaction: nextReaction } : m));

      const { data, error } = await supabase
         .from('hv_messages')
         .update({ reaction: nextReaction })
         .eq('id', message.id)
         .select()
         .maybeSingle();

      if (error) {
         console.error('Lỗi cập nhật reaction:', error);
         setAttChatMessages(prev => prev.map(m => m.id === message.id ? { ...m, reaction: Boolean(message.reaction) } : m));
         return;
      }

      if (data) {
         setAttChatMessages(prev => prev.map(m => m.id === message.id ? data : m));
      }
   };

   const handleAttFileUpload = async (e, type) => {
      const files = toFileArray(e.target.files);
      e.target.value = '';
      await handleTeacherChatAttachmentUpload(files, type);
      const legacyUploadFlow = false;
      if (legacyUploadFlow) {
         const inputElement = e.target;
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
               file_mime_type: file.type,
               is_read: false
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
            if (inputElement) inputElement.value = '';
         }
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

   const openClassBroadcastModal = (mode = 'notice') => {
      const classOptions = getBroadcastClassOptions();
      if (classOptions.length === 0) {
         window.alert(mode === 'curriculum' ? 'Không có lớp nào để gửi chương trình học.' : 'Không có lớp nào để gửi thông báo.');
         return;
      }

      setClassBroadcastMode(mode);
      setClassBroadcastClassId(attChatSelectedStudent?.malop || classBroadcastClassId || classOptions[0].malop);
      setIsClassBroadcastOpen(true);
   };

   const closeClassBroadcastModal = () => {
      setIsClassBroadcastOpen(false);
      setClassBroadcastMode('notice');
      setClassBroadcastText('');
      setClassBroadcastMedia([]);
      setClassBroadcastClassId('');
   };

   const handleBroadcastToClass = async (e) => {
      e.preventDefault();
      if (!attendanceUser) return;

      const messageText = classBroadcastText.trim();
      const hasBroadcastMedia = classBroadcastMedia.length > 0;
      if (false && !messageText && !hasBroadcastMedia) {
         window.alert('Vui lòng nhập nội dung hoặc chọn hình để gửi.');
         return;
      }

      if (!messageText && !hasBroadcastMedia) {
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
         const staffId = attendanceUser.manv || attendanceUser.username;
         const isCurriculumBroadcast = classBroadcastMode === 'curriculum';
         const uploadedMedia = [];
         const broadcastGroupId = classBroadcastMedia.length > 1 ? createMessageGroupId('class') : '';
         const broadcastDescription = buildGroupedMessageDescription('THONG_BAO', broadcastGroupId);

         for (const file of classBroadcastMedia) {
            uploadedMedia.push(await uploadManagedFile({
               file,
               config,
               supabase,
               prefix: classBroadcastClassId || 'class'
            }));
         }

         const payloads = (uploadedMedia.length > 0 ? uploadedMedia : [null]).map((attachment) => ({
            malop: classBroadcastClassId,
            manv: staffId,
            title: 'THÔNG BÁO',
            content: messageText,
            image_url: attachment?.isImage ? attachment.url : null,
            file_url: attachment && !attachment.isImage ? attachment.url : null,
            file_name: attachment?.fileName || '',
            file_mime_type: attachment?.mimeType || '',
            approved: !isBoMonTeacher
         }));

         if (isCurriculumBroadcast) {
            payloads.forEach((payload) => {
               payload.title = 'CHƯƠNG TRÌNH HỌC';
               payload.content = messageText || 'Chương trình học';
               payload.approved = false;
            });
         }

         const { data: insertedAnnouncements, error: insertError } = await supabase.from('class_announcements').insert(payloads).select();
         if (insertError) throw insertError;

         for (const announcement of insertedAnnouncements || []) {
            if (announcement?.approved !== false) {
               await triggerPushNotification(supabase, 'class_announcements', announcement);
            }
         }

         if (!isCurriculumBroadcast && !isBoMonTeacher && insertedAnnouncements?.length) {
            const chatPayloads = [];
            const documentPayloads = [];

            classStudents.forEach((student) => {
               insertedAnnouncements.forEach((announcement) => {
                  chatPayloads.push({
                     mahv: student.mahv,
                     manv: staffId,
                     content: announcement.content || '',
                     image_url: announcement.image_url || null,
                     file_url: announcement.file_url || null,
                     file_name: announcement.file_name || '',
                     file_mime_type: announcement.file_mime_type || '',
                     description: broadcastDescription,
                     is_read: false
                  });

                  if (announcement.image_url || announcement.file_url) {
                     documentPayloads.push({
                        mahv: student.mahv,
                        name: announcement.file_name || 'Thong bao lop',
                        category: announcement.image_url ? 'Ảnh' : 'Tài liệu',
                        file_url: announcement.image_url || announcement.file_url,
                        mime_type: announcement.file_mime_type || ''
                     });
                  }
               });
            });

            if (chatPayloads.length > 0) {
               const { data: insertedMessages, error: chatInsertError } = await supabase.from('hv_messages').insert(chatPayloads).select();
               if (chatInsertError) throw chatInsertError;

               for (const message of insertedMessages || []) {
                  await triggerPushNotification(supabase, 'hv_messages', message);
               }
            }

            if (documentPayloads.length > 0) {
               await supabase.from('documents').insert(documentPayloads);
            }
         }

         closeClassBroadcastModal();
         if (isCurriculumBroadcast) {
            window.alert('Đã gửi chương trình học và chờ admin duyệt.');
         }
         setTimeout(() => {
            if (attScrollRef.current) attScrollRef.current.scrollTop = attScrollRef.current.scrollHeight;
         }, 100);
         const legacyUploadFlow = false;
         if (legacyUploadFlow) {

            let uploadedMediaUrl = null;
            let uploadedMediaName = null;
            let uploadedMediaType = null;
            let uploadedMediaIsImage = false;

            if (classBroadcastMedia) {
               let file = classBroadcastMedia;
               const mediaType = String(classBroadcastMedia.type || '').toLowerCase();
               uploadedMediaIsImage = mediaType.startsWith('image/');

               if (uploadedMediaIsImage) {
                  try {
                     file = await compressImage(classBroadcastMedia, 150);
                  } catch (err) { }
               }

               if (config.r2_enabled) {
                  uploadedMediaUrl = await uploadToR2(file, config.r2_endpoint, config.r2_access_key_id, config.r2_secret_access_key, config.r2_bucket_name, config.r2_public_url);
               } else {
                  const fileName = `${classBroadcastClassId || 'class'}_${Date.now()}_${file.name}`;
                  const folder = uploadedMediaIsImage ? 'chat-images' : 'chat-files';
                  const { error } = await supabase.storage.from('assets').upload(`${folder}/${fileName}`, file);
                  if (error) throw error;
                  const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(`${folder}/${fileName}`);
                  uploadedMediaUrl = publicUrl;
               }

               uploadedMediaName = classBroadcastMedia.name;
               uploadedMediaType = classBroadcastMedia.type;
            }

            const staffId = attendanceUser.manv || attendanceUser.username;
            const payloads = [{
               malop: classBroadcastClassId,
               manv: staffId,
               title: 'THÔNG BÁO',
               content: messageText,
               image_url: uploadedMediaIsImage ? uploadedMediaUrl : null,
               file_url: uploadedMediaUrl && !uploadedMediaIsImage ? uploadedMediaUrl : null,
               file_name: uploadedMediaName,
               file_mime_type: uploadedMediaType
            }];

            const { data: insertedAnnouncements, error: insertError } = await supabase.from('class_announcements').insert(payloads).select();
            if (insertError) throw insertError;

            for (const announcement of insertedAnnouncements || []) {
               await triggerPushNotification(supabase, 'class_announcements', announcement);
            }

            if (false && uploadedMediaUrl) {
               const documentPayloads = classStudents.map((student) => ({
                  mahv: student.mahv,
                  name: uploadedMediaName || 'Thong bao lop',
                  category: uploadedMediaIsImage ? 'Ảnh' : 'Tài liệu',
                  file_url: uploadedMediaUrl,
                  mime_type: uploadedMediaType
               }));
               await supabase.from('documents').insert(documentPayloads);
            }

            closeClassBroadcastModal();
            setTimeout(() => {
               if (attScrollRef.current) attScrollRef.current.scrollTop = attScrollRef.current.scrollHeight;
            }, 100);
         }
      } catch (err) {
         window.alert((classBroadcastMode === 'curriculum' ? 'Lỗi khi gửi chương trình học: ' : 'L\u1ed7i khi g\u1eedi th\u00f4ng b\u00e1o c\u1ea3 l\u1edbp: ') + err.message);
      } finally {
         setUploading(false);
      }
   };

   const renderTeacherChatDashboard = () => {
      const filtered = getFilteredChatStudents();
      const dateLimit = getDateLimit();

      return (
         <div className="chat-dashboard" style={{ padding: '0', background: 'transparent', display: 'grid', gap: '18px' }}>
            <div style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)', border: '1px solid #dbeafe', borderRadius: '24px', padding: isMobileChatView ? '16px' : '20px', boxShadow: '0 12px 30px rgba(59, 130, 246, 0.08)' }}>
               <div style={{ display: 'flex', flexDirection: isMobileChatView ? 'column' : 'row', gap: '14px', alignItems: isMobileChatView ? 'stretch' : 'center', justifyContent: 'space-between' }}>
                  <button
                     type="button"
                     onClick={openClassBroadcastModal}
                     title="Gửi thông báo cả lớp"
                     style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '0.9rem 1rem', minWidth: isMobileChatView ? '100%' : '172px', background: '#0f172a', border: 'none', borderRadius: '14px', color: 'white', cursor: 'pointer', fontWeight: 700, boxShadow: '0 10px 24px rgba(15, 23, 42, 0.18)' }}
                  >
                     <Bell size={16} />
                     <span>Gửi cả lớp</span>
                  </button>
               </div>

               <div style={{ display: 'flex', gap: '12px', flexDirection: isMobileChatView ? 'column' : 'row', alignItems: isMobileChatView ? 'stretch' : 'center', marginTop: '16px' }}>
                  <div className="search-input-wrapper" style={{ width: '100%', maxWidth: isMobileChatView ? '100%' : '360px', background: 'white', borderRadius: '14px', border: '1px solid #dbeafe', boxShadow: '0 6px 18px rgba(148, 163, 184, 0.12)' }}>
                     <Search size={18} className="search-icon-inside" />
                     <input type="text" placeholder="Tìm theo tên hoặc mã học sinh..." value={attSearchQuery} onChange={(e) => setAttSearchQuery(e.target.value)} />
                  </div>
                  <div className="date-filters" style={{ flexWrap: 'wrap' }}>
                     {['Hôm nay', 'Tuần này', 'Tháng này'].map(f => (
                        <button key={f} className={`date-filter-btn ${attDateFilter === f ? 'active' : ''}`} onClick={() => setAttDateFilter(f)}>
                           {f}
                        </button>
                     ))}
                  </div>
               </div>
            </div>

            <div className="quick-reports-container" style={{ gridTemplateColumns: isMobileChatView ? 'repeat(3, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))', gap: '8px', marginBottom: '1.2rem' }}>
               <div className="report-card xin-nghi" onClick={() => setAttStatFilter(attStatFilter === 'XIN_NGHI' ? 'ALL' : 'XIN_NGHI')} style={{ padding: '8px 4px', borderRadius: '12px', outline: attStatFilter === 'XIN_NGHI' ? '3px solid #ef4444' : 'none', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.06)' }}>
                  <span className="report-label" style={{ fontSize: '0.62rem', marginBottom: '2px' }}>Xin nghỉ</span>
                  <span className="report-value" style={{ fontSize: '1.1rem' }}>{String(attReports.xinNghi).padStart(2, '0')}</span>
               </div>
               <div className="report-card bao-thuoc" onClick={() => setAttStatFilter(attStatFilter === 'BAO_THUOC' ? 'ALL' : 'BAO_THUOC')} style={{ padding: '8px 4px', borderRadius: '12px', outline: attStatFilter === 'BAO_THUOC' ? '3px solid #854d0e' : 'none', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.06)' }}>
                  <span className="report-label" style={{ fontSize: '0.62rem', marginBottom: '2px' }}>Báo thuốc</span>
                  <span className="report-value" style={{ fontSize: '1.1rem' }}>{String(attReports.baoThuoc).padStart(2, '0')}</span>
               </div>
               <div className="report-card gui-tin-nhan" onClick={() => setAttStatFilter(attStatFilter === 'GUI_TIN_NHAN' ? 'ALL' : 'GUI_TIN_NHAN')} style={{ padding: '8px 4px', borderRadius: '12px', outline: attStatFilter === 'GUI_TIN_NHAN' ? '3px solid #3b82f6' : 'none', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.06)' }}>
                  <span className="report-label" style={{ fontSize: '0.62rem', marginBottom: '2px' }}>Tin nhắn</span>
                  <span className="report-value" style={{ fontSize: '1.1rem' }}>{String(attReports.guiTinNhan).padStart(2, '0')}</span>
               </div>
               <div className="report-card doi-nguoi" onClick={() => setAttStatFilter(attStatFilter === 'DOI_NGUOI' ? 'ALL' : 'DOI_NGUOI')} style={{ padding: '8px 4px', borderRadius: '12px', outline: attStatFilter === 'DOI_NGUOI' ? '3px solid #065f46' : 'none', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.06)' }}>
                  <span className="report-label" style={{ fontSize: '0.62rem', marginBottom: '2px' }}>Đổi người đón</span>
                  <span className="report-value" style={{ fontSize: '1.1rem' }}>{String(attReports.doiNguoi).padStart(2, '0')}</span>
               </div>
               <div className="report-card ve-tre" onClick={() => setAttStatFilter(attStatFilter === 'VE_TRE' ? 'ALL' : 'VE_TRE')} style={{ padding: '8px 4px', borderRadius: '12px', outline: attStatFilter === 'VE_TRE' ? '3px solid #7c3aed' : 'none', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.06)' }}>
                  <span className="report-label" style={{ fontSize: '0.62rem', marginBottom: '2px' }}>Về trễ</span>
                  <span className="report-value" style={{ fontSize: '1.1rem' }}>{String(attReports.veTre).padStart(2, '0')}</span>
               </div>
            </div>

            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '24px', padding: isMobileChatView ? '14px' : '18px', boxShadow: '0 14px 30px rgba(15, 23, 42, 0.06)' }}>
               <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
                  <div>
                     <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Danh sách hội thoại</div>
                     <div style={{ fontSize: '0.82rem', color: '#64748b' }}>{filtered.length} phụ huynh phù hợp bộ lọc hiện tại</div>
                  </div>
               </div>

               {filtered.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2.2rem', color: '#94a3b8', background: '#f8fafc', borderRadius: '18px', border: '1px dashed #cbd5e1' }}>Không có dữ liệu phù hợp</div>
               ) : (
                  <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: isMobileChatView ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                     {filtered.map(st => {
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
                        const typeStyles = type === 'Xin nghỉ'
                           ? { background: '#fee2e2', color: '#b91c1c' }
                           : type === 'Báo thuốc'
                              ? { background: '#fef3c7', color: '#92400e' }
                              : type === 'Đổi người đón'
                                 ? { background: '#dcfce7', color: '#166534' }
                                 : type === 'Về trễ'
                                    ? { background: '#ede9fe', color: '#6d28d9' }
                                    : { background: '#dbeafe', color: '#1d4ed8' };

                        return (
                           <button
                              key={st.mahv}
                              onClick={() => openTeacherChatThread(st)}
                              style={{ textAlign: 'left', border: unread > 0 ? '1px solid #bfdbfe' : '1px solid #e2e8f0', borderRadius: '20px', padding: '1rem', background: unread > 0 ? 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)' : 'white', boxShadow: unread > 0 ? '0 14px 30px rgba(59, 130, 246, 0.08)' : '0 8px 20px rgba(15, 23, 42, 0.05)', cursor: 'pointer' }}
                           >
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                                 <div style={{ width: '48px', height: '48px', flexShrink: 0, borderRadius: '16px', background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1rem' }}>
                                    {st.tenhv?.charAt(0)}
                                 </div>
                                 <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
                                       <div style={{ minWidth: 0 }}>
                                          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.tenhv}</div>
                                          <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>Lớp {getClassDisplayName(st.malop)}</div>
                                       </div>
                                       <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                          <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>{msgToShow ? new Date(msgToShow.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</div>
                                          {unread > 0 && <div style={{ marginTop: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '26px', height: '22px', padding: '0 8px', borderRadius: '999px', background: '#ef4444', color: 'white', fontSize: '0.72rem', fontWeight: 800 }}>+{unread}</div>}
                                       </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                       {type && <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 9px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, ...typeStyles }}>{type}</span>}
                                       <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 9px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}>Mã: {st.mahv}</span>
                                    </div>
                                    <div style={{ fontSize: '0.84rem', color: '#475569', lineHeight: 1.55, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', minHeight: '2.6em' }}>
                                       {getMessagePreview(msgToShow)}
                                    </div>
                                 </div>
                              </div>
                           </button>
                        );
                     })}
                  </div>
               )}
            </div>
         </div>
      );
   };

   const renderTeacherChatThread = () => (
      <div className="teacher-chat-container" style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '100%', height: isMobileChatView ? '100%' : '680px', minHeight: isMobileChatView ? 0 : '680px', maxHeight: isMobileChatView ? '100%' : '680px', background: '#ffffff', borderRadius: isMobileChatView ? '20px' : '24px', overflow: 'hidden', overflowX: 'hidden', border: '1px solid #dbeafe', boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)', touchAction: 'pan-y', overscrollBehaviorX: 'none' }}>
         <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
            <div style={{ padding: isMobileChatView ? '0.85rem 0.8rem' : '1rem 1.1rem', background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 70%)', borderBottom: '1px solid #dbeafe', display: 'flex', alignItems: 'flex-start', gap: isMobileChatView ? '10px' : '12px', width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
               <button onClick={() => { setAttChatSelectedStudent(null); setAttChatView('dashboard'); }} style={{ background: 'white', border: '1px solid #dbeafe', width: isMobileChatView ? '34px' : '36px', height: isMobileChatView ? '34px' : '36px', minWidth: isMobileChatView ? '34px' : '36px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', cursor: 'pointer', boxShadow: '0 8px 16px rgba(59, 130, 246, 0.08)' }}>
                  <ArrowLeft size={18} />
               </button>
               <div style={{ width: isMobileChatView ? '40px' : '44px', height: isMobileChatView ? '40px' : '44px', minWidth: isMobileChatView ? '40px' : '44px', borderRadius: isMobileChatView ? '14px' : '16px', background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                  {attChatSelectedStudent.tenhv?.charAt(0)}
               </div>
               <div style={{ flex: 1, minWidth: 0, paddingTop: isMobileChatView ? '1px' : 0 }}>
                  <h4 style={{ margin: 0, fontSize: isMobileChatView ? '0.96rem' : '1rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{attChatSelectedStudent.tenhv}</h4>
                  <div style={{ display: 'flex', alignItems: isMobileChatView ? 'flex-start' : 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                     <span style={{ fontSize: '0.74rem', color: '#2563eb', background: 'white', border: '1px solid #bfdbfe', borderRadius: '999px', padding: '4px 8px', fontWeight: 700 }}>Lớp {getClassDisplayName(attChatSelectedStudent.malop)}</span>
                     <span style={{ fontSize: isMobileChatView ? '0.7rem' : '0.74rem', color: '#64748b', fontWeight: 700, lineHeight: 1.35 }}>Phụ huynh đang trao đổi</span>
                  </div>
               </div>
               <button style={{ padding: isMobileChatView ? '8px' : '9px', background: 'white', border: '1px solid #dbeafe', borderRadius: '12px', color: '#2563eb', cursor: 'pointer', alignSelf: 'center', flexShrink: 0 }}>
                  <Phone size={18} />
               </button>
            </div>

            <div ref={attScrollRef} onScroll={handleAttChatScroll} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', padding: isMobileChatView ? '0.85rem 0.75rem' : '1rem', display: 'flex', flexDirection: 'column', gap: isMobileChatView ? '12px' : '14px', background: 'linear-gradient(180deg, #f8fbff 0%, #f8fafc 100%)', width: '100%', maxWidth: '100%', touchAction: 'pan-y', overscrollBehaviorX: 'none' }}>
               {attChatLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><Loader2 size={24} className="spinner" /></div>
               ) : attChatMessages.length === 0 ? (
                  <div style={{ textAlign: 'center', margin: 'auto', color: '#94a3b8', fontSize: '0.9rem', background: 'white', border: '1px dashed #cbd5e1', borderRadius: '18px', padding: '1.5rem 1.25rem' }}>Bắt đầu trò chuyện với phụ huynh của {attChatSelectedStudent.tenhv}</div>
               ) : (
                  <>
                     {attChatLoadingMore && (
                        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '4px' }}>
                           <Loader2 size={18} className="spinner" />
                        </div>
                     )}
                     {groupMessagesForDisplay(attChatMessages.filter(m => !m.content?.includes('📬 [HÒM THƯ GÓP Ý - GỬI HIỆU TRƯỞNG]'))).map((m, idx) => {
                        if (isHiddenSystemChatMessage(m)) return null;
                        const isMe = m.manv === (attendanceUser.manv || attendanceUser.username) && m.description !== 'PH';
                        const senderName = getTeacherChatSenderName(m);
                        const imageAttachments = (m._attachments || []).filter((attachment) => attachment.image_url);
                        const fileAttachments = (m._attachments || []).filter((attachment) => attachment.file_url);
                        return (
                           <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: isMobileChatView ? '100%' : '88%', alignSelf: isMe ? 'flex-end' : 'flex-start', minWidth: 0 }}>
                              <div style={{ fontSize: '0.69rem', color: '#64748b', marginBottom: '5px', padding: '0 4px', fontWeight: 800, lineHeight: 1.35, wordBreak: 'break-word' }}>
                                 {senderName}
                              </div>
                              {m.content && (
                                 <div style={{
                                    padding: isMobileChatView ? '10px 12px' : '11px 14px',
                                    borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                    background: isMe ? 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)' : 'white',
                                    color: isMe ? 'white' : '#1e293b',
                                    border: isMe ? 'none' : '1px solid #e2e8f0',
                                    boxShadow: '0 8px 18px rgba(15, 23, 42, 0.06)',
                                    fontSize: isMobileChatView ? '0.9rem' : '0.92rem',
                                    lineHeight: 1.5,
                                    width: 'fit-content',
                                    maxWidth: '100%',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    overflowWrap: 'anywhere'
                                 }}>
                                    <ChatMessageContent content={m.content} isOwnMessage={isMe} />
                                 </div>
                              )}
                              {imageAttachments.map((attachment, attachmentIndex) => (
                                 <div key={attachment.id || `${idx}-image-${attachmentIndex}`} style={{ marginTop: '6px', borderRadius: '14px', overflow: 'hidden', border: '1px solid #e2e8f0', background: 'white', padding: '4px', maxWidth: '100%', width: 'fit-content' }}>
                                    <img src={attachment.image_url} alt="chat" style={{ display: 'block', width: '100%', maxWidth: isMobileChatView ? '100%' : '420px', height: 'auto', maxHeight: '300px', borderRadius: '10px', objectFit: 'contain', cursor: 'zoom-in' }} referrerPolicy="no-referrer" onClick={() => setPreviewImage(attachment.image_url)} />
                                 </div>
                              ))}
                              {fileAttachments.map((attachment, attachmentIndex) => (
                                 <ChatMediaAttachment key={attachment.id || `${idx}-file-${attachmentIndex}`} fileUrl={attachment.file_url} fileName={attachment.file_name} mimeType={attachment.file_mime_type} isOwnMessage={isMe} />
                              ))}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                 <button
                                    type="button"
                                    onClick={() => toggleAttChatReaction(m)}
                                    style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: m.reaction ? '#e11d48' : '#94a3b8' }}
                                    title={m.reaction ? 'Bỏ tim' : 'Thả tim'}
                                 >
                                    <Heart size={15} fill={m.reaction ? '#e11d48' : 'none'} />
                                 </button>
                                 <span style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: 0 }}>
                                    {formatMessageTimestamp(m.created_at)}
                                 </span>
                              </div>
                           </div>
                        );
                     })}
                  </>
               )}
            </div>

            <div style={{ padding: isMobileChatView ? '0.75rem 0.75rem calc(0.75rem + env(safe-area-inset-bottom, 0px))' : '0.9rem 1rem', background: 'white', borderTop: '1px solid #dbeafe', width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
               <form
                  onSubmit={handleAttSendChat}
                  onDragEnter={(e) => {
                     e.preventDefault();
                     setTeacherChatDropActive(true);
                  }}
                  onDragOver={(e) => {
                     e.preventDefault();
                     setTeacherChatDropActive(true);
                  }}
                  onDragLeave={(e) => {
                     e.preventDefault();
                     if (e.currentTarget.contains(e.relatedTarget)) return;
                     setTeacherChatDropActive(false);
                  }}
                  onDrop={async (e) => {
                     e.preventDefault();
                     setTeacherChatDropActive(false);
                     const droppedFiles = toFileArray(e.dataTransfer.files);
                     if (!droppedFiles.length) return;
                     const { images, files } = splitFilesByKind(droppedFiles);
                     if (images.length > 0) await handleTeacherChatAttachmentUpload(images, 'image');
                     if (files.length > 0) await handleTeacherChatAttachmentUpload(files, 'file');
                  }}
                  style={{
                     display: 'flex',
                     alignItems: 'center',
                     gap: isMobileChatView ? '6px' : '8px',
                     width: '100%',
                     maxWidth: '100%',
                     background: '#f8fafc',
                     border: '1px solid #e2e8f0',
                     borderRadius: '18px',
                     padding: isMobileChatView ? '7px 8px' : '8px 10px',
                     overflowX: 'hidden',
                     ...(teacherChatDropActive ? { borderColor: '#0f172a', boxShadow: '0 0 0 3px rgba(15, 23, 42, 0.08)' } : {})
                  }}
               >
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                     <label style={{ cursor: 'pointer', width: isMobileChatView ? '32px' : '34px', height: isMobileChatView ? '32px' : '34px', borderRadius: '10px', background: 'white', border: '1px solid #e2e8f0', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Image size={18} />
                        <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => handleAttFileUpload(e, 'image')} disabled={uploading} />
                     </label>
                     <label style={{ cursor: 'pointer', width: isMobileChatView ? '32px' : '34px', height: isMobileChatView ? '32px' : '34px', borderRadius: '10px', background: 'white', border: '1px solid #e2e8f0', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Paperclip size={18} />
                        <input type="file" multiple style={{ display: 'none' }} onChange={(e) => handleAttFileUpload(e, 'file')} disabled={uploading} />
                     </label>
                  </div>
                  <textarea
                     ref={attChatInputRef}
                     placeholder="Nhập tin nhắn..."
                     value={attChatInput}
                     onChange={(e) => setAttChatInput(e.target.value)}
                     rows={1}
                     style={{ flex: 1, minWidth: 0, width: 0, padding: isMobileChatView ? '0.65rem 0.55rem' : '0.72rem 0.85rem', background: 'transparent', border: 'none', borderRadius: '14px', fontSize: isMobileChatView ? '14px' : '16px', outline: 'none', color: '#0f172a', resize: 'none', minHeight: isMobileChatView ? '38px' : '40px', maxHeight: 'calc(1.45em * 3 + 1.5rem)', lineHeight: 1.45, fontFamily: 'inherit', overflowY: 'hidden' }}
                  />
                  <button type="submit" disabled={!attChatInput.trim() && !uploading} style={{ width: isMobileChatView ? '38px' : '40px', height: isMobileChatView ? '38px' : '40px', minWidth: isMobileChatView ? '38px' : '40px', flexShrink: 0, borderRadius: '14px', background: '#0f172a', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: (!attChatInput.trim() && !uploading) ? 0.5 : 1, boxShadow: '0 10px 18px rgba(15, 23, 42, 0.18)' }}>
                     {uploading ? <Loader2 size={18} className="spinner" /> : <Send size={18} />}
                  </button>
               </form>
            </div>
         </div>
      </div>
   );

   return (
      <div className="attendance-portal" style={{ textAlign: 'left', animation: 'fadeIn 0.3s ease' }}>
         {attTab !== 'chat' && (
            <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobileChatView ? 'flex-start' : 'center', flexWrap: isMobileChatView ? 'wrap' : 'nowrap', gap: isMobileChatView ? '0.85rem' : 0, marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
               <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 style={{ fontSize: isMobileChatView ? '1.2rem' : '1.4rem', margin: 0, lineHeight: 1.25 }}>
                     {attTab === 'menu' ? 'Cổng Giáo Viên'
                        : attTab === 'attendance' ? 'Điểm Danh Lớp Học'
                           : attTab === 'health' ? 'Hồ Sơ Sức Khỏe'
                              : attTab === 'notices' ? 'Bảng Tin Nhà Trường'
                                 : attTab === 'ngoaikhoa' ? 'Ngoại Khóa'
                                    : attTab === 'curriculum' ? 'Chương Trình Học'
                                       : 'Trung Tâm Tin Nhắn'}
                  </h2>
                  <p style={{ color: '#64748b', margin: 0, marginTop: '5px', lineHeight: 1.4, wordBreak: 'break-word' }}>Tài khoản: <strong>{attendanceUser.tennv || attendanceUser.username}</strong></p>
               </div>
               <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
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
         )}

         {attTab === 'menu' && (
            <div style={{ marginBottom: '1.5rem' }}>
               <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem' }}>Nhóm dịch vụ</div>
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
                  {!isBoMonTeacher && (
                     <div onClick={() => setAttTab('attendance')} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '22px', padding: '14px 10px', cursor: 'pointer', textAlign: 'center', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)', transition: '0.2s' }}>
                        <div style={{ width: '60px', height: '60px', margin: '0 auto 10px', borderRadius: '999px', background: '#fdf2f8', border: '3px solid #fbcfe8', color: '#ec4899', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                           <CalendarCheck size={24} />
                        </div>
                        <div style={{ fontSize: '0.95rem', lineHeight: 1.2, color: '#1f2937', fontWeight: 700 }}>Điểm danh</div>
                     </div>
                  )}

                  <div onClick={() => setAttTab('notices')} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '22px', padding: '14px 10px', cursor: 'pointer', textAlign: 'center', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)', transition: '0.2s' }}>
                     <div style={{ width: '60px', height: '60px', margin: '0 auto 10px', borderRadius: '999px', background: '#eff6ff', border: '3px solid #bfdbfe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Bell size={24} />
                     </div>
                     <div style={{ fontSize: '0.95rem', lineHeight: 1.2, color: '#1f2937', fontWeight: 700 }}>Bảng tin<br />nhà trường</div>
                  </div>

                  <div onClick={() => setAttTab('curriculum')} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '22px', padding: '14px 10px', cursor: 'pointer', textAlign: 'center', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)', transition: '0.2s' }}>
                     <div style={{ width: '60px', height: '60px', margin: '0 auto 10px', borderRadius: '999px', background: '#f0f9ff', border: '3px solid #bae6fd', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FileText size={24} />
                     </div>
                     <div style={{ fontSize: '0.95rem', lineHeight: 1.2, color: '#1f2937', fontWeight: 700 }}>Chương trình<br />học</div>
                  </div>

                  <div onClick={() => setAttTab('ngoaikhoa')} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '22px', padding: '14px 10px', cursor: 'pointer', textAlign: 'center', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)', transition: '0.2s' }}>
                     <div style={{ width: '60px', height: '60px', margin: '0 auto 10px', borderRadius: '999px', background: '#fef3c7', border: '3px solid #fde68a', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Image size={24} />
                     </div>
                     <div style={{ fontSize: '0.95rem', lineHeight: 1.2, color: '#1f2937', fontWeight: 700 }}>Ngoại khóa</div>
                  </div>

                  {!isBoMonTeacher && (
                     <div onClick={() => setAttTab('health')} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '22px', padding: '14px 10px', cursor: 'pointer', textAlign: 'center', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)', transition: '0.2s' }}>
                        <div style={{ width: '60px', height: '60px', margin: '0 auto 10px', borderRadius: '999px', background: '#fdf2f8', border: '3px solid #fbcfe8', color: '#ec4899', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                           <Heart size={24} />
                        </div>
                        <div style={{ fontSize: '0.95rem', lineHeight: 1.2, color: '#1f2937', fontWeight: 700 }}>Hồ sơ<br />sức khỏe</div>
                     </div>
                  )}

                  {isBoMonTeacher ? (
                     <div onClick={openClassBroadcastModal} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '22px', padding: '14px 10px', cursor: 'pointer', textAlign: 'center', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)', transition: '0.2s' }}>
                        <div style={{ width: '60px', height: '60px', margin: '0 auto 10px', borderRadius: '999px', background: '#eff6ff', border: '3px solid #bfdbfe', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                           <MessageSquare size={24} />
                        </div>
                        <div style={{ fontSize: '0.95rem', lineHeight: 1.2, color: '#1f2937', fontWeight: 700 }}>Gửi thông báo<br />cả lớp</div>
                     </div>
                  ) : (
                     <div onClick={() => setAttTab('chat')} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '22px', padding: '14px 10px', cursor: 'pointer', textAlign: 'center', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)', transition: '0.2s' }}>
                        <div style={{ width: '60px', height: '60px', margin: '0 auto 10px', borderRadius: '999px', background: '#eff6ff', border: '3px solid #bfdbfe', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                           <MessageSquare size={24} />
                           {Object.values(attUnreadCounts).reduce((a, b) => a + b, 0) > 0 && (
                              <span style={{ position: 'absolute', top: '-8px', right: '-12px', background: '#ef4444', color: 'white', fontSize: '0.68rem', padding: '3px 6px', borderRadius: '999px', fontWeight: 700, border: '2px solid white' }}>
                                 +{Object.values(attUnreadCounts).reduce((a, b) => a + b, 0)}
                              </span>
                           )}
                        </div>
                        <div style={{ fontSize: '0.95rem', lineHeight: 1.2, color: '#1f2937', fontWeight: 700 }}>Liên lạc PH</div>
                     </div>
                  )}
               </div>
            </div>
         )}

         {attTab !== 'menu' && attTab !== 'chat' && (
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '12px', padding: '0.75rem 0.2rem' }}>
               <button onClick={() => setAttTab('menu')} style={{ background: '#f1f5f9', border: 'none', width: '34px', height: '34px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', cursor: 'pointer' }}>
                  <ArrowLeft size={18} />
               </button>
               <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                  {attTab === 'attendance' ? 'Điểm danh'
                     : attTab === 'health' ? 'Sức khỏe'
                        : attTab === 'notices' ? 'Bảng tin'
                           : attTab === 'ngoaikhoa' ? 'Ngoại khóa'
                              : attTab === 'curriculum' ? 'Chương trình học'
                                 : 'Liên lạc PH'}
               </div>
            </div>
         )}

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
                     {isAttendanceHoliday && (
                        <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', borderRadius: '12px', background: '#fff7ed', border: '1px solid #fdba74', color: '#c2410c', fontWeight: 600 }}>
                           Ngày đã chọn là ngày nghỉ. Hệ thống khóa ghi điểm danh cho ngày này.
                        </div>
                     )}
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
                                             <input type="radio" name={`tt_${st.mahv}`} disabled={isAttendanceHoliday} checked={rec.trangthai === 'Có mặt'} onChange={() => handleUpdateRecord(st.mahv, 'trangthai', 'Có mặt')} /> Có mặt
                                          </label>
                                       )}
                                       {(!config?.cotdiemdanh?.selected || config.cotdiemdanh.selected.includes('vangP')) && (
                                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#d97706', fontWeight: 700, fontSize: '0.95rem', background: rec.trangthai === 'Nghỉ phép' ? '#fffbeb' : 'transparent', padding: '0.4rem 0.75rem', borderRadius: '8px', border: rec.trangthai === 'Nghỉ phép' ? '1px solid #fef3c7' : '1px solid #e2e8f0', transition: '0.2s' }}>
                                             <input type="radio" name={`tt_${st.mahv}`} disabled={isAttendanceHoliday} checked={rec.trangthai === 'Nghỉ phép'} onChange={() => handleUpdateRecord(st.mahv, 'trangthai', 'Nghỉ phép')} /> Nghỉ P
                                          </label>
                                       )}
                                       {(!config?.cotdiemdanh?.selected || config.cotdiemdanh.selected.includes('vangKP')) && (
                                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#dc2626', fontWeight: 700, fontSize: '0.95rem', background: rec.trangthai === 'Nghỉ không phép' ? '#fef2f2' : 'transparent', padding: '0.4rem 0.75rem', borderRadius: '8px', border: rec.trangthai === 'Nghỉ không phép' ? '1px solid #fee2e2' : '1px solid #e2e8f0', transition: '0.2s' }}>
                                             <input type="radio" name={`tt_${st.mahv}`} disabled={isAttendanceHoliday} checked={rec.trangthai === 'Nghỉ không phép'} onChange={() => handleUpdateRecord(st.mahv, 'trangthai', 'Nghỉ không phép')} /> Nghỉ KP
                                          </label>
                                       )}
                                    </div>
                                 </div>
                                 <div>
                                    <span className="portal-att-label">Ghi chú / Nhận xét</span>
                                    <textarea placeholder="Nhận xét riêng..." value={rec.ghichu || ''} onChange={e => handleUpdateRecord(st.mahv, 'ghichu', e.target.value)} disabled={isAttendanceHoliday} rows="2" style={{ width: '100%', padding: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '10px', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem', outline: 'none' }} />
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
                        <button onClick={handleSaveAttendance} disabled={loading || isAttendanceHoliday} style={{ width: '100%', padding: '1rem', marginTop: '1.5rem', background: '#ec4899', color: 'white', fontWeight: 700, border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
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
                  {attSelectedClass && (
                     <div style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: '#0f766e', fontWeight: 600 }}>
                        Ngày nhập gần nhất: {attLatestHealthDate ? new Date(attLatestHealthDate).toLocaleDateString('vi-VN') : 'Chưa có dữ liệu'}
                     </div>
                  )}
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

         {(attTab === 'notices' || attTab === 'curriculum' || attTab === 'ngoaikhoa') && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
               {attClasses.length > 0 && attTab === 'curriculum' && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
                     <button
                        type="button"
                        onClick={() => openClassBroadcastModal('curriculum')}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '0.8rem 1rem', borderRadius: '14px', border: 'none', background: '#0f766e', color: 'white', cursor: 'pointer', fontWeight: 700, boxShadow: '0 10px 24px rgba(15, 118, 110, 0.18)' }}
                     >
                        <FileText size={16} />
                        <span>Gửi chương trình học</span>
                     </button>
                  </div>
               )}
               {attClasses.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: '#64748b', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #e2e8f0' }}>
                     Chưa có lớp phân công để xem {attTab === 'notices' ? 'bảng tin' : (attTab === 'curriculum' ? 'chương trình học' : 'ngoại khóa')}.
                  </div>
               ) : teacherAnnouncementsLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                     <Loader2 size={24} className="spinner" />
                  </div>
               ) : teacherAnnouncements.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                     {groupAnnouncementsForDisplay(teacherAnnouncements).map((item) => (
                        <div key={item.id} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.08)' }}>
                           <div style={{ padding: '15px', borderBottom: '1px solid #f1f5f9', background: attTab === 'notices' ? '#eff6ff' : (attTab === 'curriculum' ? '#f0f9ff' : '#fff7ed'), display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                              <div style={{ minWidth: 0 }}>
                                 <div style={{ fontWeight: 800, color: attTab === 'notices' ? '#2563eb' : (attTab === 'curriculum' ? '#0f766e' : '#c2410c') }}>
                                    {item.title || (attTab === 'notices' ? 'Thông báo lớp' : (attTab === 'curriculum' ? 'Chương trình học' : 'Ngoại khóa'))}
                                 </div>
                                 <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700, marginTop: '4px' }}>
                                    Lớp: {getClassDisplayName(item.malop)}
                                 </div>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                                 {attTab === 'curriculum' && (
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', background: item.approved === false ? '#fff7ed' : '#ecfdf5', color: item.approved === false ? '#c2410c' : '#047857' }}>
                                       {item.approved === false ? 'Chờ duyệt' : 'Đã duyệt'}
                                    </span>
                                 )}
                                 <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    {new Date(item.created_at).toLocaleDateString('vi-VN')}
                                 </span>
                              </div>
                           </div>
                           <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div style={{ color: '#475569', fontSize: '0.95rem', lineHeight: '1.7', whiteSpace: 'pre-wrap', background: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                                 {item.content || 'Chưa có nội dung chi tiết.'}
                              </div>
                              {(item._attachments || []).filter((attachment) => attachment.image_url).map((attachment, attachmentIndex) => (
                                 <div key={attachment.id || `${item.id || 'announcement'}-image-${attachmentIndex}`} style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                    <img src={attachment.image_url} alt={item.title || 'announcement'} style={{ width: '100%', display: 'block', cursor: 'zoom-in' }} onClick={() => setPreviewImage(attachment.image_url)} />
                                 </div>
                              ))}
                              {(item._attachments || []).filter((attachment) => attachment.file_url).map((attachment, attachmentIndex) => (
                                 <ChatMediaAttachment key={attachment.id || `${item.id || 'announcement'}-file-${attachmentIndex}`} fileUrl={attachment.file_url} fileName={attachment.file_name} mimeType={attachment.file_mime_type} />
                              ))}
                           </div>
                        </div>
                     ))}
                  </div>
               ) : (
                  <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: '#64748b', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #e2e8f0' }}>
                     Chưa có {attTab === 'notices' ? 'bảng tin' : (attTab === 'curriculum' ? 'chương trình học' : 'ngoại khóa')} nào trong các lớp được phân công.
                  </div>
               )}
            </div>
         )}

         {attTab === 'chat' && (
            <div className="teacher-chat-portal" style={{ animation: 'fadeIn 0.3s ease', minHeight: isMobileChatView ? mobileChatPanelHeight : '600px', height: isMobileChatView ? mobileChatPanelHeight : 'auto', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '100%', overflowX: 'hidden', touchAction: 'pan-y', overscrollBehaviorX: 'none' }}>
               <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px', padding: isMobileChatView ? '0 0.1rem' : '0 0.2rem', flexShrink: 0 }}>
                  <button
                     type="button"
                     onClick={() => {
                        setAttChatSelectedStudent(null);
                        setAttChatView('dashboard');
                        setAttTab('menu');
                     }}
                     style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: isMobileChatView ? '0.65rem 0.85rem' : '0.7rem 0.95rem', borderRadius: '999px', border: '1px solid #dbeafe', background: 'white', color: '#334155', cursor: 'pointer', fontWeight: 700, boxShadow: '0 8px 18px rgba(15, 23, 42, 0.06)' }}
                  >
                     <ArrowLeft size={16} />
                     <span>Quay lại</span>
                  </button>
               </div>
               {attChatView === 'dashboard' ? renderTeacherChatDashboard() : renderTeacherChatThread()}
            </div>
         )}

         {isClassBroadcastOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
               <div style={{ width: '100%', maxWidth: '520px', background: 'white', borderRadius: '20px', boxShadow: '0 25px 50px rgba(15, 23, 42, 0.25)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
                     <div>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{classBroadcastMode === 'curriculum' ? 'Gửi chương trình học' : 'Gửi thông báo cả lớp'}</h3>
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
                        placeholder={classBroadcastMode === 'curriculum' ? 'Nhập nội dung chương trình học cho lớp...' : 'Nh\u1eadp n\u1ed9i dung th\u00f4ng b\u00e1o cho c\u1ea3 l\u1edbp...'}
                        rows={5}
                        style={{ width: '100%', resize: 'vertical', minHeight: '130px', padding: '0.9rem 1rem', borderRadius: '16px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.95rem', lineHeight: 1.5, fontFamily: 'inherit' }}
                     />

                     <div style={{ display: 'grid', gap: '0.75rem' }}>
                        <FileDropZone
                           files={classBroadcastMedia}
                           onFilesChange={mergeBroadcastFiles}
                           icon={Image}
                           accentColor="#be185d"
                           borderColor="#f9a8d4"
                           activeBorderColor="#ec4899"
                           background="#fdf2f8"
                           textColor="#be185d"
                           subTextColor="#9a3412"
                           emptyTitle={classBroadcastMode === 'curriculum' ? 'Chọn tệp chương trình học' : 'Ch\u1ecdn h\u00ecnh th\u00f4ng b\u00e1o'}
                           selectedHint={'H\u00ecnh \u0111\u00e3 ch\u1ecdn'}
                           style={{ padding: '0.85rem 1rem', borderRadius: '14px' }}
                           disabled={uploading}
                        />

                        {classBroadcastMedia.length > 0 && (
                           <button type="button" onClick={() => setClassBroadcastMedia([])} style={{ border: '1px solid #fed7aa', background: '#fff7ed', color: '#9a3412', cursor: 'pointer', fontWeight: 700, borderRadius: '12px', padding: '0.75rem 0.9rem' }}>
                              {'B\u1ecf'}
                           </button>
                        )}
                     </div>

                     <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                        <button type="button" onClick={closeClassBroadcastModal} disabled={uploading} style={{ padding: '0.8rem 1.1rem', borderRadius: '12px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', cursor: 'pointer', fontWeight: 700 }}>
                           {'H\u1ee7y'}
                        </button>
                           <button
                              type="submit"
                              disabled={uploading || (!classBroadcastText.trim() && classBroadcastMedia.length === 0)}
                              style={{ padding: '0.8rem 1.15rem', borderRadius: '12px', border: 'none', background: classBroadcastMode === 'curriculum' ? '#0f766e' : '#ec4899', color: 'white', cursor: 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.55rem', opacity: uploading || (!classBroadcastText.trim() && classBroadcastMedia.length === 0) ? 0.65 : 1 }}
                           >
                           {uploading ? <Loader2 size={18} className="spinner" /> : <Send size={18} />}
                           <span>{classBroadcastMode === 'curriculum' ? 'Gửi chương trình học' : 'G\u1eedi t\u1edbi c\u1ea3 l\u1edbp'}</span>
                        </button>
                     </div>
                  </form>
               </div>
            </div>
         )}

         {previewImage && (
            <div className="image-preview-overlay" onClick={() => setPreviewImage(null)}>
               <div className="preview-container" onClick={e => e.stopPropagation()}>
                  <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '10px', zIndex: 2 }}>
                     <button
                        className="preview-close-btn"
                        onClick={() => handleSavePreviewImage(previewImage)}
                        title="Lưu ảnh"
                     >
                        <Download size={22} />
                     </button>
                     <button className="preview-close-btn" onClick={() => setPreviewImage(null)}><X size={24} /></button>
                  </div>
                  <img src={previewImage} alt="Preview" referrerPolicy="no-referrer" />
               </div>
            </div>
         )}
      </div>
   );
}

export default TeacherPortal;
