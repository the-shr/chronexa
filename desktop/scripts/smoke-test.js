'use strict';

/**
 * End-to-end check of the tracker state machine, run inside a real Electron
 * main process (headless -- no windows are created).
 *
 *   npm run test:smoke
 *
 * powerMonitor.getSystemIdleTime is stubbed so "the employee walked away" can
 * be simulated instantly instead of waiting five real minutes.
 */
const { app, powerMonitor } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.setPath('userData', path.join(app.getPath('temp'), 'chronexa-smoke'));

let fakeIdleSeconds = 0;
powerMonitor.getSystemIdleTime = () => fakeIdleSeconds;

const results = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  // Start from a clean data directory so counters are predictable.
  fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
  fs.mkdirSync(app.getPath('userData'), { recursive: true });

  const settings = require('../electron/lib/settings');
  const db = require('../electron/lib/db');
  settings.init();
  db.init();

  settings.set({
    screenshots: { enabled: false, notifyOnCapture: false },
    idle: {
      enabled: true,
      thresholdMinutes: 1,
      warningEnabled: true,
      warningCountdownSeconds: 10,
      onTimeout: 'stop',
      countIdleAsWork: false,
      playSound: false,
    },
  });

  const tracker = require('../electron/lib/tracker');

  /* ---------------- scenario 1: idle timeout stops the tracker ---------- */

  let warned = null;
  tracker.on('idle-warning', (payload) => {
    warned = payload;
  });
  let stopped = null;
  tracker.on('stopped', (payload) => {
    stopped = payload;
  });

  fakeIdleSeconds = 0;
  tracker.start({ taskNote: 'smoke test' });
  check('tracker starts', tracker.state === 'running');

  await wait(4200);
  const activeBeforeIdle = tracker.session.activeSeconds;
  check('counts active seconds while user is present', activeBeforeIdle >= 3, `${activeBeforeIdle}s counted`);

  // Employee walks away: OS now reports 70s since the last input event.
  fakeIdleSeconds = 70;
  await wait(1600);

  check('raises idle warning past the threshold', warned !== null, warned ? `countdown ${warned.countdownSeconds}s` : '');
  check('enters warning phase', tracker.idlePhase === 'warning', tracker.idlePhase);
  check(
    'moves the pre-idle window out of active time',
    tracker.session.activeSeconds === 0 && tracker.session.idleSeconds >= activeBeforeIdle,
    `active=${tracker.session.activeSeconds}s idle=${tracker.session.idleSeconds}s`,
  );

  // Nobody responds: after the countdown the tracker must stop itself.
  await wait(11000);
  check('auto-stops after the countdown', tracker.state === 'stopped', tracker.state);
  check('records why it stopped', stopped?.reason === 'idle-timeout', stopped?.reason || 'none');

  const persisted = db.listSessions({ limit: 1 })[0];
  check('persists the session locally', persisted?.stopReason === 'idle-timeout', persisted?.id || 'none');
  check('queues the session for upload', db.peekOutbox().some((i) => i.type === 'session'));

  /* ---------------- scenario 2: user comes back before timeout ---------- */

  warned = null;
  let resolved = false;
  tracker.on('idle-resolved', () => {
    resolved = true;
  });

  fakeIdleSeconds = 0;
  tracker.start({ taskNote: 'return path' });
  await wait(2200);

  fakeIdleSeconds = 70; // away
  await wait(1600);
  check('warns again on the second session', warned !== null);

  fakeIdleSeconds = 0; // employee touches the mouse
  await wait(1600);
  check('resumes automatically when input returns', resolved && tracker.idlePhase === 'active', tracker.idlePhase);
  check('keeps running after resuming', tracker.state === 'running', tracker.state);

  const activeAfterResume = tracker.session.activeSeconds;
  await wait(2200);
  check('resumes counting time', tracker.session.activeSeconds > activeAfterResume);

  /* ------- scenario 2b: idle pauses the session, input resumes it -------- */

  settings.set({ idle: { onTimeout: 'pause' } });
  tracker.stop('manual');

  fakeIdleSeconds = 0;
  tracker.start({ taskNote: 'pause and resume' });
  await wait(2200);
  const beforePause = tracker.session.activeSeconds;

  fakeIdleSeconds = 70; // away, and nobody answers the warning
  await wait(12000);

  check('stays running instead of stopping', tracker.state === 'running', tracker.state);
  check('sits in the idle phase', tracker.idlePhase === 'idle', tracker.idlePhase);
  const pausedActive = tracker.session.activeSeconds;
  const pausedIdle = tracker.session.idleSeconds;
  check('stops crediting active time while paused', pausedActive <= beforePause, `${pausedActive}s`);
  check('still records the idle seconds', pausedIdle >= 10, `${pausedIdle}s idle`);

  fakeIdleSeconds = 0; // employee touches the mouse
  await wait(2200);
  check('resumes by itself on input', tracker.idlePhase === 'active', tracker.idlePhase);
  check('counts time again after resuming', tracker.session.activeSeconds > pausedActive);
  check('keeps the same session across the pause', tracker.session.taskNote === 'pause and resume');

  const snap = tracker.snapshot();
  check('reports an active/idle split for today', snap.today.activeSeconds > 0 && snap.today.idleSeconds > 0, `${snap.today.activeSeconds}s / ${snap.today.idleSeconds}s`);
  check('reports a productivity percentage', typeof snap.today.productivity === 'number', `${snap.today.productivity}%`);
  check('hides capture activity from the renderer', !('screenshotCount' in (snap.session || {})) && !('nextShotInSeconds' in snap));

  settings.set({ idle: { countIdleAsWork: true } });
  const counted = tracker.snapshot().today;
  check(
    'counts idle as work when the policy says so',
    counted.workSeconds === counted.activeSeconds + counted.idleSeconds,
    `${counted.workSeconds}s`,
  );
  settings.set({ idle: { countIdleAsWork: false } });
  const split = tracker.snapshot().today;
  check('excludes idle from work otherwise', split.workSeconds === split.activeSeconds, `${split.workSeconds}s`);

  tracker.stop('manual');

  /* ---------- scenario 2c: the renderer cannot see or change policy ------ */

  const view = settings.publicView();
  check('hides capture settings from the renderer', !('screenshots' in view), Object.keys(view).join(','));
  check('still exposes the idle rules it explains to the employee', view.idle.thresholdMinutes > 0);
  check('hides the warning countdown internals', !('warningCountdownSeconds' in view.idle));

  const before = settings.get().screenshots.enabled;
  settings.setFromRenderer({ screenshots: { enabled: false }, idle: { enabled: false } });
  check('ignores a renderer patch aimed at capture', settings.get().screenshots.enabled === before);
  check('ignores a renderer patch aimed at idle policy', settings.get().idle.enabled === true);

  settings.setFromRenderer({ general: { theme: 'light' } });
  check('applies the employee-owned preferences', settings.get().general.theme === 'light');
  settings.setFromRenderer({ general: { theme: 'dark' } });

  /* ---------------- scenario 3: screenshots land on disk ---------------- */

  settings.set({ screenshots: { enabled: true, quality: 40, maxWidth: 800, allMonitors: false, notifyOnCapture: false } });
  fakeIdleSeconds = 0;
  tracker.start({ taskNote: 'capture' }); // capture needs a live session
  await wait(2200); // and a few ticks, so there is activity to summarise
  const rows = await tracker.captureNow();
  check('captures a screenshot', rows?.length > 0, `${rows?.length || 0} image(s)`);
  if (rows?.length) {
    const row = rows[0];
    check('writes the image file', fs.existsSync(row.filePath), `${Math.round((row.bytes || 0) / 1024)} KB`);
    check('writes a thumbnail', fs.existsSync(row.thumbPath));
    check('records an activity percentage', typeof row.activityPercent === 'number', `${row.activityPercent}%`);
  }

  tracker.stop('manual');
  check('manual stop works', tracker.state === 'stopped');

  /* ---------------- scenario 4: idle detection can be turned off -------- */

  settings.set({ idle: { enabled: false }, screenshots: { enabled: false } });
  tracker.start({});
  fakeIdleSeconds = 9999;
  await wait(3200);
  check(
    'keeps counting when idle detection is disabled',
    tracker.state === 'running' && tracker.session.activeSeconds >= 2,
    `${tracker.session.activeSeconds}s`,
  );
  tracker.stop('manual');

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  app.exit(failed.length ? 1 : 0);
});
