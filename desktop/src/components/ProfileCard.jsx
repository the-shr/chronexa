import { humanDuration } from '../lib/format.js';

/** Mirrors the reference's profile tile: who you are and today's headline. */
export default function ProfileCard({ account, snapshot }) {
  const name = account?.user?.name || account?.user?.email || 'Not signed in';
  const email = account?.user?.email || 'Sign in from Settings';

  return (
    <section className="card profile-card">
      <div className="profile-photo">{initials(name)}</div>
      <div className="profile-foot">
        <div className="profile-id">
          <strong className="truncate">{name}</strong>
          <small className="truncate">{email}</small>
        </div>
        <span className="profile-badge mono">{humanDuration(snapshot.today.workSeconds)}</span>
      </div>
    </section>
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
