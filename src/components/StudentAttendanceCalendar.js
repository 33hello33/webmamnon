import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../supabase';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import './StudentAttendanceCalendar.css';

export default function StudentAttendanceCalendar({ studentId, studentName, onClose }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(false);

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
        const { data, error } = await supabase
          .from('tbl_diemdanh')
          .select('*')
          .eq('mahv', studentId)
          .gte('ngay', startDay)
          .lte('ngay', endDay);

        if (!error && data) {
          setAttendance(data);
        } else {
          setAttendance([]);
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

  return ReactDOM.createPortal(
    <div className="modal-overlay align-top">
      <div className="modal-content form-modal calendar-modal">
        <div className="modal-header">
          <h3>Chi tiết điểm danh - <span className="text-primary">{studentName} ({studentId})</span></h3>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          <div className="calendar-toolbar">
            <button className="btn btn-outline" onClick={prevMonth}><ChevronLeft size={18} /></button>
            <h4 className="calendar-month">Tháng {month + 1} - {year}</h4>
            <button className="btn btn-outline" onClick={nextMonth}><ChevronRight size={18} /></button>
          </div>

          <div className="calendar-wrapper">
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
                let statusClass = '';
                if (record) {
                  const s = (record.trangthai || '').trim().toLowerCase();
                  if (s === 'có mặt') statusClass = 'present';
                  else if (s === 'nghỉ phép') statusClass = 'excused';
                  else if (s === 'nghỉ không phép') statusClass = 'unexcused';
                }

                return (
                  <div key={day} className={`calendar-cell ${statusClass}`}>
                    <div className="cell-date">{day}</div>
                    {record && (
                      <div className="cell-content">
                        <strong>{record.trangthai}</strong>
                        {record.ghichu && <p className="cell-notes">{record.ghichu}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {loading && <div className="calendar-overlay">Đang tải...</div>}
          </div>

          <div className="calendar-legend">
            <div className="legend-item"><div className="legend-color present"></div> Có mặt</div>
            <div className="legend-item"><div className="legend-color excused"></div> Nghỉ phép</div>
            <div className="legend-item"><div className="legend-color unexcused"></div> Nghỉ không phép</div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
