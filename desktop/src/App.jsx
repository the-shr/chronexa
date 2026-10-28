import { useEffect, useState } from 'react';

import Home from './pages/Home.jsx';
import Activity from './pages/Activity.jsx';
import Profile from './pages/Profile.jsx';
import Preferences from './pages/Preferences.jsx';
import SignIn from './pages/SignIn.jsx';
import Policy from './pages/admin/Policy.jsx';
import Employees from './pages/admin/Employees.jsx';
import { useTrackerState, useTasks, useTheme, useAccount, useProfile, useReleasePolicy } from './lib/hooks.js';
import RequiredUpdate from './components/RequiredUpdate.jsx';
import SessionBanner from './components/SessionBanner.jsx';
import UpdateBanner from './components/UpdateBanner.jsx';
import { IconSun, IconMoon } from './components/Icons.jsx';

const TABS = [
  { id: 'tracker', label: 'Tracker' },
  { id: 'activity', label: 'My Activity' },
  { id: 'settings', label: 'Settings' },
];

export default function App() {
  const policy = useReleasePolicy();
  const [account, refreshAccount] = useAccount();
  if (!account) return <div className="fallback"><div className="fallback-card"><p>Starting…</p></div></div>;
  if (!account.signedIn) return <SignIn onSignedIn={refreshAccount} />;
  if (policy.blocked) return <RequiredUpdate policy={policy} />;
  return <Application update={policy.manifest} account={account} refreshAccount={refreshAccount} />;
}

function Application({ update, account, refreshAccount }) {
  const [tab, setTab] = useState('tracker');
  const [previewRoles, setPreviewRoles] = useState([]);
  const [previewId, setPreviewId] = useState('');
  const [previewMemberId, setPreviewMemberId] = useState('');
  const [previewError, setPreviewError] = useState('');
  const { snapshot, error } = useTrackerState();
  const tasks = useTasks();
  const [theme, toggleTheme] = useTheme();
  const { profile } = useProfile();
  const isRealSuperAdmin = Boolean(account?.user?.isSuperAdmin || account?.user?.roleKeys?.includes('SUPER_ADMIN'));
  const preview = previewRoles.find(role => role.id === previewId) || null;
  const previewKeys = preview ? [String(preview.key).toUpperCase()] : [];
  const previewPerms = preview?.permissions || [];
  const previewPm = previewKeys.some(key => /^(CUSTOM_)?(ASSIGNED_)?PROJECT_MANAGER(?:_|$)/.test(key));
  const previewAdmin = preview && !previewPm && (previewKeys.some(key => ['ADMIN','ADMINISTRATOR'].includes(key)) || previewPerms.some(key => ['settings.manage','attendance.manage'].includes(key)));
  const canViewEmployees = preview ? Boolean(previewPm || previewAdmin) : Boolean(account?.user?.canViewEmployeeTracking || account?.user?.canManageTrackingPolicy);
  const canConfigure = preview ? Boolean(previewAdmin) : Boolean(account?.user?.canManageTrackingPolicy);

  useEffect(() => {
    if (!isRealSuperAdmin) return;
    let live = true;
    window.api.admin.previewRoles().then(data => { if (live) setPreviewRoles(data.roles || []); }).catch(error => { if (live) setPreviewError(error.message || 'Roles unavailable'); });
    return () => { live = false; };
  }, [isRealSuperAdmin]);

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
  const tabs = [...TABS, ...(canViewEmployees ? [{ id: 'employees', label: 'Employees' }] : []), ...(canConfigure ? [{ id: 'configuration', label: 'Configuration' }] : [])];

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

        <button
          className={tab === 'profile' ? 'avatar as-button active' : 'avatar as-button'}
          onClick={() => setTab('profile')}
          title="Your profile"
        >
          {avatar ? <img src={avatar} alt="" /> : initials(name)}
        </button>
      </header>

      <UpdateBanner update={update} />
      <SessionBanner account={account} onSignedIn={refreshAccount} />
      {isRealSuperAdmin && <div className="role-preview-bar">
        <label htmlFor="role-preview-select">View as role</label>
        <select id="role-preview-select" value={previewId} onChange={event => { const id = event.target.value; setPreviewId(id); setPreviewMemberId(previewRoles.find(role => role.id === id)?.members?.[0]?.id || ''); setTab('tracker'); }}>
          <option value="">My view</option>
          {previewRoles.map(role => <option key={role.id} value={role.id} disabled={!role.members?.length}>{role.name}{role.members?.length ? '' : ' (no members)'}</option>)}
        </select>
        {preview && <select aria-label="Role member to preview" value={previewMemberId} onChange={event => setPreviewMemberId(event.target.value)}>
          {(preview.members || []).map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>}
        {preview && <span>Viewing as {preview.name} · Read only</span>}
        {previewError && <small>{previewError}</small>}
      </div>}

      <main className="content">
        {preview && tab !== 'employees' && <p className="role-preview-note">Preview mode is read only. Your own tracking and settings are shown where a role has personal pages.</p>}
        <div style={preview && tab !== 'employees' ? { pointerEvents: 'none' } : undefined}>
          {tab === 'tracker' && <Home snapshot={snapshot} tasks={tasks} account={account} profile={profile} />}
          {tab === 'activity' && <Activity snapshot={snapshot} />}
          {tab === 'employees' && canViewEmployees && <Employees key={`${previewId}:${previewMemberId}`} previewUserIds={previewPm ? [...new Set([...(preview.trackingConfigured ? preview.trackingUserIds : []), previewMemberId].filter(Boolean))] : null} />}
          {tab === 'configuration' && canConfigure && <Policy />}
          {tab === 'profile' && <Profile />}
          {tab === 'settings' && <Preferences />}
        </div>
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
