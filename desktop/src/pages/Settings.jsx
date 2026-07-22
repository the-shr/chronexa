import { useEffect, useState } from 'react';

import { useSettings, useTheme, useAccount } from '../lib/hooks.js';
import { clockTime, humanDuration } from '../lib/format.js';

/**
 * Only preferences that are genuinely the employee's own. Monitoring policy --
 * capture, idle thresholds, what counts as work -- is set by the organisation
 * and is not editable, or even visible, here.
 */
export default function Settings() {
  const [settings, update] = useSettings();
  const [theme, toggleTheme] = useTheme();
  const [account, refreshAccount] = useAccount();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sync, setSync] = useState(null);

  useEffect(() => {
    let alive = true;
    window.api.sync.status().then((s) => alive && setSync(s));
    const off = window.api.sync.onStatus(setSync);
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (!settings || !account) return null;

  const general = (key, value) => update({ general: { [key]: value } });

  const signIn = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await window.api.account.login(form);
      setForm({ email: '', password: '' });
      refreshAccount();
    } catch (err) {
      setError(err.message.replace(/^Error invoking remote method '[^']+':\s*/, ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="page-head">
        <div className="head-main">
          <h1>Settings</h1>
          <p>Your preferences on this computer</p>
        </div>
      </header>

      <div className="page-body" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
        <section className="card">
          <h2>Account</h2>
          {account.signedIn ? (
            <>
              <div className="row">
                <div className="row-main">
                  <strong>{account.user?.name || account.user?.email}</strong>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {account.user?.email}
                  </div>
                </div>
                <button
                  className="btn sm"
                  onClick={async () => {
                    await window.api.account.logout();
                    refreshAccount();
                  }}
                >
                  Sign out
                </button>
              </div>
              <div className="row">
                <div className="row-main">
                  <span className="muted">This computer</span>
                </div>
                <span className="faint">{account.deviceName}</span>
              </div>
              <div className="row">
                <div className="row-main">
                  <span className="muted">Last synced</span>
                </div>
                <span className="faint">
                  {sync?.at ? clockTime(sync.at) : 'never'}
                  {sync?.pending ? ` · ${sync.pending} waiting` : ''}
                </span>
              </div>
            </>
          ) : (
            <form className="signin" onSubmit={signIn}>
              <p className="muted" style={{ margin: 0 }}>
                Sign in with your work account to receive tasks and report your hours.
              </p>
              <input
                className="text-input"
                type="email"
                required
                placeholder="Work email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <input
                className="text-input"
                type="password"
                required
                placeholder="Password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button className="btn primary" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              {error && <p className="error">{error}</p>}
            </form>
          )}
        </section>

        <section className="card">
          <h2>Preferences</h2>

          <label className="field">
            <span className="field-text">
              Light theme
              <small>Switch between the light and dark look.</small>
            </span>
            <input type="checkbox" checked={theme === 'light'} onChange={toggleTheme} />
            <span className="switch" aria-hidden="true" />
          </label>

          <label className="field">
            <span className="field-text">
              Open Chronexa when I log in
              <small>Starts minimised to the tray.</small>
            </span>
            <input
              type="checkbox"
              checked={settings.general.launchOnLogin}
              onChange={(e) => general('launchOnLogin', e.target.checked)}
            />
            <span className="switch" aria-hidden="true" />
          </label>

          <label className="field">
            <span className="field-text">
              Start tracking automatically
              <small>Begins a session as soon as the app opens.</small>
            </span>
            <input
              type="checkbox"
              checked={settings.general.startTrackingOnLaunch}
              onChange={(e) => general('startTrackingOnLaunch', e.target.checked)}
            />
            <span className="switch" aria-hidden="true" />
          </label>

          <label className="field">
            <span className="field-text">
              Keep running in the tray
              <small>Closing the window keeps the timer going.</small>
            </span>
            <input
              type="checkbox"
              checked={settings.general.minimizeToTray}
              onChange={(e) => general('minimizeToTray', e.target.checked)}
            />
            <span className="switch" aria-hidden="true" />
          </label>
        </section>

        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>
            How your time is measured
            <span className="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>
              set by your organisation
            </span>
          </h2>
          <div className="rows">
            <div className="row">
              <div className="row-main">
                <span className="muted">Daily target</span>
              </div>
              <span>
                {settings.work?.dailyTargetHours
                  ? `${settings.work.dailyTargetHours} hours a day, ${settings.work.weeklyTargetHours} a week`
                  : 'No target set'}
              </span>
            </div>
            <div className="row">
              <div className="row-main">
                <span className="muted">Marked idle after</span>
              </div>
              <span>{humanDuration(settings.idle.thresholdMinutes * 60)} without mouse or keyboard</span>
            </div>
            <div className="row">
              <div className="row-main">
                <span className="muted">While idle</span>
              </div>
              <span>The timer pauses and resumes on its own when you come back</span>
            </div>
            <div className="row">
              <div className="row-main">
                <span className="muted">Idle time</span>
              </div>
              <span>{settings.idle.countIdleAsWork ? 'Counts towards your hours' : 'Recorded, but not counted as work'}</span>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
