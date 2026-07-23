/**
 * What the organisation monitors and expects.
 *
 * One row for the whole team, plus per-person overrides for the few things that
 * genuinely differ (target hours, office times). Monitoring configuration --
 * screenshots and recording -- is deliberately organisation-wide: it is a
 * policy decision, and having it differ silently per person is how a team ends
 * up not knowing what is actually being collected.
 *
 * Agents read their effective policy from here and obey it, so what is
 * monitored can be changed without touching anyone's machine, and cannot be
 * changed by editing a file on an employee's own computer.
 */
import { prisma } from './db.js';

export const RECORDING_MODES = ['interval', 'session'];
export const IDLE_ACTIONS = ['pause', 'stop'];

/** Bounds are the same ones the agent clamps to, kept in step deliberately. */
const RANGES = {
  dailyTargetHours: [0, 24],
  weeklyTargetHours: [0, 168],
  idleThresholdMinutes: [1, 60],
  screenshotIntervalMinutes: [1, 120],
  screenshotQuality: [10, 100],
  recordingIntervalMinutes: [1, 240],
  recordingDurationSeconds: [2, 60],
  recordingSegmentMinutes: [1, 30],
  recordingMaxWidth: [640, 1920],
  recordingFrameRate: [5, 30],
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** The organisation policy, creating the default row the first time. */
export async function getPolicy() {
  return prisma.policy.upsert({ where: { id: 'org' }, create: { id: 'org' }, update: {} });
}

function clampNumber(key, value) {
  const range = RANGES[key];
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (!range) return n;
  return Math.min(range[1], Math.max(range[0], key === 'dailyTargetHours' || key === 'weeklyTargetHours' ? n : Math.round(n)));
}

/**
 * Applies a partial patch. Unknown keys are ignored rather than trusted, and
 * every number is clamped here as well as in the UI -- the UI is not the only
 * way in.
 */
export async function updatePolicy(patch, { updatedById = null } = {}) {
  const data = {};

  for (const key of Object.keys(RANGES)) {
    if (patch[key] === undefined) continue;
    const value = clampNumber(key, patch[key]);
    if (value === null) return { error: `${key} must be a number` };
    data[key] = value;
  }

  for (const key of ['officeStart', 'officeEnd']) {
    if (patch[key] === undefined) continue;
    if (!TIME.test(String(patch[key]))) return { error: `${key} must look like 09:00` };
    data[key] = String(patch[key]);
  }

  if (patch.workDays !== undefined) {
    const days = String(patch.workDays)
      .split(',')
      .map((d) => Number(d.trim()))
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
    if (!days.length) return { error: 'Choose at least one working day' };
    data.workDays = [...new Set(days)].sort().join(',');
  }

  if (patch.idleOnTimeout !== undefined) {
    if (!IDLE_ACTIONS.includes(patch.idleOnTimeout)) return { error: 'Unknown idle action' };
    data.idleOnTimeout = patch.idleOnTimeout;
  }

  if (patch.recordingMode !== undefined) {
    if (!RECORDING_MODES.includes(patch.recordingMode)) return { error: 'Unknown recording mode' };
    data.recordingMode = patch.recordingMode;
  }

  for (const key of [
    'countIdleAsWork',
    'screenshotsEnabled',
    'screenshotRandomize',
    'screenshotAllMonitors',
    'screenshotBlur',
    'recordingEnabled',
  ]) {
    if (patch[key] !== undefined) data[key] = Boolean(patch[key]);
  }

  if (!Object.keys(data).length) return { error: 'Nothing to change' };

  data.updatedById = updatedById;
  const policy = await prisma.policy.upsert({
    where: { id: 'org' },
    create: { id: 'org', ...data },
    update: data,
  });
  return { policy };
}

/** Per-person hours and office times. Null clears an override. */
export async function setUserSchedule(userId, patch) {
  const user = await prisma.user.findUnique({ where: { id: String(userId || '') }, select: { id: true } });
  if (!user) return { error: 'That employee no longer exists' };

  const data = {};

  for (const key of ['dailyTargetHours', 'weeklyTargetHours']) {
    if (patch[key] === undefined) continue;
    if (patch[key] === null || patch[key] === '') {
      data[key] = null;
      continue;
    }
    const value = clampNumber(key, patch[key]);
    if (value === null) return { error: `${key} must be a number` };
    data[key] = value;
  }

  for (const key of ['officeStart', 'officeEnd']) {
    if (patch[key] === undefined) continue;
    if (patch[key] === null || patch[key] === '') {
      data[key] = null;
      continue;
    }
    if (!TIME.test(String(patch[key]))) return { error: `${key} must look like 09:00` };
    data[key] = String(patch[key]);
  }

  if (!Object.keys(data).length) return { error: 'Nothing to change' };

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: {
      id: true,
      name: true,
      dailyTargetHours: true,
      weeklyTargetHours: true,
      officeStart: true,
      officeEnd: true,
    },
  });
  return { user: updated };
}

/**
 * What one agent should actually do: the organisation policy with that
 * employee's overrides applied, shaped like the agent's own settings tree so it
 * can be handed straight to settings.set().
 */
export async function effectivePolicy(userId) {
  const [policy, user] = await Promise.all([
    getPolicy(),
    prisma.user.findUnique({
      where: { id: String(userId) },
      select: { dailyTargetHours: true, weeklyTargetHours: true, officeStart: true, officeEnd: true },
    }),
  ]);

  const pick = (key) => (user?.[key] === null || user?.[key] === undefined ? policy[key] : user[key]);

  return {
    version: policy.updatedAt.toISOString(),
    work: {
      dailyTargetHours: pick('dailyTargetHours'),
      weeklyTargetHours: pick('weeklyTargetHours'),
      officeStart: pick('officeStart'),
      officeEnd: pick('officeEnd'),
      workDays: policy.workDays,
    },
    idle: {
      thresholdMinutes: policy.idleThresholdMinutes,
      onTimeout: policy.idleOnTimeout,
      countIdleAsWork: policy.countIdleAsWork,
    },
    screenshots: {
      enabled: policy.screenshotsEnabled,
      intervalMinutes: policy.screenshotIntervalMinutes,
      randomize: policy.screenshotRandomize,
      quality: policy.screenshotQuality,
      allMonitors: policy.screenshotAllMonitors,
      blur: policy.screenshotBlur,
    },
    recording: {
      enabled: policy.recordingEnabled,
      mode: policy.recordingMode,
      intervalMinutes: policy.recordingIntervalMinutes,
      durationSeconds: policy.recordingDurationSeconds,
      segmentMinutes: policy.recordingSegmentMinutes,
      maxWidth: policy.recordingMaxWidth,
      frameRate: policy.recordingFrameRate,
    },
  };
}

/**
 * A rough guide to what a recording setting will cost in storage, so the choice
 * is made with the number in view rather than discovered when Drive fills.
 * Based on the bitrate the agent encodes at.
 */
export function estimateDailyBytes(policy, { employees = 1, hoursPerDay = 8 } = {}) {
  if (!policy.recordingEnabled) return 0;
  const bitsPerSecond = 600_000;
  const secondsPerDay =
    policy.recordingMode === 'session'
      ? hoursPerDay * 3600
      : (hoursPerDay * 60) / policy.recordingIntervalMinutes * policy.recordingDurationSeconds;
  return Math.round((secondsPerDay * bitsPerSecond) / 8) * employees;
}
