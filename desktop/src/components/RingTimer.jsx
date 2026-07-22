import { hms } from '../lib/format.js';
import { IconPlay, IconPause, IconStop } from './Icons.jsx';

/** Eight hours is the reference the ring fills against. */
const TARGET_SECONDS = 8 * 3600;

export default function RingTimer({ snapshot, settings, busy, onAction, activeTask }) {
  const { state, idlePhase, session, today } = snapshot;
  const running = state === 'running';
  const paused = state === 'paused';
  const idle = running && idlePhase !== 'active';
  const phase = idle ? 'idle' : running ? 'active' : paused ? 'paused' : 'stopped';

  // The ring tracks the whole day, not the current session -- it is a progress
  // bar towards a full day's work, which is what people actually want to see.
  const progress = Math.min(1, today.workSeconds / TARGET_SECONDS);
  const ringColor = idle ? 'var(--warn)' : running ? 'var(--accent)' : 'var(--text-faint)';

  return (
    <section className="card timer-card">
      <div className="ring" style={{ '--progress': progress, '--ring-color': ringColor }}>
        <div className="ring-inner">
          <span className="ring-time mono">{hms(session ? session.activeSeconds : 0)}</span>
          <span className="ring-label">{session ? 'this session' : 'not started'}</span>
        </div>
      </div>

      <span className="state-pill" data-state={phase}>
        <span className="pulse" />
        {
          {
            active: 'Tracking',
            idle: `Paused — no activity for ${settings.idle.thresholdMinutes} min`,
            paused: 'Paused',
            stopped: 'Not tracking',
          }[phase]
        }
      </span>

      {activeTask && (
        <div className="timer-task">
          Working on
          <strong>{activeTask.title}</strong>
        </div>
      )}

      <div className="timer-actions">
        {!running && !paused && (
          <button className="btn primary" disabled={busy} onClick={() => onAction(() => window.api.tracker.start({}))}>
            <IconPlay width={15} height={15} />
            Start
          </button>
        )}
        {running && (
          <button className="btn" disabled={busy} onClick={() => onAction(() => window.api.tracker.pause())}>
            <IconPause width={15} height={15} />
            Pause
          </button>
        )}
        {paused && (
          <button className="btn primary" disabled={busy} onClick={() => onAction(() => window.api.tracker.resume())}>
            <IconPlay width={15} height={15} />
            Resume
          </button>
        )}
        {(running || paused) && (
          <button
            className="btn danger"
            disabled={busy}
            onClick={() => onAction(() => window.api.tracker.stop('manual'))}
          >
            <IconStop width={13} height={13} />
            Stop
          </button>
        )}
      </div>
    </section>
  );
}
