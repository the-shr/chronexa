'use client';

import { useActionState } from 'react';

import { createEmployee, resetPassword } from './actions.js';
import { MIN_PASSWORD_LENGTH } from '@/lib/user-rules.js';

export function CreateEmployeeForm() {
  const [state, action, pending] = useActionState(createEmployee, {});

  return (
    <form action={action} className="new-employee">
      <div className="new-employee-fields">
        <input className="input" name="name" placeholder="Full name" required />
        <input className="input" name="email" type="email" placeholder="Work email" required />
        <select className="input" name="role" defaultValue="employee">
          <option value="employee">Employee</option>
          <option value="admin">Administrator</option>
        </select>
        <input
          className="input"
          name="password"
          type="password"
          placeholder={`Temporary password (${MIN_PASSWORD_LENGTH}+ chars)`}
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        <button className="btn primary" disabled={pending}>
          {pending ? 'Adding…' : 'Add employee'}
        </button>
      </div>
      {state.error && <p className="error">{state.error}</p>}
      {state.success && <p className="success">{state.success}</p>}
    </form>
  );
}

export function ResetPasswordForm({ userId }) {
  const [state, action, pending] = useActionState(resetPassword, {});
  const mine = state.userId === userId;

  return (
    <details className="reset">
      <summary>Reset password</summary>
      <form action={action} className="reset-form">
        <input type="hidden" name="userId" value={userId} />
        <input
          className="input"
          name="password"
          type="password"
          placeholder="New password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        <button className="btn" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </form>
      {mine && state.error && <p className="error">{state.error}</p>}
      {mine && state.success && <p className="success">{state.success}</p>}
    </details>
  );
}
