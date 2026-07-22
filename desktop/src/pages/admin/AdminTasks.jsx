import { useState } from 'react';

import { useAdminTasks, useOverview } from '../../lib/admin-hooks.js';
import { usePager, ROW } from '../../components/Pager.jsx';
import { dueLabel, humanDuration } from '../../lib/format.js';
import { LoadError, Pill, Avatar } from '../../components/admin-bits.jsx';
import { IconPlus, IconCheck, IconTrash } from '../../components/Icons.jsx';

/** Assign work and watch it land. */
export default function AdminTasks() {
  const [filter, setFilter] = useState({ userId: '', status: 'open' });
  const board = useAdminTasks(filter);
  const { data: overview } = useOverview(7);
  const people = overview?.people || [];

  const { ref, slice, control } = usePager(board.tasks, { rowHeight: ROW.task, gap: 6 });

  if (board.error && !board.data) return <LoadError error={board.error} onRetry={board.reload} />;

  return (
    <div className="page-body tasks-grid">
      <AssignCard people={people} board={board} defaultUserId={filter.userId} />

      <section className="card board-card">
        <div className="checklist-head">
          <h2>Assigned</h2>
          <span className="head-tools">{control}</span>
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
            <p className="empty">Nothing here. Assign something on the left.</p>
          ) : (
            slice.map((task) => <TaskCard key={task.id} task={task} people={people} board={board} />)
          )}
        </div>
      </section>
    </div>
  );
}

/* -------------------------------- assign -------------------------------- */

function AssignCard({ people, board, defaultUserId }) {
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
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card assign-card">
      <h2>Assign work</h2>

      <form className="assign-fields" onSubmit={submit}>
        <input value={form.title} onChange={set('title')} placeholder="What needs doing?" maxLength={200} required />

        <label>
          <span>Assign to</span>
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
          <span>Estimate (min)</span>
          <input type="number" min="0" step="15" value={form.estimateMinutes} onChange={set('estimateMinutes')} />
        </label>

        <button className="btn primary" disabled={busy || !form.title.trim() || !userId}>
          <IconPlus width={14} height={14} />
          {busy ? 'Assigning…' : 'Assign'}
        </button>

        {error && <p className="form-error">{error}</p>}
        {!error && done && <p className="form-ok">Assigned “{done}”.</p>}
      </form>

      <p className="assign-note">
        It reaches their dashboard within a couple of minutes, and sooner if they are online.
      </p>
    </section>
  );
}

/* --------------------------------- rows --------------------------------- */

function TaskCard({ task, people, board }) {
  const [busy, setBusy] = useState(false);
  const due = dueLabel(task.dueAt);
  const owner = people.find((p) => p.id === task.userId);

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
      </span>

      {task.priority === 'high' && <Pill tone="warn">High</Pill>}
      {task.source === 'self' && <Pill>Their own</Pill>}

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

      <button
        className="check-btn"
        disabled={busy}
        onClick={() => run(() => board.update({ id: task.id, status: task.status === 'done' ? 'open' : 'done' }))}
        title={task.status === 'done' ? 'Reopen' : 'Mark done'}
      >
        <IconCheck width={12} height={12} />
      </button>

      <button
        className="check-remove"
        disabled={busy}
        onClick={() => run(() => board.remove(task.id))}
        title="Delete this task"
      >
        <IconTrash width={12} height={12} />
      </button>
    </div>
  );
}
