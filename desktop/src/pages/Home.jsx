import { useEffect, useState } from 'react';

import {
  MetricRow,
  ProfileCard,
  WorkConsistencyCard,
  ProgressCard,
  TrackerCard,
  DeadlinePulseCard,
  TodayBreakdownCard,
  TaskHubCard,
} from '../components/home-cards.jsx';
import { useDailyTotals, useSessions, useSettings } from '../lib/hooks.js';

export default function Home({ snapshot, tasks, account, profile }) {
  const daily = useDailyTotals(7);
  const sessions = useSessions(120);
  const [settings] = useSettings();
  const [busy, setBusy] = useState(false);

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
          <ProfileCard account={account} snapshot={snapshot} profile={profile} />
          <AttendanceCard settings={settings} />
          <WorkConsistencyCard rows={daily} sessions={sessions} settings={settings} />
        </div>

        <ProgressCard rows={daily} weekSeconds={weekSeconds} countIdle={countIdle} settings={settings} />
        <TrackerCard snapshot={snapshot} settings={settings} busy={busy} onAction={run} />
        <TaskHubCard tasks={tasks} snapshot={snapshot} account={account} busy={busy} onAction={run} />
        <div className="right-col">
          <DeadlinePulseCard tasks={tasks} />
          <TodayBreakdownCard snapshot={snapshot} settings={settings} />
        </div>
      </div>
    </>
  );
}

function AttendanceCard({ settings }) {
  const [punches, setPunches] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { window.api.attendance.today().then(data => setPunches(data.punches || [])).catch(() => {}); }, []);
  const checkIn = async () => {
    setBusy(true); setError('');
    try { const data = await window.api.attendance.checkIn(); setPunches(data.punches || []); }
    catch (cause) { setError(cause.message || 'Check-in failed'); }
    finally { setBusy(false); }
  };
  const display = value => new Intl.DateTimeFormat('en-BD', { timeZone: 'Asia/Dhaka', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  const segments = settings.work?.segments || [{ start: settings.work?.officeStart, end: settings.work?.officeEnd }];
  return <section className="card attendance-card"><div><span className="card-kicker">Attendance</span><h2>Today</h2><p>{segments.map(s => `${s.start}–${s.end}`).join(' · ')}</p><p>{punches.length ? `Checked in at ${punches.map(p => display(p.checkedInAt)).join(' · ')}` : 'Not checked in yet'}</p>{error && <small className="form-error">{error}</small>}</div><button className="btn primary" disabled={busy} onClick={checkIn}>{busy ? 'Checking in…' : 'Check in'}</button></section>;
}

function firstName(account) {
  const name = account?.user?.name || account?.user?.email || 'there';
  return name.split(/[\s@]/)[0];
}
