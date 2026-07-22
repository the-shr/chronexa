import { useMemo, useState } from 'react';

import { usePager, ROW } from '../components/Pager.jsx';
import { humanDuration, clockTime, isSameDay, STOP_REASONS } from '../lib/format.js';
import { useDailyTotals, useSessions, useSettings } from '../lib/hooks.js';
import { IconChevron } from '../components/Icons.jsx';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Calendar() {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selected, setSelected] = useState(new Date().toISOString());
  const daily = useDailyTotals(120);
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
  const daySessions = useMemo(() => sessions.filter((s) => isSameDay(s.startedAt, selected)), [sessions, selected]);
  const { ref, slice, control } = usePager(daySessions, { rowHeight: ROW.session });

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
        <div className="head-main">
          <h1>Calendar</h1>
          <p>Your tracked time, day by day</p>
        </div>
        <button className="icon-btn" onClick={() => setMonthOffset((m) => m - 1)} title="Previous month">
          <IconChevron width={15} height={15} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <strong style={{ minWidth: 132, textAlign: 'center' }}>
          {month.toLocaleDateString([], { month: 'long', year: 'numeric' })}
        </strong>
        <button
          className="icon-btn"
          onClick={() => setMonthOffset((m) => m + 1)}
          disabled={monthOffset >= 0}
          title="Next month"
        >
          <IconChevron width={15} height={15} />
        </button>
      </header>

      <div className="page-body" style={{ gridTemplateColumns: 'minmax(360px, 1.15fr) minmax(0, 1fr)' }}>
        <section className="card">
          <h2>
            {monthTotal > 0 ? `${humanDuration(monthTotal)} this month` : 'Nothing tracked this month'}
          </h2>
          <div className="cal-grid-head">
            {DOW.map((d) => (
              <div className="cal-dow" key={d}>
                {d}
              </div>
            ))}
          </div>
          <div className="cal-grid">
            {cells.map((date, i) => {
              if (!date) return <div className="cal-day empty" key={`e${i}`} />;
              const row = totalsByDay.get(date.toDateString());
              const worked = row ? row.activeSeconds + (countIdle ? row.idleSeconds : 0) : 0;
              const classes = ['cal-day'];
              if (date > new Date()) classes.push('future');
              if (isSameDay(date, new Date())) classes.push('today');
              if (isSameDay(date, selected)) classes.push('selected');
              return (
                <button className={classes.join(' ')} key={date.toISOString()} onClick={() => setSelected(date.toISOString())}>
                  <b>{date.getDate()}</b>
                  {worked > 0 && <em>{humanDuration(worked)}</em>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="card">
          <h2>
            {new Date(selected).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })}
            {control}
          </h2>
          {selectedTotals && (selectedTotals.activeSeconds > 0 || selectedTotals.idleSeconds > 0) && (
            <div className="stat-row" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginBottom: 12, flex: 'none' }}>
              <div className="stat">
                <div className="stat-label">
                  <span className="stat-dot" style={{ background: 'var(--accent)' }} />
                  Active
                </div>
                <strong className="mono">{humanDuration(selectedTotals.activeSeconds)}</strong>
              </div>
              <div className="stat">
                <div className="stat-label">
                  <span className="stat-dot" style={{ background: 'var(--warn)' }} />
                  Idle
                </div>
                <strong className="mono">{humanDuration(selectedTotals.idleSeconds)}</strong>
              </div>
            </div>
          )}

          <div className="rows" ref={ref}>
            {slice.length === 0 ? (
              <p className="empty">No sessions on this day.</p>
            ) : (
              slice.map((s) => (
                <div className="row" key={s.id}>
                  <span className="mono faint" style={{ width: 104, flex: 'none' }}>
                    {clockTime(s.startedAt)} – {s.endedAt ? clockTime(s.endedAt) : 'now'}
                  </span>
                  <div className="row-main">
                    <div className="truncate">{s.taskNote || <span className="faint">No task</span>}</div>
                    <div className="faint truncate" style={{ fontSize: 12 }}>
                      {STOP_REASONS[s.stopReason] || (s.endedAt ? s.stopReason : 'In progress')}
                    </div>
                  </div>
                  <span className="mono">{humanDuration(s.activeSeconds)}</span>
                </div>
              ))
            )}
          </div>
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
