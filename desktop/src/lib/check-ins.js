const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' });

export function dhakaDay(value) {
  const parts = Object.fromEntries(day.formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function dhakaClock(value) { return clock.format(new Date(value)); }
export function minuteOf(value) { const [hour, minute] = String(value || '00:00').split(':').map(Number); return hour * 60 + minute; }
export function localMinute(value) { return minuteOf(dhakaClock(value)); }

export function dutySegments(work) {
  const rows = Array.isArray(work?.segments) && work.segments.length ? work.segments : [{ start: work?.officeStart || '09:00', end: work?.officeEnd || '17:00' }];
  return rows.filter(row => /^\d\d:\d\d$/.test(row.start) && /^\d\d:\d\d$/.test(row.end)).sort((a, b) => minuteOf(a.start) - minuteOf(b.start));
}

export function periodAt(minute, segments) {
  if (!segments.length) return -1;
  const inside = segments.findIndex(row => minute >= minuteOf(row.start) && minute <= minuteOf(row.end));
  if (inside >= 0) return inside;
  const upcoming = segments.findIndex(row => minute < minuteOf(row.start));
  return upcoming >= 0 ? upcoming : segments.length - 1;
}

export function checkInState(punches = [], work, now = new Date()) {
  const segments = dutySegments(work);
  const today = dhakaDay(now);
  const rows = punches.filter(punch => dhakaDay(punch.checkedInAt) === today);
  const period = periodAt(localMinute(now), segments);
  const covered = rows.some(punch => periodAt(localMinute(punch.checkedInAt), segments) === period);
  const expected = period >= 0 ? segments[period].start : null;
  const delta = expected ? localMinute(now) - minuteOf(expected) : null;
  return { segments, period, expected, delta, covered, rows };
}

export function punctuality(punch, work) {
  const segments = dutySegments(work);
  const period = periodAt(localMinute(punch.checkedInAt), segments);
  const expected = period >= 0 ? segments[period].start : null;
  const delta = expected ? localMinute(punch.checkedInAt) - minuteOf(expected) : null;
  return { expected, delta, label: delta === null ? 'Unscheduled' : delta < 0 ? `${duration(-delta)} early` : delta > 0 ? `${duration(delta)} late` : 'On time' };
}

function duration(minutes) { const hours = Math.floor(minutes / 60); const rest = minutes % 60; return [hours ? `${hours}h` : '', rest ? `${rest}m` : ''].filter(Boolean).join(' ') || '0m'; }
