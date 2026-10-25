'use strict';

// Short-lived, bounded cache. Callers supply an account-scoped key; mutations
// clear it. A response that started before invalidation cannot repopulate it.
class ReadCache {
  constructor({ ttl = 20000, limit = 64, now = Date.now } = {}) {
    this.ttl = ttl; this.limit = limit; this.now = now;
    this.rows = new Map(); this.pending = new Map(); this.generation = 0;
  }
  clear() { this.generation++; this.rows.clear(); this.pending.clear(); }
  read(key, load) {
    const cached = this.rows.get(key);
    if (cached && cached.until > this.now()) return Promise.resolve(cached.value);
    if (this.pending.has(key)) return this.pending.get(key);
    const generation = this.generation;
    const request = Promise.resolve().then(load).then(value => {
      if (generation === this.generation) {
        if (this.rows.size >= this.limit) this.rows.delete(this.rows.keys().next().value);
        this.rows.set(key, { value, until: this.now() + this.ttl });
      }
      return value;
    }).finally(() => { if (this.pending.get(key) === request) this.pending.delete(key); });
    this.pending.set(key, request);
    return request;
  }
}
module.exports = { ReadCache };
