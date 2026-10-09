import { useState } from 'react';
import { useSettings } from '../lib/hooks.js';

export default function Preferences() {
  const [settings, update] = useSettings();
  const [error, setError] = useState(null);
  if (!settings) return <p>Loading settings…</p>;
  return <><header className="page-head"><div><h1>Settings</h1><p>Your desktop preferences.</p></div></header>
    <section className="card" style={{ padding: 24 }}><label className="pol-toggle">
      <input type="checkbox" checked={settings.general.timerOverlayVisible !== false} onChange={(event) => { setError(null); update({ general: { timerOverlayVisible: event.target.checked } }).catch((err) => setError(err.message)); }} />
      <span><strong>Show floating timer</strong><small style={{ display: 'block' }}>A translucent timer while tracking. Drag it anywhere, or hide it with ×.</small></span>
    </label>{error && <p className="form-error">{error}</p>}</section></>;
}
