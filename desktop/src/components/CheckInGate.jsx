import { useState } from 'react';
import './check-in-gate.css';

export default function CheckInGate({ locked, attendance, scheduleReady = true, onCheckIn, className = '', children }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function run(action) {
    setPending(true); setError('');
    try { await action(); }
    catch (cause) { setError(cause.message || 'Check-in failed. Try again.'); }
    finally { setPending(false); }
  }
  if (!locked) return children;
  return <div className={"checkin-gate " + className}>
    <div className="checkin-gate-content" inert="" aria-hidden="true">{children}</div>
    <div className="checkin-gate-overlay">
      {!attendance || !scheduleReady ? <p role="status">Checking attendance…</p> : attendance.unavailable ? <p role="status">Could not verify attendance. Retrying…</p> : <button className="btn primary" type="button" disabled={pending} onClick={() => run(onCheckIn)}>{pending ? 'Please wait…' : 'Check in'}</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </div>;
}
