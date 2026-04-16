import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase';
import { useConfig } from '../ConfigContext';
import { uploadToGDrive, deleteFromGDrive } from '../utils/googleDrive';
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
  Share2
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
  
  // Filters
  const [searchParent, setSearchParent] = useState('');
  const [classFilter, setClassFilter] = useState('Tất cả');
  const [dateFilter, setDateFilter] = useState('Hôm nay'); // 'Hôm nay', 'Tuần này', 'Tháng này', 'Tuỳ chọn'
  const [customRange, setCustomRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  
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
        const { data: classData } = await supabase.from('tbl_lop').select('*').neq('daxoa', 'Đã Xóa');
        if (classData) setClasses(classData);

        // Fetch Teachers
        const { data: nvData } = await supabase.from('tbl_nv').select('manv, tennv').in('role', ['Giáo viên', 'Trợ giảng']);
        if (nvData) setTeachers(nvData);

        // Fetch Students
        const { data: studentData } = await supabase.from('tbl_hv').select('*').neq('trangthai', 'Đã Nghỉ');
        if (studentData) setStudents(studentData);

        // Fetch Latest Messages
        await fetchSummaries();
      } catch (err) {
        console.error('Error fetching chat dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

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
  const parentSummaries = useMemo(() => {
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
    }).sort((a, b) => {
      // Sort by newest message first
      if (!a.lastTime) return 1;
      if (!b.lastTime) return -1;
      return b.lastTime - a.lastTime;
    });
  }, [students, classes, teachers, latestMessages, searchParent, classFilter]);

  // Quick Report Counts
  const reports = useMemo(() => {
    return {
      xinNghi: latestMessages.filter(m => (m.content || '').toLowerCase().includes('nghỉ')).length,
      baoThuoc: latestMessages.filter(m => (m.content || '').toLowerCase().includes('thuốc')).length,
      doiNguoi: latestMessages.filter(m => (m.content || '').toLowerCase().includes('đổi người')).length,
      guiTinNhan: latestMessages.length,
      veTre: latestMessages.filter(m => (m.content || '').toLowerCase().includes('muộn') || (m.content || '').toLowerCase().includes('trễ')).length,
    };
  }, [latestMessages]);

  // ----- Chat Logic -----
  useEffect(() => {
    if (!selectedStudent || view !== 'chat') return;

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
      if (type === 'image') {
        try {
          const compressed = await compressImage(file, 100);
          file = compressed;
        } catch (err) {
          console.error('Compression failed, using original file:', err);
        }
      }

      let finalUrl = '';
      if (config.gdrive_enabled) {
        console.log('Uploading to GDrive with folderId:', config.gdrive_folder_id);
        // Sử dụng helper uploadToGDrive để upload vào đúng folder và đúng phương thức auth
        const gResult = await uploadToGDrive(
          file,
          config.gdrive_folder_id?.trim(),
          config.gdrive_client_id,
          config.gdrive_api_key,
          config.gdrive_auth_type,
          config.gdrive_service_json
        );

        finalUrl = type === 'image' 
          ? `https://drive.google.com/thumbnail?id=${gResult.id}&sz=w1000` 
          : `https://drive.google.com/file/d/${gResult.id}/view`;
      } else {
        const fileName = `${selectedStudent.mahv}_${Date.now()}_${file.name}`;
        const folder = type === 'image' ? 'chat-images' : 'chat-files';
        const { error } = await supabase.storage.from('assets').upload(`${folder}/${fileName}`, file);
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
        // 1. Delete from GDrive if applicable
        if (config.gdrive_enabled && (message.image_url || message.file_url)) {
          const url = message.image_url || message.file_url;
          let driveId = '';
          if (url.includes('id=')) driveId = url.split('id=')[1]?.split('&')[0];
          else if (url.includes('/d/')) driveId = url.split('/d/')[1]?.split('/')[0];
          
          if (driveId) {
            try {
              await deleteFromGDrive(
                driveId,
                config.gdrive_client_id,
                config.gdrive_api_key,
                config.gdrive_auth_type,
                config.gdrive_service_json
              );
              console.log('Deleted file from Drive:', driveId);
            } catch (err) {
              console.warn('Could not delete file from Drive:', err);
            }
          }
        } else if (!config.gdrive_enabled && (message.image_url || message.file_url)) {
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
        file_mime_type: forwardingMessage.file_mime_type
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
        <div className="report-card xin-nghi">
          <span className="report-label">Xin nghỉ</span>
          <span className="report-value">{String(reports.xinNghi).padStart(2, '0')}</span>
        </div>
        <div className="report-card bao-thuoc">
          <span className="report-label">Báo thuốc</span>
          <span className="report-value">{String(reports.baoThuoc).padStart(2, '0')}</span>
        </div>
        <div className="report-card gui-tin-nhan">
          <span className="report-label">Gửi tin nhắn</span>
          <span className="report-value">{String(reports.guiTinNhan).padStart(2, '0')}</span>
        </div>
        <div className="report-card doi-nguoi">
          <span className="report-label">Báo đổi người đón trẻ</span>
          <span className="report-value">{String(reports.doiNguoi).padStart(2, '0')}</span>
        </div>
        <div className="report-card ve-tre">
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
                <td className="student-name-cell">{s.tenhv}</td>
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
    </div>
  );
};

export default ChatManager;
