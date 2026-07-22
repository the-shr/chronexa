import { useEffect, useState } from 'react';

import {
  MetricRow,
  ProfileCard,
  InfoCard,
  ProgressCard,
  TrackerCard,
  TodayCard,
  ChecklistCard,
  ScheduleCard,
} from '../components/home-cards.jsx';
import { usePager, ROW } from '../components/Pager.jsx';
import { useDailyTotals, useSessions, useSettings } from '../lib/hooks.js';

export default function Home({ snapshot, tasks, account }) {
  const daily = useDailyTotals(7);
  const sessions = useSessions(120);
  const [settings] = useSettings();
  const [busy, setBusy] = useState(false);
  const [sync, setSync] = useState(null);
  const { ref, slice } = usePager(tasks.open, { rowHeight: ROW.check, gap: 6 });

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
          Welcome back, <span>{firstName(account)}</span>
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
        <ScheduleCard sessions={sessions} />

        <div className="right-col">
          <TodayCard snapshot={snapshot} settings={settings} />
          <ChecklistCard tasks={tasks} busy={busy} onAction={run} listRef={ref} slice={slice} />
        </div>
      </div>
    </>
  );
}

function firstName(account) {
  const name = account?.user?.name || account?.user?.email || 'there';
  return name.split(/[\s@]/)[0];
}
