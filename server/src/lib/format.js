export function humanDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (!h && !m) return `${s}s`;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function clockTime(date) {
  if (!date) return '—';
  return new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function dateLabel(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function startOfDay(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

export const STOP_REASONS = {
  manual: 'Stopped manually',
  tray: 'Stopped from tray',
  'idle-timeout': 'Auto-stopped (idle)',
  'screen-locked': 'Auto-stopped (locked)',
  'system-suspended': 'Auto-stopped (sleep)',
  'system-shutdown': 'Auto-stopped (shutdown)',
  'app-quit': 'Stopped (app closed)',
};
