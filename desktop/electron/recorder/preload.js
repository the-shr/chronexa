'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * The hidden recorder window's only bridge. Deliberately tiny: it can be told
 * to record one clip and hand the bytes back, and nothing else. Kept separate
 * from the main preload so the recorder cannot reach the app's IPC surface, and
 * the app cannot reach the recorder's.
 */
contextBridge.exposeInMainWorld('recorder', {
  onRecord: (fn) => ipcRenderer.on('recorder:record', (_event, job) => fn(job)),
  done: (jobId, result) => ipcRenderer.send('recorder:done', { jobId, ...result }),
  fail: (jobId, error) => ipcRenderer.send('recorder:failed', { jobId, error }),
});
