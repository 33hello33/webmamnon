export const DEFAULT_CONSECUTIVE_REFUND_CONFIG = {
  "6": { phantramgiam: 30 },
  "12": { phantramgiam: 50 }
};

const clampPercent = (value, fallback = 0) => {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, num));
};

const normalizeTierValue = (value, fallback = 0) => {
  if (value && typeof value === 'object') {
    return { phantramgiam: clampPercent(value.phantramgiam ?? value.percent, fallback) };
  }
  return { phantramgiam: clampPercent(value, fallback) };
};

const parseJsonConfig = (value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) return null;

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return null;
  }
};

const fromRulesArray = (rules = []) => {
  const mapped = {};
  (rules || []).forEach((rule) => {
    const minDays = parseInt(rule?.minDays ?? rule?.days ?? rule?.songay ?? rule?.so_ngay, 10);
    if (!Number.isFinite(minDays) || minDays <= 0) return;
    mapped[String(minDays)] = normalizeTierValue(rule, 0);
  });
  return mapped;
};

const fromTierObject = (configObject = {}) => {
  const mapped = {};
  Object.entries(configObject || {}).forEach(([key, value]) => {
    if (!/^\d+$/.test(String(key).trim())) return;
    const minDays = parseInt(key, 10);
    if (!Number.isFinite(minDays) || minDays <= 0) return;
    mapped[String(minDays)] = normalizeTierValue(value, 0);
  });
  return mapped;
};

export const normalizeConsecutiveRefundConfig = (rawConfig, legacyConfig = {}) => {
  const parsedConfig = parseJsonConfig(rawConfig);
  let normalized = {};

  if (parsedConfig && Array.isArray(parsedConfig.rules)) {
    normalized = fromRulesArray(parsedConfig.rules);
  } else if (parsedConfig && typeof parsedConfig === 'object' && !Array.isArray(parsedConfig)) {
    normalized = fromTierObject(parsedConfig);
  } else if (rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)) {
    normalized = fromTierObject(rawConfig);
  }

  if (Object.keys(normalized).length === 0) {
    normalized = fromTierObject({
      6: legacyConfig?.nghi6ngay,
      12: legacyConfig?.nghi12ngay
    });
  }

  if (Object.keys(normalized).length === 0) {
    normalized = fromTierObject(DEFAULT_CONSECUTIVE_REFUND_CONFIG);
  }

  return Object.fromEntries(
    Object.entries(normalized)
      .filter(([key]) => parseInt(key, 10) > 0)
      .sort((left, right) => parseInt(left[0], 10) - parseInt(right[0], 10))
  );
};

export const getConsecutiveRefundRules = (config) => (
  Object.entries(normalizeConsecutiveRefundConfig(config))
    .map(([minDays, value]) => ({
      minDays: parseInt(minDays, 10),
      percent: clampPercent(value?.phantramgiam ?? value?.percent, 0)
    }))
    .filter((rule) => Number.isFinite(rule.minDays) && rule.minDays > 0)
    .sort((left, right) => right.minDays - left.minDays)
);

export const dedupeAttendanceRecordsByDay = (attendanceRecords = []) => (
  Array.from(
    new Map(
      (attendanceRecords || [])
        .filter((record) => String(record?.ngay || '').trim())
        .map((record) => {
          const dayKey = String(record.ngay).slice(0, 10);
          return [dayKey, { ...record, ngay: dayKey }];
        })
    ).values()
  )
);

export const isExactExcusedLeaveStatus = (status) => (
  String(status || '').trim().toLowerCase() === 'nghỉ phép'
);

export const calculateConsecutiveLeaveGroups = (attendanceRecords = []) => {
  const uniqueRecords = dedupeAttendanceRecordsByDay(attendanceRecords);
  const excusedLeaveDays = uniqueRecords
    .filter((record) => isExactExcusedLeaveStatus(record.trangthai))
    .map((record) => {
      const date = new Date(record.ngay);
      date.setHours(0, 0, 0, 0);
      return date;
    })
    .sort((left, right) => left - right);

  if (excusedLeaveDays.length === 0) return [];

  const groups = [];
  let currentGroup = [excusedLeaveDays[0]];

  for (let index = 1; index < excusedLeaveDays.length; index += 1) {
    const previousDate = new Date(excusedLeaveDays[index - 1]);
    const currentDate = new Date(excusedLeaveDays[index]);
    const diffInDays = Math.round((currentDate - previousDate) / (1000 * 60 * 60 * 24));

    let isConsecutive = false;
    if (diffInDays === 1) {
      isConsecutive = true;
    } else if (diffInDays === 2) {
      const middleDay = new Date(previousDate);
      middleDay.setDate(previousDate.getDate() + 1);
      if (middleDay.getDay() === 0) {
        isConsecutive = true;
      }
    }

    if (isConsecutive) {
      currentGroup.push(currentDate);
    } else {
      groups.push([...currentGroup]);
      currentGroup = [currentDate];
    }
  }

  groups.push(currentGroup);

  return groups.map((group) => ({
    ngay_bat_dau_nghi: group[0].toISOString().split('T')[0],
    ngay_ket_thuc_nghi: group[group.length - 1].toISOString().split('T')[0],
    so_ngay_nghi_lien_tuc: group.length
  }));
};

export const calculateConsecutiveTuitionRefund = ({ groups = [], dailyRefundAmount = 0, config }) => {
  const amountPerDay = Number(dailyRefundAmount) || 0;
  if (amountPerDay <= 0 || !Array.isArray(groups) || groups.length === 0) return 0;

  const rules = getConsecutiveRefundRules(config)
    .filter((rule) => Number(rule.percent) > 0);

  return groups.reduce((total, group) => {
    const leaveDays = Number(group?.so_ngay_nghi_lien_tuc) || 0;
    const matchedRule = rules.find((rule) => leaveDays >= rule.minDays);
    if (!matchedRule) return total;
    return total + (leaveDays * amountPerDay * (matchedRule.percent / 100));
  }, 0);
};
