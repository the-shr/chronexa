'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const paths = require('./paths');
const { JsonStore } = require('./jsonstore');
const settings = require('./settings');
const auth = require('./auth');
const log = require('./log');

/**
 * The employee's own account details. Cached on disk -- including the picture --
 * so the dashboard still shows who you are with no connection.
 *
 * Everything here is a live server call rather than a queued one: changing your
 * password or email offline and finding out later that the email was taken
 * would be worse than being told to try again when connected.
 */
class Profile extends EventEmitter {
  constructor() {
    super();
    this.store = null;
  }

  init() {
    this.store = new JsonStore(paths.profileFile(), { user: null, fetchedAt: null, avatarVersion: null });
  }

  avatarFile() {
    return path.join(paths.root(), 'avatar.img');
  }

  get() {
    const { user, fetchedAt } = this.store.read();
    return {
      user: user || auth.get().user || null,
      fetchedAt,
      signedIn: auth.isSignedIn(),
      deviceName: auth.get().deviceName,
      avatar: this.avatarDataUrl(),
    };
  }

  /** Inlined as a data URL: the renderer has no filesystem access. */
  avatarDataUrl() {
    try {
      const file = this.avatarFile();
      if (!fs.existsSync(file)) return null;
      const { type } = this.store.read();
      return `data:${type || 'image/jpeg'};base64,${fs.readFileSync(file).toString('base64')}`;
    } catch {
      return null;
    }
  }

  base() {
    return settings.get().sync.serverUrl;
  }

  async request(pathname, options = {}) {
    if (!auth.isSignedIn()) throw new Error('Sign in first.');
    const res = await fetch(`${this.base()}${pathname}`, {
      ...options,
      headers: { ...(options.headers || {}), ...auth.authHeaders() },
    });
    if (res.status === 401) throw new Error('Your session has expired. Sign in again.');
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.error || `Request failed (${res.status})`);
    }
    return res;
  }

  async refresh() {
    try {
      const res = await this.request('/api/agent/me');
      const { user } = await res.json();
      const previous = this.store.read();
      this.store.update((data) => ({ ...data, user, fetchedAt: new Date().toISOString() }));
      this.store.flush();

      // Only re-download the picture when it has actually changed.
      if (user.hasAvatar && user.avatarVersion !== previous.avatarVersion) await this.downloadAvatar(user.avatarVersion);
      if (!user.hasAvatar) this.clearAvatarCache();

      this.emit('changed', this.get());
    } catch (err) {
      log.warn('profile: refresh failed', err.message);
    }
    return this.get();
  }

  async downloadAvatar(version) {
    try {
      const res = await this.request('/api/agent/me/avatar');
      const type = res.headers.get('content-type') || 'image/jpeg';
      fs.writeFileSync(this.avatarFile(), Buffer.from(await res.arrayBuffer()));
      this.store.update((data) => ({ ...data, avatarVersion: version, type }));
      this.store.flush();
    } catch (err) {
      log.warn('profile: avatar download failed', err.message);
    }
  }

  clearAvatarCache() {
    try {
      fs.unlinkSync(this.avatarFile());
    } catch {
      /* nothing cached */
    }
    this.store.update((data) => ({ ...data, avatarVersion: null, type: null }));
    this.store.flush();
  }

  async update({ name, email, currentPassword }) {
    const res = await this.request('/api/agent/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, email, currentPassword }),
    });
    const { user } = await res.json();
    this.store.update((data) => ({ ...data, user, fetchedAt: new Date().toISOString() }));
    this.store.flush();

    // auth.json carries the identity shown before the first refresh.
    auth.updateUser(user);
    log.info('profile: updated');
    this.emit('changed', this.get());
    return this.get();
  }

  async changePassword({ currentPassword, newPassword }) {
    const res = await this.request('/api/agent/me/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const body = await res.json();
    log.info('profile: password changed,', body.otherDevicesSignedOut, 'other device(s) signed out');
    return { ok: true, otherDevicesSignedOut: body.otherDevicesSignedOut };
  }

  async setAvatar(bytes, filename) {
    const form = new FormData();
    form.set('file', new Blob([bytes]), filename || 'avatar');
    const res = await this.request('/api/agent/me/avatar', { method: 'POST', body: form });
    const body = await res.json();
    await this.downloadAvatar(body.avatarVersion);
    await this.refresh();
    return this.get();
  }

  async removeAvatar() {
    await this.request('/api/agent/me/avatar', { method: 'DELETE' });
    this.clearAvatarCache();
    await this.refresh();
    return this.get();
  }
}

module.exports = new Profile();
