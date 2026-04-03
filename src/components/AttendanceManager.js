import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import * as XLSX from 'xlsx';
import {
  Users, User, Search, Download, Calendar, Filter, X, CheckSquare, Save, Loader2, BookOpen
} from 'lucide-react';
import { useConfig } from '../ConfigContext';
import StudentAttendanceCalendar from './StudentAttendanceCalendar';
import './AttendanceManager.css';

export default function AttendanceManager({ students, showMessage }) {
  const [viewMode, setViewMode] = useState('class'); // 'class' or 'student'
  const [classes, setClasses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Filters
  const [dateFilter, setDateFilter] = useState('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Data
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [aggregatedData, setAggregatedData] = useState([]);
  const [uniqueDates, setUniqueDates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewCalendarStudent, setViewCalendarStudent] = useState(null);
  const [showMobileDetails, setShowMobileDetails] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState([]);
  const { config } = useConfig();
  const [currentUser, setCurrentUser] = useState(null);

  // Marking UI states
  const [markingMode, setMarkingMode] = useState(false);
  const [attDate, setAttDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [attStudents, setAttStudents] = useState([]);
  const [attRecords, setAttRecords] = useState({});
  const [lessonContent, setLessonContent] = useState('');

  // Fetch classes on mount
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const { data } = await supabase.from('tbl_lop').select('*').order('tenlop');
        if (data) setClasses(data);
      } catch (err) { console.error(err); }
    };
    const fetchEmployees = async () => {
      try {
        const { data } = await supabase.from('tbl_nv').select('*');
        if (data) setEmployees(data);
      } catch (err) { console.error(err); }
    };

    const sessionStr = localStorage.getItem('auth_session');
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      setCurrentUser(session.user);
    }
    const fetchTodayAttendance = async () => {
      try {
        const todayIso = new Date().toISOString().split('T')[0];
        const { data } = await supabase.from('tbl_diemdanh').select('malop, mahv').eq('ngay', todayIso).eq('trangthai', 'Có mặt');
        if (data) setTodayAttendance(data);
      } catch (err) { console.error(err); }
    };

    fetchClasses();
    fetchEmployees();
    fetchTodayAttendance();
  }, []);

  // Fetch student marking data if in marking mode
  useEffect(() => {
    const loadMarkingData = async () => {
      if (!markingMode || !selectedId || viewMode !== 'class') { setAttStudents([]); setAttRecords({}); return; }
      setLoading(true);
      try {
        // Lấy tất cả học sinh có mã lớp tương ứng (không lọc trạng thái ở đây)
        const cluster = students.filter(s => {
          const smalop = (s.malop || '').toString().trim().toLowerCase();
          const selId = (selectedId || '').toString().trim().toLowerCase();
          let matches = (smalop === selId);
          if (!matches && s.malop_list) {
            if (Array.isArray(s.malop_list)) matches = s.malop_list.some(m => (m || '').toString().trim().toLowerCase() === selId);
            else if (typeof s.malop_list === 'string') matches = s.malop_list.toLowerCase().includes(selId);
          }
          return matches && (s.trangthai || '').trim().toLowerCase() !== 'đã nghỉ';
        });
        setAttStudents(cluster);

        const { data: rec } = await supabase.from('tbl_diemdanh').select('*').eq('malop', selectedId).eq('ngay', attDate);
        const rMap = {};
        cluster.forEach(student => {
          const existing = (rec || []).find(r => r.mahv === student.mahv);
          if (existing) {
            rMap[student.mahv] = { trangthai: existing.trangthai, ghichu: existing.ghichu, id: existing.id };
          } else {
            rMap[student.mahv] = { trangthai: 'Có mặt', ghichu: '' };
          }
        });
        setAttRecords(rMap);
        // Load lesson content
        const { data: nd } = await supabase.from('tbl_noidungday').select('noidungday').eq('malop', selectedId).eq('ngay', attDate).maybeSingle();
        setLessonContent(nd ? nd.noidungday : '');
      } catch (err) { console.error(err); }
      setLoading(false);
    };
    loadMarkingData();
  }, [markingMode, selectedId, attDate, viewMode, students]);

  const handleUpdateMarkRecord = (mahv, field, value) => {
    setAttRecords(prev => ({ ...prev, [mahv]: { ...(prev[mahv] || {}), [field]: value } }));
  };

  const handleSaveAttendance = async () => {
    if (!selectedId) return showMessage('error', 'Chưa chọn lớp!');
    setLoading(true);
    try {
      // 1. Re-fetch existing records for this day/class to avoid race conditions
      const { data: currentRecs } = await supabase.from('tbl_diemdanh').select('id, mahv').eq('malop', selectedId).eq('ngay', attDate);
      const dbIdMap = {};
      (currentRecs || []).forEach(r => { dbIdMap[r.mahv] = r.id; });

      for (const st of attStudents) {
        const localRec = attRecords[st.mahv];
        if (!localRec || !localRec.trangthai) continue;
        
        const payload = {
          mahv: st.mahv, malop: selectedId, ngay: attDate,
          trangthai: localRec.trangthai, ghichu: localRec.ghichu || '',
          manv: currentUser?.manv || currentUser?.username || 'admin'
        };
        
        const existingId = localRec.id || dbIdMap[st.mahv];
        
        if (existingId) {
          await supabase.from('tbl_diemdanh').update(payload).eq('id', existingId);
        } else {
          // Database handles ID generation automatically
          const { error: insErr } = await supabase.from('tbl_diemdanh').insert([payload]);
          if (insErr) throw insErr;
        }
      }

      // 3. Save lesson content (tbl_noidungday)
      const { data: ndExists } = await supabase.from('tbl_noidungday').select('id').eq('malop', selectedId).eq('ngay', attDate).maybeSingle();
      if (ndExists) {
        await supabase.from('tbl_noidungday').update({ noidungday: lessonContent }).eq('id', ndExists.id);
      } else {
        // Table tbl_noidungday has identity column, no manual ID needed
        await supabase.from('tbl_noidungday').insert([{ malop: selectedId, ngay: attDate, noidungday: lessonContent }]);
      }

      showMessage('success', 'Lưu điểm danh & nội dung dạy thành công!');
      // Update the report data too
      const { data: fresh } = await supabase.from('tbl_diemdanh').select('*').eq('malop', selectedId).gte('ngay', attDate).lte('ngay', attDate);
      if (fresh) {
        setAttendanceRecords(prev => {
          const filtered = prev.filter(r => !(r.malop === selectedId && r.ngay === attDate));
          return [...filtered, ...fresh];
        });
      }
    } catch (err) { console.error(err); showMessage('error', 'Lỗi lưu điểm danh'); }
    setLoading(false);
  };

  // Reset selection when changing view mode
  useEffect(() => {
    setSelectedId(null);
    setSearchTerm('');
  }, [viewMode]);

  // Fetch attendance from tbl_diemdanh
  useEffect(() => {
    const fetchAttendance = async () => {
      if (!selectedId) {
        setAttendanceRecords([]);
        return;
      }
      setLoading(true);
      try {
        let query = supabase.from('tbl_diemdanh').select('*');
        if (viewMode === 'class') {
          query = query.eq('malop', selectedId);
          const stdIds = students.filter(s => {
            const smalop = (s.malop || '').toString().trim().toLowerCase();
            const selId = (selectedId || '').toString().trim().toLowerCase();
            let matches = (smalop === selId);
            if (!matches && s.malop_list) {
              if (Array.isArray(s.malop_list)) matches = s.malop_list.some(m => (m || '').toString().trim().toLowerCase() === selId);
              else if (typeof s.malop_list === 'string') matches = s.malop_list.toLowerCase().includes(selId);
            }
            return matches && (s.trangthai || '').trim().toLowerCase() !== 'đã nghỉ';
          }).map(s => s.mahv);

          if (stdIds.length === 0) {
            setAttendanceRecords([]);
            setLoading(false);
            return;
          }
          query = query.in('mahv', stdIds);
        } else {
          // Xem theo Học Sinh: lấy tất cả các lớp mà học sinh này tham gia
          query = query.eq('mahv', selectedId);
        }

        // Date logic
        const now = new Date();
        let startIso = null;
        let endIso = null;

        if (dateFilter === 'this_week') {
          const day = now.getDay() || 7;
          const start = new Date(now);
          start.setDate(now.getDate() - day + 1);
          const end = new Date(start);
          end.setDate(start.getDate() + 6);
          startIso = start.toISOString().split('T')[0];
          endIso = end.toISOString().split('T')[0];
        } else if (dateFilter === 'this_month') {
          startIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
          endIso = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        } else if (dateFilter === 'last_month') {
          startIso = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
          endIso = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
        } else if (dateFilter === 'custom') {
          if (customStart) startIso = customStart;
          if (customEnd) endIso = customEnd;
        }

        if (startIso) query = query.gte('ngay', startIso);
        if (endIso) query = query.lte('ngay', endIso);

        const { data, error } = await query;
        if (error) {
          console.warn("Lỗi tải điểm danh, có thể bảng tbl_diemdanh chưa được tạo:", error.message);
          setAttendanceRecords([]);
        } else {
          setAttendanceRecords(data || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAttendance();
  }, [selectedId, viewMode, dateFilter, customStart, customEnd]);

  useEffect(() => {
    const aggregateData = async () => {
      let baseStudents = [];
      if (viewMode === 'class') {
        if (viewMode === 'class') {
          baseStudents = students.filter(s => {
            const smalop = (s.malop || '').toString().trim().toLowerCase();
            const selId = (selectedId || '').toString().trim().toLowerCase();
            let matches = (smalop === selId);
            if (!matches && s.malop_list) {
              if (Array.isArray(s.malop_list)) matches = s.malop_list.some(m => (m || '').toString().trim().toLowerCase() === selId);
              else if (typeof s.malop_list === 'string') matches = s.malop_list.toLowerCase().includes(selId);
            }
            return matches && (s.trangthai || '').trim().toLowerCase() !== 'đã nghỉ';
          });
        }
      } else if (viewMode === 'student' && selectedId) {
        const s = students.find(s => s.mahv === selectedId);
        if (s) baseStudents = [s];
      }

      const agg = baseStudents.map(student => {
        const records = attendanceRecords.filter(r => r.mahv === student.mahv);

        const normalizeStatus = (s) => (s || '').trim().toLowerCase();

        // Loại bỏ các bản ghi trùng lặp trong cùng một ngày (chỉ lấy bản ghi cuối cùng)
        const uniqueDayRecords = Array.from(new Map(records.map(r => [r.ngay, r])).values());

        const coMat = uniqueDayRecords.filter(r => normalizeStatus(r.trangthai).includes('có mặt')).length;
        const nghiPhep = uniqueDayRecords.filter(r => normalizeStatus(r.trangthai).includes('nghỉ phép') && !normalizeStatus(r.trangthai).includes('không')).length;
        const khongPhep = uniqueDayRecords.filter(r => normalizeStatus(r.trangthai).includes('không phép')).length;

        const dailyRecords = {};
        const dailyRemarks = {};
        records.forEach(r => {
          dailyRecords[r.ngay] = r.trangthai;
          dailyRemarks[r.ngay] = r.ghichu;
        });

        return {
          mahv: student.mahv,
          tenhv: student.tenhv,
          coMat,
          nghiPhep,
          khongPhep,
          tongBuoi: records.length,
          dailyRecords,
          dailyRemarks
        };
      });

      // Extract unique dates present in records, sort newest to oldest
      const dates = [...new Set(attendanceRecords.map(r => r.ngay))]
        .sort((a, b) => new Date(b) - new Date(a));
      setUniqueDates(dates);

      setAggregatedData(agg);
    };
    aggregateData();
  }, [attendanceRecords, viewMode, selectedId, students]);

  // Left List Data
  const getListItems = () => {
    let items = [];
    if (viewMode === 'class') {
      items = classes
        .filter(c => c.malop && c.malop.trim() !== '')
        .map(c => {
          // Calculate student count for class
          const classStudents = students.filter(s => {
            const smalop = (s.malop || '').toString().trim().toLowerCase();
            const selId = (c.malop || '').toString().trim().toLowerCase();
            let matches = (smalop === selId);
            if (!matches && s.malop_list) {
              if (Array.isArray(s.malop_list)) matches = s.malop_list.some(m => (m || '').toString().trim().toLowerCase() === selId);
              else if (typeof s.malop_list === 'string') matches = s.malop_list.toLowerCase().includes(selId);
            }
            return matches && (s.trangthai || '').trim().toLowerCase() !== 'đã nghỉ';
          });
          
          const totalCount = classStudents.length;

          // Calculate "present today" count
          const presentTodayCount = todayAttendance.filter(a => 
            a.malop === c.malop && 
            classStudents.some(s => s.mahv === a.mahv)
          ).length;

          // Find teacher
          const teacher = employees.find(e => e.manv === c.manv);

          return {
            id: c.malop,
            title: c.tenlop || 'Lớp chưa đặt tên',
            siso: `${presentTodayCount} / ${totalCount}`,
            teacherName: teacher ? teacher.tennv : (c.manv || 'Chưa phân công')
          };
        });
    } else {
      items = students
        .filter(s => s.mahv && s.mahv.trim() !== '' && s.trangthai !== 'Đã Nghỉ' && s.trangthai !== 'Bảo Lưu')
        .map(s => {
          let list = [];
          if (s.malop) list.push(s.malop);
          if (Array.isArray(s.malop_list)) list = [...new Set([...list, ...s.malop_list])];
          
          const classNames = list.map(ml => classes.find(c => c.malop === ml)?.tenlop || ml).join(', ');

          return {
            id: s.mahv,
            title: s.tenhv || s.name || s.mahv,
            subtitle: `Lớp: ${classNames || 'Chưa xếp lớp'}`
          };
        });
    }

    if (searchTerm) {
      items = items.filter(i =>
        i.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.id?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return items;
  };

  const listItems = getListItems();

  const handleExport = () => {
    if (aggregatedData.length === 0) return showMessage('error', 'Không có dữ liệu điểm danh để xuất');
    const ws = XLSX.utils.json_to_sheet(aggregatedData.map((d, index) => {
      const rowData = {
        "STT": index + 1,
        "Mã HS": d.mahv,
        "Tên HS": d.tenhv,
        "Tổng Kết (CM/P/KP)": `${d.coMat}/${d.nghiPhep}/${d.khongPhep}`
      };

      uniqueDates.forEach(date => {
        const formattedDate = new Date(date).toLocaleDateString('vi-VN');
        const st = d.dailyRecords[date];
        let strSt = '-';
        if (st) {
          const s = st.toLowerCase().trim();
          if (s.includes('có mặt')) strSt = 'CM';
          else if (s.includes('nghỉ phép') && !s.includes('không')) strSt = 'P';
          else if (s.includes('không phép')) strSt = 'K';
          else strSt = st;
        }
        rowData[formattedDate] = strSt;
      });
      return rowData;
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DiemDanh");
    XLSX.writeFile(wb, `ThongKe_DiemDanh_${selectedId || 'BaoCao'}.xlsx`);
  };

  const renderStatus = (status, remark) => {
    if (!status) return <span style={{ color: '#cbd5e1' }}>-</span>;
    const s = (status || '').trim().toLowerCase();
    let symb = <span>{status}</span>;
    if (s === 'có mặt') symb = <span className="text-success font-bold" style={{ fontSize: '1.2rem' }}>✓</span>;
    else if (s === 'nghỉ phép') symb = <span className="text-warning font-bold">P</span>;
    else if (s === 'nghỉ không phép') symb = <span className="text-danger font-bold">K</span>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }} title={remark || ''}>
        {symb}
        {remark && (
          <div style={{ fontSize: '10px', color: '#64748b', fontStyle: 'italic', maxWidth: '80px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '-2px' }}>
            {remark}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`attendance-manager animate-fade-in ${showMobileDetails ? 'mobile-show-details' : ''}`}>
      <div className="attendance-layout">

        {/* Left Pane */}
        <div className="attendance-list-pane">
          {/* View Toggles */}
          <div className="view-toggles">
            <button
              className={`toggle-btn ${viewMode === 'class' ? 'active' : ''}`}
              onClick={() => setViewMode('class')}
            >
              <Users size={14} /> Theo Lớp
            </button>
            <button
              className={`toggle-btn ${viewMode === 'student' ? 'active' : ''}`}
              onClick={() => setViewMode('student')}
            >
              <User size={14} /> Theo Học Sinh
            </button>
          </div>

          <div className="search-box-sm">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder={`Tìm ${viewMode === 'class' ? 'lớp' : 'học sinh'}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', fontSize: '0.95rem', fontWeight: 800, color: '#334155' }}>
            {viewMode === 'class' ? `Danh sách lớp học (${listItems.length})` : `Học sinh (${listItems.length})`}
          </div>

          <div className="item-list">
            {listItems.length > 0 ? (
              listItems.map(item => (
                <div
                  key={item.id}
                  className={`list-item ${selectedId === item.id ? 'active' : ''}`}
                  onClick={() => { setSelectedId(item.id); setShowMobileDetails(true); }}
                  style={{ 
                    padding: '1rem',
                    marginBottom: '8px',
                    gap: '1.25rem',
                    alignItems: 'flex-start'
                  }}
                >
                  <div className="item-icon" style={{ 
                    width: '42px', 
                    height: '42px', 
                    borderRadius: '12px',
                    background: selectedId === item.id ? '#4f46e5' : '#eef2ff',
                    color: selectedId === item.id ? 'white' : '#4f46e5'
                  }}>
                    {viewMode === 'class' ? <Users size={22} /> : <User size={22} />}
                  </div>
                  <div className="item-info">
                    <h4 style={{ 
                      fontSize: '1rem', 
                      color: selectedId === item.id ? '#4f46e5' : '#4f46e5',
                      fontWeight: 700 
                    }}>{item.title}</h4>
                    {viewMode === 'class' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}>
                        <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Sĩ số: {item.siso} HV</span>
                        <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>GV: {item.teacherName}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600, marginTop: '4px' }}>{item.subtitle}</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-message-sm">Không tìm thấy thông tin</div>
            )}
          </div>
        </div>

        <div className="attendance-details-pane">
          {selectedId ? (
            <>
              {/* ✅ MATCHING INVOICE HEADER ACTIONS */}
              <div className="mobile-header-actions">
                <button className="btn-back" onClick={() => setShowMobileDetails(false)}>
                  <X size={20} /> Quay lại danh sách
                </button>
              </div>

              {/* ✅ LECTURER INFO (Vertical Layout) */}
              {viewMode === 'class' && (
                <div className="attendance-info-section">
                  <div className="im-section">
                    <h3 className="im-section-title"><Users size={18} /> Thông tin Lớp & Giảng Viên</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 0' }}>
                      <div className="im-field-hz" style={{ display: 'flex', gap: '8px' }}>
                        <span style={{ color: '#64748b', fontWeight: 700, minWidth: '100px' }}>Tên lớp:</span>
                        <span className="text-primary" style={{ fontWeight: 800 }}>{classes.find(c => c.malop === selectedId)?.tenlop || selectedId}</span>
                      </div>
                      <div className="im-field-hz" style={{ display: 'flex', gap: '8px' }}>
                        <span style={{ color: '#64748b', fontWeight: 700, minWidth: '100px' }}>Giảng viên:</span>
                        <span style={{ color: '#1e293b', fontWeight: 700 }}>
                          {(() => {
                            const cls = classes.find(c => c.malop === selectedId);
                            const tchr = employees.find(e => e.manv === cls?.manv);
                            return tchr ? tchr.tennv : (cls?.manv || 'Chưa xác định');
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {viewMode === 'student' && (
                <div className="attendance-info-section">
                  <div className="im-section">
                    <h3 className="im-section-title"><User size={18} /> Thông tin Học Sinh</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 0' }}>
                      <div className="im-field-hz" style={{ display: 'flex', gap: '8px' }}>
                        <span style={{ color: '#64748b', fontWeight: 700, minWidth: '100px' }}>Học sinh:</span>
                        <span className="text-primary" style={{ fontWeight: 800 }}>{students.find(s => s.mahv === selectedId)?.tenhv || selectedId}</span>
                      </div>
                      <div className="im-field-hz" style={{ display: 'flex', gap: '8px' }}>
                        <span style={{ color: '#64748b', fontWeight: 700, minWidth: '100px' }}>Mã HS:</span>
                        <span style={{ color: '#1e293b', fontWeight: 700 }}>{selectedId}</span>
                      </div>
                      <div className="im-field-hz" style={{ display: 'flex', gap: '8px' }}>
                        <span style={{ color: '#64748b', fontWeight: 700, minWidth: '100px' }}>Lớp hiện tại:</span>
                        <span style={{ color: '#1e293b', fontWeight: 700 }}>
                          {(() => {
                            const std = students.find(s => s.mahv === selectedId);
                            if (!std) return '...';
                            let list = [];
                            if (std.malop) list.push(std.malop);
                            if (Array.isArray(std.malop_list)) list = [...new Set([...list, ...std.malop_list])];
                            
                            if (list.length === 0) return 'Chưa xếp lớp';
                            return list.map(ml => classes.find(c => c.malop === ml)?.tenlop || ml).join(', ');
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Toolbar filters */}
              <div className="attendance-toolbar">
                <div className="filter-group">
                  <Filter size={18} color="#64748b" />
                  <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="date-select">
                    <option value="this_week">Trong tuần này</option>
                    <option value="this_month">Trong tháng này</option>
                    <option value="last_month">Tháng trước</option>
                    <option value="custom">Tùy chọn ngày...</option>
                  </select>

                  {dateFilter === 'custom' && (
                    <div className="custom-date-range">
                      <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                      <span>-</span>
                      <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                    </div>
                  )}
                </div>
                <div className="actions-group">
                  <button className="btn btn-success" onClick={handleExport}>
                    <Download size={16} /> Xuất Danh Sách
                  </button>
                  {['Quản lý', 'Nhân viên VP'].includes(currentUser?.role) && (
                    <button
                      className={`btn ${markingMode ? 'btn-danger' : 'btn-primary'}`}
                      style={{ background: markingMode ? '#64748b' : '#db2777', color: 'white', borderColor: 'transparent' }}
                      onClick={() => setMarkingMode(!markingMode)}
                    >
                      {markingMode ? <X size={16} /> : <CheckSquare size={16} />}
                      {markingMode ? 'Đóng Ghi Điểm Danh' : 'Ghi Điểm Danh HS'}
                    </button>
                  )}
                </div>
              </div>

              {/* Data Table / Marking UI */}
              <div className="attendance-table-container">
                {markingMode ? (
                  <div className="marking-portal animate-fade-in" style={{ padding: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ flex: 1, minWidth: '150px' }}>
                        <label className="portal-att-label">Ngày Chấm Công</label>
                        <input type="date" value={attDate} onChange={e => setAttDate(e.target.value)} style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '8px' }} />
                      </div>
                      <div style={{ flex: 2, minWidth: '200px' }}>
                        <label className="portal-att-label">Nội dung dạy buổi hôm nay</label>
                        <textarea placeholder="Kiến thức cũ, phần mới, bài tập..." value={lessonContent} onChange={e => setLessonContent(e.target.value)} rows="1" style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '8px', resize: 'vertical' }} />
                      </div>
                    </div>

                    <div className="attendance-portal-list">
                      {attStudents.length > 0 ? attStudents.map(st => {
                        const rec = attRecords[st.mahv] || {};
                        return (
                          <div key={st.mahv} className="attendance-portal-card">
                            <div>
                              <span className="portal-att-label">Học Sinh</span>
                              <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>{st.tenhv}</strong>
                              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>#{st.mahv}</div>
                            </div>
                            <div>
                              <span className="portal-att-label">Tình trạng</span>
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {(!config?.cotdiemdanh?.selected || config.cotdiemdanh.selected.includes('comat')) && (
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', color: '#16a34a', fontWeight: 600, fontSize: '0.85rem', background: rec.trangthai === 'Có mặt' ? '#f0fdf4' : 'transparent', padding: '0.4rem 0.6rem', borderRadius: '8px', border: rec.trangthai === 'Có mặt' ? '1px solid #bbf7d0' : '1px solid #e2e8f0' }}>
                                    <input type="radio" checked={rec.trangthai === 'Có mặt'} onChange={() => handleUpdateMarkRecord(st.mahv, 'trangthai', 'Có mặt')} /> Có mặt
                                  </label>
                                )}
                                {(!config?.cotdiemdanh?.selected || config.cotdiemdanh.selected.includes('vangP')) && (
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', color: '#d97706', fontWeight: 600, fontSize: '0.85rem', background: rec.trangthai === 'Nghỉ phép' ? '#fffbeb' : 'transparent', padding: '0.4rem 0.6rem', borderRadius: '8px', border: rec.trangthai === 'Nghỉ phép' ? '1px solid #fef3c7' : '1px solid #e2e8f0' }}>
                                    <input type="radio" checked={rec.trangthai === 'Nghỉ phép'} onChange={() => handleUpdateMarkRecord(st.mahv, 'trangthai', 'Nghỉ phép')} /> Nghỉ phép
                                  </label>
                                )}
                                {(!config?.cotdiemdanh?.selected || config.cotdiemdanh.selected.includes('vangKP')) && (
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', color: '#dc2626', fontWeight: 600, fontSize: '0.85rem', background: rec.trangthai === 'Nghỉ không phép' ? '#fef2f2' : 'transparent', padding: '0.4rem 0.6rem', borderRadius: '8px', border: rec.trangthai === 'Nghỉ không phép' ? '1px solid #fee2e2' : '1px solid #e2e8f0' }}>
                                    <input type="radio" checked={rec.trangthai === 'Nghỉ không phép'} onChange={() => handleUpdateMarkRecord(st.mahv, 'trangthai', 'Nghỉ không phép')} /> Nghỉ KP
                                  </label>
                                )}
                              </div>
                            </div>
                            <div style={{ flex: '1 1 200px' }}>
                              <span className="portal-att-label">Nhận xét</span>
                              <input type="text" placeholder="Ghi chú..." value={rec.ghichu || ''} onChange={e => handleUpdateMarkRecord(st.mahv, 'ghichu', e.target.value)} style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem' }} />
                            </div>
                          </div>
                        );
                      }) : (
                        <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b', background: '#f8fafc', borderRadius: '12px', border: '2px dashed #e2e8f0' }}>
                          <BookOpen size={30} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                          <p>Vui lòng chọn lớp để bắt đầu chấm công</p>
                        </div>
                      )}
                    </div>

                    {attStudents.length > 0 && (
                      <button className="btn btn-primary" onClick={handleSaveAttendance} disabled={loading} style={{ width: '100%', padding: '1rem', marginTop: '1.5rem', background: '#db2777', fontWeight: 700 }}>
                        {loading ? <Loader2 className="spinner" size={20} /> : <Save size={18} />} Lưu Bảng Điểm Danh
                      </button>
                    )}
                  </div>
                ) : loading ? (
                  <div className="loading-state">Tra cứu dữ liệu điểm danh...</div>
                ) : (
                  <>
                    <div className="table-scroll-wrapper">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>STT</th>
                            <th>Mã HS</th>
                            <th style={{ minWidth: '150px' }}>Tên Học Sinh</th>
                            <th className="text-center">Lịch</th>
                            <th className="text-center" style={{ minWidth: '130px' }}>Tổng Kết<br /><small className="text-muted">(CM / P / K)</small></th>
                            {uniqueDates.map(date => {
                              // e.g. "2026-03-20" -> "20/03"
                              const [year, month, day] = date.split('-');
                              return <th key={date} className="text-center" style={{ minWidth: '60px' }}>{`${day}/${month}`}</th>
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {aggregatedData.length > 0 ? (
                            aggregatedData.map((d, index) => (
                              <tr key={d.mahv}>
                                <td>{index + 1}</td>
                                <td className="font-medium">{d.mahv}</td>
                                <td className="font-semibold text-primary">{d.tenhv}</td>
                                <td className="text-center">
                                  <button className="btn btn-outline btn-sm p-1" style={{ minWidth: '0' }} onClick={() => setViewCalendarStudent({ mahv: d.mahv, tenhv: d.tenhv })} title="Xem lịch điểm danh">
                                    <Calendar size={14} />
                                  </button>
                                </td>
                                <td className="text-center font-bold">
                                  <span className="text-success">{d.coMat}</span> / <span className="text-warning">{d.nghiPhep}</span> / <span className="text-danger">{d.khongPhep}</span>
                                </td>
                                {uniqueDates.map(date => (
                                  <td key={date} className="text-center">
                                    {renderStatus(d.dailyRecords[date], d.dailyRemarks[date])}
                                  </td>
                                ))}
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4 + uniqueDates.length} className="empty-state">Không có dữ liệu điểm danh cho khoảng thời gian này.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* ✅ CARD LIST (mobile) */}
                    <div className="attendance-card-list">
                      {aggregatedData.length > 0 ? (
                        aggregatedData.map((d, index) => (
                          <div key={d.mahv} className="attendance-card">
                            <div className="attendance-card-header">
                              <div>
                                <div className="student-name">{d.tenhv}</div>
                                <div className="student-id">#{d.mahv}</div>
                              </div>
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => setViewCalendarStudent({ mahv: d.mahv, tenhv: d.tenhv })}
                              >
                                <Calendar size={14} /> Xem Lịch
                              </button>
                            </div>

                            <div className="attendance-card-stats-compact">
                              <span className="badge-stat bg-success-light text-success">
                                {d.coMat} CM
                              </span>
                              <span className="badge-stat bg-warning-light text-warning">
                                {d.nghiPhep} P
                              </span>
                              <span className="badge-stat bg-danger-light text-danger">
                                {d.khongPhep} K
                              </span>
                            </div>

                            {uniqueDates.length > 0 && (
                              <div className="attendance-recent-sessions">
                                <div className="recent-label">Điểm danh gần nhất:</div>
                                <div className="sessions-scroll">
                                  {uniqueDates.slice(0, 5).map(date => {
                                    const [, m, d_val] = date.split('-');
                                    return (
                                      <div key={date} className="session-dot-item">
                                        <span className="session-date">{`${d_val}/${m}`}</span>
                                        <div className="session-status">{renderStatus(d.dailyRecords[date])}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="empty-state">Không có dữ liệu điểm danh cho khoảng thời gian này.</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="no-selection">
              <Calendar size={22} />
              <p>Vui lòng chọn một {viewMode === 'class' ? 'Lớp' : 'Học sinh'} bên trái để xem điểm danh</p>
            </div>
          )}
        </div>

      </div>

      {/* Calendar Modal */}
      {viewCalendarStudent && (
        <StudentAttendanceCalendar
          studentId={viewCalendarStudent.mahv}
          studentName={viewCalendarStudent.tenhv}
          onClose={() => setViewCalendarStudent(null)}
        />
      )}
    </div>
  );
}
