'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = process.env.CHRONEXA_TEST_OUTPUT || path.join(app.getPath('temp'), `chronexa-overlay-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'user-data'));
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
const desktop = path.join(__dirname, '..');
const settings = require(path.join(desktop, 'electron/lib/settings'));
const db = require(path.join(desktop, 'electron/lib/db'));
const tracker = require(path.join(desktop, 'electron/lib/tracker'));
const windows = require(path.join(desktop, 'electron/lib/windows'));
let ui;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, message) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await check()) return; await wait(50); }
  throw new Error(message);
}
const user = { id: 'overlay-test', name: 'Overlay Test', email: 'test@example.invalid', canManageTrackingPolicy: false };
const tasks = { open: [], done: [], fetchedAt: new Date().toISOString() };
const profile = { user, signedIn: true, deviceName: 'Test', avatar: null };
function handle(channel, fn) { ipcMain.handle(channel, (_event, payload) => fn(payload)); }
app.whenReady().then(async () => {
  settings.init(); db.init();
  settings.setFromRenderer({ general: { timerOverlayVisible: false } });
  handle('tracker:snapshot', () => tracker.snapshot());
  handle('settings:get', () => settings.publicView());
  handle('settings:set', (patch) => settings.setFromRenderer(patch));
  handle('account:get', () => ({ signedIn: true, user }));
  handle('profile:get', () => profile);
  handle('profile:refresh', () => profile);
  handle('tasks:list', () => tasks); handle('tasks:refresh', () => tasks);
  handle('history:daily', () => []); handle('history:sessions', () => []);
  handle('sync:status', () => ({ pending: 0, ok: true, signedIn: true }));
  handle('app:version', () => app.getVersion());
  handle('app:update-check', () => ({ available: false }));
  handle('app:update-status', () => ({ phase: 'idle', percent: 0 }));
  settings.onChange(() => {
    windows.updateOverlay(tracker.snapshot());
    windows.broadcast('settings:changed', settings.publicView());
    if (ui && !ui.isDestroyed()) ui.webContents.send('settings:changed', settings.publicView());
  });
  tracker.on('state', (snapshot) => { windows.updateOverlay(snapshot); windows.broadcast('tracker:state', snapshot); });
  // Keep the test overlay offscreen so it does not cover the user's current work.
  app.on('browser-window-created', (_event, win) => {
    win.once('ready-to-show', () => win.setPosition(-20000, -20000));
  });
  tracker.start();
  ui = new BrowserWindow({ show: false, frame: false, width: 1040, height: 720, webPreferences: { preload: path.join(desktop, 'electron/preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
  await ui.loadFile(path.join(desktop, 'dist/index.html'));
  await until(() => ui.webContents.executeJavaScript("[...document.querySelectorAll('button')].some(button => button.textContent === 'Settings')"), 'Settings tab did not load');
  await ui.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(button => button.textContent === 'Settings').click()");
  await until(() => ui.webContents.executeJavaScript("!!document.getElementById('floating-timer-label')"), 'Floating timer controls did not load');
  const click = async (label) => { await ui.webContents.executeJavaScript(`[...document.querySelectorAll('[aria-labelledby="floating-timer-label"] button')].find(button => button.textContent === '${label}').click()`); };
  await click('On');
  const overlay = () => BrowserWindow.getAllWindows().find((win) => win !== ui);
  await until(() => overlay()?.isVisible(), 'On did not show the native overlay');
  assert.equal(settings.get().general.timerOverlayVisible, true);
  await click('Off');
  await until(() => !overlay().isVisible() && !settings.get().general.timerOverlayVisible, 'Off did not hide the native overlay');
  windows.updateOverlay(tracker.snapshot());
  assert.equal(overlay().isVisible(), false, 'Tracker ticks must not undo Off');
  await click('On');
  await until(() => overlay().isVisible(), 'On did not restore the hidden overlay');
  await overlay().webContents.executeJavaScript("document.querySelector('.timer-overlay button').click()");
  await until(() => !overlay().isVisible(), 'Overlay close button did not hide it');
  await until(() => ui.webContents.executeJavaScript("[...document.querySelectorAll('#floating-timer-label + div button')].find(button => button.textContent === 'Off').getAttribute('aria-pressed') === 'true'"), 'Settings did not reflect hiding from the overlay');
  const persisted = JSON.parse(fs.readFileSync(path.join(output, 'user-data/settings.json'), 'utf8'));
  assert.equal(persisted.general.timerOverlayVisible, false, 'Off must persist on disk');
  await ui.webContents.capturePage(); await wait(300);
  fs.writeFileSync(path.join(output, 'settings.png'), (await ui.webContents.capturePage()).toPNG());
  tracker.stop('test'); db.flush();
  BrowserWindow.getAllWindows().forEach((win) => win.destroy());
  fs.writeFileSync(path.join(output, 'result.txt'), 'PASS: visible On/Off controls through real IPC; native show, hide, restore; no tick reopening; hide button updates Settings; Off persists');
  app.quit();
}).catch((error) => {
  fs.writeFileSync(path.join(output, 'result.txt'), error.stack);
  if (tracker.state !== 'stopped') tracker.stop('test-error');
  app.exit(1);
});
