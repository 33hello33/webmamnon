import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, insertLog } from '../supabase';
import {
  Check, Copy, PlusCircle, Edit3, Trash2, Download,
  RefreshCw, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight,
  Database, X, Info, Search
} from 'lucide-react';
import * as XLSX from 'xlsx';
import './SurchargeRegistration.css';

const formatCurrency = (val) => {
  const num = Number(val) || 0;
  return num.toLocaleString('vi-VN') + ' đ';
};

const formatNumberOnly = (val) => {
  const num = Number(val) || 0;
  return num.toLocaleString('vi-VN');
};

const SQL_CREATE_TABLES = `-- Chạy script này trong Supabase -> SQL Editor:
-- 1. Bảng danh mục phụ phí (nếu chưa có)
CREATE TABLE IF NOT EXISTS truongla.tbl_phuphi (
    id BIGSERIAL PRIMARY KEY,
    tenpp TEXT NOT NULL,
    dongia NUMERIC DEFAULT 0,
    ghichu TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Thêm một số khoản phụ phí mẫu nếu bảng trống
INSERT INTO truongla.tbl_phuphi (tenpp, dongia)
SELECT 'Phụ phí 1', 50000 WHERE NOT EXISTS (SELECT 1 FROM truongla.tbl_phuphi WHERE tenpp = 'Phụ phí 1')
UNION ALL
SELECT 'Phụ phí 2', 100000 WHERE NOT EXISTS (SELECT 1 FROM truongla.tbl_phuphi WHERE tenpp = 'Phụ phí 2')
UNION ALL
SELECT 'Học võ thuật', 100000 WHERE NOT EXISTS (SELECT 1 FROM truongla.tbl_phuphi WHERE tenpp = 'Học võ thuật')
UNION ALL
SELECT 'Học tiếng anh', 200000 WHERE NOT EXISTS (SELECT 1 FROM truongla.tbl_phuphi WHERE tenpp = 'Học tiếng anh')
UNION ALL
SELECT 'Nhảy - múa', 100000 WHERE NOT EXISTS (SELECT 1 FROM truongla.tbl_phuphi WHERE tenpp = 'Nhảy - múa')
UNION ALL
SELECT 'Lập trình robot', 100000 WHERE NOT EXISTS (SELECT 1 FROM truongla.tbl_phuphi WHERE tenpp = 'Lập trình robot')
UNION ALL
SELECT 'Đầu vào', 500000 WHERE NOT EXISTS (SELECT 1 FROM truongla.tbl_phuphi WHERE tenpp = 'Đầu vào')
UNION ALL
SELECT 'Đồng phục mùa hè', 150000 WHERE NOT EXISTS (SELECT 1 FROM truongla.tbl_phuphi WHERE tenpp = 'Đồng phục mùa hè')
UNION ALL
SELECT 'Đồng phục mùa đông', 250000 WHERE NOT EXISTS (SELECT 1 FROM truongla.tbl_phuphi WHERE tenpp = 'Đồng phục mùa đông');

-- 2. Bảng lưu vết đăng ký phụ phí học sinh theo tháng
CREATE TABLE IF NOT EXISTS truongla.tbl_dangky_phuphi (
    id BIGSERIAL PRIMARY KEY,
    mahv TEXT NOT NULL,
    malop TEXT NOT NULL,
    thang INTEGER NOT NULL,
    nam INTEGER NOT NULL,
    thang_nam TEXT NOT NULL,
    id_phuphi BIGINT NOT NULL,
    tenpp TEXT,
    dongia NUMERIC DEFAULT 0,
    ghichu TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_hv_thang_phuphi UNIQUE (mahv, thang, nam, id_phuphi)
);

CREATE INDEX IF NOT EXISTS idx_dk_phuphi_thang_lop ON truongla.tbl_dangky_phuphi (thang_nam, malop);
CREATE INDEX IF NOT EXISTS idx_dk_phuphi_mahv ON truongla.tbl_dangky_phuphi (mahv, thang_nam);
`;

export default function SurchargeRegistration({ currentUser, initialClassId }) {
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1); // 1 - 12
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(initialClassId || '');
  const [students, setStudents] = useState([]);
  const [phuphiList, setPhuphiList] = useState([]);
  const [registeredMap, setRegisteredMap] = useState({}); // Key: `${mahv}_${id_phuphi}` -> record

  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState(null); // Key being toggled
  const [searchTerm, setSearchTerm] = useState('');
  const [dbError, setDbError] = useState(null);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Manage Phu Phi Modal
  const [isPhuphiModalOpen, setIsPhuphiModalOpen] = useState(false);
  const [editingPhuphi, setEditingPhuphi] = useState(null);
  const [phuphiForm, setPhuphiForm] = useState({ tenpp: '', dongia: '' });

  // Copy to Next Month Modal
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [copying, setCopying] = useState(false);

  // Alert/Toast
  const [alertMsg, setAlertMsg] = useState(null);
  const showAlert = (type, text) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 4000);
  };

  const currentThangNam = useMemo(() => {
    return `${String(selectedMonth).padStart(2, '0')}/${selectedYear}`;
  }, [selectedMonth, selectedYear]);

  // Load Classes
  const fetchClasses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('tbl_lop')
        .select('malop, tenlop')
        .or('daxoa.neq."Đã Xóa",daxoa.is.null')
        .order('tenlop');

      if (error) throw error;
      setClasses(data || []);
      if (data && data.length > 0 && !selectedClassId) {
        setSelectedClassId(initialClassId || data[0].malop);
      }
    } catch (err) {
      console.error('Error fetching classes:', err);
    }
  }, [initialClassId, selectedClassId]);

  // Load Surcharges from tbl_phuphi
  const fetchPhuphi = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('tbl_phuphi')
        .select('*')
        .order('id', { ascending: true });

      if (error) {
        if (error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
          setDbError('Bảng tbl_phuphi hoặc tbl_dangky_phuphi chưa được tạo trong cơ sở dữ liệu Supabase.');
        }
        throw error;
      }
      setPhuphiList(data || []);
      setDbError(null);
    } catch (err) {
      console.warn('Cannot fetch tbl_phuphi:', err.message);
    }
  }, []);

  // Load Students in selected class
  const fetchStudents = useCallback(async () => {
    if (!selectedClassId) {
      setStudents([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('tbl_hv')
        .select('mahv, tenhv, malop, trangthai')
        .eq('malop', selectedClassId);

      if (error) throw error;
      const active = (data || [])
        .filter(s => (s.trangthai || '').trim().toLowerCase() !== 'đã nghỉ')
        .sort((a, b) => (a.tenhv || '').localeCompare(b.tenhv || '', 'vi'));
      setStudents(active);
    } catch (err) {
      console.error('Error fetching students:', err);
    }
  }, [selectedClassId]);

  // Load Registrations for (class, month, year)
  const fetchRegistrations = useCallback(async () => {
    if (!selectedClassId) {
      setRegisteredMap({});
      return;
    }
    try {
      const { data, error } = await supabase
        .from('tbl_dangky_phuphi')
        .select('*')
        .eq('malop', selectedClassId)
        .eq('thang_nam', currentThangNam);

      if (error) {
        if (error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
          setDbError('Bảng tbl_dangky_phuphi chưa được tạo trong Supabase.');
        }
        throw error;
      }

      const map = {};
      (data || []).forEach(item => {
        const key = `${item.mahv}_${item.id_phuphi}`;
        map[key] = item;
      });
      setRegisteredMap(map);
      setDbError(null);
    } catch (err) {
      console.warn('Cannot fetch registrations:', err.message);
    }
  }, [selectedClassId, currentThangNam]);

  // Initial load
  useEffect(() => {
    fetchClasses();
    fetchPhuphi();
  }, [fetchClasses, fetchPhuphi]);

  // When class or month changes, reload students & registrations
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStudents(), fetchRegistrations()]).finally(() => {
      setLoading(false);
    });
  }, [fetchStudents, fetchRegistrations]);

  // Toggle Checkbox for student and surcharge
  const handleToggleRegistration = async (student, phuphi) => {
    const key = `${student.mahv}_${phuphi.id}`;
    const isCurrentlyChecked = Boolean(registeredMap[key]);
    setSavingKey(key);

    try {
      if (isCurrentlyChecked) {
        // Uncheck -> Remove registration
        const { error } = await supabase
          .from('tbl_dangky_phuphi')
          .delete()
          .eq('mahv', student.mahv)
          .eq('thang', selectedMonth)
          .eq('nam', selectedYear)
          .eq('id_phuphi', phuphi.id);

        if (error) throw error;

        setRegisteredMap(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } else {
        // Check -> Insert registration
        const newRecord = {
          mahv: student.mahv,
          malop: selectedClassId,
          thang: selectedMonth,
          nam: selectedYear,
          thang_nam: currentThangNam,
          id_phuphi: phuphi.id,
          tenpp: phuphi.tenpp || phuphi.ten || '',
          dongia: Number(phuphi.dongia) || 0
        };

        const { data, error } = await supabase
          .from('tbl_dangky_phuphi')
          .upsert([newRecord], { onConflict: 'mahv,thang,nam,id_phuphi' })
          .select();

        if (error) throw error;

        setRegisteredMap(prev => ({
          ...prev,
          [key]: (data && data[0]) || newRecord
        }));
      }
    } catch (err) {
      console.error('Error updating registration:', err);
      showAlert('error', 'Lỗi lưu đăng ký phụ phí: ' + (err.message || ''));
      if (err.message?.includes('schema cache') || err.message?.includes('does not exist')) {
        setShowSqlModal(true);
      }
    } finally {
      setSavingKey(null);
    }
  };

  // Next Month Calculation
  const nextMonthInfo = useMemo(() => {
    if (selectedMonth === 12) {
      return { month: 1, year: selectedYear + 1, label: `01/${selectedYear + 1}` };
    }
    return {
      month: selectedMonth + 1,
      year: selectedYear,
      label: `${String(selectedMonth + 1).padStart(2, '0')}/${selectedYear}`
    };
  }, [selectedMonth, selectedYear]);

  // Copy to Next Month
  const handleCopyNextMonth = async () => {
    const recordsToCopy = Object.values(registeredMap);
    if (recordsToCopy.length === 0) {
      showAlert('error', 'Tháng hiện tại chưa có phụ phí nào được đăng ký để sao chép!');
      return;
    }

    setCopying(true);
    try {
      const nextRecords = recordsToCopy.map(r => ({
        mahv: r.mahv,
        malop: r.malop || selectedClassId,
        thang: nextMonthInfo.month,
        nam: nextMonthInfo.year,
        thang_nam: nextMonthInfo.label,
        id_phuphi: r.id_phuphi,
        tenpp: r.tenpp,
        dongia: r.dongia
      }));

      const { error } = await supabase
        .from('tbl_dangky_phuphi')
        .upsert(nextRecords, { onConflict: 'mahv,thang,nam,id_phuphi' });

      if (error) throw error;

      showAlert('success', `Đã sao chép thành công ${nextRecords.length} lượt đăng ký sang Tháng ${nextMonthInfo.label}!`);
      setIsCopyModalOpen(false);

      // Log activity
      insertLog(currentUser?.manv, `Sao chép đăng ký phụ phí lớp ${selectedClass?.tenlop || selectedClassId} từ tháng ${currentThangNam} sang tháng ${nextMonthInfo.label}`);
    } catch (err) {
      console.error('Error copying to next month:', err);
      showAlert('error', 'Lỗi sao chép qua tháng tiếp theo: ' + err.message);
    } finally {
      setCopying(false);
    }
  };

  // Save Surcharge in Modal (Add / Edit)
  const handleSavePhuphi = async (e) => {
    e.preventDefault();
    if (!phuphiForm.tenpp.trim()) {
      showAlert('error', 'Vui lòng nhập tên khoản phụ phí');
      return;
    }

    const payload = {
      tenpp: phuphiForm.tenpp.trim(),
      dongia: Number(String(phuphiForm.dongia).replace(/\D/g, '')) || 0
    };

    try {
      if (editingPhuphi) {
        const { error } = await supabase
          .from('tbl_phuphi')
          .update(payload)
          .eq('id', editingPhuphi.id);
        if (error) throw error;
        showAlert('success', 'Đã cập nhật khoản phụ phí!');
      } else {
        const { error } = await supabase
          .from('tbl_phuphi')
          .insert([payload]);
        if (error) throw error;
        showAlert('success', 'Đã thêm khoản phụ phí mới!');
      }

      setPhuphiForm({ tenpp: '', dongia: '' });
      setEditingPhuphi(null);
      await fetchPhuphi();
    } catch (err) {
      console.error('Error saving phuphi:', err);
      showAlert('error', 'Lỗi lưu phụ phí: ' + err.message);
      if (err.message?.includes('schema cache') || err.message?.includes('does not exist')) {
        setShowSqlModal(true);
      }
    }
  };

  const handleDeletePhuphi = async (id, ten) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa phụ phí "${ten}"?`)) return;
    try {
      const { error } = await supabase
        .from('tbl_phuphi')
        .delete()
        .eq('id', id);
      if (error) throw error;
      showAlert('success', `Đã xóa khoản phụ phí "${ten}"`);
      await fetchPhuphi();
    } catch (err) {
      console.error('Error deleting phuphi:', err);
      showAlert('error', 'Lỗi xóa phụ phí: ' + err.message);
    }
  };

  // Month navigation
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(y => y - 1);
    } else {
      setSelectedMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(y => y + 1);
    } else {
      setSelectedMonth(m => m + 1);
    }
  };

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return students.filter(st => {
      const matchSearch = String(st.tenhv || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(st.mahv || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchSearch;
    });
  }, [students, searchTerm]);

  // Calculate Student Total
  const getStudentTotal = useCallback((mahv) => {
    let total = 0;
    phuphiList.forEach(pp => {
      const key = `${mahv}_${pp.id}`;
      if (registeredMap[key]) {
        total += Number(pp.dongia) || 0;
      }
    });
    return total;
  }, [phuphiList, registeredMap]);

  // Column Summaries
  const columnSummaries = useMemo(() => {
    const summary = {};
    let grandTotal = 0;

    phuphiList.forEach(pp => {
      let count = 0;
      students.forEach(st => {
        const key = `${st.mahv}_${pp.id}`;
        if (registeredMap[key]) {
          count++;
        }
      });
      const amount = count * (Number(pp.dongia) || 0);
      summary[pp.id] = { count, amount };
      grandTotal += amount;
    });

    return { summary, grandTotal };
  }, [phuphiList, students, registeredMap]);

  const selectedClass = useMemo(() => {
    return classes.find(c => c.malop === selectedClassId) || null;
  }, [classes, selectedClassId]);

  // Export to Excel
  const handleExportExcel = () => {
    if (!students.length) {
      showAlert('error', 'Không có học sinh nào để xuất dữ liệu');
      return;
    }

    const headers = ['STT', 'HỌ VÀ TÊN', ...phuphiList.map(pp => `${pp.tenpp} (${formatCurrency(pp.dongia)})`), 'TỔNG CỘNG'];
    const rows = filteredStudents.map((st, idx) => {
      const studentTotal = getStudentTotal(st.mahv);
      const row = [idx + 1, st.tenhv];
      phuphiList.forEach(pp => {
        const isChecked = Boolean(registeredMap[`${st.mahv}_${pp.id}`]);
        row.push(isChecked ? 'X' : '');
      });
      row.push(studentTotal);
      return row;
    });

    // Summary row
    const summaryRow = ['TỔNG', `${filteredStudents.length} học viên`];
    phuphiList.forEach(pp => {
      const col = columnSummaries.summary[pp.id];
      summaryRow.push(col ? `${col.count} đăng ký (${formatNumberOnly(col.amount)}đ)` : 0);
    });
    summaryRow.push(columnSummaries.grandTotal);
    rows.push(summaryRow);

    const ws = XLSX.utils.aoa_to_sheet([
      [`DANH SÁCH PHỤ PHÍ THÁNG ${selectedMonth}/${selectedYear} - ${selectedClass?.tenlop || selectedClassId}`],
      [],
      headers,
      ...rows
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PhuPhi');
    XLSX.writeFile(wb, `Danh_Sach_Phu_Phi_Thang_${selectedMonth}_${selectedYear}_${selectedClass?.tenlop || selectedClassId}.xlsx`);
  };

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(SQL_CREATE_TABLES);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  return (
    <div className="surcharge-reg-container animate-fade-in">
      {/* Alert toast */}
      {alertMsg && (
        <div className={`message-alert ${alertMsg.type}`} style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 18px',
          borderRadius: '8px', fontWeight: 600,
          background: alertMsg.type === 'error' ? '#fee2e2' : '#dcfce7',
          color: alertMsg.type === 'error' ? '#991b1b' : '#166534',
          border: alertMsg.type === 'error' ? '1px solid #fecaca' : '1px solid #bbf7d0'
        }}>
          {alertMsg.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span>{alertMsg.text}</span>
        </div>
      )}

      {/* SQL Setup Notice if table missing */}
      {dbError && (
        <div className="sql-guide-banner">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
              <AlertCircle size={20} color="#dc2626" />
              <span>Chưa tìm thấy bảng đăng ký phụ phí trong Supabase!</span>
            </div>
            <button className="btn btn-primary" onClick={() => setShowSqlModal(true)} style={{ fontSize: '0.85rem' }}>
              <Database size={16} /> Xem & Sao chép mã SQL tạo bảng
            </button>
          </div>
          <div style={{ fontSize: '0.88rem', color: '#1e3a8a' }}>
            Để lưu trữ và sao chép phụ phí theo từng tháng, bạn cần khởi tạo 2 bảng <code>tbl_phuphi</code> và <code>tbl_dangky_phuphi</code> trong Supabase.
          </div>
        </div>
      )}

      {/* Top Toolbar */}
      <div className="surcharge-toolbar">
        <div className="surcharge-toolbar-left">
          {/* Active Class Highlight Badge (matches yellow tag in user image) */}
          <div className="class-badge-btn" title="Lớp đang xem phụ phí">
            <span>{selectedClass ? selectedClass.tenlop : 'CHỌN LỚP'}</span>
          </div>

          {/* Class Dropdown Selector */}
          <select
            className="class-select-dropdown"
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
          >
            {classes.map(c => (
              <option key={c.malop} value={c.malop}>{c.tenlop}</option>
            ))}
          </select>

          {/* Month Navigator */}
          <div className="month-nav-group">
            <button className="month-nav-btn" onClick={handlePrevMonth} title="Tháng trước">
              <ChevronLeft size={16} />
            </button>
            <span className="month-nav-label">
              Tháng {selectedMonth}/{selectedYear}
            </span>
            <button className="month-nav-btn" onClick={handleNextMonth} title="Tháng sau">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Search box for students */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Tìm học viên..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '6px 12px 6px 32px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.85rem',
                width: '160px'
              }}
            />
          </div>
        </div>

        <div className="surcharge-toolbar-right">
          {/* Cyan Copy to Next Month Button (matches image) */}
          <button
            className="btn-copy-next"
            onClick={() => setIsCopyModalOpen(true)}
            disabled={!students.length || !phuphiList.length}
            title={`Sao chép toàn bộ phụ phí tháng ${selectedMonth} sang tháng ${nextMonthInfo.month}`}
          >
            <Copy size={16} />
            <span>SAO CHÉP QUA THÁNG TIẾP THEO</span>
          </button>

          {/* Green Surcharge Management Button (matches image) */}
          <button
            className="btn-manage-phuphi"
            onClick={() => {
              setEditingPhuphi(null);
              setPhuphiForm({ tenpp: '', dongia: '' });
              setIsPhuphiModalOpen(true);
            }}
          >
            <PlusCircle size={16} />
            <span>Sửa / Thêm phụ phí</span>
          </button>

          {/* Excel Export */}
          <button className="btn-export-excel" onClick={handleExportExcel} title="Xuất ra Excel">
            <Download size={16} />
            <span>Xuất Excel</span>
          </button>

          {/* SQL Setup Button */}
          <button
            className="btn btn-outline"
            onClick={() => setShowSqlModal(true)}
            style={{ padding: '8px 12px', fontSize: '0.85rem' }}
            title="Xem hướng dẫn cấu hình bảng SQL"
          >
            <Database size={15} />
            <span>Mã SQL</span>
          </button>
        </div>
      </div>

      {/* Class Quick Selection Pills */}
      <div className="class-tabs-bar">
        {classes.map(c => {
          const isActive = c.malop === selectedClassId;
          return (
            <button
              key={c.malop}
              className={`class-tab-chip ${isActive ? 'active' : ''}`}
              onClick={() => setSelectedClassId(c.malop)}
            >
              {c.tenlop}
            </button>
          );
        })}
      </div>

      {/* Main Spreadsheet Grid */}
      <div className="spreadsheet-card">
        {/* Pink Banner Header Title (matches user image) */}
        <div className="sheet-title-banner">
          DANH SÁCH PHỤ PHÍ THÁNG {selectedMonth}
        </div>

        {/* Scrollable table container */}
        <div className="sheet-table-wrapper">
          {loading ? (
            <div className="sheet-loading-state">
              <RefreshCw size={24} className="spin" />
              <span>Đang tải dữ liệu học viên và phụ phí...</span>
            </div>
          ) : !selectedClassId ? (
            <div className="sheet-empty-state">
              <span>Vui lòng chọn một lớp học để xem danh sách phụ phí.</span>
            </div>
          ) : phuphiList.length === 0 ? (
            <div className="sheet-empty-state">
              <Info size={32} color="#0284c7" />
              <span>Chưa có khoản phụ phí nào trong danh mục.</span>
              <button
                className="btn btn-success"
                onClick={() => setIsPhuphiModalOpen(true)}
                style={{ marginTop: '10px' }}
              >
                <PlusCircle size={16} /> Thêm khoản phụ phí ngay
              </button>
            </div>
          ) : students.length === 0 ? (
            <div className="sheet-empty-state">
              <span>Lớp học này hiện chưa có học viên nào đang theo học.</span>
            </div>
          ) : (
            <table className="excel-table">
              <thead>
                {/* Row 1: Titles */}
                <tr>
                  <th className="col-stt" rowSpan={2}>STT</th>
                  <th className="col-name" rowSpan={2}>HỌ VÀ TÊN</th>
                  {phuphiList.map(pp => (
                    <th key={pp.id} className="col-phuphi">
                      <div style={{ fontWeight: 800 }}>{pp.tenpp || pp.ten}</div>
                    </th>
                  ))}
                  <th className="col-total" rowSpan={2}>TỔNG CỘNG</th>
                </tr>

                {/* Row 2: Sub-row with Unit Prices */}
                <tr className="sub-header">
                  {phuphiList.map(pp => (
                    <th key={`price_${pp.id}`} className="col-phuphi">
                      <span className="price-label">{formatCurrency(pp.dongia)}</span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredStudents.map((st, idx) => {
                  const studentTotal = getStudentTotal(st.mahv);

                  return (
                    <tr key={st.mahv}>
                      {/* STT */}
                      <td className="col-stt">{idx + 1}</td>

                      {/* Họ và tên */}
                      <td className="col-name" title={`Mã HV: ${st.mahv}`}>
                        {st.tenhv}
                      </td>

                      {/* Surcharge Checkbox Columns */}
                      {phuphiList.map(pp => {
                        const key = `${st.mahv}_${pp.id}`;
                        const isChecked = Boolean(registeredMap[key]);
                        const isSaving = savingKey === key;

                        return (
                          <td
                            key={pp.id}
                            className={`checkbox-cell ${isChecked ? 'is-checked' : ''}`}
                            onClick={() => handleToggleRegistration(st, pp)}
                            title={`${st.tenhv} - ${pp.tenpp}: ${isChecked ? 'Đã đăng ký (Bấm để hủy)' : 'Chưa đăng ký (Bấm để chọn)'}`}
                          >
                            <div className={`excel-checkbox ${isChecked ? 'checked' : ''}`}>
                              {isSaving ? (
                                <RefreshCw size={12} className="spin" />
                              ) : isChecked ? (
                                <Check size={16} strokeWidth={3} />
                              ) : null}
                            </div>
                          </td>
                        );
                      })}

                      {/* Student Total Column */}
                      <td className="col-total">
                        {formatCurrency(studentTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Summary Footer */}
              <tfoot>
                <tr>
                  <td className="col-stt">Σ</td>
                  <td className="col-name">
                    Tổng cộng ({filteredStudents.length} học viên)
                  </td>
                  {phuphiList.map(pp => {
                    const col = columnSummaries.summary[pp.id];
                    return (
                      <td key={`sum_${pp.id}`} style={{ fontSize: '0.82rem', padding: '8px 4px' }}>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>{col?.count || 0} lượt</div>
                        <div style={{ color: '#059669', fontSize: '0.78rem' }}>{formatNumberOnly(col?.amount || 0)}đ</div>
                      </td>
                    );
                  })}
                  <td className="col-total">
                    {formatCurrency(columnSummaries.grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* Copy to Next Month Modal */}
      {isCopyModalOpen && (
        <div className="phuphi-modal-overlay">
          <div className="phuphi-modal" style={{ maxWidth: '480px' }}>
            <div className="phuphi-modal-header">
              <h3>
                <Copy size={20} color="#06b6d4" />
                Sao Chép Phụ Phí Qua Tháng Sau
              </h3>
              <button className="close-btn" onClick={() => setIsCopyModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="phuphi-modal-body">
              <div style={{ background: '#ecfeff', border: '1px solid #a5f3fc', padding: '14px', borderRadius: '10px', color: '#0e7490', fontSize: '0.9rem', lineHeight: 1.6 }}>
                Hệ thống sẽ sao chép toàn bộ danh sách đăng ký phụ phí của lớp <b>{selectedClass?.tenlop}</b>:
                <div style={{ margin: '8px 0', fontSize: '1.05rem', fontWeight: 800, color: '#0891b2' }}>
                  Tháng {currentThangNam} ➔ Tháng {nextMonthInfo.label}
                </div>
                Số lượt đăng ký sẽ sao chép: <b>{Object.keys(registeredMap).length} lượt</b>
              </div>

              <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                * Các đăng ký đã tồn tại ở tháng tiếp theo sẽ được cập nhật lại theo đơn giá mới nhất.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setIsCopyModalOpen(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ background: '#06b6d4', borderColor: '#0891b2' }}
                  onClick={handleCopyNextMonth}
                  disabled={copying}
                >
                  {copying ? 'Đang sao chép...' : 'Xác nhận sao chép'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manage / Add Surcharge Modal */}
      {isPhuphiModalOpen && (
        <div className="phuphi-modal-overlay">
          <div className="phuphi-modal">
            <div className="phuphi-modal-header">
              <h3>
                <PlusCircle size={20} color="#16a34a" />
                Quản Lý Danh Mục Phụ Phí (tbl_phuphi)
              </h3>
              <button className="close-btn" onClick={() => setIsPhuphiModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="phuphi-modal-body">
              {/* Form Add / Edit */}
              <form onSubmit={handleSavePhuphi} style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>
                  {editingPhuphi ? 'Sửa thông tin phụ phí' : 'Thêm khoản phụ phí mới'}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                      Tên khoản phụ phí *
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Học bơi, Nhạc kịch..."
                      value={phuphiForm.tenpp}
                      onChange={(e) => setPhuphiForm(prev => ({ ...prev, tenpp: e.target.value }))}
                      required
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                      Đơn giá (VNĐ) *
                    </label>
                    <input
                      type="text"
                      placeholder="VD: 100000"
                      value={phuphiForm.dongia}
                      onChange={(e) => setPhuphiForm(prev => ({ ...prev, dongia: e.target.value }))}
                      required
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                  {editingPhuphi && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        setEditingPhuphi(null);
                        setPhuphiForm({ tenpp: '', dongia: '' });
                      }}
                      style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                    >
                      Hủy sửa
                    </button>
                  )}
                  <button
                    type="submit"
                    className="btn btn-success"
                    style={{ padding: '6px 16px', fontSize: '0.85rem' }}
                  >
                    {editingPhuphi ? 'Lưu thay đổi' : 'Thêm khoản này'}
                  </button>
                </div>
              </form>

              {/* List of existing surcharges */}
              <div>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>
                  Danh sách phụ phí hiện có ({phuphiList.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
                  {phuphiList.map(pp => (
                    <div key={pp.id} className="phuphi-item-row">
                      <div className="phuphi-item-info">
                        <span className="phuphi-item-name">{pp.tenpp || pp.ten}</span>
                        <span className="phuphi-item-price">{formatCurrency(pp.dongia)}</span>
                      </div>
                      <div className="phuphi-item-actions">
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => {
                            setEditingPhuphi(pp);
                            setPhuphiForm({
                              tenpp: pp.tenpp || pp.ten || '',
                              dongia: String(pp.dongia || '')
                            });
                          }}
                          style={{ padding: '4px 8px' }}
                          title="Sửa"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => handleDeletePhuphi(pp.id, pp.tenpp || pp.ten)}
                          style={{ padding: '4px 8px' }}
                          title="Xóa"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setIsPhuphiModalOpen(false)}
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SQL Script Guide Modal */}
      {showSqlModal && (
        <div className="phuphi-modal-overlay">
          <div className="phuphi-modal" style={{ maxWidth: '650px' }}>
            <div className="phuphi-modal-header">
              <h3>
                <Database size={20} color="#6366f1" />
                Hướng Dẫn Tạo Bảng Supabase
              </h3>
              <button className="close-btn" onClick={() => setShowSqlModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="phuphi-modal-body">
              <div style={{ fontSize: '0.9rem', color: '#334155', lineHeight: 1.6 }}>
                Để có thể truy xuất lại các tháng trước học viên đã đăng ký phụ phí nào và hỗ trợ tính năng <b>sao chép qua tháng sau</b>, bạn chỉ cần thực hiện 2 bước đơn giản:
                <ol style={{ paddingLeft: '20px', marginTop: '8px' }}>
                  <li>Mở bảng điều khiển <b>Supabase ➔ SQL Editor</b></li>
                  <li>Dán đoạn mã bên dưới và bấm nút <b>RUN</b>:</li>
                </ol>
              </div>

              <pre style={{
                background: '#0f172a', color: '#38bdf8', padding: '14px',
                borderRadius: '8px', fontSize: '0.8rem', maxHeight: '220px',
                overflowY: 'auto', lineHeight: 1.5
              }}>
                {SQL_CREATE_TABLES}
              </pre>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={copySqlToClipboard}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Copy size={16} />
                  <span>{copiedSql ? '✓ Đã sao chép vào bộ nhớ tạm!' : 'Sao chép toàn bộ mã SQL'}</span>
                </button>

                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowSqlModal(false)}
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
