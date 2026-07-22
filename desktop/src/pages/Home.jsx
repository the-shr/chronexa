import { useState } from 'react';

import RingTimer from '../components/RingTimer.jsx';
import WeekChart from '../components/WeekChart.jsx';
import MetricStrip from '../components/MetricStrip.jsx';
import ProfileCard from '../components/ProfileCard.jsx';
import DaySchedule from '../components/DaySchedule.jsx';
import { usePager, ROW } from '../components/Pager.jsx';
import { humanDuration, dueLabel } from '../lib/format.js';
import { useDailyTotals, useSessions, useSettings } from '../lib/hooks.js';
import { IconCheck } from '../components/Icons.jsx';

export default function Home({ snapshot, tasks, account }) {
  const daily = useDailyTotals(7);
  const sessions = useSessions(40);
  const [settings] = useSettings();
  const [busy, setBusy] = useState(false);
  const { ref, slice } = usePager(tasks.open, { rowHeight: ROW.check, gap: 6 });

  if (!settings) return null;

  const activeTask = snapshot.session?.taskId ? tasks.open.find((t) => t.id === snapshot.session.taskId) : null;
  const weekSeconds = daily.reduce(
    (sum, r) => sum + r.activeSeconds + (settings.idle.countIdleAsWork ? r.idleSeconds : 0),
    0,
  );
  const doneCount = tasks.done.length;
  const totalCount = tasks.open.length + doneCount;

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
      <header className="greeting">
        <h1>
          {greeting()}, <span>{firstName(account)}</span>
        </h1>
      </header>

      <MetricStrip snapshot={snapshot} settings={settings} tasks={tasks} />

      <div className="page-body home-grid">
        <ProfileCard account={account} snapshot={snapshot} />

        <section className="card progress-card">
          <h2>Progress</h2>
          <div className="progress-head">
            <strong className="mono">{humanDuration(weekSeconds)}</strong>
            <span>
              Work time
              <br />
              this week
            </span>
          </div>
          <WeekChart rows={daily} />
        </section>

        <RingTimer snapshot={snapshot} settings={settings} busy={busy} onAction={run} activeTask={activeTask} />

        <section className="card checklist-card">
          <h2>
            Tasks
            <span className="count mono">
              {doneCount}/{totalCount || 0}
            </span>
          </h2>
          <div className="checklist" ref={ref}>
            {slice.length === 0 ? (
              <p className="empty">Nothing assigned right now.</p>
            ) : (
              slice.map((task) => {
                const due = dueLabel(task.dueAt);
                return (
                  <button
                    key={task.id}
                    className="check-row"
                    disabled={busy}
                    onClick={() => run(() => tasks.setStatus(task.id, 'done'))}
                    title="Mark done"
                  >
                    <span className="check-row-body">
                      <span className="truncate">{task.title}</span>
                      <small className={due?.overdue ? 'overdue' : undefined}>
                        {due ? due.text : task.priority === 'high' ? 'High priority' : 'No due date'}
                      </small>
                    </span>
                    <span className="check-mark">
                      <IconCheck width={12} height={12} />
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <DaySchedule sessions={sessions} />
      </div>
    </>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function firstName(account) {
  const name = account?.user?.name || account?.user?.email || 'there';
  return name.split(/[\s@]/)[0];
}
