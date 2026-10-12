/**
 * Tiện ích tính tiền ăn và trừ tiền ăn cho trường mầm non.
 * 
 * Quy tắc:
 * - Tiền ăn = số ngày của tháng (trừ các ngày Chủ Nhật và ngày nghỉ lễ) * mức tiền ăn đã chọn
 *   Ví dụ: Tháng 10 có 31 ngày, 4 ngày CN => 27 ngày ăn * mức tiền ăn
 * - Trừ tiền ăn = số ngày đã nghỉ phép của tháng trước * mức tiền ăn đã chọn
 */

/**
 * Tính số ngày ăn trong tháng (tổng số ngày trừ đi các ngày Chủ Nhật).
 * @param {string|Date} dateInput Ngày bất kỳ trong tháng cần tính (thường là ngày bắt đầu kỳ học)
 * @param {number} monthsCount Số tháng (mặc định là 1)
 * @param {string[]} holidayDates Danh sách ngày nghỉ lễ dạng 'YYYY-MM-DD' (lấy từ cấu hình)
 * @returns {{ totalDays: number, sundays: number, holidays: number, feedingDays: number, month: number, year: number }}
 */
export const calculateFeedingDays = (dateInput, monthsCount = 1, holidayDates = []) => {
  if (!dateInput) {
    return { totalDays: 0, sundays: 0, holidays: 0, feedingDays: 0, month: 0, year: 0 };
  }

  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    return { totalDays: 0, sundays: 0, holidays: 0, feedingDays: 0, month: 0, year: 0 };
  }

  const holidaySet = new Set(Array.isArray(holidayDates) ? holidayDates : []);
  const count = Math.max(1, parseInt(monthsCount, 10) || 1);
  let totalDaysSum = 0;
  let sundaysSum = 0;
  let holidaysSum = 0;
  let feedingDaysSum = 0;

  for (let m = 0; m < count; m++) {
    const curMonthDate = new Date(d.getFullYear(), d.getMonth() + m, 1);
    const y = curMonthDate.getFullYear();
    const mo = curMonthDate.getMonth();
    const daysInMo = new Date(y, mo + 1, 0).getDate();
    totalDaysSum += daysInMo;

    let sunCount = 0;
    let holidayCount = 0;
    const moStr = String(mo + 1).padStart(2, '0');
    for (let day = 1; day <= daysInMo; day++) {
      if (new Date(y, mo, day).getDay() === 0) {
        sunCount++;
      } else if (holidaySet.has(`${y}-${moStr}-${String(day).padStart(2, '0')}`)) {
        // Ngày lễ trùng Chủ Nhật không trừ lần 2
        holidayCount++;
      }
    }
    sundaysSum += sunCount;
    holidaysSum += holidayCount;
    feedingDaysSum += (daysInMo - sunCount - holidayCount);
  }

  return {
    totalDays: totalDaysSum,
    sundays: sundaysSum,
    holidays: holidaysSum,
    feedingDays: feedingDaysSum,
    month: d.getMonth() + 1,
    year: d.getFullYear()
  };
};

/**
 * Tính cả tiền ăn và trừ tiền ăn theo mức giá đã chọn.
 * @param {Object} params
 * @param {string|Date} params.startDate Ngày bắt đầu kỳ học
 * @param {number} [params.monthsCount=1] Số tháng đóng
 * @param {number} [params.dailyRate=0] Mức tiền ăn / ngày
 * @param {number} [params.excusedLeaveDays=0] Số ngày nghỉ phép của tháng trước
 */
export const calculateMealAmounts = ({
  startDate,
  monthsCount = 1,
  dailyRate = 0,
  excusedLeaveDays = 0,
  holidayDates = []
}) => {
  const rate = Number(dailyRate) || 0;
  const feedingInfo = calculateFeedingDays(startDate, monthsCount, holidayDates);
  const tienAn = Math.round(feedingInfo.feedingDays * rate);
  const truTienAn = Math.round((Number(excusedLeaveDays) || 0) * rate);

  return {
    ...feedingInfo,
    dailyRate: rate,
    tienAn,
    truTienAn
  };
};
