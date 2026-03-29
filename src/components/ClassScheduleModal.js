import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase';
import { X, Trash2, Plus, Clock } from 'lucide-react';

export default function ClassScheduleModal({ classItem, onClose }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Custom schedule state
  const [selectedDays, setSelectedDays] = useState([]);
  const [timeStr, setTimeStr] = useState('');

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
        .from('tbl_lichhoc_lop')
        .select('*')
        .eq('malop', classItem.malop)
        .order('id', { ascending: false });
      setSchedules(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (classItem && classItem.malop) fetchSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classItem]);

  const toggleDay = (d) => {
    setSelectedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const handleAdd = async () => {
    if (selectedDays.length === 0) return alert('Vui lòng chọn ngày học');
    if (!timeStr) return alert('Vui lòng nhập giờ học (VD: 18:00 - 20:00)');
    
    // Sort days chronologically
    const mapOrder = { 't2': 2, 't3': 3, 't4': 4, 't5': 5, 't6': 6, 't7': 7, 'cn': 8 };
    const sortedDays = [...selectedDays].sort((a, b) => mapOrder[a] - mapOrder[b]);
    
    try {
      const { error } = await supabase.from('tbl_lichhoc_lop').insert([{
        malop: classItem.malop,
        lichhoc: sortedDays.join(', '),
        giohoc: timeStr
      }]);
      if (error) throw error;
      
      setSelectedDays([]);
      setTimeStr('');
      fetchSchedules();
    } catch (err) {
      console.error(err);
      alert('Lỗi thêm lịch học');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc muốn xoá lịch học này? Lịch học của học viên đang học khung lịch này có thể sẽ bị trống mã tham chiếu.')) return;
    try {
      const { error } = await supabase.from('tbl_lichhoc_lop').delete().eq('id', id);
      if (error) throw error;
      fetchSchedules();
    } catch (err) {
      console.error(err);
      alert('Lỗi xoá lịch học');
    }
  };

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 1200 }}>
      <div className="modal-content sm-modal" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3><Clock size={20} /> Quản Lý Lịch Theo Lớp</h3>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <p>Lớp học: <strong className="text-primary">{classItem.tenlop}</strong> - {classItem.malop}</p>
          
          <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', marginTop: '15px' }}>
            <h4 style={{ marginBottom: '10px', fontSize: '15px' }}>Thêm Lịch Mới</h4>
            
            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>Ngày học trong tuần:</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {dayOptions.map(opt => (
                  <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', background: selectedDays.includes(opt.value) ? '#e0f2fe' : '#f1f5f9', padding: '4px 8px', borderRadius: '4px' }}>
                    <input type="checkbox" checked={selectedDays.includes(opt.value)} onChange={() => toggleDay(opt.value)} /> {opt.label}
                  </label>
                ))}
              </div>
            </div>
            
            <div className="form-group">
              <label>Giờ học (VD: 18:00 - 20:00):</label>
              <input type="text" value={timeStr} onChange={e => setTimeStr(e.target.value)} placeholder="18:00 - 20:00" />
            </div>
              
            <button className="btn btn-primary" style={{ marginTop: '10px' }} onClick={handleAdd}>
              <Plus size={16} /> Thêm Khung Lịch
            </button>
          </div>

          <div style={{ marginTop: '20px' }}>
            <h4 style={{ marginBottom: '10px', fontSize: '15px' }}>Các Khung Lịch Của Lớp</h4>
            {loading ? <p>Đang tải...</p> : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Lịch học (Ngày)</th>
                    <th>Giờ học</th>
                    <th style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.length > 0 ? schedules.map(sc => (
                    <tr key={sc.id}>
                      <td className="font-medium text-primary">{sc.lichhoc}</td>
                      <td className="font-bold">{sc.giohoc}</td>
                      <td>
                        <button className="btn btn-outline p-1" style={{ color: '#ef4444', borderColor: '#ef4444', minWidth: 0 }} onClick={() => handleDelete(sc.id)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="3" style={{ textAlign: 'center', padding: '1rem', color: '#64748b' }}>Chưa có khung lịch nào</td></tr>
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
