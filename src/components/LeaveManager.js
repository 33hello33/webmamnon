import React, { useState, useEffect } from 'react';
import { supabase, insertLog } from '../supabase';
import { useConfig } from '../ConfigContext';
import { UserX, AlertTriangle, CalendarX, Calendar, MessageSquare, Loader2 } from 'lucide-react';
import StudentAttendanceCalendar from './StudentAttendanceCalendar';
import { sendZaloMessage } from '../services/zaloHelper';
import '../services/zaloSocketClient';
import './LeaveManager.css';

const ZALO_BACKEND_URL = process.env.REACT_APP_ZALO_API_URL || 'http://localhost:5000';

export default function LeaveManager({ students }) {
  const { config } = useConfig();
  const [classes, setClasses] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewCalendarStudent, setViewCalendarStudent] = useState(null);
  const [sendingZaloMahv, setSendingZaloMahv] = useState(null);
  const [isBulkSendingToday, setIsBulkSendingToday] = useState(false);
  const [isBulkSendingConsecutive, setIsBulkSendingConsecutive] = useState(false);

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
    const student = (students || []).find(s => s.mahv === mahv);
    return student?.sdt || student?.sdtba || student?.sdtme || 'Chưa cập nhật';
  };

  const getStudentParentPhone = (mahv) => {
    const student = (students || []).find(s => s.mahv === mahv);
    return student?.sdtba || student?.sdtme || '';
  };

  const getStudentName = (mahv) => {
    const student = (students || []).find(s => s.mahv === mahv);
    return student?.tenhv || 'Không rõ';
  };

  const getStudentMalopNames = (mahv) => {
    const student = (students || []).find(s => s.mahv === mahv);
    if (!student) return '';
    
    // Support either malop_list array or the standard malop string
    const malopArray = student.malop_list && student.malop_list.length > 0 
      ? student.malop_list 
      : (student.malop ? [student.malop] : []);
      
    if (malopArray.length === 0) return 'Chưa xếp lớp';
    return malopArray.map(ml => classes.find(c => c.malop === ml)?.tenlop || ml).join(', ');
  };

  // Compute Today's Absences
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
    sdt: getStudentPhone(r.mahv),
    sdtphuhuynh: getStudentParentPhone(r.mahv)
  }));

  // Tính toán số học sinh vắng liên tiếp bằng JavaScript thay vì dùng RPC supabase
  const consecutiveAbsencesList = React.useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const tzOffsetAgo = thirtyDaysAgo.getTimezoneOffset() * 60000;
    const thirtyDaysAgoIso = new Date(thirtyDaysAgo - tzOffsetAgo).toISOString().split('T')[0];

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
          sdtphuhuynh: getStudentParentPhone(mahv),
          tenlop: getStudentMalopNames(mahv),
          songayvang: consecutiveCount,
          ngaybatdau: ngayBatDau,
          ngayketthuc: ngayKetThuc
        });
      }
    }

    return list.sort((a, b) => b.songayvang - a.songayvang);
  }, [attendanceRecords, classes, students]);

  // ── Gửi tin nhắn Zalo Nhắc nghỉ học hôm nay (đơn lẻ) ────────────────
  const handleSendZaloRemindToday = async (item) => {
    if (!item || !item.mahv) return;
    setSendingZaloMahv(item.mahv);
    try {
      const student = (students || []).find(st => st.mahv === item.mahv) || {};
      const sdtme = (student.sdtme || item.sdtme || '').trim();
      const sdtba = (student.sdtba || item.sdtba || '').trim();

      if (!sdtme && !sdtba && !item.mahv) {
        alert(`Học sinh ${item.tenhv} (${item.mahv}) chưa có Số điện thoại!`);
        return;
      }

      const todayStr = todayIso.split('-').reverse().join('/');
      const rawTpl = config?.zalonhacnghiphep || 'Kính gửi Phụ huynh bé [tenhv] (Mã: [mahv]), Lớp [lop]. Hôm nay ngày [ngay], nhà trường ghi nhận bé [trangthai] (Ghi chú: [ghichu]). Xin vui lòng liên hệ giáo viên chủ nhiệm nếu cần hỗ trợ thêm thông tin. Chúc bé và gia đình nhiều sức khỏe!';
      const msgText = rawTpl
        .replace(/\[mahv\]/g, item.mahv || '')
        .replace(/\[tenhv\]/g, item.tenhv || '')
        .replace(/\[lop\]/g, item.tenlop || '')
        .replace(/\[ngay\]/g, todayStr)
        .replace(/\[trangthai\]/g, item.trangthai || 'Nghỉ học')
        .replace(/\[ghichu\]/g, item.ghichu && item.ghichu !== '-' ? item.ghichu : 'Không có');

      const sendResult = await sendZaloMessage({
        sdtme,
        sdtba,
        mahv: item.mahv,
        zaloBackendUrl: ZALO_BACKEND_URL,
        message: msgText
      });

      if (sendResult.success) {
        alert(`Đã gửi tin nhắn Zalo nhắc nghỉ tới phụ huynh bé ${item.tenhv} thành công!`);
        insertLog(`[NHẮC NGHỈ] Đã gửi Zalo nhắc nghỉ học hôm nay cho bé ${item.tenhv} (${item.mahv})`);
      } else if (sendResult.triedTargetIds.length === 0) {
        alert(sendResult.error || `Không tìm thấy tài khoản Zalo cho học sinh ${item.tenhv} (${item.mahv})!`);
      } else {
        alert('Gửi tin nhắn Zalo không thành công.');
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi gửi tin nhắn Zalo nhắc nghỉ: ' + (err.response?.data?.error || err.message));
    } finally {
      setSendingZaloMahv(null);
    }
  };

  // ── Gửi tin nhắn Zalo Nhắc nghỉ học hôm nay (HÀNG LOẠT) ───────────────
  const handleBulkSendToday = async () => {
    if (todayAbsences.length === 0) {
      alert('Hôm nay không có học sinh nào nghỉ học!');
      return;
    }
    if (!window.confirm(`Bạn có chắc muốn gửi tin nhắn Zalo nhắc nghỉ cho tất cả ${todayAbsences.length} học sinh nghỉ hôm nay không?`)) return;

    setIsBulkSendingToday(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (let i = 0; i < todayAbsences.length; i++) {
        const s = todayAbsences[i];
        try {
          const student = (students || []).find(st => st.mahv === s.mahv) || {};
          const sdtme = (student.sdtme || s.sdtme || '').trim();
          const sdtba = (student.sdtba || s.sdtba || '').trim();
          const todayStr = todayIso.split('-').reverse().join('/');
          const rawTpl = config?.zalonhacnghiphep || 'Kính gửi Phụ huynh bé [tenhv] (Mã: [mahv]), Lớp [lop]. Hôm nay ngày [ngay], nhà trường ghi nhận bé [trangthai] (Ghi chú: [ghichu]). Xin vui lòng liên hệ giáo viên chủ nhiệm nếu cần hỗ trợ thêm thông tin. Chúc bé và gia đình nhiều sức khỏe!';
          const msgText = rawTpl
            .replace(/\[mahv\]/g, s.mahv || '')
            .replace(/\[tenhv\]/g, s.tenhv || '')
            .replace(/\[lop\]/g, s.tenlop || '')
            .replace(/\[ngay\]/g, todayStr)
            .replace(/\[trangthai\]/g, s.trangthai || 'Nghỉ học')
            .replace(/\[ghichu\]/g, s.ghichu && s.ghichu !== '-' ? s.ghichu : 'Không có');

          const sendResult = await sendZaloMessage({
            sdtme,
            sdtba,
            mahv: s.mahv,
            zaloBackendUrl: ZALO_BACKEND_URL,
            message: msgText
          });

          if (sendResult.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (err) {
          console.error(err);
          failCount++;
        }
        if (i < todayAbsences.length - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      insertLog(`[NHẮC NGHỈ] Đã gửi Zalo nhắc nghỉ hàng loạt hôm nay: Thành công ${successCount}/${todayAbsences.length}, Thất bại ${failCount}`);
      alert(`Hoàn thành gửi Zalo nhắc nghỉ hôm nay!\n- Thành công: ${successCount}\n- Thất bại / không tìm thấy Zalo: ${failCount}`);
    } finally {
      setIsBulkSendingToday(false);
    }
  };

  // ── Gửi tin nhắn Zalo Nhắc nghỉ vắng liên tiếp (đơn lẻ) ─────────────
  const handleSendZaloRemindConsecutive = async (item) => {
    if (!item || !item.mahv) return;
    setSendingZaloMahv(item.mahv);
    try {
      const student = (students || []).find(st => st.mahv === item.mahv) || {};
      const sdtme = (student.sdtme || item.sdtme || '').trim();
      const sdtba = (student.sdtba || item.sdtba || '').trim();

      if (!sdtme && !sdtba && !item.mahv) {
        alert(`Học sinh ${item.tenhv} (${item.mahv}) chưa có Số điện thoại!`);
        return;
      }

      const fromDate = item.ngaybatdau ? new Date(item.ngaybatdau).toLocaleDateString('vi-VN') : '';
      const toDate = item.ngayketthuc ? new Date(item.ngayketthuc).toLocaleDateString('vi-VN') : '';

      const rawTpl = config?.zalonhacnghiphep || 'Kính gửi Phụ huynh bé [tenhv] (Mã: [mahv]), Lớp [lop]. Nhà trường ghi nhận bé đã vắng [songayvang] buổi liên tiếp (từ [ngaybatdau] đến [ngayketthuc]). Nhà trường xin gửi lời thăm hỏi đến bé và gia đình. Kính mong Quý Phụ huynh cập nhật tình hình sức khỏe/học tập của bé với giáo viên. Trân trọng!';
      const msgText = rawTpl
        .replace(/\[mahv\]/g, item.mahv || '')
        .replace(/\[tenhv\]/g, item.tenhv || '')
        .replace(/\[lop\]/g, item.tenlop || '')
        .replace(/\[songayvang\]/g, item.songayvang || '')
        .replace(/\[ngaybatdau\]/g, fromDate)
        .replace(/\[ngayketthuc\]/g, toDate)
        .replace(/\[trangthai\]/g, 'Nghỉ học liên tiếp')
        .replace(/\[ghichu\]/g, '');

      const sendResult = await sendZaloMessage({
        sdtme,
        sdtba,
        mahv: item.mahv,
        zaloBackendUrl: ZALO_BACKEND_URL,
        message: msgText
      });

      if (sendResult.success) {
        alert(`Đã gửi tin nhắn Zalo nhắc nghỉ liên tiếp tới phụ huynh bé ${item.tenhv} thành công!`);
        insertLog(`[NHẮC NGHỈ] Đã gửi Zalo nhắc nghỉ liên tiếp cho bé ${item.tenhv} (${item.mahv}) - ${item.songayvang} buổi`);
      } else if (sendResult.triedTargetIds.length === 0) {
        alert(sendResult.error || `Không tìm thấy tài khoản Zalo cho học sinh ${item.tenhv} (${item.mahv})!`);
      } else {
        alert('Gửi tin nhắn Zalo không thành công.');
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi gửi tin nhắn Zalo nhắc nghỉ: ' + (err.response?.data?.error || err.message));
    } finally {
      setSendingZaloMahv(null);
    }
  };

  // ── Gửi tin nhắn Zalo Nhắc nghỉ vắng liên tiếp (HÀNG LOẠT) ────────────
  const handleBulkSendConsecutive = async () => {
    if (consecutiveAbsencesList.length === 0) {
      alert('Không có học sinh nào vắng liên tiếp!');
      return;
    }
    if (!window.confirm(`Bạn có chắc muốn gửi tin nhắn Zalo nhắc nghỉ cho tất cả ${consecutiveAbsencesList.length} học sinh vắng liên tiếp không?`)) return;

    setIsBulkSendingConsecutive(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (let i = 0; i < consecutiveAbsencesList.length; i++) {
        const s = consecutiveAbsencesList[i];
        try {
          const student = (students || []).find(st => st.mahv === s.mahv) || {};
          const sdtme = (student.sdtme || s.sdtme || '').trim();
          const sdtba = (student.sdtba || s.sdtba || '').trim();
          const fromDate = s.ngaybatdau ? new Date(s.ngaybatdau).toLocaleDateString('vi-VN') : '';
          const toDate = s.ngayketthuc ? new Date(s.ngayketthuc).toLocaleDateString('vi-VN') : '';
          const rawTpl = config?.zalonhacnghiphep || 'Kính gửi Phụ huynh bé [tenhv] (Mã: [mahv]), Lớp [lop]. Nhà trường ghi nhận bé đã vắng [songayvang] buổi liên tiếp (từ [ngaybatdau] đến [ngayketthuc]). Nhà trường xin gửi lời thăm hỏi đến bé và gia đình. Kính mong Quý Phụ huynh cập nhật tình hình sức khỏe/học tập của bé với giáo viên. Trân trọng!';
          const msgText = rawTpl
            .replace(/\[mahv\]/g, s.mahv || '')
            .replace(/\[tenhv\]/g, s.tenhv || '')
            .replace(/\[lop\]/g, s.tenlop || '')
            .replace(/\[songayvang\]/g, s.songayvang || '')
            .replace(/\[ngaybatdau\]/g, fromDate)
            .replace(/\[ngayketthuc\]/g, toDate)
            .replace(/\[trangthai\]/g, 'Nghỉ học liên tiếp')
            .replace(/\[ghichu\]/g, '');

          const sendResult = await sendZaloMessage({
            sdtme,
            sdtba,
            mahv: s.mahv,
            zaloBackendUrl: ZALO_BACKEND_URL,
            message: msgText
          });

          if (sendResult.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (err) {
          console.error(err);
          failCount++;
        }
        if (i < consecutiveAbsencesList.length - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      insertLog(`[NHẮC NGHỈ] Đã gửi Zalo nhắc vắng liên tiếp hàng loạt: Thành công ${successCount}/${consecutiveAbsencesList.length}, Thất bại ${failCount}`);
      alert(`Hoàn thành gửi Zalo nhắc vắng liên tiếp!\n- Thành công: ${successCount}\n- Thất bại / không tìm thấy Zalo: ${failCount}`);
    } finally {
      setIsBulkSendingConsecutive(false);
    }
  };

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {todayAbsences.length > 0 && (
                <button
                  type="button"
                  onClick={handleBulkSendToday}
                  disabled={isBulkSendingToday}
                  style={{
                    background: '#0284c7',
                    border: 'none',
                    color: 'white',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 12px',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {isBulkSendingToday ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                  Gửi Zalo tất cả
                </button>
              )}
              <span className="leave-badge danger">{todayAbsences.length} Học sinh</span>
            </div>
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
                    <th className="text-center">Nhắc Zalo</th>
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
                        <td className="text-center">
                          <button
                            type="button"
                            onClick={() => handleSendZaloRemindToday(s)}
                            disabled={sendingZaloMahv === s.mahv}
                            style={{
                              background: '#e0f2fe',
                              color: '#0369a1',
                              border: '1px solid #bae6fd',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                            title="Gửi tin nhắn Zalo nhắc nghỉ"
                          >
                            {sendingZaloMahv === s.mahv ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                            Nhắc nghỉ
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="8" className="empty-state">Tuyệt vời! Hôm nay chưa ghi nhận học sinh nào nghỉ học.</td>
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
                    <div className="card-row" style={{ marginTop: '4px', paddingTop: '8px', borderTop: '1px dashed #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => handleSendZaloRemindToday(s)}
                        disabled={sendingZaloMahv === s.mahv}
                        style={{
                          background: '#0284c7',
                          color: 'white',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {sendingZaloMahv === s.mahv ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                        Gửi Zalo nhắc nghỉ
                      </button>
                    </div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {consecutiveAbsencesList.length > 0 && (
                <button
                  type="button"
                  onClick={handleBulkSendConsecutive}
                  disabled={isBulkSendingConsecutive}
                  style={{
                    background: '#d97706',
                    border: 'none',
                    color: 'white',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 12px',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {isBulkSendingConsecutive ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                  Gửi Zalo tất cả
                </button>
              )}
              <span className="leave-badge warning">{consecutiveAbsencesList.length} Học sinh</span>
            </div>
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
                    <th className="text-center">Nhắc Zalo</th>
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
                          <td className="text-center">
                            <button
                              type="button"
                              onClick={() => handleSendZaloRemindConsecutive(s)}
                              disabled={sendingZaloMahv === s.mahv}
                              style={{
                                background: '#fef3c7',
                                color: '#b45309',
                                border: '1px solid #fde68a',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                              title="Gửi tin nhắn Zalo nhắc nghỉ liên tiếp"
                            >
                              {sendingZaloMahv === s.mahv ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                              Nhắc nghỉ
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="7" className="empty-state">Tuyệt vời! Không có học sinh nào vắng liên tiếp kéo dài.</td>
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
                    <div className="card-row" style={{ marginTop: '4px', paddingTop: '8px', borderTop: '1px dashed #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => handleSendZaloRemindConsecutive(s)}
                        disabled={sendingZaloMahv === s.mahv}
                        style={{
                          background: '#d97706',
                          color: 'white',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {sendingZaloMahv === s.mahv ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                        Gửi Zalo nhắc nghỉ
                      </button>
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
