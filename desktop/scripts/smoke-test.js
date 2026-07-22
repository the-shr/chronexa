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
      discardIdleTime: true,
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

  /* ---------------- scenario 3: screenshots land on disk ---------------- */

  settings.set({ screenshots: { enabled: true, quality: 40, maxWidth: 800, allMonitors: false, notifyOnCapture: false } });
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
