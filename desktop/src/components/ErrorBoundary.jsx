import { Component } from 'react';

/**
 * A render error used to leave a blank window with no explanation, which is
 * indistinguishable from the app failing to start. Show what happened and
 * offer a reload instead.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Chronexa UI error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="fallback">
        <div className="fallback-card">
          <h1>Something went wrong</h1>
          <p>
            The dashboard could not be drawn. Your tracked time is safe — it is stored on this computer and syncs
            separately from the screen.
          </p>
          <pre>{String(this.state.error?.message || this.state.error)}</pre>
          <button className="btn primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
