'use strict';

/**
 * Full round trip using the agent's real auth/sync modules against a running
 * server: sign in -> track -> capture -> upload -> outbox drains.
 *
 *   npm run test:sync            (server must be on http://localhost:3000)
 */
const { app, powerMonitor } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.setPath('userData', path.join(app.getPath('temp'), 'chronexa-synctest'));
powerMonitor.getSystemIdleTime = () => 0; // always "present"

const BASE = process.env.TT_SERVER || 'http://localhost:3000';
const EMAIL = process.env.TT_EMAIL || 'employee@example.com';
const PASSWORD = process.env.TT_PASSWORD || 'employee1234';

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
  fs.mkdirSync(app.getPath('userData'), { recursive: true });

  const settings = require('../electron/lib/settings');
  const auth = require('../electron/lib/auth');
  const db = require('../electron/lib/db');
  settings.init();
  auth.init();
  db.init();

  settings.set({
    sync: { enabled: true, serverUrl: BASE, uploadScreenshots: true },
    screenshots: { enabled: false, quality: 40, maxWidth: 900, allMonitors: false, notifyOnCapture: false },
    idle: { enabled: false },
  });

  const tracker = require('../electron/lib/tracker');
  const sync = require('../electron/lib/sync');

  check('starts signed out', !auth.isSignedIn());

  try {
    const user = await auth.login({ email: EMAIL, password: PASSWORD });
    check('agent signs in against the server', Boolean(user?.email), user?.email);
  } catch (err) {
    check('agent signs in against the server', false, err.message);
    console.log(`
This test needs a real employee account on the server. Either:
  - create one from the dashboard's Employees page, then re-run with
      TT_EMAIL=<email> TT_PASSWORD=<password> npm run test:sync
  - or run "npm run db:seed" in server/ to recreate the demo accounts.
Server: ${BASE}`);
    app.exit(1);
    return;
  }

  // Track a short session and grab one screenshot.
  tracker.start({ taskNote: 'sync round trip' });
  await wait(3200);
  const rows = await tracker.captureNow();
  check('captures a screenshot to upload', rows?.length > 0);
  tracker.stop('manual');

  const queuedBefore = db.peekOutbox(999).length;
  check('queues work for upload', queuedBefore >= 2, `${queuedBefore} item(s)`);

  const status = await sync.run();
  check('sync reports success', status.ok === true, status.error || '');
  check('outbox drains', db.peekOutbox(999).length === 0, `${db.peekOutbox(999).length} left`);

  const uploaded = db.listScreenshots({ limit: 5 }).filter((r) => r.uploaded);
  check('screenshot marked uploaded', uploaded.length > 0, uploaded[0]?.remoteUrl || '');

  // Offline behaviour: nothing must be lost when the server is unreachable.
  settings.set({ sync: { serverUrl: 'http://127.0.0.1:9' } });
  tracker.start({ taskNote: 'offline session' });
  await wait(1500);
  tracker.stop('manual');
  const offline = await sync.run();
  check('reports failure when the server is down', offline.ok === false, offline.error || '');
  check('keeps the work queued while offline', db.peekOutbox(999).length > 0, `${db.peekOutbox(999).length} queued`);

  settings.set({ sync: { serverUrl: BASE } });
  const recovered = await sync.run();
  check('uploads the backlog once the server returns', recovered.ok === true, recovered.error || '');
  check('outbox empty again', db.peekOutbox(999).length === 0);

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  app.exit(failed ? 1 : 0);
});
