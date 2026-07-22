'use strict';

/**
 * The first-run sign-in screen and the branch it feeds: an employee lands on
 * the employee dashboard, an admin on the admin shell, from the same form.
 *
 *   npx electron scripts/signin-probe.js
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const dir = path.join(app.getPath('temp'), `chronexa-signin-${Date.now()}`);
fs.mkdirSync(dir, { recursive: true });
app.setPath('userData', dir);
require('../electron/main.js');

const SERVER = process.env.CHRONEXA_SERVER || 'http://localhost:3000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const wait = async (win, expr, ms = 12000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await win.webContents.executeJavaScript(expr).catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};

async function signInAs(win, email, password) {
  await win.webContents.executeJavaScript(`(async () => {
    const set = (el, v) => {
      const s = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
      s.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const form = document.querySelector('.signin-card');
    set(form.querySelector('input[type=email]'), ${JSON.stringify(email)});
    set(form.querySelector('input[type=password]'), ${JSON.stringify(password)});
    form.requestSubmit();
  })()`);
}

app.whenReady().then(async () => {
  const settings = require('../electron/lib/settings');
  const auth = require('../electron/lib/auth');
  settings.set({ sync: { enabled: true, serverUrl: SERVER } });
  auth.logout();

  await new Promise((r) => setTimeout(r, 1200));
  const win = BrowserWindow.getAllWindows()[0];
  await win.webContents.reload();

  check('a fresh install opens on the sign-in screen', await wait(win, `Boolean(document.querySelector('.signin-card'))`));

  // Wrong password stays on the form and says why.
  await signInAs(win, 'employee@example.com', 'wrongpassword');
  check('a bad password is reported', await wait(win, `Boolean(document.querySelector('.signin .form-error'))`), '');
  check('and it stays on the form', await win.webContents.executeJavaScript(`Boolean(document.querySelector('.signin-card'))`));

  // A real employee reaches the employee dashboard.
  await signInAs(win, 'employee@example.com', 'employee1234');
  const toEmployee = await wait(win, `Boolean(document.querySelector('.app') && !document.querySelector('.brand-role'))`);
  check('an employee lands on the employee dashboard', toEmployee);
  check('and the tracker is theirs to start', await win.webContents.executeJavaScript(`Boolean(document.querySelector('.tracker-card'))`));

  // Sign out, then in as an admin, and the shell changes.
  auth.logout();
  await win.webContents.reload();
  await wait(win, `Boolean(document.querySelector('.signin-card'))`);
  await signInAs(win, 'admin@example.com', 'admin12345');
  const toAdmin = await wait(win, `Boolean(document.querySelector('.brand-role'))`);
  check('an admin lands on the admin shell', toAdmin);
  check('with no tracker to run', await win.webContents.executeJavaScript(`!document.querySelector('.tracker-card') && !document.querySelector('.ring')`));

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  app.exit(failed ? 1 : 0);
});
