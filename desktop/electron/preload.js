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
    acknowledgeIdle: () => invoke('tracker:acknowledge-idle'),
    onState: (fn) => subscribe('tracker:state', fn),
    onIdleWarning: (fn) => subscribe('tracker:idle-warning', fn),
    onIdleWarningClose: (fn) => subscribe('tracker:idle-warning-close', fn),
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
    onChange: (fn) => subscribe('settings:changed', fn),
  },
  history: {
    sessions: (opts) => invoke('history:sessions', opts),
    daily: (days) => invoke('history:daily', days),
  },
  tasks: {
    list: () => invoke('tasks:list'),
    refresh: () => invoke('tasks:refresh'),
    setStatus: (id, status) => invoke('tasks:set-status', { id, status }),
    onChange: (fn) => subscribe('tasks:changed', fn),
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
