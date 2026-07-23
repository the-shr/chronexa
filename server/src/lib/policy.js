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

/**
 * The keys a person may override, and how to validate each. Everything an admin
 * can set org-wide can also be set per person, including the monitoring
 * switches -- that is what lets one employee be tracked with no screenshots and
 * no recording while the rest are captured normally.
 */
const OVERRIDE_KINDS = {
  dailyTargetHours: 'number',
  weeklyTargetHours: 'number',
  officeStart: 'time',
  officeEnd: 'time',
  idleThresholdMinutes: 'number',
  idleOnTimeout: 'idleAction',
  countIdleAsWork: 'boolean',
  screenshotsEnabled: 'boolean',
  screenshotIntervalMinutes: 'number',
  recordingEnabled: 'boolean',
  recordingMode: 'recordingMode',
  recordingIntervalMinutes: 'number',
  recordingDurationSeconds: 'number',
  recordingSegmentMinutes: 'number',
};

function validateOverrideValue(key, value) {
  switch (OVERRIDE_KINDS[key]) {
    case 'number': {
      const n = clampNumber(key, value);
      return n === null ? { error: `${key} must be a number` } : { value: n };
    }
    case 'time':
      return TIME.test(String(value)) ? { value: String(value) } : { error: `${key} must look like 09:00` };
    case 'boolean':
      return { value: Boolean(value) };
    case 'idleAction':
      return IDLE_ACTIONS.includes(value) ? { value } : { error: 'Unknown idle action' };
    case 'recordingMode':
      return RECORDING_MODES.includes(value) ? { value } : { error: 'Unknown recording mode' };
    default:
      return { error: `${key} cannot be overridden` };
  }
}

/**
 * Sets or clears one person's overrides. A key set to null clears just that
 * one; passing `{ clear: true }` drops all of them back to the team default.
 */
export async function setUserOverride(userId, patch) {
  const user = await prisma.user.findUnique({ where: { id: String(userId || '') }, select: { id: true, overrides: true } });
  if (!user) return { error: 'That employee no longer exists' };

  if (patch.clear) {
    const updated = await prisma.user.update({ where: { id: user.id }, data: { overrides: null }, select: { id: true, name: true, overrides: true } });
    return { user: updated };
  }

  const next = { ...(user.overrides || {}) };
  let touched = false;

  for (const [key, raw] of Object.entries(patch)) {
    if (!(key in OVERRIDE_KINDS)) continue;
    touched = true;
    if (raw === null || raw === '') {
      delete next[key];
      continue;
    }
    const result = validateOverrideValue(key, raw);
    if (result.error) return { error: result.error };
    next[key] = result.value;
  }

  if (!touched) return { error: 'Nothing to change' };

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { overrides: Object.keys(next).length ? next : null },
    select: { id: true, name: true, overrides: true },
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
    prisma.user.findUnique({ where: { id: String(userId) }, select: { overrides: true } }),
  ]);

  // A person's override wins over the org default for any key it sets.
  const o = user?.overrides || {};
  const pick = (key) => (o[key] === undefined ? policy[key] : o[key]);

  return {
    version: `${policy.updatedAt.toISOString()}:${JSON.stringify(o)}`,
    work: {
      dailyTargetHours: pick('dailyTargetHours'),
      weeklyTargetHours: pick('weeklyTargetHours'),
      officeStart: pick('officeStart'),
      officeEnd: pick('officeEnd'),
      workDays: policy.workDays,
    },
    idle: {
      thresholdMinutes: pick('idleThresholdMinutes'),
      onTimeout: pick('idleOnTimeout'),
      countIdleAsWork: pick('countIdleAsWork'),
    },
    screenshots: {
      enabled: pick('screenshotsEnabled'),
      intervalMinutes: pick('screenshotIntervalMinutes'),
      randomize: policy.screenshotRandomize,
      quality: policy.screenshotQuality,
      allMonitors: policy.screenshotAllMonitors,
      blur: policy.screenshotBlur,
    },
    recording: {
      enabled: pick('recordingEnabled'),
      mode: pick('recordingMode'),
      intervalMinutes: pick('recordingIntervalMinutes'),
      durationSeconds: pick('recordingDurationSeconds'),
      segmentMinutes: pick('recordingSegmentMinutes'),
      maxWidth: policy.recordingMaxWidth,
      frameRate: policy.recordingFrameRate,
    },
  };
}

/** The override fields, so the UI knows what it may set per person. */
export const OVERRIDE_KEYS = Object.keys(OVERRIDE_KINDS);

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
