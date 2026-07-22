import { useState } from 'react';

import TaskRow from '../components/TaskRow.jsx';
import { clockTime } from '../lib/format.js';

export default function Tasks({ snapshot, tasks }) {
  const [filter, setFilter] = useState('open');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const rows = filter === 'open' ? tasks.open : tasks.done;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>My tasks</h1>
          <p>
            {tasks.open.length} open · {tasks.done.length} completed
            {tasks.fetchedAt && ` · synced ${clockTime(tasks.fetchedAt)}`}
          </p>
        </div>
        <div className="seg">
          <button className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>
            Open
          </button>
          <button className={filter === 'done' ? 'active' : ''} onClick={() => setFilter('done')}>
            Done
          </button>
        </div>
        <button className="btn ghost sm" onClick={() => run(() => tasks.refresh())} disabled={busy}>
          Refresh
        </button>
      </header>

      {tasks.error && (
        <p className="empty">
          Showing the last synced list — could not reach the server ({tasks.error}).
        </p>
      )}

      {rows.length === 0 ? (
        <div className="card">
          <p className="empty">
            {filter === 'open' ? 'No open tasks. Your manager has not assigned anything yet.' : 'Nothing completed yet.'}
          </p>
        </div>
      ) : (
        <div className="task-list">
          {rows.map((task) => (
            <TaskRow key={task.id} task={task} tasks={tasks} snapshot={snapshot} disabled={busy} onAction={run} />
          ))}
        </div>
      )}
    </>
  );
}
