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
    setStatus: (id, status, details) => invoke('tasks:set-status', { id, status, details }),
    addComment: (id, body) => invoke('tasks:add-comment', { id, body }),
    onChange: (fn) => subscribe('tasks:changed', fn),
  },
  profile: {
    get: () => invoke('profile:get'),
    refresh: () => invoke('profile:refresh'),
    update: (patch) => invoke('profile:update', patch),
    changePassword: (body) => invoke('profile:change-password', body),
    pickAvatar: () => invoke('profile:pick-avatar'),
    removeAvatar: () => invoke('profile:remove-avatar'),
    onChange: (fn) => subscribe('profile:changed', fn),
  },
  account: {
    get: () => invoke('account:get'),
    onChange: (fn) => subscribe('account:changed', fn),
    login: (creds) => invoke('account:login', creds),
    logout: () => invoke('account:logout'),
  },
  configuration: {
    get: () => invoke('configuration:get'),
    update: (patch) => invoke('configuration:update', patch),
  },
  admin: {
    employees: () => invoke('admin:employees'),
    employee: (id) => invoke('admin:employee', id),
    screenshots: (query) => invoke('admin:screenshots', query),
    recordings: (query) => invoke('admin:recordings', query),
    image: (id) => invoke('admin:image', id),
    clip: (id) => invoke('admin:clip', id),
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
    checkUpdate: () => invoke('app:update-check'),
    openUpdate: (url) => invoke('app:open-update', url),
    platform: process.platform,
  },
});
