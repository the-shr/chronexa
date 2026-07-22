'use strict';

/**
 * The admin dashboard in the real window, at four sizes. Same rules as the
 * employee side: nothing scrolls, nothing spills out of a card, no cards
 * overlap, and no raw NaN/undefined reaches the screen.
 *
 *   npm run test:admin-ui
 *   PROBE_SHOTS=<dir> npm run test:admin-ui   also writes a PNG per size
 *
 * Signs in as an admin first, so it exercises the same path a real one takes.
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ADMIN = {
  email: process.env.CHRONEXA_ADMIN_EMAIL || 'admin@example.com',
  password: process.env.CHRONEXA_ADMIN_PASSWORD || 'admin12345',
};
const SERVER = process.env.CHRONEXA_SERVER || 'http://localhost:3000';
const SHOT_DIR = process.env.PROBE_SHOTS || null;

// A throwaway data directory: the probe signs in and out, and must not disturb
// whatever account the developer is using.
const dir = path.join(app.getPath('temp'), `chronexa-admin-probe-${Date.now()}`);
fs.mkdirSync(dir, { recursive: true });
app.setPath('userData', dir);

require('../electron/main.js');

const SIZES = [
  [960, 640],
  [1120, 740],
  [1320, 860],
  [1600, 1000],
];

const PAGES = ['Overview', 'People', 'Tasks', 'Screens'];

const CHECK = `(async () => {
  const problems = [];
  const vis = (e) => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';

  if (!document.querySelector('.app')) {
    return ['the admin app rendered nothing: ' + document.body.innerHTML.slice(0, 160)];
  }
  if (!document.querySelector('.brand-role')) {
    return ['this is not the admin shell — the employee dashboard rendered instead'];
  }

  for (const p of ${JSON.stringify(PAGES)}) {
    const tab = [...document.querySelectorAll('.top-tab')].find((b) => b.textContent.trim() === p);
    if (!tab) { problems.push(p + ': tab missing'); continue; }
    tab.click();
    // Admin pages fetch on mount; give the request time to land.
    await new Promise((r) => setTimeout(r, 900));

    for (const c of document.querySelectorAll('.card')) {
      if (!vis(c)) continue;
      const cb = c.getBoundingClientRect();
      for (const ch of c.querySelectorAll('*')) {
        if (!vis(ch)) continue;
        const b = ch.getBoundingClientRect();
        if (b.height && (b.bottom > cb.bottom + 3 || b.top < cb.top - 3)) {
          problems.push(p + '/' + c.className.split(' ').slice(-1) + ': content spills out');
          break;
        }
      }
    }

    const boxes = [...document.querySelectorAll('.page-body > *')].filter(vis).map((c) => c.getBoundingClientRect());
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]; const z = boxes[j];
        if (a.left < z.right - 2 && z.left < a.right - 2 && a.top < z.bottom - 2 && z.top < a.bottom - 2) {
          problems.push(p + ': cards overlap');
        }
      }
    }

    if (document.documentElement.scrollHeight > innerHeight + 1) problems.push(p + ': page scrolls');
    if (document.documentElement.scrollWidth > innerWidth + 1) problems.push(p + ': page scrolls sideways');

    for (const list of document.querySelectorAll('.people-list, .live-list, .board-list, .detail-list, .shot-wall')) {
      if (!vis(list)) continue;
      if (list.scrollHeight > list.clientHeight + 2) problems.push(p + ': a list scrolls instead of paging');
    }

    const err = document.querySelector('.load-error');
    if (err) problems.push(p + ': ' + err.innerText.split('\\n')[0]);

    const text = document.querySelector('.content').innerText;
    for (const bad of ['NaN', 'undefined', 'Invalid Date', '[object']) {
      if (text.includes(bad)) problems.push(p + ': text contains ' + bad);
    }
  }
  return [...new Set(problems)];
})()`;

const DUMP = `(async () => {
  const tab = [...document.querySelectorAll('.top-tab')].find((b) => b.textContent.trim() === 'Overview');
  if (tab) tab.click();
  await new Promise((r) => setTimeout(r, 900));
  const el = document.querySelector('.content');
  return el ? el.innerText.replace(/\\s*\\n+\\s*/g, ' | ').slice(0, 460) : '(no content)';
})()`;

async function waitFor(win, expression, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ready = await win.webContents.executeJavaScript(expression).catch(() => false);
    if (ready) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

app.whenReady().then(async () => {
  const settings = require('../electron/lib/settings');
  const auth = require('../electron/lib/auth');
  settings.set({ sync: { enabled: true, serverUrl: SERVER } });

  try {
    const user = await auth.login({ ...ADMIN, deviceName: 'admin-ui-probe' });
    if (user.role !== 'admin') {
      console.log(`FAIL  ${ADMIN.email} is a ${user.role}, not an admin`);
      app.exit(1);
      return;
    }
  } catch (err) {
    console.log(`FAIL  could not sign in as ${ADMIN.email}: ${err.message}`);
    app.exit(1);
    return;
  }

  await new Promise((r) => setTimeout(r, 1200));
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.log('FAIL  no window was created');
    app.exit(1);
    return;
  }

  // The window may have rendered the sign-in screen before the token landed.
  await win.webContents.reload();
  if (!(await waitFor(win, `Boolean(document.querySelector('.app') || document.querySelector('.signin-screen'))`))) {
    console.log('FAIL  the window never rendered anything');
    app.exit(1);
    return;
  }

  const isAdminShell = await waitFor(win, `Boolean(document.querySelector('.brand-role'))`, 8000);
  console.log(`${isAdminShell ? 'PASS' : 'FAIL'}  an admin lands on the admin shell, not the employee dashboard`);

  if (SHOT_DIR) fs.mkdirSync(SHOT_DIR, { recursive: true });

  let failed = isAdminShell ? 0 : 1;
  for (const [w, h] of SIZES) {
    win.setContentSize(w, h);
    await new Promise((r) => setTimeout(r, 800));
    try {
      const problems = await win.webContents.executeJavaScript(CHECK);
      if (problems.length) {
        failed += 1;
        console.log(`FAIL  ${w}x${h}\n      ${problems.join('\n      ')}`);
      } else {
        console.log(`PASS  ${w}x${h}`);
      }
    } catch (err) {
      failed += 1;
      console.log(`FAIL  ${w}x${h} — probe threw: ${err.message}`);
    }

    if (SHOT_DIR) {
      for (const page of PAGES) {
        await win.webContents.executeJavaScript(
          `(async () => {
            const t = [...document.querySelectorAll('.top-tab')].find((b) => b.textContent.trim() === ${JSON.stringify(page)});
            if (t) t.click();
            await new Promise((r) => setTimeout(r, 1000));
          })()`,
        );
        const image = await win.webContents.capturePage();
        fs.writeFileSync(path.join(SHOT_DIR, `admin-${page.toLowerCase()}-${w}x${h}.png`), image.toPNG());
      }
    }
  }

  try {
    console.log(`\nOverview reads:\n  ${await win.webContents.executeJavaScript(DUMP)}`);
  } catch (err) {
    console.log(`\nCould not read the overview: ${err.message}`);
  }

  const total = SIZES.length + 1;
  console.log(`\n${total - failed}/${total} checks passed`);
  app.exit(failed ? 1 : 0);
});
