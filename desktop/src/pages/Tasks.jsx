import { useEffect, useMemo, useState } from 'react';
import { dueLabel, humanDuration, clockTime } from '../lib/format.js';
import { IconCheck, IconChevron, IconChevronDown, IconPause, IconPlay, IconStop, IconSync } from '../components/Icons.jsx';
import { useSettings } from '../lib/hooks.js';

export default function Tasks({ snapshot, tasks }) {
  const [filter, setFilter] = useState('open');
  const [selectedId, setSelectedId] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [completing, setCompleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [settings] = useSettings();
  const source = filter === 'open' ? tasks.open : tasks.done;
  const tree = useMemo(() => buildTree(source), [source]);
  const selected = source.find((task) => task.id === selectedId) || source[0] || null;
  useEffect(() => { if (selected && selected.id !== selectedId) setSelectedId(selected.id); }, [selected, selectedId]);
  const run = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const toggle = (id) => setExpanded((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return <>
    <header className="page-head">
      <div className="head-main"><h1>Tracker</h1><p>Select a task, track your time, and submit completed work · {tasks.open.length} open · {tasks.done.length} submitted{tasks.fetchedAt && ` · synced ${clockTime(tasks.fetchedAt)}`}</p></div>
      <div className="seg"><button className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>Open</button><button className={filter === 'done' ? 'active' : ''} onClick={() => setFilter('done')}>Submitted</button></div>
      <button className="btn ghost sm icon-label" onClick={() => run(tasks.refresh)} disabled={busy}><IconSync width={14} /> Refresh</button>
    </header>
    <div className="task-workspace">
      <section className="task-index">
        {tasks.error && <p className="sync-warning">Offline list · {tasks.error}</p>}
        {!tree.length ? <div className="task-empty"><strong>{filter === 'open' ? 'No work waiting' : 'Nothing submitted yet'}</strong><span>Tasks assigned in Brand Macros OS appear here automatically.</span></div> : tree.map(({ task, children }) => <div className="task-group" key={task.id}>
          <TaskLine task={task} selected={selected?.id === task.id} hasChildren={children.length > 0} expanded={expanded.has(task.id)} onExpand={() => toggle(task.id)} onSelect={() => setSelectedId(task.id)} />
          {expanded.has(task.id) && children.map((child) => <TaskLine key={child.id} task={child} child selected={selected?.id === child.id} onSelect={() => setSelectedId(child.id)} />)}
        </div>)}
      </section>
      <TaskDetail task={selected} snapshot={snapshot} settings={settings} busy={busy} onRun={run} onComplete={() => setCompleting(selected)} />
    </div>
    {completing && <CompleteDialog task={completing} busy={busy} onClose={() => setCompleting(null)} onSubmit={(details) => run(async () => { await tasks.setStatus(completing.id, 'done', details); setCompleting(null); })} />}
  </>;
}

function buildTree(rows) {
  const byId = new Map(rows.map((task) => [task.id, task]));
  const children = new Map(); const roots = [];
  for (const task of rows) { if (task.parentExternalId && byId.has(task.parentExternalId)) children.set(task.parentExternalId, [...(children.get(task.parentExternalId) || []), task]); else roots.push(task); }
  return roots.map((task) => ({ task, children: children.get(task.id) || [] }));
}

function TaskLine({ task, selected, child, hasChildren, expanded, onExpand, onSelect }) {
  const due = dueLabel(task.dueAt);
  return <div className={`task-line ${selected ? 'selected' : ''} ${child ? 'child' : ''}`} onClick={onSelect}>
    <span className={`task-state ${task.status === 'done' ? 'complete' : ''}`}>{task.status === 'done' && <IconCheck width={11} />}</span>
    <span className="task-line-copy"><strong>{task.title}</strong><small>{[task.projectName, task.clientName].filter(Boolean).join(' · ') || 'Independent task'}</small></span>
    {task.priority === 'high' && <span className="task-priority">High</span>}{due && task.status !== 'done' && <span className={due.overdue ? 'task-due late' : 'task-due'}>{due.text}</span>}
    {hasChildren && <button className="task-expand" title={expanded ? 'Collapse subtasks' : 'Expand subtasks'} onClick={(event) => { event.stopPropagation(); onExpand(); }}>{expanded ? <IconChevronDown width={15} /> : <IconChevron width={15} />}</button>}
  </div>;
}

function TaskDetail({ task, snapshot, settings, busy, onRun, onComplete }) {
  const ownSession = task ? snapshot.session?.taskId === task.id : Boolean(snapshot.session);
  const tracking = ownSession && snapshot.state === 'running';
  const paused = ownSession && snapshot.state === 'paused';
  const dailyTarget = (settings?.work?.dailyTargetHours || 0) * 3600;
  const progress = dailyTarget ? Math.min(1, snapshot.today.workSeconds / dailyTarget) : 0;
  const start = () => onRun(async () => {
    if (snapshot.state === 'running') await window.api.tracker.stop('manual');
    await window.api.tracker.start(task ? { taskId: task.id, taskNote: task.title } : { taskNote: 'General work' });
  });
  return <aside className="task-detail">
    <div className="detail-eyebrow">{task ? (task.parentTitle ? `Under ${task.parentTitle}` : 'Assigned work') : 'Work session'}</div><h2>{task?.title || snapshot.session?.taskNote || 'Time tracker'}</h2>
    {task && <div className="detail-chips"><span>{task.hubStatus?.replaceAll('_', ' ') || 'OPEN'}</span><span>{task.priority || 'normal'} priority</span>{task.dueAt && <span>Due {new Date(task.dueAt).toLocaleString()}</span>}</div>}
    {(!task || task.status !== 'done') && <section className="classic-tracker">
      <div className="ring-wrap">
        <div className="ring" data-target={dailyTarget ? 'set' : 'none'} style={{ '--progress': progress, '--ring-color': tracking ? 'var(--accent)' : paused ? 'var(--idle)' : 'var(--text-faint)' }}>
          <div className="ring-inner"><span className="ring-time mono">{timerClock(ownSession ? snapshot.session?.activeSeconds : 0)}</span><span className="ring-label">{tracking ? 'work time' : paused ? 'paused' : 'ready'}</span></div>
        </div>
      </div>
      <div className="tracker-controls classic-controls">
        {tracking ? <button className="round-ctl primary-ctl" disabled={busy} onClick={() => onRun(() => window.api.tracker.pause())} title="Pause tracking"><IconPause width={18} /></button> : <button className="round-ctl primary-ctl" disabled={busy} onClick={paused ? () => onRun(() => window.api.tracker.resume()) : start} title={paused ? 'Resume tracking' : 'Start tracking'}><IconPlay width={18} /></button>}
        <button className="round-ctl solid" disabled={busy || (!tracking && !paused)} onClick={() => onRun(() => window.api.tracker.stop('manual'))} title="Stop tracking"><IconStop width={14} /></button>
      </div>
    </section>}
    {!task && <p className="task-description">Start a general work session now, or select an assigned task when one appears.</p>}
    {task?.description && <p className="task-description">{task.description}</p>}
    {task && <dl className="task-context"><div><dt>Project</dt><dd>{task.projectName || 'Not linked'}</dd></div><div><dt>Client</dt><dd>{task.clientName || 'Not linked'}</dd></div>{task.estimateMinutes && <div><dt>Estimate</dt><dd>{humanDuration(task.estimateMinutes * 60)}</dd></div>}</dl>}
    {task && <div className="detail-actions">{task.status !== 'done' && <button className="btn" disabled={busy} onClick={onComplete}><IconCheck width={14} /> Submit work</button>}{task.status === 'done' && <div className="submitted-note"><IconCheck width={15} /> Submitted to Brand Macros OS</div>}</div>}
  </aside>;
}

function timerClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map((part) => String(part).padStart(2, '0')).join(':');
}

function CompleteDialog({ task, busy, onClose, onSubmit }) {
  const [note, setNote] = useState(''); const overdue = task.dueAt && new Date(task.dueAt) < new Date(); const [delayReason, setDelayReason] = useState('');
  return <div className="lightbox" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="complete-dialog" onSubmit={(e) => { e.preventDefault(); onSubmit({ completionNote: note.trim() || undefined, delayReason: delayReason.trim() || undefined }); }}>
    <div><span className="detail-eyebrow">Submit for approval</span><h2>{task.title}</h2></div>
    <label><span>Completion note</span><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was completed?" rows="4" autoFocus /></label>
    {overdue && <label><span>Reason for delay</span><textarea required value={delayReason} onChange={(e) => setDelayReason(e.target.value)} placeholder="Briefly explain why the deadline was missed." rows="3" /></label>}
    <p>Submitting moves this task to Pending Approval in Brand Macros OS.</p><div className="dialog-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || (overdue && !delayReason.trim())}>Submit work</button></div>
  </form></div>;
}
