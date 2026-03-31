import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
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
  ChevronRight,
  RefreshCw,
  FileText,
  File,
  Loader2,
  Pin,
  Calendar,
  Phone,
  MapPin,
  Hash
} from 'lucide-react';
import './ChatManager.css';

const ChatManager = ({ currentUser }) => {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchClass, setSearchClass] = useState('');
  const [searchStudent, setSearchStudent] = useState('');
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  
  const scrollRef = useRef();

  // ----- Load Classes -----
  useEffect(() => {
    const fetchClasses = async () => {
      const { data, error } = await supabase
        .from('tbl_lop')
        .select('*')
        .neq('daxoa', 'Đã Xóa')
        .order('tenlop');
      if (data) setClasses(data);
    };
    fetchClasses();
  }, []);

  // ----- Load Students when Class is selected -----
  useEffect(() => {
    if (!selectedClass) {
      setStudents([]);
      return;
    }
    const fetchStudents = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('tbl_hv')
        .select('*')
        .eq('malop', selectedClass.malop)
        .neq('trangthai', 'Đã Nghỉ')
        .order('tenhv');
      if (data) setStudents(data);
      setLoading(false);
    };
    fetchStudents();
  }, [selectedClass]);

  // ----- Load Messages and Realtime -----
  useEffect(() => {
    if (!selectedStudent) {
      setMessages([]);
      setDocuments([]);
      return;
    }

    const fetchMessages = async () => {
      setLoadingMessages(true);
      const { data, error } = await supabase
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

    // Realtime subscription - IMPORTANT: You must enable "Realtime" for the "hv_messages" table in Supabase Dashboard
    const channel = supabase
      .channel(`chat_${selectedStudent.mahv}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'hv_messages', 
        filter: `mahv=eq.${selectedStudent.mahv}` 
      }, (payload) => {
        setMessages(prev => {
          // Prevent duplicates if optimistic update already added it
          const exists = prev.some(m => m.id === payload.new.id || (m.created_at === payload.new.created_at && m.content === payload.new.content));
          if (exists) return prev;
          return [...prev, payload.new];
        });
        setTimeout(scrollToBottom, 50);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedStudent]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!selectedStudent || (!inputText.trim())) return;

    const newMessage = {
      mahv: selectedStudent.mahv,
      manv: currentUser.manv || currentUser.username,
      content: inputText
    };

    const { data, error } = await supabase.from('hv_messages').insert([newMessage]).select();
    if (!error && data) {
      setInputText('');
      // Optimistic update if Realtime is slow or disabled
      setMessages(prev => {
        const exists = prev.some(m => m.id === data[0].id);
        if (exists) return prev;
        return [...prev, data[0]];
      });
      setTimeout(scrollToBottom, 50);
    } else {
      console.error(error);
      alert('Lỗi gửi tin nhắn');
    }
  };

  const handleFileUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file || !selectedStudent) return;

    setUploading(true);
    try {
      const fileName = `${selectedStudent.mahv}_${Date.now()}_${file.name}`;
      const folder = type === 'image' ? 'chat-images' : 'chat-files';
      
      const { data, error } = await supabase.storage
        .from('assets') // Adjust if you have another bucket
        .upload(`${folder}/${fileName}`, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(`${folder}/${fileName}`);

      // Insert message with file
      const msgPayload = {
        mahv: selectedStudent.mahv,
        manv: currentUser.manv || currentUser.username,
        content: '',
        image_url: type === 'image' ? publicUrl : null,
        file_url: type !== 'image' ? publicUrl : null,
        file_name: file.name,
        file_mime_type: file.type
      };

      await supabase.from('hv_messages').insert([msgPayload]);

      // Also add to documents table for persistence
      await supabase.from('documents').insert([{
        mahv: selectedStudent.mahv,
        name: file.name,
        category: type === 'image' ? 'Ảnh' : 'Tài liệu',
        file_url: publicUrl,
        mime_type: file.type
      }]);

      // Refresh docs
      const { data: newDocs } = await supabase
        .from('documents')
        .select('*')
        .eq('mahv', selectedStudent.mahv)
        .order('created_at', { ascending: false });
      if (newDocs) setDocuments(newDocs);

    } catch (err) {
      console.error(err);
      alert('Lỗi tải tệp lên');
    } finally {
      setUploading(false);
    }
  };

  const filteredClasses = classes.filter(c => 
    c.tenlop?.toLowerCase().includes(searchClass.toLowerCase()) || 
    c.malop?.toLowerCase().includes(searchClass.toLowerCase())
  );

  const filteredStudents = students.filter(s => 
    s.tenhv?.toLowerCase().includes(searchStudent.toLowerCase()) || 
    s.mahv?.toLowerCase().includes(searchStudent.toLowerCase())
  );

  return (
    <div className="chat-manager-layout">
      {/* 1st Column: Class List */}
      <div className="chat-col class-list-col">
        <div className="col-header">
          <h3>Lớp Học</h3>
          <div className="search-box">
            <Search size={16} />
            <input 
              type="text" 
              placeholder="Tìm lớp..." 
              value={searchClass}
              onChange={(e) => setSearchClass(e.target.value)}
            />
          </div>
        </div>
        <div className="col-body scrollable">
          {filteredClasses.map(c => (
            <div 
              key={c.malop} 
              className={`list-item class-item ${selectedClass?.malop === c.malop ? 'active' : ''}`}
              onClick={() => {
                setSelectedClass(c);
                setSelectedStudent(null);
              }}
            >
              <div className="class-icon"><Users size={18} /></div>
              <div className="item-info">
                <span className="item-title">{c.tenlop}</span>
                <span className="item-subtitle">{c.malop}</span>
              </div>
              <ChevronRight size={14} className="arrow" />
            </div>
          ))}
        </div>
      </div>

      {/* 2nd Column: Student List */}
      <div className="chat-col student-list-col">
        <div className="col-header">
          <h3>Học Sinh</h3>
          <div className="search-box">
            <Search size={16} />
            <input 
              type="text" 
              placeholder="Tìm học sinh/mã..." 
              value={searchStudent}
              onChange={(e) => setSearchStudent(e.target.value)}
            />
          </div>
        </div>
        <div className="col-body scrollable">
          {loading ? (
             <div className="loading-center"><Loader2 size={24} className="spinner" /></div>
          ) : selectedClass ? (
            filteredStudents.length > 0 ? filteredStudents.map(s => (
              <div 
                key={s.mahv} 
                className={`list-item student-item ${selectedStudent?.mahv === s.mahv ? 'active' : ''}`}
                onClick={() => setSelectedStudent(s)}
              >
                <div className="student-avatar">
                  {s.imgpath ? (
                    <img src={s.imgpath} alt="" />
                  ) : (
                    <div className="avatar-placeholder">{s.tenhv?.charAt(0)}</div>
                  )}
                </div>
                <div className="item-info">
                  <div className="item-top">
                    <span className="item-title text-truncate">{s.tenhv}</span>
                    <span className="item-time">10:45</span>
                  </div>
                  <div className="item-preview text-truncate">ID: {s.mahv}</div>
                </div>
              </div>
            )) : <div className="empty-state">Không có học sinh</div>
          ) : (
            <div className="empty-state">Chọn lớp trước</div>
          )}
        </div>
      </div>

      {/* 3rd Column: Chat Main View */}
      <div className="chat-col chat-main-col">
        {!selectedStudent ? (
          <div className="chat-welcome">
            <div className="welcome-icon"><MessageSquare size={64} /></div>
            <h2>Kênh trao đổi với Phụ Huynh</h2>
            <p>Chọn một phụ huynh trong danh sách để bắt đầu hội thoại.</p>
          </div>
        ) : (
          <>
            <div className="chat-main-header">
              <div className="header-left">
                <div className="header-avatar">
                   {selectedStudent.imgpath ? (
                     <img src={selectedStudent.imgpath} alt="" />
                   ) : (
                     <div className="avatar-placeholder">{selectedStudent.tenhv?.charAt(0)}</div>
                   )}
                </div>
                <div className="header-info">
                  <h4>{selectedStudent.tenhv} - {selectedStudent.mahv}</h4>
                  <span className="status-online">Thành viên: Phụ huynh & {currentUser.tennv || 'Nhân viên'}</span>
                </div>
              </div>
              <div className="header-right">
                <button className="icon-btn" title="Tìm kiếm"><Search size={20} /></button>
                <button className="icon-btn" title="Làm mới tin nhắn" onClick={() => {
                  setLoadingMessages(true);
                  supabase.from('hv_messages')
                    .select('*')
                    .eq('mahv', selectedStudent.mahv)
                    .order('created_at', { ascending: true })
                    .then(({ data }) => {
                      if (data) setMessages(data);
                      setLoadingMessages(false);
                      setTimeout(scrollToBottom, 100);
                    });
                }}><RefreshCw size={20} /></button>
                <button className="icon-btn" title="Thêm"><MoreVertical size={20} /></button>
              </div>
            </div>

            <div className="chat-messages scrollable" ref={scrollRef}>
              {loadingMessages ? (
                <div className="loading-messages"><Loader2 size={32} className="spinner" /></div>
              ) : (
                <>
                  <div className="chat-date-divider"><span>Bắt đầu cuộc hội thoại</span></div>
                  {messages.map((m, idx) => {
                    const isMine = m.manv === (currentUser.manv || currentUser.username) && m.description !== 'PH';
                    return (
                      <div key={m.id || idx} className={`message-row ${isMine ? 'mine' : 'theirs'}`}>
                        <div className="message-bubble">
                          {m.content && <div className="msg-text">{m.content}</div>}
                          {m.image_url && (
                             <div className="msg-image">
                               <img src={m.image_url} alt="image_content" onClick={() => window.open(m.image_url, '_blank')} />
                             </div>
                          )}
                          {m.file_url && (
                            <div className="msg-file" onClick={() => window.open(m.file_url, '_blank')}>
                              <div className="file-icon"><FileText size={24} /></div>
                              <div className="file-info">
                                <span className="file-name">{m.file_name || 'Tài liệu'}</span>
                                <span className="file-meta">{m.file_mime_type?.split('/')[1]?.toUpperCase() || 'FILE'}</span>
                              </div>
                              <Download size={18} className="dl-icon" />
                            </div>
                          )}
                          <div className="msg-time">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            <div className="chat-input-area">
              <form className="chat-input-toolbar" onSubmit={handleSendMessage}>
                <div className="toolbar-left">
                   <label className="toolbar-btn">
                     <ImageIcon size={20} />
                     <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'image')} />
                   </label>
                   <label className="toolbar-btn">
                     <Paperclip size={20} />
                     <input type="file" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'file')} />
                   </label>
                </div>
                <input 
                  type="text" 
                  placeholder="Nhập tin nhắn tới đây... (Shift+Enter xuống dòng)" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={uploading}
                />
                <button type="submit" className="send-btn" disabled={!inputText.trim() || uploading}>
                   {uploading ? <Loader2 size={20} className="spinner" /> : <Send size={20} />}
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* 4th Column: Detail / File Storage */}
      {selectedStudent && (
        <div className="chat-col details-col">
          <div className="details-header">
             <div className="large-avatar">
               {selectedStudent.imgpath ? (
                 <img src={selectedStudent.imgpath} alt="" />
               ) : (
                 <div className="avatar-placeholder">{selectedStudent.tenhv?.charAt(0)}</div>
               )}
             </div>
             <h3>{selectedStudent.tenhv}</h3>
             <span className="id-tag">ID: {selectedStudent.mahv}</span>
          </div>

          <div className="details-body scrollable">
             <div className="details-section">
                <h4><User size={16} /> Thông tin khách hàng</h4>
                <div className="info-list">
                   <div className="info-item">
                      <Hash size={14} /> <span>{selectedStudent.mahv}</span>
                   </div>
                   <div className="info-item">
                      <Phone size={14} /> <span>{selectedStudent.sdtba || selectedStudent.sdtme || 'Chưa cập nhật'}</span>
                   </div>
                   <div className="info-item">
                      <MapPin size={14} /> <span>{selectedStudent.diachi || 'Chưa cập nhật'}</span>
                   </div>
                   <div className="info-item">
                      <Calendar size={14} /> <span>Lớp: {selectedClass?.tenlop}</span>
                   </div>
                </div>
             </div>

             <div className="details-section">
                <h4><Users size={16} /> Thành viên (2)</h4>
                <div className="member-list">
                   <div className="member-item">
                      <div className="member-avatar adm">AD</div>
                      <div className="member-info">
                         <span className="member-name">{currentUser.tennv || 'Nhân viên'}</span>
                         <span className="member-role">Quản trị viên</span>
                      </div>
                   </div>
                   <div className="member-item">
                      <div className="member-avatar ph">PH</div>
                      <div className="member-info">
                         <span className="member-name">{selectedStudent.tenhv}</span>
                         <span className="member-role">Phụ huynh</span>
                      </div>
                   </div>
                </div>
             </div>

             <div className="details-section">
                <div className="section-title-row">
                   <h4><File size={16} /> Kho lưu trữ</h4>
                   <button className="text-btn">Xem tất cả</button>
                </div>
                <div className="tabs-mini">
                   <button className="tab-mini active">Tài liệu ({documents.length})</button>
                </div>
                <div className="file-grid">
                   {documents.slice(0, 6).map(doc => (
                     <div key={doc.id} className="file-thumb" title={doc.name} onClick={() => window.open(doc.file_url, '_blank')}>
                        <div className="thumb-icon">
                          {doc.category === 'Ảnh' ? <ImageIcon size={20} /> : <FileText size={20} />}
                        </div>
                        <span className="thumb-name">{doc.name}</span>
                     </div>
                   ))}
                   {documents.length === 0 && <div className="no-files">Chưa có tập tin</div>}
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatManager;
