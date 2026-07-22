import { useState } from 'react';

import Home from './pages/Home.jsx';
import Tasks from './pages/Tasks.jsx';
import Calendar from './pages/Calendar.jsx';
import Activity from './pages/Activity.jsx';
import Settings from './pages/Settings.jsx';
import { useTrackerState, useTasks, useTheme, useAccount } from './lib/hooks.js';
import { IconSun, IconMoon, IconClock } from './components/Icons.jsx';

const TABS = [
  { id: 'home', label: 'Dashboard' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'activity', label: 'Activity' },
  { id: 'settings', label: 'Settings' },
];

export default function App() {
  const [tab, setTab] = useState('home');
  const snapshot = useTrackerState();
  const tasks = useTasks();
  const [theme, toggleTheme] = useTheme();
  const [account] = useAccount();

  if (!snapshot) return null;

  const name = account?.user?.name || account?.user?.email || 'Not signed in';

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand-pill">
          <span className="brand-mark">
            <IconClock width={15} height={15} />
          </span>
          Chronexa
        </span>

        <nav className="top-nav">
          {TABS.map(({ id, label }) => (
            <button key={id} className={tab === id ? 'top-tab active' : 'top-tab'} onClick={() => setTab(id)}>
              {label}
              {id === 'tasks' && tasks.open.length > 0 && <span className="nav-badge">{tasks.open.length}</span>}
            </button>
          ))}
        </nav>

        <button
          className="icon-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        >
          {theme === 'dark' ? <IconSun width={15} height={15} /> : <IconMoon width={15} height={15} />}
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
