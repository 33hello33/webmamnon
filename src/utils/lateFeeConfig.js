export const DEFAULT_LATE_FEE_CONFIG = {
  traTre1: { label: 'Trả trễ 1', amount: 20000 },
  traTre2: { label: 'Trả trễ 2', amount: 30000 },
  traTre3: { label: 'Trả trễ 3', amount: 40000 }
};

export const LATE_FEE_STATUS_ORDER = ['traTre1', 'traTre2', 'traTre3'];

const parseAmount = (value) => parseInt(String(value ?? '').replace(/\D/g, ''), 10) || 0;

const getDefaultLabel = (key) => {
  if (DEFAULT_LATE_FEE_CONFIG[key]?.label) return DEFAULT_LATE_FEE_CONFIG[key].label;
  const matchedNumber = String(key || '').match(/(\d+)/);
  return matchedNumber ? `Trả trễ ${matchedNumber[1]}` : 'Trả trễ';
};

export const normalizeLateFeeConfig = (value) => {
  let parsedValue = value;

  if (typeof parsedValue === 'string') {
    try {
      parsedValue = JSON.parse(parsedValue);
    } catch (error) {
      parsedValue = null;
    }
  }

  const source = parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
    ? parsedValue
    : {};

  const normalized = {};
  const keys = Array.from(new Set([...LATE_FEE_STATUS_ORDER, ...Object.keys(source)]));

  keys.forEach((key) => {
    const rawEntry = source[key];
    if (rawEntry && typeof rawEntry === 'object' && !Array.isArray(rawEntry)) {
      normalized[key] = {
        label: String(rawEntry.label || getDefaultLabel(key)),
        amount: parseAmount(rawEntry.amount)
      };
      return;
    }

    normalized[key] = {
      label: getDefaultLabel(key),
      amount: parseAmount(rawEntry)
    };
  });

  return normalized;
};

export const getLateStatusKeyFromAttendanceStatus = (status) => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (normalizedStatus === 'trả trễ 1') return 'traTre1';
  if (normalizedStatus === 'trả trễ 2') return 'traTre2';
  if (normalizedStatus === 'trả trễ 3') return 'traTre3';
  return null;
};

export const isPresentAttendanceStatus = (status) => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  return normalizedStatus === 'có mặt' || Boolean(getLateStatusKeyFromAttendanceStatus(normalizedStatus));
};

export const getLateAttendanceCounts = (records) => {
  const counts = {
    traTre1: 0,
    traTre2: 0,
    traTre3: 0
  };

  (records || []).forEach((record) => {
    const statusValue = typeof record === 'string' ? record : record?.trangthai;
    const matchedKey = getLateStatusKeyFromAttendanceStatus(statusValue);
    if (matchedKey) counts[matchedKey] = (counts[matchedKey] || 0) + 1;
  });

  return counts;
};

export const stripAutoLateFeeSurcharges = (items) => (
  Array.isArray(items)
    ? items.filter((item) => item && item.autoType !== 'late_fee')
    : []
);

export const buildLateFeeSurcharges = (counts, configValue) => {
  const normalizedConfig = normalizeLateFeeConfig(configValue);

  return Object.entries(normalizedConfig)
    .map(([key, entry]) => {
      const quantity = Number(counts?.[key]) || 0;
      const unitAmount = parseAmount(entry?.amount);

      if (quantity <= 0 || unitAmount <= 0) return null;

      return {
        name: `${entry.label} (${quantity} lần)`,
        amount: quantity * unitAmount,
        autoType: 'late_fee',
        autoKey: key,
        quantity,
        unitAmount
      };
    })
    .filter(Boolean);
};

export const mergeLateFeeSurcharges = (items, counts, configValue) => ([
  ...stripAutoLateFeeSurcharges(items),
  ...buildLateFeeSurcharges(counts, configValue)
]);
