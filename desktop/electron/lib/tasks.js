'use strict';

const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');

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
    // The employee's own ordering, newest first within the same position.
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
      if (!res.ok) throw new Error(`tasks ${res.status}`);
      const { tasks } = await res.json();

      const queued = db.peekOutbox(9999);
      // Anything changed offline is still in the outbox; keep the local version
      // so the UI does not visibly bounce back while it uploads.
      const pendingStatus = new Set(queued.filter((i) => i.type === 'task').map((i) => i.payload.id));
      const deleting = new Set(queued.filter((i) => i.type === 'task-delete').map((i) => i.payload.id));

      const rows = this.store.read().rows;
      const local = new Map(rows.map((t) => [t.id, t]));
      const merged = tasks
        .filter((t) => !deleting.has(t.id))
        .map((t) => (pendingStatus.has(t.id) ? { ...t, status: local.get(t.id)?.status ?? t.status } : t));

      // Tasks added while offline have no server row yet, so the response would
      // drop them. Carry them across until their create lands.
      const unsent = rows.filter((t) => String(t.id).startsWith('local-'));

      this.store.write({ rows: [...unsent, ...merged], fetchedAt: new Date().toISOString() });
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

  /**
   * Adds a task the employee set for themselves. A local id is used until the
   * server issues a real one, so the row appears instantly and survives being
   * created offline.
   */
  add(title) {
    const clean = String(title || '').trim().slice(0, 200);
    if (!clean) return this.list();

    const localId = `local-${randomUUID()}`;
    const top = Math.min(0, ...this.store.read().rows.map((t) => t.position ?? 0)) - 1;

    this.store.update((data) => {
      data.rows.unshift({
        id: localId,
        title: clean,
        description: '',
        status: 'open',
        priority: 'normal',
        source: 'self',
        position: top,
        dueAt: null,
        completedAt: null,
        pending: true,
      });
      return data;
    });
    this.store.flush();

    db.enqueue({ id: `task-add:${localId}`, type: 'task-add', payload: { localId, title: clean } });
    log.info('tasks: added', clean);
    this.emit('changed', this.list());
    return this.list();
  }

  /** Swaps a local placeholder id for the one the server assigned. */
  replaceLocalId(localId, task) {
    this.store.update((data) => {
      const i = data.rows.findIndex((t) => t.id === localId);
      if (i !== -1) data.rows[i] = { ...task, pending: false };
      return data;
    });
    this.store.flush();
    this.emit('changed', this.list());
  }

  remove(id) {
    const task = this.get(id);
    if (!task || task.source !== 'self') return this.list();

    this.store.update((data) => {
      data.rows = data.rows.filter((t) => t.id !== id);
      return data;
    });
    this.store.flush();

    // A task created offline was never on the server; drop its queued create
    // instead of asking the server to delete something it has never seen.
    if (id.startsWith('local-')) db.dropOutbox([`task-add:${id}`]);
    else db.enqueue({ id: `task-del:${id}`, type: 'task-delete', payload: { id } });

    log.info('tasks: removed', id);
    this.emit('changed', this.list());
    return this.list();
  }

  /** `ids` is the full open list in its new order, first to last. */
  reorder(ids) {
    this.store.update((data) => {
      ids.forEach((id, index) => {
        const task = data.rows.find((t) => t.id === id);
        if (task) task.position = index;
      });
      return data;
    });
    this.store.flush();

    // Only ids the server knows about; local placeholders are positioned when
    // their create lands. Dragging fires repeatedly, and only the final order
    // matters, so the queued entry is replaced rather than stacked up.
    const known = ids.filter((id) => !id.startsWith('local-'));
    db.dropOutbox(['task-order']);
    db.enqueue({ id: 'task-order', type: 'task-order', payload: { order: known } });
    this.emit('changed', this.list());
    return this.list();
  }
}

module.exports = new Tasks();
