import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useConfig } from '../ConfigContext';
import { uploadToR2 } from '../utils/cloudflareR2';
import { compressImage } from '../utils/imageUtils';
import { triggerPushNotification } from '../utils/pushNotifications';
import ChatMessageContent from './ChatMessageContent';
import ChatMediaAttachment from './ChatMediaAttachment';
import { groupAnnouncementsForDisplay, groupMessagesForDisplay } from '../utils/chatMessageGrouping';
import { getActiveNgoaiKhoaAnnouncements, isNgoaiKhoaCloseAnnouncement } from '../utils/ngoaiKhoaUtils';
import { saveImageToDevice } from '../utils/mobileImageSave';
import { fetchParentStudentPortalData } from '../utils/parentPortalData';
import { Search, ArrowLeft, UserMinus, Bell, CalendarCheck, Heart, MessageSquare, Pill, Users, Utensils, Image, MessageCircle, LogOut, FileText, Download, Loader2, Send, CreditCard, Wallet, Paperclip, MoreVertical, X, Activity, Settings, QrCode, Newspaper, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Phone, CheckCircle2 } from 'lucide-react';

const isDeletedRecord = (record) => {
   const deletedValue = String(record?.daxoa || '').trim().toLowerCase();
   return deletedValue === 'đã xóa' || deletedValue === 'da xoa';
};

const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const getVietnamDateParts = (date = new Date()) => {
   const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: VN_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
   }).formatToParts(date);

   const getPart = (type) => parts.find(part => part.type === type)?.value || '';
   return {
      year: getPart('year'),
      month: getPart('month'),
      day: getPart('day'),
      hour: getPart('hour'),
      minute: getPart('minute')
   };
};

const getVietnamDateString = (date = new Date()) => {
   const { year, month, day } = getVietnamDateParts(date);
   return `${year}-${month}-${day}`;
};

const getVietnamTimeTotal = (date = new Date()) => {
   const { hour, minute } = getVietnamDateParts(date);
   return (parseInt(hour, 10) || 0) * 60 + (parseInt(minute, 10) || 0);
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

const getYearMonthKey = (dateStr) => {
   if (!dateStr) return '';
   const date = new Date(dateStr);
   if (Number.isNaN(date.getTime())) return '';
   return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const getFeePeriodKeys = (record) => {
   const periodText = String(record?.thoiluong || record?.thang || '').trim();
   const matches = Array.from(periodText.matchAll(/(\d{1,2})\/(\d{4})/g));

   if (matches.length > 0) {
      return matches
         .map(([, month, year]) => `${year}-${String(month).padStart(2, '0')}`)
         .filter(Boolean);
   }

   const fallbackKey = getYearMonthKey(record?.ngaybatdau || record?.ngaylap);
   return fallbackKey ? [fallbackKey] : [];
};

const getLatestFeePeriodKey = (record) => {
   const keys = getFeePeriodKeys(record).sort();
   return keys[keys.length - 1] || '';
};

const getRecordTime = (record) => {
   if (!record?.ngaylap) return 0;
   const time = new Date(record.ngaylap).getTime();
   return Number.isFinite(time) ? time : 0;
};

const compareFeeRecordsDesc = (left, right) => {
   const leftPeriod = getLatestFeePeriodKey(left);
   const rightPeriod = getLatestFeePeriodKey(right);
   const periodCompare = rightPeriod.localeCompare(leftPeriod);
   if (periodCompare !== 0) return periodCompare;

   const timeCompare = getRecordTime(right) - getRecordTime(left);
   if (timeCompare !== 0) return timeCompare;

   return String(right?.mahd || '').localeCompare(String(left?.mahd || ''), undefined, { numeric: true, sensitivity: 'base' });
};

const compareRecordTimeDesc = (left, right) => {
   const timeCompare = getRecordTime(right) - getRecordTime(left);
   if (timeCompare !== 0) return timeCompare;
   return String(right?.mahd || '').localeCompare(String(left?.mahd || ''), undefined, { numeric: true, sensitivity: 'base' });
};

const formatDateStringVi = (dateStr) => {
   if (!dateStr) return '';
   const [year, month, day] = String(dateStr).split('-');
   if (!year || !month || !day) return dateStr;
   return `${day}/${month}/${year}`;
};

const addDaysToDateString = (dateStr, days) => {
   const [year, month, day] = String(dateStr).split('-').map(Number);
   if (!year || !month || !day) return dateStr;
   const utcDate = new Date(Date.UTC(year, month - 1, day));
   utcDate.setUTCDate(utcDate.getUTCDate() + days);
   const nextYear = utcDate.getUTCFullYear();
   const nextMonth = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
   const nextDay = String(utcDate.getUTCDate()).padStart(2, '0');
   return `${nextYear}-${nextMonth}-${nextDay}`;
};

const getLastDayOfMonthString = (year, month) => {
   const utcDate = new Date(Date.UTC(year, month, 0));
   const nextYear = utcDate.getUTCFullYear();
   const nextMonth = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
   const nextDay = String(utcDate.getUTCDate()).padStart(2, '0');
   return `${nextYear}-${nextMonth}-${nextDay}`;
};

const getFeeDueBaseDate = (record) => {
   const endDate = String(record?.ngayketthuc || '').slice(0, 10);
   if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return endDate;

   const latestPeriodKey = getLatestFeePeriodKey(record);
   if (latestPeriodKey) {
      const [year, month] = latestPeriodKey.split('-').map(Number);
      if (year && month) return getLastDayOfMonthString(year, month);
   }

   const fallbackKey = getYearMonthKey(record?.ngaybatdau || record?.ngaylap);
   if (fallbackKey) {
      const [year, month] = fallbackKey.split('-').map(Number);
      if (year && month) return getLastDayOfMonthString(year, month);
   }

   return '';
};

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

function ParentPortal({ parentData, setParentData }) {
   const tuitionTransferProofCategory = 'Ảnh chuyển khoản học phí';
   const { config } = useConfig();
   const [parentTab, setParentTab] = useState('menu');
   const [chatMessages, setChatMessages] = useState([]);
   const [chatLoading, setChatLoading] = useState(false);
   const [chatInput, setChatInput] = useState('');
   const [chatDocuments, setChatDocuments] = useState([]);
   const [parentNotices, setParentNotices] = useState([]);
   const [ngoaiKhoaAnnouncements, setNgoaiKhoaAnnouncements] = useState([]);
   const [uploading, setUploading] = useState(false);
   const [showChatInfo, setShowChatInfo] = useState(true);
   const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
   const [leaveType, setLeaveType] = useState('today');
   const [leaveForm, setLeaveForm] = useState({ from: '', to: '', reason: '' });
   const [leaveSubmitting, setLeaveSubmitting] = useState(false);
   const [isPickupModalOpen, setIsPickupModalOpen] = useState(false);
   const [pickupForm, setPickupForm] = useState({ name: '', phone: '', relation: '', reason: '' });
   const [isMedicineModalOpen, setIsMedicineModalOpen] = useState(false);
   const [medicineForm, setMedicineForm] = useState({ name: '', usage: '' });
   const [medicineSubmitting, setMedicineSubmitting] = useState(false);
   const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
   const [feedbackContent, setFeedbackContent] = useState('');
   const [feedbackLoading, setFeedbackLoading] = useState(false);
   const [unreadChatCount, setUnreadChatCount] = useState(0);
   const [unreadNotices, setUnreadNotices] = useState(0);
   const [unreadHealth, setUnreadHealth] = useState(0);
   const [unreadMenu, setUnreadMenu] = useState(0);
   const [unreadNgoaiKhoa, setUnreadNgoaiKhoa] = useState(0);
   const [unreadChuongTrinhHoc, setUnreadChuongTrinhHoc] = useState(0);
   const [previewImage, setPreviewImage] = useState(null);
   const [isSwitchingChild, setIsSwitchingChild] = useState(false);
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
   const chatInputRef = useRef(null);
   const tuitionTransferInputRef = useRef(null);
   const [hasMoreChat, setHasMoreChat] = useState(true);
   const [isLoadMoreChat, setIsLoadMoreChat] = useState(false);
   const [loadingTuitionNoticeImage, setLoadingTuitionNoticeImage] = useState(false);
   const [loadingInvoiceImage, setLoadingInvoiceImage] = useState(false);
   const [staffDirectory, setStaffDirectory] = useState({});
   const leaveSubmitLockRef = useRef(false);
   const medicineSubmitLockRef = useRef(false);
   const hotlineNumber = String(config?.sdtcongty || config?.hotline || config?.phone || '').trim();
   const normalizedHotlineNumber = hotlineNumber.replace(/[^\d]/g, '');
   const parentChildren = React.useMemo(() => {
      if (Array.isArray(parentData?.children) && parentData.children.length > 0) {
         return parentData.children;
      }
      return parentData?.student ? [parentData.student] : [];
   }, [parentData]);
   const activeStudentId = parentData?.activeStudentId || parentData?.student?.mahv || '';

   const getDisplayUrl = (url) => {
      if (!url) return '';
      if (url.includes('drive.google.com/')) {
         let id = '';
         if (url.includes('id=')) id = url.split('id=')[1]?.split('&')[0];
         else if (url.includes('/d/')) id = url.split('/d/')[1]?.split('/')[0];

         if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
      }
      return url;
   };

   const updateParentSessionCache = (nextParentData) => {
      try {
         const savedSession = localStorage.getItem('parent_session');
         if (!savedSession) return;
         const parsedSession = JSON.parse(savedSession);
         localStorage.setItem('parent_session', JSON.stringify({
            ...parsedSession,
            data: nextParentData
         }));
      } catch (error) {
         console.error('Không cập nhật được phiên phụ huynh:', error);
      }
   };

   const handleSelectChild = async (child) => {
      if (!child?.mahv || child.mahv === activeStudentId || isSwitchingChild) return;

      setIsSwitchingChild(true);
      try {
         const nextContext = await fetchParentStudentPortalData(supabase, child);
         const nextChildren = parentChildren.map((item) => (
            item?.mahv === nextContext.student?.mahv
               ? { ...item, ...nextContext.student }
               : item
         ));
         const nextParentData = {
            ...nextContext,
            children: nextChildren,
            activeStudentId: nextContext.student?.mahv || child.mahv
         };

         setParentData(nextParentData);
         updateParentSessionCache(nextParentData);
      } catch (error) {
         console.error('Không chuyển được bé đang xem:', error);
         alert('Không tải được dữ liệu của bé. Vui lòng thử lại.');
      } finally {
         setIsSwitchingChild(false);
      }
   };

   const canOpenImageUrl = async (url) => {
      const resolvedUrl = getDisplayUrl(url);
      if (!resolvedUrl) return false;

      return new Promise(resolve => {
         const img = new window.Image();
         let settled = false;
         const done = (result) => {
            if (settled) return;
            settled = true;
            resolve(result);
         };

         const timer = window.setTimeout(() => done(false), 5000);
         img.onload = () => {
            window.clearTimeout(timer);
            done(true);
         };
         img.onerror = () => {
            window.clearTimeout(timer);
            done(false);
         };
         img.referrerPolicy = 'no-referrer';
         img.src = resolvedUrl;
      });
   };

   const getFirstWorkingImageUrl = async (candidates = []) => {
      const seen = new Set();

      for (const candidate of candidates) {
         const resolvedUrl = getDisplayUrl(candidate);
         if (!resolvedUrl || seen.has(resolvedUrl)) continue;
         seen.add(resolvedUrl);

         const isWorking = await canOpenImageUrl(resolvedUrl);
         if (isWorking) return resolvedUrl;
      }

      return null;
   };

   const refreshLatestFeeData = React.useCallback(async () => {
      const studentId = parentData?.student?.mahv;
      if (!studentId) return;

      try {
         const [{ data: feeRows, error: feeError }, { data: invoiceRows, error: invoiceError }] = await Promise.all([
            supabase
               .from('tbl_thongbao')
               .select('*')
               .eq('mahv', studentId)
               .order('ngaylap', { ascending: false })
               .limit(20),
            supabase
               .from('tbl_hd')
               .select('mahd, ngaylap, ngaybatdau, thoiluong, tongcong, hinhthuc, image_url, daxoa')
               .eq('mahv', studentId)
               .order('ngaylap', { ascending: false })
               .limit(20)
         ]);

         if (feeError) throw feeError;
         if (invoiceError) throw invoiceError;

         const latestFeeRows = (feeRows || [])
            .filter(row => !isDeletedRecord(row));
         const invoices = (invoiceRows || [])
            .filter(row => !isDeletedRecord(row))
            .sort(compareFeeRecordsDesc);
         const latestFee = [...latestFeeRows].sort(compareRecordTimeDesc)[0] || null;

         setParentData(prev => {
            if (!prev) return prev;
            return {
               ...prev,
               latestFee,
               invoices
            };
         });
      } catch (error) {
         console.error('Không làm mới được dữ liệu học phí phụ huynh:', error);
      }
   }, [parentData?.student?.mahv, setParentData]);

   const scrollParentChatToBottom = (behavior = 'auto') => {
      if (!chatContainerRef.current) return;
      chatContainerRef.current.scrollTo({
         top: chatContainerRef.current.scrollHeight,
         left: 0,
         behavior
      });
   };

   const getStaffDisplayName = (staffId) => {
      if (!staffId) return 'Nhà trường';
      return staffDirectory[staffId] || (staffId === parentData?.teacherManv ? 'Giáo viên phụ trách' : staffId);
   };

   const getParentChatSenderName = (message) => {
      if (!message) return '';
      if (message.description === 'PH' || !message.manv) return 'Bạn';
      return getStaffDisplayName(message.manv);
   };

   const handleCallHotline = () => {
      if (!normalizedHotlineNumber) {
         alert('Chưa cấu hình số hotline trong phần cấu hình hệ thống.');
         return;
      }

      const zaloUrl = `https://zalo.me/${normalizedHotlineNumber}`;
      const telUrl = `tel:${normalizedHotlineNumber}`;
      let fallbackTriggered = false;

      const cleanup = () => {
         window.removeEventListener('blur', cancelFallback);
         document.removeEventListener('visibilitychange', handleVisibilityChange);
      };

      const cancelFallback = () => {
         fallbackTriggered = true;
         cleanup();
      };

      const handleVisibilityChange = () => {
         if (document.hidden) {
            cancelFallback();
         }
      };

      window.addEventListener('blur', cancelFallback, { once: true });
      document.addEventListener('visibilitychange', handleVisibilityChange);

      window.location.href = zaloUrl;

      window.setTimeout(() => {
         if (!fallbackTriggered && !document.hidden) {
            cleanup();
            window.location.href = telUrl;
         }
      }, 1400);
   };

   const syncAppBadge = (count) => {
      const badgeCount = Number.isFinite(count) ? Math.max(0, count) : 0;

      if ('setAppBadge' in navigator) {
         if (badgeCount > 0) {
            navigator.setAppBadge(badgeCount).catch(console.error);
         } else if ('clearAppBadge' in navigator) {
            navigator.clearAppBadge().catch(console.error);
         }
      }

      if (navigator.serviceWorker?.controller) {
         navigator.serviceWorker.controller.postMessage({
            type: 'SYNC_APP_BADGE',
            count: badgeCount
         });
      }
   };

   const showNotification = (title, body) => {
      if (Notification.permission === 'granted') {
         if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then((registration) => {
               registration.showNotification(title, { body, icon: '/logo192.png' });
            }).catch(() => {
               new Notification(title, { body, icon: '/logo192.png' });
            });
         } else {
            new Notification(title, { body, icon: '/logo192.png' });
         }
      }
   };

   const subscribeToPushNotifications = async () => {
      if (!('serviceWorker' in navigator)) {
         alert('Trình duyệt không hỗ trợ Service Worker.');
         return;
      }
      if (!('PushManager' in window)) {
         alert('Trình duyệt không hỗ trợ Push Notifications.');
         return;
      }

      try {
         const permission = await Notification.requestPermission();
         if (permission !== 'granted') {
            alert('Bạn đã từ chối nhận thông báo.');
            return;
         }

         const registration = await navigator.serviceWorker.ready;

         // In a real app, replace this with your VAPID public key
         const publicVapidKey = process.env.REACT_APP_VAPID_PUBLIC_KEY || '';

         // Convert VAPID key to Uint8Array
         const urlBase64ToUint8Array = (base64String) => {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
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

         console.log('Push Subscription Endpoint:', JSON.stringify(subscription));

         // Save subscription to Supabase
         if (parentData?.student?.mahv) {
            const { error: dbError } = await supabase.from('push_subscriptions').upsert({
               user_id: parentData.student.mahv,
               role: 'parent',
               subscription: subscription,
               updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

            if (dbError) {
               console.error('Lỗi khi lưu Subscription vào DB:', dbError);
            }
         }

         alert(existingSubscription ? 'Đã bật thông báo thành công (Đã có Subscription).' : 'Đã bật thông báo thành công!');

      } catch (err) {
         console.error('Lỗi khi đăng ký nhận thông báo:', err);
         alert('Có lỗi xảy ra khi đăng ký nhận thông báo: ' + err.message);
      }
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
            console.error('Error fetching staff directory:', error);
            return;
         }

         const nextDirectory = {};
         (data || []).forEach((staff) => {
            if (staff?.manv) nextDirectory[staff.manv] = staff.tennv || staff.manv;
         });
         setStaffDirectory(nextDirectory);
      };

      fetchStaffDirectory();
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
         await triggerPushNotification(supabase, 'hv_messages', data[0]);
         setChatInput('');
         setTimeout(() => scrollParentChatToBottom('smooth'), 100);
      }
   };

   const fetchClassAnnouncementsByTitle = async (title, limit = 10) => {
      if (!parentData?.student?.malop) return [];

      const { data, error } = await supabase
         .from('class_announcements')
         .select('*')
         .eq('malop', parentData.student.malop)
         .eq('approved', true)
         .eq('title', title)
         .order('created_at', { ascending: false })
         .limit(limit);

      if (error) {
         console.error(error);
         return [];
      }

      return (data || []).map(item => ({
         ...item,
         type: 'class',
         date: item.created_at,
         title: item.title,
         content: item.content,
         image_url: item.image_url,
         file_url: item.file_url,
         file_name: item.file_name
      }));
   };

   const fetchParentNotices = async () => {
      if (!parentData?.student?.mahv || !parentData?.student?.malop) return;

      const { data: generalNotices } = await supabase
         .from('tbl_thongbao')
         .select('*')
         .eq('mahv', parentData.student.mahv)
         .order('ngaylap', { ascending: false })
         .limit(10);

      const { data: classAnnouncements } = await supabase
         .from('class_announcements')
         .select('*')
         .eq('malop', parentData.student.malop)
         .eq('approved', true)
         .order('created_at', { ascending: false })
         .limit(10);

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

   const fetchNgoaiKhoaAnnouncements = async () => {
      const data = await fetchClassAnnouncementsByTitle('NGOẠI KHÓA', 20);
      setNgoaiKhoaAnnouncements(getActiveNgoaiKhoaAnnouncements(data).slice(0, 10));
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
            setTimeout(() => scrollParentChatToBottom('auto'), 50);
         }
      }

      if (isLoadMore) setIsLoadMoreChat(false);
      else setChatLoading(false);
   };

   const toggleChatReaction = async (message) => {
      if (!message?.id) return;
      const nextReaction = !Boolean(message.reaction);

      setChatMessages(prev => prev.map(m => m.id === message.id ? { ...m, reaction: nextReaction } : m));

      const { data, error } = await supabase
         .from('hv_messages')
         .update({ reaction: nextReaction })
         .eq('id', message.id)
         .select()
         .maybeSingle();

      if (error) {
         console.error('Lỗi cập nhật reaction:', error);
         setChatMessages(prev => prev.map(m => m.id === message.id ? { ...m, reaction: Boolean(message.reaction) } : m));
         return;
      }

      if (data) {
         setChatMessages(prev => prev.map(m => m.id === message.id ? data : m));
      }
   };

   const handleChatScroll = (e) => {
      if (e.target.scrollTop === 0 && hasMoreChat && !chatLoading && !isLoadMoreChat) {
         fetchChatMessages(true);
      }
   };

   const handleLeaveSubmit = async (e) => {
      e.preventDefault();
      if (leaveSubmitLockRef.current) return;

      let fromDateStr = leaveForm.from;
      let toDateStr = leaveForm.to;

      const todayStr = getVietnamDateString();

      if (leaveType === 'today') {
         fromDateStr = toDateStr = todayStr;
      } else if (leaveType === 'tomorrow') {
         fromDateStr = toDateStr = addDaysToDateString(todayStr, 1);
      }

      if (!fromDateStr || !toDateStr || !leaveForm.reason?.trim()) {
         alert('Vui lòng nhập đầy đủ thông tin xin nghỉ.');
         return;
      }

      if (fromDateStr > toDateStr) {
         alert('Ngày bắt đầu nghỉ không được lớn hơn ngày kết thúc.');
         return;
      }

      leaveSubmitLockRef.current = true;
      setLeaveSubmitting(true);
      try {
         const trimmedReason = leaveForm.reason.trim();
         const msg = `🔔 XIN NGHỈ HỌC\n- Bé: ${parentData.student.tenhv}\n- Từ ngày: ${formatDateStringVi(fromDateStr)}\n- Đến ngày: ${formatDateStringVi(toDateStr)}\n- Lý do: ${trimmedReason}`;
         await sendQuickMessage(msg);

         // Insert into tbl_diemdanh
         const configTimeStr = config?.xinnghitruocmaygio || '08:00';
         const [cfgHour, cfgMin] = configTimeStr.split(':').map(Number);
         const cfgTimeTotal = (Number.isFinite(cfgHour) ? cfgHour : 8) * 60 + (Number.isFinite(cfgMin) ? cfgMin : 0);
         let leaveMalop = parentData.student.malop || null;
         let leaveManv = parentData.teacherManv || null;

         if (leaveMalop) {
            const { data: classData } = await supabase
               .from('tbl_lop')
               .select('malop, manv')
               .eq('malop', leaveMalop)
               .maybeSingle();

            if (classData) {
               leaveMalop = classData.malop || leaveMalop;
               leaveManv = classData.manv || leaveManv;
            }
         }

         let currDateStr = fromDateStr;
         while (currDateStr <= toDateStr) {
            let trangthai = 'Nghỉ phép';

            if (currDateStr === todayStr) {
               const currentTimeTotal = getVietnamTimeTotal();
               if (currentTimeTotal > cfgTimeTotal) {
                  trangthai = 'Nghỉ không phép';
               }
            }

            const payload = {
               mahv: parentData.student.mahv,
               malop: leaveMalop,
               ngay: currDateStr,
               trangthai,
               ghichu: trimmedReason,
               manv: leaveManv
            };

            // Check if record exists
            const { data: existing } = await supabase.from('tbl_diemdanh').select('id').eq('mahv', payload.mahv).eq('ngay', payload.ngay).maybeSingle();
            if (existing) {
               await supabase.from('tbl_diemdanh').update(payload).eq('id', existing.id);
            } else {
               await supabase.from('tbl_diemdanh').insert([payload]);
            }

            currDateStr = addDaysToDateString(currDateStr, 1);
         }
         setIsLeaveModalOpen(false);
         setLeaveForm({ from: '', to: '', reason: '' });
         setLeaveType('today');
      } catch (err) {
         console.error('Lỗi khi gửi đơn xin nghỉ:', err);
         alert('Có lỗi xảy ra khi gửi đơn xin nghỉ.');
      } finally {
         leaveSubmitLockRef.current = false;
         setLeaveSubmitting(false);
      }
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
      if (medicineSubmitLockRef.current) return;
      if (!medicineForm.name || !medicineForm.usage) {
         alert('Vui lòng nhập đầy đủ thông tin dặn thuốc.');
         return;
      }
      medicineSubmitLockRef.current = true;
      setMedicineSubmitting(true);
      try {
         const msg = `💊 LỜI DẶN THUỐC\n- Bé: ${parentData.student.tenhv}\n- Tên thuốc: ${medicineForm.name}\n- Cách dùng: ${medicineForm.usage}`;
         await sendQuickMessage(msg);
         setIsMedicineModalOpen(false);
         setMedicineForm({ name: '', usage: '' });
      } finally {
         medicineSubmitLockRef.current = false;
         setMedicineSubmitting(false);
      }
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
         const { data, error } = await supabase.from('hv_messages').insert([newMessage]).select();
         if (error) throw error;
         if (data?.[0]) {
            await triggerPushNotification(supabase, 'hv_messages', data[0]);
         }
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

   const handleDownloadImage = async (imageUrl, filename = 'image.jpg', existingWindow = null) => {
      if (!imageUrl) return;

      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isStandaloneMode = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone;
      const resolvedImageUrl = getDisplayUrl(imageUrl);

      try {
         const handled = await saveImageToDevice(resolvedImageUrl, filename);
         if (handled) {
            if (existingWindow) existingWindow.close();
            return;
         }
      } catch (error) {
         console.warn('saveImageToDevice failed, falling back to legacy download flow', error);
      }

      // Mobile and desktop flows are handled separately below.
      if (false && isMobileDevice && navigator.share && navigator.canShare) {
         try {
            const response = await fetch(resolvedImageUrl);
            const blob = await response.blob();
            const file = new File([blob], filename, { type: blob.type });
            if (navigator.canShare({ files: [file] })) {
               await navigator.share({
                  files: [file],
                  title: 'Tải ảnh',
                  text: 'Lưu ảnh vào thư viện thiết bị',
               });
               if (existingWindow) existingWindow.close();
               return;
            }
         } catch (error) {
            console.warn('Web Share failed', error);
         }
      }

      // 2. Direct Supabase Storage Download (Bypasses CORS entirely and downloads directly in background)
      if (!isMobileDevice && resolvedImageUrl.includes('supabase.co')) {
         try {
            if (existingWindow) existingWindow.close();
            const separator = resolvedImageUrl.includes('?') ? '&' : '?';
            const downloadUrl = `${resolvedImageUrl}${separator}download=`;

            const link = document.createElement('a');
            link.href = downloadUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
         } catch (err) {
            console.error('Supabase direct download failed, falling back', err);
         }
      }

      const triggerLocalDownload = (blob, name) => {
         const blobUrl = window.URL.createObjectURL(blob);
         const link = document.createElement('a');
         link.href = blobUrl;
         link.download = name;
         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);
         window.URL.revokeObjectURL(blobUrl);
      };

      const openImageForDeviceSave = (blob, fallbackUrl = resolvedImageUrl) => {
         const blobUrl = blob ? window.URL.createObjectURL(blob) : '';
         const targetUrl = blobUrl || fallbackUrl;

         if (isMobileDevice && isStandaloneMode) {
            window.location.href = targetUrl;
            return;
         }

         if (existingWindow) {
            existingWindow.location.href = targetUrl;
         } else {
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
         }
      };

      const downloadRemoteBlob = async (url) => {
         const response = await fetch(url, { credentials: 'omit' });
         if (!response.ok) {
            throw new Error(`Download failed with status ${response.status}`);
         }
         return response.blob();
      };

      const downloadViaCorsProxy = async (url) => {
         const proxyUrls = [
            `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
         ];

         let lastError = null;

         for (const proxyUrl of proxyUrls) {
            try {
               return await downloadRemoteBlob(proxyUrl);
            } catch (error) {
               lastError = error;
            }
         }

         throw lastError || new Error('Unable to fetch image through proxy');
      };

      if (isMobileDevice) {
         if (navigator.share) {
            try {
               await navigator.share({
                  title: 'Tải ảnh',
                  text: 'Mở ảnh để lưu về máy',
                  url: resolvedImageUrl
               });
               if (existingWindow) existingWindow.close();
               return;
            } catch (error) {
               console.warn('Direct URL share failed, falling back to blob download flow', error);
            }
         }

         let mobileBlob = null;

         try {
            mobileBlob = await downloadRemoteBlob(resolvedImageUrl);
         } catch (error) {
            console.warn('Direct mobile fetch failed, trying proxy...', error);
            try {
               mobileBlob = await downloadViaCorsProxy(resolvedImageUrl);
            } catch (proxyError) {
               console.warn('Proxy mobile fetch failed, opening original image...', proxyError);
            }
         }

         if (mobileBlob) {
            if (navigator.share) {
               try {
                  const file = new File([mobileBlob], filename, { type: mobileBlob.type || 'image/jpeg' });

                  if (!navigator.canShare || navigator.canShare({ files: [file] })) {
                     await navigator.share({
                        files: [file],
                        title: 'Tải ảnh',
                        text: 'Lưu ảnh vào thư viện thiết bị',
                     });
                     if (existingWindow) existingWindow.close();
                     return;
                  }
               } catch (error) {
                  console.warn('Web Share failed, falling back to image preview', error);
               }

               try {
                  await navigator.share({
                     title: 'Tải ảnh',
                     text: 'Mở ảnh để lưu về máy',
                     url: resolvedImageUrl
                  });
                  if (existingWindow) existingWindow.close();
                  return;
               } catch (error) {
                  console.warn('URL share failed, falling back to image preview', error);
               }
            }

            openImageForDeviceSave(mobileBlob, resolvedImageUrl);
            return;
         }

         if (existingWindow) {
            existingWindow.location.href = resolvedImageUrl;
         } else {
            if (isStandaloneMode) {
               window.location.href = resolvedImageUrl;
            } else {
               window.open(resolvedImageUrl, '_blank', 'noopener,noreferrer');
            }
         }
         return;
      }

      // 3. Desktop standard flow: Try direct fetch first (if CORS allowed on origin)
      try {
         const blob = await downloadRemoteBlob(resolvedImageUrl);
         triggerLocalDownload(blob, filename);
         if (existingWindow) existingWindow.close();
         return;
      } catch (error) {
         console.warn('Direct fetch failed (likely CORS), trying via CORS proxy (corsproxy.io)...', error);
      }

      // 4. Try via corsproxy.io
      try {
         const blob = await downloadViaCorsProxy(resolvedImageUrl);
         triggerLocalDownload(blob, filename);
         if (existingWindow) existingWindow.close();
         return;
      } catch (error) {
         console.error('CORS proxy fetch failed:', error);
      }

      // 6. Ultimate Fallback: Open in new/existing tab for manual right-click save
      if (existingWindow) {
         existingWindow.location.href = resolvedImageUrl;
      } else {
         window.open(resolvedImageUrl, '_blank', 'noopener,noreferrer');
      }
   };

   const fetchTuitionNoticeImageUrl = async () => {
      if (!parentData?.latestFee || !parentData?.student?.mahv) return null;

      const noticeId = String(parentData.latestFee.mahd || '').trim();
      const studentId = String(parentData.student.mahv || '').trim();
      const candidateUrls = [];

      if (parentData.latestFee.image_url) {
         candidateUrls.push(parentData.latestFee.image_url);
      }

      if (noticeId) {
         const { data: noticeData, error: noticeError } = await supabase
            .from('tbl_thongbao')
            .select('image_url')
            .eq('mahv', studentId)
            .eq('mahd', noticeId)
            .maybeSingle();

         if (noticeError) {
            console.warn('Không đọc được image_url từ tbl_thongbao:', noticeError);
         }
         if (noticeData?.image_url) {
            candidateUrls.push(noticeData.image_url);
         }
      }

      const pickLatestImage = (messages = []) => {
         const validMessages = messages
            .filter(msg => msg?.image_url)
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
         if (validMessages.length === 0) return null;

         const exactMatch = noticeId
            ? validMessages.find(msg => String(msg.content || '').includes(noticeId))
            : null;

         if (exactMatch) return exactMatch.image_url;

         const tuitionMatch = validMessages.find(msg => {
            const normalized = String(msg.content || '').toLowerCase();
            return normalized.includes('hoc phi') || normalized.includes('học phí');
         });

         return tuitionMatch?.image_url || validMessages[0].image_url || null;
      };

      let imageUrl = pickLatestImage(chatMessages);
      if (imageUrl) {
         candidateUrls.push(imageUrl);
      }

      if (!imageUrl) {
         let query = supabase
            .from('hv_messages')
            .select('content, image_url, created_at')
            .eq('mahv', parentData.student.mahv)
            .not('image_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(20);

         if (noticeId) {
            query = query.ilike('content', `%${noticeId}%`);
         }

         const { data, error } = await query;
         if (error) throw error;
         imageUrl = pickLatestImage(data || []);
         if (imageUrl) {
            candidateUrls.push(imageUrl);
         }
      }

      if (!imageUrl && noticeId) {
         const { data, error } = await supabase
            .from('hv_messages')
            .select('content, image_url, created_at')
            .eq('mahv', parentData.student.mahv)
            .not('image_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(50);

         if (error) throw error;
         imageUrl = pickLatestImage(data || []);
         if (imageUrl) {
            candidateUrls.push(imageUrl);
         }
      }

      return await getFirstWorkingImageUrl(candidateUrls);
   };

   const handleOpenTuitionNoticeImage = async () => {
      setLoadingTuitionNoticeImage(true);
      try {
         const imageUrl = await fetchTuitionNoticeImageUrl();
         if (imageUrl) {
            setPreviewImage(imageUrl);
         } else {
            alert('Chưa tìm thấy hình thông báo thu học phí trong mục Liên lạc GV.');
         }
      } catch (error) {
         console.error('Error loading tuition notice image:', error);
         alert('Không tải được hình thông báo thu học phí. Vui lòng thử lại sau.');
      } finally {
         setLoadingTuitionNoticeImage(false);
      }
   };

   const handleDownloadTuitionImage = async () => {
      // Open a blank window synchronously immediately on click to prevent popup blockers on laptop/desktop
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      let newWindow = null;
      if (!isMobileDevice) {
         newWindow = window.open('', '_blank');
      }

      setLoadingTuitionNoticeImage(true);
      try {
         const imageUrl = await fetchTuitionNoticeImageUrl();
         if (imageUrl) {
            await handleDownloadImage(imageUrl, `thong-bao-hoc-phi-${parentData.student.mahv}.jpg`, newWindow);
         } else {
            if (newWindow) newWindow.close();
            alert('Chưa tìm thấy hình thông báo thu học phí trong mục Liên lạc GV.');
         }
      } catch (error) {
         if (newWindow) newWindow.close();
         console.error('Error downloading tuition notice image:', error);
         alert('Không tải được hình thông báo thu học phí. Vui lòng thử lại sau.');
      } finally {
         setLoadingTuitionNoticeImage(false);
      }
   };

   const fetchInvoiceImageUrl = async () => {
      if (!parentData?.student?.mahv) return null;

      const studentId = String(parentData.student.mahv || '').trim();
      const invoices = parentData?.invoices || [];
      const activeNotice = tuitionStatus?.activeNotice || parentData?.latestFee || null;
      const noticePeriod = normalizeFeePeriod(activeNotice);
      const invoiceRecord = (() => {
         if (tuitionStatus?.isPaid && tuitionStatus?.record) return tuitionStatus.record;
         if (noticePeriod) {
            const matchedInvoice = invoices.find(inv => normalizeFeePeriod(inv) === noticePeriod);
            if (matchedInvoice) return matchedInvoice;
         }
         return invoices[0] || null;
      })();

      if (!invoiceRecord) return null;

      const invoiceId = String(invoiceRecord.mahd || '').trim();
      const candidateUrls = [];

      if (invoiceRecord.image_url) {
         candidateUrls.push(invoiceRecord.image_url);
      }

      const { data: invoiceRows, error: invoiceRowsError } = await supabase
         .from('tbl_hd')
         .select('mahd, image_url, thoiluong, ngaylap, ngaybatdau')
         .eq('mahv', studentId)
         .order('ngaylap', { ascending: false })
         .limit(20);

      if (invoiceRowsError) {
         console.warn('Không đọc được danh sách image_url từ tbl_hd:', invoiceRowsError);
      }

      const validInvoiceRows = (invoiceRows || [])
         .filter(row => row?.image_url)
         .sort(compareFeeRecordsDesc);
      const exactInvoiceRow = invoiceId
         ? validInvoiceRows.find(row => String(row.mahd || '').trim() === invoiceId)
         : null;
      if (exactInvoiceRow?.image_url) {
         candidateUrls.push(exactInvoiceRow.image_url);
      }

      if (noticePeriod) {
         const periodMatchedRow = validInvoiceRows.find(row => normalizeFeePeriod(row) === noticePeriod);
         if (periodMatchedRow?.image_url) {
            candidateUrls.push(periodMatchedRow.image_url);
         }
      }

      if (invoiceId) {
         const { data: invoiceData, error: invoiceError } = await supabase
            .from('tbl_hd')
            .select('image_url')
            .eq('mahv', studentId)
            .eq('mahd', invoiceId)
            .maybeSingle();

         if (invoiceError) {
            console.warn('Không đọc được image_url từ tbl_hd:', invoiceError);
         }
         if (invoiceData?.image_url) {
            candidateUrls.push(invoiceData.image_url);
         }
      }

      if (!invoiceId) {
         return await getFirstWorkingImageUrl(candidateUrls);
      }

      const pickExactInvoiceImage = (messages = []) => {
         const validMessages = messages
            .filter(msg => msg?.image_url)
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
         if (validMessages.length === 0) return null;

         const exactMatch = validMessages.find(msg => String(msg.content || '').includes(invoiceId));
         return exactMatch?.image_url || null;
      };

      let imageUrl = pickExactInvoiceImage(chatMessages);
      if (imageUrl) {
         candidateUrls.push(imageUrl);
      }

      if (!imageUrl) {
         const { data, error } = await supabase
            .from('hv_messages')
            .select('content, image_url, created_at')
            .eq('mahv', studentId)
            .not('image_url', 'is', null)
            .ilike('content', `%${invoiceId}%`)
            .order('created_at', { ascending: false })
            .limit(20);
         if (error) throw error;
         imageUrl = pickExactInvoiceImage(data || []);
         if (imageUrl) {
            candidateUrls.push(imageUrl);
         }
      }

      if (!imageUrl) {
         const { data, error } = await supabase
            .from('hv_messages')
            .select('content, image_url, created_at')
            .eq('mahv', studentId)
            .not('image_url', 'is', null)
            .ilike('content', `%${invoiceId}%`)
            .order('created_at', { ascending: false })
            .limit(50);

         if (error) throw error;
         imageUrl = pickExactInvoiceImage(data || []);
         if (imageUrl) {
            candidateUrls.push(imageUrl);
         }
      }

      return await getFirstWorkingImageUrl(candidateUrls);
   };

   const handleOpenInvoiceImage = async () => {
      setLoadingInvoiceImage(true);
      try {
         const imageUrl = await fetchInvoiceImageUrl();
         if (imageUrl) {
            setPreviewImage(imageUrl);
         } else {
            alert('Chưa tìm thấy hình hóa đơn học phí trong mục Liên lạc GV.');
         }
      } catch (error) {
         console.error('Error loading invoice image:', error);
         alert('Không tải được hình hóa đơn học phí. Vui lòng thử lại sau.');
      } finally {
         setLoadingInvoiceImage(false);
      }
   };

   const handleDownloadInvoiceImage = async () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      let newWindow = null;
      if (!isMobileDevice) {
         newWindow = window.open('', '_blank');
      }

      setLoadingInvoiceImage(true);
      try {
         const imageUrl = await fetchInvoiceImageUrl();
         if (imageUrl) {
            const invoiceId = tuitionStatus?.record?.mahd || parentData?.student?.mahv || 'invoice';
            await handleDownloadImage(imageUrl, `hoa-don-hoc-phi-${invoiceId}.jpg`, newWindow);
         } else {
            if (newWindow) newWindow.close();
            alert('Chưa tìm thấy hình hóa đơn học phí trong mục Liên lạc GV.');
         }
      } catch (error) {
         if (newWindow) newWindow.close();
         console.error('Error downloading invoice image:', error);
         alert('Không tải được hình hóa đơn học phí. Vui lòng thử lại sau.');
      } finally {
         setLoadingInvoiceImage(false);
      }
   };

   const formatMonthYear = (dateStr) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
   };

   const getFeePeriodLabel = (feeRecord) => {
      if (!feeRecord) return '';
      return feeRecord.thoiluong || feeRecord.thang || formatMonthYear(feeRecord.ngaybatdau || feeRecord.ngaylap);
   };

   const normalizeFeePeriod = (feeRecord) => {
      return getFeePeriodLabel(feeRecord).trim().toLowerCase();
   };

   const tuitionStatus = (() => {
      const latestNotify = parentData?.latestFee;
      const invoices = parentData?.invoices || [];
      const latestInv = [...invoices].sort(compareRecordTimeDesc)[0] || null;
      const currentYearMonth = `${getVietnamDateParts().year}-${getVietnamDateParts().month}`;
      const currentDateIso = getVietnamDateString();
      const overdueGraceDays = Math.max(0, parseInt(config?.ngayquahan || 0, 10));

      if (!latestNotify && !latestInv) return { text: 'Thanh toán', isPaid: true, isOverdue: false, statusLabel: 'Đã thanh toán' };

      if (!latestNotify && latestInv) {
         const monthText = getFeePeriodLabel(latestInv);
         return {
            text: `Học phí đã thanh toán tháng ${monthText}`,
            isPaid: true,
            isOverdue: false,
            statusLabel: 'Đã thanh toán',
            record: latestInv,
            activeNotice: null
         };
      }

      const latestNotifyTime = getRecordTime(latestNotify);
      const latestInvTime = getRecordTime(latestInv);

      if (latestInv && latestInvTime > latestNotifyTime) {
         const monthText = getFeePeriodLabel(latestInv);
         return {
            text: `Học phí đã thanh toán tháng ${monthText}`,
            isPaid: true,
            isOverdue: false,
            statusLabel: 'Đã thanh toán',
            record: latestInv,
            activeNotice: null
         };
      }

      const noticePeriod = normalizeFeePeriod(latestNotify);
      const matchedInvoice = invoices.find(inv => normalizeFeePeriod(inv) === noticePeriod) || null;
      const isPaid = Boolean(matchedInvoice);
      const monthText = getFeePeriodLabel(latestNotify);
      const feeYearMonth = getLatestFeePeriodKey(latestNotify) || getYearMonthKey(latestNotify.ngaybatdau || latestNotify.ngaylap);
      const isCurrentOrPastFee = feeYearMonth ? feeYearMonth <= currentYearMonth : true;
      const dueBaseDate = getFeeDueBaseDate(latestNotify);
      const overdueStartDate = dueBaseDate ? addDaysToDateString(dueBaseDate, overdueGraceDays) : '';
      const isOverdue = !isPaid && isCurrentOrPastFee && overdueStartDate ? overdueStartDate < currentDateIso : false;

      if (isPaid) {
         return {
            text: `Học phí đã thanh toán tháng ${monthText}`,
            isPaid: true,
            isOverdue: false,
            statusLabel: 'Đã thanh toán',
            record: matchedInvoice || latestNotify,
            activeNotice: latestNotify
         };
      }

      return {
         text: isOverdue ? `Học phí quá hạn thanh toán tháng ${monthText}` : `Học phí cần thanh toán tháng ${monthText}`,
         isPaid: false,
         isOverdue,
         statusLabel: isOverdue ? 'Quá hạn' : (latestNotify.status || 'Chờ thanh toán'),
         record: latestNotify,
         activeNotice: latestNotify,
         overdueStartDate
      };
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

         if (data?.[0]) {
            await triggerPushNotification(supabase, 'dangkyngoaikhoa', data[0]);
         }

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

      let totalUnread = 0;

      // 1. Fetch Chat Unreads
      const { data: chatData } = await supabase.from('hv_messages').select('id, manv, description').eq('mahv', parentData.student.mahv).is('is_read', false);
      let chatCount = 0;
      if (chatData) {
         chatData.forEach(d => {
            const isTeacher = Boolean(d.manv && d.manv.trim() !== '' && d.description !== 'PH');
            if (isTeacher) chatCount++;
         });
         setUnreadChatCount(chatCount);
         totalUnread += chatCount;
      }

      // 2. Fetch Notices, Menu, Ngoai Khoa Unreads
      const { data: generalNotices } = await supabase.from('tbl_thongbao').select('id, ngaylap').eq('mahv', parentData.student.mahv).order('ngaylap', { ascending: false }).limit(1);
      const { data: classAnnouncements } = await supabase.from('class_announcements').select('id, created_at, title').eq('malop', parentData.student.malop).eq('approved', true).order('created_at', { ascending: false }).limit(20);

      // Notices (General + Class excluding Menu/NgoaiKhoa)
      const lastNoticeTime = parseInt(localStorage.getItem(`last_notice_time_${parentData.student.mahv}`) || '0');
      const latestGenNotice = generalNotices?.[0];
      const classNotices = (classAnnouncements || []).filter(n => n.title !== 'THỰC ĐƠN' && n.title !== 'NGOẠI KHÓA' && n.title !== 'CHƯƠNG TRÌNH HỌC');
      const latestClassNotice = classNotices?.[0];

      const currentLatestNoticeTime = Math.max(
         0, /* General notices excluded */
         latestClassNotice ? new Date(latestClassNotice.created_at).getTime() : 0
      );
      if (currentLatestNoticeTime > lastNoticeTime) {
         setUnreadNotices(1);
         totalUnread += 1;
      } else {
         setUnreadNotices(0);
      }

      // Menu
      const lastMenuTime = parseInt(localStorage.getItem(`last_menu_time_${parentData.student.mahv}`) || '0');
      const latestMenu = (classAnnouncements || []).find(n => n.title === 'THỰC ĐƠN');
      const currentLatestMenuTime = latestMenu ? new Date(latestMenu.created_at).getTime() : 0;
      if (currentLatestMenuTime > lastMenuTime) {
         setUnreadMenu(1);
         totalUnread += 1;
      } else {
         setUnreadMenu(0);
      }

      // Ngoai Khoa
      const lastNgoaiKhoaTime = parseInt(localStorage.getItem(`last_ngoaikhoa_time_${parentData.student.mahv}`) || '0');
      const latestNgoaiKhoa = getActiveNgoaiKhoaAnnouncements(classAnnouncements || [])[0];
      const currentLatestNgoaiKhoaTime = latestNgoaiKhoa ? new Date(latestNgoaiKhoa.created_at).getTime() : 0;
      if (currentLatestNgoaiKhoaTime > lastNgoaiKhoaTime) {
         setUnreadNgoaiKhoa(1);
         totalUnread += 1;
      } else {
         setUnreadNgoaiKhoa(0);
      }

      // Chuong trinh hoc
      const lastChuongTrinhHocTime = parseInt(localStorage.getItem(`last_chuongtrinhhoc_time_${parentData.student.mahv}`) || '0');
      const latestChuongTrinhHoc = (classAnnouncements || []).find(n => n.title === 'CHƯƠNG TRÌNH HỌC');
      const currentLatestChuongTrinhHocTime = latestChuongTrinhHoc ? new Date(latestChuongTrinhHoc.created_at).getTime() : 0;
      if (currentLatestChuongTrinhHocTime > lastChuongTrinhHocTime) {
         setUnreadChuongTrinhHoc(1);
         totalUnread += 1;
      } else {
         setUnreadChuongTrinhHoc(0);
      }

      // 3. Fetch Health Unreads
      const lastHealthTime = parseInt(localStorage.getItem(`last_health_time_${parentData.student.mahv}`) || '0');
      const { data: latestHealth } = await supabase.from('suckhoedinhky').select('id, ngay').eq('mahv', parentData.student.mahv).order('ngay', { ascending: false }).limit(1).maybeSingle();
      const currentLatestHealthTime = latestHealth ? new Date(latestHealth.ngay).getTime() : 0;
      if (currentLatestHealthTime > lastHealthTime) {
         setUnreadHealth(1);
         totalUnread += 1;
      } else {
         setUnreadHealth(0);
      }

      // 4. Fetch Tuition (latestFee) Unreads
      const lastFeeTime = parseInt(localStorage.getItem(`last_fee_time_${parentData.student.mahv}`) || '0');
      const latestFee = parentData?.latestFee;
      if (latestFee) {
         const currentFeeTime = new Date(latestFee.ngaylap).getTime();
         if (currentFeeTime > lastFeeTime) {
            // Only count as unread if it hasn't been paid (if we can detect that)
            // For now, any new fee notification counts as +1
            totalUnread += 1;
         }
      }

      syncAppBadge(totalUnread);
   };

   useEffect(() => {
      if (!parentData) return;

      refreshLatestFeeData();
   }, [parentData?.student?.mahv, refreshLatestFeeData]);

   useEffect(() => {
      if (!parentData) return;

      const refreshAnnouncementsForCurrentTab = async () => {
         if (['notices-tab', 'menu-tab', 'chuongtrinhhoc-tab'].includes(parentTab)) {
            await fetchParentNotices();
         }
         if (parentTab === 'ngoaikhoa-tab') {
            await fetchNgoaiKhoaAnnouncements();
         }
      };

      const refreshHealthForCurrentTab = async () => {
         if (parentTab === 'health-tab') {
            await fetchHealthHistory();
         }
      };

      const unreadChan = supabase.channel(`parent_unread_${parentData.student.mahv}`)
         .on('postgres_changes', { event: '*', schema: 'public', table: 'hv_messages', filter: `mahv=eq.${parentData.student.mahv}` }, () => { fetchUnreads(); }).subscribe();

      fetchUnreads();

      const noticeChan = supabase.channel(`parent_notices_${parentData.student.mahv}`)
         .on('postgres_changes', { event: '*', schema: 'public', table: 'tbl_thongbao', filter: `mahv=eq.${parentData.student.mahv}` }, async (payload) => {
            await refreshLatestFeeData();
            await fetchUnreads();
            await refreshAnnouncementsForCurrentTab();
            if (payload.eventType !== 'INSERT') return;
            const isTuition = payload.new.tieude?.toLowerCase().includes('học phí');
            showNotification(isTuition ? 'Thông báo học phí' : 'Thông báo mới từ nhà trường', payload.new.tieude || 'Bạn có một thông báo mới');
         })
         .on('postgres_changes', { event: '*', schema: 'public', table: 'tbl_hd', filter: `mahv=eq.${parentData.student.mahv}` }, async () => {
            await refreshLatestFeeData();
            await fetchUnreads();
         })
         .on('postgres_changes', { event: '*', schema: 'public', table: 'class_announcements', filter: `malop=eq.${parentData.student.malop}` }, async (payload) => {
            await fetchUnreads();
            await refreshAnnouncementsForCurrentTab();
            const approvedNow = payload.new?.approved !== false;
            const justApproved = payload.eventType === 'UPDATE' && payload.old?.approved === false && payload.new?.approved === true;
            if (payload.eventType === 'INSERT' && !approvedNow) return;
            if (payload.eventType !== 'INSERT' && !justApproved) return;
            if (isNgoaiKhoaCloseAnnouncement(payload.new)) return;
            const title = payload.new.title === 'THỰC ĐƠN' ? 'Thực đơn mới' : (payload.new.title === 'NGOẠI KHÓA' ? 'Hoạt động ngoại khóa mới' : (payload.new.title === 'CHƯƠNG TRÌNH HỌC' ? 'Chương trình học mới' : 'Bảng tin lớp mới'));
            showNotification(title, payload.new.content || 'Xem chi tiết trong ứng dụng');
         })
         .on('postgres_changes', { event: '*', schema: 'public', table: 'suckhoedinhky', filter: `mahv=eq.${parentData.student.mahv}` }, async (payload) => {
            await fetchUnreads();
            await refreshHealthForCurrentTab();
            if (payload.eventType !== 'INSERT') return;
            showNotification('Cập nhật sức khỏe', 'Bé vừa có thông tin sức khỏe mới');
         })
         .on('postgres_changes', { event: '*', schema: 'public', table: 'tbl_hv', filter: `mahv=eq.${parentData.student.mahv}` }, async (payload) => {
            setParentData(prev => {
               if (!prev?.student) return prev;
               return {
                  ...prev,
                  student: {
                     ...prev.student,
                     ...payload.new
                  }
               };
            });
            await refreshHealthForCurrentTab();
         })
         .on('postgres_changes', { event: '*', schema: 'public', table: 'dangkyngoaikhoa', filter: `mahv=eq.${parentData.student.mahv}` }, async (payload) => {
            if (parentTab === 'ngoaikhoa-tab') {
               await fetchNgoaiKhoaRegistration();
            }
            if (payload.eventType === 'INSERT' && payload.new?.codangky !== undefined) {
               showNotification('Ngoại khóa', payload.new.codangky ? 'Đăng ký ngoại khóa đã được ghi nhận' : 'Phản hồi không tham gia ngoại khóa đã được ghi nhận');
            }
         })
         .subscribe();

      // If we are on the menu, we can still subscribe to changes but we don't fetch full tab data
      if (parentTab === 'menu') {
         // Menu specific logic if any
      }

      // Rest of the tab-specific data fetching
      const fetchChatDocs = async () => {
         const { data } = await supabase.from('documents').select('*').eq('mahv', parentData.student.mahv).order('created_at', { ascending: false });
         if (data) setChatDocuments((data || []).filter(doc => doc.category !== tuitionTransferProofCategory));
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
      if (parentTab === 'notices-tab' || parentTab === 'menu-tab' || parentTab === 'chuongtrinhhoc-tab') fetchParentNotices();
      if (parentTab === 'attendance-tab') fetchMonthlyAttendance();
      if (parentTab === 'health-tab') fetchHealthHistory();
      if (parentTab === 'ngoaikhoa-tab') {
         fetchNgoaiKhoaAnnouncements();
         fetchNgoaiKhoaRegistration();
      }



      const channel = supabase.channel(`parent_chat_${parentData.student.mahv}`)
         .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hv_messages', filter: `mahv=eq.${parentData.student.mahv}` }, (payload) => {
            const isMe = payload.new.description === 'PH';
            if (!isMe) {
               showNotification('Tin nhắn mới từ nhà trường', payload.new.content || 'Bạn có một tệp đính kèm mới');
            }
            setChatMessages(prev => {
               const exists = prev.some(m => m.id === payload.new.id);
               if (exists) return prev;
               setTimeout(() => scrollParentChatToBottom('smooth'), 100);
               return [...prev, payload.new];
            });
         })
         .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hv_messages', filter: `mahv=eq.${parentData.student.mahv}` }, (payload) => {
            setChatMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
         }).subscribe();

      return () => {
         if (channel) supabase.removeChannel(channel);
         supabase.removeChannel(unreadChan);
         supabase.removeChannel(noticeChan);
      };
   }, [parentData?.student?.mahv, parentData?.student?.malop, parentTab, calendarDate]);

   useEffect(() => {
      if (!parentData) return;

      if (parentTab === 'chat-tab') {
         setShowChatInfo(true);
      }

      const markAsRead = async () => {
         if (parentTab === 'chat-tab') {
            setUnreadChatCount(0);
            if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(console.error);
            const { data: toUpdate } = await supabase.from('hv_messages').select('id, manv, description').eq('mahv', parentData.student.mahv).is('is_read', false);
            if (toUpdate) {
               const ids = toUpdate.filter(d => Boolean(d.manv && d.manv.trim() !== '' && d.description !== 'PH')).map(d => d.id);
               if (ids.length > 0) await supabase.from('hv_messages').update({ is_read: true }).in('id', ids);
            }
         } else if (parentTab === 'notices-tab') {
            if (parentNotices.length > 0) {
               const latest = parentNotices.find(n => n.type === 'class' && n.title !== 'THỰC ĐƠN' && n.title !== 'NGOẠI KHÓA' && n.title !== 'CHƯƠNG TRÌNH HỌC');
               if (latest) {
                  const time = new Date(latest.date).getTime();
                  localStorage.setItem(`last_notice_time_${parentData.student.mahv}`, String(time));
               }
            }
            setUnreadNotices(0);
         } else if (parentTab === 'menu-tab') {
            const latest = parentNotices.find(n => n.title === 'THỰC ĐƠN');
            if (latest) {
               const time = new Date(latest.date).getTime();
               localStorage.setItem(`last_menu_time_${parentData.student.mahv}`, String(time));
            }
            setUnreadMenu(0);
         } else if (parentTab === 'ngoaikhoa-tab') {
            let latest = ngoaiKhoaAnnouncements[0];
            if (!latest) {
               const announcements = await fetchClassAnnouncementsByTitle('NGOẠI KHÓA', 1);
               latest = announcements[0];
            }
            if (latest) {
               const time = new Date(latest.date).getTime();
               localStorage.setItem(`last_ngoaikhoa_time_${parentData.student.mahv}`, String(time));
            }
            setUnreadNgoaiKhoa(0);
         } else if (parentTab === 'chuongtrinhhoc-tab') {
            const latest = parentNotices.find(n => n.title === 'CHƯƠNG TRÌNH HỌC');
            if (latest) {
               const time = new Date(latest.date).getTime();
               localStorage.setItem(`last_chuongtrinhhoc_time_${parentData.student.mahv}`, String(time));
            }
            setUnreadChuongTrinhHoc(0);
         } else if (parentTab === 'health-tab') {
            if (healthHistory.length > 0) {
               const time = new Date(healthHistory[0].ngay).getTime();
               localStorage.setItem(`last_health_time_${parentData.student.mahv}`, String(time));
            }
            setUnreadHealth(0);
            fetchUnreads();
         } else if (parentTab === 'fee-tab') {
            const latestFee = parentData?.latestFee;
            if (latestFee) {
               const time = new Date(latestFee.ngaylap).getTime();
               localStorage.setItem(`last_fee_time_${parentData.student.mahv}`, String(time));
            }
            fetchUnreads();
         }
      };
      markAsRead();
   }, [parentTab, parentData?.student?.mahv, parentData?.latestFee?.ngaylap, parentNotices, ngoaiKhoaAnnouncements, healthHistory]);

   useEffect(() => {
      if (parentTab === 'chat-tab') {
         // chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
         // Handled inside fetchChatMessages or new message logic
      }
   }, [parentTab]);

   useEffect(() => {
      if (parentTab !== 'chat-tab') {
         document.documentElement.style.removeProperty('--parent-chat-viewport-height');
         return undefined;
      }

      const updateChatViewportHeight = () => {
         const viewportHeight = window.visualViewport?.height || window.innerHeight;
         document.documentElement.style.setProperty('--parent-chat-viewport-height', `${Math.round(viewportHeight)}px`);
      };

      updateChatViewportHeight();

      const viewport = window.visualViewport;
      window.addEventListener('resize', updateChatViewportHeight);
      viewport?.addEventListener('resize', updateChatViewportHeight);
      viewport?.addEventListener('scroll', updateChatViewportHeight);

      return () => {
         window.removeEventListener('resize', updateChatViewportHeight);
         viewport?.removeEventListener('resize', updateChatViewportHeight);
         viewport?.removeEventListener('scroll', updateChatViewportHeight);
         document.documentElement.style.removeProperty('--parent-chat-viewport-height');
      };
   }, [parentTab]);

   useEffect(() => {
      resizeChatTextarea(chatInputRef.current, 3);
   }, [chatInput]);

   useEffect(() => {
      if (parentTab === 'menu') return;

      const resetTopPosition = () => {
         window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
         document.documentElement.scrollTop = 0;
         document.body.scrollTop = 0;
         document.getElementById('login-box-target')?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
         document.getElementById('parent-dashboard')?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      };

      resetTopPosition();
      const rafId = window.requestAnimationFrame(resetTopPosition);
      return () => window.cancelAnimationFrame(rafId);
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
         setChatMessages(prev => [...prev, data[0]]);
         await triggerPushNotification(supabase, 'hv_messages', data[0]);
         setChatInput('');
         setTimeout(() => scrollParentChatToBottom('smooth'), 100);
      }
   };

   const handleFileUpload = async (e, type) => {
      const inputElement = e.target;
      const fileInput = e.target.files[0];
      if (!fileInput || !parentData) return;

      setUploading(true);
      try {
         let file = fileInput;
         const isImageUpload = type === 'image' || type === 'transfer-proof';
         if (isImageUpload) {
            try { file = await compressImage(fileInput, 150); } catch (err) { console.error('Compression failed:', err); }
         }

         let finalUrl = '';
         if (config.r2_enabled) {
            finalUrl = await uploadToR2(file, config.r2_endpoint, config.r2_access_key_id, config.r2_secret_access_key, config.r2_bucket_name, config.r2_public_url);
         } else {
            const fileName = `${parentData.student.mahv}_${Date.now()}_${file.name}`;
            const folder = isImageUpload ? 'chat-images' : 'chat-files';
            const { error } = await supabase.storage.from('assets').upload(`${folder}/${fileName}`, file);
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(`${folder}/${fileName}`);
            finalUrl = publicUrl;
         }

         const newDoc = {
            mahv: parentData.student.mahv,
            name: file.name,
            category: type === 'transfer-proof' ? tuitionTransferProofCategory : (isImageUpload ? 'Ảnh' : 'Tài liệu'),
            file_url: finalUrl,
            mime_type: file.type
         };
         await supabase.from('documents').insert([newDoc]);
         if (type === 'transfer-proof') {
            alert('Đã upload ảnh chuyển khoản thành công.');
         }
      } catch (err) {
         alert('Lỗi: ' + err.message);
      } finally {
         setUploading(false);
         if (inputElement) inputElement.value = '';
      }
   };

   const handleTuitionTransferUploadClick = () => {
      if (uploading) return;
      tuitionTransferInputRef.current?.click();
   };

   const groupedParentClassNotices = groupAnnouncementsForDisplay(
      parentNotices.filter(n => n.type === 'class' && n.title !== 'THỰC ĐƠN' && n.title !== 'NGOẠI KHÓA' && n.title !== 'CHƯƠNG TRÌNH HỌC')
   );
   const groupedParentMenus = groupAnnouncementsForDisplay(parentNotices.filter(n => n.title === 'THỰC ĐƠN'));
   const groupedParentCurriculums = groupAnnouncementsForDisplay(parentNotices.filter(n => n.title === 'CHƯƠNG TRÌNH HỌC'));

   return (
      <div id="parent-dashboard" className={`parent-premium-mobile ${parentTab === 'chat-tab' ? 'chat-mode-active' : ''}`}>
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

                  {parentChildren.length > 1 && (
                     <div className="premium-children-section">
                        <div className="premium-section-title" style={{ padding: 0, marginBottom: '12px' }}>Các con của tôi</div>
                        <div className="premium-children-scroll" aria-label="Danh sách học sinh">
                           {parentChildren.map((child) => {
                              const isActive = child?.mahv === activeStudentId;
                              const childAvatar = child?.imgpath || child?.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(child?.tenhv || 'P')}&background=random`;
                              return (
                                 <button
                                    key={child?.mahv || child?.tenhv}
                                    type="button"
                                    className={`premium-child-card ${isActive ? 'active' : ''}`}
                                    onClick={() => handleSelectChild(child)}
                                    disabled={isSwitchingChild}
                                 >
                                    <span className="premium-child-check">
                                       {isActive && <CheckCircle2 size={16} />}
                                    </span>
                                    <div className="premium-child-avatar">
                                       <img src={childAvatar} alt={child?.tenhv || 'Bé'} />
                                    </div>
                                    <div className="premium-child-name">{child?.tenhv || 'Chưa cập nhật'}</div>
                                    <div className="premium-child-class">Lớp {child?.tenlop || child?.malop || 'Chưa xếp lớp'}</div>
                                 </button>
                              );
                           })}
                        </div>
                        {isSwitchingChild && (
                           <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>
                              <Loader2 size={15} className="spinner" />
                              Đang chuyển dữ liệu của bé...
                           </div>
                        )}
                     </div>
                  )}

                  {tuitionStatus.isOverdue && (
                     <div
                        onClick={() => setParentTab('fee-tab')}
                        style={{
                           background: 'linear-gradient(180deg, #ff4d8d 0%, #e11d48 52%, #9f1239 100%)',
                           color: 'white',
                           borderRadius: '28px',
                           padding: '24px 22px',
                           marginBottom: '20px',
                           minHeight: '50vh',
                           display: 'flex',
                           flexDirection: 'column',
                           justifyContent: 'center',
                           alignItems: 'center',
                           textAlign: 'center',
                           boxShadow: '0 22px 45px rgba(225, 29, 72, 0.38)',
                           border: '2px solid rgba(255,255,255,0.28)',
                           cursor: 'pointer'
                        }}
                     >
                        <div style={{ fontSize: 'clamp(1.1rem, 4vw, 1.5rem)', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '14px', opacity: 0.95 }}>Thông báo quá hạn</div>
                        <div style={{ fontSize: 'clamp(2rem, 8vw, 3.4rem)', fontWeight: 900, lineHeight: 1.1, marginBottom: '12px' }}>Chưa đóng học phí</div>
                        <div style={{ fontSize: 'clamp(1rem, 4.2vw, 1.35rem)', fontWeight: 700, maxWidth: '26rem', lineHeight: 1.5 }}>
                           {tuitionStatus.text}
                        </div>
                        <div style={{ marginTop: '16px', background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '999px', padding: '10px 18px', fontSize: 'clamp(0.95rem, 3.8vw, 1.1rem)', fontWeight: 800 }}>
                           Vui lòng hoàn tất thanh toán sau ngày {formatDateStringVi(tuitionStatus.overdueStartDate)}
                        </div>
                     </div>
                  )}

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
                        <div className="premium-service-icon-wrapper" style={{ position: 'relative' }}>
                           <Bell size={24} />
                           {unreadNotices > 0 && <span className="service-new-badge" style={{ background: '#ef4444', color: 'white', position: 'absolute', top: '-6px', right: '-12px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold', border: '1.5px solid white' }}>Mới</span>}
                        </div>
                        <span className="premium-service-label">Bảng tin<br />nhà trường</span>
                     </div>
                     <div className="premium-service-item" onClick={() => setParentTab('chuongtrinhhoc-tab')}>
                        <div className="premium-service-icon-wrapper" style={{ color: '#0ea5e9', position: 'relative' }}>
                           <FileText size={24} />
                           {unreadChuongTrinhHoc > 0 && <span className="service-new-badge" style={{ background: '#ef4444', color: 'white', position: 'absolute', top: '-6px', right: '-12px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold', border: '1.5px solid white' }}>Mới</span>}
                        </div>
                        <span className="premium-service-label">Chương trình<br />học</span>
                     </div>
                     <div className="premium-service-item" onClick={() => setParentTab('health-tab')}>
                        <div className="premium-service-icon-wrapper" style={{ color: '#ec4899', position: 'relative' }}>
                           <Heart size={24} />
                           {unreadHealth > 0 && <span className="service-new-badge" style={{ background: '#ef4444', color: 'white', position: 'absolute', top: '-6px', right: '-12px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold', border: '1.5px solid white' }}>Mới</span>}
                        </div>
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
                        <div className="premium-utility-icon-wrapper" style={{ color: '#10b981', position: 'relative' }}>
                           <Utensils size={24} />
                           {unreadMenu > 0 && <span className="service-new-badge" style={{ background: '#ef4444', color: 'white', position: 'absolute', top: '-6px', right: '-12px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold', border: '1.5px solid white' }}>Mới</span>}
                        </div>
                        <span className="premium-utility-label">Thực đơn</span>
                     </div>
                     <div className="premium-utility-item" onClick={() => setParentTab('ngoaikhoa-tab')}>
                        <div className="premium-utility-icon-wrapper" style={{ color: '#ec4899', position: 'relative' }}>
                           <Image size={24} />
                           {unreadNgoaiKhoa > 0 && <span className="service-new-badge" style={{ background: '#ef4444', color: 'white', position: 'absolute', top: '-6px', right: '-12px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold', border: '1.5px solid white' }}>Mới</span>}
                        </div>
                        <span className="premium-utility-label">Ngoại khóa</span>
                     </div>

                     <div className="premium-utility-item" onClick={() => setIsFeedbackModalOpen(true)}>
                        <div className="premium-utility-icon-wrapper" style={{ color: '#6366f1' }}><MessageCircle size={24} /></div>
                        <span className="premium-utility-label">Góp ý</span>
                     </div>
                     <div className="premium-utility-item" onClick={subscribeToPushNotifications}>
                        <div className="premium-utility-icon-wrapper" style={{ color: '#0ea5e9' }}><Bell size={24} /></div>
                        <span className="premium-utility-label">Bật thông báo</span>
                     </div>
                     <div className="premium-utility-item" onClick={handleCallHotline}>
                        <div className="premium-utility-icon-wrapper" style={{ color: '#14b8a6' }}><Phone size={24} /></div>
                        <span className="premium-utility-label">
                           Hotline
                           {hotlineNumber && <><br />{hotlineNumber}</>}
                        </span>
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
            <div className={parentTab === 'chat-tab' ? 'premium-tab-container chat-mode' : 'premium-tab-container'}>
               <div className="premium-tab-pane-header" style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', gap: parentTab === 'chat-tab' ? '10px' : '15px', padding: parentTab === 'chat-tab' ? 'calc(12px + env(safe-area-inset-top, 0px)) 12px 12px' : '20px 20px 10px', background: 'white', borderRadius: parentTab === 'chat-tab' ? '0' : '24px 24px 0 0', flexShrink: 0, width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
                  <button onClick={() => setParentTab('menu')} style={{ background: '#f2f2f7', border: 'none', width: '36px', height: '36px', minWidth: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1d1d1f', flexShrink: 0 }}>
                     <ArrowLeft size={20} />
                  </button>
                  <h2 style={{ margin: 0, fontSize: parentTab === 'chat-tab' ? '1rem' : '1.2rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                     {parentTab === 'notices-tab' ? 'Bảng tin' :
                        parentTab === 'attendance-tab' ? 'Điểm danh' :
                           parentTab === 'fee-tab' ? 'Học phí' :
                              parentTab === 'health-tab' ? 'Sức khỏe' :
                                 parentTab === 'menu-tab' ? 'Thực đơn' :
                                    parentTab === 'ngoaikhoa-tab' ? 'Ngoại khóa' :
                                       parentTab === 'chat-tab' ? 'Liên lạc GV' : ''}
                  </h2>
               </div>

               <div className="premium-tab-content-wrapper" style={{ padding: parentTab === 'chat-tab' ? '0' : '20px', background: 'white', borderRadius: parentTab === 'chat-tab' ? '0' : '0 0 24px 24px', minHeight: parentTab === 'chat-tab' ? '0' : 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column', flex: 1, width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'hidden' }}>
                  {parentTab === 'notices-tab' && (
                     <div id="notices-tab" className="parent-tab-content active" style={{ animation: 'contentFadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="notices-section">
                           <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', color: '#1e293b' }}>
                              <Bell size={20} className="text-primary" /> Thông báo từ nhà trường
                           </h3>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {groupedParentClassNotices.length > 0 ? groupedParentClassNotices.map((notice, idx) => (
                                 <div key={idx} style={{ background: 'white', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                       <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{new Date(notice.date).toLocaleDateString('vi-VN')}</span>
                                       <span style={{ fontSize: '0.75rem', background: notice.type === 'class' ? '#f5f3ff' : '#eff6ff', color: notice.type === 'class' ? '#8b5cf6' : '#2563eb', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                          {notice.type === 'class' ? 'Bảng tin lớp' : 'Thông báo'}
                                       </span>
                                    </div>
                                    <div style={{ color: '#1e293b', fontWeight: 600, fontSize: '1rem', marginBottom: '5px' }}>{notice.title || (notice.type === 'class' ? 'Thông báo từ lớp' : 'Thông báo học phí/Phát sinh')}</div>
                                    <div style={{ color: '#475569', fontSize: '0.9rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{notice.content}</div>

                                    {(notice._attachments || []).filter((attachment) => attachment.image_url).map((attachment, attachmentIndex) => (
                                       <div
                                          key={attachment.id || `${idx}-image-${attachmentIndex}`}
                                          style={{ marginTop: '10px', borderRadius: '8px', overflow: 'hidden', cursor: 'zoom-in', background: '#f1f5f9', border: '1px solid #e2e8f0' }}
                                          onClick={() => setPreviewImage(attachment.image_url)}
                                       >
                                          <img src={getDisplayUrl(attachment.image_url)} alt="announcement" style={{ width: '100%', maxHeight: '180px', objectFit: 'contain', display: 'block' }} referrerPolicy="no-referrer" />
                                       </div>
                                    ))}

                                    {(notice._attachments || []).filter((attachment) => attachment.file_url).map((attachment, attachmentIndex) => (
                                       <ChatMediaAttachment key={attachment.id || `${idx}-file-${attachmentIndex}`} fileUrl={attachment.file_url} fileName={attachment.file_name} mimeType={attachment.file_mime_type} />
                                    ))}
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
                              {groupedParentMenus.length > 0 ? groupedParentMenus.map((menu, idx) => (
                                 <div key={idx} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                    <div style={{ padding: '15px', borderBottom: '1px solid #f1f5f9', background: '#f0fdf4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                       <span style={{ fontWeight: 800, color: '#166534' }}>Thực đơn mới</span>
                                       <span style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>{new Date(menu.date).toLocaleDateString('vi-VN')}</span>
                                    </div>
                                    <div style={{ padding: '15px' }}>
                                       <p style={{ margin: '0 0 10px 0', color: '#475569', fontSize: '0.95rem' }}>{menu.content}</p>
                                       {(menu._attachments || []).filter((attachment) => attachment.image_url).map((attachment, attachmentIndex) => (
                                          <div
                                             key={attachment.id || `${idx}-menu-image-${attachmentIndex}`}
                                             style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', cursor: 'zoom-in', marginTop: attachmentIndex > 0 ? '10px' : '0' }}
                                             onClick={() => setPreviewImage(attachment.image_url)}
                                          >
                                             <img src={getDisplayUrl(attachment.image_url)} alt="menu" style={{ width: '100%', display: 'block' }} referrerPolicy="no-referrer" />
                                          </div>
                                       ))}
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
                              {ngoaiKhoaAnnouncements.length > 0 ? (
                                 ngoaiKhoaAnnouncements.slice(0, 1).map((item, idx) => (
                                    <div key={idx} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                       <div style={{ padding: '15px', borderBottom: '1px solid #f1f5f9', background: '#fdf2f8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontWeight: 800, color: '#be185d' }}>Thông tin ngoại khóa</span>
                                          <span style={{ fontSize: '0.8rem', color: '#be185d', fontWeight: 600 }}>{new Date(item.date).toLocaleDateString('vi-VN')}</span>
                                       </div>
                                       <div style={{ padding: '15px' }}>
                                          <div style={{
                                             color: '#475569',
                                             fontSize: '0.95rem',
                                             lineHeight: '1.7',
                                             whiteSpace: 'pre-wrap',
                                             background: '#f8fafc',
                                             padding: '15px',
                                             borderRadius: '12px',
                                             border: '1px solid #f1f5f9',
                                             marginBottom: '15px'
                                          }}>
                                             {item.content}
                                          </div>
                                          {item.image_url && (
                                             <div
                                                style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', cursor: 'zoom-in', marginBottom: '20px' }}
                                                onClick={() => setPreviewImage(item.image_url)}
                                             >
                                                <img src={getDisplayUrl(item.image_url)} alt="ngoaikhoa" style={{ width: '100%', display: 'block' }} referrerPolicy="no-referrer" />
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

                  {parentTab === 'chuongtrinhhoc-tab' && (
                     <div id="chuongtrinhhoc-tab" className="parent-tab-content active" style={{ animation: 'contentFadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="notices-section">
                           <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', color: '#0ea5e9' }}>
                              <FileText size={20} /> Chương trình học mới nhất
                           </h3>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                              {groupedParentCurriculums.length > 0 ? (
                                 groupedParentCurriculums.map((item, idx) => (
                                    <div key={idx} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                       <div style={{ padding: '15px', borderBottom: '1px solid #f1f5f9', background: '#f0f9ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontWeight: 800, color: '#0ea5e9' }}>Thông tin chương trình học</span>
                                          <span style={{ fontSize: '0.8rem', color: '#0ea5e9', fontWeight: 600 }}>{new Date(item.date).toLocaleDateString('vi-VN')}</span>
                                       </div>
                                       <div style={{ padding: '15px' }}>
                                          <div style={{
                                             color: '#475569',
                                             fontSize: '0.95rem',
                                             lineHeight: '1.7',
                                             whiteSpace: 'pre-wrap',
                                              marginBottom: (item._attachments || []).some((attachment) => attachment.image_url) ? '15px' : '0'
                                           }}>
                                              {item.content}
                                           </div>
                                           {(item._attachments || []).filter((attachment) => attachment.image_url).map((attachment, attachmentIndex) => (
                                              <div
                                                 key={attachment.id || `${idx}-curriculum-image-${attachmentIndex}`}
                                                 style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', cursor: 'zoom-in', marginTop: attachmentIndex > 0 ? '10px' : '0' }}
                                                 onClick={() => setPreviewImage(attachment.image_url)}
                                              >
                                                 <img src={getDisplayUrl(attachment.image_url)} alt="chuongtrinhhoc" style={{ width: '100%', display: 'block' }} referrerPolicy="no-referrer" />
                                              </div>
                                           ))}
                                        </div>
                                     </div>
                                  ))
                              ) : (
                                 <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #e2e8f0' }}>
                                    <FileText size={40} style={{ marginBottom: '15px', opacity: 0.3 }} />
                                    <p>Hiện chưa có chương trình học mới nào được cập nhật.</p>
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
                        {(parentData.latestFee || parentData.invoices.length > 0) ? (
                           <>
                              {!tuitionStatus.isPaid && !tuitionStatus.isOverdue && (
                                 <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '14px 16px', borderRadius: '16px', marginBottom: '16px', fontWeight: 700 }}>
                                    {tuitionStatus.text}
                                 </div>
                              )}
                              <div className="fee-card-premium" style={{ background: tuitionStatus.isPaid ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' : 'linear-gradient(135deg, #b71c1c 0%, #d32f2f 100%)', color: 'white', padding: '25px', borderRadius: '20px', marginBottom: '20px', boxShadow: tuitionStatus.isPaid ? '0 10px 15px -3px rgba(22, 163, 74, 0.3)' : '0 10px 15px -3px rgba(183, 28, 28, 0.3)' }}>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                                    <div>
                                       <div style={{ fontSize: '0.85rem', opacity: 0.9, marginBottom: '5px' }}>{tuitionStatus.text}</div>
                                       <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{tuitionStatus.record?.tongcong || parentData.latestFee?.tongcong || parentData.invoices?.[0]?.tongcong} <span style={{ fontSize: '1rem' }}>VNĐ</span></div>
                                    </div>
                                    <div style={{ background: 'rgba(255,255,255,0.2)', padding: '8px', borderRadius: '12px', height: 'fit-content' }}>
                                       <CreditCard size={24} />
                                    </div>
                                 </div>
                                 <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontSize: '0.85rem' }}>Trạng thái: <span style={{ fontWeight: 700, color: tuitionStatus.isOverdue ? '#fecdd3' : 'inherit' }}>{tuitionStatus.statusLabel}</span></div>
                                    {!tuitionStatus.isPaid && (
                                       <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                          <button onClick={handleOpenTuitionNoticeImage} disabled={loadingTuitionNoticeImage} style={{ background: 'white', color: '#b71c1c', border: 'none', padding: '8px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, cursor: loadingTuitionNoticeImage ? 'wait' : 'pointer', opacity: loadingTuitionNoticeImage ? 0.8 : 1 }}>{loadingTuitionNoticeImage ? 'Đang tải...' : 'Xem thông báo'}</button>
                                          <button onClick={handleDownloadTuitionImage} disabled={loadingTuitionNoticeImage} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid white', padding: '8px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, cursor: loadingTuitionNoticeImage ? 'wait' : 'pointer', opacity: loadingTuitionNoticeImage ? 0.8 : 1, display: 'flex', alignItems: 'center', gap: '4px' }}><Download size={14} /> Tải về</button>
                                          <button onClick={handleTuitionTransferUploadClick} disabled={uploading} style={{ background: '#fff7ed', color: '#9a3412', border: '1px solid #fdba74', padding: '8px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.8 : 1 }}>Upload ảnh chuyển khoản</button>
                                          <input ref={tuitionTransferInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'transfer-proof')} disabled={uploading} />
                                       </div>
                                    )}
                                    {tuitionStatus.isPaid && (
                                       <div style={{ display: 'flex', gap: '8px' }}>
                                          <button onClick={handleOpenInvoiceImage} disabled={loadingInvoiceImage} style={{ background: 'white', color: '#15803d', border: 'none', padding: '8px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, cursor: loadingInvoiceImage ? 'wait' : 'pointer', opacity: loadingInvoiceImage ? 0.8 : 1 }}>{loadingInvoiceImage ? 'Đang tải...' : 'Xem hóa đơn'}</button>
                                          <button onClick={handleDownloadInvoiceImage} disabled={loadingInvoiceImage} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid white', padding: '8px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, cursor: loadingInvoiceImage ? 'wait' : 'pointer', opacity: loadingInvoiceImage ? 0.8 : 1, display: 'flex', alignItems: 'center', gap: '4px' }}><Download size={14} /> Tải về</button>
                                       </div>
                                    )}
                                 </div>
                              </div>
                           </>
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
                     <div id="chat-tab" className="parent-tab-content active" style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', width: '100%', maxWidth: '100%', minWidth: 0, background: '#f8fafc', borderRadius: '0', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '12px', background: 'white', borderBottom: '1px solid #e2e8f0', zIndex: 99, width: '100%', maxWidth: '100%', minWidth: 0 }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                              <div style={{ position: 'relative' }}>
                                 <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                    {parentData.teacherInfo?.tennv?.charAt(0) || 'G'}
                                 </div>
                                 <span style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '12px', height: '12px', background: '#22c55e', border: '2px solid white', borderRadius: '50%' }}></span>
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                 <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>GV {parentData.teacherInfo?.tennv}</div>
                                 <div style={{ fontSize: '0.75rem', color: '#22c55e', fontWeight: 600 }}>Đang hoạt động</div>
                              </div>
                           </div>
                           <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                              <button style={{ padding: '8px', background: '#f1f5f9', border: 'none', borderRadius: '10px', color: '#64748b', minWidth: '36px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowChatInfo(!showChatInfo)}>
                                 {showChatInfo ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                              </button>
                           </div>
                        </div>

                        {showChatInfo && (
                           <div style={{ padding: '12px', background: '#fff7ed', borderBottom: '1px solid #fed7aa', width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
                              <div style={{ fontSize: '0.82rem', lineHeight: 1.55, color: '#9a3412', fontWeight: 600 }}>
                                 <div style={{ marginBottom: '6px' }}>Lưu ý: Khung giờ thuận tiện giáo viên trả lời tin nhắn là</div>
                                 <div>✅ trước 8h sáng</div>
                                 <div>✅ từ 11h-13h45</div>
                                 <div>✅ từ 16h-20h</div>
                              </div>
                           </div>
                        )}

                        <div ref={chatContainerRef} onScroll={handleChatScroll} style={{ flex: 1, minWidth: 0, overflowY: 'auto', overflowX: 'hidden', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
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
                              groupMessagesForDisplay(chatMessages.filter(m => !m.content?.includes('📬 [HÒM THƯ GÓP Ý - GỬI HIỆU TRƯỞNG]'))).map((m, idx) => {
                                 const isMe = m.description === 'PH';
                                 const senderName = getParentChatSenderName(m);
                                 const imageAttachments = (m._attachments || []).filter((attachment) => attachment.image_url);
                                 const fileAttachments = (m._attachments || []).filter((attachment) => attachment.file_url);
                                 return (
                                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '85%', minWidth: 0, alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                                       <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '4px', padding: '0 4px', fontWeight: 700 }}>
                                          {senderName}
                                       </div>
                                       {m.content && (
                                          <div style={{ padding: '10px 14px', borderRadius: isMe ? '16px 16px 2px 16px' : '16px 16px 16px 2px', background: isMe ? '#ec4899' : 'white', color: isMe ? 'white' : '#1e293b', boxShadow: isMe ? '0 4px 6px -1px rgba(236, 72, 153, 0.2)' : '0 1px 2px 0 rgba(0,0,0,0.05)', fontSize: '0.92rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere', maxWidth: '100%' }}>
                                             <ChatMessageContent content={m.content} isOwnMessage={isMe} />
                                          </div>
                                       )}
                                       {imageAttachments.map((attachment, attachmentIndex) => (
                                          <div
                                             key={attachment.id || `${idx}-image-${attachmentIndex}`}
                                             style={{ marginTop: '5px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', background: 'white', padding: '4px', maxWidth: '100%', cursor: 'zoom-in' }}
                                             onClick={() => setPreviewImage(attachment.image_url)}
                                          >
                                             <img src={getDisplayUrl(attachment.image_url)} alt="chat" style={{ maxWidth: '100%', maxHeight: '300px', display: 'block', borderRadius: '8px', objectFit: 'contain' }} referrerPolicy="no-referrer" />
                                          </div>
                                       ))}
                                       {fileAttachments.map((attachment, attachmentIndex) => (
                                          <ChatMediaAttachment
                                             key={attachment.id || `${idx}-file-${attachmentIndex}`}
                                             fileUrl={attachment.file_url}
                                             fileName={attachment.file_name}
                                             mimeType={attachment.file_mime_type}
                                             isOwnMessage={isMe}
                                          />
                                       ))}
                                       <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                          <button
                                             type="button"
                                             onClick={() => toggleChatReaction(m)}
                                             style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: m.reaction ? '#e11d48' : '#94a3b8' }}
                                             title={m.reaction ? 'Bỏ tim' : 'Thả tim'}
                                          >
                                             <Heart size={15} fill={m.reaction ? '#e11d48' : 'none'} />
                                          </button>
                                          <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>
                                             {formatMessageTimestamp(m.created_at)}
                                          </span>
                                       </div>
                                    </div>
                                 );
                              })
                           )}
                           <div ref={chatEndRef} />
                        </div>

                        <div style={{ padding: '12px calc(12px + env(safe-area-inset-right, 0px)) calc(12px + env(safe-area-inset-bottom, 0px)) calc(12px + env(safe-area-inset-left, 0px))', background: 'white', borderTop: '1px solid #e2e8f0', borderRadius: '0', zIndex: 99, width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
                           <form onSubmit={handleSendChat} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', maxWidth: '100%', minWidth: 0 }}>
                              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                 <label style={{ cursor: 'pointer', padding: '8px', color: '#64748b' }}>
                                    <Image size={22} />
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'image')} disabled={uploading} />
                                 </label>
                                 <label style={{ cursor: 'pointer', padding: '8px', color: '#64748b' }}>
                                    <Paperclip size={22} />
                                    <input type="file" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'file')} disabled={uploading} />
                                 </label>
                              </div>
                              <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                                 <textarea
                                    ref={chatInputRef}
                                    placeholder={uploading ? "Đang tải tệp lên..." : "Nhập tin nhắn..."}
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    disabled={uploading}
                                    rows={1}
                                    style={{ width: '100%', padding: '12px 15px', background: '#f1f5f9', border: 'none', borderRadius: '24px', fontSize: '16px', outline: 'none', resize: 'none', minHeight: '42px', maxHeight: 'calc(1.45em * 3 + 24px)', lineHeight: 1.45, fontFamily: 'inherit', overflowY: 'hidden' }}
                                 />
                              </div>
                              <button type="submit" disabled={(!chatInput.trim() && !uploading) || uploading} style={{ width: '42px', minWidth: '42px', height: '42px', borderRadius: '50%', background: '#ec4899', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(236, 72, 153, 0.3)', opacity: (!chatInput.trim() && !uploading) ? 0.5 : 1, flexShrink: 0 }}>
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
                     <button type="button" disabled={leaveSubmitting} onClick={() => setIsLeaveModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', color: '#64748b', opacity: leaveSubmitting ? 0.6 : 1, cursor: leaveSubmitting ? 'not-allowed' : 'pointer' }}>
                        <X size={18} />
                     </button>
                  </div>
                  <form onSubmit={handleLeaveSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                     <div style={{ display: 'flex', gap: '10px' }}>
                        <button type="button" disabled={leaveSubmitting} onClick={() => setLeaveType('today')} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: leaveType === 'today' ? '2px solid #ec4899' : '1px solid #e2e8f0', background: leaveType === 'today' ? '#fdf2f8' : 'white', fontWeight: 700, color: leaveType === 'today' ? '#ec4899' : '#64748b', opacity: leaveSubmitting ? 0.6 : 1, cursor: leaveSubmitting ? 'not-allowed' : 'pointer' }}>Hôm nay</button>
                        <button type="button" disabled={leaveSubmitting} onClick={() => setLeaveType('tomorrow')} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: leaveType === 'tomorrow' ? '2px solid #ec4899' : '1px solid #e2e8f0', background: leaveType === 'tomorrow' ? '#fdf2f8' : 'white', fontWeight: 700, color: leaveType === 'tomorrow' ? '#ec4899' : '#64748b', opacity: leaveSubmitting ? 0.6 : 1, cursor: leaveSubmitting ? 'not-allowed' : 'pointer' }}>Ngày mai</button>
                        <button type="button" disabled={leaveSubmitting} onClick={() => setLeaveType('custom')} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: leaveType === 'custom' ? '2px solid #ec4899' : '1px solid #e2e8f0', background: leaveType === 'custom' ? '#fdf2f8' : 'white', fontWeight: 700, color: leaveType === 'custom' ? '#ec4899' : '#64748b', opacity: leaveSubmitting ? 0.6 : 1, cursor: leaveSubmitting ? 'not-allowed' : 'pointer' }}>Khác</button>
                     </div>
                     {leaveType === 'custom' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                           <div>
                              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Từ ngày</label>
                              <input type="date" disabled={leaveSubmitting} value={leaveForm.from} onChange={e => setLeaveForm({ ...leaveForm, from: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }} />
                           </div>
                           <div>
                              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Đến ngày</label>
                              <input type="date" disabled={leaveSubmitting} value={leaveForm.to} onChange={e => setLeaveForm({ ...leaveForm, to: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }} />
                           </div>
                        </div>
                     )}
                     <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Lý do xin nghỉ</label>
                        <textarea disabled={leaveSubmitting} placeholder="Nhập lý do bé nghỉ (Sức khỏe, việc riêng...)" value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} rows="3" style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', resize: 'none' }} />
                     </div>
                     <button type="submit" disabled={leaveSubmitting} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', color: 'white', border: 'none', fontWeight: 800, fontSize: '1rem', boxShadow: '0 4px 6px -1px rgba(236, 72, 153, 0.4)', opacity: leaveSubmitting ? 0.7 : 1, cursor: leaveSubmitting ? 'not-allowed' : 'pointer' }}>{leaveSubmitting ? 'Đang gửi...' : 'Gửi đơn xin nghỉ'}</button>
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
                     <button type="submit" disabled={medicineSubmitting} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', color: 'white', border: 'none', fontWeight: 800, fontSize: '1rem', marginTop: '10px', opacity: medicineSubmitting ? 0.8 : 1, cursor: medicineSubmitting ? 'wait' : 'pointer' }}>
                        {medicineSubmitting ? <Loader2 size={20} className="spinner" /> : 'Gửi lời dặn'}
                     </button>
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
               <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', gap: '10px' }} onClick={e => e.stopPropagation()}>
                  <button
                     onClick={() => handleDownloadImage(previewImage, `tai-ve-${Date.now()}.jpg`)}
                     style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                     title="Tải về"
                  >
                     <Download size={20} />
                  </button>
                  <button
                     onClick={() => setPreviewImage(null)}
                     style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                     title="Đóng"
                  >
                     <X size={20} />
                  </button>
               </div>
               <img
                  src={getDisplayUrl(previewImage)}
                  alt="Preview"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }}
                  referrerPolicy="no-referrer"
                  onClick={e => e.stopPropagation()}
               />
            </div>
         )}
      </div>
   );
}

export default ParentPortal;
