import { useState } from 'react';
import { useSettings } from '../lib/hooks.js';

export default function Preferences() {
  const [settings, update] = useSettings();
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  if (!settings) return <p>Loading settings…</p>;
  const rows = [{ key: 'timerOverlayVisible', label: 'Floating timer', id: 'floating-timer-label' }, { key: 'autoUpdate', label: 'Auto update', id: 'auto-update-label' }];
  const setPreference = async (key, visible) => {
    setSaving(true);
    setError(null);
    try { await update({ general: { [key]: visible } }); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  return <><header className="page-head"><h1>Settings</h1></header>
    <section className="card" style={{ padding: 24, alignSelf: 'start', gap: 24 }}>
      {rows.map((row) => <div key={row.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <strong id={row.id}>{row.label}</strong>
        <div className="seg-row" role="group" aria-labelledby={row.id}>
          <button type="button" className={settings.general[row.key] !== false ? 'seg active' : 'seg'} aria-pressed={settings.general[row.key] !== false} disabled={saving} onClick={() => setPreference(row.key, true)}>On</button>
          <button type="button" className={settings.general[row.key] === false ? 'seg active' : 'seg'} aria-pressed={settings.general[row.key] === false} disabled={saving} onClick={() => setPreference(row.key, false)}>Off</button>
        </div>
      </div>)}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section></>;
}
