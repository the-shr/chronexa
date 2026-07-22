'use strict';

const { EventEmitter } = require('node:events');

const paths = require('./paths');
const { JsonStore } = require('./jsonstore');
const settings = require('./settings');
const auth = require('./auth');
const db = require('./db');
const log = require('./log');

const REFRESH_MS = 2 * 60 * 1000;

/**
 * Tasks assigned by an admin. The list is cached on disk so it still renders
 * with no connection, and completing one while offline is applied locally and
 * queued -- the employee never has to wait for the network to tick something off.
 */
class Tasks extends EventEmitter {
  constructor() {
    super();
    this.store = null;
    this.timer = null;
    this.lastError = null;
  }

  init() {
    this.store = new JsonStore(paths.tasksFile(), { rows: [], fetchedAt: null });
  }

  start() {
    this.stop();
    this.timer = setInterval(() => this.refresh().catch(() => {}), REFRESH_MS);
    this.refresh().catch(() => {});
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  list() {
    const { rows, fetchedAt } = this.store.read();
    const open = rows.filter((t) => t.status !== 'done');
    const done = rows.filter((t) => t.status === 'done');
    return { open, done, fetchedAt, error: this.lastError };
  }

  get(id) {
    return this.store.read().rows.find((t) => t.id === id) || null;
  }

  async refresh() {
    const cfg = settings.get().sync;
    if (!cfg.enabled || !auth.isSignedIn()) return this.list();

    try {
      const res = await fetch(`${cfg.serverUrl}/api/agent/tasks`, { headers: auth.authHeaders() });
      if (!res.ok) throw new Error(`tasks ${res.status}`);
      const { tasks } = await res.json();

      // Anything completed offline is still in the outbox; keep the local
      // status so the tick does not visibly bounce back while it uploads.
      const pending = new Set(
        db
          .peekOutbox(9999)
          .filter((i) => i.type === 'task')
          .map((i) => i.payload.id),
      );
      const local = new Map(this.store.read().rows.map((t) => [t.id, t]));
      const merged = tasks.map((t) => (pending.has(t.id) ? { ...t, status: local.get(t.id)?.status ?? t.status } : t));

      this.store.write({ rows: merged, fetchedAt: new Date().toISOString() });
      this.store.flush();
      this.lastError = null;
      this.emit('changed', this.list());
    } catch (err) {
      this.lastError = err.message;
      log.warn('tasks: refresh failed', err.message);
    }
    return this.list();
  }

  /** Optimistic: applied locally straight away, queued for the server. */
  setStatus(id, status) {
    this.store.update((data) => {
      const task = data.rows.find((t) => t.id === id);
      if (task) {
        task.status = status;
        task.completedAt = status === 'done' ? new Date().toISOString() : null;
      }
      return data;
    });
    this.store.flush();

    db.enqueue({ id: `task:${id}`, type: 'task', payload: { id, status } });
    log.info('tasks: marked', id, status);
    this.emit('changed', this.list());
    return this.list();
  }
}

module.exports = new Tasks();
