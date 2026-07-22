'use strict';

const { app, ipcMain, shell, dialog, powerMonitor } = require('electron');

const settings = require('./lib/settings');
const auth = require('./lib/auth');
const db = require('./lib/db');
const tracker = require('./lib/tracker');
const sync = require('./lib/sync');
const windows = require('./lib/windows');
const tray = require('./lib/tray');
const screenshots = require('./lib/screenshots');
const shotProtocol = require('./lib/protocol');
const paths = require('./lib/paths');
const log = require('./lib/log');

// A second instance would double-count time and fight over the data files.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Must run before the app is ready.
shotProtocol.registerScheme();

let quitting = false;

/* ------------------------------- bootstrap ------------------------------ */

app.whenReady().then(() => {
  settings.init();
  auth.init();
  db.init();
  shotProtocol.handle();

  windows.createMainWindow({ onCloseRequest: handleMainClose });
  tray.create({
    onStart: () => tracker.start(),
    onPause: () => tracker.pause(),
    onResume: () => tracker.resume(),
    onStop: () => tracker.stop('tray'),
    onCapture: () => tracker.captureNow().catch((err) => log.error('capture-now', err)),
    onShow: () => windows.createMainWindow({ onCloseRequest: handleMainClose }),
    onQuit: () => quitApp(),
  });
  tray.update(tracker.snapshot());

  wireTracker();
  wireSystemEvents();
  applyLaunchOnLogin();
  settings.onChange((next) => {
    windows.broadcast('settings:changed', next);
    applyLaunchOnLogin();
    sync.start();
  });

  sync.on('status', (status) => windows.broadcast('sync:status', status));
  sync.start();

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

  tracker.on('screenshot', (rows) => windows.broadcast('tracker:screenshot', rows.length));
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
handle('tracker:capture-now', async () => {
  const rows = await tracker.captureNow();
  return rows?.length || 0;
});
handle('tracker:acknowledge-idle', () => {
  const snapshot = tracker.acknowledgeIdle();
  windows.closeIdleWindow();
  return snapshot;
});

handle('settings:get', () => settings.get());
handle('settings:set', (patch) => settings.set(patch || {}));
handle('settings:reset', () => settings.reset());

handle('history:sessions', (opts) => db.listSessions(opts || {}));
handle('history:screenshots', (opts) => db.listScreenshots(opts || {}));
handle('history:delete-screenshot', (id) => {
  const row = db.removeScreenshot(id);
  if (row) screenshots.remove(row);
  return Boolean(row);
});
handle('history:open-folder', () => shell.openPath(paths.screenshotDir()));

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
  if (app.isReady()) dialog.showErrorBox('TimeTracker error', String(err?.message || err));
});
