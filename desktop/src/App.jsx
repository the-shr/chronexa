import { useEffect, useState } from 'react';

import Home from './pages/Home.jsx';
import Activity from './pages/Activity.jsx';
import Profile from './pages/Profile.jsx';
import SignIn from './pages/SignIn.jsx';
import Policy from './pages/admin/Policy.jsx';
import { useTrackerState, useTasks, useTheme, useAccount, useProfile } from './lib/hooks.js';
import SessionBanner from './components/SessionBanner.jsx';
import UpdateBanner from './components/UpdateBanner.jsx';
import { IconSun, IconMoon, IconBell } from './components/Icons.jsx';

const TABS = [
  { id: 'tracker', label: 'Tracker' },
  { id: 'activity', label: 'My Activity' },
];

export default function App() {
  const [tab, setTab] = useState('tracker');
  const { snapshot, error } = useTrackerState();
  const tasks = useTasks();
  const [theme, toggleTheme] = useTheme();
  const [account, refreshAccount] = useAccount();
  const { profile } = useProfile();
  const canConfigure = Boolean(account?.user?.canManageTrackingPolicy);

  useEffect(() => {
    if (canConfigure) window.api.configuration.get().catch(() => {});
  }, [canConfigure]);

  // Say what happened rather than showing an empty window.
  if (error) {
    return (
      <div className="fallback">
        <div className="fallback-card">
          <h1>Chronexa could not start</h1>
          <p>The app could not reach its own background service. Restarting usually clears it.</p>
          <pre>{String(error.message || error)}</pre>
          <button className="btn primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!snapshot || !account) {
    return (
      <div className="fallback">
        <div className="fallback-card">
          <p className="muted">Starting…</p>
        </div>
      </div>
    );
  }

  // A fresh install has no account at all. Ask who this is before showing a
  // dashboard, since the answer decides which dashboard it should be.
  if (!account.signedIn && !account.sessionExpired) return <SignIn onSignedIn={refreshAccount} />;

  const name = profile?.user?.name || account?.user?.name || account?.user?.email || 'Not signed in';
  const avatar = profile?.avatar || null;
  const tabs = canConfigure ? [...TABS, { id: 'configuration', label: 'Configuration' }] : TABS;

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand-pill">Chronexa</span>

        <nav className="top-nav">
          {tabs.map(({ id, label }) => (
            <button key={id} className={tab === id ? 'top-tab active' : 'top-tab'} onClick={() => setTab(id)}>
              {label}
              {id === 'tracker' && tasks.open.length > 0 && <span className="nav-badge">{tasks.open.length}</span>}
            </button>
          ))}
        </nav>

        <button
          className="round-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        >
          {theme === 'dark' ? <IconSun width={15} height={15} /> : <IconMoon width={15} height={15} />}
        </button>

        <button className="round-btn" title={`${tasks.open.length} open task(s)`}>
          <IconBell width={15} height={15} />
          {tasks.open.length > 0 && <i className="dot" />}
        </button>

        <button
          className={tab === 'profile' ? 'avatar as-button active' : 'avatar as-button'}
          onClick={() => setTab('profile')}
          title="Your profile"
        >
          {avatar ? <img src={avatar} alt="" /> : initials(name)}
        </button>
      </header>

      <UpdateBanner />
      <SessionBanner account={account} onSignedIn={refreshAccount} />

      <main className="content">
        {tab === 'tracker' && <Home snapshot={snapshot} tasks={tasks} account={account} profile={profile} />}
        {tab === 'activity' && <Activity snapshot={snapshot} />}
        {tab === 'configuration' && canConfigure && <Policy />}
        {tab === 'profile' && <Profile />}
      </main>
    </div>
  );
}

function initials(name) {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}
