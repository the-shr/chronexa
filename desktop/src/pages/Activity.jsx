import WeekChart from '../components/WeekChart.jsx';
import { usePager, ROW } from '../components/Pager.jsx';
import { humanDuration, clockTime, dayLabel, STOP_REASONS } from '../lib/format.js';
import { useDailyTotals, useSessions, useSettings } from '../lib/hooks.js';

export default function Activity() {
  const daily = useDailyTotals(14);
  const sessions = useSessions(120);
  const [settings] = useSettings();
  const { ref, slice, control } = usePager(sessions, { rowHeight: ROW.session });

  if (!settings) return null;

  const week = daily.slice(-7);
  const previous = daily.slice(0, 7);
  const countIdle = settings.idle.countIdleAsWork;

  const worked = (rows) => rows.reduce((sum, r) => sum + r.activeSeconds + (countIdle ? r.idleSeconds : 0), 0);
  const thisWeek = worked(week);
  const lastWeek = worked(previous);
  const activeTotal = week.reduce((sum, r) => sum + r.activeSeconds, 0);
  const idleTotal = week.reduce((sum, r) => sum + r.idleSeconds, 0);
  const productivity = activeTotal + idleTotal > 0 ? Math.round((activeTotal / (activeTotal + idleTotal)) * 100) : null;
  const daysWorked = week.filter((r) => r.activeSeconds > 0).length;
  const change = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;
  const target = (settings.work?.weeklyTargetHours || 0) * 3600;

  return (
    <>
      <header className="page-head">
        <div className="head-main">
          <h1>Activity</h1>
          <p>How your last two weeks look</p>
        </div>
      </header>

      <div className="page-body" style={{ gridTemplateRows: 'auto minmax(140px, 200px) minmax(0, 1fr)' }}>
        <div className="stat-row" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <Stat
            label="This week"
            dot="var(--accent)"
            value={humanDuration(thisWeek)}
            note={
              target > 0
                ? `${Math.round((thisWeek / target) * 100)}% of your ${settings.work.weeklyTargetHours}h week`
                : change === null
                  ? 'no prior week'
                  : `${change >= 0 ? '+' : ''}${change}% vs last week`
            }
          />
          <Stat
            label="Daily average"
            dot="var(--accent)"
            value={humanDuration(daysWorked ? thisWeek / daysWorked : 0)}
            note={`over ${daysWorked} day${daysWorked === 1 ? '' : 's'}`}
          />
          <Stat
            label="Idle this week"
            dot="var(--warn)"
            value={humanDuration(idleTotal)}
            note={countIdle ? 'counted as work' : 'not counted'}
          />
          <Stat
            label="Productivity"
            dot="var(--ok)"
            value={productivity === null ? '—' : `${productivity}%`}
            note="active share"
          />
        </div>

        <section className="card">
          <h2>
            Last 7 days
            <span className="legend">
              <span>
                <i style={{ background: 'var(--accent)' }} />
                Active
              </span>
              <span>
                <i style={{ background: 'var(--warn)', opacity: 0.5 }} />
                Idle
              </span>
            </span>
          </h2>
          <WeekChart rows={week} />
        </section>

        <section className="card">
          <h2>
            Recent sessions
            {control}
          </h2>
          <div className="rows" ref={ref}>
            {slice.length === 0 ? (
              <p className="empty">No sessions yet.</p>
            ) : (
              slice.map((s) => (
                <div className="row" key={s.id}>
                  <span className="faint" style={{ width: 74, flex: 'none' }}>
                    {dayLabel(s.startedAt)}
                  </span>
                  <span className="mono faint" style={{ width: 104, flex: 'none' }}>
                    {clockTime(s.startedAt)} – {s.endedAt ? clockTime(s.endedAt) : 'now'}
                  </span>
                  <div className="row-main">
                    <div className="truncate">{s.taskNote || <span className="faint">No task</span>}</div>
                    <div className="faint truncate" style={{ fontSize: 12 }}>
                      {STOP_REASONS[s.stopReason] || (s.endedAt ? s.stopReason : 'In progress')}
                      {s.idleSeconds > 0 && ` · ${humanDuration(s.idleSeconds)} idle`}
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

function Stat({ label, value, note, dot }) {
  return (
    <div className="stat">
      <div className="stat-label">
        <span className="stat-dot" style={{ background: dot }} />
        {label}
      </div>
      <strong className="mono">{value}</strong>
      <small>{note}</small>
    </div>
  );
}
