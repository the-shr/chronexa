import { useState } from 'react';
import { useTheme } from '../lib/hooks.js';
export default function ResumePrompt() {
  useTheme();
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function act(action){setBusy(true);setError('');try{await action();}catch(e){setError(e.message);setBusy(false);}}
  return <div className="idle-shell" style={{padding:'32px 28px'}}><div style={{fontSize:28,marginBottom:12,color:'var(--accent-text)'}}>Ⅱ</div><h1>Ready to resume?</h1><p>Tracking paused while you were away.<br/>Resume when you’re ready to work.</p>{error&&<p className="form-error" role="alert">{error}</p>}<div className="idle-actions"><button className="btn primary" disabled={busy} onClick={()=>act(()=>window.api.tracker.resume())}>Resume tracking</button><button className="btn" disabled={busy} onClick={()=>act(()=>window.api.tracker.stop('manual'))}>Stop timer</button></div></div>;
}
