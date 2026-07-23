'use strict';

/**
 * Exercises adding, reordering and deleting tasks in the real app -- real main
 * process, real preload, real IPC. The browser preview runs against a mock
 * bridge, so it cannot catch anything that breaks between the renderer and the
 * main process.
 *
 *   npm run test:tasks
 */
const { app, BrowserWindow } = require('electron');

require('../electron/main.js');

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Runs in the renderer, so it goes through the same bridge the UI uses. */
const SCRIPT = `(async () => {
  const out = { steps: [] };
  const say = (step, detail) => out.steps.push(step + (detail ? ': ' + detail : ''));

  const titles = () => [...document.querySelectorAll('.check-text > span')].map((s) => s.textContent);
  const items = () => [...document.querySelectorAll('.check-item')];

  if (!document.querySelector('.checklist')) return { error: 'no checklist rendered' };

  // A stale preload is the usual reason these buttons do nothing: the renderer
  // reloads on save, the preload does not.
  out.bridge = Object.keys(window.api.tasks || {}).sort();
  out.before = titles();

  /* -------------------------------- add -------------------------------- */
  const form = document.querySelector('.check-add');
  const input = form && form.querySelector('input');
  if (!input) return { error: 'no add-task input' };

  const setter = Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value').set;
  const type = (text) => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // Three, so reordering has something to reorder even on an empty account.
  for (const text of ['Probe added task', 'Probe second', 'Probe third']) {
    type(text);
    say('typed', input.value);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 700));
  }
  out.afterAdd = titles();

  /* ------------------------------ reorder ------------------------------ */
  const rows = items();
  if (rows.length >= 3) {
    const dt = new DataTransfer();
    rows[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    rows[2].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    rows[2].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    await new Promise((r) => setTimeout(r, 900));
  }
  out.afterDrag = titles();

  /* ------------------------------- delete ------------------------------- */
  const removable = items().filter((el) => el.querySelector('.check-remove'));
  out.removableCount = removable.length;
  if (removable.length) {
    out.removedTitle = removable[0].querySelector('.check-text > span').textContent;
    removable[0].querySelector('.check-remove').click();
    await new Promise((r) => setTimeout(r, 900));
  }
  out.afterDelete = titles();

  // Leave the employee's list as it was found.
  for (let guard = 0; guard < 20; guard += 1) {
    const stray = items().find((el) => el.querySelector('.check-text > span').textContent.startsWith('Probe '));
    if (!stray) break;
    const remove = stray.querySelector('.check-remove');
    if (!remove) break;
    remove.click();
    await new Promise((r) => setTimeout(r, 350));
  }
  out.leftBehind = titles().filter((t) => t.startsWith('Probe '));

  out.errors = window.__probeErrors || [];
  return out;
})()`;

async function waitForChecklist(win, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ready = await win.webContents
      .executeJavaScript(`Boolean(document.querySelector('.checklist'))`)
      .catch(() => false);
    if (ready) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

app.whenReady().then(async () => {
  // The app opens on a sign-in screen when no account is stored (a fresh run,
  // or after another probe signed out). Sign in as an employee first so this
  // always lands on the task card rather than the login form.
  const settings = require('../electron/lib/settings');
  const auth = require('../electron/lib/auth');
  settings.set({ sync: { enabled: true, serverUrl: process.env.CHRONEXA_SERVER || 'http://localhost:3000' } });
  if (!auth.isSignedIn()) {
    await auth
      .login({
        email: process.env.CHRONEXA_EMPLOYEE_EMAIL || 'employee@example.com',
        password: process.env.CHRONEXA_EMPLOYEE_PASSWORD || 'employee1234',
        deviceName: 'task-probe',
      })
      .catch((err) => console.log('note: could not sign in —', err.message));
  }

  await new Promise((r) => setTimeout(r, 1500));
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.log('FAIL  no window');
    app.exit(1);
    return;
  }
  await win.webContents.reload();

  // Surface renderer errors, which otherwise vanish into a console nobody sees.
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log('  renderer:', message.slice(0, 200));
  });
  await win.webContents.executeJavaScript(`
    window.__probeErrors = [];
    window.addEventListener('error', (e) => window.__probeErrors.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) => window.__probeErrors.push(String(e.reason)));
    true;
  `);

  win.setContentSize(1320, 860);
  if (!(await waitForChecklist(win))) {
    console.log('FAIL  the task card never rendered');
    app.exit(1);
    return;
  }

  const r = await win.webContents.executeJavaScript(SCRIPT);
  if (r.error) {
    console.log('FAIL ', r.error);
    app.exit(1);
    return;
  }

  console.log('  bridge exposes:', (r.bridge || []).join(', ') || '(nothing)');
  console.log('  steps:', r.steps.join(' | '));
  if (r.errors?.length) console.log('  renderer errors:', r.errors.join(' | '));
  console.log('  before      :', JSON.stringify(r.before));
  console.log('  after add   :', JSON.stringify(r.afterAdd));
  console.log('  after drag  :', JSON.stringify(r.afterDrag));
  console.log('  after delete:', JSON.stringify(r.afterDelete));

  for (const method of ['add', 'remove', 'reorder', 'setStatus']) {
    check(`the preload exposes tasks.${method}`, (r.bridge || []).includes(method));
  }
  check('adding a task puts it in the list', r.afterAdd.includes('Probe added task'), `${r.before.length} -> ${r.afterAdd.length}`);
  check('the newest task goes to the top', r.afterAdd[0] === 'Probe third', r.afterAdd[0]);
  check(
    'dragging changes the order',
    r.afterAdd.length >= 3 ? r.afterDrag[0] !== r.afterAdd[0] : true,
    `${r.afterAdd[0]} -> ${r.afterDrag[0]}`,
  );
  check('self-added tasks offer a delete', r.removableCount > 0, `${r.removableCount} removable`);
  check(
    'deleting removes it',
    r.removedTitle ? !r.afterDelete.includes(r.removedTitle) : false,
    r.removedTitle || 'nothing removable',
  );
  check('no renderer errors', !r.errors?.length, (r.errors || []).join(' | '));
  check('cleans up after itself', !r.leftBehind?.length, (r.leftBehind || []).join(', ') || 'nothing left');

  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  app.exit(failed ? 1 : 0);
});
