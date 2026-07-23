import { useState } from 'react';

import { useScreenshots, useOverview, useImage } from '../../lib/admin-hooks.js';
import { usePager, ROW } from '../../components/Pager.jsx';
import { clockTime, dayLabel } from '../../lib/format.js';
import { LoadError, Pill } from '../../components/admin-bits.jsx';
import { IconTrash } from '../../components/Icons.jsx';

/**
 * The captures the agent uploads. Admin-only by construction: the employee
 * build has no surface for these, and the API refuses anyone else.
 */
export default function Screens() {
  const [userId, setUserId] = useState('');
  const [openId, setOpenId] = useState(null);
  const { screenshots, error, loading, reload, remove } = useScreenshots({ userId, limit: 120 });
  const { data: overview } = useOverview(7);
  const people = overview?.people || [];

  const { ref, slice, control } = usePager(screenshots, { rowHeight: ROW.shot, gap: 10 });

  // Deleting is irreversible, so it goes through a two-step confirm rather than
  // firing on a single click.
  const del = async (id) => {
    try {
      await remove(id);
      if (openId === id) setOpenId(null);
    } catch (err) {
      window.alert(err.message);
    }
  };

  if (error && !screenshots.length) return <LoadError error={error} onRetry={reload} />;

  return (
    <div className="page-body screens-grid">
      <section className="card screens-card">
        <div className="checklist-head">
          <h2>Screens</h2>
          <span className="head-tools">{control}</span>
        </div>

        <div className="seg-row">
          <button className={!userId ? 'seg active' : 'seg'} onClick={() => setUserId('')}>
            Everyone
          </button>
          {people.slice(0, 6).map((p) => (
            <button key={p.id} className={userId === p.id ? 'seg active' : 'seg'} onClick={() => setUserId(p.id)}>
              {p.name.split(' ')[0]}
            </button>
          ))}
        </div>

        <div className="shot-wall" ref={ref}>
          {slice.length === 0 ? (
            <p className="empty">{loading ? 'Loading…' : 'No captures yet.'}</p>
          ) : (
            slice.map((shot) => (
              <Thumb key={shot.id} shot={shot} onOpen={() => setOpenId(shot.id)} onDelete={() => del(shot.id)} />
            ))
          )}
        </div>
      </section>

      {openId && (
        <Lightbox
          id={openId}
          shot={screenshots.find((s) => s.id === openId)}
          onClose={() => setOpenId(null)}
          onDelete={() => del(openId)}
        />
      )}
    </div>
  );
}

function Thumb({ shot, onOpen, onDelete }) {
  const url = useImage(shot.id);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="shot-thumb" title={`${shot.name} · ${clockTime(shot.capturedAt)}`}>
      <button className="shot-open" onClick={onOpen} title="Open">
        {url ? <img src={url} alt="" /> : <span className="shot-placeholder" />}
      </button>

      <span className="shot-meta">
        <strong className="truncate">{shot.name}</strong>
        <small className="mono">
          {dayLabel(shot.capturedAt)} {clockTime(shot.capturedAt)}
        </small>
      </span>

      {shot.activityPercent !== null && shot.activityPercent !== undefined && (
        <span className="shot-activity mono">{shot.activityPercent}%</span>
      )}

      {confirming ? (
        <span className="shot-confirm">
          <button className="mini danger" onClick={onDelete} title="Confirm delete">
            Delete
          </button>
          <button className="mini" onClick={() => setConfirming(false)} title="Keep it">
            Keep
          </button>
        </span>
      ) : (
        <button className="shot-del" onClick={() => setConfirming(true)} title="Delete this screenshot">
          <IconTrash width={13} height={13} />
        </button>
      )}
    </div>
  );
}

function Lightbox({ id, shot, onClose, onDelete }) {
  const url = useImage(id);
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className="lightbox"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="lightbox-inner" role="presentation" onClick={(e) => e.stopPropagation()}>
        {url ? <img src={url} alt="" /> : <p className="empty">Loading…</p>}
        <div className="lightbox-bar">
          <strong>{shot?.name}</strong>
          <span className="muted">
            {dayLabel(shot?.capturedAt)} {clockTime(shot?.capturedAt)}
          </span>
          {shot?.monitorLabel && <Pill>{shot.monitorLabel}</Pill>}
          <span className="spacer" />
          {confirming ? (
            <>
              <span className="muted">Delete this screenshot?</span>
              <button className="btn danger-solid" onClick={onDelete}>
                Delete
              </button>
              <button className="btn" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <>
              <button className="btn danger" onClick={() => setConfirming(true)}>
                <IconTrash width={13} height={13} />
                Delete
              </button>
              <button className="btn" onClick={onClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
