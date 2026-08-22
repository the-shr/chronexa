import { useState } from 'react';

import { useAdminTasks, useOverview } from '../../lib/admin-hooks.js';
import { usePager, ROW } from '../../components/Pager.jsx';
import { dueLabel, humanDuration } from '../../lib/format.js';
import { LoadError, Pill, Avatar } from '../../components/admin-bits.jsx';
import { IconPlus, IconCheck, IconTrash } from '../../components/Icons.jsx';

/** Assign work and watch it land. */
export default function AdminTasks() {
  const [filter, setFilter] = useState({ userId: '', status: 'open' });
  const [assigning, setAssigning] = useState(false);
  const board = useAdminTasks(filter);
  const { data: overview } = useOverview(7);
  const people = overview?.people || [];

  const { ref, slice, control } = usePager(board.tasks, { rowHeight: ROW.task, gap: 6 });

  if (board.error && !board.data) return <LoadError error={board.error} onRetry={board.reload} />;

  return (
    <div className="page-body tasks-grid">
      <section className="card board-card">
        <div className="tasks-toolbar">
          <div>
            <h2>Team Tasks</h2>
            <p>BM OS + Chronexa</p>
          </div>
          <span className="head-tools">
            {control}
            <button className="btn primary sm" onClick={() => setAssigning(true)}>
              <IconPlus width={14} height={14} />
              Assign task
            </button>
          </span>
        </div>

        <div className="seg-row">
          {['open', 'done', 'all'].map((s) => (
            <button
              key={s}
              className={filter.status === s ? 'seg active' : 'seg'}
              onClick={() => setFilter((f) => ({ ...f, status: s }))}
            >
              {s === 'open' ? 'Open' : s === 'done' ? 'Done' : 'All'}
            </button>
          ))}
          <span className="seg-sep" />
          <button
            className={!filter.userId ? 'seg active' : 'seg'}
            onClick={() => setFilter((f) => ({ ...f, userId: '' }))}
          >
            Everyone
          </button>
          {people.slice(0, 5).map((p) => (
            <button
              key={p.id}
              className={filter.userId === p.id ? 'seg active' : 'seg'}
              onClick={() => setFilter((f) => ({ ...f, userId: p.id }))}
            >
              {p.name.split(' ')[0]}
            </button>
          ))}
        </div>

        <div className="board-list" ref={ref}>
          {slice.length === 0 ? (
            <p className="empty">No tasks match this view.</p>
          ) : (
            slice.map((task) => <TaskCard key={task.id} task={task} people={people} board={board} />)
          )}
        </div>
      </section>

      {assigning && (
        <AssignModal people={people} board={board} defaultUserId={filter.userId} onClose={() => setAssigning(false)} />
      )}
    </div>
  );
}

/* -------------------------------- assign -------------------------------- */

function AssignModal({ people, board, defaultUserId, onClose }) {
  const [form, setForm] = useState({ title: '', userId: '', priority: 'normal', dueAt: '', estimateMinutes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const userId = form.userId || defaultUserId || people[0]?.id || '';

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !userId) return;
    setBusy(true);
    setError(null);
    try {
      await board.assign({ ...form, userId });
      setDone(form.title.trim());
      setForm((f) => ({ ...f, title: '', dueAt: '', estimateMinutes: '' }));
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="task-modal" role="dialog" aria-modal="true" aria-label="Assign task" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Assign task</h2>
            <p>Task details</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form className="assign-fields" onSubmit={submit}>
          <input value={form.title} onChange={set('title')} placeholder="Task title" maxLength={200} required autoFocus />

          <label>
            <span>Owner</span>
            <select value={userId} onChange={set('userId')}>
              {people.length === 0 && <option value="">No employees yet</option>}
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Priority</span>
            <select value={form.priority} onChange={set('priority')}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </label>

          <label>
            <span>Due</span>
            <input type="date" value={form.dueAt} onChange={set('dueAt')} />
          </label>

          <label>
            <span>Estimate</span>
            <input type="number" min="0" step="15" value={form.estimateMinutes} onChange={set('estimateMinutes')} placeholder="Minutes" />
          </label>

          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy || !form.title.trim() || !userId}>
              <IconPlus width={14} height={14} />
              {busy ? 'Assigning…' : 'Assign'}
            </button>
          </div>

          {error && <p className="form-error">{error}</p>}
          {!error && done && <p className="form-ok">Assigned “{done}”.</p>}
        </form>
      </section>
    </div>
  );
}

/* --------------------------------- rows --------------------------------- */

function TaskCard({ task, people, board }) {
  const [busy, setBusy] = useState(false);
  const due = dueLabel(task.dueAt);
  const owner = people.find((p) => p.id === task.userId) || task.user;
  const fromHub = task.source === 'bmos';

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={task.status === 'done' ? 'board-item done' : 'board-item'}>
      <Avatar name={owner?.name || '?'} size={30} />

      <span className="board-text">
        <strong className="truncate">{task.title}</strong>
        <small className="truncate">
          {owner?.name || 'Unassigned'}
          {due && <span className={due.overdue ? 'overdue' : undefined}> · {due.text}</span>}
          {task.estimateMinutes ? ` · ${humanDuration(task.estimateMinutes * 60)}` : ''}
        </small>
        {task.context && <small className="truncate task-context">{task.context}</small>}
      </span>

      {fromHub && <Pill tone="accent">BM OS</Pill>}
      {task.priority === 'high' && <Pill tone="warn">High</Pill>}
      {task.source === 'self' && <Pill>Their own</Pill>}

      {!fromHub && (
        <select
          className="move-select"
          value={task.userId}
          disabled={busy}
          onChange={(e) => run(() => board.update({ id: task.id, moveTo: e.target.value }))}
          title="Move to someone else"
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      {!fromHub && (
        <button
          className="check-btn"
          disabled={busy}
          onClick={() => run(() => board.update({ id: task.id, status: task.status === 'done' ? 'open' : 'done' }))}
          title={task.status === 'done' ? 'Reopen' : 'Mark done'}
        >
          <IconCheck width={12} height={12} />
        </button>
      )}

      {!fromHub && (
        <button
          className="check-remove"
          disabled={busy}
          onClick={() => run(() => board.remove(task.id))}
          title="Delete this task"
        >
          <IconTrash width={12} height={12} />
        </button>
      )}
    </div>
  );
}
