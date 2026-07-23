'use strict';

const { app, ipcMain, shell, dialog, powerMonitor } = require('electron');

const settings = require('./lib/settings');
const auth = require('./lib/auth');
const db = require('./lib/db');
const tracker = require('./lib/tracker');
const tasks = require('./lib/tasks');
const profile = require('./lib/profile');
const admin = require('./lib/admin');
const recorder = require('./lib/recorder');
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
  profile.init();
  admin.init();
  recorder.init();

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

  // A rejected token used to be a log line and nothing else; the employee saw
  // a dashboard that had quietly stopped syncing.
  auth.on('changed', (status) => windows.broadcast('account:changed', status));

  profile.on('changed', (p) => windows.broadcast('profile:changed', p));
  profile.refresh().catch(() => {});
  // A task ticked offline only reaches the server on the next sync; pull the
  // authoritative list straight after so the two cannot drift.
  sync.on('status', (status) => {
    if (status.ok && status.pending === 0) tasks.refresh().catch(() => {});
  });

  // Admins are not tracked -- they run this build to watch the team, and
  // auto-starting a session for them would put phantom hours in the reports.
  if (settings.get().general.startTrackingOnLaunch && !admin.isAdmin()) tracker.start();

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
  recorder.stop();
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
  // Recording follows the tracker: it runs only while someone is actually
  // working, and stops the moment they pause, go idle or stop. Driven off the
  // state snapshot so every path into and out of running is covered, including
  // the automatic idle pause.
  let recordingFor = null;
  tracker.on('state', (snapshot) => {
    const working = snapshot.state === 'running' && snapshot.idlePhase === 'active';
    const id = snapshot.session?.id || null;

    if (working && id && id !== recordingFor) {
      recorder.start(id);
      recordingFor = id;
    } else if (!working && recordingFor) {
      recorder.stop();
      recordingFor = null;
    }
  });

  recorder.on('clip', (row) => {
    db.addRecording(row);
    db.enqueue({ id: `recording:${row.id}`, type: 'recording', payload: { id: row.id } });
  });

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

handle('account:get', () => auth.status());
handle('account:login', async (creds) => {
  const user = await auth.login(creds);
  sync.start();
  profile.refresh().catch(() => {});
  return user;
});
handle('account:logout', () => {
  auth.logout();
  return true;
});

handle('profile:get', () => profile.get());
handle('profile:refresh', () => profile.refresh());
handle('profile:update', (patch) => profile.update(patch || {}));
handle('profile:change-password', (body) => profile.changePassword(body || {}));
handle('profile:remove-avatar', () => profile.removeAvatar());

// The renderer has no filesystem access, so the picker and the read both
// happen here and only the result crosses the bridge.
handle('profile:pick-avatar', async () => {
  const result = await dialog.showOpenDialog(windows.getMainWindow(), {
    title: 'Choose a profile picture',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
  });
  if (result.canceled || !result.filePaths.length) return { cancelled: true };

  const file = result.filePaths[0];
  const bytes = require('node:fs').readFileSync(file);
  if (bytes.length > 3 * 1024 * 1024) throw new Error('That picture is too large. Keep it under 3 MB.');
  return profile.setAvatar(bytes, require('node:path').basename(file));
});

handle('admin:overview', (days) => admin.overview(days || 7));
handle('admin:employees', () => admin.employees());
handle('admin:employee', (id) => admin.employee(id));
handle('admin:tasks', (query) => admin.tasks(query || {}));
handle('admin:screenshots', (query) => admin.screenshots(query || {}));
handle('admin:delete-screenshot', (id) => admin.deleteScreenshot(id));
handle('admin:recordings', (query) => admin.recordings(query || {}));
handle('admin:delete-recording', (id) => admin.deleteRecording(id));
handle('admin:clip', (id) => admin.clip(id));
handle('admin:assign-task', (payload) => admin.assignTask(payload || {}));
handle('admin:update-task', (payload) => admin.updateTask(payload || {}));
handle('admin:delete-task', (id) => admin.deleteTask(id));
handle('admin:add-employee', (payload) => admin.addEmployee(payload || {}));
handle('admin:update-employee', (payload) => admin.updateEmployee(payload || {}));
handle('admin:image', (id) => admin.image(id));

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
