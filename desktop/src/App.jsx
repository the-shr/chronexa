import { useState } from 'react';

import Home from './pages/Home.jsx';
import Tasks from './pages/Tasks.jsx';
import Calendar from './pages/Calendar.jsx';
import Activity from './pages/Activity.jsx';
import Settings from './pages/Settings.jsx';
import { useTrackerState, useTasks, useTheme, useAccount } from './lib/hooks.js';
import { IconSun, IconMoon, IconBell, IconSettings } from './components/Icons.jsx';

const TABS = [
  { id: 'home', label: 'Dashboard' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'activity', label: 'Activity' },
];

export default function App() {
  const [tab, setTab] = useState('home');
  const { snapshot, error } = useTrackerState();
  const tasks = useTasks();
  const [theme, toggleTheme] = useTheme();
  const [account] = useAccount();

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

  if (!snapshot) {
    return (
      <div className="fallback">
        <div className="fallback-card">
          <p className="muted">Starting…</p>
        </div>
      </div>
    );
  }

  const name = account?.user?.name || account?.user?.email || 'Not signed in';

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand-pill">Chronexa</span>

        <nav className="top-nav">
          {TABS.map(({ id, label }) => (
            <button key={id} className={tab === id ? 'top-tab active' : 'top-tab'} onClick={() => setTab(id)}>
              {label}
              {id === 'tasks' && tasks.open.length > 0 && <span className="nav-badge">{tasks.open.length}</span>}
            </button>
          ))}
        </nav>

        <button
          className={tab === 'settings' ? 'setting-pill active' : 'setting-pill'}
          onClick={() => setTab('settings')}
        >
          <IconSettings width={14} height={14} />
          Setting
        </button>

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

        <span className="avatar" title={name}>
          {initials(name)}
        </span>
      </header>

      <main className="content">
        {tab === 'home' && <Home snapshot={snapshot} tasks={tasks} account={account} />}
        {tab === 'tasks' && <Tasks snapshot={snapshot} tasks={tasks} />}
        {tab === 'calendar' && <Calendar />}
        {tab === 'activity' && <Activity snapshot={snapshot} />}
        {tab === 'settings' && <Settings />}
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
