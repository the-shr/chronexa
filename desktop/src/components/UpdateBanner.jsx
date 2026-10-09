import { useEffect, useState } from 'react';

import { useUpdateCheck } from '../lib/hooks.js';

export default function UpdateBanner() {
  const { update } = useUpdateCheck();
  const [dismissed, setDismissed] = useState(false);
  const [status, setStatus] = useState({ phase: 'idle', percent: 0 });
  useEffect(() => {
    window.api.app.updateStatus?.().then(setStatus).catch(() => {});
    return window.api.app.onUpdateStatus?.(setStatus);
  }, []);
  const busy = ['checking', 'downloading', 'verifying', 'installing'].includes(status.phase);
  const install = async () => {
    setStatus({ phase: 'checking', percent: 0 });
    try { await window.api.app.installUpdate(); }
    catch (error) { setStatus({ phase: 'error', error: error.message }); }
  };

  if (!update?.available || dismissed) return null;

  const label = status.phase === 'downloading' ? `Downloading ${status.percent == null ? '…' : `${status.percent}%`}` : status.phase === 'verifying' ? 'Verifying…' : status.phase === 'installing' ? 'Installing…' : status.phase === 'checking' ? 'Checking…' : status.phase === 'error' ? 'Retry update' : 'Update now';
  return (
    <div className={update.required ? 'update-banner required' : 'update-banner'}>
      <div>
        <strong>Chronexa {update.latestVersion} is available</strong>
        <span>
          You are using {update.currentVersion}. {update.notes || 'Install the latest app to get the newest task and tracking updates.'}
        </span>
        {status.error && <span role="alert" className="form-error">{status.error}</span>}
        {busy && <span role="status">{label} · Your tracked time will be saved before Chronexa restarts.</span>}
      </div>
      <div className="update-actions">
        {update.downloadUrl && (
          <button className="btn primary sm" disabled={busy} onClick={install}>
            {label}
          </button>
        )}
        {!update.required && (
          <button className="btn ghost sm" disabled={busy} onClick={() => setDismissed(true)}>
            Later
          </button>
        )}
      </div>
    </div>
  );
}
