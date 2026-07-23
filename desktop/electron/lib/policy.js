'use strict';

/**
 * Pulls the organisation's policy from the server and applies it locally.
 *
 * Monitoring policy is the organisation's decision, not the machine's. Before
 * this, everything lived in settings.json on the employee's own computer: an
 * admin could not change it without visiting the machine, and anyone willing to
 * open the file could change what was monitored. The server is now the source
 * of truth for those groups, and this overwrites them on every fetch.
 *
 * What is deliberately *not* overwritten is `general` -- theme, launch on
 * login, minimise to tray. Those are the employee's own preferences and no
 * business of the server's.
 */

const { EventEmitter } = require('node:events');

const settings = require('./settings');
const auth = require('./auth');
const log = require('./log');

const events = new EventEmitter();
const REFRESH_MS = 5 * 60 * 1000;

let timer = null;
let lastVersion = null;

function base() {
  return settings.get().sync.serverUrl;
}

/** Fetches and applies. Returns the policy, or null if it could not be read. */
async function refresh() {
  if (!auth.isSignedIn() || !settings.get().sync.enabled) return null;

  let policy;
  try {
    const res = await fetch(`${base()}/api/agent/policy`, { headers: auth.authHeaders() });
    if (res.status === 401) {
      auth.markExpired('the policy request was refused');
      return null;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    policy = await res.json();
  } catch (err) {
    // Keep running on the last policy rather than falling back to defaults --
    // a flaky network must not quietly switch monitoring off.
    log.warn('policy: could not refresh —', err.message);
    return null;
  }

  apply(policy);
  return policy;
}

function apply(policy) {
  if (!policy?.work) return;

  const changed = policy.version !== lastVersion;
  lastVersion = policy.version;

  settings.set({
    work: {
      dailyTargetHours: policy.work.dailyTargetHours,
      weeklyTargetHours: policy.work.weeklyTargetHours,
      officeStart: policy.work.officeStart,
      officeEnd: policy.work.officeEnd,
      workDays: policy.work.workDays,
    },
    idle: {
      thresholdMinutes: policy.idle.thresholdMinutes,
      onTimeout: policy.idle.onTimeout,
      countIdleAsWork: policy.idle.countIdleAsWork,
    },
    screenshots: policy.screenshots,
    recording: policy.recording,
  });

  if (changed) {
    log.info('policy: applied version', policy.version);
    events.emit('applied', policy);
  }
}

function start() {
  clearInterval(timer);
  refresh().catch(() => {});
  timer = setInterval(() => refresh().catch(() => {}), REFRESH_MS);
}

function stop() {
  clearInterval(timer);
  timer = null;
}

function init() {
  // A fresh sign-in must pick the policy up at once rather than waiting out the
  // refresh interval -- otherwise the first session runs on stale settings.
  auth.on('changed', (status) => {
    if (status.signedIn) refresh().catch(() => {});
  });
}

module.exports = { init, start, stop, refresh, on: (event, fn) => events.on(event, fn) };
