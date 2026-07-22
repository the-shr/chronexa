import { useCallback, useEffect, useState } from 'react';

import { clockTime, dayLabel } from '../lib/format.js';

export default function Screenshots() {
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setRows(await window.api.history.screenshots({ limit: 120 }));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const remove = async (row) => {
    await window.api.history.deleteScreenshot(row.id);
    setPreview(null);
    load();
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Screenshots</h1>
        <button className="btn ghost" onClick={() => window.api.history.openFolder()}>
          Open folder
        </button>
      </header>

      {!rows.length && <p className="empty">No screenshots yet. They appear here once tracking starts.</p>}

      <div className="shot-grid">
        {rows.map((row) => (
          <button key={row.id} className="shot" onClick={() => setPreview(row)}>
            <img src={`shot://thumb/${row.id}`} alt="" loading="lazy" />
            <span className="shot-meta">
              <strong>{clockTime(row.capturedAt)}</strong>
              <small>
                {dayLabel(row.capturedAt)}
                {row.activityPercent !== null && ` · ${row.activityPercent}% active`}
              </small>
            </span>
            {!row.uploaded && <span className="badge">local</span>}
          </button>
        ))}
      </div>

      {preview && (
        <div className="modal" onClick={() => setPreview(null)}>
          <div className="modal-body" onClick={(e) => e.stopPropagation()}>
            <img src={`shot://full/${preview.id}`} alt="" />
            <div className="modal-foot">
              <span className="muted">
                {dayLabel(preview.capturedAt)} {clockTime(preview.capturedAt)} · {preview.monitorLabel} ·{' '}
                {Math.round(preview.bytes / 1024)} KB
              </span>
              <div className="row-gap">
                <button className="btn danger" onClick={() => remove(preview)}>
                  Delete
                </button>
                <button className="btn" onClick={() => setPreview(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
