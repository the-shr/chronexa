import { useUpdateStatus } from './UpdateBanner.jsx';

export default function RequiredUpdate({ policy }) {
  const { status, busy, label, install } = useUpdateStatus();
  const update = policy.manifest;
  const required = Boolean(update?.required && update.available);
  return <div className="fallback"><section className="fallback-card" role="alert">
    <h1>{required ? 'Update required' : policy.checking ? 'Checking for updates…' : 'Could not check for updates'}</h1>
    {required && <p>Install Chronexa {update.latestVersion} to continue.</p>}
    {(status.error || policy.error) && <p className="form-error">{status.error || policy.error}</p>}
    {busy && <p role="status">{label}</p>}
    <div className="seg-row">
      {required && <button className="btn primary" disabled={busy} onClick={install}>{label}</button>}
      {!busy && !policy.checking && <button className="btn" onClick={() => window.api.app.checkUpdate()}>Retry check</button>}
      <button className="btn" disabled={status.phase === 'installing'} onClick={() => window.api.app.quit()}>Quit</button>
    </div>
  </section></div>;
}
