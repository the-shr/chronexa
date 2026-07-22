import { humanDuration, weekdayShort, isSameDay } from '../lib/format.js';

/**
 * Stacked active/idle bars for the last seven days. Scaled against the busiest
 * day rather than a fixed target, so a light week still reads clearly.
 */
export default function WeekChart({ rows }) {
  if (!rows.length) return <p className="empty">No activity yet.</p>;

  const peak = Math.max(...rows.map((r) => r.activeSeconds + r.idleSeconds), 3600);

  return (
    <div className="bars">
      {rows.map((row) => {
        const total = row.activeSeconds + row.idleSeconds;
        const today = isSameDay(row.date, new Date());
        return (
          <div className={today ? 'bar-col is-today' : 'bar-col'} key={row.date}>
            <div
              className="bar-stack"
              title={`${humanDuration(row.activeSeconds)} active · ${humanDuration(row.idleSeconds)} idle`}
            >
              {total === 0 ? (
                <div className="bar-empty" />
              ) : (
                <>
                  {row.idleSeconds > 0 && (
                    <div className="bar-seg idle" style={{ height: `${(row.idleSeconds / peak) * 100}%` }} />
                  )}
                  {row.activeSeconds > 0 && (
                    <div className="bar-seg active" style={{ height: `${(row.activeSeconds / peak) * 100}%` }} />
                  )}
                </>
              )}
            </div>
            <span>{weekdayShort(row.date)}</span>
          </div>
        );
      })}
    </div>
  );
}
