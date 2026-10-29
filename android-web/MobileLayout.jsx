import React, { useEffect, useState } from 'react';
import Employees from '../desktop/src/pages/admin/Employees.jsx';
import Policy from '../desktop/src/pages/admin/Policy.jsx';
import ActivityHistory from '../desktop/src/pages/admin/ActivityHistory.jsx';
import { humanDuration } from '../desktop/src/lib/format.js';
import { native, request } from './bridge.js';
import { BrandMark, NavIcon } from './icons.jsx';
import MobileCheckIns from './MobileCheckIns.jsx';
import { checkInState, dhakaClock } from '../desktop/src/lib/check-ins.js';

const dhakaDay = value => new Date(new Date(value).getTime() + 21600000).toISOString().slice(0, 10);
const dhakaTime = value => new Intl.DateTimeFormat('en-BD', { timeZone: 'Asia/Dhaka', hour: 'numeric', minute: '2-digit' }).format(new Date(value));

function Avatar({ user, large = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user?.id, user?.avatarVersion]);
  const url = user?.hasAvatar && !failed ? `https://appassets.androidplatform.net/media/api/agent/me/avatar?v=${encodeURIComponent(user.avatarVersion || '1')}` : null;
  return <span className={`mobile-avatar ${large ? 'large' : ''}`}>{url ? <img src={url} alt="" onError={() => setFailed(true)} /> : <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="15" r="6" /><path d="M8 34a12 12 0 0 1 24 0" /></svg>}</span>;
}

function TaskScreen({ tasks, taskId, setTaskId, timer, busy, act, load, setTab, checkedIn }) {
  const [filter, setFilter] = useState('open');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState('');
  const [comments, setComments] = useState({});
  const [notes, setNotes] = useState({});
  const [reasons, setReasons] = useState({});
  const rows = tasks.filter(task => filter === 'all' || task.status === filter);
  const pages = Math.max(1, Math.ceil(rows.length / 8));
  const current = Math.min(page, pages);
  return <section className="mobile-page mobile-tasks-page">
    <div className="mobile-page-intro"><span className="mobile-eyebrow">ASSIGNED WORK</span><h1>My tasks</h1><p>{tasks.filter(task => task.status === 'open').length} to do · {tasks.filter(task => task.status === 'pending_approval').length} pending approval</p></div>
    <div className="mobile-filter-row" role="group" aria-label="Task status">{[['open', 'To do'], ['pending_approval', 'Pending'], ['done', 'Completed'], ['all', 'All']].map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setPage(1); }}>{label}</button>)}</div>
    <div className="mobile-task-list">{rows.slice((current - 1) * 8, current * 8).map(task => <article key={task.id} className={`mobile-task ${taskId === task.id ? 'selected' : ''}`}>
      <button className="mobile-task-summary" type="button" aria-expanded={expanded === task.id} onClick={() => setExpanded(value => value === task.id ? '' : task.id)}><span><strong>{task.title}</strong><small>{task.context || task.priority || 'Assigned task'}</small></span><span className={`mobile-status ${task.status}`}>{task.status === 'pending_approval' ? 'Pending' : task.status === 'done' ? 'Done' : 'To do'}</span></button>
      {expanded === task.id && <div className="mobile-task-detail"><p className="mobile-description">{task.description || 'No description.'}</p>{task.resources?.map(resource => <button key={resource.id} className="btn" type="button" onClick={() => act(() => native('open', { url: resource.url }))}>{resource.name || resource.url}</button>)}{task.comments?.map((comment, index) => <p className="mobile-comment" key={comment.id || index}>{comment.body || comment.content || comment.text}</p>)}<label>Comment<textarea value={comments[task.id] || ''} onChange={event => setComments(value => ({ ...value, [task.id]: event.target.value }))} maxLength={5000} /></label><button className="btn" disabled={busy || !comments[task.id]?.trim()} onClick={() => act(async () => { await request(`/api/agent/tasks/${encodeURIComponent(task.id)}/comments`, 'POST', { body: comments[task.id].trim() }); setComments(value => ({ ...value, [task.id]: '' })); await load(); })}>Post comment</button>
      {task.status === 'open' && <div className="mobile-task-actions"><button className="btn" disabled={timer.running || busy || !checkedIn} onClick={() => { setTaskId(task.id); setTab('track'); }}>Track this task</button><label>Completion note<textarea value={notes[task.id] || ''} onChange={event => setNotes(value => ({ ...value, [task.id]: event.target.value }))} maxLength={5000} /></label><label>Delay reason (if needed)<input value={reasons[task.id] || ''} onChange={event => setReasons(value => ({ ...value, [task.id]: event.target.value }))} /></label><button className="btn primary" disabled={busy || timer.running} onClick={() => act(async () => { await request(`/api/agent/tasks/${encodeURIComponent(task.id)}`, 'PATCH', { status: 'done', completionNote: notes[task.id] || '', delayReason: reasons[task.id] || '' }); await load(); })}>Submit for approval</button></div>}</div>}
    </article>)}{!rows.length && <p className="mobile-empty">No tasks here.</p>}</div>
    {rows.length > 8 && <footer className="mobile-task-pager"><span>{(current - 1) * 8 + 1}–{Math.min(current * 8, rows.length)} of {rows.length}</span><div><button disabled={current <= 1} onClick={() => setPage(value => value - 1)} aria-label="Previous page">‹</button><span>{current} / {pages}</span><button disabled={current >= pages} onClick={() => setPage(value => value + 1)} aria-label="Next page">›</button></div></footer>}
  </section>;
}

export default function MobileLayout(props) {
  const { account, setAccount, tab, setTab, error, setError, busy, timer, setTimer, tasks, setTasks, taskId, setTaskId, note, setNote, policy, activity, setActivity, selectedDay, setSelectedDay, attendance, setAttendance, update, auto, setAuto, act, refresh, load, checkUpdate, outdated, todaySeconds, current, captureRequired } = props;
  const admin = account.user?.canManageTrackingPolicy;
  const canViewEmployees = admin || account.user?.canViewEmployeeTracking;
  const openTasks = tasks.filter(task => task.status === 'open');
  const checkin = checkInState(attendance?.punches || [], policy?.work);
  const [checkInNotice, setCheckInNotice] = useState('');
  const performCheckIn = () => act(async () => {
    const early = checkin.delta !== null && checkin.delta < 0;
    const result = await request('/api/agent/attendance', 'POST');
    setAttendance(result);
    const refreshed = checkInState(result.punches || [], policy?.work);
    setCheckInNotice(!refreshed.covered ? 'A recent check-in exists. Try again when this duty period begins.' : early ? `Early check-in recorded. Duty starts at ${checkin.expected}.` : 'Check-in recorded.');
  });
  const targetHours = Number(activity?.dailyTargetHours ?? policy?.dailyTargetHours ?? 0);
  const progress = targetHours > 0 ? Math.min(100, Math.round(todaySeconds / (targetHours * 3600) * 100)) : 0;
  return <div className="mobile-app">
    <header className="mobile-head"><strong><span className="mobile-logo"><BrandMark /></span><span className="mobile-wordmark"><small>WORKSPACE</small>Chronexa</span></strong><button className="mobile-avatar-button" type="button" aria-label="Open profile" onClick={() => setTab('profile')}><Avatar user={account.user} /></button></header>
    {outdated && <aside className="mobile-notice"><strong>Chronexa {update.latestVersion} is available</strong><p>{update.required ? 'Update to continue tracking.' : 'A new Android version is ready.'}</p><button className="btn primary" onClick={() => act(() => native('installUpdate'))} disabled={busy}>Download update</button></aside>}
    {error && <aside className="mobile-error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}>×</button></aside>}
    <main className="mobile-main">
      {tab === 'track' && <section className="mobile-page mobile-home"><div className="mobile-page-intro"><span className="mobile-eyebrow">{new Intl.DateTimeFormat('en-BD', { timeZone: 'Asia/Dhaka', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span><h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {account.user?.name?.split(' ')[0] || 'there'}.</h1><p>Your day at a glance.</p></div>
        <article className="mobile-attendance"><div><span className="mobile-eyebrow">ATTENDANCE</span><h2>{checkin.covered ? 'Checked in' : 'Check in to start work'}</h2><p>{checkin.expected ? `Duty starts ${checkin.expected}` : 'No duty time set'}{checkin.rows.length ? ` · ${dhakaClock(checkin.rows.at(-1).checkedInAt)}` : ''}</p>{checkInNotice && <small role="status">{checkInNotice}</small>}</div><button className="btn" disabled={busy || checkin.covered} onClick={performCheckIn}>{checkin.covered ? 'Done' : 'Check in'}</button></article>
        <article className={`mobile-timer ${timer.running ? 'running' : ''}`}><div className="mobile-timer-top"><span>{timer.running ? 'TRACKING NOW' : current && timer.reason !== 'manual-stop' ? 'PAUSED' : 'READY TO START'}</span><small>{timer.syncing ? 'Syncing…' : timer.pending ? 'Waiting to sync' : 'Synced'}</small></div><div className="mobile-time-ring" style={{ '--progress': `${progress}%` }}><div><strong>{humanDuration(todaySeconds)}</strong><span>tracked today</span></div></div><p>{timer.running ? current?.taskNote || 'General work' : taskId ? tasks.find(task => task.id === taskId)?.title : current?.taskNote || 'General work'}</p><button className="btn primary" disabled={busy || (!timer.running && (!checkin.covered || (outdated && update.required)))} onClick={() => act(async () => { if (timer.running) await native('pause'); else await native('start', { taskId: taskId ? `bmos:${taskId}` : note ? '' : current?.taskId || '', taskNote: tasks.find(task => task.id === taskId)?.title || note || current?.taskNote || 'General work' }); await refresh(); })}>{busy ? 'Please wait…' : timer.running ? 'Pause tracking' : current && timer.reason !== 'manual-stop' ? 'Resume tracking' : 'Start tracking'}</button>{(timer.error || timer.syncError) && <p className="form-error">{timer.error || timer.syncError}</p>}</article>
        <div className="mobile-day-grid"><article><span>Today</span><strong>{humanDuration(todaySeconds)}</strong><small>Work time</small></article><article><span>Tasks</span><strong>{openTasks.length}</strong><small>To do</small></article><article><span>Progress</span><strong>{targetHours > 0 ? `${progress}%` : '—'}</strong><small>{targetHours > 0 ? 'Daily target' : 'No target set'}</small></article></div>
        {!timer.running && <label className="mobile-note">Work note<input value={note} onChange={event => { setNote(event.target.value); if (event.target.value) setTaskId(''); }} placeholder="What are you working on?" maxLength={300} /></label>}
        <div className="mobile-section-title"><div><span className="mobile-eyebrow">UP NEXT</span><h2>Assigned tasks</h2></div><button onClick={() => setTab('tasks')}>View all</button></div><div className="mobile-home-tasks">{openTasks.slice(0, 3).map(task => <button key={task.id} onClick={() => { setTab('tasks'); }}><span><strong>{task.title}</strong><small>{task.context || task.priority || 'Assigned task'}</small></span><span aria-hidden="true">›</span></button>)}{!openTasks.length && <p>No tasks waiting. You can track general work.</p>}</div>
      </section>}
      {tab === 'tasks' && <TaskScreen tasks={tasks} taskId={taskId} setTaskId={setTaskId} timer={timer} busy={busy} act={act} load={load} setTab={setTab} checkedIn={checkin.covered} />}
      {tab === 'checkins' && <MobileCheckIns attendance={attendance} work={policy?.work} onCheckIn={performCheckIn} busy={busy} notice={checkInNotice} />}
      {tab === 'activity' && <section className="mobile-page"><div className="mobile-page-intro"><span className="mobile-eyebrow">YOUR RECORD</span><h1>My activity</h1></div><ActivityHistory daily={activity?.daily || []} targetHours={activity?.dailyTargetHours ?? 0} selectedDay={selectedDay} onSelect={setSelectedDay} /><h2>{selectedDay}</h2>{(activity?.sessions || []).filter(row => dhakaDay(row.startedAt) === selectedDay).map(row => <article className="mobile-task" key={row.id}><strong>{row.taskTitle || row.note || 'General work'}</strong><p>{dhakaTime(row.startedAt)} · {humanDuration(row.activeSeconds)}</p></article>)}</section>}
      {tab === 'team' && canViewEmployees && <div className="mobile-admin-screen"><Employees /></div>}
      {tab === 'config' && admin && <div className="mobile-admin-screen"><Policy /></div>}
      {tab === 'profile' && <section className="mobile-page mobile-profile"><div className="mobile-profile-card"><Avatar user={account.user} large /><h1>{account.user?.name || 'Your profile'}</h1><p>{account.user?.email}</p><span>{account.user?.role || 'Team member'}</span></div><button className="mobile-menu-row" onClick={() => setTab('settings')}><span>Settings</span><span aria-hidden="true">›</span></button><button className="mobile-menu-row" onClick={() => setTab('activity')}><span>My activity</span><span aria-hidden="true">›</span></button></section>}
      {tab === 'settings' && <section className="mobile-page mobile-settings"><div className="mobile-page-intro"><span className="mobile-eyebrow">PREFERENCES</span><h1>Settings</h1></div><label className="mobile-toggle">Check for updates automatically<input type="checkbox" checked={auto} onChange={event => { setAuto(event.target.checked); localStorage.setItem('autoUpdate', event.target.checked); }} /></label><button className="mobile-menu-row" onClick={checkUpdate}><span>Check for updates</span><span aria-hidden="true">›</span></button><article className="mobile-task"><h2>Screen capture</h2><p>{captureRequired ? 'Your organisation enables screen capture. Android asks permission when you start.' : 'Your organisation has screen capture turned off.'}</p><p>Locking your phone or stopping screen sharing pauses tracking. Reopen Chronexa and tap Resume when you return.</p></article><p className="mobile-version">Chronexa {account.version} · Android</p><button className="btn" disabled={busy || timer.running} onClick={() => act(async () => { await native('sync'); await native('logout'); setAccount({ ...account, signedIn: false, user: null }); setTasks([]); setActivity(null); setTimer({}); })}>Sign out</button></section>}
    </main>
    <nav className="mobile-nav" aria-label="Main navigation">{[['track', 'Home'], ['tasks', 'Tasks'], ['checkins', 'Check-ins'], ['activity', 'Activity'], ...(canViewEmployees ? [['team', 'Team']] : []), ...(admin ? [['config', 'Admin']] : [])].map(([id, label]) => <button key={id} type="button" aria-label={label} aria-current={tab === id || (tab === 'profile' && id === 'settings') ? 'page' : undefined} onClick={() => { setTab(id); if (id === 'activity') act(load); }}><span className="mobile-nav-icon"><NavIcon name={id} /></span><span className="mobile-nav-label">{label}</span></button>)}</nav>
  </div>;
}
