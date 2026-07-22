import { useState } from 'react';

import RingTimer from '../components/RingTimer.jsx';
import WeekChart from '../components/WeekChart.jsx';
import TaskRow from '../components/TaskRow.jsx';
import { usePager, ROW } from '../components/Pager.jsx';
import { humanDuration } from '../lib/format.js';
import { useDailyTotals, useSettings } from '../lib/hooks.js';

export default function Home({ snapshot, tasks }) {
  const daily = useDailyTotals(7);
  const [settings] = useSettings();
  const [busy, setBusy] = useState(false);
  // As many as the card can hold; the rest live on My tasks. No pager here --
  // this is a glance, not a list to work through.
  const { ref, slice: upNext } = usePager(tasks.open, { rowHeight: ROW.taskCompact, gap: 7 });

  if (!settings) return null;

  const { today } = snapshot;
  const activeTask = snapshot.session?.taskId ? tasks.open.find((t) => t.id === snapshot.session.taskId) : null;
  const hidden = tasks.open.length - upNext.length;

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
          <h1>{greeting()}</h1>
          <p>{new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </header>

      <div className="page-body home-grid">
        <RingTimer snapshot={snapshot} settings={settings} busy={busy} onAction={run} activeTask={activeTask} />

        <div className="stat-row">
          <Stat
            label="Worked"
            dot="var(--accent)"
            value={humanDuration(today.workSeconds)}
            note={settings.idle.countIdleAsWork ? 'active + idle' : 'active time only'}
          />
          <Stat
            label="Idle"
            dot="var(--warn)"
            value={humanDuration(today.idleSeconds)}
            note={settings.idle.countIdleAsWork ? 'included above' : 'not counted'}
          />
          <Stat
            label="Productivity"
            dot="var(--ok)"
            value={today.productivity === null ? '—' : `${today.productivity}%`}
            note="active share of time"
          />
        </div>

        <section className="card">
          <h2>
            This week
            <span className="legend">
              <span>
                <i style={{ background: 'var(--accent)' }} />
                Active
              </span>
              <span>
                <i style={{ background: 'var(--warn)', opacity: 0.5 }} />
                Idle
              </span>
            </span>
          </h2>
          <WeekChart rows={daily} />
        </section>

        <section className="card home-tasks">
          <h2>
            Up next
            {hidden > 0 && <span className="faint">+{hidden} more</span>}
          </h2>
          <div className="task-list" ref={ref}>
            {upNext.length === 0 ? (
              <p className="empty">Nothing assigned right now.</p>
            ) : (
              upNext.map((task) => (
                <TaskRow key={task.id} task={task} tasks={tasks} snapshot={snapshot} disabled={busy} onAction={run} compact />
              ))
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, note, dot }) {
  return (
    <div className="stat">
      <div className="stat-label">
        <span className="stat-dot" style={{ background: dot }} />
        {label}
      </div>
      <strong className="mono">{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
