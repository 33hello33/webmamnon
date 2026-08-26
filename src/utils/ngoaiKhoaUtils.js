const NGOAI_KHOA_TITLE = 'NGOẠI KHÓA';
const NGOAI_KHOA_CLOSE_PREFIX = '__NGOAI_KHOA_CLOSED__::';

const normalizeTitle = (value) => String(value || '').trim().toUpperCase();

export const isNgoaiKhoaAnnouncement = (record) => normalizeTitle(record?.title) === NGOAI_KHOA_TITLE;

export const isNgoaiKhoaCloseAnnouncement = (record) => (
  isNgoaiKhoaAnnouncement(record) &&
  String(record?.content || '').startsWith(NGOAI_KHOA_CLOSE_PREFIX)
);

export const buildNgoaiKhoaCloseContent = (snapshot) => (
  `${NGOAI_KHOA_CLOSE_PREFIX}${JSON.stringify(snapshot || {})}`
);

export const parseNgoaiKhoaCloseSnapshot = (record) => {
  if (!isNgoaiKhoaCloseAnnouncement(record)) return null;

  try {
    return JSON.parse(String(record.content).slice(NGOAI_KHOA_CLOSE_PREFIX.length));
  } catch (error) {
    console.error('Failed to parse extracurricular snapshot:', error);
    return null;
  }
};

export const getLatestNgoaiKhoaCloseTime = (records = []) => {
  return records
    .filter(isNgoaiKhoaCloseAnnouncement)
    .reduce((latest, record) => {
      const time = new Date(record?.created_at || 0).getTime();
      return time > latest ? time : latest;
    }, 0);
};

export const getActiveNgoaiKhoaAnnouncements = (records = []) => {
  const latestCloseTime = getLatestNgoaiKhoaCloseTime(records);

  return records.filter((record) => (
    isNgoaiKhoaAnnouncement(record) &&
    !isNgoaiKhoaCloseAnnouncement(record) &&
    new Date(record?.created_at || 0).getTime() > latestCloseTime
  ));
};

export const getArchivedNgoaiKhoaPrograms = (records = []) => (
  Array.from(
    new Map(
      records
        .filter(isNgoaiKhoaCloseAnnouncement)
        .map((record) => ({
          ...record,
          snapshot: parseNgoaiKhoaCloseSnapshot(record)
        }))
        .filter((record) => record.snapshot)
        .map((record) => [
          `${record.snapshot.programId || 'unknown'}-${record.snapshot.endedAt || record.created_at}`,
          record
        ])
    ).values()
  )
    .map((record) => ({
      ...record,
      snapshot: record.snapshot
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
);
