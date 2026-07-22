import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db.js';
import { currentAdmin } from '@/lib/auth.js';
import { clockTime, dateLabel } from '@/lib/format.js';
import { CreateEmployeeForm, ResetPasswordForm } from './forms.jsx';
import { setActive, revokeDevices, setRole } from './actions.js';

export const dynamic = 'force-dynamic';

export default async function EmployeesPage() {
  const admin = await currentAdmin();
  if (!admin) redirect('/login');

  const users = await prisma.user.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include: {
      devices: { orderBy: { lastSeenAt: 'desc' } },
      _count: { select: { sessions: true } },
    },
  });

  const activeAdmins = users.filter((u) => u.active && u.role === 'admin').length;

  return (
    <>
      <header className="topbar">
        <Link href="/dashboard">
          <strong>Chronexa</strong>
        </Link>
        <span className="muted">/ Employees</span>
        <span className="spacer" />
        <Link className="btn" href="/dashboard">
          Team overview
        </Link>
      </header>

      <main className="wrap">
        <h1>Employees</h1>
        <p className="muted">
          Accounts created here can sign in from the desktop agent straight away. Deactivating an account also
          revokes every device token it holds.
        </p>

        <h2>Add an employee</h2>
        <div className="panel">
          <CreateEmployeeForm />
        </div>

        <h2>All accounts</h2>
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Devices</th>
                <th>Sessions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const protectedAdmin = user.active && user.role === 'admin' && activeAdmins === 1;
                const isSelf = user.id === admin.id;
                return (
                  <tr key={user.id} className={user.active ? '' : 'inactive'}>
                    <td>
                      <Link href={`/dashboard/${user.id}`}>
                        <strong>{user.name}</strong>
                      </Link>
                      <br />
                      <span className="muted">{user.email}</span>
                      <br />
                      <span className="muted small">joined {dateLabel(user.createdAt)}</span>
                    </td>

                    <td>
                      <form action={setRole}>
                        <input type="hidden" name="userId" value={user.id} />
                        <select
                          className="input compact"
                          name="role"
                          defaultValue={user.role}
                          disabled={protectedAdmin || isSelf}
                        >
                          <option value="employee">Employee</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button className="btn tiny" disabled={protectedAdmin || isSelf}>
                          Save
                        </button>
                      </form>
                    </td>

                    <td>
                      {user.active ? <span className="tag ok">Active</span> : <span className="tag">Disabled</span>}
                      {isSelf && <div className="muted small">that&apos;s you</div>}
                    </td>

                    <td>
                      {user.devices.length ? (
                        <>
                          {user.devices.map((d) => (
                            <div key={d.id} className="small">
                              {d.name} <span className="muted">({d.platform})</span>
                              <br />
                              <span className="muted">
                                last seen {d.lastSeenAt ? clockTime(d.lastSeenAt) : 'never'}
                              </span>
                            </div>
                          ))}
                          <form action={revokeDevices}>
                            <input type="hidden" name="userId" value={user.id} />
                            <button className="btn tiny">Revoke</button>
                          </form>
                        </>
                      ) : (
                        <span className="muted">none</span>
                      )}
                    </td>

                    <td className="mono">{user._count.sessions}</td>

                    <td>
                      <div className="actions">
                        <form action={setActive}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="active" value={String(!user.active)} />
                          <button className="btn tiny" disabled={user.active && (isSelf || protectedAdmin)}>
                            {user.active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </form>
                        <ResetPasswordForm userId={user.id} />
                      </div>
                      {protectedAdmin && <div className="muted small">last admin — protected</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
