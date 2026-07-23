import { useState } from 'react';

import { usePolicy } from '../../lib/admin-hooks.js';
import { usePager, ROW } from '../../components/Pager.jsx';
import { LoadError } from '../../components/admin-bits.jsx';

/**
 * Where an admin sets what is monitored and expected -- office hours, target
 * hours, the idle rule, screenshots and recording -- without touching a single
 * employee machine. The agent pulls this and obeys it.
 */
export default function Policy() {
  const { policy, employees, estimatedDailyBytes, error, loading, reload, save } = usePolicy();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  if (error && !policy) return <LoadError error={error} onRetry={reload} />;
  if (!policy) return <p className="empty">{loading ? 'Loading the policy…' : 'No policy yet.'}</p>;

  const apply = async (patch) => {
    setBusy(true);
    setNote(null);
    try {
      await save(patch);
      setNote('Saved. Agents pick it up within a few minutes.');
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-body policy-grid">
      <div className="policy-col">
        <HoursCard policy={policy} busy={busy} onApply={apply} />
        <IdleCard policy={policy} busy={busy} onApply={apply} />
      </div>

      <div className="policy-col">
        <ScreenshotCard policy={policy} busy={busy} onApply={apply} />
        <RecordingCard policy={policy} estimate={estimatedDailyBytes} busy={busy} onApply={apply} />
      </div>

      <PeopleCard employees={employees} busy={busy} onApply={apply} note={note} />
    </div>
  );
}

/* ------------------------------- controls ------------------------------- */

function Toggle({ label, hint, checked, disabled, onChange }) {
  return (
    <label className={disabled ? 'pol-toggle off' : 'pol-toggle'}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="pol-track" aria-hidden="true">
        <i />
      </span>
      <span className="pol-toggle-text">
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

function Field({ label, children, suffix }) {
  return (
    <label className="pol-field">
      <span>{label}</span>
      <span className="pol-input">
        {children}
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  );
}

/** A number that commits on blur or Enter, so typing does not fire a save a key. */
function NumberField({ label, value, suffix, min, max, step = 1, disabled, onCommit }) {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && n !== value) onCommit(n);
    else setDraft(String(value));
  };
  if (String(value) !== draft && document.activeElement?.dataset?.k !== label) {
    // Keep the field in step when the saved value changes elsewhere.
  }
  return (
    <Field label={label} suffix={suffix}>
      <input
        type="number"
        data-k={label}
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </Field>
  );
}

function TimeField({ label, value, disabled, onCommit }) {
  return (
    <Field label={label}>
      <input type="time" value={value} disabled={disabled} onChange={(e) => onCommit(e.target.value)} />
    </Field>
  );
}

/* -------------------------------- cards --------------------------------- */

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function HoursCard({ policy, busy, onApply }) {
  const days = new Set(policy.workDays.split(',').map(Number));
  const toggleDay = (n) => {
    const next = new Set(days);
    next.has(n) ? next.delete(n) : next.add(n);
    onApply({ workDays: [...next].sort().join(',') || '1' });
  };

  return (
    <section className="card pol-card">
      <h2>Office hours</h2>
      <div className="pol-row2">
        <TimeField label="Start" value={policy.officeStart} disabled={busy} onCommit={(v) => onApply({ officeStart: v })} />
        <TimeField label="End" value={policy.officeEnd} disabled={busy} onCommit={(v) => onApply({ officeEnd: v })} />
      </div>

      <span className="pol-label">Working days</span>
      <div className="pol-days">
        {DAY_NAMES.map((name, i) => {
          const n = i + 1;
          return (
            <button
              key={n}
              className={days.has(n) ? 'pol-day on' : 'pol-day'}
              disabled={busy}
              onClick={() => toggleDay(n)}
            >
              {name}
            </button>
          );
        })}
      </div>

      <div className="pol-row2">
        <NumberField label="Daily target" value={policy.dailyTargetHours} suffix="h" min={0} max={24} step={0.5} disabled={busy} onCommit={(v) => onApply({ dailyTargetHours: v })} />
        <NumberField label="Weekly target" value={policy.weeklyTargetHours} suffix="h" min={0} max={168} disabled={busy} onCommit={(v) => onApply({ weeklyTargetHours: v })} />
      </div>
      <p className="pol-note">These are the team defaults. Give one person different hours on the right.</p>
    </section>
  );
}

function IdleCard({ policy, busy, onApply }) {
  return (
    <section className="card pol-card">
      <h2>Idle</h2>
      <NumberField label="Mark idle after" value={policy.idleThresholdMinutes} suffix="min" min={1} max={60} disabled={busy} onCommit={(v) => onApply({ idleThresholdMinutes: v })} />

      <div className="pol-seg-field">
        <span>When idle</span>
        <div className="seg-row">
          {[
            ['pause', 'Pause, resume on activity'],
            ['stop', 'Stop the session'],
          ].map(([value, text]) => (
            <button
              key={value}
              className={policy.idleOnTimeout === value ? 'seg active' : 'seg'}
              disabled={busy}
              onClick={() => onApply({ idleOnTimeout: value })}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      <Toggle
        label="Count idle time as work"
        hint="Idle is always recorded separately; this only decides the credited total."
        checked={policy.countIdleAsWork}
        disabled={busy}
        onChange={(v) => onApply({ countIdleAsWork: v })}
      />
    </section>
  );
}

function ScreenshotCard({ policy, busy, onApply }) {
  const on = policy.screenshotsEnabled;
  return (
    <section className="card pol-card">
      <h2>Screenshots</h2>
      <Toggle label="Take screenshots" checked={on} disabled={busy} onChange={(v) => onApply({ screenshotsEnabled: v })} />

      <NumberField label="Every" value={policy.screenshotIntervalMinutes} suffix="min" min={1} max={120} disabled={busy || !on} onCommit={(v) => onApply({ screenshotIntervalMinutes: v })} />
      <NumberField label="Quality" value={policy.screenshotQuality} suffix="%" min={10} max={100} step={5} disabled={busy || !on} onCommit={(v) => onApply({ screenshotQuality: v })} />

      <Toggle label="Random moment in each window" hint="So captures cannot be timed around." checked={policy.screenshotRandomize} disabled={busy || !on} onChange={(v) => onApply({ screenshotRandomize: v })} />
      <Toggle label="All monitors" checked={policy.screenshotAllMonitors} disabled={busy || !on} onChange={(v) => onApply({ screenshotAllMonitors: v })} />
      <Toggle label="Blur for privacy" hint="Destroys detail before saving." checked={policy.screenshotBlur} disabled={busy || !on} onChange={(v) => onApply({ screenshotBlur: v })} />
    </section>
  );
}

function RecordingCard({ policy, estimate, busy, onApply }) {
  const on = policy.recordingEnabled;
  const session = policy.recordingMode === 'session';
  const perDay = estimate ? `${(estimate / 1e9).toFixed(estimate < 1e9 ? 2 : 1)} GB` : '0';

  return (
    <section className="card pol-card">
      <h2>Screen recording</h2>
      <Toggle label="Record the screen" checked={on} disabled={busy} onChange={(v) => onApply({ recordingEnabled: v })} />

      <div className="pol-seg-field">
        <span>Mode</span>
        <div className="seg-row">
          {[
            ['interval', 'Short clip every so often'],
            ['session', 'Whole session'],
          ].map(([value, text]) => (
            <button
              key={value}
              className={policy.recordingMode === value ? 'seg active' : 'seg'}
              disabled={busy || !on}
              onClick={() => onApply({ recordingMode: value })}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      {session ? (
        <NumberField label="Segment length" value={policy.recordingSegmentMinutes} suffix="min" min={1} max={30} disabled={busy || !on} onCommit={(v) => onApply({ recordingSegmentMinutes: v })} />
      ) : (
        <div className="pol-row2">
          <NumberField label="Every" value={policy.recordingIntervalMinutes} suffix="min" min={1} max={240} disabled={busy || !on} onCommit={(v) => onApply({ recordingIntervalMinutes: v })} />
          <NumberField label="For" value={policy.recordingDurationSeconds} suffix="sec" min={2} max={60} disabled={busy || !on} onCommit={(v) => onApply({ recordingDurationSeconds: v })} />
        </div>
      )}

      {on && (
        <p className={estimate > 5e9 ? 'pol-estimate high' : 'pol-estimate'}>
          ≈ <strong>{perDay}</strong> per person per day in Google Drive.
          {session && ' Whole-session recording fills storage fast.'}
        </p>
      )}
    </section>
  );
}

const POL_PERSON_ROW = 58;

/** Human summary of what a person has set differently from the team. */
function overrideSummary(o) {
  if (!o || !Object.keys(o).length) return null;
  const bits = [];
  if (o.screenshotsEnabled === false) bits.push('no screenshots');
  if (o.recordingEnabled === false) bits.push('no recording');
  if (o.recordingEnabled === true) bits.push('recording on');
  if (o.dailyTargetHours !== undefined) bits.push(`${o.dailyTargetHours}h/day`);
  if (o.officeStart !== undefined || o.officeEnd !== undefined) bits.push('own hours');
  if (o.idleThresholdMinutes !== undefined) bits.push('own idle');
  if (o.screenshotIntervalMinutes !== undefined) bits.push('own shot rate');
  return bits.length ? bits.join(' · ') : 'custom';
}

function PeopleCard({ employees, busy, onApply, note }) {
  const [editing, setEditing] = useState(null);
  const { ref, slice, control } = usePager(employees, { rowHeight: POL_PERSON_ROW, gap: 6 });
  const person = employees.find((e) => e.id === editing);

  return (
    <section className="card pol-people-card">
      <div className="checklist-head">
        <h2>Per employee</h2>
        <span className="head-tools">{control}</span>
      </div>
      {note && <p className={/saved/i.test(note) ? 'form-ok' : 'form-error'}>{note}</p>}

      <div className="detail-list" ref={ref}>
        {slice.length === 0 ? (
          <p className="empty">No employees yet.</p>
        ) : (
          slice.map((e) => {
            const summary = overrideSummary(e.overrides);
            return (
              <button className="pol-person" key={e.id} onClick={() => setEditing(e.id)}>
                <span className="pol-person-name">
                  <strong className="truncate">{e.name}</strong>
                  <small className={summary ? 'custom' : undefined}>{summary || 'Team default'}</small>
                </span>
                <span className="pol-person-edit">Customise</span>
              </button>
            );
          })
        )}
      </div>
      <p className="pol-note">Anything left on the team default follows the settings on the left.</p>

      {person && (
        <PersonEditor
          person={person}
          busy={busy}
          onApply={onApply}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

/**
 * One person's overrides. Each control is either "team default" or a set value;
 * turning a row off sends null so it falls back. This is where an admin makes
 * someone tracked but not captured.
 */
function PersonEditor({ person, busy, onApply, onClose }) {
  const o = person.overrides || {};
  const has = (k) => o[k] !== undefined;

  // A tri-state toggle row: off = team default (null), on = a chosen value.
  const OverrideRow = ({ label, keyName, children, hint }) => (
    <div className={has(keyName) ? 'pol-ov on' : 'pol-ov'}>
      <label className="pol-ov-head">
        <input
          type="checkbox"
          checked={has(keyName)}
          disabled={busy}
          onChange={(e) => onApply({ userId: person.id, [keyName]: e.target.checked ? defaultFor(keyName) : null })}
        />
        <span>
          <strong>{label}</strong>
          {hint && <small>{hint}</small>}
        </span>
      </label>
      {has(keyName) && <div className="pol-ov-body">{children}</div>}
    </div>
  );

  return (
    <div className="lightbox" role="presentation" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="pol-editor" role="presentation" onClick={(e) => e.stopPropagation()}>
        <div className="pol-editor-head">
          <strong>{person.name}</strong>
          <span className="muted">{person.email}</span>
          <span className="spacer" />
          {Object.keys(o).length > 0 && (
            <button className="btn tiny" disabled={busy} onClick={() => onApply({ userId: person.id, clear: true })}>
              Reset to team default
            </button>
          )}
          <button className="btn tiny" onClick={onClose}>
            Done
          </button>
        </div>

        <div className="pol-editor-body">
          <OverrideRow label="Take screenshots" keyName="screenshotsEnabled" hint="Turn off to track this person without any screenshots.">
            <div className="seg-row">
              <button className={o.screenshotsEnabled ? 'seg active' : 'seg'} disabled={busy} onClick={() => onApply({ userId: person.id, screenshotsEnabled: true })}>On</button>
              <button className={o.screenshotsEnabled === false ? 'seg active' : 'seg'} disabled={busy} onClick={() => onApply({ userId: person.id, screenshotsEnabled: false })}>Off</button>
            </div>
          </OverrideRow>

          <OverrideRow label="Screenshot interval" keyName="screenshotIntervalMinutes">
            <MiniNumber value={o.screenshotIntervalMinutes ?? 10} suffix="min" min={1} max={120} busy={busy} onCommit={(v) => onApply({ userId: person.id, screenshotIntervalMinutes: v })} />
          </OverrideRow>

          <OverrideRow label="Record the screen" keyName="recordingEnabled" hint="Turn off to track this person without any recording.">
            <div className="seg-row">
              <button className={o.recordingEnabled ? 'seg active' : 'seg'} disabled={busy} onClick={() => onApply({ userId: person.id, recordingEnabled: true })}>On</button>
              <button className={o.recordingEnabled === false ? 'seg active' : 'seg'} disabled={busy} onClick={() => onApply({ userId: person.id, recordingEnabled: false })}>Off</button>
            </div>
          </OverrideRow>

          <OverrideRow label="Recording mode" keyName="recordingMode">
            <div className="seg-row">
              <button className={o.recordingMode === 'interval' ? 'seg active' : 'seg'} disabled={busy} onClick={() => onApply({ userId: person.id, recordingMode: 'interval' })}>Clips</button>
              <button className={o.recordingMode === 'session' ? 'seg active' : 'seg'} disabled={busy} onClick={() => onApply({ userId: person.id, recordingMode: 'session' })}>Whole session</button>
            </div>
          </OverrideRow>

          <OverrideRow label="Idle threshold" keyName="idleThresholdMinutes">
            <MiniNumber value={o.idleThresholdMinutes ?? 5} suffix="min" min={1} max={60} busy={busy} onCommit={(v) => onApply({ userId: person.id, idleThresholdMinutes: v })} />
          </OverrideRow>

          <div className="pol-ov-grid">
            <OverrideRow label="Daily target" keyName="dailyTargetHours">
              <MiniNumber value={o.dailyTargetHours ?? 8} suffix="h" min={0} max={24} step={0.5} busy={busy} onCommit={(v) => onApply({ userId: person.id, dailyTargetHours: v })} />
            </OverrideRow>
            <OverrideRow label="Office start" keyName="officeStart">
              <input className="pol-ov-time" type="time" defaultValue={o.officeStart ?? '09:00'} disabled={busy} onChange={(e) => onApply({ userId: person.id, officeStart: e.target.value })} />
            </OverrideRow>
          </div>
        </div>
      </div>
    </div>
  );
}

function defaultFor(key) {
  const defaults = {
    screenshotsEnabled: true,
    screenshotIntervalMinutes: 10,
    recordingEnabled: false,
    recordingMode: 'interval',
    idleThresholdMinutes: 5,
    dailyTargetHours: 8,
    officeStart: '09:00',
  };
  return defaults[key];
}

function MiniNumber({ value, suffix, min, max, step = 1, busy, onCommit }) {
  const [draft, setDraft] = useState(String(value));
  return (
    <span className="pol-input">
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (Number.isFinite(n) && n !== value) onCommit(n);
          else setDraft(String(value));
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {suffix && <em>{suffix}</em>}
    </span>
  );
}
