import { useState } from 'react';

import { useTheme, useSettings } from '../lib/hooks.js';
import { IconSun, IconMoon } from '../components/Icons.jsx';

/**
 * The first screen on a fresh install. Sign-in used to be buried in Settings,
 * which was survivable for an employee whose machine IT had already set up, but
 * left an admin opening the app to an empty employee dashboard with no way in.
 *
 * One form for both roles: the server decides which, and the app follows.
 */
export default function SignIn({ onSignedIn }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [server, setServer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [theme, toggleTheme] = useTheme();
  const [settings] = useSettings();

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (server?.trim()) await window.api.settings.set({ sync: { serverUrl: server.trim() } });
      await window.api.account.login(form);
      onSignedIn?.();
    } catch (err) {
      // IPC wraps the message; the employee should read the reason, not the plumbing.
      setError(String(err.message).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="signin">
      <button
        className="round-btn signin-theme"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      >
        {theme === 'dark' ? <IconSun width={15} height={15} /> : <IconMoon width={15} height={15} />}
      </button>

      <form className="signin-card" onSubmit={submit}>
        <span className="brand-pill">Chronexa</span>
        <h1>Sign in</h1>
        <p className="muted">Use the account your organisation gave you.</p>

        <label className="signin-field">
          <span>Work email</span>
          <input
            className="text-input"
            type="email"
            required
            autoFocus
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>

        <label className="signin-field">
          <span>Password</span>
          <input
            className="text-input"
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>

        {server !== null && (
          <label className="signin-field">
            <span>Server address</span>
            <input className="text-input" value={server} onChange={(e) => setServer(e.target.value)} />
          </label>
        )}

        {error && <p className="form-error">{error}</p>}

        <button className="btn primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        {server === null && (
          <button type="button" className="link-btn" onClick={() => setServer(settings?.sync.serverUrl || '')}>
            Connect to a different server
          </button>
        )}
      </form>
    </div>
  );
}
