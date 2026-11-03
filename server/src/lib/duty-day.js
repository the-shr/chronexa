const DAY = 86400000;
const OFFSET = 21600000;

export function dhakaDay(value) {
  return new Date(new Date(value).getTime() + OFFSET).toISOString().slice(0, 10);
}

function minuteOf(clock) {
  const [hour, minute] = String(clock).split(':').map(Number);
  return hour * 60 + minute;
}

/** Credit the after-midnight part of an overnight period to its start date. */
export function dutyDayFor(value, work) {
  const date = dhakaDay(value);
  const stamp = new Date(value).getTime();
  const segments = Array.isArray(work?.segments) && work.segments.length ? work.segments : [{ start: work?.officeStart || '09:00', end: work?.officeEnd || '17:00' }];
  const todayStart = Date.parse(`${date}T00:00:00+06:00`);
  for (const segment of segments) {
    const start = minuteOf(segment.start), end = minuteOf(segment.end);
    if (stamp >= todayStart + start * 60000 && stamp <= todayStart + (end < start ? end + 1440 : end) * 60000) return date;
  }
  for (const segment of segments) {
    const start = minuteOf(segment.start), end = minuteOf(segment.end);
    if (end >= start) continue;
    const previousStart = todayStart - DAY + start * 60000;
    const previousEnd = todayStart + end * 60000;
    if (stamp >= previousStart && stamp <= previousEnd + 2 * 3600000) return dhakaDay(previousStart);
  }
  return date;
}
