import { useState } from 'react';
import { checkInState, dhakaClock, punctuality } from '../lib/check-ins.js';

export default function CheckInCard({ attendance, work, onCheckIn, onHistory }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const state = checkInState(attendance?.punches || [], work);
  const latest = state.rows.at(-1);
  const detail = latest ? punctuality(latest, work) : null;
  async function checkIn() {
    setBusy(true); setNotice('');
    try {
      const early = state.delta !== null && state.delta < 0;
      const result = await onCheckIn();
      const refreshed = checkInState(result.punches || [], work);
      setNotice(!refreshed.covered ? 'A recent check-in already exists. Please try again when this duty period begins.' : early ? `Early check-in recorded. Your duty starts at ${state.expected}.` : 'Check-in recorded.');
    } catch (error) { setNotice(error.message || 'Check-in failed.'); }
    finally { setBusy(false); }
  }
  return <section className="card attendance-card">
    <div className="attendance-copy"><span className="card-kicker">Attendance</span><h2>{state.covered ? 'Checked in' : 'Ready to check in'}</h2><p>{state.expected ? `Duty starts ${state.expected}` : 'No duty time set'}{latest ? ` · Last check-in ${dhakaClock(latest.checkedInAt)} (${detail.label})` : ''}</p>{!state.covered && state.delta < 0 && <small>Early check-in will be recorded.</small>}{notice && <small role="status">{notice}</small>}</div>
    <div className="attendance-actions">{onHistory && <button className="btn" type="button" onClick={onHistory}>Check-ins</button>}<button className="btn primary" type="button" disabled={busy || state.covered} onClick={checkIn}>{busy ? 'Checking in…' : state.covered ? 'Done' : 'Check in'}</button></div>
  </section>;
}
