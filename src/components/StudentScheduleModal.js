import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase';
import { useConfig } from '../ConfigContext';
import { X, Trash2, Plus, Calendar } from 'lucide-react';

export default function StudentScheduleModal({ student, classes, onClose }) {
  const { config } = useConfig();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);

  // New entry form state
  const [newMalop, setNewMalop] = useState('');
  const [classSchedules, setClassSchedules] = useState([]);
  const [newClassScheduleId, setNewClassScheduleId] = useState('');

  // Custom schedule state
  const [selectedDays, setSelectedDays] = useState([]);
  const [timeStr, setTimeStr] = useState('');

  const lichTheoLop = config?.lichhoctheolop !== false; // Default to true if undefined

  const dayOptions = [
    { value: 't2', label: 'T2' },
    { value: 't3', label: 'T3' },
    { value: 't4', label: 'T4' },
    { value: 't5', label: 'T5' },
    { value: 't6', label: 'T6' },
    { value: 't7', label: 'T7' },
    { value: 'cn', label: 'CN' }
  ];

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('tbl_lichhoc_hv')
        .select('*')
        .eq('mahv', student.mahv)
        .order('id', { ascending: false });
      setSchedules(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (student) fetchSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student]);

  useEffect(() => {
    const fetchClassSchedules = async () => {
      if (lichTheoLop && newMalop) {
        try {
          const { data } = await supabase
            .from('tbl_lichhoc_lop')
            .select('*')
            .eq('malop', newMalop);
          setClassSchedules(data || []);
          if (data && data.length > 0) setNewClassScheduleId(data[0].id.toString());
          else setNewClassScheduleId('');
        } catch (err) {
          console.error(err);
        }
      } else {
        setClassSchedules([]);
        setNewClassScheduleId('');
      }
    };
    fetchClassSchedules();
  }, [newMalop, lichTheoLop]);

  const toggleDay = (d) => {
    setSelectedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const handleAdd = async () => {
    if (!newMalop) return alert('Vui lòng chọn lớp học');

    let dbLichhoc = '';
    let dbGiohoc = '';
    let dbLoailich = 'class';
    let dbLopLichId = null;

    if (lichTheoLop) {
      if (!newClassScheduleId) return alert('Lớp chưa có lịch trong hệ thống. Vui lòng xếp lịch cho lớp.');
      const sc = classSchedules.find(x => x.id.toString() === newClassScheduleId.toString());
      if (sc) {
        dbLichhoc = sc.lichhoc || '';
        dbGiohoc = sc.giohoc || '';
        dbLopLichId = sc.id;
        dbLoailich = 'class';
      }
    } else {
      if (selectedDays.length === 0) return alert('Vui lòng chọn ngày học');
      if (!timeStr) return alert('Vui lòng nhập giờ học (VD: 18:00 - 21:00)');
      dbLichhoc = selectedDays.join(', ');
      dbGiohoc = timeStr;
      dbLoailich = 'custom';
    }

    try {
      const { error } = await supabase.from('tbl_lichhoc_hv').insert([{
        mahv: student.mahv,
        malop: newMalop,
        lichhoc_lop_id: dbLopLichId,
        lichhoc: dbLichhoc,
        giohoc: dbGiohoc,
        loailich: dbLoailich,
        trangthai: 'active'
      }]);
      if (error) throw error;

      // Reset form
      setNewMalop('');
      setNewClassScheduleId('');
      setSelectedDays([]);
      setTimeStr('');

      fetchSchedules();
    } catch (err) {
      console.error(err);
      alert('Lỗi đăng ký lịch học');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Ban có chắc muốn xoá lịch học này?')) return;
    try {
      const { error } = await supabase.from('tbl_lichhoc_hv').delete().eq('id', id);
      if (error) throw error;
      fetchSchedules();
    } catch (err) {
      console.error(err);
      alert('Lỗi xoá lịch học');
    }
  };

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-content sm-modal" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3><Calendar size={20} /> Lịch Học / Lớp Của Học Viên</h3>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <p>Học viên: <strong className="text-primary">{student.tenhv}</strong> - {student.mahv}</p>

          <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', marginTop: '15px' }}>
            <h4 style={{ marginBottom: '10px', fontSize: '15px' }}>Đăng Ký Mới</h4>
            <div className="form-group">
              <label>Lớp Học</label>
              <select value={newMalop} onChange={e => setNewMalop(e.target.value)}>
                <option value="">-- Chọn lớp --</option>
                {classes.map(c => <option key={c.malop} value={c.malop}>{c.tenlop} ({c.malop})</option>)}
              </select>
            </div>

            {newMalop && (
              <div style={{ marginTop: '10px' }}>
                {lichTheoLop ? (
                  <div className="form-group">
                    <label>Lịch của lớp:</label>
                    <select value={newClassScheduleId} onChange={e => setNewClassScheduleId(e.target.value)}>
                      <option value="">-- Chọn lịch lớp --</option>
                      {classSchedules.map(sc => (
                        <option key={sc.id} value={sc.id}>Học ngày: {sc.lichhoc} ({sc.giohoc})</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div className="form-group" style={{ marginBottom: '10px' }}>
                      <label>Ngày học trong tuần (Lịch tuỳ chỉnh):</label>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {dayOptions.map(opt => (
                          <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', background: selectedDays.includes(opt.value) ? '#e0f2fe' : '#f1f5f9', padding: '4px 8px', borderRadius: '4px' }}>
                            <input type="checkbox" checked={selectedDays.includes(opt.value)} onChange={() => toggleDay(opt.value)} /> {opt.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Giờ học (VD: 18:00 - 21:00):</label>
                      <input type="text" value={timeStr} onChange={e => setTimeStr(e.target.value)} placeholder="08:00 - 10:00" />
                    </div>
                  </>
                )}

                <button className="btn btn-primary" style={{ marginTop: '10px' }} onClick={handleAdd}>
                  <Plus size={16} /> Lưu
                </button>
              </div>
            )}
          </div>

          <div style={{ marginTop: '20px' }}>
            <h4 style={{ marginBottom: '10px', fontSize: '15px' }}>Danh Sách Đã Đăng Ký</h4>
            {loading ? <p>Đang tải...</p> : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Lớp</th>
                    <th>Ngày Học</th>
                    <th>Giờ Học</th>
                    <th>Loại</th>
                    <th style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.length > 0 ? schedules.map(sc => (
                    <tr key={sc.id}>
                      <td className="font-semibold text-primary">{classes.find(c => c.malop === sc.malop)?.tenlop || sc.malop}</td>
                      <td>{sc.lichhoc}</td>
                      <td>{sc.giohoc}</td>
                      <td>
                        <span className="badge-style" style={{ padding: '2px 6px', fontSize: '0.75rem', borderRadius: '4px', background: sc.loailich === 'custom' ? '#fef08a' : '#bfdbfe' }}>
                          {sc.loailich === 'custom' ? 'Riêng' : 'Theo Lớp'}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-outline p-1" style={{ color: '#ef4444', borderColor: '#ef4444', minWidth: 0 }} onClick={() => handleDelete(sc.id)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '1rem', color: '#64748b' }}>Chưa đăng ký lịch học nào</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
