'use strict';

/**
 * Short screen clips, recorded while the tracker runs.
 *
 * Invisible to the employee by construction, the same way screenshots are:
 * the settings group never reaches the renderer (see settings.publicView), no
 * event is broadcast, and the tracker snapshot says nothing about it. The one
 * visible artefact would be the capture indicator some systems show, which is
 * why the stream is released the instant a clip finishes rather than held open
 * between them.
 *
 * Encoding needs a DOM, so a hidden window does that part and hands the bytes
 * back. This module owns that window, the schedule, and the retry queue.
 */

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { BrowserWindow, ipcMain, desktopCapturer, screen } = require('electron');

const paths = require('./paths');
const settings = require('./settings');
const log = require('./log');

const RECORDER_HTML = path.join(__dirname, '..', 'recorder', 'index.html');
const RECORDER_PRELOAD = path.join(__dirname, '..', 'recorder', 'preload.js');

// A clip that never comes back must not wedge the scheduler forever.
const JOB_TIMEOUT_MS = 90_000;

const events = new EventEmitter();

let win = null;
let timer = null;
let sessionId = null;
let jobSeq = 0;
const pending = new Map();

/* ------------------------------- the window ----------------------------- */

function ensureWindow() {
  if (win && !win.isDestroyed()) return win;

  win = new BrowserWindow({
    show: false,
    width: 320,
    height: 240,
    skipTaskbar: true,
    // Not just hidden: never focusable, never in a window list the employee
    // could stumble across.
    focusable: false,
    webPreferences: {
      preload: RECORDER_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      // Keeps encoding running at full speed while the window is hidden;
      // otherwise Chromium throttles it and clips come out stuttering.
      backgroundThrottling: false,
    },
  });

  win.loadFile(RECORDER_HTML);
  win.on('closed', () => {
    win = null;
  });

  return win;
}

function destroyWindow() {
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
}

/* -------------------------------- one clip ------------------------------ */

/** The screen to record: the display the employee is actually looking at. */
async function pickSource() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1, height: 1 },
  });
  if (!sources.length) throw new Error('No screen sources available');

  // With several monitors, follow the cursor rather than always taking the
  // first display, which is often not the one being worked on.
  if (sources.length > 1) {
    try {
      const point = screen.getCursorScreenPoint();
      const active = screen.getDisplayNearestPoint(point);
      const match = sources.find((s) => String(s.display_id) === String(active.id));
      if (match) return match;
    } catch {
      /* fall through to the first source */
    }
  }
  return sources[0];
}

/** Records one clip and writes it to disk. Returns a row for the caller. */
async function captureOnce() {
  const cfg = settings.get().recording;
  const source = await pickSource();
  const target = ensureWindow();

  // The window may still be loading on the very first clip.
  if (target.webContents.isLoading()) {
    await new Promise((resolve) => target.webContents.once('did-finish-load', resolve));
  }

  const jobId = `job-${++jobSeq}`;
  const startedAt = new Date();

  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(jobId);
      reject(new Error('The recorder did not answer in time'));
    }, JOB_TIMEOUT_MS);

    pending.set(jobId, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });

    target.webContents.send('recorder:record', {
      jobId,
      sourceId: source.id,
      durationMs: cfg.durationSeconds * 1000,
      maxWidth: cfg.maxWidth,
      frameRate: cfg.frameRate,
    });
  });

  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const folder = paths.ensureDir(path.join(paths.recordingDir(), stamp.slice(0, 10)));
  const filePath = path.join(folder, `${stamp}.webm`);
  fs.writeFileSync(filePath, Buffer.from(result.bytes));

  return {
    id: stamp,
    sessionId,
    startedAt: startedAt.toISOString(),
    durationMs: result.durationMs,
    width: result.width,
    height: result.height,
    filePath,
    bytes: fs.statSync(filePath).size,
    uploaded: false,
  };
}

/* ------------------------------- scheduling ----------------------------- */

function scheduleNext() {
  clearTimeout(timer);
  const cfg = settings.get().recording;
  if (!cfg.enabled || !sessionId) return;

  // Spread clips randomly through the window rather than on the tick, so they
  // do not land at predictable moments.
  const windowMs = cfg.intervalMinutes * 60_000;
  const delay = Math.round(windowMs * (0.5 + Math.random() * 0.5));

  timer = setTimeout(async () => {
    if (!sessionId) return;
    try {
      const row = await captureOnce();
      events.emit('clip', row);
      log.info('recording: captured', row.id, `${Math.round(row.bytes / 1024)}kb`);
    } catch (err) {
      // A failed clip is not worth interrupting anyone over; try again next
      // window rather than retrying tightly and burning the machine's CPU.
      log.warn('recording: failed —', err.message);
    }
    scheduleNext();
  }, delay);
}

/** Called when a tracking session starts. */
function start(id) {
  sessionId = id;
  if (!settings.get().recording.enabled) return;
  ensureWindow();
  scheduleNext();
}

/** Called when tracking stops or pauses -- no one is working, nothing to see. */
function stop() {
  sessionId = null;
  clearTimeout(timer);
  timer = null;
  // Tear the window down rather than leaving it idling: it costs a renderer
  // process, and it must not outlive the reason it exists.
  destroyWindow();
}

function init() {
  ipcMain.on('recorder:done', (_event, { jobId, ...result }) => {
    pending.get(jobId)?.resolve(result);
    pending.delete(jobId);
  });

  ipcMain.on('recorder:failed', (_event, { jobId, error }) => {
    pending.get(jobId)?.reject(new Error(error));
    pending.delete(jobId);
  });

  // Turning it off mid-session must take effect now, not at the next clip.
  settings.onChange(() => {
    const on = settings.get().recording.enabled;
    if (!on) {
      clearTimeout(timer);
      timer = null;
      destroyWindow();
    } else if (sessionId && !timer) {
      ensureWindow();
      scheduleNext();
    }
  });
}

function remove(row) {
  try {
    fs.unlinkSync(row.filePath);
  } catch {
    /* already gone */
  }
}

module.exports = {
  init,
  start,
  stop,
  remove,
  captureOnce,
  on: (event, fn) => events.on(event, fn),
};
