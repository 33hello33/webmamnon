import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { Users, Clock, Loader2, Search, Calendar, MessageCircle } from 'lucide-react';

export default function AttendanceToday({ students, classes: allAvailableClasses }) {
  const [loading, setLoading] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState([]);
  const [classSchedules, setClassSchedules] = useState({});
  const [searchTerm, setSearchTerm] = useState('');

  const todayStr = useMemo(() => {
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const now = new Date();
    return `${days[now.getDay()]}, ${now.toLocaleDateString('vi-VN')}`;
  }, []);

  const fetchTodayData = async () => {
    setLoading(true);
    try {
      const todayIso = new Date().toISOString().split('T')[0];

      // 1. Fetch attendance marked as "Có mặt" for today
      const { data: attendanceData, error: attErr } = await supabase
        .from('tbl_diemdanh')
        .select('*')
        .eq('ngay', todayIso)
        .eq('trangthai', 'Có mặt');
      
      if (attErr) throw attErr;
      setTodayAttendance(attendanceData || []);

 
      // 2. Fetch giohoc info from tbl_lop for found classes (Thay thế tbl_lichhoc_lop)
      if (attendanceData && attendanceData.length > 0) {
        const classIds = [...new Set(attendanceData.map(d => d.malop))];
        const { data: schedData } = await supabase
          .from('tbl_lop')
          .select('malop, giohoc')
          .in('malop', classIds);
        
        const finalMap = {};
        (schedData || []).forEach(s => {
          finalMap[s.malop] = s.giohoc || '';
        });
        setClassSchedules(finalMap);
      }
    } catch (err) {
      console.error('Error fetching today attendance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTodayData();
  }, []);

  // Group students by class using attendance as base
  const groupedData = useMemo(() => {
    const classIdsFromAtt = [...new Set(todayAttendance.map(a => a.malop))];
    const groups = [];

    classIdsFromAtt.forEach(mid => {
      const classInfo = allAvailableClasses.find(c => c.malop === mid);
      const attInClass = todayAttendance.filter(a => a.malop === mid);

      const studentsInClass = attInClass.map(att => {
        const studentDetail = students.find(s => s.mahv === att.mahv);
        return {
          ...att,
          tenhv: studentDetail?.tenhv || `Học viên ${att.mahv}`,
          sdt: studentDetail?.sdt || ''
        };
      }).filter(s => 
        searchTerm === '' || 
        s.tenhv.toLowerCase().includes(searchTerm.toLowerCase()) || 
        s.mahv.toLowerCase().includes(searchTerm.toLowerCase())
      );

      if (studentsInClass.length > 0) {
        groups.push({
          classId: mid,
          className: classInfo?.tenlop || mid,
          giohoc: classSchedules[mid] || '_',
          students: studentsInClass
        });
      }
    });

    return groups;
  }, [todayAttendance, classSchedules, students, allAvailableClasses, searchTerm]);

  if (loading) {
    return (
      <div className="attendance-today-loading" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: '#64748b' }}>
        <Loader2 className="animate-spin" size={32} />
        <p style={{ marginTop: '1rem' }}>Đang tải danh sách đi học thực tế...</p>
      </div>
    );
  }

  return (
    <div className="attendance-today-container animate-fade-in" style={{ padding: '0 1rem 2rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calendar className="text-primary" size={24} />
            Học viên đang học hôm nay
          </h2>
          <p style={{ margin: '4px 0 0 34px', color: '#64748b', fontWeight: 500 }}>{todayStr} (Dựa trên điểm danh có mặt)</p>
        </div>

        <div className="fm-search" style={{ width: '300px' }}>
          <Search size={16} className="text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Tìm tên học viên hoặc mã..."
            style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent' }}
          />
        </div>
      </div>

      {groupedData.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#f8fafc', borderRadius: '12px', border: '2px dashed #e2e8f0' }}>
          <Users size={48} style={{ color: '#cbd5e1', marginBottom: '1rem' }} />
          <h3 style={{ color: '#64748b', margin: 0 }}>Hôm nay không có học viên nào điểm danh 'Có mặt'</h3>
          <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>Các học viên được điểm danh là "Có mặt" trong ngày sẽ hiển thị ở đây.</p>
        </div>
      ) : (
        <div className="today-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.5rem' }}>
          {groupedData.map(group => (
            <div key={group.classId} className="class-attendance-card" style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '1.25rem', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(to right, #f8fafc, #ffffff)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: 700 }}>{group.className}</h3>
                  <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}>{group.classId}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6366f1', fontSize: '0.9rem', fontWeight: 600 }}>
                  <Clock size={16} />
                  <span>Giờ học: {group.giohoc}</span>
                </div>
              </div>
              
              <div style={{ padding: '1.25rem', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', color: '#475569', fontSize: '0.85rem', fontWeight: 600 }}>
                  <Users size={16} />
                  <span>Đang có mặt ({group.students.length}):</span>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {group.students.map((student, idx) => (
                    <div key={student.mahv} style={{ padding: '12px', borderRadius: '10px', border: '1px solid #f1f5f9', background: '#fcfcfd' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <div style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#f1f5f9', color: '#64748b', fontSize: '0.75rem', fontWeight: 700 }}>
                          {idx + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b' }}>{student.tenhv}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{student.mahv} {student.sdt ? `• ${student.sdt}` : ''}</div>
                        </div>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div>
                      </div>
                      
                      {/* TEACHER REMARKS SECTION */}
                      <div style={{ marginTop: '8px', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', borderLeft: '3px solid #6366f1', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        <MessageCircle size={14} style={{ color: '#6366f1', marginTop: '2px', flexShrink: 0 }} />
                        <div style={{ fontSize: '0.85rem', color: student.ghichu ? '#334155' : '#94a3b8', fontStyle: student.ghichu ? 'normal' : 'italic', lineHeight: '1.4' }}>
                          {student.ghichu || 'Chưa có nhận xét ngày hôm nay'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
