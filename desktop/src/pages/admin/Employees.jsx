import { useEffect, useState } from 'react';
import { useEmployee, useImage, useClip, useRecordings, useRoster, useScreenshots } from '../../lib/admin-hooks.js';
import { humanDuration, clockTime, dayLabel } from '../../lib/format.js';

export default function Employees() {
  const roster = useRoster();
  const [userId, setUserId] = useState('');
  const [view, setView] = useState('time');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active');
  const [section, setSection] = useState('people');
  const [selectedDay, setSelectedDay] = useState('');
  const [screenshotPage, setScreenshotPage] = useState(1);
  useEffect(() => { if (!userId && roster.users[0]) setUserId(roster.users[0].id); }, [roster.users, userId]);
  const detail = useEmployee(userId);
  const shots = useScreenshots(userId, screenshotPage, view === 'screens');
  const clips = useRecordings(userId, view === 'recordings');
  const user = roster.users.find((row) => row.id === userId);
  const tracked = detail.data?.totals?.workSeconds ?? (detail.data?.sessions || []).reduce((sum, row) => sum + (row.activeSeconds || 0), 0);
  const sessionDays = detail.data?.daily || groupSessionDays(detail.data?.sessions || []);
  const visibleDays = selectedDay ? sessionDays.filter((day) => day.date === selectedDay) : sessionDays;
  const selectedTotal = visibleDays.reduce((sum, day) => sum + day.workSeconds, 0);
  const visiblePeople = roster.users.filter((person) => (filter === 'all' || (filter === 'active' ? person.active : person.online)) && (person.name + ' ' + person.email).toLowerCase().includes(search.toLowerCase()));
  const ranked = roster.users.filter((person) => person.weekRank).sort((a, b) => a.weekRank - b.weekRank || a.name.localeCompare(b.name));
  const screenshotDays = groupScreenshotsByDay(shots.rows);
  const screenshotPageCount = Math.max(1, Math.ceil(shots.total / shots.pageSize));

  useEffect(() => { setScreenshotPage(1); }, [userId]);
  useEffect(() => {
    if (!shots.loading && screenshotPage > screenshotPageCount) setScreenshotPage(screenshotPageCount);
  }, [shots.loading, screenshotPage, screenshotPageCount]);

  return <>
    <header className="page-head employee-head"><div className="head-main"><h1>Employees</h1><p>Your team, at a glance.</p></div><div className="employee-switch" role="group" aria-label="Employee view"><button className={section === 'people' ? 'active' : ''} onClick={() => setSection('people')}>People</button><button className={section === 'ranking' ? 'active' : ''} onClick={() => setSection('ranking')}>Weekly ranking</button></div><button className="btn" disabled={roster.loading} onClick={roster.reload}>Refresh</button></header>
    {!roster.loading && !roster.error && <div className="employee-overview"><div><small>TEAM MEMBERS</small><strong>{roster.users.filter((person) => person.active && person.role === 'employee').length}</strong></div><div><small>ONLINE NOW</small><strong>{roster.users.filter((person) => person.active && person.role === 'employee' && person.online).length}</strong></div><div><small>ACTIVE TIME TODAY</small><strong>{humanDuration(roster.users.filter((person) => person.role === 'employee').reduce((sum, person) => sum + (person.todayActive || 0), 0))}</strong></div><div><small>VISIBILITY</small><strong className="employee-private">Admin only</strong></div></div>}
    {section === 'ranking' && !roster.loading && !roster.error && <section className="employee-ranking"><header><div><h2>Weekly active time</h2><p>{roster.data?.ranking?.weekStart ? 'Week of ' + dayLabel(roster.data.ranking.weekStart + 'T12:00:00+06:00') : 'This week'} · Asia/Dhaka</p></div><span className="employee-badge">Admin only</span></header><p className="muted">Synced, completed sessions only. Idle time excluded.</p>{ranked.length ? <div className="employee-rank-list">{ranked.map((person) => <button key={person.id} className="employee-rank" onClick={() => { setUserId(person.id); setSection('people'); }}><span className={'employee-place place-' + person.weekRank}>#{person.weekRank}</span><span className="monitor-avatar">{initials(person.name)}</span><span className="employee-rank-name"><strong>{person.name}</strong><small>{person.email}</small></span><span className="employee-rank-meter"><i style={{ width: (person.weekCompletedActive / ranked[0].weekCompletedActive * 100) + '%' }} /></span><strong>{humanDuration(person.weekCompletedActive)}</strong><span aria-hidden="true">↗</span></button>)}</div> : <Empty text="No completed tracked sessions this week yet." />}</section>}
    {roster.loading && <div className="load-state"><span className="spinner" /> Loading employees...</div>}
    {roster.error && <div className="load-error"><p>{roster.error.message || 'Employees could not be loaded.'}</p><button className="btn" onClick={roster.reload}>Retry</button></div>}
    {section === 'people' && !roster.loading && !roster.error && <div className="monitor-shell">
      <aside className="monitor-roster">
        <div className="employee-roster-tools"><input aria-label="Search employees" placeholder="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Filter employees" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="active">Active members</option><option value="online">Online now</option><option value="all">All members</option></select><small>{visiblePeople.length} members</small></div>
        {visiblePeople.map((person) => <button key={person.id} className={person.id === userId ? 'monitor-person active' : 'monitor-person'} onClick={() => setUserId(person.id)}><span className="monitor-avatar">{initials(person.name)}</span><span><strong>{person.name}</strong><small>{person.active ? person.online ? '● Online' : 'Offline' : 'Inactive'} · {humanDuration(person.todayActive || 0)} today</small></span></button>)}{!visiblePeople.length && <Empty text="No matching employees." />}
      </aside>
      <section className="monitor-content">
        <div className="employee-profile"><span className="monitor-avatar">{initials(user?.name)}</span><div><h2>{user?.name || 'Select an employee'}</h2><p>{user?.email}</p></div><span className={'employee-badge ' + (user?.online ? 'online' : '')}>{user?.active ? user?.online ? 'Online' : 'Offline' : 'Inactive'}</span></div>
        <div className="monitor-summary"><div><small>ACTIVE TODAY</small><strong>{humanDuration(user?.todayActive || 0)}</strong></div><div><small>TIME · LAST 30 DAYS</small><strong>{detail.loading ? '—' : humanDuration(tracked)}</strong></div><div><small>SESSIONS · LAST 30 DAYS</small><strong>{detail.loading ? '—' : detail.data?.sessions?.length || 0}</strong></div></div>
        <div className="monitor-tabs"><button className={view === 'time' ? 'active' : ''} onClick={() => setView('time')}>Tracked time</button><button className={view === 'screens' ? 'active' : ''} onClick={() => setView('screens')}>Screenshots</button><button className={view === 'recordings' ? 'active' : ''} onClick={() => setView('recordings')}>Recordings</button></div>
        {view === 'time' && <><div className="employee-date-toolbar"><label>Day <input type="date" aria-label="Session day" value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} /></label><button className="btn" onClick={() => setSelectedDay('')}>Last 30 days</button><strong>{detail.loading ? '—' : humanDuration(selectedTotal)} work</strong></div><div className="employee-week" aria-label="Recent daily work">{sessionDays.slice(0, 7).reverse().map((day) => <button key={day.date} className={selectedDay === day.date ? 'active' : ''} onClick={() => setSelectedDay(day.date)}><small>{dayLabel(day.date + 'T12:00:00+06:00')}</small><strong>{humanDuration(day.workSeconds)}</strong><i style={{ height: Math.max(3, day.workSeconds / Math.max(1, ...sessionDays.map((row) => row.workSeconds)) * 28) }} /></button>)}</div><div className="monitor-list">{detail.loading && <Empty text="Loading tracked time..." />}{detail.error && <LoadError error={detail.error} retry={detail.reload} />}{visibleDays.map((day) => <section className="monitor-day" key={day.date}><header><div><strong>{dayLabel(day.date + 'T12:00:00+06:00')}</strong><small>{day.sessionIds.length} sessions · Asia/Dhaka</small></div><div><strong>{humanDuration(day.workSeconds)} work</strong><small>{humanDuration(day.activeSeconds)} active · {humanDuration(day.idleSeconds)} idle</small></div></header>{(detail.data?.sessions || []).filter((row) => day.sessionIds.includes(row.id)).map((row) => <div className="monitor-session" key={row.id}><span><strong>{dhakaTime(row.startedAt)} – {row.endedAt ? dhakaTime(row.endedAt) : 'Running'}</strong></span><span>{row.note || row.taskTitle || 'Tracked work'}<small style={{ display: 'block' }}>{humanDuration(row.idleSeconds)} idle</small></span><strong>{humanDuration(row.activeSeconds + (detail.data?.countIdleAsWork ? row.idleSeconds : 0))}</strong></div>)}</section>)}{!detail.loading && !detail.error && !visibleDays.length && <Empty text={selectedDay ? "No tracked sessions on this day." : "No tracked sessions in the last 30 days."} />}</div></>}
        {view === 'screens' && <div className="monitor-screenshots">
          {shots.loading && <Empty text="Loading screenshots..." />}
          {shots.error && <LoadError error={shots.error} retry={shots.reload} />}
          {!shots.loading && !shots.error && screenshotDays.map((day) => <section className="monitor-day" key={day.key}>
            <header><div><strong>{day.label}</strong><small>{day.rows.length} screenshot{day.rows.length === 1 ? '' : 's'}</small></div></header>
            <div className="monitor-grid">{day.rows.map((row) => <Screenshot key={row.id} row={row} />)}</div>
          </section>)}
          {!shots.loading && !shots.error && !shots.rows.length && <Empty text="No screenshots yet." />}
          {!shots.loading && !shots.error && screenshotPageCount > 1 && <nav className="monitor-pagination" aria-label="Screenshot pages">
            <button className="btn" disabled={screenshotPage === 1} onClick={() => setScreenshotPage((page) => page - 1)}>Previous</button>
            <span>Page {screenshotPage} of {screenshotPageCount}</span>
            <button className="btn" disabled={screenshotPage >= screenshotPageCount} onClick={() => setScreenshotPage((page) => page + 1)}>Next</button>
          </nav>}
        </div>}
        {view === 'recordings' && <div className="monitor-list">{clips.loading && <Empty text="Loading recordings..." />}{clips.error && <LoadError error={clips.error} retry={clips.reload} />}{clips.rows.map((row) => <Recording key={row.id} row={row} />)}{!clips.loading && !clips.error && !clips.rows.length && <Empty text="No recordings yet." />}</div>}
      </section>
    </div>}
  </>;
}

function Screenshot({ row }) {
  const url = useImage(row.id);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  const captured = `${dayLabel(row.capturedAt)} · ${clockTime(row.capturedAt)}`;
  return <>
    <button type="button" className="monitor-shot" disabled={!url} onClick={() => setOpen(true)} title={url ? 'Open screenshot' : 'Loading screenshot'}>
      {url ? <img src={url} alt={`Screenshot captured ${captured}`} /> : <div className="monitor-media-loading" />}
      <strong>{captured}</strong><small>{row.activityPercent ?? 0}% activity</small>
    </button>
    {open && <div className="lightbox monitor-lightbox" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <section className="lightbox-inner" aria-modal="true" role="dialog" aria-label={`Screenshot captured ${captured}`}>
        <img src={url} alt={`Screenshot captured ${captured}`} />
        <div className="lightbox-bar"><strong>{captured}</strong><span className="muted">{row.activityPercent ?? 0}% activity</span><span className="spacer" /><button type="button" className="btn" onClick={() => setOpen(false)}>Close</button></div>
      </section>
    </div>}
  </>;
}
function Recording({ row }) { const [open, setOpen] = useState(false); const url = useClip(open ? row.id : null); return <article className="monitor-recording"><span><strong>{dayLabel(row.startedAt)} · {clockTime(row.startedAt)}</strong><small>{humanDuration(Math.round(row.durationMs / 1000))}</small></span><button className="btn" onClick={() => setOpen((value) => !value)}>{open ? 'Close' : 'Play'}</button>{open && url && <video src={url} controls autoPlay />}</article>; }
function Empty({ text }) { return <p className="monitor-empty">{text}</p>; }
function LoadError({ error, retry }) { return <div className="monitor-empty"><p>{error?.message || 'This data could not be loaded.'}</p><button className="btn" onClick={retry}>Retry</button></div>; }
function initials(name) { return String(name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(''); }
function groupScreenshotsByDay(rows) {
  const days = new Map();
  rows.forEach((row) => {
    const date = new Date(row.capturedAt);
    const key = Number.isNaN(date.getTime()) ? 'unknown' : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (!days.has(key)) days.set(key, { key, label: dayLabel(row.capturedAt), rows: [] });
    days.get(key).rows.push(row);
  });
  return Array.from(days.values());
}

function dhakaTime(value) { return new Date(value).toLocaleTimeString([], { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' }); }
function groupSessionDays(rows) { const groups = new Map(); for (const row of rows) { const date = new Date(new Date(row.startedAt).getTime() + 6 * 3600000).toISOString().slice(0, 10); if (!groups.has(date)) groups.set(date, { date, activeSeconds: 0, idleSeconds: 0, workSeconds: 0, sessionIds: [] }); const day = groups.get(date); day.activeSeconds += row.activeSeconds; day.idleSeconds += row.idleSeconds; day.workSeconds += row.activeSeconds; day.sessionIds.push(row.id); } return [...groups.values()]; }
