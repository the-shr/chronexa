import { useEffect } from 'react';
import { useTrackerState } from '../lib/hooks.js';

export default function TimerOverlay() {
  const { snapshot } = useTrackerState();
  useEffect(() => {
    document.documentElement.classList.add('overlay-document');
    return () => document.documentElement.classList.remove('overlay-document');
  }, []);
  const seconds = snapshot?.today?.workSeconds || 0;
  const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((part) => String(part).padStart(2, '0')).join(':');
  return <div className="timer-overlay">
    <div className="timer-overlay-drag"><small>{snapshot?.idlePhase === 'active' ? 'Tracking' : 'Idle · waiting to resume'}</small><strong>{time}</strong></div>
    <button aria-label="Hide timer overlay" title="Show again in Settings" onClick={() => window.api.settings.set({ general: { timerOverlayVisible: false } })}>×</button>
  </div>;
}
