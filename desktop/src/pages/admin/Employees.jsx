import { useEffect, useState } from 'react';
import { useEmployee, useImage, useClip, useRecordings, useRoster, useScreenshots } from '../../lib/admin-hooks.js';
import { humanDuration, clockTime, dayLabel } from '../../lib/format.js';

export default function Employees() {
  const roster = useRoster();
  const [userId, setUserId] = useState('');
  const [view, setView] = useState('time');
  useEffect(() => { if (!userId && roster.users[0]) setUserId(roster.users[0].id); }, [roster.users, userId]);
  const detail = useEmployee(userId);
  const shots = useScreenshots(userId);
  const clips = useRecordings(userId);
  const user = roster.users.find((row) => row.id === userId);
  const tracked = (detail.data?.sessions || []).reduce((sum, row) => sum + (row.activeSeconds || 0), 0);

  return <>
    <header className="page-head"><div className="head-main"><h1>Employees</h1><p>Tracked time and captured work, together in one place.</p></div></header>
    <div className="monitor-shell">
      <aside className="monitor-roster">
        {roster.users.map((person) => <button key={person.id} className={person.id === userId ? 'monitor-person active' : 'monitor-person'} onClick={() => setUserId(person.id)}><span className="monitor-avatar">{initials(person.name)}</span><span><strong>{person.name}</strong><small>{person.email}</small></span></button>)}
      </aside>
      <section className="monitor-content">
        <div className="monitor-summary"><div><small>EMPLOYEE</small><strong>{user?.name || 'Select an employee'}</strong></div><div><small>TRACKED · 14 DAYS</small><strong>{humanDuration(tracked)}</strong></div><div><small>SESSIONS</small><strong>{detail.data?.sessions?.length || 0}</strong></div></div>
        <div className="monitor-tabs"><button className={view === 'time' ? 'active' : ''} onClick={() => setView('time')}>Tracked time</button><button className={view === 'screens' ? 'active' : ''} onClick={() => setView('screens')}>Screenshots</button><button className={view === 'recordings' ? 'active' : ''} onClick={() => setView('recordings')}>Recordings</button></div>
        {view === 'time' && <div className="monitor-list">{(detail.data?.sessions || []).map((row) => <div className="monitor-session" key={row.id}><span><strong>{dayLabel(row.startedAt)}</strong><small>{clockTime(row.startedAt)} - {row.endedAt ? clockTime(row.endedAt) : 'Now'}</small></span><span>{row.note || row.taskTitle || 'Tracked work'}</span><strong>{humanDuration(row.activeSeconds)}</strong></div>)}{!detail.loading && !detail.data?.sessions?.length && <Empty text="No tracked sessions yet." />}</div>}
        {view === 'screens' && <div className="monitor-grid">{shots.rows.map((row) => <Screenshot key={row.id} row={row} />)}{!shots.loading && !shots.rows.length && <Empty text="No screenshots yet." />}</div>}
        {view === 'recordings' && <div className="monitor-list">{clips.rows.map((row) => <Recording key={row.id} row={row} />)}{!clips.loading && !clips.rows.length && <Empty text="No recordings yet." />}</div>}
      </section>
    </div>
  </>;
}

function Screenshot({ row }) { const url = useImage(row.id); return <article className="monitor-shot">{url ? <img src={url} alt="" /> : <div className="monitor-media-loading" />}<strong>{dayLabel(row.capturedAt)} · {clockTime(row.capturedAt)}</strong><small>{row.activityPercent ?? 0}% activity</small></article>; }
function Recording({ row }) { const [open, setOpen] = useState(false); const url = useClip(open ? row.id : null); return <article className="monitor-recording"><span><strong>{dayLabel(row.startedAt)} · {clockTime(row.startedAt)}</strong><small>{humanDuration(Math.round(row.durationMs / 1000))}</small></span><button className="btn" onClick={() => setOpen((value) => !value)}>{open ? 'Close' : 'Play'}</button>{open && url && <video src={url} controls autoPlay />}</article>; }
function Empty({ text }) { return <p className="monitor-empty">{text}</p>; }
function initials(name) { return String(name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(''); }
