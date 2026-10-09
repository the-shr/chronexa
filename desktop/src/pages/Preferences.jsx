import { useState } from 'react';
import { useSettings } from '../lib/hooks.js';

export default function Preferences() {
  const [settings, update] = useSettings();
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  if (!settings) return <p>Loading settings…</p>;
  const enabled = settings.general.timerOverlayVisible !== false;
  const setVisible = async (visible) => {
    setSaving(true);
    setError(null);
    try { await update({ general: { timerOverlayVisible: visible } }); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  return <><header className="page-head"><h1>Settings</h1></header>
    <section className="card" style={{ padding: 24, alignSelf: 'start' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <strong id="floating-timer-label">Floating timer</strong>
        <div className="seg-row" role="group" aria-labelledby="floating-timer-label">
          <button type="button" className={enabled ? 'seg active' : 'seg'} aria-pressed={enabled} disabled={saving} onClick={() => setVisible(true)}>On</button>
          <button type="button" className={!enabled ? 'seg active' : 'seg'} aria-pressed={!enabled} disabled={saving} onClick={() => setVisible(false)}>Off</button>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section></>;
}
