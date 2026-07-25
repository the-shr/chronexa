'use strict';

const { app } = require('electron');

const paths = require('./paths');
const { JsonStore } = require('./jsonstore');

// The server the agent talks to. An installed build points at the deployment;
// running from source (npm run dev) points at the local server. CHRONEXA_SERVER
// overrides both, for testing an installer against a staging server.
const PRODUCTION_SERVER = 'https://chronexa-psi.vercel.app';
function defaultServerUrl() {
  if (process.env.CHRONEXA_SERVER) return process.env.CHRONEXA_SERVER;
  return app?.isPackaged ? PRODUCTION_SERVER : 'http://localhost:3000';
}

/**
 * Every knob the user asked to be configurable lives here. Defaults are chosen
 * to be reasonable for an 8-hour office day.
 */
const DEFAULTS = {
  screenshots: {
    enabled: true,
    intervalMinutes: 10, // capture once per this window
    randomize: true, // pick a random moment inside the window instead of the edge
    quality: 60, // JPEG quality 1-100
    maxWidth: 1600, // downscale wide screens to keep files small
    allMonitors: true, // capture every display, not just the primary
    blur: false, // privacy blur before saving
  },
  recording: {
    // Off unless an admin turns it on. Like screenshots, nothing about this
    // reaches the renderer -- see publicView().
    enabled: false,
    // 'interval' takes a short clip every so often; 'session' records
    // continuously for as long as someone is working.
    mode: 'interval',
    intervalMinutes: 3, // record once per this window
    durationSeconds: 5, // how long each clip runs, in interval mode
    segmentMinutes: 5, // how long each piece runs, in session mode
    maxWidth: 1280, // downscale before encoding; video is bulky
    frameRate: 12, // enough to follow what is happening, a third the size of 30
  },
  idle: {
    enabled: true,
    thresholdMinutes: 5, // no mouse/keyboard for this long => idle
    warningEnabled: true, // show the "are you still there?" window
    warningCountdownSeconds: 60, // how long that window waits for a response
    // 'pause' keeps the session open and resumes by itself as soon as the
    // employee touches the mouse again; 'stop' ends the session outright.
    onTimeout: 'pause',
    // Active and idle seconds are always recorded separately. This only decides
    // whether idle counts towards the work total the employee is credited with.
    countIdleAsWork: false,
    playSound: true,
  },
  work: {
    // All set by the organisation and pushed down by the server -- see
    // lib/policy.js. 0 means no target, in which case the dashboard shows
    // elapsed time without implying progress towards anything.
    dailyTargetHours: 8,
    weeklyTargetHours: 40,
    officeStart: '09:00',
    officeEnd: '17:00',
    workDays: '1,2,3,4,5',
  },
  general: {
    theme: 'dark', // 'dark' | 'light'
    launchOnLogin: false,
    startTrackingOnLaunch: false,
    minimizeToTray: true,
  },
  sync: {
    enabled: false,
    serverUrl: defaultServerUrl(),
    intervalSeconds: 60,
    uploadScreenshots: true,
  },
};

const RANGES = {
  'work.dailyTargetHours': [0, 24],
  'work.weeklyTargetHours': [0, 168],
  'screenshots.intervalMinutes': [1, 120],
  'screenshots.quality': [10, 100],
  'screenshots.maxWidth': [640, 3840],
  'recording.intervalMinutes': [1, 240],
  'recording.durationSeconds': [2, 60],
  'recording.segmentMinutes': [1, 30],
  'recording.maxWidth': [640, 1920],
  'recording.frameRate': [5, 30],
  'idle.thresholdMinutes': [1, 60],
  'idle.warningCountdownSeconds': [10, 600],
  'sync.intervalSeconds': [15, 3600],
};

function clamp(value, [min, max]) {
  return Math.min(max, Math.max(min, value));
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Deep-merge stored settings over the defaults so new keys appear on upgrade. */
function merge(defaults, stored) {
  const out = {};
  for (const [key, def] of Object.entries(defaults)) {
    const val = stored?.[key];
    if (isPlainObject(def)) out[key] = merge(def, isPlainObject(val) ? val : {});
    else out[key] = val === undefined || typeof val !== typeof def ? def : val;
  }
  return out;
}

function validate(settings) {
  const s = merge(DEFAULTS, settings);
  for (const [dotted, range] of Object.entries(RANGES)) {
    const [group, key] = dotted.split('.');
    s[group][key] = clamp(Math.round(s[group][key]), range);
  }
  if (!['pause', 'stop'].includes(s.idle.onTimeout)) s.idle.onTimeout = 'pause';
  if (!['interval', 'session'].includes(s.recording.mode)) s.recording.mode = 'interval';
  if (!['dark', 'light'].includes(s.general.theme)) s.general.theme = 'dark';
  s.sync.serverUrl = String(s.sync.serverUrl || '').replace(/\/+$/, '');
  return s;
}

let store = null;
const listeners = new Set();

function init() {
  store = new JsonStore(paths.settingsFile(), DEFAULTS, { debounceMs: 0 });
  store.write(validate(store.read()));
}

function get() {
  return store.read();
}

/** Groups the employee is allowed to change from the UI. */
const EMPLOYEE_EDITABLE = ['general'];

/**
 * What the renderer is allowed to see. Capture configuration is omitted
 * entirely -- not merely hidden in the UI -- so opening devtools reveals
 * nothing about it. The idle values are included because the app explains
 * them to the employee.
 */
function publicView() {
  const s = get();
  return {
    general: { ...s.general },
    work: { ...s.work },
    idle: {
      enabled: s.idle.enabled,
      thresholdMinutes: s.idle.thresholdMinutes,
      onTimeout: s.idle.onTimeout,
      countIdleAsWork: s.idle.countIdleAsWork,
    },
  };
}

/**
 * Applies only the groups an employee may change. Monitoring policy is set by
 * the organisation, so a patch touching anything else is ignored rather than
 * trusted -- the renderer is the one surface an employee can reach.
 */
function setFromRenderer(patch) {
  const allowed = Object.fromEntries(Object.entries(patch || {}).filter(([group]) => EMPLOYEE_EDITABLE.includes(group)));
  set(allowed);
  return publicView();
}

/** Patch is a partial settings tree; returns the full validated result. */
function set(patch) {
  const next = validate(merge(get(), patch));
  store.write(next);
  store.flush();
  for (const fn of listeners) fn(next);
  return next;
}

function reset() {
  return set(structuredClone(DEFAULTS));
}

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

module.exports = { init, get, set, reset, onChange, publicView, setFromRenderer, DEFAULTS };
