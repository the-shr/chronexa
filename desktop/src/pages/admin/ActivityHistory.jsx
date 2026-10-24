import { useState } from 'react';
import { humanDuration } from '../../lib/format.js';
const today = () => new Date(Date.now() + 21600000).toISOString().slice(0, 10);
export default function ActivityHistory({ daily = [], targetHours = 0, selectedDay, onSelect }) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [focus, setFocus] = useState(null);
  const byDate = new Map(daily.map(row => [row.date, row]));
  const target = Math.max(0, Number(targetHours) || 0) * 3600;
  const value = date => byDate.get(date)?.workSeconds || 0;
  const describe = date => `${date} · ${humanDuration(value(date))}${target ? ` · ${Math.round(value(date) / target * 100)}% of ${targetHours}h goal` : ' · No daily goal'}`;
  const recent = Array.from({ length: 7 }, (_, i) => new Date(Date.now() + 21600000 - (6 - i) * 86400000).toISOString().slice(0, 10));
  const first = new Date(month + '-01T12:00:00Z');
  const earliest = new Date(Date.now() + 21600000 - 365 * 86400000).toISOString().slice(0, 10);
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const dates = Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const max = Math.max(target, ...recent.map(value), 1);
  function choose(date) { setFocus(date); onSelect(date); }
  function shift(offset) { const date = new Date(first); date.setUTCMonth(date.getUTCMonth() + offset); setMonth(date.toISOString().slice(0, 7)); setFocus(null); }
  return <section className="activity-history" aria-label="Tracking history">
    <div className="tc-rank-heading"><h2>Last 7 days</h2><span>{target ? `${targetHours}h daily goal` : 'No daily goal'}</span></div>
    <div className="activity-bars">{recent.map(date => <button key={date} title={describe(date)} aria-label={describe(date)} aria-pressed={selectedDay === date} onMouseEnter={() => setFocus(date)} onFocus={() => setFocus(date)} onClick={() => choose(date)}><span className="activity-bar-track"><i style={{ height: `${Math.max(value(date) ? 4 : 0, value(date) / max * 100)}%` }} /></span><small>{new Date(date + 'T12:00:00Z').toLocaleDateString('en', { weekday: 'short' })}</small></button>)}</div>
    <div className="tc-rank-heading"><h2>{first.toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2><div><button className="tc-button" aria-label="Previous month" disabled={month <= earliest.slice(0, 7)} onClick={() => shift(-1)}>‹</button><button className="tc-button" aria-label="Next month" disabled={month >= today().slice(0, 7)} onClick={() => shift(1)}>›</button></div></div>
    <div className="activity-calendar">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(label => <small key={label}>{label}</small>)}{Array.from({length:(first.getUTCDay()+6)%7},(_,i)=><span key={`blank${i}`}/>)}{dates.map(date => { const seconds = value(date); const level = !seconds ? 0 : !target ? 2 : Math.min(4, Math.max(1, Math.ceil(seconds / target * 4))); return <button key={date} className={`activity-day level-${level}`} disabled={date > today() || date < new Date(Date.now() + 21600000 - 365 * 86400000).toISOString().slice(0,10)} title={describe(date)} aria-label={describe(date)} aria-pressed={selectedDay === date} onMouseEnter={() => setFocus(date)} onFocus={() => setFocus(date)} onClick={() => choose(date)}>{Number(date.slice(-2))}</button>; })}</div>
    <div className="activity-summary" aria-live="polite">{focus ? describe(focus) : 'Select a day to see its sessions.'}</div><div className="activity-legend"><span>Less</span>{[0,1,2,3,4].map(level => <i key={level} className={`activity-day level-${level}`}/>)}<span>Goal reached</span></div>
  </section>;
}
