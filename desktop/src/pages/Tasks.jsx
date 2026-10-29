import { useEffect, useMemo, useState } from 'react';
import { TaskViewer, SubmitTaskDialog } from '../components/home-cards.jsx';
import { checkInState } from '../lib/check-ins.js';
import { useSettings } from '../lib/hooks.js';

const PAGE_SIZE = 12;
const FILTERS = [
  ['all', 'All'],
  ['open', 'To do'],
  ['pending_approval', 'Pending approval'],
  ['done', 'Completed'],
];

export default function Tasks({ tasks, snapshot, account, attendance }) {
  const [settings] = useSettings();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState(null);
  const [submitTask, setSubmitTask] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const all = useMemo(() => [...tasks.open, ...(tasks.pending || []), ...tasks.done], [tasks.open, tasks.pending, tasks.done]);
  const rows = useMemo(() => all.filter(task =>
    (filter === 'all' || task.status === filter) &&
    (!query.trim() || `${task.title} ${task.projectName || ''} ${task.clientName || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  ), [all, filter, query]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    if (!opened) return;
    const fresh = all.find(task => task.id === opened.id);
    if (fresh && fresh !== opened) setOpened(fresh);
  }, [all, opened]);

  async function run(action) {
    setBusy(true);
    setError('');
    try { await action(); }
    catch (cause) { setError(cause.message || 'Could not update task.'); }
    finally { setBusy(false); }
  }

  const track = task => run(async () => {
    if (!checkInState(attendance?.punches || [], settings?.work).covered) throw new Error('Check in before tracking a task.');
    if (snapshot.state === 'running' || snapshot.state === 'paused') await window.api.tracker.stop('manual');
    await window.api.tracker.start({ taskId: task.id, taskNote: task.title });
  });

  return <section className="my-tasks-page" aria-label="My Tasks">
    <header className="my-tasks-head"><div><span className="card-kicker">Assigned work</span><h1>My Tasks</h1><p>Track, submit, and follow approval in one place.</p></div><span className="my-tasks-total">{all.length} tasks</span></header>
    <div className="my-tasks-toolbar"><div className="my-tasks-filters" role="group" aria-label="Filter tasks">{FILTERS.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setPage(1); }}>{label}<span>{id === 'all' ? all.length : all.filter(task => task.status === id).length}</span></button>)}</div><input type="search" aria-label="Search my tasks" placeholder="Search tasks" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="my-tasks-scroll"><div className="my-tasks-list">{visible.map(task => <button key={task.id} type="button" className="my-tasks-row" onClick={() => setOpened(task)}><span className="my-tasks-row-main"><strong>{task.title}</strong><small>{[task.projectName, task.clientName].filter(Boolean).join(' · ') || 'Independent task'}</small></span><span className={`my-tasks-status ${task.status}`}>{task.status === 'pending_approval' ? 'Pending approval' : task.status === 'done' ? 'Completed' : task.hubStatus === 'REVISION_REQUESTED' ? 'Revision requested' : 'To do'}</span><span className="my-tasks-chevron" aria-hidden="true">›</span></button>)}{!rows.length && <p className="my-tasks-empty">No tasks match this view.</p>}</div><footer className="my-tasks-pagination"><span>{rows.length ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, rows.length)} of ${rows.length}` : '0 tasks'}</span><div><button type="button" disabled={currentPage <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage >= pages} onClick={() => setPage(value => value + 1)}>Next</button></div></footer></div>
    {opened && <TaskViewer task={opened} snapshot={snapshot} busy={busy} checkedIn={checkInState(attendance?.punches || [], settings?.work).covered} onTrack={() => track(opened)} onClose={() => setOpened(null)} onRequestSubmit={() => setSubmitTask(opened)} onComment={body => run(() => tasks.addComment(opened.id, body))} />}
    {submitTask && <SubmitTaskDialog task={submitTask} account={account} busy={busy} onClose={() => setSubmitTask(null)} onConfirm={details => run(async () => { if (snapshot.session?.taskId === submitTask.id) await window.api.tracker.stop('completed'); await tasks.setStatus(submitTask.id, 'done', details); setOpened(null); setSubmitTask(null); })} />}
  </section>;
}
