import { useState } from 'react';

import { humanDuration, clockTime, dueLabel, weekdayShort, isSameDay } from '../lib/format.js';
import {
  IconArrowOut,
  IconPlay,
  IconPause,
  IconStop,
  IconCheck,
  IconChevronDown,
  IconLaptop,
  IconTarget,
  IconSync,
  IconList,
  IconClock,
  IconPlus,
  IconGrip,
  IconTrash,
} from './Icons.jsx';

/* ------------------------------- metrics -------------------------------- */

/**
 * The labelled bars and headline figures under the greeting. Each bar is a
 * separate measure of the day rather than a slice of one total, which is why
 * they are sized independently and each carries its own percentage.
 */
export function MetricRow({ snapshot, settings, tasks, weekSeconds }) {
  const { today } = snapshot;
  const span = today.activeSeconds + today.idleSeconds;
  const dailyTarget = (settings.work?.dailyTargetHours || 0) * 3600;
  const weeklyTarget = (settings.work?.weeklyTargetHours || 0) * 3600;

  const pct = (value, of) => (of > 0 ? Math.min(100, Math.round((value / of) * 100)) : 0);

  const bars = [
    { label: 'Active', percent: span ? pct(today.activeSeconds, span) : 0, tone: 'deep' },
    { label: 'Idle', percent: span ? pct(today.idleSeconds, span) : 0, tone: 'idle' },
    { label: 'Today', percent: dailyTarget ? pct(today.workSeconds, dailyTarget) : 0, tone: 'deep' },
    { label: 'This week', percent: weeklyTarget ? pct(weekSeconds, weeklyTarget) : 0, tone: 'bright', wide: true },
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
          <span className="metric-label">Productive</span>
          <span className="metric-bar outline">{today.productivity === null ? '—' : `${today.productivity}%`}</span>
        </div>
      </div>

      <div className="figures">
        <Figure icon={<IconClock width={13} height={13} />} value={humanDuration(today.workSeconds)} label="Today" />
        <Figure icon={<IconList width={13} height={13} />} value={String(tasks.open.length)} label="Open tasks" />
        <Figure icon={<IconTarget width={13} height={13} />} value={humanDuration(weekSeconds)} label="This week" />
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

/* ------------------------------- profile -------------------------------- */

export function ProfileCard({ account, snapshot }) {
  const name = account?.user?.name || account?.user?.email || 'Not signed in';
  const role = account?.signedIn ? account.user?.email : 'Sign in from Settings';

  return (
    <section className="card profile-card">
      <div className="profile-photo">
        <span>{initials(name)}</span>
      </div>
      <div className="profile-over">
        <div className="profile-id">
          <strong className="truncate">{name}</strong>
          <small className="truncate">{role}</small>
        </div>
        <span className="profile-badge mono">{humanDuration(snapshot.today.workSeconds)}</span>
      </div>
    </section>
  );
}

function initials(name) {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/* ------------------------------ info column ----------------------------- */

/** The expandable list under the profile, as in the reference. */
export function InfoCard({ account, settings, sync }) {
  const [open, setOpen] = useState('device');

  const rows = [
    {
      id: 'device',
      label: 'This computer',
      body: (
        <div className="info-detail">
          <span className="info-icon">
            <IconLaptop width={15} height={15} />
          </span>
          <div className="info-detail-text">
            <strong className="truncate">{account?.deviceName || 'Unknown device'}</strong>
            <small>{account?.signedIn ? 'Reporting your hours' : 'Not signed in'}</small>
          </div>
        </div>
      ),
    },
    {
      id: 'target',
      label: 'Work target',
      body: (
        <p className="info-text">
          {settings.work?.dailyTargetHours
            ? `${settings.work.dailyTargetHours} hours a day, ${settings.work.weeklyTargetHours} a week.`
            : 'No target set by your organisation.'}
        </p>
      ),
    },
    {
      id: 'idle',
      label: 'Idle rule',
      body: (
        <p className="info-text">
          Marked idle after {settings.idle.thresholdMinutes} minutes without input. The timer pauses and starts again
          on its own.
        </p>
      ),
    },
    {
      id: 'sync',
      label: 'Sync',
      body: (
        <div className="info-detail">
          <span className="info-icon">
            <IconSync width={15} height={15} />
          </span>
          <div className="info-detail-text">
            <strong>{sync?.at ? `Synced ${clockTime(sync.at)}` : 'Not synced yet'}</strong>
            <small>{sync?.pending ? `${sync.pending} waiting to upload` : 'Everything is up to date'}</small>
          </div>
        </div>
      ),
    },
  ];

  return (
    <section className="card info-card">
      {rows.map((row) => (
        <div className={open === row.id ? 'info-row open' : 'info-row'} key={row.id}>
          <button className="info-head" onClick={() => setOpen(open === row.id ? null : row.id)}>
            <span>{row.label}</span>
            <IconChevronDown width={14} height={14} />
          </button>
          {open === row.id && <div className="info-body">{row.body}</div>}
        </div>
      ))}
    </section>
  );
}

/* ------------------------------- progress ------------------------------- */

export function ProgressCard({ rows, weekSeconds, countIdle }) {
  const totals = rows.map((r) => r.activeSeconds + (countIdle ? r.idleSeconds : 0));
  const peak = Math.max(...totals, 3600);
  const best = totals.indexOf(Math.max(...totals));

  return (
    <section className="card progress-card">
      <h2>
        Progress
        <span className="corner">
          <IconArrowOut width={13} height={13} />
        </span>
      </h2>

      <div className="progress-head">
        <strong className="mono">{humanDuration(weekSeconds)}</strong>
        <span>
          Work time
          <br />
          this week
        </span>
      </div>

      <div className="chart">
        {rows.map((row, i) => {
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

/* ------------------------------- tracker -------------------------------- */

export function TrackerCard({ snapshot, settings, busy, onAction }) {
  const { state, idlePhase, session, today } = snapshot;
  const running = state === 'running';
  const paused = state === 'paused';
  const idle = running && idlePhase !== 'active';

  const target = (settings.work?.dailyTargetHours || 0) * 3600;
  const progress = target ? Math.min(1, today.workSeconds / target) : 0;
  const colour = idle ? 'var(--idle)' : running ? 'var(--accent)' : 'var(--text-faint)';

  return (
    <section className="card tracker-card">
      <h2>
        Time tracker
        <span className="corner">
          <IconArrowOut width={13} height={13} />
        </span>
      </h2>

      <div className="ring-wrap">
        <div
          className="ring"
          data-target={target ? 'set' : 'none'}
          style={{ '--progress': progress, '--ring-color': colour }}
        >
          <div className="ring-inner">
            <span className="ring-time mono">{shortClock(session ? session.activeSeconds : 0)}</span>
            <span className="ring-label">{idle ? 'paused' : running ? 'work time' : 'not started'}</span>
          </div>
        </div>
      </div>

      <div className="tracker-controls">
        {running ? (
          <button className="round-ctl" disabled={busy} onClick={() => onAction(() => window.api.tracker.pause())} title="Pause">
            <IconPause width={15} height={15} />
          </button>
        ) : (
          <button
            className="round-ctl"
            disabled={busy}
            onClick={() => onAction(() => (paused ? window.api.tracker.resume() : window.api.tracker.start({})))}
            title={paused ? 'Resume' : 'Start'}
          >
            <IconPlay width={15} height={15} />
          </button>
        )}

        <button
          className="round-ctl solid"
          disabled={busy || (!running && !paused)}
          onClick={() => onAction(() => window.api.tracker.stop('manual'))}
          title="Stop"
        >
          <IconStop width={13} height={13} />
        </button>
      </div>
    </section>
  );
}

function shortClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

/* ------------------------------- today split ---------------------------- */

export function TodayCard({ snapshot, settings }) {
  const { today } = snapshot;
  const target = (settings.work?.dailyTargetHours || 0) * 3600;
  const done = target ? Math.min(100, Math.round((today.workSeconds / target) * 100)) : null;
  const span = today.activeSeconds + today.idleSeconds;

  const parts = [
    { label: 'Active', percent: span ? Math.round((today.activeSeconds / span) * 100) : 0, tone: 'bright' },
    { label: 'Idle', percent: span ? Math.round((today.idleSeconds / span) * 100) : 0, tone: 'idle' },
    { label: 'Left', percent: done === null ? 0 : 100 - done, tone: 'muted' },
  ];

  return (
    <section className="card today-card">
      <div className="today-head">
        <h2>Today</h2>
        <strong className="mono">{done === null ? humanDuration(today.workSeconds) : `${done}%`}</strong>
      </div>
      <div className="today-parts">
        {parts.map((p) => (
          <div className="today-part" key={p.label} style={{ flexGrow: 1 + p.percent / 40 }}>
            <span className="today-pct">{p.percent}%</span>
            <span className={`today-bar ${p.tone}`}>{p.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------- checklist ------------------------------ */

export function ChecklistCard({ tasks, busy, onAction, listRef, slice }) {
  const [title, setTitle] = useState('');
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  const done = tasks.done.length;
  const total = tasks.open.length + done;

  const submit = (event) => {
    event.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    setTitle('');
    onAction(() => tasks.add(clean));
  };

  /**
   * Reordering moves the dragged task within the full open list, not just the
   * visible page, so dropping on the last row of page one cannot silently
   * reshuffle the rest.
   *
   * The id travels in the dataTransfer rather than in state: React has not
   * necessarily re-rendered between dragstart and drop, so reading it from
   * state can still see null.
   */
  const drop = (event, targetId) => {
    const sourceId = event.dataTransfer.getData('text/plain');
    setOverId(null);
    setDragId(null);
    if (!sourceId || sourceId === targetId) return undefined;

    const ids = tasks.open.map((t) => t.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return undefined;

    ids.splice(to, 0, ids.splice(from, 1)[0]);
    return onAction(() => tasks.reorder(ids));
  };

  return (
    <section className="card checklist-card">
      <div className="checklist-head">
        <h2>Your tasks</h2>
        <strong className="mono">
          {done}/{total || 0}
        </strong>
      </div>

      <form className="check-add" onSubmit={submit}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task of your own"
          maxLength={200}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !title.trim()} title="Add task">
          <IconPlus width={14} height={14} />
        </button>
      </form>

      <div className="checklist" ref={listRef}>
        {slice.length === 0 ? (
          <p className="empty">Nothing here yet. Add one above, or wait for your manager to assign work.</p>
        ) : (
          slice.map((task) => {
            const due = dueLabel(task.dueAt);
            const mine = task.source === 'self';
            return (
              <div
                key={task.id}
                className={[
                  'check-item',
                  dragId === task.id && 'dragging',
                  overId === task.id && 'drop-target',
                  task.pending && 'pending',
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable={!busy}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', task.id);
                  e.dataTransfer.effectAllowed = 'move';
                  setDragId(task.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (overId !== task.id) setOverId(task.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(e, task.id);
                }}
              >
                <span className="check-grip" title="Drag to reorder">
                  <IconGrip width={13} height={13} />
                </span>
                <span className="check-text">
                  <span className="truncate">{task.title}</span>
                  <small className={due?.overdue ? 'overdue' : undefined}>
                    {due ? due.text : mine ? 'Added by you' : task.priority === 'high' ? 'High priority' : 'Assigned'}
                  </small>
                </span>

                {mine && (
                  <button
                    className="check-remove"
                    disabled={busy}
                    onClick={() => onAction(() => tasks.remove(task.id))}
                    title="Delete this task"
                  >
                    <IconTrash width={12} height={12} />
                  </button>
                )}

                <button
                  className="check-btn"
                  disabled={busy}
                  onClick={() => onAction(() => tasks.setStatus(task.id, 'done'))}
                  title="Mark done"
                >
                  <IconCheck width={12} height={12} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

/* -------------------------------- schedule ------------------------------ */

const DAY_START = 8;
const DAY_END = 20;

/** The week laid out as day columns with sessions positioned by time. */
export function ScheduleCard({ sessions }) {
  const [offset, setOffset] = useState(0);
  const days = weekDays(offset);
  const month = days[0].toLocaleDateString([], { month: 'long', year: 'numeric' });
  const span = (DAY_END - DAY_START) * 3600;

  const hours = [];
  for (let h = DAY_START; h < DAY_END; h += 3) hours.push(h);

  const secondsInto = (iso) => {
    const d = new Date(iso);
    return d.getHours() * 3600 + d.getMinutes() * 60 - DAY_START * 3600;
  };

  return (
    <section className="card schedule-card">
      <div className="schedule-head">
        <button className="month-pill" onClick={() => setOffset((o) => o - 1)}>
          Previous
        </button>
        <strong>{month}</strong>
        <button className="month-pill" onClick={() => setOffset((o) => o + 1)} disabled={offset >= 0}>
          Next
        </button>
      </div>

      <div className="schedule-grid">
        <div className="schedule-hours">
          {hours.map((h) => (
            <span key={h}>{`${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`}</span>
          ))}
        </div>

        <div className="schedule-days">
          {days.map((day) => {
            const rows = sessions.filter((s) => isSameDay(s.startedAt, day));
            return (
              <div className={isSameDay(day, new Date()) ? 'schedule-day is-today' : 'schedule-day'} key={day.toISOString()}>
                <span className="schedule-dow">
                  {day.toLocaleDateString([], { weekday: 'short' })}
                  <b>{day.getDate()}</b>
                </span>
                <div className="schedule-lane">
                  {hours.map((h) => (
                    <i key={h} style={{ top: `${(((h - DAY_START) * 3600) / span) * 100}%` }} />
                  ))}
                  {rows.map((s) => {
                    const from = Math.max(0, secondsInto(s.startedAt));
                    const to = s.endedAt ? secondsInto(s.endedAt) : secondsInto(new Date().toISOString());
                    if (from > span) return null;
                    return (
                      <div
                        key={s.id}
                        className={s.endedAt ? 'schedule-event' : 'schedule-event live'}
                        style={{
                          top: `${(from / span) * 100}%`,
                          height: `${Math.max(9, ((Math.min(to, span) - from) / span) * 100)}%`,
                        }}
                        title={`${clockTime(s.startedAt)} – ${s.endedAt ? clockTime(s.endedAt) : 'now'} · ${humanDuration(s.activeSeconds)}`}
                      >
                        <span className="truncate">{s.taskNote || 'Tracked time'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Monday-first week, shifted by `offset` weeks. */
function weekDays(offset) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}
