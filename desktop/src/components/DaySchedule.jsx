import { clockTime, humanDuration } from '../lib/format.js';

const START_HOUR = 8;
const END_HOUR = 20;

/**
 * Today's sessions laid out on an hour rail, in place of the reference's
 * meeting calendar. Sessions are what this app actually has to put on a
 * timeline, and seeing the shape of the day is the useful part.
 */
export default function DaySchedule({ sessions }) {
  const today = new Date();
  const isToday = (iso) => new Date(iso).toDateString() === today.toDateString();
  const rows = sessions.filter((s) => isToday(s.startedAt));

  const span = (END_HOUR - START_HOUR) * 3600;
  const offsetOf = (iso) => {
    const d = new Date(iso);
    return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() - START_HOUR * 3600;
  };

  const hours = [];
  for (let h = START_HOUR; h <= END_HOUR; h += 2) hours.push(h);

  return (
    <section className="card schedule-card">
      <h2>
        Today
        <span className="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {rows.length ? `${rows.length} session${rows.length === 1 ? '' : 's'}` : 'no sessions yet'}
        </span>
      </h2>

      <div className="schedule">
        <div className="schedule-rail">
          {hours.map((h) => (
            <span key={h} style={{ left: `${(((h - START_HOUR) * 3600) / span) * 100}%` }}>
              {String(h % 12 === 0 ? 12 : h % 12)}
              {h < 12 ? 'am' : 'pm'}
            </span>
          ))}
        </div>

        <div className="schedule-track">
          {hours.map((h) => (
            <i key={h} style={{ left: `${(((h - START_HOUR) * 3600) / span) * 100}%` }} />
          ))}

          {rows.map((s) => {
            const start = Math.max(0, offsetOf(s.startedAt));
            const end = s.endedAt ? offsetOf(s.endedAt) : offsetOf(new Date().toISOString());
            const width = Math.max(0.8, ((Math.min(end, span) - start) / span) * 100);
            if (start > span) return null;
            return (
              <div
                key={s.id}
                className={s.endedAt ? 'schedule-block' : 'schedule-block live'}
                style={{ left: `${(start / span) * 100}%`, width: `${width}%` }}
                title={`${clockTime(s.startedAt)} – ${s.endedAt ? clockTime(s.endedAt) : 'now'} · ${humanDuration(s.activeSeconds)}`}
              >
                <span className="truncate">{s.taskNote || 'Tracked time'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
