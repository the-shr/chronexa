import { useEffect, useState } from 'react';

import { hms, humanDuration } from '../lib/format.js';
import { useSettings } from '../lib/hooks.js';

export default function Dashboard({ snapshot }) {
  const [settings] = useSettings();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  if (!snapshot || !settings) return <div className="page">Loading…</div>;

  const { state, idlePhase, session } = snapshot;
  const running = state === 'running';
  const paused = state === 'paused';
  const idle = running && idlePhase !== 'active';

  const act = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      if (message) setFlash(message);
    } catch (err) {
      setFlash(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Timer</h1>
        {flash && <span className="flash">{flash}</span>}
      </header>

      <section className={`timer-card ${idle ? 'is-idle' : running ? 'is-running' : ''}`}>
        <div className="timer-value mono">{hms(session?.activeSeconds ?? 0)}</div>
        <div className="timer-sub">
          {running && !idle && 'Counting active time'}
          {idle && `No input for ${settings.idle.thresholdMinutes} min — time is not being counted`}
          {paused && 'Paused'}
          {state === 'stopped' && 'Not tracking'}
        </div>

        <input
          className="note-input"
          placeholder="What are you working on? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={running || paused}
        />

        <div className="timer-actions">
          {!running && !paused && (
            <button className="btn primary" disabled={busy} onClick={() => act(() => window.api.tracker.start({ taskNote: note }))}>
              Start tracking
            </button>
          )}
          {running && (
            <button className="btn" disabled={busy} onClick={() => act(() => window.api.tracker.pause())}>
              Pause
            </button>
          )}
          {paused && (
            <button className="btn primary" disabled={busy} onClick={() => act(() => window.api.tracker.resume())}>
              Resume
            </button>
          )}
          {(running || paused) && (
            <button className="btn danger" disabled={busy} onClick={() => act(() => window.api.tracker.stop('manual'))}>
              Stop
            </button>
          )}
          <button
            className="btn ghost"
            disabled={busy || !running}
            onClick={() => act(() => window.api.tracker.captureNow(), 'Screenshot captured')}
          >
            Screenshot now
          </button>
        </div>
      </section>

      <section className="stat-grid">
        <Stat label="Today total" value={hms(snapshot.todaySeconds)} />
        <Stat label="Idle this session" value={humanDuration(session?.idleSeconds ?? 0)} />
        <Stat
          label="Next screenshot"
          value={
            !settings.screenshots.enabled
              ? 'Off'
              : snapshot.nextShotInSeconds === null
                ? '—'
                : humanDuration(snapshot.nextShotInSeconds)
          }
        />
        <Stat label="Screenshots" value={String(session?.screenshotCount ?? 0)} />
      </section>

      <section className="panel">
        <h2>Current rules</h2>
        <ul className="rules">
          <li>
            <span>Screenshots</span>
            <strong>
              {settings.screenshots.enabled
                ? `Every ${settings.screenshots.intervalMinutes} min${settings.screenshots.randomize ? ' (random moment)' : ''}`
                : 'Disabled'}
            </strong>
          </li>
          <li>
            <span>Idle detection</span>
            <strong>
              {settings.idle.enabled ? `After ${settings.idle.thresholdMinutes} min of no mouse/keyboard` : 'Disabled'}
            </strong>
          </li>
          <li>
            <span>On idle</span>
            <strong>
              {!settings.idle.enabled
                ? '—'
                : settings.idle.warningEnabled
                  ? `Warn for ${settings.idle.warningCountdownSeconds}s, then ${settings.idle.onTimeout === 'stop' ? 'stop the timer' : 'keep waiting'}`
                  : settings.idle.onTimeout === 'stop'
                    ? 'Stop the timer immediately'
                    : 'Keep waiting'}
            </strong>
          </li>
          <li>
            <span>Idle time billing</span>
            <strong>{settings.idle.discardIdleTime ? 'Idle minutes are discarded' : 'Idle minutes are kept'}</strong>
          </li>
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong className="mono">{value}</strong>
    </div>
  );
}
