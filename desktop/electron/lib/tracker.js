'use strict';

const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { powerMonitor } = require('electron');

const settings = require('./settings');
const screenshots = require('./screenshots');
const db = require('./db');
const log = require('./log');

const TICK_MS = 1000;
const PERSIST_EVERY_TICKS = 15;
/** A sample counts as "active" if input happened within this many seconds. */
const ACTIVITY_SAMPLE_SECONDS = 60;

/**
 * The tracker is a one-second state machine.
 *
 *   stopped ──start──► running ──idle threshold──► warning ──timeout──► stopped
 *                         ▲                           │
 *                         └────── input detected ─────┘
 *
 * Idle is measured with powerMonitor.getSystemIdleTime(), which reports OS-wide
 * seconds since the last mouse or keyboard event. That avoids installing a
 * global input hook, so the app needs no elevated permissions and cannot read
 * what the employee actually types.
 */
class Tracker extends EventEmitter {
  constructor() {
    super();
    this.state = 'stopped'; // stopped | running | paused
    this.idlePhase = 'active'; // active | warning | idle
    this.session = null;
    this.timer = null;
    this.ticks = 0;
    this.warningDeadline = 0;
    this.nextShotAt = 0;
    this.activitySamples = [];
    this.capturing = false;
  }

  /* ------------------------------ lifecycle ----------------------------- */

  start({ projectId = null, taskNote = '' } = {}) {
    if (this.state === 'running') return this.snapshot();
    if (this.state === 'paused') return this.resume();

    this.session = {
      id: randomUUID(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      activeSeconds: 0,
      idleSeconds: 0,
      projectId,
      taskNote,
      stopReason: null,
      screenshotCount: 0,
      synced: false,
    };
    db.upsertSession(this.session);

    this.state = 'running';
    this.idlePhase = 'active';
    this.activitySamples = [];
    this.ticks = 0;
    this.scheduleNextShot();
    this.timer = setInterval(() => this.tick(), TICK_MS);

    log.info('tracker: started session', this.session.id);
    this.emitState();
    return this.snapshot();
  }

  pause() {
    if (this.state !== 'running') return this.snapshot();
    this.state = 'paused';
    this.closeWarning();
    this.persist();
    log.info('tracker: paused');
    this.emitState();
    return this.snapshot();
  }

  resume() {
    if (this.state !== 'paused') return this.snapshot();
    this.state = 'running';
    this.idlePhase = 'active';
    this.scheduleNextShot();
    log.info('tracker: resumed');
    this.emitState();
    return this.snapshot();
  }

  stop(reason = 'manual') {
    if (this.state === 'stopped') return this.snapshot();

    clearInterval(this.timer);
    this.timer = null;
    this.closeWarning();

    this.session.endedAt = new Date().toISOString();
    this.session.stopReason = reason;
    this.persist();
    db.enqueue({ id: `session:${this.session.id}`, type: 'session', payload: this.session });

    log.info(
      'tracker: stopped session',
      this.session.id,
      `reason=${reason}`,
      `active=${this.session.activeSeconds}s`,
      `idle=${this.session.idleSeconds}s`,
    );

    const finished = this.session;
    this.state = 'stopped';
    this.idlePhase = 'active';
    this.session = null;
    this.emit('stopped', { session: finished, reason });
    this.emitState();
    return this.snapshot();
  }

  /* -------------------------------- tick -------------------------------- */

  tick() {
    if (this.state !== 'running' || !this.session) return;

    const cfg = settings.get();
    const systemIdle = powerMonitor.getSystemIdleTime();
    const now = Date.now();

    this.activitySamples.push(systemIdle < ACTIVITY_SAMPLE_SECONDS ? 1 : 0);

    if (!cfg.idle.enabled) {
      this.session.activeSeconds += 1;
    } else {
      const threshold = cfg.idle.thresholdMinutes * 60;

      if (systemIdle < threshold) {
        // Input detected -- if we were warning or idle, the employee is back.
        if (this.idlePhase !== 'active') {
          log.info('tracker: activity resumed after idle');
          this.idlePhase = 'active';
          this.closeWarning();
          this.emit('idle-resolved');
        }
        this.session.activeSeconds += 1;
      } else {
        if (this.idlePhase === 'active') this.enterIdle(cfg, now);
        this.session.idleSeconds += 1;

        if (this.idlePhase === 'warning' && now >= this.warningDeadline) {
          this.closeWarning();
          if (cfg.idle.onTimeout === 'stop') {
            this.stop('idle-timeout');
            return;
          }
          this.idlePhase = 'idle';
        }
      }
    }

    if (cfg.screenshots.enabled && now >= this.nextShotAt && this.idlePhase === 'active') {
      this.captureNow().catch((err) => log.error('tracker: capture failed', err));
    }

    this.ticks += 1;
    if (this.ticks % PERSIST_EVERY_TICKS === 0) this.persist();
    this.emitState();
  }

  enterIdle(cfg, now) {
    this.idlePhase = 'warning';
    this.warningDeadline = now + (cfg.idle.warningEnabled ? cfg.idle.warningCountdownSeconds * 1000 : 0);

    // The threshold window was already counted as active while we waited to be
    // sure. Move it to the idle column so the employee is not billed for it.
    if (cfg.idle.discardIdleTime) {
      const threshold = cfg.idle.thresholdMinutes * 60;
      const reclaimed = Math.min(threshold, this.session.activeSeconds);
      this.session.activeSeconds -= reclaimed;
      this.session.idleSeconds += reclaimed;
      log.info('tracker: discarded', reclaimed, 'idle seconds');
    }

    if (cfg.idle.warningEnabled) {
      this.emit('idle-warning', {
        countdownSeconds: cfg.idle.warningCountdownSeconds,
        deadline: this.warningDeadline,
        thresholdMinutes: cfg.idle.thresholdMinutes,
        onTimeout: cfg.idle.onTimeout,
        playSound: cfg.idle.playSound,
      });
    }
  }

  closeWarning() {
    if (this.idlePhase === 'warning' || this.warningDeadline) {
      this.warningDeadline = 0;
      this.emit('idle-warning-close');
    }
  }

  /** Employee clicked "I'm still here" -- keep tracking, drop the warning. */
  acknowledgeIdle() {
    if (this.idlePhase === 'warning') {
      this.idlePhase = 'active';
      this.closeWarning();
    }
    return this.snapshot();
  }

  /* ----------------------------- screenshots ---------------------------- */

  scheduleNextShot() {
    const cfg = settings.get().screenshots;
    const window = cfg.intervalMinutes * 60 * 1000;
    // Randomising the moment inside the window stops employees from timing
    // their breaks around a predictable capture.
    const offset = cfg.randomize ? window * (0.2 + Math.random() * 0.8) : window;
    this.nextShotAt = Date.now() + Math.round(offset);
  }

  async captureNow() {
    if (this.capturing || !this.session) return null;
    this.capturing = true;
    this.scheduleNextShot();
    try {
      const rows = await screenshots.capture({
        sessionId: this.session.id,
        activityPercent: this.consumeActivityPercent(),
      });
      db.addScreenshots(rows);
      this.session.screenshotCount += rows.length;
      for (const row of rows) {
        db.enqueue({ id: `screenshot:${row.id}`, type: 'screenshot', payload: { id: row.id } });
      }
      this.emit('screenshot', rows);
      this.emitState();
      return rows;
    } finally {
      this.capturing = false;
    }
  }

  consumeActivityPercent() {
    if (!this.activitySamples.length) return null;
    const sum = this.activitySamples.reduce((a, b) => a + b, 0);
    const percent = Math.round((sum / this.activitySamples.length) * 100);
    this.activitySamples = [];
    return percent;
  }

  /* -------------------------------- state ------------------------------- */

  persist() {
    if (this.session) db.upsertSession(this.session);
  }

  snapshot() {
    const cfg = settings.get();
    return {
      state: this.state,
      idlePhase: this.idlePhase,
      session: this.session,
      todaySeconds: db.secondsOnDay(new Date(), { excludeId: this.session?.id }) + (this.session?.activeSeconds || 0),
      systemIdleSeconds: powerMonitor.getSystemIdleTime(),
      nextShotInSeconds:
        this.state === 'running' && cfg.screenshots.enabled
          ? Math.max(0, Math.round((this.nextShotAt - Date.now()) / 1000))
          : null,
      warningRemainingSeconds:
        this.idlePhase === 'warning' ? Math.max(0, Math.round((this.warningDeadline - Date.now()) / 1000)) : null,
    };
  }

  emitState() {
    this.emit('state', this.snapshot());
  }
}

module.exports = new Tracker();
