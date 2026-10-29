import { useEffect, useState } from 'react';

import Home from './pages/Home.jsx';
import Tasks from './pages/Tasks.jsx';
import CheckIns from './pages/CheckIns.jsx';
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
  { id: 'tasks', label: 'My Tasks' },
  { id: 'checkins', label: 'Check-ins' },
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draftRoleId, setDraftRoleId] = useState('');
  const [draftMemberId, setDraftMemberId] = useState('');
  const { snapshot, error } = useTrackerState();
  const tasks = useTasks();
  const [theme, toggleTheme] = useTheme();
  const [attendance, setAttendance] = useState(null);
  const { profile } = useProfile();
  const isRealSuperAdmin = Boolean(account?.user?.isSuperAdmin || account?.user?.roleKeys?.includes('SUPER_ADMIN'));
  const preview = previewRoles.find(role => role.id === previewId) || null;
  const draftRole = previewRoles.find(role => role.id === draftRoleId) || null;
  const previewKeys = preview ? [String(preview.key).toUpperCase()] : [];
  const previewPerms = preview?.permissions || [];
  const previewPm = previewKeys.some(key => /^(CUSTOM_)?(ASSIGNED_)?PROJECT_MANAGER(?:_|$)/.test(key));
  const previewAdmin = preview && !previewPm && (previewKeys.some(key => ['ADMIN','ADMINISTRATOR'].includes(key)) || previewPerms.some(key => ['settings.manage','attendance.manage'].includes(key)));
  const canViewEmployees = preview ? Boolean(previewPm || previewAdmin) : Boolean(account?.user?.canViewEmployeeTracking || account?.user?.canManageTrackingPolicy);
  const canConfigure = preview ? Boolean(previewAdmin) : Boolean(account?.user?.canManageTrackingPolicy);

  useEffect(() => {
    let live = true;
    const refresh = () => window.api.attendance.today().then(data => { if (live) setAttendance(data); }).catch(() => {});
    refresh();
    const interval = setInterval(refresh, 60000);
    return () => { live = false; clearInterval(interval); };
  }, [account?.user?.id]);
  const checkIn = async () => { const data = await window.api.attendance.checkIn(); setAttendance(data); return data; };

  useEffect(() => {
    if (!isRealSuperAdmin) return;
    let live = true;
    window.api.admin.previewRoles().then(data => { if (live) setPreviewRoles(data.roles || []); }).catch(error => { if (live) setPreviewError(error.message || 'Roles unavailable'); });
    return () => { live = false; };
  }, [isRealSuperAdmin]);

  useEffect(() => {
    if (canConfigure) window.api.configuration.get().catch(() => {});
  }, [canConfigure]);

  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = event => { if (event.key === 'Escape') setPreviewOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [previewOpen]);

  function openPreview() {
    if (!isRealSuperAdmin) return;
    setDraftRoleId(previewId);
    setDraftMemberId(previewMemberId);
    setPreviewError('');
    setPreviewOpen(true);
    window.api.admin.previewRoles().then(data => setPreviewRoles(data.roles || [])).catch(error => setPreviewError(error.message || 'Roles unavailable'));
  }

  function enterPreview() {
    if (!isRealSuperAdmin || !draftRole?.members?.some(member => member.id === draftMemberId)) return;
    setPreviewId(draftRoleId);
    setPreviewMemberId(draftMemberId);
    setPreviewOpen(false);
    setTab('tracker');
  }

  function exitPreview() {
    setPreviewId('');
    setPreviewMemberId('');
    setPreviewOpen(false);
    setTab('configuration');
  }

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
  const tabs = [...TABS, ...(canViewEmployees ? [{ id: 'employees', label: 'Employees' }] : []), ...(canConfigure ? [{ id: 'configuration', label: 'Admin' }] : [])];

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand-pill">Chronexa</span>

        <nav className="top-nav">
          {tabs.map(({ id, label }) => (
            <button key={id} className={tab === id ? 'top-tab active' : 'top-tab'} onClick={() => setTab(id)}>
              {label}
              {id === 'tasks' && tasks.open.length > 0 && <span className="nav-badge">{tasks.open.length}</span>}
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
      <main className="content">
        {preview && tab !== 'employees' && <p className="role-preview-note">Preview mode is read only. Your own tracking and settings are shown where a role has personal pages.</p>}
        <div style={preview && tab !== 'employees' ? { pointerEvents: 'none' } : undefined}>
          {tab === 'tracker' && <Home snapshot={snapshot} tasks={tasks} account={account} profile={profile} attendance={attendance} onCheckIn={checkIn} onOpenCheckIns={() => setTab('checkins')} onOpenTasks={() => setTab('tasks')} />}
          {tab === 'tasks' && <Tasks tasks={tasks} snapshot={snapshot} account={account} attendance={attendance} />}
          {tab === 'checkins' && <CheckIns attendance={attendance} onCheckIn={checkIn} />}
          {tab === 'activity' && <Activity snapshot={snapshot} />}
          {tab === 'employees' && canViewEmployees && <Employees key={`${previewId}:${previewMemberId}`} previewUserIds={previewPm ? [...new Set([...(preview.trackingConfigured ? preview.trackingUserIds : []), previewMemberId].filter(Boolean))] : null} />}
          {tab === 'configuration' && canConfigure && <Policy onViewAs={isRealSuperAdmin && !preview ? openPreview : undefined} />}
          {tab === 'profile' && <Profile />}
          {tab === 'settings' && <Preferences />}
        </div>
      </main>
      {isRealSuperAdmin && preview && <aside className="role-preview-dock" aria-label="Role preview controls"><div><strong>Viewing {preview.name}</strong><span>{preview.members?.find(member => member.id === previewMemberId)?.name || 'Member'} · Read only</span></div><button className="btn" onClick={openPreview}>Change role</button><button className="btn primary" onClick={exitPreview}>Exit</button></aside>}
      {isRealSuperAdmin && previewOpen && <div className="role-preview-scrim" onMouseDown={event => { if (event.target === event.currentTarget) setPreviewOpen(false); }}><section className="role-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="role-preview-title"><header><div><h2 id="role-preview-title">View as role</h2><p>See Chronexa from a member's perspective.</p></div><button className="btn" aria-label="Close" onClick={() => setPreviewOpen(false)}>×</button></header><label>Role<select autoFocus value={draftRoleId} onChange={event => { const id = event.target.value; setDraftRoleId(id); setDraftMemberId(previewRoles.find(role => role.id === id)?.members?.[0]?.id || ''); }}><option value="">Choose role</option>{previewRoles.map(role => <option key={role.id} value={role.id} disabled={!role.members?.length}>{role.name}{role.members?.length ? '' : ' (no active members)'}</option>)}</select></label><label>Member<select value={draftMemberId} disabled={!draftRole} onChange={event => setDraftMemberId(event.target.value)}><option value="">Choose member</option>{(draftRole?.members || []).map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><p className="role-preview-explainer">Read only preview. You stay signed in as Super Admin.</p>{previewError && <p className="form-error" role="alert">{previewError}</p>}<footer><button className="btn" onClick={() => setPreviewOpen(false)}>Cancel</button><button className="btn primary" disabled={!draftMemberId} onClick={enterPreview}>Start preview</button></footer></section></div>}
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
