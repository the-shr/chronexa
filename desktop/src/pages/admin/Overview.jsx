import { useOverview } from '../../lib/admin-hooks.js';
import { usePager, ROW } from '../../components/Pager.jsx';
import { humanDuration, clockTime, weekdayShort, isSameDay } from '../../lib/format.js';
import { Avatar, LiveDot, LoadError } from '../../components/admin-bits.jsx';
import { IconArrowOut, IconClock, IconList, IconTarget, IconUsers } from '../../components/Icons.jsx';

/** The admin's home page: the whole team at a glance, in one screen. */
export default function Overview({ account, onOpenPerson }) {
  const { data, error, loading, reload } = useOverview(7);
  const people = data?.people || [];
  const team = data?.team;

  // Whoever is tracking right now goes first -- that is what an admin looks at.
  const sorted = [...people].sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    return b.todayActive - a.todayActive;
  });

  const { ref, slice, control } = usePager(sorted, { rowHeight: ROW.person, gap: 6 });

  if (error && !data) return <LoadError error={error} onRetry={reload} />;
  if (!team) return <p className="empty">{loading ? 'Loading the team…' : 'No data yet.'}</p>;

  return (
    <>
      <header className="greeting">
        <h1>
          Good to see you, <span>{firstName(account)}</span>
        </h1>
      </header>

      <TeamMetrics team={team} />

      <div className="page-body admin-grid">
        <TeamProgress team={team} />
        <LiveCard people={sorted} onOpenPerson={onOpenPerson} />

        <section className="card people-card">
          <div className="checklist-head">
            <h2>Team today</h2>
            {control || <strong className="mono">{people.length}</strong>}
          </div>

          <div className="people-list" ref={ref}>
            {slice.length === 0 ? (
              <p className="empty">No employees yet. Add one from People.</p>
            ) : (
              slice.map((p) => (
                <button className="person-row" key={p.id} onClick={() => onOpenPerson(p.id)}>
                  <Avatar name={p.name} live={p.live} />
                  <span className="person-id">
                    <strong className="truncate">{p.name}</strong>
                    <small className="truncate">
                      {p.live ? p.currentTask || 'Tracking now' : lastSeenLabel(p.lastSeenAt)}
                    </small>
                  </span>
                  <span className="person-figures">
                    <b className="mono">{humanDuration(p.todayActive)}</b>
                    <small className="mono">{humanDuration(p.todayIdle)} idle</small>
                  </span>
                  <span className="person-bar" title={`${p.tasksOpen} open task(s)`}>
                    <i style={{ height: `${barHeight(p.todayActive)}%` }} />
                  </span>
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </>
  );
}

/* ------------------------------- metrics -------------------------------- */

function TeamMetrics({ team }) {
  const span = team.todayActive + team.todayIdle;
  const pct = (value, of) => (of > 0 ? Math.min(100, Math.round((value / of) * 100)) : 0);
  const tasksTotal = team.tasksOpen + team.tasksDone;

  const bars = [
    { label: 'Active', percent: pct(team.todayActive, span), tone: 'deep' },
    { label: 'Idle', percent: pct(team.todayIdle, span), tone: 'idle' },
    { label: 'On the clock', percent: pct(team.tracking, team.headcount), tone: 'deep' },
    { label: 'Tasks done', percent: pct(team.tasksDone, tasksTotal), tone: 'bright', wide: true },
  ];

  return (
    <div className="metric-row">
      <div className="metric-bars">
        {bars.map((b) => (
          <div className={b.wide ? 'metric wide' : 'metric'} key={b.label}>
            <span className="metric-label">{b.label}</span>
            <span className={`metric-bar ${b.tone}`}>{b.percent}%</span>
          </div>
        ))}
        <div className="metric hatched" aria-hidden="true">
          <span className="metric-label">&nbsp;</span>
          <span className="metric-bar hatch" />
        </div>
        <div className="metric">
          <span className="metric-label">Idle stops</span>
          <span className="metric-bar outline">{team.idleStops}</span>
        </div>
      </div>

      <div className="figures">
        <Figure icon={<IconClock width={13} height={13} />} value={humanDuration(team.todayActive)} label="Team today" />
        <Figure icon={<IconUsers width={13} height={13} />} value={`${team.tracking}/${team.headcount}`} label="Tracking" />
        <Figure icon={<IconList width={13} height={13} />} value={String(team.tasksOpen)} label="Open tasks" />
        <Figure icon={<IconTarget width={13} height={13} />} value={humanDuration(team.weekActive)} label="This week" />
      </div>
    </div>
  );
}

function Figure({ icon, value, label }) {
  return (
    <div className="figure">
      <strong className="mono">{value}</strong>
      <span>
        {icon}
        {label}
      </span>
    </div>
  );
}

/* ------------------------------- progress ------------------------------- */

function TeamProgress({ team }) {
  const totals = team.daily.map((d) => d.activeSeconds);
  const peak = Math.max(...totals, 3600);
  const best = totals.indexOf(Math.max(...totals));

  return (
    <section className="card progress-card">
      <h2>
        Team hours
        <span className="corner">
          <IconArrowOut width={13} height={13} />
        </span>
      </h2>

      <div className="progress-head">
        <strong className="mono">{humanDuration(team.weekActive)}</strong>
        <span>
          Tracked
          <br />
          this week
        </span>
      </div>

      <div className="chart">
        {team.daily.map((row, i) => {
          const value = totals[i];
          const today = isSameDay(row.date, new Date());
          return (
            <div className={today ? 'chart-col is-today' : 'chart-col'} key={row.date}>
              {i === best && value > 0 && <span className="chart-tip mono">{humanDuration(value)}</span>}
              <div className="chart-bar-space">
                <div
                  className={value > 0 ? 'chart-bar' : 'chart-bar empty'}
                  style={{ height: `${Math.max(3, (value / peak) * 100)}%` }}
                  title={`${humanDuration(row.activeSeconds)} active · ${humanDuration(row.idleSeconds)} idle`}
                />
              </div>
              <span className="chart-day">{weekdayShort(row.date)[0]}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* --------------------------------- live --------------------------------- */

function LiveCard({ people, onOpenPerson }) {
  const live = people.filter((p) => p.live);
  const { ref, slice, control } = usePager(live, { rowHeight: ROW.live, gap: 6 });

  return (
    <section className="card live-card">
      <div className="checklist-head">
        <h2>Working now</h2>
        {control || <strong className="mono">{live.length}</strong>}
      </div>

      <div className="live-list" ref={ref}>
        {slice.length === 0 ? (
          <p className="empty">Nobody is tracking at the moment.</p>
        ) : (
          slice.map((p) => (
            <button className="live-row" key={p.id} onClick={() => onOpenPerson(p.id)}>
              <LiveDot />
              <span className="live-text">
                <strong className="truncate">{p.name}</strong>
                <small className="truncate">{p.currentTask || 'Tracked time'}</small>
              </span>
              <b className="mono">{humanDuration(p.todayActive)}</b>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

/* -------------------------------- helpers ------------------------------- */

function barHeight(seconds) {
  return Math.max(6, Math.min(100, (seconds / (8 * 3600)) * 100));
}

function lastSeenLabel(iso) {
  if (!iso) return 'Never signed in';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `Last seen ${clockTime(iso)}`;
  return `Last seen ${new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
}

function firstName(account) {
  const name = account?.user?.name || account?.user?.email || 'there';
  return name.split(/[\s@]/)[0];
}
