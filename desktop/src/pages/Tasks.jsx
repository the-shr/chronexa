import { useState } from 'react';

import TaskRow from '../components/TaskRow.jsx';
import { usePager, ROW } from '../components/Pager.jsx';
import { clockTime } from '../lib/format.js';

export default function Tasks({ snapshot, tasks }) {
  const [filter, setFilter] = useState('open');
  const [busy, setBusy] = useState(false);

  const rows = filter === 'open' ? tasks.open : tasks.done;
  const { ref, slice, control } = usePager(rows, { rowHeight: ROW.task, gap: 7 });

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="page-head">
        <div className="head-main">
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

      <div className="page-body">
        <section className="card">
          <h2>
            {filter === 'open' ? 'Assigned to you' : 'Completed'}
            {control}
          </h2>
          {tasks.error && (
            <p className="faint" style={{ fontSize: 12, margin: '0 0 10px' }}>
              Showing the last synced list — {tasks.error}
            </p>
          )}

          {/* The container is always rendered so the pager can measure it, even
              while the list is empty. */}
          <div className="task-list" ref={ref}>
            {slice.length === 0 ? (
              <p className="empty">
                {filter === 'open'
                  ? 'No open tasks. Your manager has not assigned anything yet.'
                  : 'Nothing completed yet.'}
              </p>
            ) : (
              slice.map((task) => (
                <TaskRow key={task.id} task={task} tasks={tasks} snapshot={snapshot} disabled={busy} onAction={run} />
              ))
            )}
          </div>
        </section>
      </div>
    </>
  );
}
