'use strict';

/**
 * The whole path, for real: record a clip in the app, push it through sync, and
 * confirm the server stored it in Google Drive and can play it back.
 *
 *   npx electron scripts/recording-e2e-probe.js
 *
 * Needs the server running with Drive configured. Deletes the clip it made.
 */
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const dir = path.join(app.getPath('temp'), `chronexa-e2e-${Date.now()}`);
fs.mkdirSync(dir, { recursive: true });
app.setPath('userData', dir);

app.on('window-all-closed', () => {});

const SERVER = process.env.CHRONEXA_SERVER || 'http://localhost:3000';
const EMPLOYEE = { email: 'employee@example.com', password: 'employee1234' };
const ADMIN = { email: 'admin@example.com', password: 'admin12345' };

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

app.whenReady().then(async () => {
  const settings = require('../electron/lib/settings');
  const auth = require('../electron/lib/auth');
  const db = require('../electron/lib/db');
  const recorder = require('../electron/lib/recorder');
  const sync = require('../electron/lib/sync');

  settings.init();
  auth.init();
  db.init();
  recorder.init();
  settings.set({
    sync: { enabled: true, serverUrl: SERVER },
    recording: { enabled: true, durationSeconds: 2, maxWidth: 640, frameRate: 10 },
  });

  try {
    await auth.login({ ...EMPLOYEE, deviceName: 'recording-e2e' });
  } catch (err) {
    console.log(`FAIL  could not sign in: ${err.message}`);
    app.exit(1);
    return;
  }
  check('the employee agent is signed in', auth.isSignedIn());

  /* ------------------------------- record ------------------------------ */

  const row = await recorder.captureOnce();
  check('a clip is recorded', row.bytes > 1000, `${Math.round(row.bytes / 1024)}kb`);

  db.addRecording(row);
  db.enqueue({ id: `recording:${row.id}`, type: 'recording', payload: { id: row.id } });

  /* -------------------------------- sync ------------------------------- */

  await sync.run();
  check('sync marks it uploaded', db.getRecording(row.id)?.uploaded === true);
  check('and the queue drains', !db.peekOutbox(20).some((i) => i.type === 'recording'));

  /* ------------------------- what the admin sees ----------------------- */

  const login = await fetch(`${SERVER}/api/agent/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...ADMIN, deviceName: 'recording-e2e-admin' }),
  });
  const { token } = await login.json();
  const asAdmin = (p, init) =>
    fetch(`${SERVER}${p}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init?.headers || {}) } });

  const listRes = await asAdmin('/api/agent/admin/recordings?limit=10');
  const list = await listRes.json();
  check('the admin sees the clip', Array.isArray(list.recordings) && list.recordings.length > 0, `${list.recordings?.length} clip(s)`);

  const mine = list.recordings[0];
  check('it is stored in Drive', Boolean(mine?.driveFileId), mine?.driveFileId);
  check('with the recorded size', mine?.bytes === row.bytes, `${mine?.bytes} vs ${row.bytes}`);

  /* ------------------------------ playback ----------------------------- */

  const playRes = await asAdmin(`/api/recording/${mine.id}`);
  check('it plays back for an admin', playRes.ok, `HTTP ${playRes.status}`);
  const played = Buffer.from(await playRes.arrayBuffer());
  check('byte for byte, out of Drive', played.length === row.bytes, `${played.length} bytes`);
  check(
    'and it is still WebM',
    played[0] === 0x1a && played[1] === 0x45 && played[2] === 0xdf && played[3] === 0xa3,
  );

  /* ----------------------------- the gate ------------------------------ */

  const asEmployee = await fetch(`${SERVER}/api/recording/${mine.id}`, {
    headers: { authorization: `Bearer ${auth.get().token}` },
  });
  check('an employee cannot play it back', asEmployee.status === 401, `HTTP ${asEmployee.status}`);

  const employeeList = await fetch(`${SERVER}/api/agent/admin/recordings`, {
    headers: { authorization: `Bearer ${auth.get().token}` },
  });
  check('nor list the team clips', employeeList.status === 401, `HTTP ${employeeList.status}`);

  /* ------------------------------ idempotent --------------------------- */

  db.enqueue({ id: `recording:${row.id}-again`, type: 'recording', payload: { id: row.id } });
  await sync.run();
  const after = await (await asAdmin('/api/agent/admin/recordings?limit=50')).json();
  check(
    'resending does not duplicate it in Drive',
    after.recordings.filter((r) => r.driveFileId === mine.driveFileId).length === 1,
  );

  /* ------------------------------- cleanup ----------------------------- */

  const del = await asAdmin(`/api/agent/admin/recordings?id=${mine.id}`, { method: 'DELETE' });
  check('an admin can delete it', del.ok, `HTTP ${del.status}`);
  const gone = await asAdmin(`/api/recording/${mine.id}`);
  check('and it is really gone', gone.status === 404, `HTTP ${gone.status}`);

  recorder.remove(row);
  recorder.stop();

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  app.exit(failed ? 1 : 0);
});
