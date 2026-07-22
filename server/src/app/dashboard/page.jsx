import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db.js';
import { currentAdmin, destroyAdminSession } from '@/lib/auth.js';
import { humanDuration, clockTime, startOfDay } from '@/lib/format.js';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const admin = await currentAdmin();
  if (!admin) redirect('/login');

  const today = startOfDay();
  const weekAgo = startOfDay(-6);

  const employees = await prisma.user.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    include: {
      devices: { orderBy: { lastSeenAt: 'desc' }, take: 1 },
      sessions: { where: { startedAt: { gte: weekAgo } }, orderBy: { startedAt: 'desc' } },
    },
  });

  const rows = employees.map((user) => {
    const todays = user.sessions.filter((s) => s.startedAt >= today);
    const live = user.sessions.find((s) => !s.endedAt);
    return {
      user,
      live,
      todaySeconds: todays.reduce((sum, s) => sum + s.activeSeconds, 0),
      todayIdle: todays.reduce((sum, s) => sum + s.idleSeconds, 0),
      weekSeconds: user.sessions.reduce((sum, s) => sum + s.activeSeconds, 0),
      lastSeen: user.devices[0]?.lastSeenAt || null,
      idleStops: user.sessions.filter((s) => s.stopReason === 'idle-timeout').length,
    };
  });

  const teamToday = rows.reduce((sum, r) => sum + r.todaySeconds, 0);
  const teamWeek = rows.reduce((sum, r) => sum + r.weekSeconds, 0);

  async function signOut() {
    'use server';
    await destroyAdminSession();
    redirect('/login');
  }

  return (
    <>
      <header className="topbar">
        <strong>Chronexa</strong>
        <span className="muted">Team overview</span>
        <span className="spacer" />
        <Link className="btn" href="/dashboard/employees">
          Employees
        </Link>
        <span className="muted">{admin.email}</span>
        <form action={signOut}>
          <button className="btn" type="submit">
            Sign out
          </button>
        </form>
      </header>

      <main className="wrap">
        <h1>Today</h1>
        <p className="muted">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>

        <div className="stat-row">
          <div className="stat">
            <span>Team tracked today</span>
            <strong className="mono">{humanDuration(teamToday)}</strong>
          </div>
          <div className="stat">
            <span>Tracking right now</span>
            <strong className="mono">{rows.filter((r) => r.live).length}</strong>
          </div>
          <div className="stat">
            <span>Last 7 days</span>
            <strong className="mono">{humanDuration(teamWeek)}</strong>
          </div>
          <div className="stat">
            <span>Employees</span>
            <strong className="mono">{rows.length}</strong>
          </div>
        </div>

        <h2>Employees</h2>
        <div className="panel">
          {!rows.length && (
            <p className="empty">
              No employees yet. <Link href="/dashboard/employees">Add one</Link> to get started.
            </p>
          )}
          {rows.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Today</th>
                  <th>Idle today</th>
                  <th>Last 7 days</th>
                  <th>Idle stops</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user.id}>
                    <td>
                      <Link href={`/dashboard/${r.user.id}`}>
                        <strong>{r.user.name}</strong>
                        <br />
                        <span className="muted">{r.user.email}</span>
                      </Link>
                    </td>
                    <td>
                      {r.live ? (
                        <span className="tag ok">Tracking</span>
                      ) : (
                        <span className="tag">Offline</span>
                      )}
                    </td>
                    <td className="mono">{humanDuration(r.todaySeconds)}</td>
                    <td className="mono muted">{humanDuration(r.todayIdle)}</td>
                    <td className="mono">{humanDuration(r.weekSeconds)}</td>
                    <td className="mono">
                      {r.idleStops ? <span className="tag warn">{r.idleStops}</span> : <span className="muted">0</span>}
                    </td>
                    <td className="mono muted">{r.lastSeen ? clockTime(r.lastSeen) : 'never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}
