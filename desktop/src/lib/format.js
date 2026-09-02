export function hms(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Compact "6h 42m" used everywhere a duration is read rather than watched. */
export function humanDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (!h && !m) return `${s}s`;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function clockTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function weekdayShort(iso) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short' }).slice(0, 3);
}

export function isSameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** Relative due date, and whether it has already passed. */
export function dueLabel(iso) {
  if (!iso) return null;
  const due = new Date(iso);
  const now = new Date();
  const days = Math.round((due.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)) / 86400000);
  if (days < 0) return { text: days === -1 ? 'Yesterday' : `${Math.abs(days)}d overdue`, overdue: true };
  if (days === 0) return { text: 'Due today', overdue: false };
  if (days === 1) return { text: 'Due tomorrow', overdue: false };
  return { text: `Due in ${days}d`, overdue: false };
}

export const STOP_REASONS = {
  manual: 'Stopped',
  tray: 'Stopped from tray',
  'idle-timeout': 'Auto-stopped (idle)',
  'screen-locked': 'Screen locked',
  'system-suspended': 'Computer slept',
  'system-shutdown': 'Shut down',
  'app-quit': 'App closed',
  'signed-out': 'Signed out',
};
