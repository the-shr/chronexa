import { useEffect, useRef, useState } from 'react';
import { useTrackerState } from '../lib/hooks.js';

export default function TimerOverlay() {
  const { snapshot } = useTrackerState();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const pointer = useRef(null);
  const playing = snapshot?.state === 'running' && snapshot?.idlePhase !== 'idle';
  useEffect(() => {
    document.documentElement.classList.add('overlay-document');
    const unsubscribe = window.api.overlay?.onExpanded(setExpanded);
    const collapse = () => { setExpanded(false); window.api.overlay?.expand(false); };
    window.addEventListener('blur', collapse);
    return () => { unsubscribe?.(); window.removeEventListener('blur', collapse); document.documentElement.classList.remove('overlay-document'); };
  }, []);
  const seconds = snapshot?.today?.workSeconds || 0;
  const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((part) => String(part).padStart(2, '0')).join(':');
  function toggle() { const next = !expanded; setExpanded(next); window.api.overlay?.expand(next); }
  async function action(name) { setBusy(true); try { if (name === 'hide') await window.api.overlay?.hide(); else if (name === 'stop') await window.api.tracker.stop('manual'); else await window.api.tracker[playing ? 'pause' : 'resume'](); } finally { setExpanded(false); window.api.overlay?.expand(false); setBusy(false); } }
  return <div className={`timer-overlay compact ${expanded ? 'expanded' : ''}`}>
    <button className="timer-overlay-time" aria-label={`${time}. Show timer controls`} aria-expanded={expanded}
      onPointerDown={event => { if (event.button !== 0) return; pointer.current = { x: event.clientX, y: event.clientY, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); window.api.overlay?.drag('start'); }}
      onPointerMove={event => { const start = pointer.current; if (!start) return; if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) start.moved = true; if (start.moved) window.api.overlay?.drag('move'); }}
      onPointerUp={() => { const start = pointer.current; pointer.current = null; window.api.overlay?.drag('end'); if (start && !start.moved) toggle(); }}
      onPointerCancel={() => { pointer.current = null; window.api.overlay?.drag('end'); }}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } }}><strong>{time}</strong></button>
    {expanded && <div className="timer-overlay-actions"><button disabled={busy} aria-label={playing ? 'Pause tracking' : 'Resume tracking'} title={playing ? 'Pause' : 'Resume'} onClick={() => action('toggle')}>{playing ? <svg viewBox="0 0 24 24"><path d="M8 6v12M16 6v12"/></svg> : <svg viewBox="0 0 24 24"><path d="m9 5 11 7-11 7Z"/></svg>}</button><button disabled={busy} aria-label="Stop tracking" title="Stop" onClick={() => action('stop')}><svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button><button disabled={busy} aria-label="Hide timer until next play" title="Hide" onClick={() => action('hide')}><svg viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17"/></svg></button></div>}
  </div>;
}
