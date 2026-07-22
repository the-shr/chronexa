/**
 * Stand-in for the preload bridge, used only when the UI is opened in a plain
 * browser (`npm run dev:vite` without Electron). It lets the dashboard be
 * designed and reviewed without launching the agent, and is never bundled into
 * a build that runs inside Electron because window.api already exists there.
 *
 * The data is shaped exactly like the real IPC responses -- if these two ever
 * drift, the mock is wrong, not the app.
 */

const DAY = 86400000;
const listeners = { tracker: [], settings: [], tasks: [], sync: [] };

// Mirrors settings.publicView() exactly -- the renderer never sees more than
// this, so neither does the mock.
let settings = {
  general: { theme: 'dark', launchOnLogin: false, startTrackingOnLaunch: false, minimizeToTray: true },
  work: { dailyTargetHours: 8, weeklyTargetHours: 40 },
  idle: { enabled: true, thresholdMinutes: 5, onTimeout: 'pause', countIdleAsWork: false },
};

let state = 'running';
let idlePhase = 'active';
let session = {
  id: 'mock-session',
  startedAt: new Date(Date.now() - 4520000).toISOString(),
  activeSeconds: 4210,
  idleSeconds: 310,
  taskId: 't1',
  taskNote: 'Finish the onboarding flow',
};

let tasks = {
  open: [
    { id: 't1', title: 'Finish the onboarding flow', description: 'Sign-up, email verification and the welcome screen.', status: 'open', priority: 'high', dueAt: new Date().toISOString(), estimateMinutes: 180 },
    { id: 't2', title: 'Review pull request #482', description: 'Payments refactor from the backend team.', status: 'open', priority: 'normal', dueAt: new Date(Date.now() + DAY).toISOString(), estimateMinutes: 45 },
    { id: 't3', title: 'Update the client proposal', description: '', status: 'open', priority: 'normal', dueAt: new Date(Date.now() - DAY).toISOString(), estimateMinutes: 90 },
    { id: 't4', title: 'Weekly team sync notes', description: 'Write up the actions from Monday.', status: 'open', priority: 'low', dueAt: new Date(Date.now() + 3 * DAY).toISOString(), estimateMinutes: 30 },
  ],
  done: [{ id: 't5', title: 'Fix the dashboard chart legend', description: '', status: 'done', priority: 'normal', dueAt: null, completedAt: new Date().toISOString() }],
  fetchedAt: new Date().toISOString(),
  error: null,
};

const daily = Array.from({ length: 90 }, (_, i) => {
  const date = new Date(Date.now() - (89 - i) * DAY);
  const weekend = [0, 6].includes(date.getDay());
  const active = weekend ? 0 : 14400 + Math.round(Math.sin(i) * 5400) + Math.round(Math.random() * 3600);
  return { date: date.toISOString(), activeSeconds: Math.max(0, active), idleSeconds: weekend ? 0 : 600 + Math.round(Math.random() * 2400) };
});

const sessions = daily
  .slice(-30)
  .filter((d) => d.activeSeconds > 0)
  .flatMap((d, i) => {
    const start = new Date(d.date);
    start.setHours(9, 15, 0, 0);
    return [0, 1].map((b) => ({
      id: `s${i}-${b}`,
      startedAt: new Date(start.getTime() + b * 3 * 3600000).toISOString(),
      endedAt: new Date(start.getTime() + b * 3 * 3600000 + d.activeSeconds * 500).toISOString(),
      activeSeconds: Math.round(d.activeSeconds / 2),
      idleSeconds: Math.round(d.idleSeconds / 2),
      taskNote: ['Onboarding flow', 'Code review'][b],
      stopReason: b === 0 ? 'manual' : 'idle-timeout',
    }));
  })
  .reverse();

function todayTotals() {
  const today = daily[daily.length - 1];
  const activeSeconds = today.activeSeconds + session?.activeSeconds || 0;
  const idleSeconds = today.idleSeconds + (session?.idleSeconds || 0);
  return {
    activeSeconds,
    idleSeconds,
    workSeconds: activeSeconds + (settings.idle.countIdleAsWork ? idleSeconds : 0),
    productivity: Math.round((activeSeconds / (activeSeconds + idleSeconds)) * 100),
  };
}

const snapshot = () => ({ state, idlePhase, session, today: todayTotals(), systemIdleSeconds: 2, warningRemainingSeconds: null });
const emit = (channel, payload) => listeners[channel].forEach((fn) => fn(payload));

// The live clock is what makes the ring and the timer feel real while designing.
setInterval(() => {
  if (state === 'running' && idlePhase === 'active') session.activeSeconds += 1;
  emit('tracker', snapshot());
}, 1000);

export function installMockApi() {
  window.api = {
    tracker: {
      start: async ({ taskId, taskNote } = {}) => {
        state = 'running';
        idlePhase = 'active';
        session = { id: `mock-${Date.now()}`, startedAt: new Date().toISOString(), activeSeconds: 0, idleSeconds: 0, taskId: taskId ?? null, taskNote: taskNote ?? '' };
        emit('tracker', snapshot());
        return snapshot();
      },
      pause: async () => {
        state = 'paused';
        emit('tracker', snapshot());
        return snapshot();
      },
      resume: async () => {
        state = 'running';
        emit('tracker', snapshot());
        return snapshot();
      },
      stop: async () => {
        state = 'stopped';
        session = null;
        emit('tracker', snapshot());
        return snapshot();
      },
      snapshot: async () => snapshot(),
      acknowledgeIdle: async () => snapshot(),
      onState: (fn) => subscribe('tracker', fn),
      onIdleWarning: (fn) => subscribe('tracker', fn),
      onIdleWarningClose: (fn) => subscribe('tracker', fn),
    },
    settings: {
      get: async () => settings,
      set: async (patch) => {
        // Like the real handler, only the employee's own group is applied.
        const allowed = Object.entries(patch || {}).filter(([group]) => group === 'general');
        settings = { ...settings, ...Object.fromEntries(allowed.map(([k, v]) => [k, { ...settings[k], ...v }])) };
        emit('settings', settings);
        return settings;
      },
      onChange: (fn) => subscribe('settings', fn),
    },
    history: {
      sessions: async () => sessions,
      daily: async (days) => daily.slice(-days),
    },
    tasks: {
      list: async () => tasks,
      refresh: async () => tasks,
      setStatus: async (id, status) => {
        const from = status === 'done' ? 'open' : 'done';
        const to = status === 'done' ? 'done' : 'open';
        const i = tasks[from].findIndex((t) => t.id === id);
        if (i !== -1) {
          const [task] = tasks[from].splice(i, 1);
          tasks[to] = [{ ...task, status }, ...tasks[to]];
          tasks = { ...tasks };
        }
        emit('tasks', tasks);
        return tasks;
      },
      onChange: (fn) => subscribe('tasks', fn),
    },
    account: {
      get: async () => ({ signedIn: true, deviceName: 'DESIGN-PREVIEW', user: { name: 'Rahim Uddin', email: 'rahim@example.com' } }),
      login: async () => ({ name: 'Rahim Uddin' }),
      logout: async () => true,
    },
    sync: {
      now: async () => ({ ok: true, pending: 0, at: new Date().toISOString() }),
      status: async () => ({ ok: true, pending: 0, at: new Date().toISOString(), signedIn: true }),
      onStatus: (fn) => subscribe('sync', fn),
    },
    window: { minimize: () => {}, close: () => {}, closeIdleWarning: () => {} },
    app: { version: async () => '0.1.0-preview', platform: 'browser' },
  };
}

function subscribe(channel, fn) {
  listeners[channel].push(fn);
  return () => {
    listeners[channel] = listeners[channel].filter((f) => f !== fn);
  };
}
