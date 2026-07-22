import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { prisma } from '@/lib/db.js';
import { currentAdmin } from '@/lib/auth.js';
import { humanDuration, clockTime, dateLabel, startOfDay, STOP_REASONS } from '@/lib/format.js';

export const dynamic = 'force-dynamic';

export default async function EmployeePage({ params }) {
  const admin = await currentAdmin();
  if (!admin) redirect('/login');

  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { devices: { orderBy: { lastSeenAt: 'desc' } } },
  });
  if (!user) notFound();

  const since = startOfDay(-13);
  const [sessions, screenshots] = await Promise.all([
    prisma.workSession.findMany({
      where: { userId, startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.screenshot.findMany({
      where: { userId },
      orderBy: { capturedAt: 'desc' },
      take: 48,
    }),
  ]);

  const byDay = new Map();
  for (const s of sessions) {
    const key = new Date(s.startedAt).toDateString();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(s);
  }

  const totalActive = sessions.reduce((sum, s) => sum + s.activeSeconds, 0);
  const totalIdle = sessions.reduce((sum, s) => sum + s.idleSeconds, 0);
  const idleStops = sessions.filter((s) => s.stopReason === 'idle-timeout').length;

  return (
    <>
      <header className="topbar">
        <Link href="/dashboard">
          <strong>TimeTracker</strong>
        </Link>
        <span className="muted">/ {user.name}</span>
        <span className="spacer" />
        <Link className="btn" href="/dashboard">
          Back
        </Link>
      </header>

      <main className="wrap">
        <h1>{user.name}</h1>
        <p className="muted">
          {user.email} ·{' '}
          {user.devices.length
            ? user.devices.map((d) => `${d.name} (${d.platform})`).join(', ')
            : 'no device has signed in yet'}
        </p>

        <div className="stat-row">
          <div className="stat">
            <span>Tracked (14 days)</span>
            <strong className="mono">{humanDuration(totalActive)}</strong>
          </div>
          <div className="stat">
            <span>Idle discarded</span>
            <strong className="mono">{humanDuration(totalIdle)}</strong>
          </div>
          <div className="stat">
            <span>Auto-stopped on idle</span>
            <strong className="mono">{idleStops}</strong>
          </div>
          <div className="stat">
            <span>Screenshots stored</span>
            <strong className="mono">{screenshots.length}</strong>
          </div>
        </div>

        <h2>Sessions</h2>
        {!sessions.length && <p className="empty">No sessions in the last 14 days.</p>}
        {[...byDay.entries()].map(([day, rows]) => (
          <div className="panel" key={day} style={{ marginBottom: 12 }}>
            <h2 style={{ margin: '0 0 10px' }}>
              {dateLabel(rows[0].startedAt)} —{' '}
              {humanDuration(rows.reduce((sum, r) => sum + r.activeSeconds, 0))}
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Start</th>
                  <th>End</th>
                  <th>Active</th>
                  <th>Idle</th>
                  <th>Shots</th>
                  <th>Note</th>
                  <th>Ended by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="mono">{clockTime(s.startedAt)}</td>
                    <td className="mono">{s.endedAt ? clockTime(s.endedAt) : 'running'}</td>
                    <td className="mono">{humanDuration(s.activeSeconds)}</td>
                    <td className="mono muted">{humanDuration(s.idleSeconds)}</td>
                    <td className="mono muted">{s.screenshotCount}</td>
                    <td>{s.taskNote || <span className="muted">—</span>}</td>
                    <td>
                      <span className={`tag ${s.stopReason === 'idle-timeout' ? 'warn' : ''}`}>
                        {STOP_REASONS[s.stopReason] || (s.endedAt ? s.stopReason : 'In progress')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <h2>Recent screenshots</h2>
        {!screenshots.length && <p className="empty">No screenshots uploaded yet.</p>}
        <div className="shot-grid">
          {screenshots.map((shot) => (
            <figure className="shot" key={shot.id} style={{ margin: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/image/${shot.id}`} alt={`Screen at ${clockTime(shot.capturedAt)}`} loading="lazy" />
              <figcaption>
                <strong className="mono">{clockTime(shot.capturedAt)}</strong> · {dateLabel(shot.capturedAt)}
                {shot.activityPercent !== null && (
                  <>
                    <div className="bar">
                      <i style={{ width: `${shot.activityPercent}%` }} />
                    </div>
                    {shot.activityPercent}% active
                  </>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </main>
    </>
  );
}
