import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase';
import { useConfig } from '../ConfigContext';
import { uploadToR2, deleteFromR2 } from '../utils/cloudflareR2';
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
  Bell
} from 'lucide-react';
import { compressImage } from '../utils/imageUtils';
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
  
  // Views
  const [view, setView] = useState('dashboard'); // 'dashboard' or 'chat'
  
  // Data
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [latestMessages, setLatestMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  
  // Filters
  const [searchParent, setSearchParent] = useState('');
  const [classFilter, setClassFilter] = useState('Tất cả');
  const [dateFilter, setDateFilter] = useState('Hôm nay'); // 'Hôm nay', 'Tuần này', 'Tháng này', 'Tuỳ chọn'
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
  const [announcementForm, setAnnouncementForm] = useState({ content: '', type: 'all', selectedClass: 'Tất cả' });
  const [announcementFiles, setAnnouncementFiles] = useState({ image: null, file: null });
  
  const scrollRef = useRef();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenu(null);
    if (activeMenu) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [activeMenu]);

  // ----- Initial Data Fetching -----
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch Classes
        const { data: classData } = await supabase.from('tbl_lop').select('*').or('daxoa.neq."Đã Xóa",daxoa.is.null');
        if (classData) setClasses(classData);

        // Fetch Teachers
        const { data: nvData } = await supabase.from('tbl_nv').select('manv, tennv').in('role', ['Giáo viên', 'Trợ giảng']);
        if (nvData) setTeachers(nvData);

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
      const day = startDate.getDay() || 7;
      startDate.setDate(startDate.getDate() - (day - 1));
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
    // 1. Group latest message per student
    const studentLatestMap = {};
    latestMessages.forEach(m => {
      if (!studentLatestMap[m.mahv]) {
        studentLatestMap[m.mahv] = m;
      }
    });

    // 2. Map students to summaries
    return students.map(s => {
      const lastMsg = studentLatestMap[s.mahv];
      const cls = classes.find(c => c.malop === s.malop);
      const teacher = teachers.find(t => t.manv === cls?.manv);

      // Determine notification type from content
      let notifType = 'TIN NHẮN';
      const content = (lastMsg?.content || '').toLowerCase();
      if (content.includes('nghỉ')) notifType = 'XIN NGHỈ';
      else if (content.includes('thuốc')) notifType = 'BÁO THUỐC';
      else if (content.includes('đổi người')) notifType = 'ĐỔI NGƯỜI ĐÓN';
      else if (content.includes('muộn') || content.includes('trễ')) notifType = 'XIN VỀ TRỄ';

      return {
        ...s,
        lastMsg,
        className: cls?.tenlop || s.malop || 'Chưa xếp lớp',
        teacherName: teacher?.tennv || cls?.giaovien || 'Chưa cập nhật',
        notifType: lastMsg ? notifType : null,
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
      if (statFilter === 'XIN_NGHI') matchesStat = s.notifType === 'XIN NGHỈ';
      else if (statFilter === 'BAO_THUOC') matchesStat = s.notifType === 'BÁO THUỐC';
      else if (statFilter === 'DOI_NGUOI') matchesStat = s.notifType === 'ĐỔI NGƯỜI ĐÓN';
      else if (statFilter === 'VE_TRE') matchesStat = s.notifType === 'XIN VỀ TRỄ';
      else if (statFilter === 'GUI_TIN_NHAN') matchesStat = !!s.lastMsg;

      return matchesStat;
    }).sort((a, b) => {
      // Sort by newest message first
      if (!a.lastTime) return 1;
      if (!b.lastTime) return -1;
      return b.lastTime - a.lastTime;
    });
  }, [baseSummaries, statFilter]);

  // Quick Report Counts
  const reports = useMemo(() => {
    return {
      xinNghi: baseSummaries.filter(s => s.notifType === 'XIN NGHỈ').length,
      baoThuoc: baseSummaries.filter(s => s.notifType === 'BÁO THUỐC').length,
      doiNguoi: baseSummaries.filter(s => s.notifType === 'ĐỔI NGƯỜI ĐÓN').length,
      guiTinNhan: baseSummaries.filter(s => !!s.lastMsg).length,
      veTre: baseSummaries.filter(s => s.notifType === 'XIN VỀ TRỄ').length,
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
      setInputText('');
      setMessages(prev => [...prev, data[0]]);
      setTimeout(scrollToBottom, 50);
    }
  };

  const handleFileUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file || !selectedStudent) return;

    setUploading(true);
    try {
      let fileToUpload = file;
      if (type === 'image') {
        try {
          const compressed = await compressImage(file, 100);
          fileToUpload = compressed;
        } catch (err) {
          console.error('Compression failed, using original file:', err);
        }
      }

      let finalUrl = '';
      if (config.r2_enabled) {
        finalUrl = await uploadToR2(
          fileToUpload,
          config.r2_endpoint,
          config.r2_access_key_id,
          config.r2_secret_access_key,
          config.r2_bucket_name,
          config.r2_public_url
        );
      } else {
        const fileName = `${selectedStudent.mahv}_${Date.now()}_${file.name}`;
        const folder = type === 'image' ? 'chat-images' : 'chat-files';
        const { error } = await supabase.storage.from('assets').upload(`${folder}/${fileName}`, fileToUpload);
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(`${folder}/${fileName}`);
        finalUrl = publicUrl;
      }

      const msgPayload = {
        mahv: selectedStudent.mahv,
        manv: currentUser.manv || currentUser.username,
        content: '',
        image_url: type === 'image' ? finalUrl : null,
        file_url: type !== 'image' ? finalUrl : null,
        file_name: file.name,
        file_mime_type: file.type
      };

      const { data } = await supabase.from('hv_messages').insert([msgPayload]).select();
      if (data) setMessages(prev => [...prev, data[0]]);

      const newDoc = {
        mahv: selectedStudent.mahv,
        name: file.name,
        category: type === 'image' ? 'Ảnh' : 'Tài liệu',
        file_url: finalUrl,
        mime_type: file.type
      };

      const { data: docData } = await supabase.from('documents').insert([newDoc]).select();
      if (docData) setDocuments(prev => [docData[0], ...prev]);
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setUploading(false);
    }
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

      const { error } = await supabase.from('hv_messages').insert(payloads);
      if (error) throw error;

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
    if (!announcementForm.content.trim() && !announcementFiles.image && !announcementFiles.file) {
      alert('Vui lòng nhập nội dung hoặc chọn tệp tin thông báo.');
      return;
    }

    setUploading(true);
    try {
      let imageUrl = null;
      let fileUrl = null;
      let fileName = '';
      let mimeType = '';

      // Handle Uploads
      if (announcementFiles.image) {
         imageUrl = await uploadToR2(announcementFiles.image, config.r2_endpoint, config.r2_access_key_id, config.r2_secret_access_key, config.r2_bucket_name, config.r2_public_url);
         fileName = announcementFiles.image.name;
         mimeType = announcementFiles.image.type;
      }
      if (announcementFiles.file) {
         fileUrl = await uploadToR2(announcementFiles.file, config.r2_endpoint, config.r2_access_key_id, config.r2_secret_access_key, config.r2_bucket_name, config.r2_public_url);
         fileName = announcementFiles.file.name;
         mimeType = announcementFiles.file.type;
      }

      // Target students
      let targetStudents = [];
      if (announcementForm.type === 'all') {
        targetStudents = students.map(s => s.mahv);
      } else {
        targetStudents = students.filter(s => s.malop === announcementForm.selectedClass).map(s => s.mahv);
      }

      if (targetStudents.length === 0) {
        alert('Không tìm thấy học viên nào để gửi thông báo.');
        return;
      }

      const payloads = targetStudents.map(mahv => ({
        mahv,
        manv: currentUser.manv || currentUser.username,
        content: announcementForm.content,
        image_url: imageUrl,
        file_url: fileUrl,
        file_name: fileName,
        file_mime_type: mimeType,
        description: 'THONG_BAO'
      }));

      const { error } = await supabase.from('hv_messages').insert(payloads);
      if (error) throw error;

      alert(`Đã đăng bảng tin thành công tới ${targetStudents.length} phụ huynh.`);
      setIsAnnouncementModalOpen(false);
      setAnnouncementForm({ content: '', type: 'all', selectedClass: 'Tất cả' });
      setAnnouncementFiles({ image: null, file: null });
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  if (view === 'chat' && selectedStudent) {
    return (
      <div className="chat-manager-layout chat-thread-view">
        <div className="chat-col chat-main-col" style={{ flex: 1 }}>
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
              messages.map((m, idx) => {
                const isMine = m.manv === (currentUser.manv || currentUser.username) && m.description !== 'PH';
                const msgId = m.id || `msg-${idx}-${m.created_at}`;
                return (
                  <div key={msgId} id={`msg-${m.id}`} className={`message-row ${isMine ? 'mine' : 'theirs'}`}>
                     <div className="message-bubble-wrapper">
                        <div className="message-bubble">
                           {m.is_pinned && <div className="pinned-badge"><Pin size={10} /> Đã ghim</div>}
                           {m.description === 'THONG_BAO' && <div className="announcement-badge"><Bell size={10} /> THÔNG BÁO</div>}
                           {m.content && <div className="msg-text">{m.content}</div>}
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
                           {m.file_url && (
                             <div className="msg-file" onClick={() => window.open(m.file_url)}>
                               <FileText size={20} /> <span>{m.file_name}</span>
                             </div>
                           )}
                           <div className="msg-time">{formatTime(new Date(m.created_at))}</div>
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
              <form className="chat-input-toolbar" onSubmit={handleSendMessage}>
                <div className="toolbar-left">
                   <label className="toolbar-btn">
                      <ImageIcon size={20} />
                      <input type="file" accept="image/*" hidden onChange={(e) => handleFileUpload(e, 'image')} />
                   </label>
                   <label className="toolbar-btn">
                      <Paperclip size={20} />
                      <input type="file" hidden onChange={(e) => handleFileUpload(e, 'file')} />
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

        <div className="chat-col details-col" style={{ width: '300px' }}>
          <div className="details-header">
             <div className="large-avatar-circle" style={{ backgroundColor: '#ec4899' }}>
               {selectedStudent.imgpath ? <img src={selectedStudent.imgpath} alt="" /> : <span>{getInitials(selectedStudent.tenhv)}</span>}
             </div>
             <h3 className="details-main-title">{selectedStudent.tenhv} - {selectedStudent.sdtba || selectedStudent.sdtme || 'N/A'} - {selectedStudent.className}</h3>
          </div>
          
          <div className="details-body scrollable">
             <div className="details-section">
                <h4 className="section-header-title"><LayoutGrid size={18} /> Thông tin khách hàng</h4>
                <div className="info-list-modern">
                   <div className="info-item-modern"><User size={16} /> <span>{selectedStudent.tenhv}</span></div>
                   <div className="info-item-modern"><Phone size={16} /> <span>{selectedStudent.sdtba || selectedStudent.sdtme || 'N/A'}</span></div>
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
      {/* Dashboard Header with Announcement Trigger */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '0 5px' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#1e293b' }}>Quản lý trao đổi phụ huynh</h2>
          <button 
            onClick={() => setIsAnnouncementModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)' }}
          >
             <Bell size={18} /> Đăng Bảng Tin (Announcement)
          </button>
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
      </div>

      {/* Main Table Section */}
      <div className="chat-table-wrapper">
        <table className="chat-data-table">
          <thead>
            <tr>
              <th style={{ width: '25%' }}>Họ và tên</th>
              <th style={{ width: '15%' }}>Số điện thoại</th>
              <th style={{ width: '10%' }}>Lớp</th>
              <th style={{ width: '20%' }}>Giáo viên</th>
              <th style={{ width: '20%' }}>Thông báo mới</th>
              <th style={{ width: '10%' }}>Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="no-results"><Loader2 size={24} className="spinner" /> Đang tải dữ liệu...</td></tr>
            ) : parentSummaries.length === 0 ? (
              <tr><td colSpan="6" className="no-results">Không tìm thấy thông tin phù hợp</td></tr>
            ) : parentSummaries.map(s => (
              <tr key={s.mahv} onClick={() => { setSelectedStudent(s); setView('chat'); }}>
                <td className="student-name-cell">
                  {s.tenhv}
                  {unreadCounts[s.mahv] > 0 && (
                    <span style={{ marginLeft: '10px', background: '#ef4444', color: 'white', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', fontWeight: 'bold' }}>
                      +{unreadCounts[s.mahv]}
                    </span>
                  )}
                </td>
                <td className="phone-cell">{s.sdtba || s.sdtme || s.mahv}</td>
                <td>{s.className}</td>
                <td>{s.teacherName}</td>
                <td>
                  {s.notifType ? (
                    <span className={`badge-notification badge-${s.notifType.toLowerCase().replace(/ /g, '-')}`}>
                      {s.notifType}
                    </span>
                  ) : <span style={{color: '#cbd5e1'}}>--</span>}
                </td>
                <td className="time-cell">{s.lastTime ? formatTime(s.lastTime) : '--:--'}</td>
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
                        style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: announcementForm.type === 'all' ? '#ede9fe' : 'white', color: announcementForm.type === 'all' ? '#8b5cf6' : '#64748b', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Tất cả học viên
                      </button>
                      <button 
                        className={`mode-btn ${announcementForm.type === 'class' ? 'active' : ''}`}
                        onClick={() => setAnnouncementForm({...announcementForm, type: 'class'})}
                        style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: announcementForm.type === 'class' ? '#ede9fe' : 'white', color: announcementForm.type === 'class' ? '#8b5cf6' : '#64748b', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Học viên theo lớp
                      </button>
                   </div>
                </div>

                {announcementForm.type === 'class' && (
                   <div style={{ marginBottom: '20px' }} className="fade-in">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: '#334155' }}>Chọn lớp:</label>
                      <select 
                        className="class-select-styled" 
                        style={{ width: '100%', padding: '12px' }}
                        value={announcementForm.selectedClass}
                        onChange={e => setAnnouncementForm({...announcementForm, selectedClass: e.target.value})}
                      >
                        <option value="Tất cả">-- Chọn lớp --</option>
                        {classes.map(c => <option key={c.malop} value={c.malop}>{c.tenlop}</option>)}
                      </select>
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
                      <input type="file" accept="image/*" onChange={e => setAnnouncementFiles({...announcementFiles, image: e.target.files[0]})} />
                   </div>
                   <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: '#334155' }}><File size={16} /> Đính kèm File:</label>
                      <input type="file" onChange={e => setAnnouncementFiles({...announcementFiles, file: e.target.files[0]})} />
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
    </div>
  );
};

export default ChatManager;
