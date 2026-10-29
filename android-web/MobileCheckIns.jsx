import React, { useEffect, useMemo, useState } from 'react';
import { request } from './bridge.js';
import { checkInState, dhakaClock, punctuality } from '../desktop/src/lib/check-ins.js';

const thisMonth = () => new Date(Date.now() + 21600000).toISOString().slice(0, 7);
const shift = (month, delta) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7); };

export default function MobileCheckIns({ attendance, work, onCheckIn, busy, notice }) {
  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { let live = true; request(`/api/agent/attendance?month=${month}`).then(data => { if (live) { setRows(data.punches || []); setError(''); } }).catch(cause => { if (live) setError(cause.message); }); return () => { live = false; }; }, [month, attendance]);
  const byDate = useMemo(() => { const map = new Map(); for (const row of rows) { const date = String(row.date).slice(0, 10); map.set(date, [...(map.get(date) || []), row]); } return map; }, [rows]);
  const [year, part] = month.split('-').map(Number);
  const days = new Date(year, part, 0).getDate();
  const offset = (new Date(year, part - 1, 1).getDay() + 6) % 7;
  const dates = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const picked = selected.startsWith(month) ? selected : `${month}-${String(Math.min(days, new Date(Date.now() + 21600000).getUTCDate())).padStart(2, '0')}`;
  const todayState = checkInState(attendance?.punches || [], work);
  return <section className="mobile-page mobile-checkins-page"><div className="mobile-page-intro"><span className="mobile-eyebrow">ATTENDANCE</span><h1>Check-ins</h1><p>Your arrival record, day by day.</p></div>
    <div className="mobile-month-bar"><strong>{new Date(Date.UTC(year, part - 1, 1)).toLocaleDateString('en-BD', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong><div><button aria-label="Previous month" onClick={() => setMonth(shift(month, -1))}>‹</button><button aria-label="Next month" disabled={month >= thisMonth()} onClick={() => setMonth(shift(month, 1))}>›</button></div></div>
    <div className="mobile-checkin-grid">{['M','T','W','T','F','S','S'].map((label, i) => <span className="weekday" key={i}>{label}</span>)}{dates.map((date, i) => date ? <button key={date} className={`${byDate.has(date) ? 'has-punch' : ''} ${date === picked ? 'selected' : ''}`} onClick={() => setSelected(date)}><span>{Number(date.slice(-2))}</span><i /></button> : <span key={`space-${i}`} />)}</div>
    {error && <p className="form-error">{error}</p>}
    <div className="mobile-checkin-detail"><h2>{new Date(`${picked}T12:00:00Z`).toLocaleDateString('en-BD', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2>{(byDate.get(picked) || []).length ? byDate.get(picked).map(row => { const status = punctuality(row, work); return <article key={row.id}><strong>{dhakaClock(row.checkedInAt)}</strong><span>Expected {status.expected || '—'}</span><b className={status.delta > 0 ? 'late' : status.delta < 0 ? 'early' : 'on-time'}>{status.label}</b></article>; }) : <p>No check-in recorded.</p>}</div>
    {picked === new Date(Date.now() + 21600000).toISOString().slice(0, 10) && <><button className="btn primary mobile-checkin-action" disabled={busy || todayState.covered} onClick={onCheckIn}>{todayState.covered ? 'Checked in' : 'Check in now'}</button>{notice && <p role="status" className="mobile-checkin-notice">{notice}</p>}</>}
  </section>;
}
