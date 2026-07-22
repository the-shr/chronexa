/** Small pieces shared across the admin pages. */

export function Avatar({ name, live = false, size = 34 }) {
  return (
    <span className={live ? 'admin-avatar live' : 'admin-avatar'} style={{ '--size': `${size}px` }}>
      {initials(name)}
    </span>
  );
}

export function LiveDot() {
  return <i className="live-dot" aria-label="Tracking now" />;
}

/** A failed request should say what went wrong and offer a way out. */
export function LoadError({ error, onRetry }) {
  return (
    <div className="load-error">
      <p>{String(error?.message || error || 'Something went wrong.')}</p>
      {onRetry && (
        <button className="btn primary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Pill({ children, tone = '' }) {
  return <span className={tone ? `pill ${tone}` : 'pill'}>{children}</span>;
}

export function initials(name) {
  return String(name || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}
