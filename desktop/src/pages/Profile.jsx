import { useEffect, useState } from 'react';

import { useProfile } from '../lib/hooks.js';
import { clockTime } from '../lib/format.js';
import { IconUser, IconTrash } from '../components/Icons.jsx';

export default function Profile() {
  const { profile, update, changePassword, pickAvatar, removeAvatar } = useProfile();
  const [details, setDetails] = useState(null);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const user = profile?.user;

  // Seed the form once the profile arrives, then leave the employee's edits be.
  useEffect(() => {
    if (user && !details) setDetails({ name: user.name || '', email: user.email || '', currentPassword: '' });
  }, [user, details]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  if (!profile || !details) return null;

  const run = async (fn, success) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await fn();
      setNotice({ kind: 'ok', text: typeof success === 'function' ? success(result) : success });
      return result;
    } catch (err) {
      setNotice({ kind: 'error', text: clean(err.message) });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const emailChanged = details.email.trim().toLowerCase() !== (user?.email || '').toLowerCase();
  const nameChanged = details.name.trim() !== (user?.name || '');
  const canSaveDetails = (nameChanged || emailChanged) && (!emailChanged || details.currentPassword.length > 0);

  const saveDetails = (e) => {
    e.preventDefault();
    run(
      () => update({ name: details.name.trim(), email: details.email.trim(), currentPassword: details.currentPassword }),
      'Saved.',
    ).then((r) => r && setDetails((d) => ({ ...d, currentPassword: '' })));
  };

  const savePassword = (e) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirm) {
      setNotice({ kind: 'error', text: 'The two new passwords do not match.' });
      return;
    }
    run(
      () => changePassword({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword }),
      (r) =>
        r?.otherDevicesSignedOut
          ? `Password changed. ${r.otherDevicesSignedOut} other device(s) signed out.`
          : 'Password changed.',
    ).then((r) => r && setPasswords({ currentPassword: '', newPassword: '', confirm: '' }));
  };

  return (
    <>
      <header className="page-head">
        <div className="head-main">
          <h1>Your profile</h1>
          <p>
            {profile.signedIn ? `Signed in on ${profile.deviceName}` : 'Not signed in'}
            {profile.fetchedAt && ` · updated ${clockTime(profile.fetchedAt)}`}
          </p>
        </div>
        {notice && <span className={notice.kind === 'ok' ? 'notice ok' : 'notice error'}>{notice.text}</span>}
        <button className="btn danger" disabled={busy} onClick={() => run(async () => {
          await window.api.account.logout();
          window.location.reload();
        })}>Log out</button>
      </header>

      <div className="page-body" style={{ gridTemplateColumns: '236px minmax(0, 1fr) minmax(0, 1fr)' }}>
        <section className="card avatar-card">
          <div className="avatar-large">
            {profile.avatar ? <img src={profile.avatar} alt="" /> : <span>{initials(user?.name || user?.email)}</span>}
          </div>
          <strong className="truncate">{user?.name || '—'}</strong>
          <small className="truncate">{user?.email || ''}</small>
          <div className="avatar-actions">
            <button className="btn sm" disabled={busy} onClick={() => run(pickAvatar, 'Picture updated.')}>
              <IconUser width={14} height={14} />
              {profile.avatar ? 'Change' : 'Upload'}
            </button>
            {profile.avatar && (
              <button className="btn sm danger" disabled={busy} onClick={() => run(removeAvatar, 'Picture removed.')}>
                <IconTrash width={13} height={13} />
              </button>
            )}
          </div>
          <p className="faint small">JPEG, PNG or WebP, up to 3 MB.</p>
        </section>

        <section className="card">
          <h2>Details</h2>
          <form className="form" onSubmit={saveDetails}>
            <label className="form-row">
              <span>Name</span>
              <input
                className="text-input"
                value={details.name}
                maxLength={120}
                onChange={(e) => setDetails({ ...details, name: e.target.value })}
              />
            </label>

            <label className="form-row">
              <span>Email</span>
              <input
                className="text-input"
                type="email"
                value={details.email}
                onChange={(e) => setDetails({ ...details, email: e.target.value })}
              />
            </label>

            {emailChanged && (
              <label className="form-row">
                <span>Current password</span>
                <input
                  className="text-input"
                  type="password"
                  value={details.currentPassword}
                  placeholder="Needed to change your email"
                  onChange={(e) => setDetails({ ...details, currentPassword: e.target.value })}
                />
              </label>
            )}

            <button className="btn primary" disabled={busy || !canSaveDetails}>
              Save changes
            </button>
          </form>
        </section>

        <section className="card">
          <h2>Password</h2>
          <form className="form" onSubmit={savePassword}>
            <label className="form-row">
              <span>Current password</span>
              <input
                className="text-input"
                type="password"
                value={passwords.currentPassword}
                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
              />
            </label>
            <label className="form-row">
              <span>New password</span>
              <input
                className="text-input"
                type="password"
                value={passwords.newPassword}
                placeholder="10+ characters, letters and numbers"
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
              />
            </label>
            <label className="form-row">
              <span>Repeat new password</span>
              <input
                className="text-input"
                type="password"
                value={passwords.confirm}
                onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
              />
            </label>
            <button
              className="btn primary"
              disabled={busy || !passwords.currentPassword || passwords.newPassword.length < 10}
            >
              Change password
            </button>
            <p className="faint small">Your other devices will be signed out.</p>
          </form>
        </section>
      </div>
    </>
  );
}

/** IPC wraps thrown errors; show the message the server actually sent. */
function clean(message) {
  return String(message).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '');
}

function initials(name) {
  return String(name || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}
