'use strict';

/**
 * Proves the agent obeys server-set policy: it fetches, applies it over the
 * local settings, and cannot be overridden from the renderer. Drives the real
 * modules against the running server.
 *
 *   npx electron scripts/policy-probe.js
 *
 * Changes the org policy and puts it back. Needs an admin to set it with.
 */
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const dir = path.join(app.getPath('temp'), `chronexa-policy-${Date.now()}`);
fs.mkdirSync(dir, { recursive: true });
app.setPath('userData', dir);
app.on('window-all-closed', () => {});

const SERVER = process.env.CHRONEXA_SERVER || 'http://localhost:3000';
const ADMIN = { email: 'admin@example.com', password: 'admin12345' };
const EMPLOYEE = { email: 'employee@example.com', password: 'employee1234' };

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function adminPatch(token, body) {
  const res = await fetch(`${SERVER}/api/agent/admin/policy`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

app.whenReady().then(async () => {
  const settings = require('../electron/lib/settings');
  const auth = require('../electron/lib/auth');
  const policy = require('../electron/lib/policy');

  settings.init();
  auth.init();
  policy.init();
  settings.set({ sync: { enabled: true, serverUrl: SERVER } });

  // An admin token to change the policy with.
  const adminLogin = await fetch(`${SERVER}/api/agent/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...ADMIN, deviceName: 'policy-probe-admin' }),
  });
  const adminToken = (await adminLogin.json()).token;

  // Read the current policy so it can be restored.
  const before = await (await fetch(`${SERVER}/api/agent/policy`, { headers: { authorization: `Bearer ${adminToken}` } })).json();

  // Set something distinctive.
  await adminPatch(adminToken, { screenshotIntervalMinutes: 17, recordingEnabled: true, recordingMode: 'session', recordingSegmentMinutes: 6 });

  /* --------------------------- the agent obeys ------------------------- */

  await auth.login({ ...EMPLOYEE, deviceName: 'policy-probe' });
  const applied = await policy.refresh();
  check('the agent fetched a policy', Boolean(applied), applied?.version);

  const local = settings.get();
  check('and applied the screenshot interval', local.screenshots.intervalMinutes === 17, String(local.screenshots.intervalMinutes));
  check('and the recording mode', local.recording.mode === 'session' && local.recording.segmentMinutes === 6);
  check('and turned recording on', local.recording.enabled === true);

  /* ----------------------- the employee cannot ------------------------ */

  // The renderer path must not be able to change monitoring policy.
  const attempt = settings.setFromRenderer({
    screenshots: { intervalMinutes: 999, enabled: false },
    recording: { enabled: false },
  });
  check('the renderer cannot change the interval', settings.get().screenshots.intervalMinutes === 17);
  check('nor switch capture off', settings.get().screenshots.enabled === true && settings.get().recording.enabled === true);
  check('and none of it leaks to the renderer view', attempt.screenshots === undefined && attempt.recording === undefined);

  /* -------------------------- a change lands -------------------------- */

  await adminPatch(adminToken, { screenshotIntervalMinutes: 9 });
  await policy.refresh();
  check('a later change is picked up', settings.get().screenshots.intervalMinutes === 9, String(settings.get().screenshots.intervalMinutes));

  /* ------------------------------ restore ----------------------------- */

  await adminPatch(adminToken, {
    screenshotIntervalMinutes: before.screenshots.intervalMinutes,
    recordingEnabled: before.recording.enabled,
    recordingMode: before.recording.mode,
    recordingSegmentMinutes: before.recording.segmentMinutes,
  });

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  app.exit(failed ? 1 : 0);
});
