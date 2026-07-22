import { useState } from 'react';

import { IconClock } from './Icons.jsx';

/**
 * Shown when the server has stopped accepting this device's token -- someone
 * signed in from this machine again, an admin revoked it, or the password was
 * changed elsewhere.
 *
 * Signing in happens inline rather than sending the employee to Settings: the
 * tracker keeps running through all of this, and the point is to get syncing
 * again in as few steps as possible.
 */
export default function SessionBanner({ account, onSignedIn }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: account?.user?.email || '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!account?.sessionExpired) return null;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await window.api.account.login(form);
      setOpen(false);
      setForm((f) => ({ ...f, password: '' }));
      onSignedIn?.();
    } catch (err) {
      setError(String(err.message).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="session-banner">
      <span className="session-icon">
        <IconClock width={15} height={15} />
      </span>

      <div className="session-text">
        <strong>You have been signed out</strong>
        <small>
          Your hours are still being recorded on this computer and will upload once you sign in again.
        </small>
      </div>

      {open ? (
        <form className="session-form" onSubmit={submit}>
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
            autoFocus
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <button className="btn primary sm" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <button type="button" className="btn ghost sm" onClick={() => setOpen(false)} disabled={busy}>
            Later
          </button>
        </form>
      ) : (
        <button className="btn primary sm" onClick={() => setOpen(true)}>
          Sign in again
        </button>
      )}

      {error && <span className="session-error">{error}</span>}
    </div>
  );
}
