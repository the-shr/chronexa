import { useEffect, useMemo, useState } from 'react';

import { humanDuration, clockTime, dueLabel, weekdayShort, isSameDay } from '../lib/format.js';
import {
  IconArrowOut,
  IconPlay,
  IconPause,
  IconStop,
  IconCheck,
  IconChevronDown,
  IconTarget,
  IconSync,
  IconList,
  IconClock,
  IconPlus,
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

export function ProfileCard({ account, snapshot, profile }) {
  const name = account?.user?.name || account?.user?.email || 'Not signed in';
  const role = account?.signedIn ? account.user?.email : 'Sign in from Settings';

  return (
    <section className="card profile-card">
      <div className="profile-photo">
        {profile?.avatar ? <img src={profile.avatar} alt="" /> : <span>{initials(name)}</span>}
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

export function WorkConsistencyCard({ rows, sessions, settings }) {
  const target = (settings.work?.dailyTargetHours || 0) * 3600;
  const totals = rows.map((row) => row.activeSeconds + (settings.idle?.countIdleAsWork ? row.idleSeconds : 0));
  const achieved = target ? totals.filter((total) => total >= target).length : 0;
  let streak = 0;
  for (let index = totals.length - 1; index >= 0 && (!target || totals[index] >= target); index -= 1) streak += 1;
  const starts = sessions.map((session) => new Date(session.startedAt)).filter((date) => Number.isFinite(date.getTime()));
  const averageStart = starts.length ? new Date(2000, 0, 1, 0, Math.round(starts.reduce((sum, date) => sum + date.getHours() * 60 + date.getMinutes(), 0) / starts.length)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
  const averageSession = sessions.length ? Math.round(sessions.reduce((sum, session) => sum + (session.activeSeconds || 0), 0) / sessions.length) : 0;
  return (
    <section className="card consistency-card tone-green">
      <span className="card-kicker">Work consistency</span>
      <div className="consistency-score"><strong>{achieved}</strong><span>of {rows.length || 7} target days</span></div>
      <div className="consistency-line"><i style={{ width: `${rows.length ? (achieved / rows.length) * 100 : 0}%` }} /></div>
      <div className="consistency-grid"><span><b>{streak}</b>Current streak</span><span><b>{averageStart}</b>Average start</span><span className="wide"><b>{humanDuration(averageSession)}</b>Average focused session</span></div>
      <p className="consistency-week-label">7-day target pattern</p><div className="consistency-week">{rows.map((row, index) => <span key={row.date} className={target && totals[index] >= target ? 'met' : totals[index] > 0 ? 'partial' : ''}><i /><small>{weekdayShort(row.date)[0]}</small></span>)}</div>
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
  const [open, setOpen] = useState('target');

  const rows = [
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

export function ProgressCard({ rows, weekSeconds, countIdle, settings }) {
  const totals = rows.map((r) => r.activeSeconds || 0);
  const dailyTarget = (settings.work?.dailyTargetHours || 0) * 3600;
  const peak = dailyTarget || Math.max(...totals, 3600);
  const best = totals.indexOf(Math.max(...totals));

  return (
    <section className="card progress-card personal-insights-main">
      <div className="personal-insights-title"><div><span className="card-kicker">Weekly signal</span><h2>Personal insights</h2></div></div>

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
                  style={{ height: value > 0 ? `${Math.max(6, Math.min(100, (value / peak) * 100))}%` : '4px' }}
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
  const [timerOpen, setTimerOpen] = useState(false);
  const [timerDuration, setTimerDuration] = useState(5 * 60);
  const [timerLeft, setTimerLeft] = useState(5 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  useEffect(() => {
    if (!timerRunning || timerLeft <= 0) return undefined;
    const id = setInterval(() => setTimerLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(id);
  }, [timerRunning, timerLeft]);
  useEffect(() => { if (timerLeft === 0) setTimerRunning(false); }, [timerLeft]);
  const timerProgress = timerDuration ? Math.max(0, Math.min(1, 1 - timerLeft / timerDuration)) : 0;
  const addTime = (minutes) => { const seconds = minutes * 60; setTimerDuration((value) => value + seconds); setTimerLeft((value) => value + seconds); };
  const setTimer = (minutes) => { const seconds = Math.max(1, minutes) * 60; setTimerDuration(seconds); setTimerLeft(seconds); setTimerRunning(false); };

  return (
    <section className="card tracker-card">
      <div className="tracker-card-head"><div><span className="card-kicker">Live session</span><h2>Time tracker</h2></div><button className="tracker-timer-launch" style={{ '--timer-progress-angle': `${timerProgress * 360}deg` }} onClick={() => setTimerOpen(true)} title="Open focus timer"><span><IconClock width={14} /></span><b className="mono">{countdownClock(timerLeft)}</b></button></div>

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
      {timerOpen && <FocusTimerModal duration={timerDuration} left={timerLeft} running={timerRunning} progress={timerProgress} onClose={() => setTimerOpen(false)} onToggle={() => setTimerRunning((value) => !value)} onStop={() => { setTimerRunning(false); setTimerLeft(0); }} onReset={() => { setTimerRunning(false); setTimerLeft(timerDuration); }} onAdd={addTime} onSet={setTimer} />}
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

function countdownClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function FocusTimerModal({ duration, left, running, progress, onClose, onToggle, onStop, onReset, onAdd, onSet }) {
  const [custom, setCustom] = useState('');
  return <div className="lightbox timer-lightbox" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="focus-timer-modal">
    <button className="timer-modal-close" onClick={onClose} title="Close timer">×</button>
    <span className="card-kicker">Focus timer</span>
    <div className="focus-timer-progress" style={{ '--timer-progress-angle': `${progress * 360}deg` }}><div className="focus-timer-face">
      <button className="timer-side-control play" onClick={onToggle} title={running ? 'Pause timer' : 'Start timer'}>{running ? <IconPause width={25} /> : <IconPlay width={25} />}</button>
      <div className="timer-readout"><strong className="mono">{countdownClock(left)}</strong><span>{running ? 'Counting down' : left === 0 ? 'Stopped' : 'Timer'}</span></div>
      <button className="timer-side-control stop" onClick={onStop} title="Stop timer"><span className="stop-x" /></button>
    </div></div>
    <div className="timer-presets">{[5, 10, 15].map((minutes) => <button key={minutes} onClick={() => onSet(minutes)}>{minutes} min</button>)}</div>
    <div className="timer-modal-actions"><button className="btn" onClick={onReset}>Reset</button><button className="btn" onClick={() => onAdd(5)}>+5 min</button><button className="btn" onClick={() => onAdd(10)}>+10 min</button><span className="timer-add-custom"><input type="number" min="1" max="240" value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Custom minutes" /><button onClick={() => { const minutes = Math.min(240, Math.max(1, Number(custom))); if (minutes) { onSet(minutes); setCustom(''); } }}>Set</button></span></div>
  </section></div>;
}

export function DeadlinePulseCard({ tasks }) {
  const now = new Date(); const end = new Date(now); end.setHours(23, 59, 59, 999);
  const open = tasks.open || [];
  const overdue = open.filter((task) => task.dueAt && new Date(task.dueAt) < now);
  const today = open.filter((task) => task.dueAt && new Date(task.dueAt) >= now && new Date(task.dueAt) <= end);
  const upcoming = open.filter((task) => task.dueAt && new Date(task.dueAt) > end).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const revisions = open.filter((task) => task.hubStatus === 'REVISION_REQUESTED');
  const nearest = [...overdue, ...today, ...upcoming].slice(0, 3);
  return <section className="card deadline-card tone-magenta"><span className="card-kicker">Deadline pulse</span><div className="deadline-metrics"><span><b>{today.length}</b>Today</span><span><b>{upcoming.length}</b>Upcoming</span><span className={overdue.length ? 'alert' : ''}><b>{overdue.length}</b>Overdue</span><span><b>{revisions.length}</b>Revision</span></div><div className="deadline-list">{nearest.map((task) => <div key={task.id}><strong>{task.title}</strong><small>{new Date(task.dueAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small></div>)}{!nearest.length && <p className="empty">No upcoming deadlines.</p>}</div></section>;
}

export function TodayBreakdownCard({ snapshot, settings }) {
  const active = snapshot.today.activeSeconds || 0;
  const idle = snapshot.today.idleSeconds || 0;
  const target = (settings.work?.dailyTargetHours || 0) * 3600;
  const credited = snapshot.today.workSeconds || 0;
  const remaining = Math.max(0, target - credited);
  const scale = Math.max(target, active + idle, 1);
  return <section className="card insights-card tone-violet"><div className="insights-head"><div><span className="card-kicker">Today breakdown</span><strong>{humanDuration(credited)}</strong><small>Credited work</small></div><div><b>{target ? `${Math.min(100, Math.round((credited / target) * 100))}%` : '—'}</b><small>Daily target</small></div></div><div className="breakdown-track"><i className="active" style={{ width: `${(active / scale) * 100}%` }} /><i className="idle" style={{ width: `${(idle / scale) * 100}%` }} /></div><div className="breakdown-list"><span><i className="active" /><b>{humanDuration(active)}</b>Active</span><span><i className="idle" /><b>{humanDuration(idle)}</b>Idle</span><span><i className="left" /><b>{target ? humanDuration(remaining) : '—'}</b>Remaining</span></div></section>;
}

/* ------------------------- focus countdown ----------------------------- */

export function CountdownCard() {
  const [duration, setDuration] = useState(15 * 60);
  const [left, setLeft] = useState(15 * 60);
  const [running, setRunning] = useState(false);
  const [custom, setCustom] = useState('');

  useEffect(() => {
    if (!running || left <= 0) return undefined;
    const id = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(id);
  }, [running, left]);

  useEffect(() => { if (left === 0) setRunning(false); }, [left]);
  const choose = (minutes) => { const seconds = minutes * 60; setDuration(seconds); setLeft(seconds); setRunning(false); };
  const progress = duration ? Math.max(0, Math.min(1, left / duration)) : 0;

  return (
    <section className="card countdown-card">
      <div className="countdown-head"><div><span className="card-kicker">Focus timer</span><strong className="mono">{shortClock(left)}</strong></div><div className="countdown-gauge" style={{ '--timer-progress': progress }}><span>{running ? <IconPause width={20} /> : <IconPlay width={20} />}</span></div></div>
      <div className="timer-quick">{[5, 10, 15].map((minutes) => <button key={minutes} className={duration === minutes * 60 ? 'active' : ''} onClick={() => choose(minutes)}>{minutes} min</button>)}</div>
      <div className="timer-custom"><input type="number" min="1" max="240" value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Minutes" /><button onClick={() => { const value = Math.min(240, Math.max(1, Number(custom))); if (value) choose(value); }}>Set</button></div>
      <div className="timer-actions"><button className="btn primary" onClick={() => setRunning((value) => !value)}>{running ? <IconPause width={14} /> : <IconPlay width={14} />}{running ? 'Pause' : left < duration ? 'Resume' : 'Start'}</button><button className="btn" onClick={() => { setRunning(false); setLeft(duration); }}>Reset</button></div>
    </section>
  );
}

/* --------------------------- assigned work ----------------------------- */

export function TaskHubCard({ tasks, snapshot, account, busy, onAction }) {
  const [selectedId, setSelectedId] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [opened, setOpened] = useState(null);
  const rows = tasks.open;
  const tree = useMemo(() => {
    const ids = new Set(rows.map((task) => task.id)); const children = new Map(); const roots = [];
    for (const task of rows) {
      if (task.parentExternalId && ids.has(task.parentExternalId)) children.set(task.parentExternalId, [...(children.get(task.parentExternalId) || []), task]);
      else roots.push(task);
    }
    return roots.map((task) => ({ task, children: children.get(task.id) || [] }));
  }, [rows]);
  useEffect(() => {
    if (!opened) return;
    const fresh = [...tasks.open, ...tasks.done].find((item) => item.id === opened.id);
    if (fresh && fresh !== opened) setOpened(fresh);
  }, [tasks.open, tasks.done, opened]);
  const select = (task) => setSelectedId((id) => id === task.id ? null : task.id);
  const toggle = (id) => setExpanded((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  return (
    <section className="card schedule-card task-hub-card">
      <div className="task-hub-head"><div><span className="card-kicker">Assigned work</span><h2>Tasks</h2></div><span>{rows.length} open</span></div>
      <div className="task-hub-list">
        {!tree.length && <p className="empty">No assigned work is waiting.</p>}
        {tree.map(({ task, children }) => <div className="compact-task-group" key={task.id}>
          <CompactTask task={task} selected={selectedId === task.id} childrenCount={children.length} expanded={expanded.has(task.id)} onSelect={() => select(task)} onExpand={() => toggle(task.id)} onOpen={() => setOpened(task)} />
          {expanded.has(task.id) && children.map((child) => <CompactTask key={child.id} child task={child} selected={selectedId === child.id} onSelect={() => select(child)} onOpen={() => setOpened(child)} />)}
        </div>)}
      </div>
      {opened && <TaskViewer task={opened} snapshot={snapshot} account={account} busy={busy} onClose={() => setOpened(null)} onSubmit={(details) => onAction(async () => { await tasks.setStatus(opened.id, 'done', details); setOpened(null); })} onComment={(body) => onAction(async () => { await tasks.addComment(opened.id, body); const fresh = [...tasks.open, ...tasks.done].find((item) => item.id === opened.id); if (fresh) setOpened(fresh); })} />}
    </section>
  );
}

function CompactTask({ task, child, selected, childrenCount = 0, expanded, onSelect, onExpand, onOpen }) {
  return <div className={`compact-task ${child ? 'child' : ''} ${selected ? 'selected' : ''}`} onClick={onSelect}>
    <span className={`task-state ${task.status === 'done' ? 'complete' : ''}`} />
    <span className="compact-task-copy"><strong>{task.title}</strong><small>{[task.projectName, task.clientName].filter(Boolean).join(' · ') || 'Independent task'}</small></span>
    {selected && <button className="compact-open" onClick={(event) => { event.stopPropagation(); onOpen(); }}>Open</button>}
    {childrenCount > 0 && <button className="compact-expand" onClick={(event) => { event.stopPropagation(); onExpand(); }} title={expanded ? 'Hide subtasks' : 'Show subtasks'}>{expanded ? <IconChevronDown width={15} /> : <IconChevronDown width={15} style={{ transform: 'rotate(-90deg)' }} />}</button>}
  </div>;
}

function TaskViewer({ task, snapshot, account, busy, onClose, onComment, onSubmit }) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completionNote, setCompletionNote] = useState('');
  const [delayReason, setDelayReason] = useState('');
  const trackingThis = snapshot.session?.taskId === task.id && ['running', 'paused'].includes(snapshot.state);
  const overdue = task.dueAt && new Date(task.dueAt) < new Date();
  const direct = Boolean(account?.user?.canManageTrackingPolicy);
  const start = () => onComment && (async () => {
    if (snapshot.state === 'running' || snapshot.state === 'paused') await window.api.tracker.stop('manual');
    await window.api.tracker.start({ taskId: task.id, taskNote: task.title });
  })();
  return <div className="lightbox" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="task-viewer">
    <header><div><span className="card-kicker">{task.parentTitle ? `Under ${task.parentTitle}` : 'Task details'}</span><h2>{task.title}</h2><p>{[task.projectName, task.clientName].filter(Boolean).join(' · ')}</p></div><button className="viewer-close" onClick={onClose}>×</button></header>
    <div className="viewer-meta"><span>{task.hubStatus?.replaceAll('_', ' ')}</span><span>{task.priority} priority</span>{task.dueAt && <span>Due {new Date(task.dueAt).toLocaleString()}</span>}</div>
    <div className="viewer-actions"><button className="btn primary" disabled={busy || trackingThis} onClick={start}><IconPlay width={14} /> {trackingThis ? 'Tracking now' : 'Track this task'}</button><button className="btn" disabled={busy} onClick={() => setSubmitting((value) => !value)}><IconCheck width={14} /> Submit work</button></div>
    {submitting && <form className="viewer-submit" onSubmit={(event) => { event.preventDefault(); onSubmit({ completionNote: completionNote.trim() || undefined, delayReason: delayReason.trim() || undefined }); }}><label><span>Completion note</span><textarea rows="3" value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} placeholder="What was completed?" /></label>{overdue && !direct && <label><span>Reason for delay</span><textarea rows="2" required value={delayReason} onChange={(event) => setDelayReason(event.target.value)} /></label>}<p>{direct ? 'This will be completed immediately.' : 'This will be sent for approval.'}</p><div><button type="button" className="btn" onClick={() => setSubmitting(false)}>Cancel</button><button className="btn primary" disabled={busy}>Submit work</button></div></form>}
    <section><h3>Description</h3><p className="viewer-description">{task.description || 'No description added.'}</p></section>
    <section><h3>Files & links</h3><div className="viewer-resources">{(task.resources || []).map((item) => <button key={item.id} onClick={() => window.api.app.openUpdate(item.url)}><span>{item.name}</span><small>{String(item.type || 'file').replaceAll('_', ' ')}</small></button>)}{!task.resources?.length && <p className="empty">No files or links.</p>}</div></section>
    <section className="viewer-comments"><h3>Comments</h3><div>{(task.comments || []).map((item) => <article key={item.id}><strong>{item.author?.name || 'Team member'}</strong><time>{new Date(item.createdAt).toLocaleString()}</time><p>{item.body}</p></article>)}{!task.comments?.length && <p className="empty">No comments yet.</p>}</div><form onSubmit={(event) => { event.preventDefault(); const body = comment.trim(); if (!body) return; onComment(body); setComment(''); }}><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment" rows="3" /><button className="btn primary" disabled={busy || !comment.trim()}>Comment</button></form></section>
  </section></div>;
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
                <span className="check-text">
                  <span className="check-title">{task.title}</span>
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
