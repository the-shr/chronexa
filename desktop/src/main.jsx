import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.jsx';
import IdleWarning from './pages/IdleWarning.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { installMockApi } from './lib/mock-api.js';
import './styles.css';
import './layout.css';

// Opened in a plain browser rather than Electron: install the stand-in bridge
// so the UI can be worked on without launching the agent. Inside Electron the
// preload has already defined window.api and this does nothing.
//
// Imported statically on purpose -- a top-level `await import()` turns this
// entry into an async module, which Vite instantiates twice in dev and leaves
// two React roots fighting over #root.
if (!window.api) installMockApi();

// The same bundle serves both windows; ?view=idle selects the warning popup.
const view = new URLSearchParams(window.location.search).get('view');

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>{view === 'idle' ? <IdleWarning /> : <App />}</ErrorBoundary>
  </React.StrictMode>,
);
