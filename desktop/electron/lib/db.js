'use strict';

const paths = require('./paths');
const { JsonStore } = require('./jsonstore');

/**
 * Local record of everything the agent has captured. Kept as JSON so the app
 * has zero native dependencies; the surface below is intentionally
 * SQLite-shaped so it can be swapped later without changing callers.
 */
let sessions = null;
let screenshots = null;
let outbox = null;

function init() {
  sessions = new JsonStore(paths.sessionsFile(), { rows: [] });
  screenshots = new JsonStore(paths.screenshotsFile(), { rows: [] });
  outbox = new JsonStore(paths.outboxFile(), { rows: [] });
}

function flush() {
  sessions?.flush();
  screenshots?.flush();
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
 * Total tracked seconds for a calendar day in the local timezone. `excludeId`
 * lets the tracker leave out the live session, whose persisted row is always a
 * few seconds behind its in-memory counter.
 */
function secondsOnDay(date = new Date(), { excludeId = null } = {}) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86400000);
  return sessions
    .read()
    .rows.filter((r) => {
      if (r.id === excludeId) return false;
      const t = new Date(r.startedAt).getTime();
      return t >= start.getTime() && t < end.getTime();
    })
    .reduce((sum, r) => sum + (r.activeSeconds || 0), 0);
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

/* -------------------------------- outbox -------------------------------- */

function enqueue(item) {
  outbox.update((data) => {
    data.rows.push({ ...item, queuedAt: new Date().toISOString(), attempts: 0 });
    return data;
  });
}

function peekOutbox(limit = 20) {
  return outbox.read().rows.slice(0, limit);
}

function dropOutbox(ids) {
  const set = new Set(ids);
  outbox.update((data) => {
    data.rows = data.rows.filter((r) => !set.has(r.id));
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
  upsertSession,
  listSessions,
  getSession,
  secondsOnDay,
  addScreenshots,
  listScreenshots,
  getScreenshot,
  removeScreenshot,
  markScreenshotUploaded,
  pendingScreenshots,
  enqueue,
  peekOutbox,
  dropOutbox,
  bumpAttempts,
};
