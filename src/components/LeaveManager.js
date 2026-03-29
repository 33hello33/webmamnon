import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { UserX, AlertTriangle, CalendarX, Calendar } from 'lucide-react';
import StudentAttendanceCalendar from './StudentAttendanceCalendar';
import './LeaveManager.css';

export default function LeaveManager({ students }) {
  const [classes, setClasses] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewCalendarStudent, setViewCalendarStudent] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch classes
        const { data: classData } = await supabase.from('tbl_lop').select('malop, tenlop');
        if (classData) setClasses(classData);

        // Fetch attendance records for today's calculation
        const { data: attData } = await supabase
          .from('tbl_diemdanh')
          .select('mahv, ngay, trangthai, ghichu')
          .order('ngay', { ascending: false });
        if (attData) setAttendanceRecords(attData);

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const getClassName = (malop) => {
    const match = classes.find(c => c.malop === malop);
    return match ? match.tenlop : (malop || 'Chưa xếp lớp');
  };

  const getStudentPhone = (mahv) => {
    const student = students.find(s => s.mahv === mahv);
    return student?.sdtba || student?.sdtme || 'Chưa cập nhật';
  };

  const getStudentName = (mahv) => {
    const student = students.find(s => s.mahv === mahv);
    return student?.tenhv || 'Không rõ';
  };

  const getStudentMalopNames = (mahv) => {
    const student = students.find(s => s.mahv === mahv);
    if (!student?.malop_list || student.malop_list.length === 0) return '';
    return student.malop_list.map(ml => classes.find(c => c.malop === ml)?.tenlop || ml).join(', ');
  };

  // Compute Today's Absences
  // To handle timezone differences, we format today as YYYY-MM-DD local time
  const today = new Date();
  const tzOffset = today.getTimezoneOffset() * 60000; // offset in milliseconds
  const todayIso = new Date(today - tzOffset).toISOString().split('T')[0];

  const todayAbsencesRecords = attendanceRecords.filter(r => {
    const status = (r.trangthai || '').toLowerCase();
    return r.ngay === todayIso && (status === 'nghỉ phép' || status === 'nghỉ không phép');
  });

  const todayAbsences = todayAbsencesRecords.map(r => ({
    mahv: r.mahv,
    tenhv: getStudentName(r.mahv),
    tenlop: getStudentMalopNames(r.mahv),
    trangthai: r.trangthai,
    ghichu: r.ghichu || '-',
    sdt: getStudentPhone(r.mahv)
  }));

  // Tính toán số học sinh vắng liên tiếp bằng JavaScript thay vì dùng RPC supabase
  const consecutiveAbsencesList = React.useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const tzOffset = thirtyDaysAgo.getTimezoneOffset() * 60000;
    const thirtyDaysAgoIso = new Date(thirtyDaysAgo - tzOffset).toISOString().split('T')[0];

    const recordsByStudent = {};
    attendanceRecords.forEach(r => {
      if (r.ngay >= thirtyDaysAgoIso) {
        if (!recordsByStudent[r.mahv]) {
          recordsByStudent[r.mahv] = [];
        }
        recordsByStudent[r.mahv].push(r);
      }
    });

    const list = [];
    for (const [mahv, studentRecords] of Object.entries(recordsByStudent)) {
      if (studentRecords.length === 0) continue;

      const latestRecord = studentRecords[0];
      const latestStatus = (latestRecord.trangthai || '').toLowerCase();

      if (latestStatus === 'có mặt') {
        continue;
      }

      let consecutiveCount = 0;
      let ngayBatDau = latestRecord.ngay;
      const ngayKetThuc = latestRecord.ngay;

      for (const record of studentRecords) {
        const status = (record.trangthai || '').toLowerCase();
        if (status === 'có mặt') {
          break;
        }
        consecutiveCount++;
        ngayBatDau = record.ngay;
      }

      if (consecutiveCount >= 2) {
        list.push({
          mahv: mahv,
          tenhv: getStudentName(mahv),
          sdt: getStudentPhone(mahv),
          tenlop: getStudentMalopNames(mahv),
          songayvang: consecutiveCount,
          ngaybatdau: ngayBatDau,
          ngayketthuc: ngayKetThuc
        });
      }
    }

    return list.sort((a, b) => b.songayvang - a.songayvang);
  }, [attendanceRecords, classes, students]);

  if (loading) {
    return <div className="loading-state">Đang rà soát dữ liệu nghỉ học...</div>;
  }

  return (
    <div className="leave-manager animate-fade-in">
      <div className="leave-manager-layout">

        {/* Table 1: Absent Today */}
        <div className="leave-card">
          <div className="leave-header">
            <div className="leave-title">
              <CalendarX size={20} className="text-danger" />
              <h3>Nghỉ học hôm nay ({todayIso.split('-').reverse().join('/')})</h3>
            </div>
            <span className="leave-badge danger">{todayAbsences.length} Học sinh</span>
          </div>
          <div className="leave-body">
            <div className="table-scroll-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mã HS</th>
                    <th>Tên Học Sinh</th>
                    <th className="text-center">Lịch</th>
                    <th>Tên Lớp</th>
                    <th>Trạng Thái</th>
                    <th>Ghi Chú</th>
                    <th>SĐT Liên Hệ</th>
                  </tr>
                </thead>
                <tbody>
                  {todayAbsences.length > 0 ? (
                    todayAbsences.map(s => (
                      <tr key={s.mahv}>
                        <td className="font-medium text-slate-500">{s.mahv}</td>
                        <td className="font-bold text-slate-800">{s.tenhv}</td>
                        <td className="text-center">
                          <button className="btn btn-outline btn-sm p-1" style={{ minWidth: '0' }} onClick={() => setViewCalendarStudent(s)} title="Xem lịch điểm danh">
                            <Calendar size={14} />
                          </button>
                        </td>
                        <td>{s.tenlop}</td>
                        <td>
                          <span className={`status-badge ${s.trangthai.toLowerCase().includes('không') ? 'danger' : 'warning'}`}>
                            {s.trangthai}
                          </span>
                        </td>
                        <td className="text-muted">{s.ghichu}</td>
                        <td className="font-medium text-primary">{s.sdt}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="empty-state">Tuyệt vời! Hôm nay chưa ghi nhận học sinh nào nghỉ học.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ✅ CARD LIST (mobile) */}
            <div className="leave-card-list">
              {todayAbsences.length > 0 ? (
                todayAbsences.map(s => (
                  <div key={s.mahv} className="leave-item-card">
                    <div className="card-row">
                      <div className="student-info">
                        <span className="student-name">{s.tenhv}</span>
                        <span className="student-id">#{s.mahv}</span>
                      </div>
                      <button className="btn btn-outline btn-sm" onClick={() => setViewCalendarStudent(s)}>
                        <Calendar size={14} />
                      </button>
                    </div>
                    <div className="card-row">
                      <span><strong>Lớp:</strong> {s.tenlop}</span>
                      <span className={`status-badge ${s.trangthai.toLowerCase().includes('không') ? 'danger' : 'warning'}`}>
                        {s.trangthai}
                      </span>
                    </div>
                    <div className="card-row">
                      <span><strong>SĐT:</strong> {s.sdt}</span>
                    </div>
                    {s.ghichu && s.ghichu !== '-' && (
                      <div className="card-row note">
                        <span><strong>Ghi chú:</strong> {s.ghichu}</span>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="empty-state">Hôm nay không có học sinh nghỉ học.</div>
              )}
            </div>
          </div>
        </div>

        {/* Table 2: Consecutive Absences */}
        <div className="leave-card mt-card">
          <div className="leave-header">
            <div className="leave-title">
              <AlertTriangle size={20} className="text-warning" />
              <h3>Vắng liên tiếp (Cảnh báo &ge; 2 buổi)</h3>
            </div>
            <span className="leave-badge warning">{consecutiveAbsencesList.length} Học sinh</span>
          </div>
          <div className="leave-body">
            <div className="table-scroll-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mã HS</th>
                    <th>Tên Học Sinh</th>
                    <th className="text-center">Lịch</th>
                    <th>Tên Lớp</th>
                    <th className="text-center">Số Ngày Vắng Liên Tiếp</th>
                    <th>SĐT Liên Hệ</th>
                  </tr>
                </thead>
                <tbody>
                  {consecutiveAbsencesList.length > 0 ? (
                    consecutiveAbsencesList.map(s => {
                      const fromDate = new Date(s.ngaybatdau).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
                      const toDate = new Date(s.ngayketthuc).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

                      return (
                        <tr key={s.mahv}>
                          <td className="font-medium text-slate-500">{s.mahv}</td>
                          <td className="font-bold text-slate-800">{s.tenhv}</td>
                          <td className="text-center">
                            <button className="btn btn-outline btn-sm p-1" style={{ minWidth: '0' }} onClick={() => setViewCalendarStudent(s)} title="Xem lịch điểm danh">
                              <Calendar size={14} />
                            </button>
                          </td>
                          <td>{s.tenlop}</td>
                          <td className="text-center">
                            <span className="consecutive-badge">{s.songayvang} Buổi</span>
                            <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: '#64748b' }}>
                              {fromDate} - {toDate}
                            </div>
                          </td>
                          <td className="font-medium text-primary">{s.sdt}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="6" className="empty-state">Tuyệt vời! Không có học sinh nào vắng liên tiếp kéo dài.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ✅ CARD LIST (mobile) */}
            <div className="leave-card-list">
              {consecutiveAbsencesList.length > 0 ? (
                consecutiveAbsencesList.map(s => (
                  <div key={s.mahv} className="leave-item-card">
                    <div className="card-row">
                      <div className="student-info">
                        <span className="student-name">{s.tenhv}</span>
                        <span className="student-id">#{s.mahv}</span>
                      </div>
                      <button className="btn btn-outline btn-sm" onClick={() => setViewCalendarStudent(s)}>
                        <Calendar size={14} />
                      </button>
                    </div>
                    <div className="card-row">
                      <span><strong>Lớp:</strong> {s.tenlop}</span>
                      <span className="consecutive-badge">{s.songayvang} Buổi</span>
                    </div>
                    <div className="card-row">
                      <span><strong>Giai đoạn:</strong> {new Date(s.ngaybatdau).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} - {new Date(s.ngayketthuc).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</span>
                    </div>
                    <div className="card-row">
                      <span><strong>SĐT:</strong> {s.sdt}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">Không có học sinh vắng liên tiếp.</div>
              )}
            </div>
          </div>
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
