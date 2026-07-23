'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const db = require('./db');
const auth = require('./auth');
const settings = require('./settings');
const recorder = require('./recorder');
const log = require('./log');

const MAX_ATTEMPTS = 8;
const BATCH = 10;

/**
 * Offline-first uploader. Everything the tracker produces is written to disk
 * first and queued in the outbox; this loop drains the queue whenever the
 * server is reachable. Losing the network never loses time data.
 */
class Sync extends EventEmitter {
  constructor() {
    super();
    this.timer = null;
    this.running = false;
    this.lastResult = { at: null, ok: null, pending: 0, error: null };
  }

  start() {
    this.stop();
    const { enabled, intervalSeconds } = settings.get().sync;
    if (!enabled) return;
    this.timer = setInterval(() => this.run(), intervalSeconds * 1000);
    this.run();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  status() {
    return { ...this.lastResult, pending: db.peekOutbox(9999).length, signedIn: auth.isSignedIn() };
  }

  async run() {
    const cfg = settings.get().sync;
    if (this.running || !cfg.enabled) return this.status();
    if (!auth.isSignedIn()) {
      this.lastResult = { at: new Date().toISOString(), ok: false, error: 'Not signed in' };
      this.emit('status', this.status());
      return this.status();
    }

    this.running = true;
    const done = [];
    const failed = [];
    try {
      for (const item of db.peekOutbox(BATCH)) {
        if (item.attempts >= MAX_ATTEMPTS) {
          log.warn('sync: giving up on', item.id);
          done.push(item.id);
          continue;
        }
        try {
          if (item.type === 'session') await this.pushSession(item.payload);
          else if (item.type === 'screenshot') await this.pushScreenshot(item.payload.id);
          else if (item.type === 'recording') await this.pushRecording(item.payload.id);
          else if (item.type === 'task') await this.pushTask(item.payload);
          else if (item.type === 'task-add') await this.pushNewTask(item.payload);
          else if (item.type === 'task-delete') await this.pushTaskDelete(item.payload);
          else if (item.type === 'task-order') await this.pushTaskOrder(item.payload);
          done.push(item.id);
        } catch (err) {
          log.warn('sync: item failed', item.id, err.message);
          failed.push(item.id);
        }
      }
      db.dropOutbox(done);
      db.bumpAttempts(failed);
      this.lastResult = {
        at: new Date().toISOString(),
        ok: failed.length === 0,
        error: failed.length ? `${failed.length} item(s) failed` : null,
      };
    } catch (err) {
      log.error('sync: run failed', err);
      this.lastResult = { at: new Date().toISOString(), ok: false, error: err.message };
    } finally {
      this.running = false;
      this.emit('status', this.status());
    }
    return this.status();
  }

  base() {
    return settings.get().sync.serverUrl;
  }

  /**
   * A 401 is not a transient failure: retrying cannot fix a token the server has
   * stopped accepting. Stand down and tell the employee, leaving the work queued
   * so it uploads once they sign back in.
   */
  guard(res, what) {
    if (res.status === 401) {
      auth.markExpired(`${what} refused`);
      throw new Error('Your session has expired.');
    }
    if (!res.ok) throw new Error(`${what} ${res.status}`);
  }

  async pushSession(session) {
    const res = await fetch(`${this.base()}/api/agent/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth.authHeaders() },
      body: JSON.stringify(session),
    });
    this.guard(res, 'sessions');
  }

  async pushTask({ id, status }) {
    const res = await fetch(`${this.base()}/api/agent/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...auth.authHeaders() },
      body: JSON.stringify({ status }),
    });
    // A task deleted by the admin is not a failure worth retrying forever.
    if (res.status === 404) return;
    this.guard(res, 'tasks');
  }

  /**
   * A task the employee added. The server issues the real id, which replaces
   * the local placeholder so later edits address the right row.
   */
  async pushNewTask({ localId, title }) {
    const res = await fetch(`${this.base()}/api/agent/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth.authHeaders() },
      body: JSON.stringify({ title }),
    });
    this.guard(res, 'tasks');
    const { task } = await res.json();
    // Required lazily: tasks.js already requires sync's siblings, and pulling
    // it in at the top would close the loop.
    require('./tasks').replaceLocalId(localId, task);
  }

  async pushTaskDelete({ id }) {
    const res = await fetch(`${this.base()}/api/agent/tasks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: auth.authHeaders(),
    });
    // Already gone, or never the employee's to remove: nothing to retry.
    if (res.status === 404 || res.status === 403) return;
    this.guard(res, 'tasks');
  }

  async pushTaskOrder({ order }) {
    if (!order.length) return;
    const res = await fetch(`${this.base()}/api/agent/tasks`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...auth.authHeaders() },
      body: JSON.stringify({ order }),
    });
    this.guard(res, 'tasks');
  }

  async pushScreenshot(id) {
    if (!settings.get().sync.uploadScreenshots) return;
    const row = db.getScreenshot(id);
    if (!row) return; // deleted by the employee before it went up
    if (row.uploaded) return;
    if (!fs.existsSync(row.filePath)) {
      db.markScreenshotUploaded(id, null);
      return;
    }

    const form = new FormData();
    form.set('meta', JSON.stringify({ ...row, filePath: undefined, thumbPath: undefined }));
    form.set(
      'file',
      new Blob([fs.readFileSync(row.filePath)], { type: 'image/jpeg' }),
      path.basename(row.filePath),
    );

    const res = await fetch(`${this.base()}/api/agent/screenshots`, {
      method: 'POST',
      headers: auth.authHeaders(),
      body: form,
    });
    this.guard(res, 'screenshots');
    const data = await res.json().catch(() => ({}));
    db.markScreenshotUploaded(id, data.url || null);
  }

  async pushRecording(id) {
    const row = db.getRecording(id);
    if (!row || row.uploaded) return;
    if (!fs.existsSync(row.filePath)) {
      // The file went before it went up. Mark it done so the queue drains
      // rather than retrying something that can never succeed.
      db.markRecordingUploaded(id);
      return;
    }

    const form = new FormData();
    form.set('meta', JSON.stringify({ ...row, filePath: undefined }));
    form.set('file', new Blob([fs.readFileSync(row.filePath)], { type: 'video/webm' }), path.basename(row.filePath));

    const res = await fetch(`${this.base()}/api/agent/recordings`, {
      method: 'POST',
      headers: auth.authHeaders(),
      body: form,
    });

    // 501 means the server has no Drive configured. Retrying cannot fix that,
    // so drop the clip rather than filling the employee's disk with a queue
    // that will never drain.
    if (res.status === 501) {
      log.info('sync: recordings are not configured on the server; discarding', id);
      const dropped = db.removeRecording(id);
      if (dropped) recorder.remove(dropped);
      return;
    }

    this.guard(res, 'recordings');
    db.markRecordingUploaded(id);

    // Clips are large; keep only a few on disk once the server has them.
    for (const stale of db.drainUploadedRecordings()) recorder.remove(stale);
  }
}

module.exports = new Sync();
