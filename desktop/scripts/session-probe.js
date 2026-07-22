'use strict';

/**
 * Checks that a rejected token reaches the employee instead of turning into a
 * silent 401 once a minute.
 *
 *   npm run test:session
 *
 * Runs against a stub server of its own rather than the real one: what is being
 * tested is how the agent reacts to a 401, and that should not depend on a
 * database being awake. The agent's server URL is pointed at the stub and put
 * back afterwards.
 */
const http = require('node:http');
const { app, BrowserWindow } = require('electron');

require('../electron/main.js');

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Serves whatever the current scenario calls for. */
let reject = false;
function startStub() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (reject) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      if (req.url.startsWith('/api/agent/login')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ token: 'stub-token', user: { id: 'u1', name: 'Stub', email: 'stub@example.com' } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ tasks: [], user: { id: 'u1', name: 'Stub', email: 'stub@example.com', hasAvatar: false } }));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const bannerState = `(() => {
  const el = document.querySelector('.session-banner');
  return {
    visible: Boolean(el),
    text: el ? el.innerText.replace(/\\s*\\n+\\s*/g, ' | ') : '',
    hasSignIn: Boolean(el && [...el.querySelectorAll('button')].some((b) => /sign in/i.test(b.textContent))),
  };
})()`;

async function waitUntil(win, predicate, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await win.webContents.executeJavaScript(bannerState).catch(() => null);
    if (state && predicate(state)) return state;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

app.whenReady().then(async () => {
  const auth = require('../electron/lib/auth');
  const settings = require('../electron/lib/settings');
  const tasks = require('../electron/lib/tasks');

  await new Promise((r) => setTimeout(r, 2500));
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.log('FAIL  no window');
    app.exit(1);
    return;
  }
  await win.webContents.executeJavaScript(`Boolean(document.querySelector('.app'))`).catch(() => {});

  const original = settings.get().sync.serverUrl;
  const stub = await startStub();
  const url = `http://127.0.0.1:${stub.address().port}`;
  settings.set({ sync: { serverUrl: url, enabled: true } });

  try {
    await auth.login({ email: 'stub@example.com', password: 'whatever' });
    check('signed in against the stub', auth.status().signedIn);

    const before = await win.webContents.executeJavaScript(bannerState);
    check('no banner while the session is good', !before.visible);

    /* The server starts refusing this token, as it would after a reinstall,
       an admin revoking the device, or a password change elsewhere. */
    reject = true;
    await tasks.refresh().catch(() => {});

    check('the agent marks the session expired', auth.status().sessionExpired, JSON.stringify(auth.status()));
    check('and stops reporting itself signed in', !auth.status().signedIn);

    const shown = await waitUntil(win, (s) => s.visible);
    check('the employee sees a banner', Boolean(shown), shown?.text.slice(0, 80) || 'never appeared');
    check('it offers a way back in', Boolean(shown?.hasSignIn));
    check('it says the recorded hours are safe', /still being recorded/i.test(shown?.text || ''), shown?.text.slice(0, 100) || '');

    /* Retrying must not spam: one expiry, not one per request. */
    let emissions = 0;
    auth.on('changed', () => {
      emissions += 1;
    });
    await tasks.refresh().catch(() => {});
    await tasks.refresh().catch(() => {});
    check('an already-expired session does not re-notify', emissions === 0, `${emissions} extra event(s)`);

    /* Signing back in clears it. */
    reject = false;
    await auth.login({ email: 'stub@example.com', password: 'whatever' });
    check('signing in clears the expiry', auth.status().signedIn && !auth.status().sessionExpired);

    const gone = await waitUntil(win, (s) => !s.visible);
    check('the banner disappears', Boolean(gone));
  } finally {
    stub.close();
    settings.set({ sync: { serverUrl: original } });
    auth.logout();
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  app.exit(failed ? 1 : 0);
});
