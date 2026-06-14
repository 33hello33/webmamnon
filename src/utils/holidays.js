import { supabase } from '../supabase';

const normalizeYear = (year) => {
  const parsed = parseInt(year, 10);
  return Number.isFinite(parsed) ? parsed : new Date().getFullYear();
};

export const buildHolidayDatesFromRows = (rows, year = new Date().getFullYear()) => {
  const targetYear = normalizeYear(year);
  const dates = new Set();

  (rows || []).forEach((holiday) => {
    const startRaw = holiday?.ngay_bat_dau;
    const endRaw = holiday?.ngay_ket_thuc || holiday?.ngay_bat_dau;
    if (!startRaw || !endRaw) return;

    const start = new Date(`${startRaw}T00:00:00`);
    const end = new Date(`${endRaw}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

    if (holiday?.hang_nam) {
      start.setFullYear(targetYear);
      end.setFullYear(targetYear);
    }

    const cursor = new Date(start);
    while (cursor <= end) {
      const yearPart = cursor.getFullYear();
      const monthPart = String(cursor.getMonth() + 1).padStart(2, '0');
      const dayPart = String(cursor.getDate()).padStart(2, '0');
      dates.add(`${yearPart}-${monthPart}-${dayPart}`);
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  return Array.from(dates).sort();
};

export const fetchHolidayDates = async (year = new Date().getFullYear()) => {
  const targetYear = normalizeYear(year);

  try {
    const { data, error } = await supabase
      .from('tbl_ngaynghi')
      .select('ngay_bat_dau, ngay_ket_thuc, hang_nam, nam')
      .or(`hang_nam.eq.true,nam.eq.${targetYear}`);

    if (error) throw error;
    return buildHolidayDatesFromRows(data || [], targetYear);
  } catch (error) {
    console.error('[fetchHolidayDates]', error);
    return [];
  }
};

export const isHoliday = (dateStr, holidayDates) => {
  return Array.isArray(holidayDates) && holidayDates.includes(dateStr);
};

export const filterOutHolidays = (dates, holidayDates) => {
  if (!Array.isArray(dates)) return [];
  if (!Array.isArray(holidayDates) || holidayDates.length === 0) return dates;
  return dates.filter((date) => !holidayDates.includes(date));
};
