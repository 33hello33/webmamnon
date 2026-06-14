import React, { useState, useEffect, useCallback } from 'react';
import { supabase, insertLog } from '../supabase';
import {
  CalendarX,
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Copy,
  CalendarDays,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import './HolidayManager.css';

// Danh sách ngày nghỉ lễ Việt Nam mặc định
const VIETNAM_DEFAULT_HOLIDAYS = [
  { ten_ngaynghi: 'Tết Dương lịch', ngay: '01-01', hang_nam: true, mo_ta: 'Ngày 1 tháng 1 hàng năm' },
  { ten_ngaynghi: 'Giỗ Tổ Hùng Vương', ngay: '03-10', hang_nam: true, mo_ta: 'Ngày 10 tháng 3 âm lịch' },
  { ten_ngaynghi: 'Ngày Giải phóng miền Nam', ngay: '04-30', hang_nam: true, mo_ta: 'Ngày 30 tháng 4 hàng năm' },
  { ten_ngaynghi: 'Ngày Quốc tế Lao động', ngay: '05-01', hang_nam: true, mo_ta: 'Ngày 1 tháng 5 hàng năm' },
  { ten_ngaynghi: 'Ngày Quốc khánh', ngay: '09-02', hang_nam: true, mo_ta: 'Ngày 2 tháng 9 hàng năm' },
];

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i);

const getDayOfWeek = (dateStr) => {
  if (!dateStr) return '';
  try {
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return days[new Date(dateStr + 'T00:00:00').getDay()];
  } catch { return ''; }
};

const isWeekend = (dateStr) => {
  if (!dateStr) return false;
  try {
    const d = new Date(dateStr + 'T00:00:00').getDay();
    return d === 0 || d === 6;
  } catch { return false; }
};

const HolidayManager = () => {
  const [expanded, setExpanded] = useState(false);       // ← Thu gọn mặc định
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());

  const [form, setForm] = useState({
    ten_ngaynghi: '',
    ngay_bat_dau: '',
    ngay_ket_thuc: '',
    hang_nam: false,
    mo_ta: '',
    nam: new Date().getFullYear()
  });

  const showMsg = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg({ type: '', text: '' }), 4000);
  };

  const loadHolidays = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tbl_ngaynghi')
        .select('*')
        .or(`hang_nam.eq.true,nam.eq.${selectedYear}`)
        .order('ngay_bat_dau', { ascending: true });
      if (error) throw error;
      setHolidays(data || []);
    } catch (err) {
      showMsg('error', 'Lỗi tải: ' + err.message);
    }
    setLoading(false);
  }, [selectedYear]);

  // Chỉ load khi expand lần đầu hoặc đổi năm khi đã expand
  useEffect(() => {
    if (expanded) loadHolidays();
  }, [expanded, loadHolidays]);

  const resetForm = () => {
    setForm({ ten_ngaynghi: '', ngay_bat_dau: '', ngay_ket_thuc: '', hang_nam: false, mo_ta: '', nam: selectedYear });
    setEditingId(null);
    setShowAddForm(false);
  };

  const handleEdit = (h) => {
    setForm({
      ten_ngaynghi: h.ten_ngaynghi || '',
      ngay_bat_dau: h.ngay_bat_dau || '',
      ngay_ket_thuc: h.ngay_ket_thuc || h.ngay_bat_dau || '',
      hang_nam: h.hang_nam || false,
      mo_ta: h.mo_ta || '',
      nam: h.nam || selectedYear
    });
    setEditingId(h.id);
    setShowAddForm(true);
  };

  const handleSave = async () => {
    if (!form.ten_ngaynghi.trim()) return showMsg('error', 'Vui lòng nhập tên ngày nghỉ');
    if (!form.ngay_bat_dau) return showMsg('error', 'Vui lòng chọn ngày bắt đầu');
    setSaving(true);
    try {
      const payload = {
        ten_ngaynghi: form.ten_ngaynghi.trim(),
        ngay_bat_dau: form.ngay_bat_dau,
        ngay_ket_thuc: form.ngay_ket_thuc || form.ngay_bat_dau,
        hang_nam: form.hang_nam,
        mo_ta: form.mo_ta.trim(),
        nam: form.hang_nam ? null : parseInt(form.nam) || selectedYear
      };
      let error;
      if (editingId) {
        ({ error } = await supabase.from('tbl_ngaynghi').update(payload).eq('id', editingId));
        if (!error) insertLog(`[NGÀY NGHỈ] Cập nhật: ${payload.ten_ngaynghi}`);
      } else {
        ({ error } = await supabase.from('tbl_ngaynghi').insert([payload]));
        if (!error) insertLog(`[NGÀY NGHỈ] Thêm: ${payload.ten_ngaynghi}`);
      }
      if (error) throw error;
      showMsg('success', editingId ? 'Đã cập nhật!' : 'Đã thêm ngày nghỉ!');
      resetForm();
      loadHolidays();
    } catch (err) {
      showMsg('error', 'Lỗi lưu: ' + err.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id, name) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
      return;
    }
    try {
      const { error } = await supabase.from('tbl_ngaynghi').delete().eq('id', id);
      if (error) throw error;
      insertLog(`[NGÀY NGHỈ] Xóa: ${name}`);
      showMsg('success', `Đã xóa "${name}"`);
      setDeleteConfirm(null);
      loadHolidays();
    } catch (err) {
      showMsg('error', 'Lỗi xóa: ' + err.message);
    }
  };

  // ── Fix trùng ngày: query trước, chỉ insert những ngày chưa có ────────────
  const handleImportDefaults = async () => {
    setSaving(true);
    try {
      const candidates = VIETNAM_DEFAULT_HOLIDAYS.map(h => {
        const [month, day] = h.ngay.split('-');
        return {
          ten_ngaynghi: h.ten_ngaynghi,
          ngay_bat_dau: `${selectedYear}-${month}-${day}`,
          ngay_ket_thuc: `${selectedYear}-${month}-${day}`,
          hang_nam: h.hang_nam,
          mo_ta: h.mo_ta,
          nam: h.hang_nam ? null : selectedYear
        };
      });

      // Lấy các ngày đã tồn tại trong DB
      const { data: existing } = await supabase
        .from('tbl_ngaynghi')
        .select('ngay_bat_dau, ten_ngaynghi')
        .or(`hang_nam.eq.true,nam.eq.${selectedYear}`);

      const existingDates = (existing || []).map(e => e.ngay_bat_dau);

      // Chỉ insert những ngày CHƯA có
      const toInsert = candidates.filter(c => !existingDates.includes(c.ngay_bat_dau));

      if (toInsert.length === 0) {
        showMsg('error', 'Tất cả ngày lễ VN đã tồn tại, không có gì để thêm!');
        setSaving(false);
        return;
      }

      const { error } = await supabase.from('tbl_ngaynghi').insert(toInsert);
      if (error) throw error;

      const skipped = candidates.length - toInsert.length;
      insertLog(`[NGÀY NGHỈ] Nhập ${toInsert.length} ngày lễ VN (bỏ qua ${skipped} ngày trùng)`);
      showMsg('success',
        skipped > 0
          ? `Đã thêm ${toInsert.length} ngày (bỏ qua ${skipped} ngày đã tồn tại)`
          : `Đã nhập ${toInsert.length} ngày nghỉ lễ Việt Nam!`
      );
      loadHolidays();
    } catch (err) {
      showMsg('error', 'Lỗi nhập mặc định: ' + err.message);
    }
    setSaving(false);
  };

  // Group by month
  const groupedHolidays = holidays.reduce((acc, h) => {
    const month = h.ngay_bat_dau ? new Date(h.ngay_bat_dau + 'T00:00:00').getMonth() + 1 : 0;
    if (!acc[month]) acc[month] = [];
    acc[month].push(h);
    return acc;
  }, {});

  const monthNames = ['Th.1','Th.2','Th.3','Th.4','Th.5','Th.6','Th.7','Th.8','Th.9','Th.10','Th.11','Th.12'];

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const handleCalendarDayClick = (day) => {
    const dateStr = `${selectedYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const existing = holidays.find(h => {
      // Check if dateStr falls within h.ngay_bat_dau and h.ngay_ket_thuc
      const d = new Date(dateStr + 'T00:00:00');
      const start = new Date((h.ngay_bat_dau || '') + 'T00:00:00');
      const end = new Date((h.ngay_ket_thuc || h.ngay_bat_dau || '') + 'T00:00:00');
      if (h.hang_nam) {
        start.setFullYear(selectedYear);
        end.setFullYear(selectedYear);
      }
      return d >= start && d <= end;
    });

    if (existing) {
      handleEdit(existing);
    } else {
      setForm({
        ten_ngaynghi: '',
        ngay_bat_dau: dateStr,
        ngay_ket_thuc: dateStr,
        hang_nam: false,
        mo_ta: '',
        nam: selectedYear
      });
      setEditingId(null);
      setShowAddForm(true);
    }
  };

  const renderMiniCalendar = () => {
    const daysInMonth = getDaysInMonth(selectedYear, calendarMonth);
    const firstDay = getFirstDayOfMonth(selectedYear, calendarMonth);
    const startOffset = firstDay === 0 ? 6 : firstDay - 1; // 0=Mon, 6=Sun
    
    // Create mapping of dates to holidays for quick lookup
    const holidayMap = {};
    holidays.forEach(h => {
      const start = new Date((h.ngay_bat_dau || '') + 'T00:00:00');
      const end = new Date((h.ngay_ket_thuc || h.ngay_bat_dau || '') + 'T00:00:00');
      if (h.hang_nam) {
        start.setFullYear(selectedYear);
        end.setFullYear(selectedYear);
      }
      const cur = new Date(start);
      while (cur <= end) {
        const s = cur.toISOString().split('T')[0];
        holidayMap[s] = h;
        cur.setDate(cur.getDate() + 1);
      }
    });

    const days = [];
    for (let i = 0; i < startOffset; i++) {
      days.push(<div key={`empty-${i}`} className="hm-cal-day empty"></div>);
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${selectedYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const isHol = !!holidayMap[dateStr];
      const isWknd = isWeekend(dateStr);
      
      let classes = "hm-cal-day";
      if (isHol) classes += " is-holiday";
      else if (isWknd) classes += " is-weekend";
      
      const isSelected = form.ngay_bat_dau && !editingId && dateStr >= form.ngay_bat_dau && dateStr <= (form.ngay_ket_thuc || form.ngay_bat_dau);
      if (isSelected) classes += " is-selected";

      days.push(
        <div key={`day-${i}`} className={classes} onClick={() => handleCalendarDayClick(i)} title={isHol ? holidayMap[dateStr].ten_ngaynghi : 'Nhấp để thêm ngày nghỉ'}>
          {i}
        </div>
      );
    }

    return (
      <div className="hm-mini-calendar">
        <div className="hm-cal-header">
          <button type="button" onClick={() => setCalendarMonth(prev => prev === 0 ? 11 : prev - 1)}><ChevronLeft size={16}/></button>
          <span>Tháng {calendarMonth + 1}</span>
          <button type="button" onClick={() => setCalendarMonth(prev => prev === 11 ? 0 : prev + 1)}><ChevronRight size={16}/></button>
        </div>
        <div className="hm-cal-weekdays">
          <div>T2</div><div>T3</div><div>T4</div><div>T5</div><div>T6</div><div className="w">T7</div><div className="w">CN</div>
        </div>
        <div className="hm-cal-grid">
          {days}
        </div>
        <div className="hm-cal-footer">
          <span className="dot hol"></span> Lễ
          <span className="dot wknd"></span> Cuối tuần
        </div>
      </div>
    );
  };

  return (
    <div className="holiday-manager">

      {/* ── Collapsed Header (luôn hiện) ── */}
      <div className="hm-collapsed-bar" onClick={() => setExpanded(v => !v)}>
        <div className="hm-collapsed-left">
          <CalendarX size={16} className="hm-collapsed-icon" />
          <span>Ngày Nghỉ Lễ</span>
          {holidays.length > 0 && expanded && (
            <span className="hm-badge">{holidays.length}</span>
          )}
        </div>
        <div className="hm-collapsed-right">
          {!expanded && holidays.length > 0 && (
            <span className="hm-badge">{holidays.length} ngày nghỉ</span>
          )}
          {expanded
            ? <ChevronUp size={16} />
            : <ChevronDown size={16} />
          }
        </div>
      </div>

      {/* ── Nội dung mở rộng ── */}
      {expanded && (
        <div className="hm-body hm-split-layout">
          <div className="hm-left-pane">
            {/* Toolbar */}
            <div className="hm-toolbar">
              <div className="hm-year-select">
                <CalendarDays size={14} />
                <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <ChevronDown size={13} />
              </div>
              <div style={{ flex: 1 }} />
              <button type="button" className="hm-btn-import" onClick={handleImportDefaults} disabled={saving} title="Nhập ngày nghỉ lễ Việt Nam (bỏ qua trùng)">
                <Copy size={13} />
                <span>Nhập lễ VN</span>
              </button>
              <button type="button" className="hm-btn-add" onClick={() => { resetForm(); setShowAddForm(v => !v); }}>
                <Plus size={14} />
                <span>Thêm</span>
              </button>
            </div>

            {/* Alert */}
            {msg.text && (
              <div className={`hm-alert ${msg.type}`}>
                {msg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                <span>{msg.text}</span>
              </div>
            )}

            {/* Add/Edit Form */}
            {showAddForm && (
              <div className="hm-form-card">
                <div className="hm-form-header">
                  <span>{editingId ? '✏️ Chỉnh sửa' : '➕ Thêm ngày nghỉ'}</span>
                  <button type="button" className="hm-close-btn" onClick={resetForm}><X size={16} /></button>
                </div>
                <div className="hm-form-body">
                  <div className="hm-form-grid">
                    <div className="hm-field">
                      <label>Tên ngày nghỉ <span className="required">*</span></label>
                      <input
                        type="text"
                        value={form.ten_ngaynghi}
                        onChange={e => setForm({ ...form, ten_ngaynghi: e.target.value })}
                        placeholder="VD: Tết Nguyên Đán..."
                        autoFocus
                      />
                    </div>
                    <div className="hm-field">
                      <label>Mô tả</label>
                      <input
                        type="text"
                        value={form.mo_ta}
                        onChange={e => setForm({ ...form, mo_ta: e.target.value })}
                        placeholder="Ghi chú (tùy chọn)"
                      />
                    </div>
                    <div className="hm-field">
                      <label>Ngày bắt đầu <span className="required">*</span></label>
                      <input
                        type="date"
                        value={form.ngay_bat_dau}
                        onChange={e => {
                           setForm({ ...form, ngay_bat_dau: e.target.value, ngay_ket_thuc: e.target.value });
                           if (e.target.value) setCalendarMonth(new Date(e.target.value + 'T00:00:00').getMonth());
                        }}
                      />
                      {form.ngay_bat_dau && (
                        <span className={`day-hint ${isWeekend(form.ngay_bat_dau) ? 'weekend' : ''}`}>
                          {getDayOfWeek(form.ngay_bat_dau)}{isWeekend(form.ngay_bat_dau) && ' ⚠️ Cuối tuần'}
                        </span>
                      )}
                    </div>
                    <div className="hm-field">
                      <label>Ngày kết thúc <span className="hint-soft">(để trống = 1 ngày)</span></label>
                      <input
                        type="date"
                        value={form.ngay_ket_thuc}
                        min={form.ngay_bat_dau}
                        onChange={e => setForm({ ...form, ngay_ket_thuc: e.target.value })}
                      />
                      {form.ngay_ket_thuc && form.ngay_bat_dau && form.ngay_ket_thuc !== form.ngay_bat_dau && (
                        <span className="day-hint">
                          {Math.round((new Date(form.ngay_ket_thuc + 'T00:00:00') - new Date(form.ngay_bat_dau + 'T00:00:00')) / 86400000) + 1} ngày nghỉ
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="hm-form-bottom">
                    <label className="hm-toggle-label" onClick={() => setForm(f => ({ ...f, hang_nam: !f.hang_nam }))}>
                      <div className={`hm-toggle ${form.hang_nam ? 'on' : ''}`}>
                        <div className="hm-toggle-thumb" />
                      </div>
                      <div>
                        <span className="toggle-title">Lặp lại hàng năm</span>
                        <span className="toggle-sub">Áp dụng mọi năm (lễ quốc gia cố định)</span>
                      </div>
                    </label>
                    {!form.hang_nam && (
                      <div className="hm-field" style={{ minWidth: '120px' }}>
                        <label>Năm</label>
                        <select value={form.nam} onChange={e => setForm({ ...form, nam: parseInt(e.target.value) })}>
                          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="hm-form-actions">
                    <button type="button" className="hm-btn-cancel" onClick={resetForm}><X size={14} /> Hủy</button>
                    <button type="button" className="hm-btn-save" onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                      {editingId ? 'Cập nhật' : 'Lưu'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* List */}
            {loading ? (
              <div className="hm-loading"><Loader2 size={20} className="spin" /> Đang tải...</div>
            ) : holidays.length === 0 ? (
              <div className="hm-empty">
                <CalendarX size={32} />
                <p>Chưa có ngày nghỉ — nhấn <strong>Thêm</strong> hoặc <strong>Nhập lễ VN</strong></p>
              </div>
            ) : (
              <div className="hm-list">
                {Object.keys(groupedHolidays).sort((a, b) => Number(a) - Number(b)).map(month => (
                  <div key={month} className="hm-month-group">
                    <div className="hm-month-label">
                      <span>{Number(month) === 0 ? '🔁 Hàng năm' : monthNames[Number(month) - 1]}</span>
                      <span className="hm-month-count">{groupedHolidays[month].length}</span>
                    </div>
                    {groupedHolidays[month].map(h => {
                      const isMultiDay = h.ngay_ket_thuc && h.ngay_ket_thuc !== h.ngay_bat_dau;
                      const dayDiff = isMultiDay
                        ? Math.round((new Date(h.ngay_ket_thuc + 'T00:00:00') - new Date(h.ngay_bat_dau + 'T00:00:00')) / 86400000) + 1
                        : 1;
                      const dow = getDayOfWeek(h.ngay_bat_dau);
                      const wknd = isWeekend(h.ngay_bat_dau);
                      const dateObj = h.ngay_bat_dau ? new Date(h.ngay_bat_dau + 'T00:00:00') : null;

                      return (
                        <div key={h.id} className={`hm-item ${h.hang_nam ? 'recurring' : ''}`}>
                          {/* Date badge */}
                          <div className="hm-date-badge">
                            <span className="hm-date-day">{dateObj ? dateObj.getDate() : '?'}</span>
                            <span className="hm-date-dow">{dow}</span>
                          </div>

                          {/* Info */}
                          <div className="hm-item-info">
                            <div className="hm-item-name">
                              {h.ten_ngaynghi}
                              {h.hang_nam && <span className="hm-tag recurring">🔁</span>}
                              {wknd && <span className="hm-tag weekend">CN</span>}
                            </div>
                            <div className="hm-item-meta">
                              {dateObj && `${dateObj.getDate()}/${dateObj.getMonth()+1}`}
                              {isMultiDay && ` → ${new Date(h.ngay_ket_thuc + 'T00:00:00').getDate()}/${new Date(h.ngay_ket_thuc+'T00:00:00').getMonth()+1} (${dayDiff} ngày)`}
                              {h.mo_ta && <span className="hm-desc"> · {h.mo_ta}</span>}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="hm-item-actions">
                            <button type="button" className="hm-action-btn edit" onClick={() => handleEdit(h)} title="Sửa">
                              <Edit3 size={13} />
                            </button>
                            <button type="button"
                              className={`hm-action-btn delete ${deleteConfirm === h.id ? 'confirm' : ''}`}
                              onClick={() => handleDelete(h.id, h.ten_ngaynghi)}
                              title={deleteConfirm === h.id ? 'Bấm lần nữa để xóa' : 'Xóa'}
                            >
                              <Trash2 size={13} />
                              {deleteConfirm === h.id && <span>Xóa?</span>}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Right Pane: Mini Calendar */}
          <div className="hm-right-pane">
             {renderMiniCalendar()}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Utility exports ──────────────────────────────────────────────────────────
export const fetchHolidayDates = async (year = new Date().getFullYear()) => {
  try {
    const { data, error } = await supabase
      .from('tbl_ngaynghi')
      .select('ngay_bat_dau, ngay_ket_thuc, hang_nam, nam')
      .or(`hang_nam.eq.true,nam.eq.${year}`);
    if (error) throw error;

    const dates = [];
    (data || []).forEach(h => {
      const start = new Date((h.ngay_bat_dau || '') + 'T00:00:00');
      const end   = new Date((h.ngay_ket_thuc || h.ngay_bat_dau || '') + 'T00:00:00');
      if (h.hang_nam && start.getFullYear() !== year) { start.setFullYear(year); end.setFullYear(year); }
      const cur = new Date(start);
      while (cur <= end) {
        const s = cur.toISOString().split('T')[0];
        if (!dates.includes(s)) dates.push(s);
        cur.setDate(cur.getDate() + 1);
      }
    });
    return dates;
  } catch (err) {
    console.error('[fetchHolidayDates]', err);
    return [];
  }
};

export const isHoliday = (dateStr, holidayDates) => holidayDates.includes(dateStr);

export const filterOutHolidays = (dates, holidayDates) => dates.filter(d => !holidayDates.includes(d));

export default HolidayManager;
