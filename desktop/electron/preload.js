'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only bridge between the renderer and Node. contextIsolation stays on and
 * nodeIntegration stays off, so the UI can do exactly what is listed here and
 * nothing else.
 */
const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

function subscribe(channel, handler) {
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('api', {
  tracker: {
    start: (opts) => invoke('tracker:start', opts),
    pause: () => invoke('tracker:pause'),
    resume: () => invoke('tracker:resume'),
    stop: (reason) => invoke('tracker:stop', reason),
    snapshot: () => invoke('tracker:snapshot'),
    captureNow: () => invoke('tracker:capture-now'),
    acknowledgeIdle: () => invoke('tracker:acknowledge-idle'),
    onState: (fn) => subscribe('tracker:state', fn),
    onIdleWarning: (fn) => subscribe('tracker:idle-warning', fn),
    onIdleWarningClose: (fn) => subscribe('tracker:idle-warning-close', fn),
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
    reset: () => invoke('settings:reset'),
    onChange: (fn) => subscribe('settings:changed', fn),
  },
  history: {
    sessions: (opts) => invoke('history:sessions', opts),
    screenshots: (opts) => invoke('history:screenshots', opts),
    deleteScreenshot: (id) => invoke('history:delete-screenshot', id),
    openFolder: () => invoke('history:open-folder'),
  },
  account: {
    get: () => invoke('account:get'),
    login: (creds) => invoke('account:login', creds),
    logout: () => invoke('account:logout'),
  },
  sync: {
    now: () => invoke('sync:now'),
    status: () => invoke('sync:status'),
    onStatus: (fn) => subscribe('sync:status', fn),
  },
  window: {
    minimize: () => invoke('window:minimize'),
    close: () => invoke('window:close'),
    closeIdleWarning: () => invoke('window:close-idle-warning'),
  },
  app: {
    version: () => invoke('app:version'),
    platform: process.platform,
  },
});
