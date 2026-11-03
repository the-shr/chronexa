const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' });

function dhakaDay(value) {
  const parts = Object.fromEntries(day.formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dhakaClock(value) { return clock.format(new Date(value)); }
function minuteOf(value) { const [hour, minute] = String(value || '00:00').split(':').map(Number); return hour * 60 + minute; }
function localMinute(value) { return minuteOf(dhakaClock(value)); }

function dutySegments(work) {
  const rows = Array.isArray(work?.segments) && work.segments.length ? work.segments : [{ start: work?.officeStart || '09:00', end: work?.officeEnd || '17:00' }];
  return rows.filter(row => /^\d\d:\d\d$/.test(row.start) && /^\d\d:\d\d$/.test(row.end)).sort((a, b) => minuteOf(a.start) - minuteOf(b.start));
}

function scheduledPeriod(value, segments) {
  if (!segments.length) return null;
  const now = new Date(value).getTime();
  const dayStart = Date.parse(`${dhakaDay(value)}T00:00:00+06:00`);
  const periods = [];
  for (let day = -1; day <= 1; day++) for (let index = 0; index < segments.length; index++) {
    const row = segments[index];
    const start = dayStart + day * 86400000 + minuteOf(row.start) * 60000;
    const end = dayStart + day * 86400000 + (minuteOf(row.end) <= minuteOf(row.start) ? minuteOf(row.end) + 1440 : minuteOf(row.end)) * 60000;
    periods.push({ index, start, end, expected: row.start });
  }
  const inside = periods.find(row => now >= row.start && now <= row.end);
  if (inside) return inside;
  const lateOvernight = periods.filter(row => minuteOf(segments[row.index].end) <= minuteOf(segments[row.index].start) && row.end < now && now - row.end <= 2 * 3600000).sort((a, b) => b.end - a.end)[0];
  if (lateOvernight) return lateOvernight;
  return periods.filter(row => row.start > now).sort((a, b) => a.start - b.start)[0] || periods.at(-1);
}

function dutyDayFor(value, work) {
  const calendarDay = dhakaDay(value);
  const segments = dutySegments(work);
  const selected = scheduledPeriod(value, segments);
  if (!selected) return calendarDay;
  const segment = segments[selected.index];
  if (minuteOf(segment.end) >= minuteOf(segment.start)) return calendarDay;
  const selectedDay = dhakaDay(selected.start);
  return selectedDay < calendarDay ? selectedDay : calendarDay;
}

function checkInState(punches = [], work, now = new Date()) {
  const segments = dutySegments(work);
  const selected = scheduledPeriod(now, segments);
  const rows = punches.filter(punch => dhakaDay(punch.checkedInAt) === dhakaDay(now));
  const covered = Boolean(selected && punches.some(punch => scheduledPeriod(punch.checkedInAt, segments)?.start === selected.start));
  const delta = selected ? Math.round((new Date(now).getTime() - selected.start) / 60000) : null;
  return { segments, period: selected?.index ?? -1, expected: selected?.expected ?? null, delta, covered, rows };
}

function punctuality(punch, work) {
  const segments = dutySegments(work);
  const selected = scheduledPeriod(punch.checkedInAt, segments);
  const delta = selected ? Math.round((new Date(punch.checkedInAt).getTime() - selected.start) / 60000) : null;
  return { expected: selected?.expected ?? null, delta, label: delta === null ? 'Unscheduled' : delta < 0 ? `${duration(-delta)} early` : delta > 0 ? `${duration(delta)} late` : 'On time' };
}

function duration(minutes) { const hours = Math.floor(minutes / 60); const rest = minutes % 60; return [hours ? `${hours}h` : '', rest ? `${rest}m` : ''].filter(Boolean).join(' ') || '0m'; }

module.exports = { dhakaDay, dhakaClock, minuteOf, localMinute, dutySegments, scheduledPeriod, dutyDayFor, checkInState, punctuality };
