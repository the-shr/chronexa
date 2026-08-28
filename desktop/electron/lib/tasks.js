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
    // Older builds prefixed hub IDs. Normalise the read-only cache once so
    // sessions and queued completion intents continue to match canonical IDs.
    const current = this.store.read();
    const rows = (current.rows || []).map((task) => ({
      ...task,
      id: String(task.id).replace(/^bmos:/, ''),
      externalId: String(task.externalId || task.id).replace(/^bmos:/, ''),
      parentExternalId: task.parentExternalId ? String(task.parentExternalId).replace(/^bmos:/, '') : null,
    }));
    this.store.write({ ...current, rows });
    this.store.flush();
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
    // BM OS supplies the canonical hierarchy/order; Chronexa only caches it.
    const ordered = [...rows].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return {
      open: ordered.filter((t) => t.status !== 'done'),
      done: ordered.filter((t) => t.status === 'done'),
      fetchedAt,
      error: this.lastError,
    };
  }

  get(id) {
    return this.store.read().rows.find((t) => t.id === id) || null;
  }

  async refresh() {
    const cfg = settings.get().sync;
    if (!cfg.enabled || !auth.isSignedIn()) return this.list();

    try {
      const res = await fetch(`${cfg.serverUrl}/api/agent/tasks`, { headers: auth.authHeaders() });
      if (res.status === 401) {
        auth.markExpired('tasks request refused');
        throw new Error('Your session has expired.');
      }
      if (!res.ok) throw new Error(`tasks ${res.status}`);
      const { tasks } = await res.json();

      const queued = db.peekOutbox(9999);
      // Anything changed offline is still in the outbox; keep the local version
      // so the UI does not visibly bounce back while it uploads.
      const pendingStatus = new Set(queued.filter((i) => i.type === 'task').map((i) => i.payload.id));
      const rows = this.store.read().rows;
      const local = new Map(rows.map((t) => [t.id, t]));
      const merged = tasks.map((t) => (pendingStatus.has(t.id) ? { ...t, status: local.get(t.id)?.status ?? t.status } : t));

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

  /** Completion is optimistic and queued; every other task mutation belongs to BM OS. */
  setStatus(id, status, details = {}) {
    if (status !== 'done') return this.list();
    this.store.update((data) => {
      const task = data.rows.find((t) => t.id === id);
      if (task) {
        task.status = status;
        task.completedAt = status === 'done' ? new Date().toISOString() : null;
      }
      return data;
    });
    this.store.flush();

    db.enqueue({ id: `task:${id}`, type: 'task', payload: { id: id.replace(/^bmos:/, ''), status, ...details } });
    log.info('tasks: marked', id, status);
    this.emit('changed', this.list());
    return this.list();
  }

}

module.exports = new Tasks();
