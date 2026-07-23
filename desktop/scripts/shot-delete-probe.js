'use strict';

/**
 * Drives the Screens delete UI in the real window, without destroying data:
 * the trash button reveals a two-step confirm and "Keep" backs out. The actual
 * deletion (row + stored object) is covered server-side by admin-api-smoke and
 * over IPC by admin-probe; window.api is frozen by contextBridge, so it cannot
 * be stubbed here, and clicking the real Delete would remove a real capture.
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const dir = path.join(app.getPath('temp'), `chronexa-shotdel-${Date.now()}`);
fs.mkdirSync(dir, { recursive: true });
app.setPath('userData', dir);
require('../electron/main.js');

const results = [];
const check = (n, ok, d = '') => {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`);
};
const wait = async (win, expr, ms = 12000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await win.webContents.executeJavaScript(expr).catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};

app.whenReady().then(async () => {
  const settings = require('../electron/lib/settings');
  const auth = require('../electron/lib/auth');
  settings.set({ sync: { enabled: true, serverUrl: 'http://localhost:3000' } });
  await auth.login({ email: 'admin@example.com', password: 'admin12345', deviceName: 'shot-delete-probe' });

  await new Promise((r) => setTimeout(r, 1200));
  const win = BrowserWindow.getAllWindows()[0];
  win.setContentSize(1320, 860);
  await win.webContents.reload();
  await wait(win, `Boolean(document.querySelector('.brand-role'))`);

  await win.webContents.executeJavaScript(`(async () => {
    [...document.querySelectorAll('.top-tab')].find((b) => b.textContent.trim() === 'Screens')?.click();
    await new Promise((r) => setTimeout(r, 1400));
  })()`);

  const hasThumb = await wait(win, `Boolean(document.querySelector('.shot-thumb'))`, 8000);
  if (!hasThumb) {
    console.log('SKIP  no captures on this server to exercise the delete UI');
    app.exit(0);
    return;
  }

  check('a thumb opens on click, not delete', await win.webContents.executeJavaScript(`Boolean(document.querySelector('.shot-thumb .shot-open'))`));
  check('each thumb has a delete button', await win.webContents.executeJavaScript(`Boolean(document.querySelector('.shot-thumb .shot-del'))`));

  // Trash -> confirm appears with both choices.
  await win.webContents.executeJavaScript(`document.querySelector('.shot-thumb .shot-del').click()`);
  check('clicking trash reveals a confirm', await wait(win, `Boolean(document.querySelector('.shot-confirm'))`, 3000));
  check(
    'the confirm offers Delete and Keep',
    await win.webContents.executeJavaScript(
      `['Delete','Keep'].every((t) => [...document.querySelectorAll('.shot-confirm .mini')].some((b) => b.textContent.trim() === t))`,
    ),
  );

  // Keep -> confirm gone, thumb still there.
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('.shot-confirm .mini')].find((b) => b.textContent.trim() === 'Keep')?.click()`);
  check('Keep backs out', await wait(win, `!document.querySelector('.shot-confirm')`, 3000));
  check('and the capture is still there', await win.webContents.executeJavaScript(`Boolean(document.querySelector('.shot-thumb'))`));

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  app.exit(failed ? 1 : 0);
});
