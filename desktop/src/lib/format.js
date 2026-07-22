export function hms(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

export function humanDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (!h && !m) return `${s}s`;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function clockTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  return isToday ? 'Today' : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export const STOP_REASONS = {
  manual: 'Stopped manually',
  tray: 'Stopped from tray',
  'idle-timeout': 'Auto-stopped (idle)',
  'screen-locked': 'Auto-stopped (screen locked)',
  'system-suspended': 'Auto-stopped (system sleep)',
  'system-shutdown': 'Auto-stopped (shutdown)',
  'app-quit': 'Stopped (app closed)',
};
