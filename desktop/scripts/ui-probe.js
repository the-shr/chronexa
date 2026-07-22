'use strict';

/**
 * Loads the real app -- real main process, real preload, real data directory --
 * and checks the rendered window at several sizes.
 *
 *   npm run test:ui              against your own data
 *   PROBE_FRESH=1 npm run test:ui   as a first run: empty data, signed out
 *
 * The browser preview runs against a mock bridge, so only this catches
 * breakage in the app as an employee actually receives it.
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

if (process.env.PROBE_FRESH) {
  const dir = path.join(app.getPath('temp'), `chronexa-fresh-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  app.setPath('userData', dir);
}

require('../electron/main.js');

const SIZES = [
  [940, 640],
  [1120, 740],
  [1320, 860],
  [1600, 1000],
];

const CHECK = `(async () => {
  const pages = ['Dashboard', 'Tasks', 'Calendar', 'Activity', 'Setting', 'Profile'];
  const problems = [];
  const vis = (e) => getComputedStyle(e).display !== 'none';

  if (!document.querySelector('.app')) {
    return ['the app rendered nothing: ' + document.body.innerHTML.slice(0, 160)];
  }

  for (const p of pages) {
    // Profile has no tab of its own; it opens from the avatar in the corner.
    const tab = p === 'Profile'
      ? document.querySelector('.avatar.as-button')
      : [...document.querySelectorAll('.top-tab, .setting-pill')].find((b) => b.textContent.includes(p));
    if (!tab) { problems.push(p + ': tab missing'); continue; }
    tab.click();
    await new Promise((r) => setTimeout(r, 420));

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

    const ring = document.querySelector('.ring');
    if (ring && ring.getBoundingClientRect().width < 60) problems.push(p + ': ring collapsed');

    const text = document.querySelector('.content').innerText;
    for (const bad of ['NaN', 'undefined', 'Invalid Date', '[object']) {
      if (text.includes(bad)) problems.push(p + ': text contains ' + bad);
    }
  }
  return [...new Set(problems)];
})()`;

const DUMP = `(async () => {
  const tab = [...document.querySelectorAll('.top-tab, .setting-pill')].find((b) => b.textContent.includes('Dashboard'));
  if (tab) tab.click();
  await new Promise((r) => setTimeout(r, 500));
  const el = document.querySelector('.content');
  return el ? el.innerText.replace(/\\s*\\n+\\s*/g, ' | ').slice(0, 420) : '(no content)';
})()`;

/** Waits for React to mount rather than guessing at a delay. */
async function waitForRender(win, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ready = await win.webContents
      .executeJavaScript(`Boolean(document.querySelector('.app') || document.querySelector('.fallback'))`)
      .catch(() => false);
    if (ready) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 1200));
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.log('FAIL  no window was created');
    app.exit(1);
    return;
  }

  if (!(await waitForRender(win))) {
    console.log('FAIL  the window never rendered anything');
    app.exit(1);
    return;
  }

  let failed = 0;
  for (const [w, h] of SIZES) {
    win.setContentSize(w, h);
    await new Promise((r) => setTimeout(r, 700));
    await waitForRender(win);
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
  }

  try {
    console.log(`\nDashboard reads:\n  ${await win.webContents.executeJavaScript(DUMP)}`);
  } catch (err) {
    console.log(`\nCould not read the dashboard: ${err.message}`);
  }

  console.log(`\n${SIZES.length - failed}/${SIZES.length} sizes passed`);
  app.exit(failed ? 1 : 0);
});
