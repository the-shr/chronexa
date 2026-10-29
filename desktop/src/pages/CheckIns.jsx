import { useEffect, useMemo, useState } from 'react';
import CheckInCard from '../components/CheckInCard.jsx';
import { dhakaClock, punctuality } from '../lib/check-ins.js';
import { useSettings } from '../lib/hooks.js';

const currentMonth = () => new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 7);
const shiftMonth = (month, offset) => { const [year, part] = month.split('-').map(Number); return new Date(Date.UTC(year, part - 1 + offset, 1)).toISOString().slice(0, 7); };

export default function CheckIns({ attendance, onCheckIn }) {
  const [settings] = useSettings();
  const [month, setMonth] = useState(currentMonth);
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; setBusy(true); window.api.attendance.month(month).then(data => { if (live) { setHistory(data.punches || []); setError(''); } }).catch(cause => { if (live) setError(cause.message || 'Could not load check-ins.'); }).finally(() => { if (live) setBusy(false); }); return () => { live = false; }; }, [month, attendance]);
  const byDay = useMemo(() => { const map = new Map(); for (const punch of history) { const key = String(punch.date).slice(0, 10); map.set(key, [...(map.get(key) || []), punch]); } return map; }, [history]);
  const [year, part] = month.split('-').map(Number);
  const count = new Date(year, part, 0).getDate();
  const offset = (new Date(year, part - 1, 1).getDay() + 6) % 7;
  const cells = [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const chosen = selected?.startsWith(month) ? selected : `${month}-${String(Math.min(count, new Date(Date.now() + 21600000).getUTCDate())).padStart(2, '0')}`;
  return <section className="checkins-page"><header className="my-tasks-head"><div><span className="card-kicker">Attendance</span><h1>Check-ins</h1><p>Your duty times and arrival record.</p></div></header>
    {settings && <CheckInCard attendance={attendance} work={settings.work} onCheckIn={onCheckIn} />}
    <div className="checkins-content"><section className="card checkins-calendar"><header><h2>{new Date(Date.UTC(year, part - 1, 1)).toLocaleDateString('en-BD', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2><div><button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button><button type="button" aria-label="Next month" disabled={month >= currentMonth()} onClick={() => setMonth(shiftMonth(month, 1))}>›</button></div></header><div className="checkins-grid">{['M','T','W','T','F','S','S'].map((label, i) => <span key={i} className="weekday">{label}</span>)}{cells.map((date, i) => date ? <button type="button" key={date} className={`${byDay.has(date) ? 'has-punch' : ''} ${chosen === date ? 'selected' : ''}`} onClick={() => setSelected(date)}><span>{Number(date.slice(-2))}</span><i /></button> : <span key={`gap-${i}`} />)}</div>{busy && <p className="muted">Loading check-ins…</p>}{error && <p className="form-error">{error}</p>}</section>
    <section className="card checkins-detail"><span className="card-kicker">Daily record</span><h2>{new Date(`${chosen}T12:00:00Z`).toLocaleDateString('en-BD', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2>{(byDay.get(chosen) || []).length ? (byDay.get(chosen) || []).map(punch => { const result = punctuality(punch, settings?.work); return <div className="checkins-entry" key={punch.id}><strong>{dhakaClock(punch.checkedInAt)}</strong><span>Scheduled {result.expected || '—'}</span><b className={result.delta > 0 ? 'late' : result.delta < 0 ? 'early' : 'on-time'}>{result.label}</b></div>; }) : <p className="muted">No check-in recorded for this day.</p>}</section></div>
  </section>;
}
