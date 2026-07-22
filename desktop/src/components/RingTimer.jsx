import { hms, humanDuration } from '../lib/format.js';
import { IconPlay, IconPause, IconStop } from './Icons.jsx';

/**
 * The ring only fills when the organisation has actually set a daily target.
 * Without one there is nothing to be a proportion of, so it stays an empty
 * track rather than implying progress towards a goal that does not exist.
 */
export default function RingTimer({ snapshot, settings, busy, onAction, activeTask }) {
  const { state, idlePhase, session, today } = snapshot;
  const running = state === 'running';
  const paused = state === 'paused';
  const idle = running && idlePhase !== 'active';
  const phase = idle ? 'idle' : running ? 'active' : paused ? 'paused' : 'stopped';

  const targetSeconds = (settings.work?.dailyTargetHours || 0) * 3600;
  const hasTarget = targetSeconds > 0;
  const progress = hasTarget ? Math.min(1, today.workSeconds / targetSeconds) : 0;
  const remaining = Math.max(0, targetSeconds - today.workSeconds);
  const ringColor = idle ? 'var(--warn)' : running ? 'var(--accent)' : 'var(--text-faint)';

  return (
    <section className="card timer-card">
      {/* The wrapper absorbs whatever height is left so the ring can shrink
          instead of overflowing its card in a short window. */}
      <div className="ring-wrap">
        <div className="ring" data-target={hasTarget ? 'set' : 'none'} style={{ '--progress': progress, '--ring-color': ringColor }}>
          <div className="ring-inner">
            <span className="ring-time mono">{hms(session ? session.activeSeconds : 0)}</span>
            <span className="ring-label">{session ? 'this session' : 'not started'}</span>
          </div>
        </div>
      </div>

      <div className="timer-stack">
        {hasTarget && (
          <span className="ring-target">
            {remaining > 0
              ? `${humanDuration(remaining)} left of your ${settings.work.dailyTargetHours}h day`
              : `Daily target of ${settings.work.dailyTargetHours}h reached`}
          </span>
        )}

        <span className="state-pill" data-state={phase}>
          <span className="pulse" />
          <span>
            {
              {
                active: 'Tracking',
                idle: `Paused — no activity for ${settings.idle.thresholdMinutes} min`,
                paused: 'Paused',
                stopped: 'Not tracking',
              }[phase]
            }
          </span>
        </span>

        {activeTask && (
          <div className="timer-task">
            Working on
            <strong className="truncate">{activeTask.title}</strong>
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
      </div>
    </section>
  );
}
