import React, { useState, useEffect } from 'react';
import { supabase, insertLog } from '../supabase';
import { Search, Filter, Download, RefreshCw, UserCheck, UserX, Clock, Edit2 } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function NgoaiKhoaManager({ currentUser }) {
  const [loading, setLoading] = useState(false);
  const [savingStudent, setSavingStudent] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [classFilter, setClassFilter] = useState('');
  const [responseFilter, setResponseFilter] = useState('all'); // 'all' | 'registered' | 'not_registered' | 'no_response'
  const [searchTerm, setSearchTerm] = useState('');

  const [lastAnnouncementDate, setLastAnnouncementDate] = useState(null);
  const canManageNgoaiKhoa = currentUser?.role === 'Quản lý';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch latest extracurricular announcement
      const { data: latestAnnounce } = await supabase
        .from('class_announcements')
        .select('created_at')
        .ilike('content', '%🌟 THÔNG TIN HOẠT ĐỘNG NGOẠI KHÓA 🌟%')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const announceDate = latestAnnounce ? new Date(latestAnnounce.created_at) : new Date(0);
      setLastAnnouncementDate(announceDate);

      // 2. Fetch classes
      const { data: clsData } = await supabase.from('tbl_lop').select('malop, tenlop').or('daxoa.neq."Đã Xóa",daxoa.is.null');
      setClasses(clsData || []);

      // 3. Fetch active students only
      const { data: stData } = await supabase
        .from('tbl_hv')
        .select('mahv, tenhv, malop, trangthai');
      
      // Filter active students in memory to be robust with casing
      const activeStudents = (stData || []).filter(s => (s.trangthai || '').trim().toLowerCase() === 'đang học');
      setStudents(activeStudents);

      // 4. Fetch registrations (ONLY after latest announcement)
      const { data: regData } = await supabase
        .from('dangkyngoaikhoa')
        .select('*')
        .gt('ngaydangky', announceDate.toISOString())
        .order('ngaydangky', { ascending: false });
        
      setRegistrations(regData || []);
      
      console.log('Latest Announce Date:', announceDate);
      console.log('Fetched registrations:', regData?.length);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const combinedData = students.map(student => {
    // Robust matching: trim and case-insensitive
    const studentMaHV = (student.mahv || '').trim().toUpperCase();
    const reg = registrations.find(r => (r.mahv || '').trim().toUpperCase() === studentMaHV);
    
    const className = classes.find(c => c.malop === student.malop)?.tenlop || student.malop;
    return {
      ...student,
      className,
      hasResponded: !!reg,
      codangky: reg ? reg.codangky : null,
      lydo: reg ? reg.lydo : '',
      ngaydangky: reg ? reg.ngaydangky : null
    };
  });

  const filteredData = combinedData.filter(item => {
    const matchClass = classFilter ? item.malop === classFilter : true;
    const matchSearch = (item.tenhv || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                       (item.mahv || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchResponse = true;
    if (responseFilter === 'registered') matchResponse = item.codangky === true;
    else if (responseFilter === 'not_registered') matchResponse = item.codangky === false;
    else if (responseFilter === 'no_response') matchResponse = !item.hasResponded;

    return matchClass && matchSearch && matchResponse;
  });

  const getDraft = (item) => {
    const existingDraft = drafts[item.mahv];
    if (existingDraft) return existingDraft;

    return {
      status: !item.hasResponded ? 'no_response' : (item.codangky ? 'registered' : 'not_registered'),
      note: item.lydo || ''
    };
  };

  const updateDraft = (mahv, patch) => {
    setDrafts(prev => ({
      ...prev,
      [mahv]: {
        ...(prev[mahv] || {}),
        ...patch
      }
    }));
  };

  const handleSaveRegistration = async (item) => {
    const draft = getDraft(item);
    const note = (draft.note || '').trim();
    const nextStatus = draft.status;

    if (nextStatus === 'no_response') {
      window.alert('Please choose registered or not registered before saving.');
      return;
    }

    setSavingStudent(item.mahv);
    try {
      const payload = {
        mahv: item.mahv,
        codangky: nextStatus === 'registered',
        lydo: note,
        ngaydangky: new Date().toISOString()
      };

      let result;
      if (item.hasResponded && item.ngaydangky) {
        result = await supabase
          .from('dangkyngoaikhoa')
          .update(payload)
          .eq('mahv', item.mahv)
          .eq('ngaydangky', item.ngaydangky);
      } else {
        result = await supabase
          .from('dangkyngoaikhoa')
          .insert([payload]);
      }

      if (result.error) throw result.error;

      insertLog(`[NGOẠI KHÓA] Cập nhật đăng ký cho học sinh: ${item.mahv}`);
      setEditingStudent(null);
      await fetchData();
    } catch (error) {
      console.error('Error saving extracurricular registration:', error);
      window.alert('Save failed.');
    } finally {
      setSavingStudent(null);
    }
  };

  const stats = {
    total: filteredData.length,
    registered: filteredData.filter(i => i.codangky === true).length,
    notRegistered: filteredData.filter(i => i.codangky === false).length,
    noResponse: filteredData.filter(i => !i.hasResponded).length
  };

  const getStatusMeta = (itemOrStatus) => {
    const status = typeof itemOrStatus === 'string'
      ? itemOrStatus
      : (!itemOrStatus.hasResponded ? 'no_response' : (itemOrStatus.codangky ? 'registered' : 'not_registered'));

    if (status === 'registered') {
      return {
        label: 'Đã đăng ký',
        background: '#dcfce7',
        color: '#166534',
        border: '#86efac'
      };
    }

    if (status === 'not_registered') {
      return {
        label: 'Không tham gia',
        background: '#fee2e2',
        color: '#991b1b',
        border: '#fca5a5'
      };
    }

    return {
      label: 'Chưa phản hồi',
      background: '#e5e7eb',
      color: '#374151',
      border: '#cbd5e1'
    };
  };

  const handleExport = () => {
    const exportData = filteredData.map(i => ({
      'Mã HS': i.mahv,
      'Tên Học Sinh': i.tenhv,
      'Lớp': i.className,
      'Trạng thái': !i.hasResponded ? 'Chưa phản hồi' : (i.codangky ? 'Đã đăng ký' : 'Không tham gia'),
      'Ngày đăng ký': i.ngaydangky ? new Date(i.ngaydangky).toLocaleString('vi-VN') : '',
      'Lý do (nếu không tham gia)': i.lydo || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DangKyNgoaiKhoa");
    XLSX.writeFile(wb, `Danh_sach_ngoai_khoa_${new Date().getTime()}.xlsx`);
  };

  return (
    <div className="ngoaikhoa-manager animate-fade-in" style={{ padding: '20px' }}>
      <div style={{ marginBottom: '15px', color: '#64748b', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Clock size={16} />
        <span>Chỉ hiển thị đăng ký từ sau ngày đăng thông tin mới nhất: 
          <strong> {lastAnnouncementDate && lastAnnouncementDate.getTime() > 0 ? lastAnnouncementDate.toLocaleString('vi-VN') : 'Không tìm thấy thông tin mới'}</strong>
        </span>
      </div>
      <div className="stats-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        <div className="stat-card" style={{ background: '#eff6ff', padding: '20px', borderRadius: '15px', border: '1px solid #dbeafe' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#1e40af' }}>
            <Filter size={20} />
            <span style={{ fontWeight: 600 }}>Tổng số HS (Lọc)</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '10px' }}>{stats.total}</div>
        </div>
        <div className="stat-card" style={{ background: '#ecfdf5', padding: '20px', borderRadius: '15px', border: '1px solid #d1fae5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#065f46' }}>
            <UserCheck size={20} />
            <span style={{ fontWeight: 600 }}>Đã đăng ký</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '10px', color: '#10b981' }}>{stats.registered}</div>
        </div>
        <div className="stat-card" style={{ background: '#fef2f2', padding: '20px', borderRadius: '15px', border: '1px solid #fee2e2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#991b1b' }}>
            <UserX size={20} />
            <span style={{ fontWeight: 600 }}>Không tham gia</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '10px', color: '#ef4444' }}>{stats.notRegistered}</div>
        </div>
        <div className="stat-card" style={{ background: '#fffbeb', padding: '20px', borderRadius: '15px', border: '1px solid #fef3c7' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#92400e' }}>
            <Clock size={20} />
            <span style={{ fontWeight: 600 }}>Chưa phản hồi</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '10px', color: '#f59e0b' }}>{stats.noResponse}</div>
        </div>
      </div>

      <div className="toolbar" style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input 
            type="text" 
            placeholder="Tìm tên hoặc mã học sinh..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '10px 10px 10px 40px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }}
          />
        </div>
        <select 
          value={classFilter} 
          onChange={(e) => setClassFilter(e.target.value)}
          style={{ padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', minWidth: '150px' }}
        >
          <option value="">Tất cả lớp</option>
          {classes.map(c => <option key={c.malop} value={c.malop}>{c.tenlop}</option>)}
        </select>
        <select 
          value={responseFilter} 
          onChange={(e) => setResponseFilter(e.target.value)}
          style={{ padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', minWidth: '170px' }}
        >
          <option value="all">Tất cả phản hồi</option>
          <option value="registered">Đã đăng ký</option>
          <option value="not_registered">Không tham gia</option>
          <option value="no_response">Chưa phản hồi</option>
        </select>
        <button 
          onClick={fetchData} 
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}
        >
          <RefreshCw size={18} className={loading ? 'spinner' : ''} />
          Cập nhật
        </button>
        <button 
          onClick={handleExport}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '12px', border: 'none', background: '#10b981', color: 'white', cursor: 'pointer' }}
        >
          <Download size={18} />
          Xuất Excel
        </button>
      </div>

      <div className="table-container" style={{ background: 'white', borderRadius: '15px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc' }}>
            <tr>
              <th style={{ padding: '15px', borderBottom: '1px solid #e2e8f0' }}>Mã HS</th>
              <th style={{ padding: '15px', borderBottom: '1px solid #e2e8f0' }}>Học sinh</th>
              <th style={{ padding: '15px', borderBottom: '1px solid #e2e8f0' }}>Lớp</th>
              <th style={{ padding: '15px', borderBottom: '1px solid #e2e8f0' }}>Trạng thái</th>
              <th style={{ padding: '15px', borderBottom: '1px solid #e2e8f0' }}>Thời gian</th>
              <th style={{ padding: '15px', borderBottom: '1px solid #e2e8f0' }}>Ghi chú/Lý do</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Đang tải dữ liệu...</td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Không có dữ liệu phù hợp</td>
              </tr>
            ) : filteredData.map((item) => (
              <tr key={item.mahv} style={{ borderBottom: '1px solid #f1f5f9' }}>
                {(() => {
                  const isEditing = editingStudent === item.mahv;
                  const draft = getDraft(item);
                  const statusMeta = getStatusMeta(isEditing ? draft.status : item);

                  return (
                    <>
                <td style={{ padding: '15px' }}>{item.mahv}</td>
                <td style={{ padding: '15px', fontWeight: 600 }}>{item.tenhv}</td>
                <td style={{ padding: '15px' }}>{item.className}</td>
                <td style={{ padding: '15px' }}>
                  {canManageNgoaiKhoa && isEditing ? (
                    <select
                      value={draft.status}
                      onChange={(e) => updateDraft(item.mahv, { status: e.target.value })}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: `1px solid ${statusMeta.border}`,
                        minWidth: '150px',
                        background: statusMeta.background,
                        color: statusMeta.color,
                        fontWeight: 600
                      }}
                    >
                      <option value="no_response">Chưa phản hồi</option>
                      <option value="registered">Đã đăng ký</option>
                      <option value="not_registered">Không tham gia</option>
                    </select>
                  ) : (
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        background: statusMeta.background,
                        color: statusMeta.color,
                        border: `1px solid ${statusMeta.border}`,
                        fontSize: '12px',
                        fontWeight: 600
                      }}
                    >
                      {statusMeta.label}
                    </span>
                  )}
                </td>
                <td style={{ padding: '15px', fontSize: '13px', color: '#64748b' }}>
                  {item.ngaydangky ? new Date(item.ngaydangky).toLocaleString('vi-VN') : '-'}
                </td>
                <td style={{ padding: '15px', fontSize: '13px', color: '#475569', fontStyle: 'italic' }}>
                  {canManageNgoaiKhoa && isEditing ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={draft.note}
                        onChange={(e) => updateDraft(item.mahv, { note: e.target.value })}
                        style={{ flex: 1, minWidth: '180px', padding: '8px 10px', borderRadius: '10px', border: '1px solid #dbe2ea', fontStyle: 'normal' }}
                      />
                      <button
                        onClick={() => handleSaveRegistration(item)}
                        disabled={savingStudent === item.mahv}
                        style={{ padding: '8px 12px', borderRadius: '10px', border: 'none', background: '#16a34a', color: 'white', cursor: savingStudent === item.mahv ? 'not-allowed' : 'pointer', opacity: savingStudent === item.mahv ? 0.7 : 1, fontStyle: 'normal' }}
                      >
                        {savingStudent === item.mahv ? 'Đang lưu...' : 'Lưu'}
                      </button>
                      <button
                        onClick={() => setEditingStudent(null)}
                        disabled={savingStudent === item.mahv}
                        style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', cursor: savingStudent === item.mahv ? 'not-allowed' : 'pointer', opacity: savingStudent === item.mahv ? 0.7 : 1, fontStyle: 'normal' }}
                      >
                        Hủy
                      </button>
                    </div>
                  ) : canManageNgoaiKhoa ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{item.lydo || '-'}</span>
                      <button
                        onClick={() => {
                          updateDraft(item.mahv, {
                            status: !item.hasResponded ? 'no_response' : (item.codangky ? 'registered' : 'not_registered'),
                            note: item.lydo || ''
                          });
                          setEditingStudent(item.mahv);
                        }}
                        style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontStyle: 'normal', fontWeight: 600 }}
                      >
                        <Edit2 size={14} /> Edit
                      </button>
                    </div>
                  ) : (
                    item.lydo || '-'
                  )}
                </td>
                    </>
                  );
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
