import Link from 'next/link';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db.js';
import { currentAdmin } from '@/lib/auth.js';
import { listTasks, taskCounts } from '@/lib/tasks.js';
import { dateLabel, humanDuration } from '@/lib/format.js';
import { AssignForm, EditTaskForm } from './forms.jsx';
import { setTaskStatus, moveTask, removeTask } from './actions.js';

export const dynamic = 'force-dynamic';

export default async function TasksPage({ searchParams }) {
  const admin = await currentAdmin();
  if (!admin) redirect('/login');

  const { who = '', show = 'open' } = await searchParams;

  const [employees, tasks, counts] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } }),
    listTasks({ userId: who || null, status: show === 'all' ? null : show }),
    taskCounts(),
  ]);

  const totalOpen = [...counts.values()].reduce((sum, c) => sum + (c.open || 0), 0);

  return (
    <>
      <header className="topbar">
        <Link href="/dashboard">
          <strong>Chronexa</strong>
        </Link>
        <span className="muted">/ Tasks</span>
        <span className="spacer" />
        <Link className="btn" href="/dashboard/employees">
          Employees
        </Link>
        <Link className="btn" href="/dashboard">
          Team overview
        </Link>
      </header>

      <main className="wrap">
        <h1>Tasks</h1>
        <p className="muted">
          {totalOpen} open across the team. Assigned work appears on the employee&apos;s dashboard within a couple of
          minutes, and sooner if they are online.
        </p>

        <h2>Assign work</h2>
        <div className="panel">
          <AssignForm employees={employees} defaultUserId={who || undefined} />
        </div>

        <h2>
          Assigned
          <span className="filters">
            <Filter label="Open" href={link(who, 'open')} active={show === 'open'} />
            <Filter label="Done" href={link(who, 'done')} active={show === 'done'} />
            <Filter label="All" href={link(who, 'all')} active={show === 'all'} />
            <span className="filter-sep" />
            <Filter label="Everyone" href={link('', show)} active={!who} />
            {employees.map((e) => (
              <Filter key={e.id} label={e.name.split(' ')[0]} href={link(e.id, show)} active={who === e.id} />
            ))}
          </span>
        </h2>

        <div className="panel">
          {tasks.length === 0 ? (
            <p className="empty">Nothing here yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Assigned to</th>
                  <th>Due</th>
                  <th>Estimate</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const overdue = task.dueAt && task.status === 'open' && new Date(task.dueAt) < startOfToday();
                  return (
                    <tr key={task.id} className={task.status === 'done' ? 'inactive' : ''}>
                      <td>
                        <strong>{task.title}</strong>
                        {task.priority === 'high' && <span className="tag warn"> High</span>}
                        {task.source === 'self' && <span className="tag"> added by them</span>}
                        {task.description && (
                          <>
                            <br />
                            <span className="muted small">{task.description}</span>
                          </>
                        )}
                        <EditTaskForm task={task} />
                      </td>

                      <td>
                        <form action={moveTask}>
                          <input type="hidden" name="id" value={task.id} />
                          <select className="input compact" name="userId" defaultValue={task.userId}>
                            {employees.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.name}
                              </option>
                            ))}
                          </select>
                          <button className="btn tiny">Move</button>
                        </form>
                      </td>

                      <td className={overdue ? 'overdue' : ''}>
                        {task.dueAt ? dateLabel(task.dueAt) : <span className="muted">—</span>}
                      </td>

                      <td className="mono muted">
                        {task.estimateMinutes ? humanDuration(task.estimateMinutes * 60) : '—'}
                      </td>

                      <td>
                        {task.status === 'done' ? (
                          <span className="tag ok">Done {task.completedAt ? dateLabel(task.completedAt) : ''}</span>
                        ) : (
                          <span className="tag">Open</span>
                        )}
                      </td>

                      <td>
                        <div className="actions">
                          <form action={setTaskStatus}>
                            <input type="hidden" name="id" value={task.id} />
                            <input type="hidden" name="status" value={task.status === 'done' ? 'open' : 'done'} />
                            <button className="btn tiny">{task.status === 'done' ? 'Reopen' : 'Mark done'}</button>
                          </form>
                          <form action={removeTask}>
                            <input type="hidden" name="id" value={task.id} />
                            <button className="btn tiny danger">Delete</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}

function Filter({ label, href, active }) {
  return (
    <Link className={active ? 'filter active' : 'filter'} href={href}>
      {label}
    </Link>
  );
}

function link(who, show) {
  const params = new URLSearchParams();
  if (who) params.set('who', who);
  if (show && show !== 'open') params.set('show', show);
  const query = params.toString();
  return `/dashboard/tasks${query ? `?${query}` : ''}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
