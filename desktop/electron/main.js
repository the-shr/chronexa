'use strict';

const { app, ipcMain, shell, dialog, powerMonitor } = require('electron');

const settings = require('./lib/settings');
const auth = require('./lib/auth');
const db = require('./lib/db');
const tracker = require('./lib/tracker');
const tasks = require('./lib/tasks');
const sync = require('./lib/sync');
const windows = require('./lib/windows');
const tray = require('./lib/tray');
const paths = require('./lib/paths');
const log = require('./lib/log');

// A second instance would double-count time and fight over the data files.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let quitting = false;

/* ------------------------------- bootstrap ------------------------------ */

app.whenReady().then(() => {
  settings.init();
  auth.init();
  db.init();
  tasks.init();

  windows.createMainWindow({ onCloseRequest: handleMainClose });
  tray.create({
    onStart: () => tracker.start(),
    onPause: () => tracker.pause(),
    onResume: () => tracker.resume(),
    onStop: () => tracker.stop('tray'),
    onShow: () => windows.createMainWindow({ onCloseRequest: handleMainClose }),
    onQuit: () => quitApp(),
  });
  tray.update(tracker.snapshot());

  wireTracker();
  wireSystemEvents();
  applyLaunchOnLogin();
  settings.onChange(() => {
    windows.broadcast('settings:changed', settings.publicView());
    applyLaunchOnLogin();
    sync.start();
  });

  sync.on('status', (status) => windows.broadcast('sync:status', status));
  sync.start();

  tasks.on('changed', (list) => windows.broadcast('tasks:changed', list));
  tasks.start();
  // A task ticked offline only reaches the server on the next sync; pull the
  // authoritative list straight after so the two cannot drift.
  sync.on('status', (status) => {
    if (status.ok && status.pending === 0) tasks.refresh().catch(() => {});
  });

  if (settings.get().general.startTrackingOnLaunch) tracker.start();

  log.info('app: ready, data dir =', paths.root());
});

app.on('window-all-closed', () => {
  // Tray-resident app: closing the window is not quitting.
  if (process.platform !== 'darwin' && !settings.get().general.minimizeToTray) quitApp();
});

app.on('second-instance', () => windows.createMainWindow({ onCloseRequest: handleMainClose }));
app.on('activate', () => windows.createMainWindow({ onCloseRequest: handleMainClose }));

app.on('before-quit', () => {
  quitting = true;
  if (tracker.state !== 'stopped') tracker.stop('app-quit');
  db.flush();
});

function quitApp() {
  quitting = true;
  app.quit();
}

function handleMainClose() {
  if (quitting) return 'close';
  return settings.get().general.minimizeToTray ? 'hide' : 'close';
}

/* --------------------------- tracker <-> UI glue ------------------------ */

function wireTracker() {
  tracker.on('state', (snapshot) => {
    windows.broadcast('tracker:state', snapshot);
    tray.update(snapshot);
  });

  tracker.on('idle-warning', (payload) => {
    windows.openIdleWindow();
    // The window may still be loading; resend once it is ready to receive.
    const send = () => windows.broadcast('tracker:idle-warning', payload);
    send();
    setTimeout(send, 400);
  });

  tracker.on('idle-warning-close', () => {
    windows.broadcast('tracker:idle-warning-close', null);
    windows.closeIdleWindow();
  });

  tracker.on('stopped', ({ session, reason }) => {
    windows.closeIdleWindow();
    sync.run().catch((err) => log.warn('sync after stop', err.message));
    if (reason === 'idle-timeout') {
      log.info('tracker: auto-stopped after idle', session.id);
    }
  });

  // Deliberately no 'screenshot' relay: nothing about capture reaches the UI.
}

function wireSystemEvents() {
  // Treat lock/sleep as an immediate hard idle: no one is at the machine.
  const hardStop = (reason) => () => {
    if (tracker.state === 'running' && settings.get().idle.enabled) {
      log.info('system:', reason);
      tracker.stop(reason);
    }
  };
  powerMonitor.on('lock-screen', hardStop('screen-locked'));
  powerMonitor.on('suspend', hardStop('system-suspended'));
  powerMonitor.on('shutdown', () => {
    if (tracker.state !== 'stopped') tracker.stop('system-shutdown');
    db.flush();
  });
}

function applyLaunchOnLogin() {
  if (!app.isPackaged) return; // dev builds would register the electron binary
  const { launchOnLogin } = settings.get().general;
  app.setLoginItemSettings({ openAtLogin: launchOnLogin, openAsHidden: true });
}

/* --------------------------------- IPC ---------------------------------- */

const handle = (channel, fn) => ipcMain.handle(channel, (_event, payload) => fn(payload));

handle('tracker:start', (opts) => tracker.start(opts || {}));
handle('tracker:pause', () => tracker.pause());
handle('tracker:resume', () => tracker.resume());
handle('tracker:stop', (reason) => tracker.stop(reason || 'manual'));
handle('tracker:snapshot', () => tracker.snapshot());
handle('tracker:acknowledge-idle', () => {
  const snapshot = tracker.acknowledgeIdle();
  windows.closeIdleWindow();
  return snapshot;
});

handle('settings:get', () => settings.publicView());
handle('settings:set', (patch) => settings.setFromRenderer(patch));

// Sessions reach the renderer without their capture counts: the agent UI has
// no screenshot surface and must not hint at one.
handle('history:sessions', (opts) =>
  db.listSessions(opts || {}).map(({ screenshotCount, ...session }) => session),
);
handle('history:daily', (days) => db.dailyTotals(days || 7));

handle('tasks:list', () => tasks.list());
handle('tasks:refresh', () => tasks.refresh());
handle('tasks:set-status', ({ id, status }) => tasks.setStatus(id, status));
handle('tasks:add', (title) => tasks.add(title));
handle('tasks:remove', (id) => tasks.remove(id));
handle('tasks:reorder', (ids) => tasks.reorder(ids || []));

handle('account:get', () => {
  const { user, deviceName } = auth.get();
  return { user, deviceName, signedIn: auth.isSignedIn() };
});
handle('account:login', async (creds) => {
  const user = await auth.login(creds);
  sync.start();
  return user;
});
handle('account:logout', () => {
  auth.logout();
  return true;
});

handle('sync:now', () => sync.run());
handle('sync:status', () => sync.status());

handle('window:minimize', () => windows.getMainWindow()?.minimize());
handle('window:close', () => windows.getMainWindow()?.close());
handle('window:close-idle-warning', () => windows.closeIdleWindow());
handle('app:version', () => app.getVersion());

process.on('uncaughtException', (err) => {
  log.error('uncaught', err);
  if (app.isReady()) dialog.showErrorBox('Chronexa error', String(err?.message || err));
});
