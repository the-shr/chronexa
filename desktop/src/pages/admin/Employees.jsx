import { memo, useEffect, useRef, useState } from 'react';
import { useEmployee, useImage, useClip, useRecordings, useRoster, useScreenshots } from '../../lib/admin-hooks.js';
import { humanDuration, clockTime, dayLabel } from '../../lib/format.js';
import './employees.css';
import ActivityHistory from './ActivityHistory.jsx';
import DeviceDiagnostics from './DeviceDiagnostics.jsx';

const dhakaDay = (offset = 0) => new Date(Date.now() + 21600000 + offset * 86400000).toISOString().slice(0, 10);
const statusOf = (person) => !person.active ? 'Inactive' : person.online ? 'Online now' : 'Offline';
const rankedUsers = (users) => users.filter((person) => person.rank).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

function Employees({ previewUserIds = null }) {
  const [period, setPeriod] = useState('month');
  const roster = useRoster(period);
  const periodLabel = period === 'month' ? 'month' : 'week';
  const [section, setSection] = useState('team');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [role, setRole] = useState('all');
  const [department, setDepartment] = useState('all');
  const [progress, setProgress] = useState('all');
  const [userId, setUserId] = useState('');
  const [view, setView] = useState('time');
  const [selectedDay, setSelectedDay] = useState(() => dhakaDay());
  const [screenshotPage, setScreenshotPage] = useState(1);
  const detail = useEmployee(userId, selectedDay.slice(0, 7));
  const shots = useScreenshots(userId, screenshotPage, Boolean(userId) && view === 'screens');
  const clips = useRecordings(userId, Boolean(userId) && view === 'recordings');
  const scopedUsers = previewUserIds === null ? roster.users : roster.users.filter(person => previewUserIds.includes(person.id));
  const user = scopedUsers.find((person) => person.id === userId);
  const sessionDays = detail.data?.daily || groupSessionDays(detail.data?.sessions || []);
  const day = sessionDays.find((row) => row.date === selectedDay);
  const sessions = (detail.data?.sessions || []).filter((row) => day?.sessionIds.includes(row.id));
  const pages = Math.max(1, Math.ceil(shots.total / shots.pageSize));
  const dialog = useRef(null);
  const lastFocus = useRef(null);
  const ranked = rankedUsers(scopedUsers);
  const visible = scopedUsers.filter((person) => {
    const ratio = person.periodTargetHours > 0 ? person.periodActive / (person.periodTargetHours * 3600) : null;
    return (person.name + ' ' + person.email + ' ' + person.role + ' ' + (person.department || '') + ' ' + (person.designation || '')).toLowerCase().includes(search.toLowerCase())
      && (status === 'all' || (status === 'active' ? person.active : person.active && person.online === (status === 'online')))
      && (role === 'all' || person.role === role)
      && (department === 'all' || (person.department || 'Unassigned') === department)
      && (progress === 'all' || (ratio !== null && (progress === 'high' ? ratio >= .75 : ratio < .75)));
  });
  const visibleRanked = rankedUsers(visible);
  const departments = [...new Set(scopedUsers.map((person) => person.department || 'Unassigned'))].sort((a,b) => a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b));
  const groups = departments.map((label) => ({ label, people: visible.filter((person) => (person.department || 'Unassigned') === label) })).filter((group) => group.people.length);

  useEffect(() => {
    if (!userId || !dialog.current) return;
    const element = dialog.current;
    element.showModal();
    return () => { element.close(); lastFocus.current?.focus(); };
  }, [userId]);
  useEffect(() => { if (!shots.loading && screenshotPage > pages) setScreenshotPage(pages); }, [shots.loading, screenshotPage, pages]);
  function openEmployee(id) { lastFocus.current = document.activeElement; setUserId(id); setView('time'); setSelectedDay(dhakaDay()); setScreenshotPage(1); }
  function changeDay(offset) { const next = new Date(selectedDay + 'T12:00:00Z'); next.setUTCDate(next.getUTCDate() + offset); const value = next.toISOString().slice(0, 10); if (value >= dhakaDay(-365) && value <= dhakaDay()) setSelectedDay(value); }

  return <section className="tc">
    <header className="tc-head"><div><h1>Employees</h1><p>{roster.loading && !roster.data ? 'Loading your team…' : `${scopedUsers.filter((person) => person.active).length} team members · ${scopedUsers.filter((person) => person.active && person.online).length} online`}</p></div><button className="tc-button" onClick={roster.reload} disabled={roster.loading}>Refresh</button></header>
    <nav className="tc-tabs" aria-label="Employee view"><button className={section === 'team' ? 'active' : ''} onClick={() => setSection('team')}>Team</button><button className={section === 'ranking' ? 'active' : ''} onClick={() => setSection('ranking')}>Ranking</button><small>Tracking</small></nav>
    <div className="tc-filters"><input aria-label="Search employees" placeholder="Search name or email…" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Employee department" value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">All departments</option>{departments.map((label) => <option key={label}>{label}</option>)}</select><select aria-label="Employee role" value={role} onChange={(event) => setRole(event.target.value)}><option value="all">All roles</option><option value="employee">Employees</option><option value="admin">Admins</option></select><select aria-label="Employee status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Active members</option><option value="all">All members</option><option value="online">Online</option><option value="offline">Offline</option></select><select aria-label="Target progress" value={progress} onChange={(event) => setProgress(event.target.value)}><option value="all">Any progress</option><option value="high">75% or more</option><option value="low">Below 75%</option></select><select aria-label="Ranking period" value={period} onChange={event => setPeriod(event.target.value)}><option value="month">Monthly</option><option value="week">Weekly</option></select><span>From {roster.data?.ranking?.periodStart || '—'}</span></div>
    <div className="tc-board">
      {roster.data?.organization?.available === false && <p className="tc-source-note">OS profile details are currently unavailable. Department and designation will appear after the OS connection is restored.</p>}
      {roster.error && <LoadError error={roster.error} retry={roster.reload} />}
      {roster.loading && !roster.data && <Empty text="Loading employees…" />}
      {!roster.error && roster.data && section === 'team' && groups.map((group) => <section className="tc-group" key={group.label}><h2>{group.label}<span>{group.people.length}</span></h2><div className="tc-grid">{group.people.map((person) => <EmployeeCard key={person.id} person={person} periodLabel={periodLabel} open={openEmployee} />)}</div></section>)}
      {!roster.error && roster.data && section === 'ranking' && <>
        <div className="tc-ranking-intro"><div><h2>This {periodLabel}’s leaders</h2><p>Ranked by completed active time</p></div><span>{ranked.length} ranked employees</span></div>
        <div className="tc-podium" aria-label="Top three employees">{ranked.slice(0, 3).map((person) => { const medal = person.rank === 1 ? 'gold' : person.rank === 2 ? 'silver' : 'bronze'; return <button key={person.id} className={`tc-winner ${medal}`} onClick={() => openEmployee(person.id)} aria-label={`View rank ${person.rank}, ${person.name}`}><div className="tc-winner-top"><span>{medal} · #{person.rank}</span><span className="tc-medallion"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M7 3h10v7a5 5 0 0 1-10 0V3Z"/><path d="M7 5H4v3a4 4 0 0 0 4 4m9-7h3v3a4 4 0 0 1-4 4M12 15v5m-4 1h8"/></svg></span></div><div className="tc-winner-person"><Avatar person={person}/><div><strong>{person.name}</strong><small>{person.designation || person.department || 'Employee'}</small></div></div><div className="tc-winner-metric"><b>{humanDuration(person.periodActive)}</b><span>Active this {periodLabel}</span></div></button>; })}</div>
        <div className="tc-rank-heading"><h2>Team ranking</h2><span>Synced sessions · Idle excluded</span></div>
        <div className="tc-table-wrap"><table className="tc-table"><thead><tr><th>Rank</th><th>Employee</th><th className="number">Active this {periodLabel}</th><th>Target progress</th></tr></thead><tbody>{visibleRanked.map((person) => <tr key={person.id}><td><span className={`tc-place ${person.rank===1?'gold':person.rank===2?'silver':person.rank===3?'bronze':''}`}>#{person.rank}</span></td><td><button className="tc-rank-person" onClick={() => openEmployee(person.id)}><Avatar person={person} /><span>{person.name}<small>{person.department || person.email}</small></span></button></td><td className="number">{humanDuration(person.periodActive)}</td><td><div className="tc-rank-progress"><i><em style={{width: `${person.periodTargetHours>0?Math.min(100,person.periodActive/(person.periodTargetHours*3600)*100):0}%`}}/></i><span>{person.periodTargetHours>0?`${Math.round(person.periodActive/(person.periodTargetHours*3600)*100)}% of ${person.periodTargetHours}h`:'No target'}</span></div></td></tr>)}</tbody></table>{!visibleRanked.length && <Empty text={ranked.length ? 'No rankings match these filters.' : 'No completed tracked sessions this period yet.'} />}</div>
      </>}
      {!roster.error && roster.data && section === 'team' && !visible.length && <Empty text="No matching employees." />}
    </div>
    <footer className="tc-foot"><span>{section === 'ranking' ? 'Top 3 reflect the whole team; filters apply to the list.' : 'Period progress uses completed, synced active time.'}</span><span>Asia/Dhaka</span></footer>
    {userId && <dialog className="tc-drawer" ref={dialog} onCancel={(event) => { event.preventDefault(); if (!document.querySelector('.monitor-lightbox')) setUserId(''); }} onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right)) setUserId(''); }}>
      <header className="tc-drawer-head"><Avatar person={user || { id: userId, name: detail.data?.user?.name || '?' }} /><div><h2>{user?.name || detail.data?.user?.name || 'Employee'}</h2><p>{user?.email || detail.data?.user?.email}</p></div><button className="tc-close" aria-label="Close employee" onClick={() => setUserId('')}>×</button></header>
      <nav className="tc-tabs tc-drawer-tabs" aria-label="Employee activity"><button className={view === 'time' ? 'active' : ''} onClick={() => setView('time')}>Sessions</button><button className={view === 'screens' ? 'active' : ''} onClick={() => setView('screens')}>Screenshots</button><button className={view === 'recordings' ? 'active' : ''} onClick={() => setView('recordings')}>Recordings</button><button className={view === 'devices' ? 'active' : ''} onClick={() => setView('devices')}>Devices</button><button className="tc-detail-refresh" onClick={() => { detail.reload(); if (view === 'screens') shots.reload(); if (view === 'recordings') clips.reload(); }} disabled={detail.loading}>Refresh</button></nav>
      <div className="tc-drawer-body">
        {view==='devices'&&<DeviceDiagnostics devices={detail.data?.diagnostics} policyFingerprint={detail.data?.policyFingerprint} loading={detail.loading} error={detail.error}/>}
        {view === 'time' && <><ActivityHistory daily={sessionDays} targetHours={detail.data?.dailyTargetHours ?? 8} selectedDay={selectedDay} onSelect={setSelectedDay} /><div className="tc-date"><label htmlFor="employee-day">Daily activity</label><button className="tc-button" aria-label="Previous day" disabled={selectedDay <= dhakaDay(-365)} onClick={() => changeDay(-1)}>‹</button><input id="employee-day" type="date" aria-label="Session day" value={selectedDay} min={dhakaDay(-365)} max={dhakaDay()} onChange={(event) => { if (event.target.value) setSelectedDay(event.target.value); }} /><button className="tc-button" aria-label="Next day" disabled={selectedDay >= dhakaDay()} onClick={() => changeDay(1)}>›</button></div>{detail.loading && !detail.data ? <Empty text="Loading sessions…" /> : detail.error ? <LoadError error={detail.error} retry={detail.reload} /> : <><div className="tc-stats"><div><small>Work time</small><strong>{humanDuration(day?.workSeconds || 0)}</strong></div><div><small>Idle time</small><strong>{humanDuration(day?.idleSeconds || 0)}</strong></div><div><small>Sessions</small><strong>{sessions.length}</strong></div></div><div className="tc-rank-heading"><h2>{dayLabel(selectedDay + 'T12:00:00+06:00')}</h2><span>Asia/Dhaka</span></div><div className="tc-table-wrap"><table className="tc-table"><thead><tr><th>Time</th><th>Task</th><th className="number">Work</th><th className="number">Idle</th></tr></thead><tbody>{sessions.map((row) => <tr key={row.id}><td className="tc-session-time">{dhakaTime(row.startedAt)}<small>{row.endedAt ? dhakaTime(row.endedAt) : 'Open session'}</small></td><td>{row.taskTitle || row.note || 'General work'}{row.taskTitle && row.note && <small>{row.note}</small>}</td><td className="number">{humanDuration(row.activeSeconds + (detail.data?.countIdleAsWork ? row.idleSeconds : 0))}</td><td className="number">{humanDuration(row.idleSeconds)}</td></tr>)}</tbody></table>{!sessions.length && <Empty text="No sessions on this day." />}</div></>}</>}
        {view === 'screens' && <>{shots.loading && !shots.data && <Empty text="Loading screenshots…" />}{shots.error && <LoadError error={shots.error} retry={shots.reload} />}{!shots.error && groupScreenshotsByDay(shots.rows).map((group) => <section className="monitor-day" key={group.key}><header><strong>{group.label}</strong><small>{group.rows.length} screenshots</small></header><div className="monitor-grid">{group.rows.map((row) => <Screenshot key={row.id} row={row} />)}</div></section>)}{!shots.loading && !shots.error && !shots.rows.length && <Empty text="No screenshots yet." />}{pages > 1 && <nav className="monitor-pagination" aria-label="Screenshot pages"><button className="tc-button" disabled={screenshotPage === 1} onClick={() => setScreenshotPage((page) => page - 1)}>Previous</button><span>{screenshotPage} / {pages}</span><button className="tc-button" disabled={screenshotPage >= pages} onClick={() => setScreenshotPage((page) => page + 1)}>Next</button></nav>}</>}
        {view === 'recordings' && <>{clips.loading && !clips.data && <Empty text="Loading recordings…" />}{clips.error && <LoadError error={clips.error} retry={clips.reload} />}{!clips.error && clips.rows.map((row) => <Recording key={row.id} row={row} />)}{!clips.loading && !clips.error && !clips.rows.length && <Empty text="No recordings yet." />}</>}
      </div>
    </dialog>}
  </section>;
}

function Avatar({ person }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let live = true; setUrl(null); if (person.hasAvatar && window.api.admin.avatar) window.api.admin.avatar(person.id).then((next) => { if (live) setUrl(next); }).catch(() => {}); return () => { live = false; }; }, [person.id, person.hasAvatar, person.avatarVersion]);
  const palette = ['purple', 'blue', 'rose', 'green', 'amber'];
  const color = palette[Array.from(person.id || '').reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length];
  return <span className={`tc-avatar ${color} ${person.active && person.online ? 'online' : ''}`}>{url ? <img src={url} alt="" /> : initials(person.name)}</span>;
}

function EmployeeCard({ person, open, periodLabel }) {
  const target = person.periodTargetHours || 0;
  const percent = target > 0 ? Math.round(person.periodActive / (target * 3600) * 100) : null;
  return <button className="tc-card" aria-label={`View ${person.name}`} onClick={() => open(person.id)}><div className="tc-profile"><Avatar person={person} /><div><h3>{person.name}</h3><p>{person.designation || (person.role === 'admin' ? 'Admin' : 'Employee')}</p></div>{person.rank && <span className="tc-card-rank">#{person.rank}</span>}</div><div className="tc-progress" aria-hidden="true"><i style={{ width: `${percent === null ? 0 : Math.min(100, percent)}%` }} /></div><div className="tc-hours"><span>{humanDuration(person.periodActive || 0)}<small>{target > 0 ? ` / ${target}h this ${periodLabel}` : ` this ${periodLabel}`}</small></span><small>{percent === null ? 'No target' : `${percent}%`}</small></div><div className="tc-task" title={person.currentTask || 'No recent open session'}><i /><span>{person.currentTask || 'No recent open session'}</span></div><div className="tc-card-foot"><span>{statusOf(person) === 'Online now' ? '● Online' : statusOf(person)}</span><span>Today <strong>{humanDuration(person.todayActive || 0)}</strong></span></div></button>;
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
function Empty({ text }) { return <p className="tc-empty">{text}</p>; }
function LoadError({ error, retry }) { return <div className="tc-empty"><p>{error?.message || 'This data could not be loaded.'}</p><button className="btn" onClick={retry}>Retry</button></div>; }
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

export default memo(Employees);
