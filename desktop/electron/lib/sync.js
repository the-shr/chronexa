'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const db = require('./db');
const auth = require('./auth');
const settings = require('./settings');
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

  async pushSession(session) {
    const res = await fetch(`${this.base()}/api/agent/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth.authHeaders() },
      body: JSON.stringify(session),
    });
    if (!res.ok) throw new Error(`sessions ${res.status}`);
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
    if (!res.ok) throw new Error(`screenshots ${res.status}`);
    const data = await res.json().catch(() => ({}));
    db.markScreenshotUploaded(id, data.url || null);
  }
}

module.exports = new Sync();
