import { useState } from 'react';

import { useRecordings, useOverview, useClip } from '../../lib/admin-hooks.js';
import { usePager, ROW } from '../../components/Pager.jsx';
import { clockTime, dayLabel, humanDuration } from '../../lib/format.js';
import { LoadError, Avatar } from '../../components/admin-bits.jsx';
import { IconTrash, IconPlay } from '../../components/Icons.jsx';

/**
 * The short screen clips the agent uploads, played back through the server.
 * Admin-only by construction, the same as Screens: the employee build has no
 * surface for these and the API refuses anyone else.
 */
export default function Recordings() {
  const [userId, setUserId] = useState('');
  const [openId, setOpenId] = useState(null);
  const { recordings, configured, error, loading, reload, remove } = useRecordings({ userId, limit: 120 });
  const { data: overview } = useOverview(7);
  const people = overview?.people || [];

  const { ref, slice, control } = usePager(recordings, { rowHeight: ROW.session, gap: 6 });

  const del = async (id) => {
    try {
      await remove(id);
      if (openId === id) setOpenId(null);
    } catch (err) {
      window.alert(err.message);
    }
  };

  if (error && !recordings.length) return <LoadError error={error} onRetry={reload} />;

  return (
    <div className="page-body screens-grid">
      <section className="card screens-card">
        <div className="checklist-head">
          <h2>Recordings</h2>
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

        <div className="detail-list" ref={ref}>
          {slice.length === 0 ? (
            <p className="empty">
              {!configured
                ? 'Recording storage is not set up on the server yet, so nothing is being kept.'
                : loading
                  ? 'Loading…'
                  : 'No clips yet. They appear a few minutes after someone starts tracking.'}
            </p>
          ) : (
            slice.map((clip) => (
              <ClipRow key={clip.id} clip={clip} onPlay={() => setOpenId(clip.id)} onDelete={() => del(clip.id)} />
            ))
          )}
        </div>
      </section>

      {openId && (
        <Player
          id={openId}
          clip={recordings.find((r) => r.id === openId)}
          onClose={() => setOpenId(null)}
          onDelete={() => del(openId)}
        />
      )}
    </div>
  );
}

function ClipRow({ clip, onPlay, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="detail-row clip-row">
      <Avatar name={clip.name} size={30} />

      <span className="detail-when">
        <strong>{dayLabel(clip.startedAt)}</strong>
        <small className="mono">{clockTime(clip.startedAt)}</small>
      </span>

      <span className="detail-note truncate">
        <strong>{clip.name}</strong>
      </span>

      <span className="detail-figures">
        <b className="mono">{Math.round(clip.durationMs / 1000)}s</b>
        <small className="mono">{Math.round(clip.bytes / 1024)} kB</small>
      </span>

      {confirming ? (
        <span className="row-confirm">
          <button className="btn tiny danger-solid" onClick={onDelete}>
            Delete
          </button>
          <button className="btn tiny" onClick={() => setConfirming(false)}>
            Keep
          </button>
        </span>
      ) : (
        <>
          <button className="check-btn" onClick={onPlay} title="Play">
            <IconPlay width={12} height={12} />
          </button>
          <button className="check-remove" onClick={() => setConfirming(true)} title="Delete this clip">
            <IconTrash width={12} height={12} />
          </button>
        </>
      )}
    </div>
  );
}

function Player({ id, clip, onClose, onDelete }) {
  const { url, loading } = useClip(id);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="lightbox" role="presentation" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="lightbox-inner" role="presentation" onClick={(e) => e.stopPropagation()}>
        {url ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={url} controls autoPlay loop />
        ) : (
          <p className="empty">{loading ? 'Loading the clip…' : 'This clip could not be loaded.'}</p>
        )}

        <div className="lightbox-bar">
          <strong>{clip?.name}</strong>
          <span className="muted">
            {dayLabel(clip?.startedAt)} {clockTime(clip?.startedAt)}
          </span>
          <span className="muted mono">{humanDuration(Math.round((clip?.durationMs || 0) / 1000))}</span>
          <span className="spacer" />
          {confirming ? (
            <>
              <span className="muted">Delete this clip?</span>
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
