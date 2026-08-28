import { useEffect, useState } from 'react';

import {
  MetricRow,
  ProfileCard,
  InfoCard,
  ProgressCard,
  TrackerCard,
  TodayCard,
} from '../components/home-cards.jsx';
import { useDailyTotals, useSettings } from '../lib/hooks.js';

export default function Home({ snapshot, tasks, account }) {
  const daily = useDailyTotals(7);
  const [settings] = useSettings();
  const [busy, setBusy] = useState(false);
  const [sync, setSync] = useState(null);

  useEffect(() => {
    let alive = true;
    window.api.sync.status().then((s) => alive && setSync(s));
    const off = window.api.sync.onStatus(setSync);
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (!settings) return null;

  const countIdle = settings.idle.countIdleAsWork;
  const weekSeconds = daily.reduce((sum, r) => sum + r.activeSeconds + (countIdle ? r.idleSeconds : 0), 0);

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
          Track your work, <span>{firstName(account)}</span>
        </h1>
      </header>

      <MetricRow snapshot={snapshot} settings={settings} tasks={tasks} weekSeconds={weekSeconds} />

      <div className="page-body home-grid">
        <div className="side-col">
          <ProfileCard account={account} snapshot={snapshot} />
          <InfoCard account={account} settings={settings} sync={sync} />
        </div>

        <ProgressCard rows={daily} weekSeconds={weekSeconds} countIdle={countIdle} />
        <TrackerCard snapshot={snapshot} settings={settings} busy={busy} onAction={run} />
        <div className="right-col">
          <TodayCard snapshot={snapshot} settings={settings} />
          <section className="card tracker-queue">
            <h2>Ready to track</h2>
            <div className="detail-list">
              {tasks.open.slice(0, 5).map((task) => <button key={task.id} className="pol-person" disabled={busy} onClick={() => run(async () => {
                if (snapshot.state === 'running') await window.api.tracker.stop('manual');
                await window.api.tracker.start({ taskId: task.id, taskNote: task.title });
              })}><span className="pol-person-name"><strong className="truncate">{task.title}</strong><small>{task.projectName || task.clientName || 'Independent task'}</small></span><span className="pol-person-edit">Start</span></button>)}
              {!tasks.open.length && <p className="empty">No assigned work is waiting.</p>}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function firstName(account) {
  const name = account?.user?.name || account?.user?.email || 'there';
  return name.split(/[\s@]/)[0];
}
