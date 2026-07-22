'use strict';

const paths = require('./paths');
const { JsonStore } = require('./jsonstore');

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
    notifyOnCapture: true, // toast the employee so capture is never a secret
  },
  idle: {
    enabled: true,
    thresholdMinutes: 5, // no mouse/keyboard for this long => idle
    warningEnabled: true, // show the "are you still there?" window
    warningCountdownSeconds: 60, // how long that window waits for a response
    onTimeout: 'stop', // 'stop' = stop the tracker | 'keep' = keep running
    discardIdleTime: true, // do not bill the idle stretch
    playSound: true,
  },
  general: {
    launchOnLogin: false,
    startTrackingOnLaunch: false,
    minimizeToTray: true,
    confirmOnStop: false,
  },
  sync: {
    enabled: false,
    serverUrl: 'http://localhost:3000',
    intervalSeconds: 60,
    uploadScreenshots: true,
  },
};

const RANGES = {
  'screenshots.intervalMinutes': [1, 120],
  'screenshots.quality': [10, 100],
  'screenshots.maxWidth': [640, 3840],
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
  if (!['stop', 'keep'].includes(s.idle.onTimeout)) s.idle.onTimeout = 'stop';
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

module.exports = { init, get, set, reset, onChange, DEFAULTS };
