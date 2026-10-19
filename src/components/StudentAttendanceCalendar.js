import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../supabase';
import { X, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import './StudentAttendanceCalendar.css';

export default function StudentAttendanceCalendar({ studentId, studentName, onClose }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [attendance, setAttendance] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  const parseLeaveMessages = (messages = []) => {
    const results = [];
    for (const msg of messages) {
      const content = msg?.content || '';
      if (!content.toUpperCase().includes('XIN NGHỈ')) continue;

      const fromMatch = content.match(/từ\s*ngày\s*[:：]?\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/i);
      const toMatch = content.match(/đến\s*ngày\s*[:：]?\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/i);
      const reasonMatch = content.match(/lý\s*do\s*[:：]?\s*([^\n\r]+)/i);

      let fromDate = '';
      let toDate = '';

      if (fromMatch) {
        fromDate = `${fromMatch[3]}-${String(fromMatch[2]).padStart(2, '0')}-${String(fromMatch[1]).padStart(2, '0')}`;
      }
      if (toMatch) {
        toDate = `${toMatch[3]}-${String(toMatch[2]).padStart(2, '0')}-${String(toMatch[1]).padStart(2, '0')}`;
      } else if (fromDate) {
        toDate = fromDate;
      }

      if (!fromDate) {
        const dateMatch = content.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
        if (dateMatch) {
          fromDate = toDate = `${dateMatch[3]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[1]).padStart(2, '0')}`;
        } else if (msg.created_at) {
          fromDate = toDate = String(msg.created_at).slice(0, 10);
        }
      }

      let timeStr = '';
      if (msg.created_at) {
        const d = new Date(msg.created_at);
        if (!Number.isNaN(d.getTime())) {
          const timePart = d.toLocaleTimeString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });
          const datePart = d.toLocaleDateString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            day: '2-digit',
            month: '2-digit'
          });
          timeStr = `${timePart} ${datePart}`;
        }
      }

      const reason = reasonMatch ? reasonMatch[1].trim() : '';

      results.push({
        id: msg.id,
        created_at: msg.created_at,
        timeStr,
        fromDate,
        toDate,
        reason
      });
    }
    return results;
  };

  const getLeaveInfo = (dateStr, record) => {
    const ghichu = String(record?.ghichu || '').trim();
    const ghichuMatch = ghichu.match(/(?:\[|\()(?:Xin nghỉ|Đã xin nghỉ)(?:\s*lúc)?:?\s*([^\]\)]+)(?:\]|\))/i);
    let timeStr = '';
    if (ghichuMatch) {
      const matchText = ghichuMatch[1].trim();
      const dtMatch = matchText.match(/(\d{1,2}:\d{2})\s*(?:ngày\s*)?(\d{1,2})[\/\-](\d{1,2})/i);
      if (dtMatch) {
        const hhmm = dtMatch[1];
        const dd = String(dtMatch[2]).padStart(2, '0');
        const mm = String(dtMatch[3]).padStart(2, '0');
        timeStr = `${hhmm} ${dd}/${mm}`;
      } else {
        const timeOnly = matchText.match(/\b\d{1,2}:\d{2}\b/);
        timeStr = timeOnly ? timeOnly[0] : matchText;
      }
    }

    const matchingReq = (leaveRequests || []).find(r => {
      if (!r.fromDate || !r.toDate) return false;
      return dateStr >= r.fromDate && dateStr <= r.toDate;
    });

    if (!timeStr) {
      timeStr = matchingReq?.timeStr || '';
    } else if (!timeStr.includes('/') && matchingReq?.timeStr && matchingReq.timeStr.includes('/')) {
      timeStr = matchingReq.timeStr;
    } else if (!timeStr.includes('/') && record?.created_at) {
      const d = new Date(record.created_at);
      if (!Number.isNaN(d.getTime())) {
        const datePart = d.toLocaleDateString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          day: '2-digit',
          month: '2-digit'
        });
        timeStr = `${timeStr} ${datePart}`;
      }
    }

    const cleanReason = ghichu
      .replace(/\[(?:Xin nghỉ|Đã xin nghỉ)[^\]]*\]/gi, '')
      .replace(/\((?:Xin nghỉ|Đã xin nghỉ)[^\)]*\)/gi, '')
      .trim() || matchingReq?.reason || '';

    return {
      timeStr,
      cleanReason
    };
  };

  useEffect(() => {
    if (!studentId) return;

    const fetchMonthlyData = async () => {
      setLoading(true);
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth(); // 0-based

      const paddedMonth = String(month + 1).padStart(2, '0');
      const startDay = `${year}-${paddedMonth}-01`;
      const endDay = `${year}-${paddedMonth}-${new Date(year, month + 1, 0).getDate()}`;

      try {
        const [attRes, chatRes] = await Promise.all([
          supabase
            .from('tbl_diemdanh')
            .select('*')
            .eq('mahv', studentId)
            .gte('ngay', startDay)
            .lte('ngay', endDay),
          supabase
            .from('hv_messages')
            .select('id, content, created_at, description, manv')
            .eq('mahv', studentId)
            .ilike('content', '%XIN NGHỈ%')
            .order('created_at', { ascending: false })
            .limit(50)
        ]);

        if (attRes?.data) {
          setAttendance(attRes.data);
        } else {
          setAttendance([]);
        }

        if (chatRes?.data) {
          setLeaveRequests(parseLeaveMessages(chatRes.data));
        } else {
          setLeaveRequests([]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchMonthlyData();
  }, [studentId, currentDate]);

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 is Sunday

  // Adjust for Monday start: Mon=0, Tue=1 ... Sun=6
  const startDayIndex = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanksBefore = Array.from({ length: startDayIndex }, (_, i) => i);

  const getRecordForDay = (day) => {
    const paddedMonth = String(month + 1).padStart(2, '0');
    const paddedDay = String(day).padStart(2, '0');
    const targetDateStr = `${year}-${paddedMonth}-${paddedDay}`;
    return attendance.find(a => a.ngay === targetDateStr);
  };

  const monthStats = React.useMemo(() => {
    let present = 0;
    let excused = 0;
    let unexcused = 0;
    let late = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const paddedMonth = String(month + 1).padStart(2, '0');
      const paddedDay = String(day).padStart(2, '0');
      const targetDateStr = `${year}-${paddedMonth}-${paddedDay}`;
      const record = attendance.find(a => a.ngay === targetDateStr);
      const leaveInfo = getLeaveInfo(targetDateStr, record);

      if (record) {
        const s = (record.trangthai || '').trim().toLowerCase();
        if (s === 'có mặt') {
          present++;
        } else if (s === 'nghỉ phép') {
          excused++;
        } else if (s === 'nghỉ không phép') {
          unexcused++;
        } else if (s.includes('trả trễ') || s.includes('về trễ')) {
          late++;
        } else {
          present++;
        }
      } else if (leaveInfo.timeStr) {
        excused++;
      }
    }

    const totalRecorded = present + excused + unexcused + late;

    return {
      present,
      excused,
      unexcused,
      late,
      totalRecorded,
      rate: totalRecorded > 0 ? Math.round((present / totalRecorded) * 100) : 0
    };
  }, [attendance, leaveRequests, year, month, daysInMonth]);

  return ReactDOM.createPortal(
    <div
      className="modal-overlay align-top"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(4px)',
        overflowY: 'auto'
      }}
    >
      <div
        className="modal-content form-modal calendar-modal"
        style={{
          maxWidth: '860px',
          width: '95vw',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          margin: 'auto'
        }}
      >
        <div className="modal-header">
          <h3>Chi tiết điểm danh - <span className="text-primary">{studentName} ({studentId})</span></h3>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div
          className="modal-body"
          style={{
            overflowY: 'auto',
            maxHeight: 'calc(94vh - 75px)',
            display: 'flex',
            flexDirection: 'column',
            padding: '0.6rem 1rem 0.6rem',
            gap: '0.4rem'
          }}
        >
          <div className="calendar-toolbar">
            <button className="btn btn-outline" onClick={prevMonth}><ChevronLeft size={18} /></button>
            <h4 className="calendar-month">Tháng {month + 1} - {year}</h4>
            <button className="btn btn-outline" onClick={nextMonth}><ChevronRight size={18} /></button>
          </div>

          {/* Monthly Attendance Summary Statistics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px', marginBottom: '0.4rem' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '6px 10px', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Tổng ngày ghi</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginTop: '1px' }}>{monthStats.totalRecorded}</div>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '6px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>Có mặt</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#15803d', marginTop: '1px' }}>{monthStats.present}</div>
            </div>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '6px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#d97706', textTransform: 'uppercase' }}>Nghỉ phép</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#b45309', marginTop: '1px' }}>{monthStats.excused}</div>
            </div>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '6px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase' }}>Nghỉ KP</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#b91c1c', marginTop: '1px' }}>{monthStats.unexcused}</div>
            </div>
            {monthStats.late > 0 && (
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '6px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#ea580c', textTransform: 'uppercase' }}>Trả trễ</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#c2410c', marginTop: '1px' }}>{monthStats.late}</div>
              </div>
            )}
            <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '12px', padding: '6px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#0d9488', textTransform: 'uppercase' }}>Tỷ lệ đi học</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f766e', marginTop: '1px' }}>
                {monthStats.totalRecorded > 0 ? `${monthStats.rate}%` : '--'}
              </div>
            </div>
          </div>

          <div className="calendar-wrapper" style={{ flex: 'none', overflow: 'hidden' }}>
            <div className="calendar-grid-header">
              <div className="day-name">T2</div>
              <div className="day-name">T3</div>
              <div className="day-name">T4</div>
              <div className="day-name">T5</div>
              <div className="day-name">T6</div>
              <div className="day-name">T7</div>
              <div className="day-name">CN</div>
            </div>

            <div className={`calendar-grid ${loading ? 'opacity-50' : ''}`}>
              {blanksBefore.map((b) => (
                <div key={`blank-${b}`} className="calendar-cell blank"></div>
              ))}

              {daysArray.map((day) => {
                const record = getRecordForDay(day);
                const paddedMonth = String(month + 1).padStart(2, '0');
                const paddedDay = String(day).padStart(2, '0');
                const targetDateStr = `${year}-${paddedMonth}-${paddedDay}`;
                const leaveInfo = getLeaveInfo(targetDateStr, record);

                let statusClass = '';
                let isExcused = false;
                let isUnexcused = false;

                if (record) {
                  const s = (record.trangthai || '').trim().toLowerCase();
                  if (s === 'có mặt') statusClass = 'present';
                  else if (s === 'nghỉ phép') { statusClass = 'excused'; isExcused = true; }
                  else if (s === 'nghỉ không phép') { statusClass = 'unexcused'; isUnexcused = true; }
                } else if (leaveInfo.timeStr) {
                  statusClass = 'excused';
                  isExcused = true;
                }

                const isLeave = isExcused || isUnexcused;

                return (
                  <div key={day} className={`calendar-cell ${statusClass}`}>
                    <div className="cell-header">
                      <span className="cell-date">{day}</span>
                      {isLeave && (
                        <Clock size={13} strokeWidth={1.8} className="cell-clock-icon" />
                      )}
                    </div>
                    {record ? (
                      <div className="cell-content">
                        <div className={`cell-status-pill ${statusClass}`}>
                          {record.trangthai}
                        </div>
                        {isLeave && leaveInfo.timeStr && (
                          <div className="cell-leave-time">
                            {leaveInfo.timeStr}
                          </div>
                        )}
                        {leaveInfo.cleanReason ? (
                          <div className="cell-leave-reason" title={leaveInfo.cleanReason}>
                            {leaveInfo.cleanReason}
                          </div>
                        ) : (
                          !isLeave && record.ghichu && <p className="cell-notes">{record.ghichu}</p>
                        )}
                      </div>
                    ) : leaveInfo.timeStr ? (
                      <div className="cell-content">
                        <div className="cell-status-pill excused">
                          Nghỉ phép
                        </div>
                        <div className="cell-leave-time">
                          {leaveInfo.timeStr}
                        </div>
                        {leaveInfo.cleanReason && (
                          <div className="cell-leave-reason" title={leaveInfo.cleanReason}>
                            {leaveInfo.cleanReason}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {loading && <div className="calendar-overlay">Đang tải...</div>}
          </div>

          <div className="calendar-legend" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="legend-item"><div className="legend-color present"></div> Có mặt ({monthStats.present})</div>
              <div className="legend-item"><div className="legend-color excused"></div> Nghỉ phép ({monthStats.excused})</div>
              <div className="legend-item"><div className="legend-color unexcused"></div> Nghỉ không phép ({monthStats.unexcused})</div>
              {monthStats.late > 0 && (
                <div className="legend-item"><div className="legend-color" style={{ background: '#f97316' }}></div> Trả trễ ({monthStats.late})</div>
              )}
            </div>
            {monthStats.totalRecorded > 0 && (
              <div style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>
                Tổng kết tháng {month + 1}/{year}: <strong style={{ color: '#15803d' }}>{monthStats.present}</strong>/{monthStats.totalRecorded} buổi có mặt ({monthStats.rate}%)
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
