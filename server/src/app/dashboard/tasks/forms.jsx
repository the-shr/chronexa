'use client';

import { useActionState, useState } from 'react';

import { createTask, editTask } from './actions.js';
import { PRIORITIES } from '@/lib/task-rules.js';

export function AssignForm({ employees, defaultUserId }) {
  const [state, action, pending] = useActionState(createTask, {});
  const [open, setOpen] = useState(false);

  if (!employees.length) {
    return <p className="empty">Add an employee first — there is nobody to assign work to.</p>;
  }

  return (
    <form action={action} className="assign-form">
      <div className="assign-row">
        <input className="input" name="title" placeholder="What needs doing?" required maxLength={200} />
        <select className="input" name="userId" defaultValue={defaultUserId || employees[0].id}>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <select className="input" name="priority" defaultValue="normal">
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)} priority
            </option>
          ))}
        </select>
        <button className="btn primary" disabled={pending}>
          {pending ? 'Assigning…' : 'Assign'}
        </button>
      </div>

      <button type="button" className="link-btn" onClick={() => setOpen(!open)}>
        {open ? 'Fewer details' : 'Add a due date, estimate or notes'}
      </button>

      {open && (
        <div className="assign-row">
          <input className="input" name="dueAt" type="date" aria-label="Due date" />
          <input className="input" name="estimateMinutes" type="number" min="5" step="5" placeholder="Estimate (minutes)" />
          <input className="input wide" name="description" placeholder="Notes for the employee" maxLength={1000} />
        </div>
      )}

      {state.error && <p className="error">{state.error}</p>}
      {state.success && <p className="success">{state.success}</p>}
    </form>
  );
}

/** Inline editing, so changing a due date does not need a separate page. */
export function EditTaskForm({ task }) {
  const [state, action, pending] = useActionState(editTask, {});
  const mine = state.id === task.id;

  return (
    <details className="edit">
      <summary>Edit</summary>
      <form action={action} className="edit-form">
        <input type="hidden" name="id" value={task.id} />
        <input className="input" name="title" defaultValue={task.title} maxLength={200} required />
        <input
          className="input"
          name="dueAt"
          type="date"
          defaultValue={task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : ''}
        />
        <input
          className="input"
          name="estimateMinutes"
          type="number"
          min="5"
          step="5"
          placeholder="Estimate"
          defaultValue={task.estimateMinutes ?? ''}
        />
        <select className="input" name="priority" defaultValue={task.priority}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
        <input className="input wide" name="description" defaultValue={task.description} placeholder="Notes" maxLength={1000} />
        <button className="btn" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </form>
      {mine && state.error && <p className="error">{state.error}</p>}
      {mine && state.success && <p className="success">{state.success}</p>}
    </details>
  );
}
