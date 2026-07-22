import { humanDuration } from '../lib/format.js';

/**
 * The segmented bar under the greeting: how today's tracked time splits, plus
 * the headline figures. Segments are proportional to the day itself, and the
 * target segment is only drawn when the organisation has set one -- an empty
 * rail would otherwise imply a goal that does not exist.
 */
export default function MetricStrip({ snapshot, settings, tasks }) {
  const { today } = snapshot;
  const total = today.activeSeconds + today.idleSeconds;
  const targetSeconds = (settings.work?.dailyTargetHours || 0) * 3600;

  const segments = total
    ? [
        { label: 'Active', value: today.activeSeconds, tone: 'accent' },
        { label: 'Idle', value: today.idleSeconds, tone: 'warn' },
      ]
    : [];

  const targetPercent = targetSeconds ? Math.min(100, Math.round((today.workSeconds / targetSeconds) * 100)) : null;

  return (
    <div className="metric-strip">
      <div className="segments">
        {segments.length === 0 ? (
          <div className="segment-empty">Nothing tracked yet today</div>
        ) : (
          segments.map((s) => (
            // Growth is capped to a small range so a 96%/4% split still leaves
            // the smaller pill wide enough to read its own label.
            <div className="segment" key={s.label} style={{ flexGrow: 1 + (s.value / total) * 3 }}>
              <span className="segment-label">{s.label}</span>
              <span className={`segment-bar ${s.tone}`}>{Math.round((s.value / total) * 100)}%</span>
            </div>
          ))
        )}

        {targetPercent !== null && (
          <div className="segment target">
            <span className="segment-label">Daily target</span>
            <span className="segment-bar hollow">
              <i style={{ width: `${targetPercent}%` }} />
              <b>{targetPercent}%</b>
            </span>
          </div>
        )}
      </div>

      <div className="figures">
        <Figure value={humanDuration(today.workSeconds)} label="Tracked today" />
        <Figure value={String(tasks.open.length)} label="Open tasks" />
        <Figure value={today.productivity === null ? '—' : `${today.productivity}%`} label="Productive" />
      </div>
    </div>
  );
}

function Figure({ value, label }) {
  return (
    <div className="figure">
      <strong className="mono">{value}</strong>
      <span>{label}</span>
    </div>
  );
}
