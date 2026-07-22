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
 *   stopped ──start──► active ──idle threshold──► warning ──timeout──► idle
 *                        ▲                          │                   │
 *                        └───────── input detected ─┴───────────────────┘
 *
 * Idle pauses rather than stops: the session stays open and resumes by itself
 * the moment the employee touches the mouse again. Active and idle seconds are
 * always recorded separately; settings.idle.countIdleAsWork decides which of
 * them the employee is credited with.
 *
 * Idle is measured with powerMonitor.getSystemIdleTime(), which reports OS-wide
 * seconds since the last mouse or keyboard event. That avoids installing a
 * global input hook, so the app needs no elevated permissions and cannot read
 * what the employee actually types.
 *
 * Screenshot capture is intentionally invisible to the renderer: snapshot()
 * exposes no capture counts, timings or settings. The agent UI has no surface
 * for it at all, and disclosure is handled through the employment agreement
 * rather than the app.
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

  start({ taskId = null, taskNote = '' } = {}) {
    if (this.state === 'running') return this.snapshot();
    if (this.state === 'paused') return this.resume();

    this.session = {
      id: randomUUID(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      activeSeconds: 0,
      idleSeconds: 0,
      taskId,
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
          // Paused, not stopped: the session stays open and the branch above
          // resumes it the moment any input arrives.
          this.idlePhase = 'idle';
          log.info('tracker: paused on idle, waiting for input');
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

    // The threshold window was counted as active while we waited to be sure the
    // employee had really gone. Move it to the idle column, unless idle counts
    // as work anyway, in which case the split does not change the total.
    if (!cfg.idle.countIdleAsWork) {
      const threshold = cfg.idle.thresholdMinutes * 60;
      const reclaimed = Math.min(threshold, this.session.activeSeconds);
      this.session.activeSeconds -= reclaimed;
      this.session.idleSeconds += reclaimed;
      log.info('tracker: moved', reclaimed, 'seconds from active to idle');
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
    const today = db.totalsOnDay(new Date(), { excludeId: this.session?.id });
    const activeSeconds = today.activeSeconds + (this.session?.activeSeconds || 0);
    const idleSeconds = today.idleSeconds + (this.session?.idleSeconds || 0);

    return {
      state: this.state,
      idlePhase: this.idlePhase,
      // Capture activity is deliberately absent from everything the renderer
      // receives -- see the note on this class.
      session: this.session && {
        id: this.session.id,
        startedAt: this.session.startedAt,
        activeSeconds: this.session.activeSeconds,
        idleSeconds: this.session.idleSeconds,
        taskId: this.session.taskId,
        taskNote: this.session.taskNote,
      },
      today: {
        activeSeconds,
        idleSeconds,
        // What the employee is credited with, per the admin's idle policy.
        workSeconds: activeSeconds + (cfg.idle.countIdleAsWork ? idleSeconds : 0),
        productivity: activeSeconds + idleSeconds > 0 ? Math.round((activeSeconds / (activeSeconds + idleSeconds)) * 100) : null,
      },
      systemIdleSeconds: powerMonitor.getSystemIdleTime(),
      warningRemainingSeconds:
        this.idlePhase === 'warning' ? Math.max(0, Math.round((this.warningDeadline - Date.now()) / 1000)) : null,
    };
  }

  emitState() {
    this.emit('state', this.snapshot());
  }
}

module.exports = new Tracker();
