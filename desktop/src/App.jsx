import { useState } from 'react';

import Dashboard from './pages/Dashboard.jsx';
import Screenshots from './pages/Screenshots.jsx';
import History from './pages/History.jsx';
import Settings from './pages/Settings.jsx';
import Account from './pages/Account.jsx';
import { useTrackerState } from './lib/hooks.js';
import { hms } from './lib/format.js';

const TABS = [
  { id: 'dashboard', label: 'Timer', icon: '⏱' },
  { id: 'screenshots', label: 'Screenshots', icon: '🖼' },
  { id: 'history', label: 'History', icon: '📋' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
  { id: 'account', label: 'Account', icon: '👤' },
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const snapshot = useTrackerState();

  const running = snapshot?.state === 'running';
  const idle = running && snapshot.idlePhase !== 'active';

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" data-state={idle ? 'idle' : snapshot?.state || 'stopped'} />
          <div>
            <strong>Chronexa</strong>
            <small>{idle ? 'Idle' : running ? 'Tracking' : snapshot?.state === 'paused' ? 'Paused' : 'Stopped'}</small>
          </div>
        </div>

        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'nav active' : 'nav'} onClick={() => setTab(t.id)}>
              <span className="nav-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className="muted">Today</span>
          <strong className="mono">{hms(snapshot?.todaySeconds)}</strong>
        </div>
      </aside>

      <main className="content">
        {tab === 'dashboard' && <Dashboard snapshot={snapshot} />}
        {tab === 'screenshots' && <Screenshots />}
        {tab === 'history' && <History />}
        {tab === 'settings' && <Settings />}
        {tab === 'account' && <Account />}
      </main>
    </div>
  );
}
