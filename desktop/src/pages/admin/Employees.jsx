import { useEffect, useState } from 'react';
import { useEmployee, useImage, useClip, useRecordings, useRoster, useScreenshots } from '../../lib/admin-hooks.js';
import { humanDuration, clockTime, dayLabel } from '../../lib/format.js';

export default function Employees() {
  const roster = useRoster();
  const [userId, setUserId] = useState('');
  const [view, setView] = useState('time');
  const [screenshotPage, setScreenshotPage] = useState(1);
  useEffect(() => { if (!userId && roster.users[0]) setUserId(roster.users[0].id); }, [roster.users, userId]);
  const detail = useEmployee(userId);
  const shots = useScreenshots(userId, screenshotPage, view === 'screens');
  const clips = useRecordings(userId, view === 'recordings');
  const user = roster.users.find((row) => row.id === userId);
  const tracked = (detail.data?.sessions || []).reduce((sum, row) => sum + (row.activeSeconds || 0), 0);
  const screenshotDays = groupScreenshotsByDay(shots.rows);
  const screenshotPageCount = Math.max(1, Math.ceil(shots.total / shots.pageSize));

  useEffect(() => { setScreenshotPage(1); }, [userId]);
  useEffect(() => {
    if (!shots.loading && screenshotPage > screenshotPageCount) setScreenshotPage(screenshotPageCount);
  }, [shots.loading, screenshotPage, screenshotPageCount]);

  return <>
    <header className="page-head"><div className="head-main"><h1>Employees</h1><p>Tracked time and captured work, together in one place.</p></div></header>
    {roster.loading && <div className="load-state"><span className="spinner" /> Loading employees...</div>}
    {roster.error && <div className="load-error"><p>{roster.error.message || 'Employees could not be loaded.'}</p><button className="btn" onClick={roster.reload}>Retry</button></div>}
    {!roster.loading && !roster.error && <div className="monitor-shell">
      <aside className="monitor-roster">
        {roster.users.map((person) => <button key={person.id} className={person.id === userId ? 'monitor-person active' : 'monitor-person'} onClick={() => setUserId(person.id)}><span className="monitor-avatar">{initials(person.name)}</span><span><strong>{person.name}</strong><small>{person.email}</small></span></button>)}
      </aside>
      <section className="monitor-content">
        <div className="monitor-summary"><div><small>EMPLOYEE</small><strong>{user?.name || 'Select an employee'}</strong></div><div><small>TIME · LAST 30 DAYS</small><strong>{detail.loading ? '—' : humanDuration(tracked)}</strong></div><div><small>SESSIONS · LAST 30 DAYS</small><strong>{detail.loading ? '—' : detail.data?.sessions?.length || 0}</strong></div></div>
        <div className="monitor-tabs"><button className={view === 'time' ? 'active' : ''} onClick={() => setView('time')}>Tracked time</button><button className={view === 'screens' ? 'active' : ''} onClick={() => setView('screens')}>Screenshots</button><button className={view === 'recordings' ? 'active' : ''} onClick={() => setView('recordings')}>Recordings</button></div>
        {view === 'time' && <div className="monitor-list">{detail.loading && <Empty text="Loading tracked time..." />}{detail.error && <LoadError error={detail.error} retry={detail.reload} />}{(detail.data?.sessions || []).map((row) => <div className="monitor-session" key={row.id}><span><strong>{dayLabel(row.startedAt)}</strong><small>{clockTime(row.startedAt)} - {row.endedAt ? clockTime(row.endedAt) : 'Now'}</small></span><span>{row.note || row.taskTitle || 'Tracked work'}</span><strong>{humanDuration(row.activeSeconds)}</strong></div>)}{!detail.loading && !detail.error && !detail.data?.sessions?.length && <Empty text="No tracked sessions in the last 30 days." />}</div>}
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
