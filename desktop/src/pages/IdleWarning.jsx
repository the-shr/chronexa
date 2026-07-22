import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Frameless always-on-top popup shown when no mouse/keyboard input has been
 * seen for the configured threshold. Any real input dismisses it automatically
 * (the main process detects that and fires idle-warning-close); if the
 * countdown runs out the tracker stops itself.
 */
export default function IdleWarning() {
  const [info, setInfo] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const beeped = useRef(false);

  useEffect(() => {
    const offWarn = window.api.tracker.onIdleWarning((payload) => {
      setInfo(payload);
      setRemaining(Math.max(0, Math.round((payload.deadline - Date.now()) / 1000)));
    });
    const offClose = window.api.tracker.onIdleWarningClose(() => window.api.window.closeIdleWarning());
    return () => {
      offWarn();
      offClose();
    };
  }, []);

  useEffect(() => {
    if (!info) return undefined;
    const id = setInterval(() => {
      setRemaining(Math.max(0, Math.round((info.deadline - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(id);
  }, [info]);

  useEffect(() => {
    if (!info?.playSound || beeped.current) return;
    beeped.current = true;
    beep();
  }, [info]);

  const total = info?.countdownSeconds || 1;
  const progress = useMemo(() => Math.max(0, Math.min(1, (remaining ?? 0) / total)), [remaining, total]);

  const willStop = info?.onTimeout === 'stop';

  return (
    <div className="idle-shell">
      <div className="idle-ring" style={{ '--progress': progress }}>
        <span className="mono">{remaining ?? '—'}</span>
      </div>

      <h1>Are you still there?</h1>
      <p>
        No mouse or keyboard activity for {info?.thresholdMinutes ?? '—'} minutes.
        <br />
        {willStop ? 'The timer will stop automatically' : 'The timer will keep waiting'} in {remaining ?? '—'}s.
      </p>

      <div className="idle-actions">
        <button className="btn primary" onClick={() => window.api.tracker.acknowledgeIdle()}>
          I'm still here
        </button>
        <button className="btn danger" onClick={() => window.api.tracker.stop('manual')}>
          Stop timer
        </button>
      </div>
    </div>
  );
}

/** Short attention tone via WebAudio -- no audio asset to ship. */
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
  } catch {
    /* audio is a nicety, never a hard failure */
  }
}
