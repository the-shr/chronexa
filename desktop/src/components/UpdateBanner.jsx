import { useState } from 'react';

import { useUpdateCheck } from '../lib/hooks.js';

export default function UpdateBanner() {
  const { update, open } = useUpdateCheck();
  const [dismissed, setDismissed] = useState(false);

  if (!update?.available || dismissed) return null;

  const target = update.downloadUrl || update.releaseNotesUrl;
  return (
    <div className={update.required ? 'update-banner required' : 'update-banner'}>
      <div>
        <strong>Chronexa {update.latestVersion} is available</strong>
        <span>
          You are using {update.currentVersion}. {update.notes || 'Install the latest app to get the newest task and tracking updates.'}
        </span>
      </div>
      <div className="update-actions">
        {target && (
          <button className="btn primary sm" onClick={() => open(target)}>
            Download update
          </button>
        )}
        {!update.required && (
          <button className="btn ghost sm" onClick={() => setDismissed(true)}>
            Later
          </button>
        )}
      </div>
    </div>
  );
}
