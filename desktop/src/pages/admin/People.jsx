import { useState } from 'react';

import { useRoster, useEmployee } from '../../lib/admin-hooks.js';
import { usePager, ROW } from '../../components/Pager.jsx';
import { humanDuration, clockTime, dayLabel, STOP_REASONS } from '../../lib/format.js';
import { Avatar, LoadError, Pill } from '../../components/admin-bits.jsx';
import { IconPlus, IconChevron } from '../../components/Icons.jsx';

/** The roster on the left, whoever is selected in depth on the right. */
export default function People({ selectedId, onSelect }) {
  const roster = useRoster();
  const [adding, setAdding] = useState(false);

  const active = roster.users.filter((u) => u.active);
  const current = selectedId || active[0]?.id || null;
  const { ref, slice, control } = usePager(roster.users, { rowHeight: ROW.person, gap: 6 });

  if (roster.error && !roster.data) return <LoadError error={roster.error} onRetry={roster.reload} />;

  return (
    <div className="page-body people-grid">
      <section className="card roster-card">
        <div className="checklist-head">
          <h2>People</h2>
          <span className="head-tools">
            {control}
            <button className="icon-btn" onClick={() => setAdding((v) => !v)} title="Add someone">
              <IconPlus width={14} height={14} />
            </button>
          </span>
        </div>

        {adding && <AddPerson roster={roster} onDone={() => setAdding(false)} />}

        <div className="people-list" ref={ref}>
          {slice.map((u) => (
            <button
              key={u.id}
              className={['person-row', current === u.id && 'selected', !u.active && 'off'].filter(Boolean).join(' ')}
              onClick={() => onSelect(u.id)}
            >
              <Avatar name={u.name} />
              <span className="person-id">
                <strong className="truncate">{u.name}</strong>
                <small className="truncate">{u.email}</small>
              </span>
              {u.role === 'admin' && <Pill tone="accent">Admin</Pill>}
              {!u.active && <Pill>Off</Pill>}
            </button>
          ))}
        </div>
      </section>

      <PersonDetail id={current} roster={roster} />
    </div>
  );
}

/* ------------------------------ add someone ----------------------------- */

function AddPerson({ roster, onDone }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'employee' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await roster.add(form);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="add-person" onSubmit={submit}>
      <input value={form.name} onChange={set('name')} placeholder="Full name" maxLength={80} required />
      <input value={form.email} onChange={set('email')} type="email" placeholder="Email" required />
      <input
        value={form.password}
        onChange={set('password')}
        type="password"
        placeholder="Temporary password"
        required
      />
      <select value={form.role} onChange={set('role')}>
        <option value="employee">Employee</option>
        <option value="admin">Admin</option>
      </select>
      <button className="btn primary" disabled={busy}>
        {busy ? 'Adding…' : 'Add'}
      </button>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}

/* -------------------------------- detail -------------------------------- */

function PersonDetail({ id, roster }) {
  const { data, error, loading, reload } = useEmployee(id);
  const [tab, setTab] = useState('sessions');
  const [busy, setBusy] = useState(false);

  const rows = tab === 'sessions' ? data?.sessions || [] : data?.tasks || [];
  const { ref, slice, control } = usePager(rows, { rowHeight: ROW.session, gap: 6 });

  if (!id) return <section className="card detail-card empty-card">Select someone on the left.</section>;
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <section className="card detail-card empty-card">{loading ? 'Loading…' : 'Nothing to show.'}</section>;

  const { user } = data;
  const week = (data.sessions || []).reduce((sum, s) => sum + s.activeSeconds, 0);
  const idle = (data.sessions || []).reduce((sum, s) => sum + s.idleSeconds, 0);

  const toggleActive = async () => {
    setBusy(true);
    try {
      await roster.update({ id: user.id, active: !user.active });
      await reload();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card detail-card">
      <div className="detail-head">
        <Avatar name={user.name} size={44} />
        <div className="detail-id">
          <strong className="truncate">{user.name}</strong>
          <small className="truncate">{user.email}</small>
        </div>
        <button className="btn tiny" onClick={toggleActive} disabled={busy}>
          {user.active ? 'Deactivate' : 'Reactivate'}
        </button>
      </div>

      <div className="detail-stats">
        <Stat label="Tracked (14d)" value={humanDuration(week)} />
        <Stat label="Idle (14d)" value={humanDuration(idle)} />
        <Stat label="Sessions" value={String(data.sessions.length)} />
        <Stat label="Open tasks" value={String(data.tasks.filter((t) => t.status === 'open').length)} />
      </div>

      <div className="detail-tabs">
        <button className={tab === 'sessions' ? 'seg active' : 'seg'} onClick={() => setTab('sessions')}>
          Sessions
        </button>
        <button className={tab === 'tasks' ? 'seg active' : 'seg'} onClick={() => setTab('tasks')}>
          Tasks
        </button>
        <span className="head-tools">{control}</span>
      </div>

      <div className="detail-list" ref={ref}>
        {slice.length === 0 && <p className="empty">Nothing recorded yet.</p>}

        {tab === 'sessions' &&
          slice.map((s) => (
            <div className="detail-row" key={s.id}>
              <span className="detail-when">
                <strong>{dayLabel(s.startedAt)}</strong>
                <small className="mono">
                  {clockTime(s.startedAt)} – {s.endedAt ? clockTime(s.endedAt) : 'now'}
                </small>
              </span>
              <span className="detail-note truncate">{s.note || s.taskTitle || 'Tracked time'}</span>
              <span className="detail-figures">
                <b className="mono">{humanDuration(s.activeSeconds)}</b>
                <small className="mono">{humanDuration(s.idleSeconds)} idle</small>
              </span>
              {s.stopReason && s.stopReason !== 'manual' && (
                <Pill tone={s.stopReason === 'idle-timeout' ? 'warn' : ''}>
                  {STOP_REASONS[s.stopReason] || s.stopReason}
                </Pill>
              )}
            </div>
          ))}

        {tab === 'tasks' &&
          slice.map((t) => (
            <div className="detail-row" key={t.id}>
              <span className="detail-note truncate">
                <strong>{t.title}</strong>
              </span>
              {t.priority === 'high' && <Pill tone="warn">High</Pill>}
              {t.source === 'self' && <Pill>Their own</Pill>}
              <Pill tone={t.status === 'done' ? 'ok' : ''}>{t.status === 'done' ? 'Done' : 'Open'}</Pill>
            </div>
          ))}
      </div>

      <div className="detail-devices">
        {data.devices.slice(0, 3).map((d) => (
          <span key={d.id} className="device-chip truncate">
            <IconChevron width={10} height={10} />
            {d.name} · {d.lastSeenAt ? dayLabel(d.lastSeenAt) : 'never'}
          </span>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="detail-stat">
      <strong className="mono">{value}</strong>
      <span>{label}</span>
    </div>
  );
}
