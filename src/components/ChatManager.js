import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../supabase';
import { useConfig } from '../ConfigContext';
import { uploadToGDrive } from '../utils/googleDrive';
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
  MoreVertical,
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
  LayoutGrid
} from 'lucide-react';
import './ChatManager.css';

const ChatManager = ({ currentUser }) => {
  const { config } = useConfig();
  
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
  
  const scrollRef = useRef();

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
      let finalUrl = '';
      if (config.gdrive_enabled) {
        const gResult = await uploadToGDrive(file, config.gdrive_folder_id, config.gdrive_client_id, config.gdrive_api_key, config.gdrive_auth_type, config.gdrive_service_json);
        finalUrl = type === 'image' ? `https://drive.google.com/uc?export=view&id=${gResult.id}` : (gResult.webViewLink || gResult.webContentLink);
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

      await supabase.from('documents').insert([{
        mahv: selectedStudent.mahv,
        name: file.name,
        category: type === 'image' ? 'Ảnh' : 'Tài liệu',
        file_url: finalUrl,
        mime_type: file.type
      }]);
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

  const getInitials = (name) => {
    if (!name) return '??';
    const parts = name.split(' ');
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    return name.substring(0, 2).toUpperCase();
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
              <button className="icon-btn" onClick={() => fetchSummaries()}><RefreshCw size={20} /></button>
            </div>
          </div>

          <div className="chat-messages scrollable" ref={scrollRef}>
            {loadingMessages ? <div className="loading-center"><Loader2 size={32} className="spinner" /></div> : (
              messages.map((m, idx) => {
                const isMine = m.manv === (currentUser.manv || currentUser.username) && m.description !== 'PH';
                return (
                  <div key={m.id || idx} className={`message-row ${isMine ? 'mine' : 'theirs'}`}>
                     <div className="message-bubble">
                        {m.content && <div className="msg-text">{m.content}</div>}
                        {m.image_url && <div className="msg-image"><img src={m.image_url} alt="" onClick={() => window.open(m.image_url)} /></div>}
                        {m.file_url && (
                          <div className="msg-file" onClick={() => window.open(m.file_url)}>
                            <FileText size={20} /> <span>{m.file_name}</span>
                          </div>
                        )}
                        <div className="msg-time">{formatTime(new Date(m.created_at))}</div>
                     </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="chat-input-area">
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
                   <button className="storage-tab active">Hình ảnh ({documents.filter(d => d.category === 'Ảnh').length})</button>
                   <button className="storage-tab">File ({documents.filter(d => d.category !== 'Ảnh').length})</button>
                </div>
                <div className="empty-storage-msg">
                   Chưa có hình ảnh nào
                </div>
             </div>
          </div>
        </div>
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
    </div>
  );
};

export default ChatManager;
