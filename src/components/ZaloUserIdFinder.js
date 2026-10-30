import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  Trash2,
  UserSearch,
  X
} from 'lucide-react';
import { insertLog, supabaseNoLog } from '../supabase';
import { normalizePhoneNumber } from '../services/zaloHelper';
import {
  DEFAULT_HOURLY_LIMIT,
  DEFAULT_THROTTLE_SEC,
  clearZaloUserIdJob,
  getCachedLookup,
  getQuotaSnapshot,
  loadZaloUserIdJob,
  saveZaloUserIdJob,
  searchZaloUserByPhone,
  setCachedLookup
} from '../services/zaloUserIdService';
import './ZaloUserIdFinder.css';

const RATE_LIMIT_BASE_COOLDOWN_MS = 2 * 60 * 1000;
const RATE_LIMIT_MAX_COOLDOWN_MS = 60 * 60 * 1000;
const QUOTA_WINDOW_BUFFER_MS = 1500;
const STALE_JOB_MS = 24 * 60 * 60 * 1000;
const MAX_LOG_ENTRIES = 300;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const formatDuration = (ms) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
};

const formatTime = (ts) => {
  try {
    return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (err) {
    return '';
  }
};

const computeCooldownMs = (consecutiveRateLimits, retryAfterMs = 0) => {
  const escalation = Math.min(
    RATE_LIMIT_MAX_COOLDOWN_MS,
    RATE_LIMIT_BASE_COOLDOWN_MS * Math.pow(2, Math.max(0, consecutiveRateLimits - 1))
  );
  return Math.min(RATE_LIMIT_MAX_COOLDOWN_MS, Math.max(escalation, Math.min(RATE_LIMIT_MAX_COOLDOWN_MS, retryAfterMs || 0)));
};

const buildItemsFromStudents = (source, onlyMissing) => {
  const items = [];
  let skippedNoPhone = 0;
  let skippedHasId = 0;

  (source || []).forEach((student) => {
    if (!student || !student.mahv) return;

    const existingId = String(student.zalo_user_id || '').trim();
    if (onlyMissing && existingId) {
      skippedHasId += 1;
      return;
    }

    const momPhone = normalizePhoneNumber(student.sdtme);
    const dadPhone = normalizePhoneNumber(student.sdtba);
    const phones = [];
    if (momPhone) phones.push({ phone: momPhone, type: 'Mẹ' });
    if (dadPhone && dadPhone !== momPhone) phones.push({ phone: dadPhone, type: 'Ba' });

    if (phones.length === 0) {
      skippedNoPhone += 1;
      return;
    }

    items.push({
      mahv: student.mahv,
      tenhv: student.tenhv || '',
      phones,
      phoneIndex: 0,
      status: 'pending',
      attempts: [],
      errors: 0,
      zaloUserId: existingId
    });
  });

  return { items, skippedNoPhone, skippedHasId };
};

export default function ZaloUserIdFinder({
  open,
  onClose,
  students = [],
  filteredStudents = [],
  selectedStudentId = '',
  onSaved,
  onJobStateChange
}) {
  const [scope, setScope] = useState('all');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [useCache, setUseCache] = useState(true);
  const [hourlyLimit, setHourlyLimit] = useState(DEFAULT_HOURLY_LIMIT);
  const [throttleSec, setThrottleSec] = useState(DEFAULT_THROTTLE_SEC);

  const [job, setJob] = useState(null);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState(null);
  const [waitInfo, setWaitInfo] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [setupError, setSetupError] = useState('');

  const jobRef = useRef(null);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const onSavedRef = useRef(onSaved);
  const onJobStateChangeRef = useRef(onJobStateChange);

  onSavedRef.current = onSaved;
  onJobStateChangeRef.current = onJobStateChange;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runningRef.current = false;
    };
  }, []);

  const commitJob = useCallback((nextJob) => {
    if (!nextJob) return;
    nextJob.updatedAt = Date.now();
    jobRef.current = nextJob;
    saveZaloUserIdJob(nextJob);
    if (mountedRef.current) setJob({ ...nextJob });
  }, []);

  const pushLog = useCallback((targetJob, type, text) => {
    if (!targetJob) return;
    const entry = { ts: Date.now(), type, text };
    targetJob.log = [entry, ...(targetJob.log || [])].slice(0, MAX_LOG_ENTRIES);
  }, []);

  const saveZaloUserId = useCallback(async (mahv, zaloUserId) => {
    try {
      const { error } = await supabaseNoLog
        .from('tbl_hv')
        .update({ zalo_user_id: zaloUserId })
        .eq('mahv', mahv);
      if (error) throw error;
      if (onSavedRef.current) onSavedRef.current(mahv, zaloUserId);
      return true;
    } catch (err) {
      console.error('[ZaloUserIdFinder] Không lưu được zalo_user_id:', err);
      return false;
    }
  }, []);

  const interruptibleWait = useCallback(async (ms) => {
    const endAt = Date.now() + ms;
    while (Date.now() < endAt) {
      if (!runningRef.current || !mountedRef.current) return false;
      await sleep(Math.min(400, Math.max(50, endAt - Date.now())));
    }
    return runningRef.current && mountedRef.current;
  }, []);

  const applyLookupResult = useCallback(async (targetJob, item, phoneEntry, result) => {
    item.attempts = [
      ...(item.attempts || []),
      {
        phone: phoneEntry.phone,
        type: phoneEntry.type,
        status: result.status,
        userId: result.userId || '',
        message: result.message || '',
        fromCache: Boolean(result.fromCache),
        at: Date.now()
      }
    ];

    if (!result.fromCache) setCachedLookup(phoneEntry.phone, result);

    if (result.status === 'found') {
      const saved = await saveZaloUserId(item.mahv, result.userId);
      if (!saved) {
        item.errors = (item.errors || 0) + 1;
        pushLog(targetJob, 'error', `${item.mahv} • Đã tìm thấy Zalo ID nhưng không lưu được vào CSDL`);
        if (item.errors >= 2) item.status = 'error';
        return false;
      }
      item.status = 'found';
      item.zaloUserId = result.userId;
      pushLog(
        targetJob,
        'success',
        `${item.mahv} • ${item.tenhv} • ${phoneEntry.phone} (${phoneEntry.type}) → Zalo ID ${result.userId}${result.fromCache ? ' • lấy từ bộ nhớ tạm' : ''}`
      );
      return true;
    }

    if (result.status === 'not_found' || result.status === 'blocked' || result.status === 'invalid') {
      const hasNextPhone = item.phoneIndex < item.phones.length - 1;
      if (hasNextPhone && result.status !== 'invalid') {
        item.phoneIndex += 1;
        const nextPhone = item.phones[item.phoneIndex];
        pushLog(
          targetJob,
          'info',
          `${item.mahv} • Không thấy với ${phoneEntry.phone} → thử tiếp ${nextPhone.type.toLowerCase()} ${nextPhone.phone}`
        );
        return true;
      }
      item.status = result.status === 'blocked' ? 'blocked' : 'not_found';
      pushLog(
        targetJob,
        result.status === 'blocked' ? 'warn' : 'muted',
        `${item.mahv} • ${item.tenhv} • ${result.status === 'blocked' ? 'Zalo chặn tra cứu' : 'Không tìm thấy tài khoản Zalo'} (${phoneEntry.phone})${result.message ? ': ' + result.message : ''}`
      );
      return true;
    }

    item.errors = (item.errors || 0) + 1;
    if (item.errors >= 2 && item.phoneIndex < item.phones.length - 1) {
      item.phoneIndex += 1;
      item.errors = 0;
      pushLog(targetJob, 'warn', `${item.mahv} • Lỗi tra cứu ${phoneEntry.phone} → chuyển sang số khác`);
      return false;
    }
    if (item.errors >= 2) {
      item.status = 'error';
      pushLog(targetJob, 'error', `${item.mahv} • Lỗi tra cứu: ${result.message || 'không xác định'}`);
      return false;
    }
    pushLog(targetJob, 'warn', `${item.mahv} • Lỗi tạm thời (${result.message || 'không rõ'}) — sẽ thử lại`);
    return false;
  }, [pushLog, saveZaloUserId]);

  const finishJob = useCallback((targetJob) => {
    if (!targetJob) return;
    const items = targetJob.items || [];
    const success = items.filter((item) => item.status === 'found').length;
    const notFound = items.filter((item) => item.status === 'not_found' || item.status === 'blocked').length;
    const failed = items.filter((item) => item.status === 'error').length;
    targetJob.status = 'finished';
    targetJob.cooldownUntil = null;
    pushLog(targetJob, 'info', `Hoàn tất: ${success} thành công • ${notFound} không tìm thấy • ${failed} lỗi`);
    commitJob(targetJob);
    insertLog(`[Zalo User ID] Hoàn tất tra cứu: ${success} thành công, ${notFound} không tìm thấy, ${failed} lỗi`);
  }, [commitJob, pushLog]);

  const startLoop = useCallback(() => {
    if (runningRef.current) return;

    const loop = async () => {
      runningRef.current = true;
      if (mountedRef.current) setRunning(true);
      try {
        while (runningRef.current && mountedRef.current) {
          const activeJob = jobRef.current;
          if (!activeJob) break;

          const pendingIndex = activeJob.items.findIndex((item) => item.status === 'pending');
          if (pendingIndex === -1) {
            finishJob(activeJob);
            break;
          }

          const quota = getQuotaSnapshot(activeJob.hourlyLimit);
          const quotaWaitUntil = quota.remaining <= 0 && quota.resetAt ? quota.resetAt + QUOTA_WINDOW_BUFFER_MS : 0;
          const rateWaitUntil = activeJob.cooldownUntil || 0;
          const waitUntil = Math.max(quotaWaitUntil, rateWaitUntil);

          if (waitUntil > Date.now()) {
            if (mountedRef.current) {
              setWaitInfo({ until: waitUntil, reason: rateWaitUntil >= quotaWaitUntil ? 'rate_limit' : 'quota' });
            }
            const keepGoing = await interruptibleWait(waitUntil - Date.now() + 250);
            if (mountedRef.current) setWaitInfo(null);
            if (!keepGoing) break;
            continue;
          }
          if (mountedRef.current) setWaitInfo(null);

          const item = activeJob.items[pendingIndex];
          const phoneEntry = item.phones[item.phoneIndex] || item.phones[0];
          if (!phoneEntry) {
            item.status = 'error';
            commitJob(activeJob);
            continue;
          }

          if (activeJob.useCache) {
            const cached = getCachedLookup(phoneEntry.phone);
            if (cached) {
              await applyLookupResult(activeJob, item, phoneEntry, cached);
              commitJob(activeJob);
              const keepGoing = await interruptibleWait((activeJob.throttleSec || DEFAULT_THROTTLE_SEC) * 1000);
              if (!keepGoing) break;
              continue;
            }
          }

          if (mountedRef.current) {
            setCurrent({ mahv: item.mahv, tenhv: item.tenhv, phone: phoneEntry.phone, type: phoneEntry.type });
          }

          const result = await searchZaloUserByPhone(phoneEntry.phone);
          if (mountedRef.current) setCurrent(null);

          if (result.status === 'rate_limited') {
            activeJob.consecutiveRateLimits = (activeJob.consecutiveRateLimits || 0) + 1;
            const cooldownMs = computeCooldownMs(activeJob.consecutiveRateLimits, result.retryAfterMs);
            activeJob.cooldownUntil = Date.now() + cooldownMs;
            pushLog(
              activeJob,
              'warn',
              `Zalo tạm giới hạn tra cứu — nghỉ ${formatDuration(cooldownMs)} rồi tự tiếp tục (${item.mahv})`
            );
            commitJob(activeJob);
            continue;
          }

          activeJob.cooldownUntil = null;
          activeJob.consecutiveRateLimits = 0;
          await applyLookupResult(activeJob, item, phoneEntry, result);
          commitJob(activeJob);

          const keepGoing = await interruptibleWait((activeJob.throttleSec || DEFAULT_THROTTLE_SEC) * 1000);
          if (!keepGoing) break;
        }
      } catch (err) {
        console.error('[ZaloUserIdFinder] Lỗi vòng lặp tra cứu:', err);
        if (jobRef.current) {
          pushLog(jobRef.current, 'error', `Lỗi hệ thống: ${err?.message || err}`);
          commitJob(jobRef.current);
        }
      } finally {
        runningRef.current = false;
        if (mountedRef.current) {
          setRunning(false);
          setCurrent(null);
          setWaitInfo(null);
        }
      }
    };

    loop();
  }, [applyLookupResult, commitJob, finishJob, interruptibleWait, pushLog]);

  // Khôi phục tiến trình đã lưu (kể cả khi người dùng tải lại trang / chuyển tab)
  useEffect(() => {
    const saved = loadZaloUserIdJob();
    if (!saved) return;

    jobRef.current = saved;
    setJob({ ...saved });
    if (saved.scope) setScope(saved.scope);
    setOnlyMissing(saved.onlyMissing !== false);
    setUseCache(saved.useCache !== false);
    setHourlyLimit(saved.hourlyLimit || DEFAULT_HOURLY_LIMIT);
    setThrottleSec(saved.throttleSec ?? DEFAULT_THROTTLE_SEC);

    const isStale = Date.now() - (saved.updatedAt || saved.createdAt || 0) > STALE_JOB_MS;
    const hasPending = saved.items.some((item) => item.status === 'pending');
    if (saved.status === 'running' && hasPending && !isStale) {
      startLoop();
    } else if (saved.status === 'running') {
      saved.status = 'paused';
      commitJob(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  const stats = useMemo(() => {
    const items = job?.items || [];
    const total = items.length;
    const found = items.filter((item) => item.status === 'found').length;
    const notFound = items.filter((item) => item.status === 'not_found').length;
    const blocked = items.filter((item) => item.status === 'blocked').length;
    const failed = items.filter((item) => item.status === 'error').length;
    const pending = items.filter((item) => item.status === 'pending').length;
    const done = total - pending;
    return {
      total,
      found,
      notFound,
      blocked,
      failed,
      pending,
      done,
      percent: total > 0 ? Math.round((done / total) * 100) : 0
    };
  }, [job]);

  useEffect(() => {
    if (!onJobStateChangeRef.current) return;
    onJobStateChangeRef.current(
      job ? { running, done: stats.done, total: stats.total, pending: stats.pending } : null
    );
  }, [job, running, stats.done, stats.total, stats.pending]);

  const quota = useMemo(
    () => getQuotaSnapshot(hourlyLimit),
    // nowTick giúp thanh hạn mức tự cập nhật sau khi cửa sổ 1 giờ trôi qua
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hourlyLimit, nowTick, job]
  );

  const waitSeconds = waitInfo ? Math.max(0, Math.ceil((waitInfo.until - nowTick) / 1000)) : 0;

  const getScopeStudents = useCallback(() => {
    if (scope === 'selected') return students.filter((student) => student.mahv === selectedStudentId);
    if (scope === 'filtered') return filteredStudents;
    return students;
  }, [filteredStudents, scope, selectedStudentId, students]);

  const startJob = () => {
    if (runningRef.current) return;
    const source = getScopeStudents();
    const { items, skippedNoPhone, skippedHasId } = buildItemsFromStudents(source, onlyMissing);

    if (items.length === 0) {
      setSetupError(
        skippedHasId > 0
          ? `Tất cả ${skippedHasId} học viên trong phạm vi đã có Zalo User ID.`
          : 'Không có học viên nào có số điện thoại để tra cứu trong phạm vi đã chọn.'
      );
      return;
    }

    setSetupError('');
    const nextJob = {
      id: `zjob_${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      scope,
      onlyMissing,
      useCache,
      hourlyLimit: Math.max(1, Number(hourlyLimit) || DEFAULT_HOURLY_LIMIT),
      throttleSec: Math.max(0.5, Number(throttleSec) || DEFAULT_THROTTLE_SEC),
      items,
      status: 'running',
      cooldownUntil: null,
      consecutiveRateLimits: 0,
      skippedNoPhone,
      skippedHasId,
      log: []
    };

    pushLog(nextJob, 'info', `Bắt đầu tra cứu ${items.length} học viên (bỏ qua ${skippedNoPhone} HV thiếu SĐT, ${skippedHasId} HV đã có ID)`);
    commitJob(nextJob);
    insertLog(`[Zalo User ID] Bắt đầu tra cứu Zalo User ID cho ${items.length} học viên`);
    startLoop();
  };

  const pauseJob = () => {
    runningRef.current = false;
    setRunning(false);
    setWaitInfo(null);
    setCurrent(null);
    const activeJob = jobRef.current;
    if (activeJob) {
      activeJob.status = 'paused';
      pushLog(activeJob, 'info', 'Đã tạm dừng tra cứu');
      commitJob(activeJob);
    }
  };

  const resumeJob = () => {
    const activeJob = jobRef.current;
    if (!activeJob) return;
    activeJob.status = 'running';
    activeJob.cooldownUntil = activeJob.cooldownUntil && activeJob.cooldownUntil > Date.now() ? activeJob.cooldownUntil : null;
    pushLog(activeJob, 'info', 'Tiếp tục tra cứu');
    commitJob(activeJob);
    startLoop();
  };

  const resetJob = () => {
    if (running) {
      window.alert('Vui lòng tạm dừng trước khi xóa tiến trình.');
      return;
    }
    if (!window.confirm('Xóa toàn bộ tiến trình tra cứu đã lưu? (Kết quả đã lưu vào CSDL vẫn được giữ nguyên)')) return;
    runningRef.current = false;
    jobRef.current = null;
    setJob(null);
    setWaitInfo(null);
    setCurrent(null);
    setSetupError('');
    clearZaloUserIdJob();
  };

  const hasJob = Boolean(job);
  const hasPending = stats.pending > 0;
  const configLocked = running || hasPending;
  const scopeStudents = getScopeStudents();
  const selectedStudentExists = students.some((student) => student.mahv === selectedStudentId);

  const logRows = job?.log || [];

  if (!open) return null;

  return createPortal(
    <div className="zuf-overlay">
      <div className="zuf-modal">
        <div className="zuf-header">
          <div className="zuf-title">
            <span className="zuf-title-icon"><UserSearch size={18} /></span>
            <div>
              <h3>Lấy Zalo User ID</h3>
              <p>Tra cứu theo SĐT mẹ → SĐT ba. Tự nghỉ khi Zalo giới hạn lượt và tự tiếp tục khi hết giới hạn.</p>
            </div>
          </div>
          <button type="button" className="zuf-close" onClick={onClose} title="Đóng">
            <X size={18} />
          </button>
        </div>

        <div className="zuf-body">
          <div className="zuf-config">
            <div className="zuf-field">
              <label>Phạm vi</label>
              <select value={scope} onChange={(event) => setScope(event.target.value)} disabled={configLocked}>
                <option value="all">Tất cả học viên ({students.length})</option>
                <option value="filtered">Danh sách đang lọc ({filteredStudents.length})</option>
                <option value="selected" disabled={!selectedStudentExists}>
                  Học viên đang chọn ({selectedStudentExists ? selectedStudentId : 'chưa chọn'})
                </option>
              </select>
            </div>

            <div className="zuf-field zuf-field-sm">
              <label>Giới hạn / giờ</label>
              <input
                type="number"
                min={1}
                max={200}
                value={hourlyLimit}
                onChange={(event) => setHourlyLimit(event.target.value)}
                disabled={configLocked}
              />
            </div>

            <div className="zuf-field zuf-field-sm">
              <label>Nghỉ giữa 2 lần (giây)</label>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={throttleSec}
                onChange={(event) => setThrottleSec(event.target.value)}
                disabled={configLocked}
              />
            </div>

            <div className="zuf-field zuf-checks">
              <label className="zuf-check">
                <input
                  type="checkbox"
                  checked={onlyMissing}
                  onChange={(event) => setOnlyMissing(event.target.checked)}
                  disabled={configLocked}
                />
                <span>Chỉ học viên chưa có Zalo ID</span>
              </label>
              <label className="zuf-check">
                <input
                  type="checkbox"
                  checked={useCache}
                  onChange={(event) => setUseCache(event.target.checked)}
                  disabled={configLocked}
                />
                <span>Dùng lại kết quả đã tra (tiết kiệm lượt)</span>
              </label>
            </div>
          </div>

          <div className="zuf-quota">
            <div className="zuf-quota-head">
              <span className="zuf-quota-title">
                <MessageCircle size={14} /> Hạn mức tra cứu
              </span>
              <span className="zuf-quota-value">
                {quota.used}/{quota.limit} lượt trong 60 phút
                {quota.resetAt ? ` • mở lại sau ${formatDuration(quota.resetAt - nowTick)}` : ` • còn ${quota.remaining} lượt`}
              </span>
            </div>
            <div className="zuf-quota-bar">
              <div
                className={`zuf-quota-fill ${quota.remaining === 0 ? 'is-full' : ''}`}
                style={{ width: `${Math.min(100, Math.round((quota.used / quota.limit) * 100))}%` }}
              />
            </div>
          </div>

          {setupError && (
            <div className="zuf-banner is-error">
              <AlertCircle size={16} />
              <span>{setupError}</span>
            </div>
          )}

          {waitInfo && (
            <div className={`zuf-banner is-warning ${waitInfo.reason === 'quota' ? 'is-quota' : ''}`}>
              <Clock size={16} />
              <span>
                {waitInfo.reason === 'quota'
                  ? 'Đã chạm hạn mức tìm kiếm theo giờ của Zalo'
                  : 'Zalo đang tạm giới hạn tra cứu'}{' '}
                — tự động tiếp tục sau <strong>{formatDuration(waitSeconds * 1000)}</strong>
              </span>
            </div>
          )}

          {!waitInfo && current && running && (
            <div className="zuf-banner is-info">
              <Loader2 size={16} className="zuf-spin" />
              <span>
                Đang tra {current.phone} ({current.type}) — {current.tenhv} ({current.mahv})
              </span>
            </div>
          )}

          {!hasJob && !setupError && (
            <div className="zuf-banner is-info">
              <MessageCircle size={16} />
              <span>
                Sẽ tra {scopeStudents.length} học viên trong phạm vi đã chọn
                {onlyMissing ? ' (bỏ qua học viên đã có Zalo ID)' : ''}.
              </span>
            </div>
          )}

          {hasJob && (
            <>
              <div className="zuf-stats">
                <div className="zuf-stat">
                  <strong>{stats.total}</strong>
                  <span>Tổng</span>
                </div>
                <div className="zuf-stat is-ok">
                  <strong>{stats.found}</strong>
                  <span>Thành công</span>
                </div>
                <div className="zuf-stat">
                  <strong>{stats.notFound}</strong>
                  <span>Không thấy</span>
                </div>
                <div className="zuf-stat is-warn">
                  <strong>{stats.blocked}</strong>
                  <span>Bị chặn</span>
                </div>
                <div className="zuf-stat is-err">
                  <strong>{stats.failed}</strong>
                  <span>Lỗi</span>
                </div>
              </div>

              <div className="zuf-progress">
                <div className="zuf-progress-bar">
                  <div className="zuf-progress-fill" style={{ width: `${stats.percent}%` }} />
                </div>
                <span className="zuf-progress-text">
                  {stats.done}/{stats.total} ({stats.percent}%)
                  {job?.status === 'finished' ? ' • đã hoàn tất' : running ? ' • đang chạy' : ' • đang tạm dừng'}
                </span>
              </div>
            </>
          )}

          <div className="zuf-actions">
            {running ? (
              <button type="button" className="zuf-btn is-warning" onClick={pauseJob}>
                <Pause size={15} /> Tạm dừng
              </button>
            ) : (
              <button
                type="button"
                className="zuf-btn is-primary"
                onClick={hasPending ? resumeJob : startJob}
                disabled={!students.length}
              >
                <Play size={15} /> {hasPending ? 'Tiếp tục tìm' : 'Bắt đầu tìm'}
              </button>
            )}
            <button type="button" className="zuf-btn is-ghost" onClick={resetJob} disabled={running || (!hasJob && !setupError)}>
              <Trash2 size={15} /> Xóa tiến trình
            </button>
            <span className="zuf-actions-note">
              {running ? 'Có thể đóng cửa sổ, quá trình vẫn tiếp tục chạy nền.' : ''}
            </span>
          </div>

          {logRows.length > 0 && (
            <div className="zuf-log">
              {logRows.map((entry, index) => (
                <div key={`${entry.ts}-${index}`} className={`zuf-log-row is-${entry.type}`}>
                  {entry.type === 'success' && <CheckCircle2 size={14} />}
                  {entry.type === 'warn' && <AlertTriangle size={14} />}
                  {entry.type === 'error' && <AlertCircle size={14} />}
                  {entry.type === 'info' && <MessageCircle size={14} />}
                  {entry.type === 'muted' && <Clock size={14} />}
                  <span className="zuf-log-time">{formatTime(entry.ts)}</span>
                  <span className="zuf-log-text">{entry.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
