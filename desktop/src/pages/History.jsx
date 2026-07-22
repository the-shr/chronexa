import { useEffect, useState } from 'react';

import { clockTime, dayLabel, humanDuration, STOP_REASONS } from '../lib/format.js';

export default function History() {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    const load = () => window.api.history.sessions({ limit: 200 }).then(setSessions);
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const days = groupByDay(sessions);

  return (
    <div className="page">
      <header className="page-head">
        <h1>History</h1>
      </header>

      {!sessions.length && <p className="empty">No tracked sessions yet.</p>}

      {days.map(([day, rows]) => (
        <section className="panel" key={day}>
          <h2>
            {day}
            <span className="muted">
              {humanDuration(rows.reduce((sum, r) => sum + (r.activeSeconds || 0), 0))} tracked
            </span>
          </h2>
          <table className="table">
            <thead>
              <tr>
                <th>Start</th>
                <th>End</th>
                <th>Active</th>
                <th>Idle</th>
                <th>Shots</th>
                <th>Note</th>
                <th>Ended by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.endedAt ? '' : 'live'}>
                  <td className="mono">{clockTime(r.startedAt)}</td>
                  <td className="mono">{r.endedAt ? clockTime(r.endedAt) : 'running'}</td>
                  <td className="mono">{humanDuration(r.activeSeconds)}</td>
                  <td className="mono muted">{humanDuration(r.idleSeconds)}</td>
                  <td className="mono muted">{r.screenshotCount || 0}</td>
                  <td>{r.taskNote || <span className="muted">—</span>}</td>
                  <td>
                    <span className={`tag ${r.stopReason?.startsWith('idle') ? 'warn' : ''}`}>
                      {STOP_REASONS[r.stopReason] || (r.endedAt ? r.stopReason : 'In progress')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function groupByDay(sessions) {
  const map = new Map();
  for (const s of sessions) {
    const key = dayLabel(s.startedAt) === 'Today' ? 'Today' : new Date(s.startedAt).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }
  return [...map.entries()];
}
