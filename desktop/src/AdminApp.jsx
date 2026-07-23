import { useState } from 'react';

import Overview from './pages/admin/Overview.jsx';
import People from './pages/admin/People.jsx';
import AdminTasks from './pages/admin/AdminTasks.jsx';
import Screens from './pages/admin/Screens.jsx';
import Recordings from './pages/admin/Recordings.jsx';
import Settings from './pages/Settings.jsx';
import Profile from './pages/Profile.jsx';
import SessionBanner from './components/SessionBanner.jsx';
import { useTheme, useAccount, useProfile } from './lib/hooks.js';
import { initials } from './components/admin-bits.jsx';
import { IconSun, IconMoon, IconSettings } from './components/Icons.jsx';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'people', label: 'People' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'screens', label: 'Screens' },
  { id: 'recordings', label: 'Recordings' },
];

/**
 * What an admin sees instead of the employee dashboard. Same chrome, same
 * cards, same no-scroll rule -- the difference is whose numbers are on screen.
 */
export default function AdminApp() {
  const [tab, setTab] = useState('overview');
  const [personId, setPersonId] = useState(null);
  const [theme, toggleTheme] = useTheme();
  const [account, refreshAccount] = useAccount();
  const { profile } = useProfile();

  const name = profile?.user?.name || account?.user?.name || account?.user?.email || 'Administrator';
  const avatar = profile?.avatar || null;

  const openPerson = (id) => {
    setPersonId(id);
    setTab('people');
  };

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand-pill">
          Chronexa
          <b className="brand-role">Admin</b>
        </span>

        <nav className="top-nav">
          {TABS.map(({ id, label }) => (
            <button key={id} className={tab === id ? 'top-tab active' : 'top-tab'} onClick={() => setTab(id)}>
              {label}
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

        <button
          className={tab === 'profile' ? 'avatar as-button active' : 'avatar as-button'}
          onClick={() => setTab('profile')}
          title="Your profile"
        >
          {avatar ? <img src={avatar} alt="" /> : initials(name)}
        </button>
      </header>

      <SessionBanner account={account} onSignedIn={refreshAccount} />

      <main className="content">
        {tab === 'overview' && <Overview account={account} onOpenPerson={openPerson} />}
        {tab === 'people' && <People selectedId={personId} onSelect={setPersonId} />}
        {tab === 'tasks' && <AdminTasks />}
        {tab === 'screens' && <Screens />}
        {tab === 'recordings' && <Recordings />}
        {tab === 'settings' && <Settings />}
        {tab === 'profile' && <Profile />}
      </main>
    </div>
  );
}
