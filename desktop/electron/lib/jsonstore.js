'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Tiny atomic JSON file store.
 *
 * Writes go to `<file>.tmp` first and are then renamed over the real file, so a
 * crash mid-write can never leave a half-written (unparseable) file behind.
 * Writes are debounced because the tracker touches state every second.
 *
 * The interface is deliberately narrow (read/write/flush) so this can be
 * swapped for SQLite later without touching callers.
 */
class JsonStore {
  constructor(filePath, fallback, { debounceMs = 400 } = {}) {
    this.filePath = filePath;
    this.fallback = fallback;
    this.debounceMs = debounceMs;
    this._data = null;
    this._timer = null;
  }

  read() {
    if (this._data !== null) return this._data;
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      this._data = JSON.parse(raw);
    } catch {
      this._data = structuredClone(this.fallback);
    }
    return this._data;
  }

  write(data) {
    this._data = data;
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.flush();
    }, this.debounceMs);
  }

  /** Persist immediately. Called on quit and before anything irreversible. */
  flush() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._data === null) return;
    const tmp = `${this.filePath}.tmp`;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(this._data, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  update(fn) {
    const next = fn(this.read());
    this.write(next === undefined ? this._data : next);
    return this._data;
  }
}

module.exports = { JsonStore };
