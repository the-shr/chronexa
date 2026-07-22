import { useEffect, useState } from 'react';

import { useSettings, useSyncStatus } from '../lib/hooks.js';

export default function Account() {
  const [settings, update] = useSettings();
  const [status, setStatus] = useSyncStatus();
  const [account, setAccount] = useState(null);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => window.api.account.get().then(setAccount);
  useEffect(refresh, []);

  if (!settings || !account) return <div className="page">Loading…</div>;

  const signIn = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await window.api.account.login(form);
      setForm({ email: '', password: '' });
      refresh();
    } catch (err) {
      setError(err.message.replace(/^Error invoking remote method '[^']+':\s*/, ''));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await window.api.account.logout();
    refresh();
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Account &amp; sync</h1>
      </header>

      <section className="panel">
        <h2>Server</h2>
        <label className="field">
          <div className="field-text">
            Server URL
            <small>Where this device reports time and screenshots.</small>
          </div>
          <input
            className="text-input"
            value={settings.sync.serverUrl}
            placeholder="https://tracker.yourcompany.com"
            onChange={(e) => update({ sync: { serverUrl: e.target.value } })}
          />
        </label>

        <label className="field toggle">
          <span className="field-text">Sync to server</span>
          <input
            type="checkbox"
            checked={settings.sync.enabled}
            onChange={(e) => update({ sync: { enabled: e.target.checked } })}
          />
          <span className="switch" aria-hidden="true" />
        </label>

        <label className="field toggle">
          <span className="field-text">
            Upload screenshot images
            <small>Turn off to send time data only.</small>
          </span>
          <input
            type="checkbox"
            checked={settings.sync.uploadScreenshots}
            disabled={!settings.sync.enabled}
            onChange={(e) => update({ sync: { uploadScreenshots: e.target.checked } })}
          />
          <span className="switch" aria-hidden="true" />
        </label>
      </section>

      <section className="panel">
        <h2>Signed in</h2>
        {account.signedIn ? (
          <div className="account-row">
            <div>
              <strong>{account.user?.name || account.user?.email}</strong>
              <small className="muted">
                {account.user?.email} · device {account.deviceName}
              </small>
            </div>
            <button className="btn" onClick={signOut}>
              Sign out
            </button>
          </div>
        ) : (
          <form className="signin" onSubmit={signIn}>
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

      <section className="panel">
        <h2>
          Sync status
          <button className="btn ghost" onClick={() => window.api.sync.now().then(setStatus)}>
            Sync now
          </button>
        </h2>
        <ul className="rules">
          <li>
            <span>Pending items</span>
            <strong>{status?.pending ?? 0}</strong>
          </li>
          <li>
            <span>Last attempt</span>
            <strong>{status?.at ? new Date(status.at).toLocaleTimeString() : 'never'}</strong>
          </li>
          <li>
            <span>Result</span>
            <strong className={status?.ok === false ? 'error-text' : ''}>
              {status?.ok === null || status?.ok === undefined ? '—' : status.ok ? 'OK' : status.error}
            </strong>
          </li>
        </ul>
        <p className="muted small">
          Time data is always saved locally first. If the server is unreachable, items stay queued and upload
          automatically once the connection is back.
        </p>
      </section>
    </div>
  );
}
