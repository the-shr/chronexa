import { useMemo, useState } from 'react';

import { humanDuration, clockTime, isSameDay, STOP_REASONS } from '../lib/format.js';
import { useDailyTotals, useSessions, useSettings } from '../lib/hooks.js';
import { IconChevron } from '../components/Icons.jsx';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Calendar() {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selected, setSelected] = useState(new Date().toISOString());
  const daily = useDailyTotals(90);
  const sessions = useSessions(400);
  const [settings] = useSettings();

  const month = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const totalsByDay = useMemo(() => {
    const map = new Map();
    for (const row of daily) map.set(new Date(row.date).toDateString(), row);
    return map;
  }, [daily]);

  const cells = useMemo(() => buildMonth(month), [month]);
  const daySessions = sessions.filter((s) => isSameDay(s.startedAt, selected));
  const selectedTotals = totalsByDay.get(new Date(selected).toDateString());
  const countIdle = settings?.idle.countIdleAsWork;

  const monthTotal = cells.reduce((sum, cell) => {
    if (!cell) return sum;
    const row = totalsByDay.get(cell.toDateString());
    if (!row) return sum;
    return sum + row.activeSeconds + (countIdle ? row.idleSeconds : 0);
  }, 0);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Calendar</h1>
          <p>Your tracked time, day by day</p>
        </div>
      </header>

      <div className="grid-main grid-cal">
        <section className="card">
          <div className="cal-head">
            <button className="icon-btn" onClick={() => setMonthOffset((m) => m - 1)} title="Previous month">
              <IconChevron width={15} height={15} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <h2>{month.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h2>
            <button
              className="icon-btn"
              onClick={() => setMonthOffset((m) => m + 1)}
              disabled={monthOffset >= 0}
              title="Next month"
            >
              <IconChevron width={15} height={15} />
            </button>
          </div>

          <div className="cal-grid">
            {DOW.map((d) => (
              <div className="cal-dow" key={d}>
                {d}
              </div>
            ))}
            {cells.map((date, i) => {
              if (!date) return <div className="cal-day empty" key={`e${i}`} />;
              const row = totalsByDay.get(date.toDateString());
              const worked = row ? row.activeSeconds + (countIdle ? row.idleSeconds : 0) : 0;
              const future = date > new Date();
              const classes = ['cal-day'];
              if (isSameDay(date, new Date())) classes.push('today');
              if (future) classes.push('future');
              return (
                <button
                  className={classes.join(' ')}
                  key={date.toISOString()}
                  onClick={() => setSelected(date.toISOString())}
                  style={
                    isSameDay(date, selected) ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : undefined
                  }
                >
                  <b>{date.getDate()}</b>
                  {worked > 0 ? <em>{humanDuration(worked)}</em> : <span className="dot-row" />}
                </button>
              );
            })}
          </div>

          <p className="faint" style={{ marginBottom: 0, marginTop: 14, fontSize: 12 }}>
            {monthTotal > 0 ? `${humanDuration(monthTotal)} tracked this month` : 'Nothing tracked this month yet'}
          </p>
        </section>

        <section className="card">
          <h2>
            {new Date(selected).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
            {selectedTotals && (
              <span className="faint">
                {humanDuration(selectedTotals.activeSeconds)} active · {humanDuration(selectedTotals.idleSeconds)} idle
              </span>
            )}
          </h2>

          {daySessions.length === 0 ? (
            <p className="empty">No sessions on this day.</p>
          ) : (
            <div className="rows">
              {daySessions.map((s) => (
                <div className="row" key={s.id}>
                  <span className="mono faint" style={{ width: 96 }}>
                    {clockTime(s.startedAt)} – {s.endedAt ? clockTime(s.endedAt) : 'now'}
                  </span>
                  <div className="row-main">
                    <div>{s.taskNote || <span className="faint">No task</span>}</div>
                    <div className="faint" style={{ fontSize: 12 }}>
                      {STOP_REASONS[s.stopReason] || (s.endedAt ? s.stopReason : 'In progress')}
                    </div>
                  </div>
                  <span className="mono">{humanDuration(s.activeSeconds)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/** Month laid out Monday-first, padded with nulls so the grid aligns. */
function buildMonth(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // shift Sunday=0 to Monday=0
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  const cells = Array(lead).fill(null);
  for (let d = 1; d <= days; d += 1) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
