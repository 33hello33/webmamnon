import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase';
import { useConfig } from '../ConfigContext';
import { deleteFromR2 } from '../utils/cloudflareR2';
import { triggerPushNotification } from '../utils/pushNotifications';
import FileDropZone from './FileDropZone';
import ChatMessageContent from './ChatMessageContent';
import ChatMediaAttachment from './ChatMediaAttachment';
import {
  MessageSquare,
  Send,
  Image as ImageIcon,
  Paperclip,
  Search,
  User,
  Users,
  Download,
  Trash2,
  MoreHorizontal,
  X,
  ChevronLeft,
  RefreshCw,
  FileText,
  File,
  Loader2,
  Heart,
  Calendar,
  Phone,
  MapPin,
  Hash,
  ArrowLeft,
  Clock,
  LayoutGrid,
  Pencil,
  Pin,
  Share2,
  Bell,
  Utensils,
  Upload
} from 'lucide-react';
import { mergeFileLists, splitFilesByKind, toFileArray, uploadManagedFile } from '../utils/managedUploads';
import './ChatManager.css';

const ChatManager = ({ currentUser }) => {
  const { config } = useConfig();

  const getClassName = (malop) => {
    if (!malop) return 'Chưa xếp lớp';
    const cls = classes.find(c => c.malop === malop || c.classid === malop);
    return cls ? (cls.tenlop || cls.classname || malop) : malop;
  };

  const getDisplayUrl = (url) => {
    if (!url) return '';
    // Sử dụng định dạng thumbnail của Google Drive với sz=w1000 để tránh lỗi ORB của trình duyệt
    if (url.includes('drive.google.com/')) {
      let id = '';
      if (url.includes('id=')) id = url.split('id=')[1]?.split('&')[0];
      else if (url.includes('/d/')) id = url.split('/d/')[1]?.split('/')[0];
      
      if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
    }
    return url;
  };

  const formatCurrency = (value) => {
    if (!value) return '';
    // Nếu là chuỗi đã có chữ (như "Miễn phí"), giữ nguyên
    if (/[a-zA-Z]/.test(value) && !value.includes('VNĐ')) return value;
    
    const num = value.toString().replace(/\D/g, '');
    if (!num) return value; // Trả về giá trị gốc nếu không có số
    return num.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };
  
  // Views
  const [view, setView] = useState('dashboard'); // 'dashboard' or 'chat'
  
  // Data
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [staffDirectory, setStaffDirectory] = useState({});
  const [students, setStudents] = useState([]);
  const [latestMessages, setLatestMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  
  // Filters
  const [searchParent, setSearchParent] = useState('');
  const [classFilter, setClassFilter] = useState('Tất cả');
  const [dateFilter, setDateFilter] = useState('Tuần này'); // 'Hôm nay', 'Tuần này', 'Tháng này', 'Tuỳ chọn'
  const [customRange, setCustomRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [statFilter, setStatFilter] = useState('ALL'); // 'ALL', 'XIN_NGHI', 'BAO_THUOC', 'GUI_TIN_NHAN', 'DOI_NGUOI', 'VE_TRE'
  
  // Chat State
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [storageTab, setStorageTab] = useState('image'); // 'image' or 'file'
  const [previewImage, setPreviewImage] = useState(null);
  const [activeMenu, setActiveMenu] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [pinnedIndex, setPinnedIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [selectedForwardStudents, setSelectedForwardStudents] = useState([]);
  const [forwardSearch, setForwardSearch] = useState('');
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({ content: '', type: 'all', selectedClasses: [] });
  const [announcementFiles, setAnnouncementFiles] = useState({ images: [], files: [] });

  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [menuFiles, setMenuFiles] = useState({ attachments: [] });
  const [menuForm, setMenuForm] = useState({ type: 'all', selectedClasses: [] });
  
  const [isNgoaiKhoaModalOpen, setIsNgoaiKhoaModalOpen] = useState(false);
  const [isChuongTrinhHocModalOpen, setIsChuongTrinhHocModalOpen] = useState(false);
  const [chuongTrinhHocFiles, setChuongTrinhHocFiles] = useState({ attachments: [] });
  const [chuongTrinhHocForm, setChuongTrinhHocForm] = useState({ type: 'all', selectedClasses: [] });
  const [ngoaiKhoaFiles, setNgoaiKhoaFiles] = useState({ attachments: [] });
  const [ngoaiKhoaForm, setNgoaiKhoaForm] = useState({ 
    type: 'all', 
    selectedClasses: [],
    content: '',
    time: '',
    location: '',
    deadline: '',
    cost: ''
  });

  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyNotices, setHistoryNotices] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [chatDropActive, setChatDropActive] = useState(false);
  const [isMobileChatView, setIsMobileChatView] = useState(() => window.innerWidth <= 768);
  const mobileChatPanelHeight = '90dvh';
  
  const scrollRef = useRef();

  const mergeStateFiles = (setter, key, incomingFiles) => {
    setter(prev => ({
      ...prev,
      [key]: mergeFileLists(prev[key] || [], toFileArray(incomingFiles))
    }));
  };

  const buildAnnouncementTargets = (formState) => {
    if (formState.type === 'all') return classes.map(c => c.malop);
    return formState.selectedClasses;
  };

  const uploadAttachments = async (files, prefix) => {
    const uploads = [];
    for (const file of files) {
      uploads.push(await uploadManagedFile({
        file,
        config,
        supabase,
        prefix
      }));
    }
    return uploads;
  };

  const handleChatAttachmentUpload = async (selectedFiles, forcedType = null) => {
    const files = toFileArray(selectedFiles);
    if (!files.length || !selectedStudent) return;

    setUploading(true);
    try {
      const insertedMessages = [];
      const documentPayloads = [];

      for (const file of files) {
        const upload = await uploadManagedFile({
          file,
          config,
          supabase,
          prefix: selectedStudent.mahv
        });

        const attachmentType = forcedType || (upload.isImage ? 'image' : 'file');
        const msgPayload = {
          mahv: selectedStudent.mahv,
          manv: currentUser.manv || currentUser.username,
          content: '',
          image_url: attachmentType === 'image' ? upload.url : null,
          file_url: attachmentType !== 'image' ? upload.url : null,
          file_name: upload.fileName,
          file_mime_type: upload.mimeType
        };

        const { data, error } = await supabase.from('hv_messages').insert([msgPayload]).select();
        if (error) throw error;
        if (data?.[0]) {
          insertedMessages.push(data[0]);
          documentPayloads.push({
            mahv: selectedStudent.mahv,
            name: upload.fileName,
            category: attachmentType === 'image' ? 'Ảnh' : 'Tài liệu',
            file_url: upload.url,
            mime_type: upload.mimeType
          });
        }
      }

      for (const message of insertedMessages) {
        await triggerPushNotification(supabase, 'hv_messages', message);
      }

      if (documentPayloads.length > 0) {
        const { data: docData, error: docError } = await supabase.from('documents').insert(documentPayloads).select();
        if (docError) throw docError;
        if (docData?.length) setDocuments(prev => [...docData, ...prev]);
      }

      setTimeout(scrollToBottom, 50);
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const getStaffDisplayName = (staffId) => {
    if (!staffId) return 'Nhà trường';
    if (staffId === (currentUser?.manv || currentUser?.username)) return 'Bạn';
    return staffDirectory[staffId] || staffId;
  };

  const getChatSenderName = (message) => {
    if (!message) return '';
    if (message.description === 'PH' || !message.manv) {
      return selectedStudent?.tenhv ? `Phụ huynh bé ${selectedStudent.tenhv}` : 'Phụ huynh';
    }
    return getStaffDisplayName(message.manv);
  };

  const getParentMessageType = (content) => {
    const c = (content || '').toLowerCase();
    if (c.includes('góp ý') || c.includes('hòm thư')) return 'GÓP Ý';
    if (c.includes('nghỉ') || c.includes('nghi ')) return 'XIN NGHỈ';
    if (c.includes('thuốc') || c.includes('thuoc')) return 'BÁO THUỐC';
    if (c.includes('đổi người') || c.includes('doi nguoi')) return 'ĐỔI NGƯỜI ĐÓN';
    if (c.includes('muộn') || c.includes('trễ') || c.includes('muon') || c.includes('tre ')) return 'XIN VỀ TRỄ';
    return 'TIN NHẮN';
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenu(null);
    if (activeMenu) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [activeMenu]);

  useEffect(() => {
    const handleResize = () => setIsMobileChatView(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ----- Initial Data Fetching -----
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch Classes
        const { data: classData } = await supabase.from('tbl_lop').select('*').or('daxoa.neq."Đã Xóa",daxoa.is.null');
        if (classData) setClasses(classData);

        // Fetch Staff / Teachers
        const { data: nvData } = await supabase.from('tbl_nv').select('manv, tennv, role');
        if (nvData) {
          setTeachers(nvData.filter(item => item.role === 'Giáo viên'));
          const nextDirectory = {};
          nvData.forEach((staff) => {
            if (staff?.manv) nextDirectory[staff.manv] = staff.tennv || staff.manv;
          });
          setStaffDirectory(nextDirectory);
        }

        // Fetch Students
        const { data: studentData } = await supabase.from('tbl_hv').select('*').or('trangthai.neq."Đã Nghỉ",trangthai.is.null');
        if (studentData) setStudents(studentData);

        // Fetch Latest Messages
        await fetchSummaries();
        
        // Fetch Unreads
        await fetchUnreads();
      } catch (err) {
        console.error('Error fetching chat dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    // Subscribe to unread count changes
    const badgeChannel = supabase.channel('chat_manager_badger')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hv_messages' }, () => {
        fetchUnreads();
        fetchSummaries(); // Also refresh standard latest messages
      })
      .subscribe();

    return () => supabase.removeChannel(badgeChannel);
  }, []);

  const fetchUnreads = async () => {
    const { data } = await supabase
      .from('hv_messages')
      .select('mahv, manv, description')
      .is('is_read', false);

    if (data) {
      const counts = {};
      data.forEach(d => {
         const isTeacher = Boolean(d.manv && d.manv.trim() !== '' && d.description !== 'PH');
         if (!isTeacher) {
           counts[d.mahv] = (counts[d.mahv] || 0) + 1;
         }
      });
      setUnreadCounts(counts);
    }
  };

  const fetchSummaries = async () => {
    // Determine time range based on dateFilter
    let startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    if (dateFilter === 'Tuần này') {
      startDate.setDate(startDate.getDate() - 6);
    } else if (dateFilter === 'Tháng này') {
      startDate.setDate(1);
    } else if (dateFilter === 'tháng trước tới nay') {
      startDate.setMonth(startDate.getMonth() - 1);
      startDate.setDate(1);
    } else if (dateFilter === 'Tuỳ chọn') {
      startDate = new Date(customRange.start);
      startDate.setHours(0, 0, 0, 0);
    }

    let query = supabase
      .from('hv_messages')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (dateFilter === 'Tuỳ chọn') {
      const endDate = new Date(customRange.end);
      endDate.setHours(23, 59, 59, 999);
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data: msgs, error } = await query;

    if (msgs) setLatestMessages(msgs);
  };

  useEffect(() => {
    if (view === 'dashboard') fetchSummaries();
  }, [dateFilter, view, customRange]);

  // ----- Table Data Computation -----
  const baseSummaries = useMemo(() => {
    // 1. Group latest message per student and collect types from parent messages
    const studentDataMap = {};
    
    latestMessages.forEach(m => {
      // Track latest message overall for each student (for display)
      if (!studentDataMap[m.mahv]) {
        studentDataMap[m.mahv] = { lastMsg: m, types: new Set() };
      }

      // Extract notification types from parent messages in the period
      const isPH = m.description === 'PH' || (!m.manv);
      if (isPH) {
        studentDataMap[m.mahv].types.add(getParentMessageType(m.content));
      }
    });

    // 2. Map students to summaries
    return students.map(s => {
      const sData = studentDataMap[s.mahv];
      const lastMsg = sData?.lastMsg;
      const cls = classes.find(c => c.malop === s.malop);
      const teacher = teachers.find(t => t.manv === cls?.manv);

      // Determine display notification type from the latest message (for the table row badge)
      let notifType = 'TIN NHẮN';
      if (lastMsg) {
        const content = (lastMsg.content || '').toLowerCase();
        if (content.includes('nghỉ')) notifType = 'XIN NGHỈ';
        else if (content.includes('thuốc')) notifType = 'BÁO THUỐC';
        else if (content.includes('đổi người')) notifType = 'ĐỔI NGƯỜI ĐÓN';
        else if (content.includes('muộn') || content.includes('trễ')) notifType = 'XIN VỀ TRỄ';
        else if (content.includes('góp ý') || content.includes('hòm thư')) notifType = 'GÓP Ý';
      }

      return {
        ...s,
        lastMsg,
        className: cls?.tenlop || s.malop || 'Chưa xếp lớp',
        teacherName: teacher?.tennv || cls?.giaovien || 'Chưa cập nhật',
        notifType: lastMsg ? notifType : null,
        allTypes: Array.from(sData?.types || []),
        lastTime: lastMsg ? new Date(lastMsg.created_at) : null
      };
    }).filter(s => {
      // Search filter
      const matchesSearch = s.tenhv?.toLowerCase().includes(searchParent.toLowerCase()) || 
                           s.mahv?.toLowerCase().includes(searchParent.toLowerCase());
      // Class filter
      const matchesClass = classFilter === 'Tất cả' || s.malop === classFilter;
      
      return matchesSearch && matchesClass;
    });
  }, [students, classes, teachers, latestMessages, searchParent, classFilter]);

  const parentSummaries = useMemo(() => {
    return baseSummaries.filter(s => {
      let matchesStat = true;
      if (statFilter === 'XIN_NGHI') matchesStat = s.allTypes.includes('XIN NGHỈ');
      else if (statFilter === 'BAO_THUOC') matchesStat = s.allTypes.includes('BÁO THUỐC');
      else if (statFilter === 'DOI_NGUOI') matchesStat = s.allTypes.includes('ĐỔI NGƯỜI ĐÓN');
      else if (statFilter === 'VE_TRE') matchesStat = s.allTypes.includes('XIN VỀ TRỄ');
      else if (statFilter === 'GOP_Y') matchesStat = s.allTypes.includes('GÓP Ý');
      else if (statFilter === 'GUI_TIN_NHAN') matchesStat = s.allTypes.includes('TIN NHẮN');

      return matchesStat;
    }).sort((a, b) => {
      // Sort by newest message first
      if (!a.lastTime) return 1;
      if (!b.lastTime) return -1;
      return b.lastTime - a.lastTime;
    });
  }, [baseSummaries, statFilter]);
  
  const suggestionMessages = useMemo(() => {
    return latestMessages.filter(m => {
      const isGopY = m.content?.includes('📬 [HÒM THƯ GÓP Ý - GỬI HIỆU TRƯỞNG]');
      if (!isGopY) return false;
      
      return isGopY;
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [latestMessages]);

  // Quick Report Counts
  const reports = useMemo(() => {
    return {
      xinNghi: baseSummaries.filter(s => s.allTypes.includes('XIN NGHỈ')).length,
      baoThuoc: baseSummaries.filter(s => s.allTypes.includes('BÁO THUỐC')).length,
      doiNguoi: baseSummaries.filter(s => s.allTypes.includes('ĐỔI NGƯỜI ĐÓN')).length,
      guiTinNhan: baseSummaries.filter(s => s.allTypes.includes('TIN NHẮN')).length,
      veTre: baseSummaries.filter(s => s.allTypes.includes('XIN VỀ TRỄ')).length,
      gopY: baseSummaries.filter(s => s.allTypes.includes('GÓP Ý')).length,
    };
  }, [baseSummaries]);

  // ----- Chat Logic -----
  useEffect(() => {
    if (!selectedStudent || view !== 'chat') return;

    // Mark as read when opening chat
    const markAsRead = async () => {
      // Optimistic UI update
      setUnreadCounts(prev => {
        const next = { ...prev };
        delete next[selectedStudent.mahv];
        return next;
      });

      try {
        await supabase
          .from('hv_messages')
          .update({ is_read: true })
          .eq('mahv', selectedStudent.mahv)
          .or('is_read.is.null,is_read.eq.false');
      } catch (err) {
        console.error('Update read status error:', err);
      }
    };
    markAsRead();

    const fetchMessages = async () => {
      setLoadingMessages(true);
      const { data } = await supabase
        .from('hv_messages')
        .select('*')
        .eq('mahv', selectedStudent.mahv)
        .order('created_at', { ascending: true });
      if (data) setMessages(data);
      setLoadingMessages(false);
      setTimeout(scrollToBottom, 100);
    };

    const fetchDocs = async () => {
      const { data } = await supabase
        .from('documents')
        .select('*')
        .eq('mahv', selectedStudent.mahv)
        .order('created_at', { ascending: false });
      if (data) setDocuments(data);
    };

    fetchMessages();
    fetchDocs();

    const channel = supabase
      .channel(`chat_${selectedStudent.mahv}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'hv_messages', 
        filter: `mahv=eq.${selectedStudent.mahv}` 
      }, (payload) => {
        setMessages(prev => {
          const exists = prev.some(m => m.id === payload.new.id);
          if (exists) return prev;
          return [...prev, payload.new];
        });
        setTimeout(scrollToBottom, 50);
      })
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'hv_messages', 
        filter: `mahv=eq.${selectedStudent.mahv}` 
      }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
      })
      .on('postgres_changes', { 
        event: 'DELETE', 
        schema: 'public', 
        table: 'hv_messages'
      }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedStudent, view]);

  const scrollToBottom = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!selectedStudent || !inputText.trim()) return;

    if (editingMessage) {
      const { data, error } = await supabase
        .from('hv_messages')
        .update({ content: inputText })
        .eq('id', editingMessage.id)
        .select();
        
      if (!error && data) {
        setMessages(prev => prev.map(m => m.id === editingMessage.id ? data[0] : m));
        setEditingMessage(null);
        setInputText('');
      } else {
        alert('Lỗi khi cập nhật tin nhắn: ' + (error?.message || 'Không xác định'));
      }
      return;
    }

    const newMessage = {
      mahv: selectedStudent.mahv,
      manv: currentUser.manv || currentUser.username,
      content: inputText
    };

    const { data, error } = await supabase.from('hv_messages').insert([newMessage]).select();
    if (!error && data) {
      await triggerPushNotification(supabase, 'hv_messages', data[0]);
      setInputText('');
      setTimeout(scrollToBottom, 50);
    }
  };

  const handleFileUpload = async (e, type) => {
    const files = toFileArray(e.target.files);
    e.target.value = '';
    await handleChatAttachmentUpload(files, type);
  };

  const formatTime = (date) => {
    if (!date) return '--:--';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (view === 'dashboard') {
      await fetchSummaries();
    } else if (view === 'chat' && selectedStudent) {
      // Re-fetch messages for current student
      const { data } = await supabase
        .from('hv_messages')
        .select('*')
        .eq('mahv', selectedStudent.mahv)
        .order('created_at', { ascending: true });
      if (data) setMessages(data);
    }
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const toggleMessageReaction = async (message) => {
    if (!message?.id) return;
    const nextReaction = !Boolean(message.reaction);

    setMessages(prev => prev.map(m => m.id === message.id ? { ...m, reaction: nextReaction } : m));

    const { data, error } = await supabase
      .from('hv_messages')
      .update({ reaction: nextReaction })
      .eq('id', message.id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Lỗi cập nhật reaction:', error);
      setMessages(prev => prev.map(m => m.id === message.id ? { ...m, reaction: Boolean(message.reaction) } : m));
      return;
    }

    if (data) {
      setMessages(prev => prev.map(m => m.id === message.id ? data : m));
    }
  };

  const getInitials = (name) => {
    if (!name) return '??';
    const parts = name.split(' ');
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const scrollToMessage = (msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.transition = 'background-color 0.5s';
      const originalBg = el.style.backgroundColor;
      el.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
      setTimeout(() => {
        el.style.backgroundColor = originalBg;
      }, 2000);
    }
  };

  const handleAction = async (action, message) => {
    setActiveMenu(null);
    
    if (action === 'delete') {
      if (window.confirm('Bạn có muốn xóa tin nhắn này?')) {
        // 1. Delete from R2 if applicable
        if (config.r2_enabled && (message.image_url || message.file_url)) {
          const url = message.image_url || message.file_url;
          try {
            await deleteFromR2(
              url,
              config.r2_endpoint,
              config.r2_access_key_id,
              config.r2_secret_access_key,
              config.r2_bucket_name,
              config.r2_public_url
            );
            console.log('Deleted file from R2:', url);
          } catch (err) {
            console.warn('Could not delete file from R2:', err);
          }
        } else if (!config.r2_enabled && (message.image_url || message.file_url)) {
          // Delete from Supabase Storage
          const url = message.image_url || message.file_url;
          if (url.includes('/storage/v1/object/public/assets/')) {
            const path = url.split('/assets/')[1];
            if (path) {
              try {
                await supabase.storage.from('assets').remove([path]);
                console.log('Deleted file from Supabase Storage:', path);
              } catch (err) {
                console.warn('Could not delete file from Supabase Storage:', err);
              }
            }
          }
        }

        // 2. Delete from documents repository table
        if (message.image_url || message.file_url) {
          const url = message.image_url || message.file_url;
          try {
            await supabase.from('documents').delete().eq('file_url', url);
            setDocuments(prev => prev.filter(d => d.file_url !== url));
          } catch (err) {
            console.warn('Could not delete from documents table:', err);
          }
        }

        const { error } = await supabase.from('hv_messages').delete().eq('id', message.id);
        if (!error) {
          setMessages(prev => prev.filter(m => m.id !== message.id));
        } else {
          alert('Lỗi khi xóa tin nhắn: ' + error.message);
        }
      }
    } else if (action === 'edit') {
      setEditingMessage(message);
      setInputText(message.content);
    } else if (action === 'pin') {
      const pinnedCount = messages.filter(m => m.is_pinned).length;
      if (!message.is_pinned && pinnedCount >= 3) {
        alert('Bạn chỉ có thể ghim tối đa 3 tin nhắn. Vui lòng bỏ ghim tin nhắn cũ trước.');
        return;
      }

      const { error } = await supabase
        .from('hv_messages')
        .update({ is_pinned: !message.is_pinned })
        .eq('id', message.id);
      
      if (!error) {
        setMessages(prev => prev.map(m => m.id === message.id ? { ...m, is_pinned: !m.is_pinned } : m));
      }
    } else if (action === 'forward') {
      setForwardingMessage(message);
      setSelectedForwardStudents([]);
      setForwardSearch('');
    }
  };

  const handleBulkForward = async () => {
    if (!forwardingMessage || selectedForwardStudents.length === 0) return;
    
    setUploading(true);
    try {
      const payloads = selectedForwardStudents.map(mahv => ({
        mahv,
        manv: currentUser.manv || currentUser.username,
        content: forwardingMessage.content || '',
        image_url: forwardingMessage.image_url,
        file_url: forwardingMessage.file_url,
        file_name: forwardingMessage.file_name,
        file_mime_type: forwardingMessage.file_mime_type,
        description: forwardingMessage.description || null
      }));

      const { data: insertedMessages, error } = await supabase.from('hv_messages').insert(payloads).select();
      if (error) throw error;

      for (const message of insertedMessages || []) {
        await triggerPushNotification(supabase, 'hv_messages', message);
      }

      if (forwardingMessage.image_url || forwardingMessage.file_url) {
        const docPayloads = selectedForwardStudents.map(mahv => ({
          mahv,
          name: forwardingMessage.file_name || 'Forwarded File',
          category: forwardingMessage.image_url ? 'Ảnh' : 'Tài liệu',
          file_url: forwardingMessage.image_url || forwardingMessage.file_url,
          mime_type: forwardingMessage.file_mime_type
        }));
        await supabase.from('documents').insert(docPayloads);
      }
      
      alert(`Đã chuyển tiếp tin nhắn thành công tới ${selectedForwardStudents.length} học viên.`);
      setForwardingMessage(null);
    } catch (err) {
      alert('Lỗi khi chuyển tiếp tin nhắn: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handlePostAnnouncement = async () => {
    if (!announcementForm.content.trim() && announcementFiles.images.length === 0 && announcementFiles.files.length === 0) {
      alert('Vui lòng nhập nội dung hoặc chọn tệp tin thông báo.');
      return;
    }

    if (announcementForm.type === 'class' && announcementForm.selectedClasses.length === 0) {
      alert('Vui lòng chọn ít nhất một lớp để đăng bảng tin.');
      return;
    }

    setUploading(true);
    try {
      const targetClasses = buildAnnouncementTargets(announcementForm);

      if (targetClasses.length === 0) {
        alert('Không tìm thấy lớp nào để đăng thông báo.');
        return;
      }

      const uploadedAttachments = await uploadAttachments(
        [...announcementFiles.images, ...announcementFiles.files],
        'announcement'
      );
      const attachmentItems = uploadedAttachments.length > 0 ? uploadedAttachments : [null];
      const payloads = targetClasses.flatMap(malop =>
        attachmentItems.map(attachment => ({
          malop,
          manv: currentUser.manv || currentUser.username,
          content: announcementForm.content,
          image_url: attachment?.isImage ? attachment.url : null,
          file_url: attachment && !attachment.isImage ? attachment.url : null,
          file_name: attachment?.fileName || '',
          file_mime_type: attachment?.mimeType || ''
        }))
      );

      const { data: insertedData, error } = await supabase.from('class_announcements').insert(payloads).select();
      if (error) throw error;
      if (insertedData) {
        for (const record of insertedData) {
          await triggerPushNotification(supabase, 'class_announcements', record);
        }
      }

      alert(`Đã đăng bảng tin thành công tới ${targetClasses.length} lớp học.`);
      setIsAnnouncementModalOpen(false);
      setAnnouncementForm({ content: '', type: 'all', selectedClasses: [] });
      setAnnouncementFiles({ images: [], files: [] });
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handlePostMenu = async () => {
    if (menuFiles.attachments.length === 0) {
      alert('Vui lòng chọn hình ảnh thực đơn.');
      return;
    }

    if (menuForm.type === 'class' && menuForm.selectedClasses.length === 0) {
      alert('Vui lòng chọn ít nhất một lớp để gửi thực đơn.');
      return;
    }

    setUploading(true);
    try {
      const targetClasses = buildAnnouncementTargets(menuForm);

      if (targetClasses.length === 0) throw new Error('Không tìm thấy lớp nào.');

      const uploadedAttachments = await uploadAttachments(menuFiles.attachments, 'menu');
      const payloads = targetClasses.flatMap(malop =>
        uploadedAttachments.map(attachment => ({
          malop,
          manv: currentUser.manv || currentUser.username,
          title: 'THỰC ĐƠN',
          content: 'Thực đơn hàng tuần / hàng ngày',
          image_url: attachment.isImage ? attachment.url : null,
          file_url: attachment.isImage ? null : attachment.url,
          file_name: attachment.fileName,
          file_mime_type: attachment.mimeType
        }))
      );

      const { data: insertedData, error } = await supabase.from('class_announcements').insert(payloads).select();
      if (error) throw error;
      if (insertedData) {
        for (const record of insertedData) {
          await triggerPushNotification(supabase, 'class_announcements', record);
        }
      }

      alert(`Đã gửi thực đơn thành công tới ${targetClasses.length} lớp.`);
      setIsMenuModalOpen(false);
      setMenuFiles({ attachments: [] });
    } catch (err) {
      alert('Lỗi khi gửi thực đơn: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handlePostChuongTrinhHoc = async () => {
    if (chuongTrinhHocFiles.attachments.length === 0) {
      alert('Vui lòng chọn hình ảnh chương trình học.');
      return;
    }

    if (chuongTrinhHocForm.type === 'class' && chuongTrinhHocForm.selectedClasses.length === 0) {
      alert('Vui lòng chọn ít nhất một lớp để gửi chương trình học.');
      return;
    }

    setUploading(true);
    try {
      const targetClasses = buildAnnouncementTargets(chuongTrinhHocForm);

      if (targetClasses.length === 0) throw new Error('Không tìm thấy lớp nào.');

      const uploadedAttachments = await uploadAttachments(chuongTrinhHocFiles.attachments, 'curriculum');
      const payloads = targetClasses.flatMap(malop =>
        uploadedAttachments.map(attachment => ({
          malop,
          manv: currentUser.manv || currentUser.username,
          title: 'CHƯƠNG TRÌNH HỌC',
          content: 'Chương trình học',
          image_url: attachment.isImage ? attachment.url : null,
          file_url: attachment.isImage ? null : attachment.url,
          file_name: attachment.fileName,
          file_mime_type: attachment.mimeType
        }))
      );

      const { data: insertedData, error } = await supabase.from('class_announcements').insert(payloads).select();
      if (error) throw error;
      if (insertedData) {
        for (const record of insertedData) {
          await triggerPushNotification(supabase, 'class_announcements', record);
        }
      }

      alert(`Đã gửi chương trình học thành công tới ${targetClasses.length} lớp.`);
      setIsChuongTrinhHocModalOpen(false);
      setChuongTrinhHocFiles({ attachments: [] });
    } catch (err) {
      alert('Lỗi khi gửi chương trình học: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handlePostNgoaiKhoa = async () => {
    if (ngoaiKhoaFiles.attachments.length === 0) {
      alert('Vui lòng chọn hình ảnh hoạt động ngoại khóa.');
      return;
    }

    if (ngoaiKhoaForm.type === 'class' && ngoaiKhoaForm.selectedClasses.length === 0) {
      alert('Vui lòng chọn ít nhất một lớp để gửi hoạt động.');
      return;
    }

    setUploading(true);
    try {
      const targetClasses = buildAnnouncementTargets(ngoaiKhoaForm);

      if (targetClasses.length === 0) throw new Error('Không tìm thấy lớp nào.');

      const formattedCost = ngoaiKhoaForm.cost 
        ? (ngoaiKhoaForm.cost.includes('VNĐ') ? ngoaiKhoaForm.cost : `${ngoaiKhoaForm.cost} VNĐ`)
        : 'Miễn phí';

      const combinedContent = `
🌟 THÔNG TIN HOẠT ĐỘNG NGOẠI KHÓA 🌟

📍 ĐỊA ĐIỂM: ${ngoaiKhoaForm.location || 'Chưa cập nhật'}
⏰ THỜI GIAN: ${ngoaiKhoaForm.time || 'Chưa cập nhật'}
⏳ HẠN ĐĂNG KÝ: ${ngoaiKhoaForm.deadline || 'Chưa cập nhật'}
💰 CHI PHÍ: ${formattedCost}

━━━━━━━━━━━━━━━━━━━━━━━━

📝 NỘI DUNG CHI TIẾT:
${ngoaiKhoaForm.content}
`.trim();

      const uploadedAttachments = await uploadAttachments(ngoaiKhoaFiles.attachments, 'trip');
      const payloads = targetClasses.flatMap(malop =>
        uploadedAttachments.map(attachment => ({
          malop,
          manv: currentUser.manv || currentUser.username,
          title: 'NGOẠI KHÓA',
          content: combinedContent,
          image_url: attachment.isImage ? attachment.url : null,
          file_url: attachment.isImage ? null : attachment.url,
          file_name: attachment.fileName,
          file_mime_type: attachment.mimeType
        }))
      );

      const { data: insertedData, error } = await supabase.from('class_announcements').insert(payloads).select();
      if (error) throw error;
      if (insertedData) {
        for (const record of insertedData) {
          await triggerPushNotification(supabase, 'class_announcements', record);
        }
      }

      alert(`Đã gửi hoạt động ngoại khóa thành công tới ${targetClasses.length} lớp.`);
      setIsNgoaiKhoaModalOpen(false);
      setNgoaiKhoaFiles({ attachments: [] });
      setNgoaiKhoaForm({ 
        type: 'all', 
        selectedClasses: [],
        content: '',
        time: '',
        location: '',
        deadline: '',
        cost: ''
      });
    } catch (err) {
      alert('Lỗi khi gửi ngoại khóa: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const fetchHistoryNotices = async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('class_announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      setHistoryNotices(data || []);
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRevokeNotice = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn thu hồi (xoá) bản tin này? Phụ huynh sẽ không còn thấy nội dung này nữa.')) return;
    
    try {
      const { error } = await supabase
        .from('class_announcements')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      setHistoryNotices(prev => prev.filter(n => n.id !== id));
      alert('Đã thu hồi bản tin thành công.');
    } catch (err) {
      alert('Lỗi khi thu hồi: ' + err.message);
    }
  };

  if (view === 'chat' && selectedStudent) {
    return (
      <div
        className={`chat-manager-layout chat-thread-view ${isMobileChatView ? 'chat-thread-mobile' : ''}`}
        style={isMobileChatView ? { height: mobileChatPanelHeight, minHeight: mobileChatPanelHeight, maxHeight: mobileChatPanelHeight } : undefined}
      >
        <div className="chat-col chat-main-col" style={{ flex: 1, minHeight: 0 }}>
          <div className="chat-main-header">
            <div className="header-left">
              <button className="back-to-dashboard" onClick={() => setView('dashboard')}>
                <ArrowLeft size={18} /> Quay lại
              </button>
              <div className="header-avatar">
                {selectedStudent.imgpath ? <img src={selectedStudent.imgpath} alt="" /> : <div className="avatar-placeholder">{selectedStudent.tenhv?.charAt(0)}</div>}
              </div>
              <div className="header-info">
                <h4>{selectedStudent.tenhv} - {selectedStudent.mahv}</h4>
                <span className="status-online">Cuốn trao đổi trực tiếp với Phụ huynh</span>
              </div>
            </div>
            <div className="header-right">
              <button className={`refresh-btn-modern ${isRefreshing ? 'refreshing' : ''}`} onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw size={18} className={isRefreshing ? 'spin' : ''} />
                <span>Làm mới</span>
              </button>
            </div>
          </div>

          {messages.filter(m => m.is_pinned).length > 0 && (() => {
            const pinned = messages.filter(m => m.is_pinned).reverse(); // Newest first
            const currentPinned = pinned[pinnedIndex % pinned.length] || pinned[0];
            return (
              <div className="pinned-messages-bar" onClick={() => scrollToMessage(currentPinned.id)}>
                <div className="pinned-bar-content">
                    <div className="pin-icon-wrapper">
                      <Pin size={14} fill="currentColor" />
                    </div>
                    <div className="pinned-info">
                      <span className="pinned-title">
                        Tin nhắn đã ghim {pinned.length > 1 ? `(${ (pinnedIndex % pinned.length) + 1}/${pinned.length})` : ''}
                      </span>
                      <span className="pinned-preview">
                        {currentPinned.content || (currentPinned.image_url ? "Hình ảnh" : "Tệp tin")}
                      </span>
                    </div>
                </div>
                <div className="pinned-bar-actions">
                  {pinned.length > 1 && (
                    <button className="pinned-nav-btn" onClick={(e) => {
                      e.stopPropagation();
                      setPinnedIndex((pinnedIndex + 1) % pinned.length);
                    }}>
                      Tiếp theo
                    </button>
                  )}
                  <button className="pinned-close-btn" onClick={(e) => {
                    e.stopPropagation();
                    handleAction('pin', currentPinned);
                  }} title="Bỏ ghim">
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          })()}

          <div className="chat-messages scrollable" ref={scrollRef}>
            {loadingMessages ? <div className="loading-center"><Loader2 size={32} className="spinner" /></div> : (
              messages.filter(m => {
                const isGopY = m.content?.includes('📬 [HÒM THƯ GÓP Ý - GỬI HIỆU TRƯỞNG]');
                if (isGopY) {
                  return currentUser?.role === 'Quản lý' || currentUser?.role === 'Hiệu trưởng';
                }
                return true;
              }).map((m, idx) => {
                const isMine = m.manv === (currentUser.manv || currentUser.username) && m.description !== 'PH';
                const msgId = m.id || `msg-${idx}-${m.created_at}`;
                const senderName = getChatSenderName(m);
                return (
                  <div key={msgId} id={`msg-${m.id}`} className={`message-row ${isMine ? 'mine' : 'theirs'}`}>
                     <div className="message-bubble-wrapper">
                        <div className="msg-sender">{senderName}</div>
                        <div className="message-bubble">
                           {m.is_pinned && <div className="pinned-badge"><Pin size={10} /> Đã ghim</div>}
                           {m.description === 'THONG_BAO' && <div className="announcement-badge"><Bell size={10} /> THÔNG BÁO</div>}
                           {m.content && (
                             <div className="msg-text">
                               <ChatMessageContent content={m.content} isOwnMessage={isMine} />
                             </div>
                           )}
                           {m.image_url && (
                             <div className="msg-image">
                               <img 
                                 src={getDisplayUrl(m.image_url)} 
                                 alt={m.file_name} 
                                 onClick={() => setPreviewImage(m.image_url)}
                                 referrerPolicy="no-referrer"
                               />
                             </div>
                           )}
                           {m.file_url && <ChatMediaAttachment fileUrl={m.file_url} fileName={m.file_name} mimeType={m.file_mime_type} isOwnMessage={isMine} />}
                           <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                             <button
                               type="button"
                               onClick={() => toggleMessageReaction(m)}
                               style={{
                                 border: 'none',
                                 background: 'transparent',
                                 padding: 0,
                                 cursor: 'pointer',
                                 display: 'flex',
                                 alignItems: 'center',
                                 color: m.reaction ? '#e11d48' : '#94a3b8'
                               }}
                               title={m.reaction ? 'Bỏ tim' : 'Thả tim'}
                             >
                               <Heart size={15} fill={m.reaction ? '#e11d48' : 'none'} />
                             </button>
                             <div className="msg-time" style={{ marginTop: 0 }}>{formatTime(new Date(m.created_at))}</div>
                           </div>
                        </div>

                        <div className="message-actions-trigger" onClick={e => e.stopPropagation()}>
                           <button className="action-btn-more" onClick={() => setActiveMenu(activeMenu === msgId ? null : msgId)}>
                              <MoreHorizontal size={16} />
                           </button>
                           
                           {activeMenu === msgId && (
                             <div className="message-dropdown-menu">
                                <button onClick={() => handleAction('edit', m)}><Pencil size={14} /> Chỉnh sửa</button>
                                <button onClick={() => handleAction('pin', m)}>
                                  <Pin size={14} /> {m.is_pinned ? 'Bỏ ghim' : 'Ghim tin nhắn'}
                                </button>
                                <button onClick={() => handleAction('forward', m)}><Share2 size={14} /> Chuyển tiếp</button>
                                <div className="dropdown-divider"></div>
                                <button className="delete-opt" onClick={() => handleAction('delete', m)}><Trash2 size={14} /> Xóa tin nhắn</button>
                             </div>
                           )}
                        </div>
                     </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="chat-input-area">
              {editingMessage && (
                <div className="editing-banner">
                  <span>Đang chỉnh sửa tin nhắn...</span>
                  <button onClick={() => { setEditingMessage(null); setInputText(''); }}><X size={14} /></button>
                </div>
              )}
              <form
                className="chat-input-toolbar"
                onSubmit={handleSendMessage}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setChatDropActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setChatDropActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  if (e.currentTarget.contains(e.relatedTarget)) return;
                  setChatDropActive(false);
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  setChatDropActive(false);
                  const droppedFiles = toFileArray(e.dataTransfer.files);
                  if (!droppedFiles.length) return;
                  const { images, files } = splitFilesByKind(droppedFiles);
                  if (images.length > 0) await handleChatAttachmentUpload(images, 'image');
                  if (files.length > 0) await handleChatAttachmentUpload(files, 'file');
                }}
                style={chatDropActive ? { borderColor: '#10b981', boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.12)' } : undefined}
              >
                <div className="toolbar-left">
                   <label className="toolbar-btn">
                      <ImageIcon size={20} />
                      <input type="file" accept="image/*" multiple hidden onChange={(e) => handleFileUpload(e, 'image')} />
                   </label>
                   <label className="toolbar-btn">
                      <Paperclip size={20} />
                      <input type="file" multiple hidden onChange={(e) => handleFileUpload(e, 'file')} />
                   </label>
                </div>
                <input 
                  type="text" 
                  placeholder="Nhập nội dung tin nhắn..." 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={uploading}
                />
                <button type="submit" className="send-btn" disabled={!inputText.trim() || uploading}>
                  {uploading ? <Loader2 size={20} className="spinner" /> : <Send size={20} />}
                </button>
             </form>
          </div>
        </div>

        {!isMobileChatView && (
          <div className="chat-col details-col" style={{ width: '300px' }}>
            <div className="details-header">
               <div className="large-avatar-circle" style={{ backgroundColor: '#ec4899' }}>
                 {selectedStudent.imgpath ? <img src={selectedStudent.imgpath} alt="" /> : <span>{getInitials(selectedStudent.tenhv)}</span>}
               </div>
               <h3 className="details-main-title">{selectedStudent.tenhv} - {selectedStudent.sdtme || '--'} - {selectedStudent.className}</h3>
            </div>
            
            <div className="details-body scrollable">
               <div className="details-section">
                  <h4 className="section-header-title"><LayoutGrid size={18} /> Thông tin khách hàng</h4>
                  <div className="info-list-modern">
                     <div className="info-item-modern"><User size={16} /> <span>{selectedStudent.tenhv}</span></div>
                     <div className="info-item-modern"><Phone size={16} /> <span>{selectedStudent.sdtme || '--'}</span></div>
                     <div className="info-item-modern"><MapPin size={16} /> <span>{selectedStudent.diachi || 'N/A'}</span></div>
                     <div className="info-item-modern"><FileText size={16} /> <span>{selectedStudent.className}</span></div>
                  </div>
               </div>

               <div className="details-divider"></div>

                <div className="details-section">
                  <h4 className="section-header-title"><File size={18} /> Kho lưu trữ</h4>
                  <div className="storage-tabs-modern">
                     <button 
                       className={`storage-tab ${storageTab === 'image' ? 'active' : ''}`}
                       onClick={() => setStorageTab('image')}
                     >
                       Hình ảnh ({documents.filter(d => d.category === 'Ảnh').length})
                     </button>
                     <button 
                       className={`storage-tab ${storageTab === 'file' ? 'active' : ''}`}
                       onClick={() => setStorageTab('file')}
                     >
                       File ({documents.filter(d => d.category !== 'Ảnh').length})
                     </button>
                  </div>
                  
                  <div className="storage-content-modern scrollable" style={{ maxHeight: '300px', marginTop: '12px' }}>
                     {storageTab === 'image' ? (
                       <div className="image-grid-storage">
                          {documents.filter(d => d.category === 'Ảnh').length > 0 ? (
                             documents.filter(d => d.category === 'Ảnh').map(img => (
                               <div key={img.id} className="storage-img-item" onClick={() => setPreviewImage(img.file_url)}>
                                  <img src={getDisplayUrl(img.file_url)} alt={img.name} referrerPolicy="no-referrer" />
                               </div>
                             ))
                          ) : (
                            <div className="empty-storage-msg">Chưa có hình ảnh nào</div>
                          )}
                       </div>
                     ) : (
                       <div className="file-list-storage">
                          {documents.filter(d => d.category !== 'Ảnh').length > 0 ? (
                             documents.filter(d => d.category !== 'Ảnh').map(f => (
                               <div key={f.id} className="storage-file-item" onClick={() => window.open(f.file_url)}>
                                  <FileText size={16} />
                                  <span className="file-name-truncated" title={f.name}>{f.name}</span>
                               </div>
                             ))
                          ) : (
                            <div className="empty-storage-msg">Chưa có file nào</div>
                          )}
                       </div>
                     )}
                  </div>
               </div>
            </div>
          </div>
        )}
        
        {previewImage && (
          <div className="image-preview-overlay" onClick={() => setPreviewImage(null)}>
             <div className="preview-container" onClick={e => e.stopPropagation()}>
                <button className="preview-close-btn" onClick={() => setPreviewImage(null)}><X size={24} /></button>
                <img src={getDisplayUrl(previewImage)} alt="Preview" referrerPolicy="no-referrer" />
             </div>
          </div>
        )}

        {forwardingMessage && createPortal(
          <div className="chat-modal-overlay" onClick={() => setForwardingMessage(null)}>
            <div className="chat-modal forward-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Chuyển tiếp tin nhắn</h3>
                <button className="close-btn" onClick={() => setForwardingMessage(null)}><X size={20} /></button>
              </div>
              
              <div className="modal-body">
                <div className="forward-preview">
                   <p className="label">Nội dung chuyển tiếp:</p>
                   <div className="preview-bubble">
                      {forwardingMessage.content && <p>{forwardingMessage.content}</p>}
                      {forwardingMessage.image_url && <img src={getDisplayUrl(forwardingMessage.image_url)} alt="" style={{maxHeight: '60px', borderRadius: '4px'}} />}
                      {forwardingMessage.file_url && <div className="file-tag"><FileText size={14} /> {forwardingMessage.file_name}</div>}
                   </div>
                </div>

                <div className="recipient-selector">
                   <div className="search-recipient">
                      <Search size={16} />
                      <input 
                        type="text" 
                        placeholder="Tìm kiếm học viên hoặc lớp..." 
                        value={forwardSearch}
                        onChange={e => setForwardSearch(e.target.value)}
                      />
                   </div>

                   <div className="recipient-list scrollable">
                      {/* Grouping or providing bulk class actions */}
                      {students
                        .filter(s => {
                          const clsName = getClassName(s.malop);
                          const matches = s.tenhv?.toLowerCase().includes(forwardSearch.toLowerCase()) || 
                                          s.mahv?.toLowerCase().includes(forwardSearch.toLowerCase()) ||
                                          clsName.toLowerCase().includes(forwardSearch.toLowerCase());
                          return matches;
                        })
                        .sort((a,b) => (a.malop === selectedStudent?.malop ? -1 : 1))
                        .map((s, idx, arr) => {
                          const prevS = arr[idx - 1];
                          const showClassHeader = !prevS || prevS.malop !== s.malop;
                          const clsName = getClassName(s.malop);
                          
                          return (
                            <React.Fragment key={s.mahv}>
                              {showClassHeader && (
                                <div className="class-section-header">
                                   <span>Lớp: {clsName}</span>
                                   <button 
                                     className="btn-select-class"
                                     onClick={() => {
                                       const members = students.filter(std => std.malop === s.malop).map(std => std.mahv);
                                       const isAllSelected = members.every(id => selectedForwardStudents.includes(id));
                                       if (isAllSelected) {
                                         setSelectedForwardStudents(prev => prev.filter(id => !members.includes(id)));
                                       } else {
                                         setSelectedForwardStudents(prev => [...new Set([...prev, ...members])]);
                                       }
                                     }}
                                   >
                                     {students.filter(std => std.malop === s.malop).every(id => selectedForwardStudents.includes(id.mahv)) ? 'Bỏ chọn cả lớp' : 'Chọn cả lớp'}
                                   </button>
                                </div>
                              )}
                              <label className={`recipient-item ${selectedForwardStudents.includes(s.mahv) ? 'selected' : ''}`}>
                                 <input 
                                   type="checkbox" 
                                   checked={selectedForwardStudents.includes(s.mahv)} 
                                   onChange={() => {
                                     if (selectedForwardStudents.includes(s.mahv)) {
                                       setSelectedForwardStudents(prev => prev.filter(id => id !== s.mahv));
                                     } else {
                                       setSelectedForwardStudents(prev => [...prev, s.mahv]);
                                     }
                                   }}
                                 />
                                 <div className="r-avatar">{s.tenhv?.charAt(0)}</div>
                                 <div className="r-info">
                                    <span className="r-name">{s.tenhv} {s.malop === selectedStudent?.malop && <span className="same-class-tag">Cùng lớp</span>}</span>
                                    <span className="r-sub">{s.mahv} - {clsName}</span>
                                 </div>
                              </label>
                            </React.Fragment>
                          );
                        })
                      }
                   </div>
                </div>
              </div>

              <div className="modal-footer">
                <div className="selection-count">Đã chọn <strong>{selectedForwardStudents.length}</strong> học viên</div>
                <div className="footer-btns">
                   <button className="btn-cancel" onClick={() => setForwardingMessage(null)}>Hủy</button>
                   <button 
                     className="btn-forward-submit" 
                     disabled={selectedForwardStudents.length === 0 || uploading}
                     onClick={handleBulkForward}
                   >
                     {uploading ? <Loader2 size={18} className="spinner" /> : <Send size={18} />}
                     Gửi ngay
                   </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  return (
    <div className="chat-dashboard animate-fade-in">
      <div className="chat-dashboard-header">
          <h2 className="chat-dashboard-title">Quản lý trao đổi phụ huynh</h2>
          <div className="chat-header-actions">
            <button 
              className="chat-action-btn btn-history"
              onClick={() => {
                setIsHistoryModalOpen(true);
                fetchHistoryNotices();
              }}
            >
               <Clock size={18} /> Lịch sử đã đăng
            </button>
            <button 
              className="chat-action-btn btn-menu"
              onClick={() => setIsMenuModalOpen(true)}
            >
               <Utensils size={18} /> Gửi Thực Đơn
            </button>
            <button 
              className="chat-action-btn btn-ngoaikhoa"
              onClick={() => setIsNgoaiKhoaModalOpen(true)}
            >
               <ImageIcon size={18} /> Gửi Ngoại Khóa
            </button>
            <button 
              className="chat-action-btn btn-chuongtrinhhoc"
              onClick={() => setIsChuongTrinhHocModalOpen(true)}
              style={{ background: '#0ea5e9', color: 'white', border: 'none' }}
            >
               <FileText size={18} /> Gửi C.Trình Học
            </button>
            <button 
              className="chat-action-btn btn-announcement"
              onClick={() => setIsAnnouncementModalOpen(true)}
            >
               <Bell size={18} /> Đăng Bảng Tin (Announcement)
            </button>
          </div>
       </div>

      {/* Filters Row */}
      <div className="chat-filters-row">
        <div className="filter-group">
          <span className="filter-label">Phụ huynh</span>
          <div className="search-input-wrapper">
            <Search size={18} className="search-icon-inside" />
            <input 
              type="text" 
              placeholder="TÌM KIẾM THEO TÊN/MÃ..." 
              value={searchParent}
              onChange={(e) => setSearchParent(e.target.value)}
            />
          </div>
        </div>

        <div className="filter-group">
          <span className="filter-label">Lọc theo:</span>
          <select 
            className="class-select-styled"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          >
            <option value="Tất cả">LỚP: TẤT CẢ</option>
            {classes.map(c => (
              <option key={c.malop} value={c.malop}>{c.tenlop}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <span className="filter-label" style={{ whiteSpace: 'nowrap' }}>Thời gian cập nhật:</span>
          <div className="date-filters">
            {['Hôm nay', 'Tuần này', 'Tháng này', 'tháng trước tới nay', 'Tuỳ chọn'].map(f => (
              <button 
                key={f}
                className={`date-filter-btn ${dateFilter === f ? 'active' : ''}`}
                onClick={() => setDateFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {dateFilter === 'Tuỳ chọn' && (
            <div className="custom-date-picker" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '12px' }}>
              <input 
                type="date" 
                className="class-select-styled" 
                style={{ padding: '0.4rem 0.75rem', minWidth: 'auto' }}
                value={customRange.start}
                onChange={(e) => setCustomRange({...customRange, start: e.target.value})}
              />
              <span className="filter-label">đến</span>
              <input 
                type="date" 
                className="class-select-styled" 
                style={{ padding: '0.4rem 0.75rem', minWidth: 'auto' }}
                value={customRange.end}
                onChange={(e) => setCustomRange({...customRange, end: e.target.value})}
              />
            </div>
          )}
        </div>
      </div>

      {/* Quick Reports Section */}
      <div className="quick-reports-container">
        <div 
          className="report-card xin-nghi"
          onClick={() => setStatFilter(statFilter === 'XIN_NGHI' ? 'ALL' : 'XIN_NGHI')}
          style={{ cursor: 'pointer', outline: statFilter === 'XIN_NGHI' ? '3px solid #8b5cf6' : 'none', opacity: statFilter !== 'ALL' && statFilter !== 'XIN_NGHI' ? 0.6 : 1 }}
        >
          <span className="report-label">Xin nghỉ</span>
          <span className="report-value">{String(reports.xinNghi).padStart(2, '0')}</span>
        </div>
        <div 
          className="report-card bao-thuoc"
          onClick={() => setStatFilter(statFilter === 'BAO_THUOC' ? 'ALL' : 'BAO_THUOC')}
          style={{ cursor: 'pointer', outline: statFilter === 'BAO_THUOC' ? '3px solid #10b981' : 'none', opacity: statFilter !== 'ALL' && statFilter !== 'BAO_THUOC' ? 0.6 : 1 }}
        >
          <span className="report-label">Báo thuốc</span>
          <span className="report-value">{String(reports.baoThuoc).padStart(2, '0')}</span>
        </div>
        <div 
          className="report-card gui-tin-nhan"
          onClick={() => setStatFilter(statFilter === 'GUI_TIN_NHAN' ? 'ALL' : 'GUI_TIN_NHAN')}
          style={{ cursor: 'pointer', outline: statFilter === 'GUI_TIN_NHAN' ? '3px solid #3b82f6' : 'none', opacity: statFilter !== 'ALL' && statFilter !== 'GUI_TIN_NHAN' ? 0.6 : 1 }}
        >
          <span className="report-label">Gửi tin nhắn</span>
          <span className="report-value">{String(reports.guiTinNhan).padStart(2, '0')}</span>
        </div>
        <div 
          className="report-card doi-nguoi"
          onClick={() => setStatFilter(statFilter === 'DOI_NGUOI' ? 'ALL' : 'DOI_NGUOI')}
          style={{ cursor: 'pointer', outline: statFilter === 'DOI_NGUOI' ? '3px solid #f59e0b' : 'none', opacity: statFilter !== 'ALL' && statFilter !== 'DOI_NGUOI' ? 0.6 : 1 }}
        >
          <span className="report-label">Báo đổi người đón trẻ</span>
          <span className="report-value">{String(reports.doiNguoi).padStart(2, '0')}</span>
        </div>
        <div 
          className="report-card ve-tre"
          onClick={() => setStatFilter(statFilter === 'VE_TRE' ? 'ALL' : 'VE_TRE')}
          style={{ cursor: 'pointer', outline: statFilter === 'VE_TRE' ? '3px solid #ef4444' : 'none', opacity: statFilter !== 'ALL' && statFilter !== 'VE_TRE' ? 0.6 : 1 }}
        >
          <span className="report-label">Xin về trễ</span>
          <span className="report-value">{String(reports.veTre).padStart(2, '0')}</span>
        </div>

        {(currentUser?.role === 'Quản lý' || currentUser?.role === 'Hiệu trưởng') && (
          <div 
            className="report-card gop-y"
            onClick={() => setStatFilter(statFilter === 'GOP_Y' ? 'ALL' : 'GOP_Y')}
            style={{ 
              cursor: 'pointer', 
              background: '#f97316', 
              color: 'white',
              outline: statFilter === 'GOP_Y' ? '3px solid #ea580c' : 'none', 
              opacity: statFilter !== 'ALL' && statFilter !== 'GOP_Y' ? 0.6 : 1 
            }}
          >
            <span className="report-label" style={{ color: 'rgba(255,255,255,0.9)' }}>Góp ý phụ huynh</span>
            <span className="report-value" style={{ color: 'white' }}>{String(reports.gopY).padStart(2, '0')}</span>
          </div>
        )}
      </div>

      {/* Main Table Section */}
      <div className="chat-table-wrapper">
        <table className="chat-data-table">
          <thead>
            {statFilter === 'GOP_Y' ? (
              <tr>
                <th style={{ width: '75%' }}>Nội dung góp ý</th>
                <th style={{ width: '25%' }}>Thời gian</th>
              </tr>
            ) : (
              <tr>
                <th style={{ width: '25%' }}>Họ và tên</th>
                <th style={{ width: '15%' }}>Số điện thoại</th>
                <th style={{ width: '10%' }}>Lớp</th>
                <th style={{ width: '20%' }}>Giáo viên</th>
                <th style={{ width: '20%' }}>Thông báo mới</th>
                <th style={{ width: '10%' }}>Thời gian</th>
              </tr>
            )}
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="no-results"><Loader2 size={24} className="spinner" /> Đang tải dữ liệu...</td></tr>
            ) : statFilter === 'GOP_Y' ? (
              suggestionMessages.length === 0 ? (
                <tr><td colSpan="2" className="no-results">Chưa có góp ý nào</td></tr>
              ) : suggestionMessages.map(m => {
                const s = students.find(hv => hv.mahv === m.mahv);
                return (
                  <tr key={m.id} style={{ cursor: 'default' }}>
                    <td className="student-name-cell" style={{ whiteSpace: 'normal', lineHeight: '1.5', padding: '15px' }}>
                      <div style={{ fontWeight: 800, color: '#f97316', marginBottom: '5px' }}>👤 Phụ huynh ẩn danh</div>
                      <div style={{ color: '#1e293b' }}>
                        {m.content?.replace(/📬 \[HÒM THƯ GÓP Ý - GỬI HIỆU TRƯỞNG\]\nNội dung: /i, '')}
                      </div>
                    </td>
                    <td className="time-cell" style={{ verticalAlign: 'top', paddingTop: '15px' }}>
                      {new Date(m.created_at).toLocaleString('vi-VN')}
                    </td>
                  </tr>
                );
              })
            ) : parentSummaries.length === 0 ? (
              <tr><td colSpan="6" className="no-results">Không tìm thấy thông tin phù hợp</td></tr>
            ) : parentSummaries.map(s => (
              <tr key={s.mahv} onClick={() => { setSelectedStudent(s); setView('chat'); }}>
                <>
                  <td className="student-name-cell">
                    {s.tenhv}
                    {unreadCounts[s.mahv] > 0 && (
                      <span style={{ marginLeft: '10px', background: '#ef4444', color: 'white', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', fontWeight: 'bold' }}>
                        +{unreadCounts[s.mahv]}
                      </span>
                    )}
                  </td>
                  <td className="phone-cell">{s.sdtme || '--'}</td>
                  <td>{s.className}</td>
                  <td>{s.teacherName}</td>
                  <td>
                    {s.lastMsg ? (
                      <div 
                        style={{ 
                          fontSize: '0.85rem', 
                          color: '#475569', 
                          maxWidth: '220px', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap' 
                        }} 
                        title={s.lastMsg.content}
                      >
                        {s.lastMsg.content || (s.lastMsg.image_url ? '📷 [Hình ảnh]' : (s.lastMsg.file_url ? '📎 [Tài liệu]' : '...'))}
                      </div>
                    ) : <span style={{color: '#cbd5e1'}}>--</span>}
                  </td>
                  <td className="time-cell">{s.lastTime ? formatTime(s.lastTime) : '--:--'}</td>
                </>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {previewImage && (
        <div className="image-preview-overlay" onClick={() => setPreviewImage(null)}>
           <div className="preview-container" onClick={e => e.stopPropagation()}>
              <button className="preview-close-btn" onClick={() => setPreviewImage(null)}><X size={24} /></button>
              <img src={getDisplayUrl(previewImage)} alt="Preview" referrerPolicy="no-referrer" />
           </div>
        </div>
      )}

      {/* Announcement Modal */}
      {isAnnouncementModalOpen && createPortal(
        <div className="chat-modal-overlay" onClick={() => setIsAnnouncementModalOpen(false)}>
          <div className="chat-modal announcement-modal" onClick={e => e.stopPropagation()}>
             <div className="modal-header">
                <h3><Bell size={20} /> Đăng Thông Báo Bảng Tin</h3>
                <button className="close-btn" onClick={() => setIsAnnouncementModalOpen(false)}><X size={20} /></button>
             </div>
             <div className="modal-body">
                <div style={{ marginBottom: '20px' }}>
                   <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: '#334155' }}>Gửi tới:</label>
                   <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        className={`mode-btn ${announcementForm.type === 'all' ? 'active' : ''}`}
                        onClick={() => setAnnouncementForm({...announcementForm, type: 'all'})}
                        style={{ 
                          flex: 1, 
                          padding: '12px', 
                          borderRadius: '12px', 
                          border: announcementForm.type === 'all' ? '2px solid #8b5cf6' : '1px solid #e2e8f0', 
                          background: announcementForm.type === 'all' ? '#f5f3ff' : 'white', 
                          color: announcementForm.type === 'all' ? '#8b5cf6' : '#64748b', 
                          fontWeight: 700, 
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        Gửi tất cả các lớp
                      </button>
                      <button 
                        className={`mode-btn ${announcementForm.type === 'class' ? 'active' : ''}`}
                        onClick={() => setAnnouncementForm({...announcementForm, type: 'class'})}
                        style={{ 
                          flex: 1, 
                          padding: '12px', 
                          borderRadius: '12px', 
                          border: announcementForm.type === 'class' ? '2px solid #8b5cf6' : '1px solid #e2e8f0', 
                          background: announcementForm.type === 'class' ? '#f5f3ff' : 'white', 
                          color: announcementForm.type === 'class' ? '#8b5cf6' : '#64748b', 
                          fontWeight: 700, 
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        Chọn từng lớp riêng
                      </button>
                   </div>
                </div>

                {announcementForm.type === 'class' && (
                   <div style={{ marginBottom: '20px', maxHeight: '200px', overflowY: 'auto', padding: '10px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }} className="fade-in">
                      <label style={{ display: 'block', marginBottom: '10px', fontWeight: 700, color: '#334155' }}>Chọn các lớp:</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {classes.map(c => (
                          <label key={c.malop} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '0.9rem' }}>
                            <input 
                              type="checkbox" 
                              checked={announcementForm.selectedClasses.includes(c.malop)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setAnnouncementForm(prev => {
                                  const list = checked 
                                    ? [...prev.selectedClasses, c.malop]
                                    : prev.selectedClasses.filter(id => id !== c.malop);
                                  return { ...prev, selectedClasses: list };
                                });
                              }}
                            />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.tenlop}</span>
                          </label>
                        ))}
                      </div>
                   </div>
                )}

                <div style={{ marginBottom: '20px' }}>
                   <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: '#334155' }}>Nội dung thông báo:</label>
                   <textarea 
                     placeholder="Nhập nội dung thông báo nhấn mạnh..."
                     rows="5"
                     style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', resize: 'none' }}
                     value={announcementForm.content}
                     onChange={e => setAnnouncementForm({...announcementForm, content: e.target.value})}
                   />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                   <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: '#334155' }}><ImageIcon size={16} /> Đính kèm ảnh:</label>
                      <FileDropZone
                        files={announcementFiles.images}
                        onFilesChange={(files) => mergeStateFiles(setAnnouncementFiles, 'images', files)}
                        accept="image/*"
                        filterFiles={(file) => String(file?.type || '').toLowerCase().startsWith('image/')}
                        icon={ImageIcon}
                        accentColor="#8b5cf6"
                        textColor="#4c1d95"
                        subTextColor="#64748b"
                        emptyTitle="Chọn ảnh thông báo..."
                        selectedHint="Chọn ảnh thông báo..."
                        style={{ padding: '12px', borderRadius: '10px', background: '#f8fafc' }}
                        listStyle={{ maxHeight: '92px' }}
                      />
                   </div>
                   <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: '#334155' }}><File size={16} /> Đính kèm File:</label>
                      <FileDropZone
                        files={announcementFiles.files}
                        onFilesChange={(files) => mergeStateFiles(setAnnouncementFiles, 'files', files)}
                        icon={Paperclip}
                        accentColor="#8b5cf6"
                        textColor="#4c1d95"
                        subTextColor="#64748b"
                        emptyTitle="Chọn tệp đính kèm..."
                        selectedHint="Chọn tệp đính kèm..."
                        style={{ padding: '12px', borderRadius: '10px', background: '#f8fafc' }}
                        listStyle={{ maxHeight: '92px' }}
                      />
                   </div>
                </div>
             </div>
             <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setIsAnnouncementModalOpen(false)}>Hủy bỏ</button>
                <button 
                  className="btn-forward-submit" 
                  style={{ background: '#8b5cf6' }}
                  disabled={uploading}
                  onClick={handlePostAnnouncement}
                >
                   {uploading ? <Loader2 size={18} className="spinner" /> : <Send size={18} />}
                   Đăng thông báo lên Bảng tin
                </button>
             </div>
          </div>
        </div>,
        document.body
      )}
      {/* Menu Modal */}
      {isMenuModalOpen && createPortal(
        <div className="chat-modal-overlay" onClick={() => setIsMenuModalOpen(false)}>
          <div className="chat-modal announcement-modal" onClick={e => e.stopPropagation()}>
             <div className="modal-header">
                <h3><Utensils size={20} /> Gửi Thực Đơn Cho Phụ Huynh</h3>
                <button className="close-btn" onClick={() => setIsMenuModalOpen(false)}><X size={20} /></button>
             </div>
             <div className="modal-body">
                <div style={{ marginBottom: '20px' }}>
                   <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: '#334155' }}>Gửi tới:</label>
                   <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        className={`mode-btn ${menuForm.type === 'all' ? 'active' : ''}`}
                        onClick={() => setMenuForm({...menuForm, type: 'all'})}
                        style={{ 
                          flex: 1, 
                          padding: '12px', 
                          borderRadius: '12px', 
                          border: menuForm.type === 'all' ? '2px solid #10b981' : '1px solid #e2e8f0', 
                          background: menuForm.type === 'all' ? '#f0fdf4' : 'white', 
                          color: menuForm.type === 'all' ? '#10b981' : '#64748b', 
                          fontWeight: 700, 
                          cursor: 'pointer'
                        }}
                      >
                        Gửi tất cả các lớp
                      </button>
                      <button 
                        className={`mode-btn ${menuForm.type === 'class' ? 'active' : ''}`}
                        onClick={() => setMenuForm({...menuForm, type: 'class'})}
                        style={{ 
                          flex: 1, 
                          padding: '12px', 
                          borderRadius: '12px', 
                          border: menuForm.type === 'class' ? '2px solid #10b981' : '1px solid #e2e8f0', 
                          background: menuForm.type === 'class' ? '#f0fdf4' : 'white', 
                          color: menuForm.type === 'class' ? '#10b981' : '#64748b', 
                          fontWeight: 700, 
                          cursor: 'pointer'
                        }}
                      >
                        Chọn từng lớp riêng
                      </button>
                   </div>
                </div>

                {menuForm.type === 'class' && (
                   <div style={{ marginBottom: '20px', maxHeight: '200px', overflowY: 'auto', padding: '10px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'block', marginBottom: '10px', fontWeight: 700, color: '#334155' }}>Chọn các lớp:</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {classes.map(c => (
                          <label key={c.malop} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '0.9rem' }}>
                            <input 
                              type="checkbox" 
                              checked={menuForm.selectedClasses.includes(c.malop)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setMenuForm(prev => {
                                  const list = checked 
                                    ? [...prev.selectedClasses, c.malop]
                                    : prev.selectedClasses.filter(id => id !== c.malop);
                                  return { ...prev, selectedClasses: list };
                                });
                              }}
                            />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.tenlop}</span>
                          </label>
                        ))}
                      </div>
                   </div>
                )}

                <div>
                   <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: '#334155' }}>Hình ảnh thực đơn:</label>
                   <FileDropZone
                     files={menuFiles.attachments}
                     onFilesChange={(files) => mergeStateFiles(setMenuFiles, 'attachments', files)}
                     icon={Upload}
                     accentColor="#10b981"
                     borderColor="#10b981"
                     activeBorderColor="#059669"
                     background="#f0fdf4"
                     textColor="#065f46"
                     subTextColor="#059669"
                     emptyTitle="Chọn hoặc kéo thả ảnh thực đơn vào đây"
                     emptySubtitle="Chấp nhận định dạng JPG, PNG, WEBP"
                     selectedHint="Nhấn để thay đổi ảnh"
                     style={{ padding: '30px' }}
                   />
                </div>
             </div>
             <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setIsMenuModalOpen(false)}>Hủy bỏ</button>
                <button 
                  className="btn-forward-submit" 
                  style={{ background: '#10b981' }}
                  disabled={uploading || menuFiles.attachments.length === 0}
                  onClick={handlePostMenu}
                >
                   {uploading ? <Loader2 size={18} className="spinner" /> : <Utensils size={18} />}
                   Gửi Thực Đơn Cho Phụ Huynh
                </button>
             </div>
          </div>
        </div>,
        document.body
      )}
      {/* Chuong Trinh Hoc Modal */}
      {isChuongTrinhHocModalOpen && createPortal(
        <div className="chat-modal-overlay" onClick={() => setIsChuongTrinhHocModalOpen(false)}>
          <div className="chat-modal announcement-modal" onClick={e => e.stopPropagation()}>
             <div className="modal-header">
                <h3><FileText size={20} /> Gửi Chương Trình Học Cho Phụ Huynh</h3>
                <button className="close-btn" onClick={() => setIsChuongTrinhHocModalOpen(false)}><X size={20} /></button>
             </div>
             <div className="modal-body">
                <div style={{ marginBottom: '20px' }}>
                   <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: '#334155' }}>Gửi tới:</label>
                   <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        className={`mode-btn ${chuongTrinhHocForm.type === 'all' ? 'active' : ''}`}
                        onClick={() => setChuongTrinhHocForm({...chuongTrinhHocForm, type: 'all'})}
                        style={{ 
                          flex: 1, 
                          padding: '12px', 
                          borderRadius: '12px', 
                          border: chuongTrinhHocForm.type === 'all' ? '2px solid #0ea5e9' : '1px solid #e2e8f0', 
                          background: chuongTrinhHocForm.type === 'all' ? '#e0f2fe' : 'white', 
                          color: chuongTrinhHocForm.type === 'all' ? '#0ea5e9' : '#64748b', 
                          fontWeight: 700, 
                          cursor: 'pointer'
                        }}
                      >
                        Gửi tất cả các lớp
                      </button>
                      <button 
                        className={`mode-btn ${chuongTrinhHocForm.type === 'class' ? 'active' : ''}`}
                        onClick={() => setChuongTrinhHocForm({...chuongTrinhHocForm, type: 'class'})}
                        style={{ 
                          flex: 1, 
                          padding: '12px', 
                          borderRadius: '12px', 
                          border: chuongTrinhHocForm.type === 'class' ? '2px solid #0ea5e9' : '1px solid #e2e8f0', 
                          background: chuongTrinhHocForm.type === 'class' ? '#e0f2fe' : 'white', 
                          color: chuongTrinhHocForm.type === 'class' ? '#0ea5e9' : '#64748b', 
                          fontWeight: 700, 
                          cursor: 'pointer'
                        }}
                      >
                        Chọn từng lớp riêng
                      </button>
                   </div>
                </div>

                {chuongTrinhHocForm.type === 'class' && (
                   <div style={{ marginBottom: '20px', maxHeight: '200px', overflowY: 'auto', padding: '10px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'block', marginBottom: '10px', fontWeight: 700, color: '#334155' }}>Chọn các lớp:</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {classes.map(c => (
                          <label key={c.malop} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '0.9rem' }}>
                            <input 
                              type="checkbox" 
                              checked={chuongTrinhHocForm.selectedClasses.includes(c.malop)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setChuongTrinhHocForm(prev => {
                                  const list = checked 
                                    ? [...prev.selectedClasses, c.malop]
                                    : prev.selectedClasses.filter(id => id !== c.malop);
                                  return { ...prev, selectedClasses: list };
                                });
                              }}
                            />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.tenlop}</span>
                          </label>
                        ))}
                      </div>
                   </div>
                )}

                <div>
                   <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: '#334155' }}>Hình ảnh chương trình học:</label>
                   <FileDropZone
                     files={chuongTrinhHocFiles.attachments}
                     onFilesChange={(files) => mergeStateFiles(setChuongTrinhHocFiles, 'attachments', files)}
                     icon={Upload}
                     accentColor="#0ea5e9"
                     borderColor="#0ea5e9"
                     activeBorderColor="#0284c7"
                     background="#e0f2fe"
                     textColor="#0369a1"
                     subTextColor="#0284c7"
                     emptyTitle="Chọn hoặc kéo thả ảnh vào đây"
                     emptySubtitle="Chấp nhận định dạng JPG, PNG, WEBP"
                     selectedHint="Nhấn để thay đổi ảnh"
                     style={{ padding: '30px' }}
                   />
                </div>
             </div>
             <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setIsChuongTrinhHocModalOpen(false)}>Hủy bỏ</button>
                <button 
                  className="btn-forward-submit" 
                  style={{ background: '#0ea5e9' }}
                  disabled={uploading || chuongTrinhHocFiles.attachments.length === 0}
                  onClick={handlePostChuongTrinhHoc}
                >
                   {uploading ? <Loader2 size={18} className="spinner" /> : <FileText size={18} />}
                   Gửi Chương Trình Học
                </button>
             </div>
          </div>
        </div>,
        document.body
      )}
      {/* Ngoai Khoa Modal */}
      {isNgoaiKhoaModalOpen && createPortal(
        <div className="chat-modal-overlay" onClick={() => setIsNgoaiKhoaModalOpen(false)}>
          <div className="chat-modal announcement-modal" onClick={e => e.stopPropagation()}>
             <div className="modal-header" style={{ background: '#fdf2f8' }}>
                <h3 style={{ color: '#be185d' }}><ImageIcon size={20} /> Gửi Hoạt Động Ngoại Khóa</h3>
                <button className="close-btn" onClick={() => setIsNgoaiKhoaModalOpen(false)}><X size={20} /></button>
             </div>
             <div className="modal-body">
                <div style={{ marginBottom: '20px' }}>
                   <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: '#334155' }}>Gửi tới:</label>
                   <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        className={`mode-btn ${ngoaiKhoaForm.type === 'all' ? 'active' : ''}`}
                        onClick={() => setNgoaiKhoaForm({...ngoaiKhoaForm, type: 'all'})}
                        style={{ 
                          flex: 1, 
                          padding: '12px', 
                          borderRadius: '12px', 
                          border: ngoaiKhoaForm.type === 'all' ? '2px solid #ec4899' : '1px solid #e2e8f0', 
                          background: ngoaiKhoaForm.type === 'all' ? '#fdf2f8' : 'white', 
                          color: ngoaiKhoaForm.type === 'all' ? '#ec4899' : '#64748b', 
                          fontWeight: 700, 
                          cursor: 'pointer'
                        }}
                      >
                        Gửi tất cả các lớp
                      </button>
                      <button 
                        className={`mode-btn ${ngoaiKhoaForm.type === 'class' ? 'active' : ''}`}
                        onClick={() => setNgoaiKhoaForm({...ngoaiKhoaForm, type: 'class'})}
                        style={{ 
                          flex: 1, 
                          padding: '12px', 
                          borderRadius: '12px', 
                          border: ngoaiKhoaForm.type === 'class' ? '2px solid #ec4899' : '1px solid #e2e8f0', 
                          background: ngoaiKhoaForm.type === 'class' ? '#fdf2f8' : 'white', 
                          color: ngoaiKhoaForm.type === 'class' ? '#ec4899' : '#64748b', 
                          fontWeight: 700, 
                          cursor: 'pointer'
                        }}
                      >
                        Chọn từng lớp riêng
                      </button>
                   </div>
                </div>

                {ngoaiKhoaForm.type === 'class' && (
                   <div style={{ marginBottom: '20px', maxHeight: '200px', overflowY: 'auto', padding: '10px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'block', marginBottom: '10px', fontWeight: 700, color: '#334155' }}>Chọn các lớp:</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {classes.map(c => (
                          <label key={c.malop} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '0.9rem' }}>
                            <input 
                              type="checkbox" 
                              checked={ngoaiKhoaForm.selectedClasses.includes(c.malop)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setNgoaiKhoaForm(prev => {
                                  const list = checked 
                                    ? [...prev.selectedClasses, c.malop]
                                    : prev.selectedClasses.filter(id => id !== c.malop);
                                  return { ...prev, selectedClasses: list };
                                });
                              }}
                            />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.tenlop}</span>
                          </label>
                        ))}
                      </div>
                   </div>
                )}

                <div style={{ marginBottom: '15px' }}>
                   <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: '#334155' }}>Nội dung hoạt động:</label>
                   <textarea 
                     placeholder="Mô tả ngắn gọn về hoạt động ngoại khóa..."
                     rows="3"
                     style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', resize: 'none' }}
                     value={ngoaiKhoaForm.content}
                     onChange={e => setNgoaiKhoaForm({...ngoaiKhoaForm, content: e.target.value})}
                   />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                   <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: '#334155' }}>Thời gian tổ chức:</label>
                      <input 
                        type="text" 
                        placeholder="Ví dụ: 08:00 - 15/06"
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                        value={ngoaiKhoaForm.time}
                        onChange={e => setNgoaiKhoaForm({...ngoaiKhoaForm, time: e.target.value})}
                      />
                   </div>
                   <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: '#334155' }}>Địa điểm:</label>
                      <input 
                        type="text" 
                        placeholder="Nơi diễn ra hoạt động..."
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                        value={ngoaiKhoaForm.location}
                        onChange={e => setNgoaiKhoaForm({...ngoaiKhoaForm, location: e.target.value})}
                      />
                   </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                   <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: '#334155' }}>Thời hạn đăng ký:</label>
                      <input 
                        type="text" 
                        placeholder="Hạn cuối đăng ký..."
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                        value={ngoaiKhoaForm.deadline}
                        onChange={e => setNgoaiKhoaForm({...ngoaiKhoaForm, deadline: e.target.value})}
                      />
                   </div>
                   <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: '#334155' }}>Chi phí:</label>
                      <input 
                        type="text" 
                        placeholder="Số tiền (nếu có)..."
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                        value={ngoaiKhoaForm.cost}
                        onChange={e => setNgoaiKhoaForm({...ngoaiKhoaForm, cost: formatCurrency(e.target.value)})}
                      />
                   </div>
                </div>

                <div>
                   <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: '#334155' }}>Hình ảnh hoạt động:</label>
                   <FileDropZone
                     files={ngoaiKhoaFiles.attachments}
                     onFilesChange={(files) => mergeStateFiles(setNgoaiKhoaFiles, 'attachments', files)}
                     icon={Upload}
                     accentColor="#ec4899"
                     borderColor="#ec4899"
                     activeBorderColor="#be185d"
                     background="#fdf2f8"
                     textColor="#9d174d"
                     subTextColor="#be185d"
                     emptyTitle="Chọn ảnh ngoại khóa"
                     selectedHint="Nhấn để thay đổi ảnh"
                     style={{ padding: '20px' }}
                   />
                </div>
             </div>
             <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setIsNgoaiKhoaModalOpen(false)}>Hủy bỏ</button>
                <button 
                  className="btn-forward-submit" 
                  style={{ background: '#ec4899' }}
                  disabled={uploading || ngoaiKhoaFiles.attachments.length === 0}
                  onClick={handlePostNgoaiKhoa}
                >
                   {uploading ? <Loader2 size={18} className="spinner" /> : <Send size={18} />}
                   Gửi Hoạt Động Cho Phụ Huynh
                </button>
             </div>
          </div>
        </div>,
        document.body
      )}
      {/* History Modal */}
      {isHistoryModalOpen && createPortal(
        <div className="chat-modal-overlay" onClick={() => setIsHistoryModalOpen(false)}>
          <div className="chat-modal announcement-modal" style={{ maxWidth: '800px' }} onClick={e => e.stopPropagation()}>
             <div className="modal-header">
                <h3><Clock size={20} /> Lịch sử Bản tin / Thực đơn / Ngoại khóa</h3>
                <button className="close-btn" onClick={() => setIsHistoryModalOpen(false)}><X size={20} /></button>
             </div>
             <div className="modal-body">
                {historyLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px' }}><Loader2 className="spinner" size={40} /></div>
                ) : historyNotices.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Chưa có bản tin nào được đăng.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '500px', overflowY: 'auto', padding: '5px' }}>
                    {historyNotices.map(notice => {
                      const noticeTitle = notice.title || 'THÔNG BÁO';
                      return (
                      <div key={notice.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '15px', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ 
                            fontSize: '0.75rem', 
                            fontWeight: 700, 
                            padding: '4px 10px', 
                            borderRadius: '6px',
                            background: noticeTitle === 'TH?C ??N' ? '#f0fdf4' : noticeTitle === 'NGO?I KH?A' ? '#fdf2f8' : '#f5f3ff',
                            color: noticeTitle === 'TH?C ??N' ? '#10b981' : noticeTitle === 'NGO?I KH?A' ? '#ec4899' : '#8b5cf6'
                          }}>
                            {noticeTitle}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(notice.created_at).toLocaleString('vi-VN')}</span>
                        </div>
                        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '5px' }}>Lớp: {getClassName(notice.malop)}</div>
                        <div style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '10px' }}>{notice.content}</div>
                        
                        {notice.image_url && (
                          <div style={{ marginBottom: '10px' }}>
                             <img src={getDisplayUrl(notice.image_url)} alt="preview" style={{ maxHeight: '100px', borderRadius: '8px', cursor: 'zoom-in' }} onClick={() => setPreviewImage(notice.image_url)} />
                          </div>
                        )}

                        <button 
                          onClick={() => handleRevokeNotice(notice.id)}
                          style={{ position: 'absolute', right: '15px', bottom: '15px', padding: '6px 12px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                        >
                          <Trash2 size={14} /> Thu hồi
                        </button>
                      </div>
                    )})}
                  </div>
                )}
             </div>
             <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setIsHistoryModalOpen(false)}>Đóng</button>
             </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ChatManager;
