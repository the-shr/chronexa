import { useState } from 'react';

import Home from './pages/Home.jsx';
import Tasks from './pages/Tasks.jsx';
import Calendar from './pages/Calendar.jsx';
import Activity from './pages/Activity.jsx';
import Settings from './pages/Settings.jsx';
import { useTrackerState, useTasks, useTheme, useAccount } from './lib/hooks.js';
import { humanDuration } from './lib/format.js';
import {
  IconHome,
  IconTasks,
  IconCalendar,
  IconChart,
  IconSettings,
  IconSun,
  IconMoon,
  IconClock,
} from './components/Icons.jsx';

const TABS = [
  { id: 'home', label: 'Home', Icon: IconHome },
  { id: 'tasks', label: 'My tasks', Icon: IconTasks },
  { id: 'calendar', label: 'Calendar', Icon: IconCalendar },
  { id: 'activity', label: 'Activity', Icon: IconChart },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
];

export default function App() {
  const [tab, setTab] = useState('home');
  const snapshot = useTrackerState();
  const tasks = useTasks();
  const [theme, toggleTheme] = useTheme();
  const [account] = useAccount();

  if (!snapshot) return null;

  const running = snapshot.state === 'running';
  const phase = running ? (snapshot.idlePhase === 'active' ? 'active' : 'idle') : snapshot.state;
  const name = account?.user?.name || account?.user?.email || 'Not signed in';

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <IconClock width={16} height={16} />
          </span>
          <span className="brand-name">Chronexa</span>
          <button
            className="icon-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          >
            {theme === 'dark' ? <IconSun width={15} height={15} /> : <IconMoon width={15} height={15} />}
          </button>
        </div>

        <nav>
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} className={tab === id ? 'nav active' : 'nav'} onClick={() => setTab(id)}>
              <Icon />
              {label}
              {id === 'tasks' && tasks.open.length > 0 && <span className="nav-badge">{tasks.open.length}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="today-card">
            <span>Tracked today</span>
            <strong className="mono">{humanDuration(snapshot.today.workSeconds)}</strong>
          </div>
          <div className="user-chip">
            <span className="avatar">{initials(name)}</span>
            <div>
              <strong>{name}</strong>
              <small>{phaseLabel(phase)}</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="content">
        {tab === 'home' && <Home snapshot={snapshot} tasks={tasks} />}
        {tab === 'tasks' && <Tasks snapshot={snapshot} tasks={tasks} />}
        {tab === 'calendar' && <Calendar />}
        {tab === 'activity' && <Activity snapshot={snapshot} />}
        {tab === 'settings' && <Settings />}
      </main>
    </div>
  );
}

function phaseLabel(phase) {
  return { active: 'Tracking', idle: 'Idle — paused', paused: 'Paused', stopped: 'Not tracking' }[phase] || phase;
}

function initials(name) {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}
