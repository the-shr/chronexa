import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.jsx';
import IdleWarning from './pages/IdleWarning.jsx';
import './styles.css';

// The same bundle serves both windows; ?view=idle selects the warning popup.
const view = new URLSearchParams(window.location.search).get('view');

createRoot(document.getElementById('root')).render(
  <React.StrictMode>{view === 'idle' ? <IdleWarning /> : <App />}</React.StrictMode>,
);
