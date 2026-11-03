'use strict';

const paths = require('./paths');
const { dayBounds } = require('./workday');
const { dutyDayFor } = require('./check-ins-core.cjs');
const { JsonStore } = require('./jsonstore');

/**
 * Local record of everything the agent has captured. Kept as JSON so the app
 * has zero native dependencies; the surface below is intentionally
 * SQLite-shaped so it can be swapped later without changing callers.
 */
let sessions = null;
let screenshots = null;
let recordings = null;
let outbox = null;

function init() {
  sessions = new JsonStore(paths.sessionsFile(), { rows: [] });
  screenshots = new JsonStore(paths.screenshotsFile(), { rows: [] });
  recordings = new JsonStore(paths.recordingsFile(), { rows: [] });
  outbox = new JsonStore(paths.outboxFile(), { rows: [] });
  // Close sessions left open by a power cut at their last saved checkpoint.
  // Never credit the unobserved time between the checkpoint and next launch.
  for (const row of [...sessions.read().rows]) {
    if (row.endedAt && !(row.pendingIdleSeconds > 0)) continue;
    const moved = Math.min(row.pendingIdleSeconds || 0, row.activeSeconds || 0);
    const fallbackEnd = new Date(new Date(row.startedAt).getTime() + ((row.activeSeconds || 0) + (row.idleSeconds || 0)) * 1000);
    const end = row.checkpointAt ? new Date(row.checkpointAt) : fallbackEnd;
    const safeEnd = Number.isNaN(end.getTime()) || end < new Date(row.startedAt) ? new Date(row.startedAt) : end;
    const recovered = { ...row, endedAt: row.endedAt || safeEnd.toISOString(), stopReason: row.stopReason || 'interrupted', activeSeconds: (row.activeSeconds || 0) - moved, idleSeconds: (row.idleSeconds || 0) + moved, pendingIdleSeconds: 0, synced: false };
    upsertSession(recovered);
    enqueue({ id: `session:${row.id}`, type: 'session', payload: recovered });
  }
  flush();
}

function flush() {
  sessions?.flush();
  screenshots?.flush();
  recordings?.flush();
  outbox?.flush();
}
function flushTracking() {
  sessions?.flush();
  outbox?.flush();
}

/* ------------------------------- sessions ------------------------------- */

function upsertSession(session) {
  sessions.update((data) => {
    const i = data.rows.findIndex((r) => r.id === session.id);
    if (i === -1) data.rows.unshift(session);
    else data.rows[i] = { ...data.rows[i], ...session };
    return data;
  });
  return session;
}

function listSessions({ limit = 100, since = null } = {}) {
  return sessions
    .read()
    .rows.filter((r) => (since ? r.startedAt >= since : true))
    .slice(0, limit);
}

function getSession(id) {
  return sessions.read().rows.find((r) => r.id === id) || null;
}


/**
 * Active and idle seconds for a calendar day in the local timezone. `excludeId`
 * lets the tracker leave out the live session, whose persisted row is always a
 * few seconds behind its in-memory counter.
 */
function totalsOnDay(date = new Date(), { excludeId = null, work = null } = {}) {
  const [start, end] = dayBounds(date);
  const key = new Date(start + 21600000).toISOString().slice(0, 10);
  return sessions.read().rows.reduce(
    (totals, r) => {
      if (r.id === excludeId) return totals;
      const t = new Date(r.startedAt).getTime();
      if (work ? dutyDayFor(r.startedAt, work) !== key : t < start || t >= end) return totals;
      totals.activeSeconds += r.activeSeconds || 0;
      totals.idleSeconds += r.idleSeconds || 0;
      return totals;
    },
    { activeSeconds: 0, idleSeconds: 0 },
  );
}

/** Per-day totals for the last `days` days, oldest first -- feeds the weekly chart. */
function dailyTotals(days = 7, { excludeId = null, work = null } = {}) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    out.push({ date: date.toISOString(), ...totalsOnDay(date, { excludeId, work }) });
  }
  return out;
}

/* ------------------------------ screenshots ----------------------------- */

function addScreenshots(rows) {
  if (!rows.length) return;
  screenshots.update((data) => {
    data.rows.unshift(...rows);
    return data;
  });
}

function listScreenshots({ sessionId = null, limit = 60 } = {}) {
  return screenshots
    .read()
    .rows.filter((r) => (sessionId ? r.sessionId === sessionId : true))
    .slice(0, limit);
}

function getScreenshot(id) {
  return screenshots.read().rows.find((r) => r.id === id) || null;
}

function removeScreenshot(id) {
  let removed = null;
  screenshots.update((data) => {
    const i = data.rows.findIndex((r) => r.id === id);
    if (i !== -1) [removed] = data.rows.splice(i, 1);
    return data;
  });
  screenshots.flush();
  return removed;
}

function markScreenshotUploaded(id, remoteUrl) {
  screenshots.update((data) => {
    const row = data.rows.find((r) => r.id === id);
    if (row) {
      row.uploaded = true;
      row.remoteUrl = remoteUrl || null;
    }
    return data;
  });
}

function pendingScreenshots(limit = 10) {
  return screenshots
    .read()
    .rows.filter((r) => !r.uploaded)
    .slice(-limit);
}

/* ------------------------------ recordings ------------------------------ */

function addRecording(row) {
  recordings.update((data) => {
    data.rows.unshift(row);
    return data;
  });
}

function getRecording(id) {
  return recordings.read().rows.find((r) => r.id === id) || null;
}

function markRecordingUploaded(id) {
  recordings.update((data) => {
    const row = data.rows.find((r) => r.id === id);
    if (row) row.uploaded = true;
    return data;
  });
}

function removeRecording(id) {
  let removed = null;
  recordings.update((data) => {
    const i = data.rows.findIndex((r) => r.id === id);
    if (i !== -1) [removed] = data.rows.splice(i, 1);
    return data;
  });
  recordings.flush();
  return removed;
}

/**
 * Clips already uploaded are dead weight on the employee's disk -- each is a
 * megabyte or so and the server has them. Returns the rows to delete.
 */
function drainUploadedRecordings(keep = 5) {
  const done = recordings.read().rows.filter((r) => r.uploaded);
  if (done.length <= keep) return [];
  const stale = done.slice(keep);
  recordings.update((data) => {
    data.rows = data.rows.filter((r) => !stale.some((s) => s.id === r.id));
    return data;
  });
  return stale;
}

/* -------------------------------- outbox -------------------------------- */

function enqueue(item) {
  outbox.update((data) => {
    const existing = data.rows.findIndex((row) => row.id === item.id);
    const next = { ...item, payload: { ...item.payload }, queuedAt: new Date().toISOString(), attempts: 0 };
    if (existing < 0) data.rows.push(next);
    else data.rows[existing] = next;
    return data;
  });
}

function peekOutbox(limit = 20) {
  return outbox.read().rows.slice(0, limit);
}

function dropOutbox(ids) {
  const set = new Set(ids.map((item) => typeof item === 'string' ? item : item.id));
  const sent = new Map(ids.filter((item) => typeof item !== 'string').map((item) => [item.id, JSON.stringify(item.payload)]));
  outbox.update((data) => {
    data.rows = data.rows.filter((r) => !set.has(r.id) || (sent.has(r.id) && JSON.stringify(r.payload) !== sent.get(r.id)));
    return data;
  });
}

function bumpAttempts(ids) {
  const set = new Set(ids);
  outbox.update((data) => {
    for (const row of data.rows) if (set.has(row.id)) row.attempts += 1;
    return data;
  });
}

module.exports = {
  init,
  flush,
  flushTracking,
  upsertSession,
  listSessions,
  getSession,
  totalsOnDay,
  dailyTotals,
  addScreenshots,
  listScreenshots,
  getScreenshot,
  removeScreenshot,
  markScreenshotUploaded,
  pendingScreenshots,
  addRecording,
  getRecording,
  markRecordingUploaded,
  removeRecording,
  drainUploadedRecordings,
  enqueue,
  peekOutbox,
  dropOutbox,
  bumpAttempts,
};
