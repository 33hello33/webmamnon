import React, { useEffect, useMemo, useState } from 'react';
import { supabase, insertLog } from '../supabase';
import { Search, Filter, Download, RefreshCw, UserCheck, UserX, Clock, Edit2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { buildNgoaiKhoaCloseContent, getActiveNgoaiKhoaAnnouncements, getArchivedNgoaiKhoaPrograms } from '../utils/ngoaiKhoaUtils';

export default function NgoaiKhoaManager({ currentUser }) {
  const [loading, setLoading] = useState(false);
  const [savingStudent, setSavingStudent] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [endingProgram, setEndingProgram] = useState(false);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [classFilter, setClassFilter] = useState('');
  const [responseFilter, setResponseFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [lastAnnouncementDate, setLastAnnouncementDate] = useState(null);
  const [currentProgram, setCurrentProgram] = useState(null);
  const [currentProgramAnnouncements, setCurrentProgramAnnouncements] = useState([]);
  const [archivedPrograms, setArchivedPrograms] = useState([]);

  const canManageNgoaiKhoa = currentUser?.role === 'Quản lý';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: ngoaiKhoaAnnouncements } = await supabase
        .from('class_announcements')
        .select('*')
        .eq('title', 'NGOẠI KHÓA')
        .eq('approved', true)
        .order('created_at', { ascending: false })
        .limit(200);

      const activeAnnouncements = getActiveNgoaiKhoaAnnouncements(ngoaiKhoaAnnouncements || []);
      const latestActiveAnnouncement = activeAnnouncements[0] || null;
      const announceDate = latestActiveAnnouncement ? new Date(latestActiveAnnouncement.created_at) : new Date(0);

      setCurrentProgram(latestActiveAnnouncement);
      setCurrentProgramAnnouncements(activeAnnouncements);
      setLastAnnouncementDate(latestActiveAnnouncement ? announceDate : null);
      setArchivedPrograms(getArchivedNgoaiKhoaPrograms(ngoaiKhoaAnnouncements || []));

      const { data: clsData } = await supabase
        .from('tbl_lop')
        .select('malop, tenlop')
        .or('daxoa.neq."Đã Xóa",daxoa.is.null');
      setClasses(clsData || []);

      const { data: stData } = await supabase
        .from('tbl_hv')
        .select('mahv, tenhv, malop, trangthai');
      const activeStudents = (stData || []).filter((student) => String(student.trangthai || '').trim().toLowerCase() === 'đang học');
      setStudents(activeStudents);

      if (!latestActiveAnnouncement) {
        setRegistrations([]);
        return;
      }

      const { data: regData } = await supabase
        .from('dangkyngoaikhoa')
        .select('*')
        .gt('ngaydangky', announceDate.toISOString())
        .order('ngaydangky', { ascending: false });

      setRegistrations(regData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const combinedData = useMemo(() => {
    if (!currentProgram) return [];

    return students.map((student) => {
      const studentMaHV = String(student.mahv || '').trim().toUpperCase();
      const reg = registrations.find((item) => String(item.mahv || '').trim().toUpperCase() === studentMaHV);
      const className = classes.find((cls) => cls.malop === student.malop)?.tenlop || student.malop;

      return {
        ...student,
        className,
        hasResponded: Boolean(reg),
        codangky: reg ? reg.codangky : null,
        lydo: reg ? reg.lydo : '',
        ngaydangky: reg ? reg.ngaydangky : null
      };
    });
  }, [classes, currentProgram, registrations, students]);

  const filteredData = useMemo(() => {
    return combinedData.filter((item) => {
      const matchClass = classFilter ? item.malop === classFilter : true;
      const matchSearch = String(item.tenhv || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(item.mahv || '').toLowerCase().includes(searchTerm.toLowerCase());

      let matchResponse = true;
      if (responseFilter === 'registered') matchResponse = item.codangky === true;
      else if (responseFilter === 'not_registered') matchResponse = item.codangky === false;
      else if (responseFilter === 'no_response') matchResponse = !item.hasResponded;

      return matchClass && matchSearch && matchResponse;
    });
  }, [classFilter, combinedData, responseFilter, searchTerm]);

  const getDraft = (item) => {
    if (drafts[item.mahv]) return drafts[item.mahv];
    return {
      status: !item.hasResponded ? 'no_response' : (item.codangky ? 'registered' : 'not_registered'),
      note: item.lydo || ''
    };
  };

  const updateDraft = (mahv, patch) => {
    setDrafts((prev) => ({
      ...prev,
      [mahv]: {
        ...(prev[mahv] || {}),
        ...patch
      }
    }));
  };

  const handleSaveRegistration = async (item) => {
    const draft = getDraft(item);
    const nextStatus = draft.status;
    const note = String(draft.note || '').trim();

    if (nextStatus === 'no_response') {
      window.alert('Vui lòng chọn trạng thái trước khi lưu.');
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
        result = await supabase.from('dangkyngoaikhoa').insert([payload]);
      }

      if (result.error) throw result.error;

      insertLog(`[NGOẠI KHÓA] Cập nhật đăng ký cho học sinh: ${item.mahv}`);
      setEditingStudent(null);
      await fetchData();
    } catch (error) {
      console.error('Error saving extracurricular registration:', error);
      window.alert('Lưu đăng ký thất bại.');
    } finally {
      setSavingStudent(null);
    }
  };

  const handleEndProgram = async () => {
    if (!currentProgram) {
      window.alert('Không có chương trình ngoại khóa đang mở.');
      return;
    }
    if (!window.confirm('Kết thúc chương trình ngoại khóa hiện tại?')) return;

    setEndingProgram(true);
    try {
      const snapshotItems = combinedData.map((item) => ({
        mahv: item.mahv,
        tenhv: item.tenhv,
        malop: item.malop,
        className: item.className,
        hasResponded: item.hasResponded,
        codangky: item.codangky,
        lydo: item.lydo || '',
        ngaydangky: item.ngaydangky || null
      }));

      const snapshot = {
        startedAt: currentProgram.created_at,
        endedAt: new Date().toISOString(),
        programId: currentProgram.id,
        content: currentProgram.content || '',
        registered: snapshotItems.filter((item) => item.codangky === true),
        notRegistered: snapshotItems.filter((item) => item.codangky === false),
        noResponse: snapshotItems.filter((item) => !item.hasResponded)
      };

      const classIds = Array.from(new Set(
        currentProgramAnnouncements.map((item) => item.malop).filter(Boolean)
      ));
      const closePayloads = (classIds.length > 0 ? classIds : [currentProgram.malop || 'ALL']).map((malop) => ({
        malop,
        manv: currentUser?.manv || currentUser?.username || '',
        title: 'NGOẠI KHÓA',
        content: buildNgoaiKhoaCloseContent(snapshot),
        approved: true
      }));

      const { error } = await supabase.from('class_announcements').insert(closePayloads);

      if (error) throw error;

      insertLog(`[NGOẠI KHÓA] Kết thúc chương trình: ${currentProgram.id}`);
      setEditingStudent(null);
      setDrafts({});
      await fetchData();
    } catch (error) {
      console.error('Error ending extracurricular program:', error);
      window.alert('Không thể kết thúc chương trình.');
    } finally {
      setEndingProgram(false);
    }
  };

  const stats = {
    total: filteredData.length,
    registered: filteredData.filter((item) => item.codangky === true).length,
    notRegistered: filteredData.filter((item) => item.codangky === false).length,
    noResponse: filteredData.filter((item) => !item.hasResponded).length
  };

  const getStatusMeta = (itemOrStatus) => {
    const status = typeof itemOrStatus === 'string'
      ? itemOrStatus
      : (!itemOrStatus.hasResponded ? 'no_response' : (itemOrStatus.codangky ? 'registered' : 'not_registered'));

    if (status === 'registered') {
      return { label: 'Đã đăng ký', background: '#dcfce7', color: '#166534', border: '#86efac' };
    }
    if (status === 'not_registered') {
      return { label: 'Không tham gia', background: '#fee2e2', color: '#991b1b', border: '#fca5a5' };
    }
    return { label: 'Chưa phản hồi', background: '#e5e7eb', color: '#374151', border: '#cbd5e1' };
  };

  const handleExport = () => {
    const exportData = filteredData.map((item) => ({
      'Mã HS': item.mahv,
      'Tên Học Sinh': item.tenhv,
      'Lớp': item.className,
      'Trạng thái': !item.hasResponded ? 'Chưa phản hồi' : (item.codangky ? 'Đã đăng ký' : 'Không tham gia'),
      'Ngày đăng ký': item.ngaydangky ? new Date(item.ngaydangky).toLocaleString('vi-VN') : '',
      'Lý do': item.lydo || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DangKyNgoaiKhoa');
    XLSX.writeFile(wb, `Danh_sach_ngoai_khoa_${Date.now()}.xlsx`);
  };

  return (
    <div className="ngoaikhoa-manager animate-fade-in" style={{ padding: '20px' }}>
      <div style={{ marginBottom: '15px', color: '#64748b', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Clock size={16} />
        <span>
          Đợt đang mở:
          <strong> {lastAnnouncementDate ? lastAnnouncementDate.toLocaleString('vi-VN') : 'Chưa có chương trình đang mở'}</strong>
        </span>
      </div>

      <div className="stats-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        <div className="stat-card" style={{ background: '#eff6ff', padding: '20px', borderRadius: '15px', border: '1px solid #dbeafe' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#1e40af' }}>
            <Filter size={20} />
            <span style={{ fontWeight: 600 }}>Tổng số HS (lọc)</span>
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
          {classes.map((item) => <option key={item.malop} value={item.malop}>{item.tenlop}</option>)}
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
        {canManageNgoaiKhoa && (
          <button
            onClick={handleEndProgram}
            disabled={!currentProgram || endingProgram}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '12px', border: 'none', background: '#ef4444', color: 'white', cursor: (!currentProgram || endingProgram) ? 'not-allowed' : 'pointer', opacity: (!currentProgram || endingProgram) ? 0.7 : 1 }}
          >
            <Clock size={18} />
            {endingProgram ? 'Đang kết thúc...' : 'Kết thúc chương trình'}
          </button>
        )}
        <button
          onClick={handleExport}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '12px', border: 'none', background: '#10b981', color: 'white', cursor: 'pointer' }}
        >
          <Download size={18} />
          Xuất Excel
        </button>
      </div>

      {!currentProgram && (
        <div style={{ marginBottom: '20px', padding: '16px 18px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '14px', color: '#9a3412', fontWeight: 600 }}>
          Hiện chưa có chương trình ngoại khóa đang mở. Khi đăng chương trình mới, danh sách đăng ký sẽ bắt đầu lại từ đầu.
        </div>
      )}

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
            ) : filteredData.map((item) => {
              const isEditing = editingStudent === item.mahv;
              const draft = getDraft(item);
              const statusMeta = getStatusMeta(isEditing ? draft.status : item);

              return (
                <tr key={item.mahv} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '15px' }}>{item.mahv}</td>
                  <td style={{ padding: '15px', fontWeight: 600 }}>{item.tenhv}</td>
                  <td style={{ padding: '15px' }}>{item.className}</td>
                  <td style={{ padding: '15px' }}>
                    {canManageNgoaiKhoa && isEditing ? (
                      <select
                        value={draft.status}
                        onChange={(e) => updateDraft(item.mahv, { status: e.target.value })}
                        style={{ padding: '8px 10px', borderRadius: '10px', border: `1px solid ${statusMeta.border}`, minWidth: '150px', background: statusMeta.background, color: statusMeta.color, fontWeight: 600 }}
                      >
                        <option value="no_response">Chưa phản hồi</option>
                        <option value="registered">Đã đăng ký</option>
                        <option value="not_registered">Không tham gia</option>
                      </select>
                    ) : (
                      <span style={{ padding: '4px 10px', borderRadius: '20px', background: statusMeta.background, color: statusMeta.color, border: `1px solid ${statusMeta.border}`, fontSize: '12px', fontWeight: 600 }}>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {archivedPrograms.length > 0 && (
        <div style={{ marginTop: '24px', display: 'grid', gap: '14px' }}>
          {archivedPrograms.map((program) => {
            const snapshot = program.snapshot || {};
            return (
              <div key={program.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>
                    Chương trình đã kết thúc
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                    {snapshot.endedAt ? new Date(snapshot.endedAt).toLocaleString('vi-VN') : new Date(program.created_at).toLocaleString('vi-VN')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.9rem', color: '#475569' }}>
                  <span>Đăng ký: <strong>{snapshot.registered?.length || 0}</strong></span>
                  <span>Không đăng ký: <strong>{snapshot.notRegistered?.length || 0}</strong></span>
                  <span>Không phản hồi: <strong>{snapshot.noResponse?.length || 0}</strong></span>
                </div>
                <div style={{ marginTop: '12px', display: 'grid', gap: '8px', fontSize: '0.88rem', color: '#475569' }}>
                  <div><strong>Danh sách đăng ký:</strong> {(snapshot.registered || []).map((item) => item.tenhv).join(', ') || '-'}</div>
                  <div><strong>Danh sách không đăng ký:</strong> {(snapshot.notRegistered || []).map((item) => item.tenhv).join(', ') || '-'}</div>
                  <div><strong>Danh sách không phản hồi:</strong> {(snapshot.noResponse || []).map((item) => item.tenhv).join(', ') || '-'}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
