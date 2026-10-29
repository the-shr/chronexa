'use strict';

const { EventEmitter } = require('node:events');
const paths = require('./paths');
const { JsonStore } = require('./jsonstore');
const settings = require('./settings');
const auth = require('./auth');
const db = require('./db');
const log = require('./log');

const REFRESH_MS = 60 * 1000;

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
      open: ordered.filter((t) => t.status === 'open'),
      pending: ordered.filter((t) => t.status === 'pending_approval'),
      done: ordered.filter((t) => t.status === 'done'),
      fetchedAt,
      error: this.lastError,
    };
  }

  get(id) {
    return this.store.read().rows.find((t) => t.id === id) || null;
  }

  refresh() {
    const accountToken = auth.get().token;
    if (this.refreshToken !== accountToken) { this.refreshToken = accountToken; this.lastRefreshAttempt = 0; this.refreshRequest = null; }
    if (this.refreshRequest) return this.refreshRequest;
    if (Date.now() - (this.lastRefreshAttempt || 0) < 15000) return Promise.resolve(this.list());
    this.lastRefreshAttempt = Date.now();
    const pending = this.fetchTasks().finally(() => { if (this.refreshRequest === pending) this.refreshRequest = null; });
    this.refreshRequest = pending;
    return pending;
  }

  async fetchTasks() {
    const accountToken = auth.get().token;
    const cfg = settings.get().sync;
    if (!auth.isSignedIn()) return this.list();

    try {
      const res = await fetch(`${cfg.serverUrl}/api/agent/tasks`, { headers: auth.authHeaders(), signal: AbortSignal.timeout(15000) });
      if (auth.get().token !== accountToken || !auth.isSignedIn()) return this.list();
      if (res.status === 401) {
        auth.markExpired('tasks request refused');
        throw new Error('Your session has expired.');
      }
      if (!res.ok) throw new Error(`tasks ${res.status}`);
      const { tasks } = await res.json();
      if (auth.get().token !== accountToken || !auth.isSignedIn()) return this.list();

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
    if (this.get(id)?.status !== 'open') return this.list();
    this.store.update((data) => {
      const task = data.rows.find((t) => t.id === id);
      if (task) {
        task.status = 'pending_approval';
        task.hubStatus = 'PENDING_APPROVAL';
        task.completedAt = null;
      }
      return data;
    });
    this.store.flush();

    db.enqueue({ id: `task:${id}`, type: 'task', payload: { id: id.replace(/^bmos:/, ''), status, ...details } });
    log.info('tasks: marked', id, status);
    this.emit('changed', this.list());
    return this.list();
  }

  async addComment(id, body) {
    const cfg = settings.get().sync;
    const res = await fetch(`${cfg.serverUrl}/api/agent/tasks/${encodeURIComponent(id.replace(/^bmos:/, ''))}/comments`, {
      method: 'POST',
      headers: { ...auth.authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Comment failed (${res.status})`);
    this.lastRefreshAttempt = 0;
    return this.refresh();
  }

}

module.exports = new Tasks();
