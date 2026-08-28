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
const listeners = { tracker: [], settings: [], tasks: [], sync: [], profile: [], account: [] };

// ?configuration=1 previews the permission-gated configuration tab.
const canPreviewConfiguration = new URLSearchParams(window.location.search).get('configuration') === '1';

let mockAccount = {
  signedIn: true,
  sessionExpired: false,
  deviceName: 'DESIGN-PREVIEW',
  user: { name: 'Rahim Uddin', email: 'rahim@example.com', canManageTrackingPolicy: canPreviewConfiguration },
};

// Flip from the console to preview the signed-out banner:
//   window.__expireSession()
if (typeof window !== 'undefined') {
  window.__expireSession = () => {
    mockAccount = { ...mockAccount, signedIn: false, sessionExpired: true };
    emit('account', mockAccount);
  };
}

let mockProfile = {
  user: { id: 'u1', name: 'Rahim Uddin', email: 'rahim@example.com', role: 'employee', hasAvatar: false },
  fetchedAt: new Date().toISOString(),
  signedIn: true,
  deviceName: 'DESIGN-PREVIEW',
  avatar: null,
};

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
    { id: 't1', title: 'Finish the onboarding flow', description: 'Sign-up, email verification and the welcome screen.', status: 'open', priority: 'high', source: 'assigned', dueAt: new Date().toISOString(), estimateMinutes: 180 },
    { id: 't2', title: 'Review pull request #482', description: 'Payments refactor from the backend team.', status: 'open', priority: 'normal', source: 'assigned', dueAt: new Date(Date.now() + DAY).toISOString(), estimateMinutes: 45 },
    { id: 't3', title: 'Update the client proposal', description: '', status: 'open', priority: 'normal', source: 'self', dueAt: new Date(Date.now() - DAY).toISOString(), estimateMinutes: 90 },
    { id: 't4', title: 'Weekly team sync notes', description: 'Write up the actions from Monday.', status: 'open', priority: 'low', source: 'self', dueAt: new Date(Date.now() + 3 * DAY).toISOString(), estimateMinutes: 30 },
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
    profile: {
      get: async () => mockProfile,
      refresh: async () => mockProfile,
      update: async (patch) => {
        mockProfile = { ...mockProfile, user: { ...mockProfile.user, ...patch } };
        emit('profile', mockProfile);
        return mockProfile;
      },
      changePassword: async () => ({ ok: true, otherDevicesSignedOut: 1 }),
      pickAvatar: async () => mockProfile,
      removeAvatar: async () => {
        mockProfile = { ...mockProfile, avatar: null };
        emit('profile', mockProfile);
        return mockProfile;
      },
      onChange: (fn) => subscribe('profile', fn),
    },
    account: {
      get: async () => mockAccount,
      onChange: (fn) => subscribe('account', fn),
      login: async () => {
        mockAccount = { ...mockAccount, signedIn: true, sessionExpired: false };
        emit('account', mockAccount);
        return mockAccount.user;
      },
      logout: async () => true,
    },
    sync: {
      now: async () => ({ ok: true, pending: 0, at: new Date().toISOString() }),
      status: async () => ({ ok: true, pending: 0, at: new Date().toISOString(), signedIn: true }),
      onStatus: (fn) => subscribe('sync', fn),
    },
    configuration: {
      get: () => mockAdmin().policy(),
      update: (patch) => mockAdmin().updatePolicy(patch),
    },
    admin: mockAdmin(),
    window: { minimize: () => {}, close: () => {}, closeIdleWarning: () => {} },
    app: {
      version: async () => '1.0.6-preview',
      checkUpdate: async () => ({ available: false, currentVersion: '1.0.6-preview' }),
      openUpdate: async () => false,
      platform: 'browser',
    },
  };
}

/* ------------------------------ admin side ------------------------------ */

const MOCK_PEOPLE = [
  { name: 'Rahim Uddin', live: true, today: 19800, idle: 2400, task: 'Payments refactor' },
  { name: 'Nusrat Jahan', live: true, today: 16200, idle: 1500, task: 'Onboarding flow' },
  { name: 'Tanvir Hasan', live: false, today: 25200, idle: 3600, task: '' },
  { name: 'Farhana Akter', live: false, today: 12600, idle: 900, task: '' },
  { name: 'Imran Kabir', live: false, today: 0, idle: 0, task: '' },
  { name: 'Sadia Rahman', live: true, today: 8100, idle: 600, task: 'Design review' },
];

let mockAdminTasks = [
  { id: 'mt1', userId: 'p0', title: 'Ship the billing fix', status: 'open', priority: 'high', source: 'assigned', dueAt: iso(1), estimateMinutes: 90 },
  { id: 'mt2', userId: 'p1', title: 'Write the release notes', status: 'open', priority: 'normal', source: 'assigned', dueAt: iso(3), estimateMinutes: null },
  { id: 'mt3', userId: 'p2', title: 'Review pull request #482', status: 'open', priority: 'normal', source: 'assigned', dueAt: iso(-1), estimateMinutes: 45 },
  { id: 'mt4', userId: 'p0', title: 'Update the runbook', status: 'done', priority: 'low', source: 'self', dueAt: null, estimateMinutes: null },
];

function iso(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

function mockPerson(person, index) {
  const daily = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      date: d.toISOString().slice(0, 10),
      activeSeconds: i === 6 ? person.today : Math.round(person.today * (0.5 + ((index + i) % 5) / 6)),
      idleSeconds: person.idle,
    };
  });

  return {
    id: `p${index}`,
    name: person.name,
    email: `${person.name.split(' ')[0].toLowerCase()}@example.com`,
    hasAvatar: false,
    platform: 'win32',
    lastSeenAt: person.live ? new Date().toISOString() : iso(0),
    live: person.live,
    currentTask: person.task,
    todayActive: person.today,
    todayIdle: person.idle,
    weekActive: daily.reduce((s, d) => s + d.activeSeconds, 0),
    weekIdle: person.idle * 7,
    idleStops: index % 3,
    sessionsToday: person.today ? 2 : 0,
    tasksOpen: mockAdminTasks.filter((t) => t.userId === `p${index}` && t.status === 'open').length,
    tasksDone: mockAdminTasks.filter((t) => t.userId === `p${index}` && t.status === 'done').length,
    daily,
  };
}

function mockAdmin() {
  const people = MOCK_PEOPLE.map(mockPerson);
  const sum = (key) => people.reduce((total, p) => total + p[key], 0);

  return {
    overview: async () => ({
      generatedAt: new Date().toISOString(),
      days: 7,
      team: {
        headcount: people.length,
        tracking: people.filter((p) => p.live).length,
        todayActive: sum('todayActive'),
        todayIdle: sum('todayIdle'),
        weekActive: sum('weekActive'),
        weekIdle: sum('weekIdle'),
        tasksOpen: sum('tasksOpen'),
        tasksDone: sum('tasksDone'),
        idleStops: sum('idleStops'),
        daily: people[0].daily.map((_, i) => ({
          date: people[0].daily[i].date,
          activeSeconds: people.reduce((t, p) => t + p.daily[i].activeSeconds, 0),
          idleSeconds: people.reduce((t, p) => t + p.daily[i].idleSeconds, 0),
        })),
      },
      people,
    }),

    employees: async () => ({
      users: people.map((p) => ({ ...p, role: 'employee', active: true, joinedAt: iso(-90) })),
    }),

    employee: async (id) => {
      const person = people.find((p) => p.id === id) || people[0];
      return {
        user: { ...person, role: 'employee', active: true, joinedAt: iso(-90) },
        sessions: Array.from({ length: 9 }, (_, i) => ({
          id: `s${i}`,
          startedAt: iso(-i),
          endedAt: i === 0 && person.live ? null : iso(-i),
          activeSeconds: 7200 - i * 400,
          idleSeconds: 600,
          stopReason: i % 4 === 0 ? 'idle-timeout' : 'manual',
          note: i % 2 ? 'Feature work' : '',
          screenshotCount: 0,
          taskTitle: null,
        })),
        tasks: mockAdminTasks.filter((t) => t.userId === person.id),
        screenshots: [],
        devices: [{ id: 'd1', name: 'WORK-LAPTOP', platform: 'win32', lastSeenAt: new Date().toISOString() }],
      };
    },

    tasks: async ({ userId = '', status = 'all' } = {}) => ({
      tasks: mockAdminTasks.filter(
        (t) => (!userId || t.userId === userId) && (status === 'all' || t.status === status),
      ),
    }),

    taskOptions: async () => ({
      users: people.map((p) => ({ id: p.id, name: p.name, email: `${p.name.split(' ')[0].toLowerCase()}@brandmacros.com` })),
      clients: [{ id: 'c1', name: 'Brand Macros' }],
      projects: [{ id: 'pr1', name: 'Internal OS', clientId: 'c1' }],
      parents: mockAdminTasks.filter((t) => !t.parentId).map((t) => ({ id: t.id, title: t.title, projectId: 'pr1', clientId: 'c1' })),
      priorities: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      source: 'mock',
    }),

    assignTask: async (payload) => {
      const task = { ...payload, userId: payload.assigneeId || payload.userId, id: `mt${Date.now()}`, status: 'open', source: 'assigned' };
      mockAdminTasks = [task, ...mockAdminTasks];
      return { task };
    },

    updateTask: async ({ id, moveTo, ...patch }) => {
      mockAdminTasks = mockAdminTasks.map((t) =>
        t.id === id ? { ...t, ...patch, ...(moveTo ? { userId: moveTo } : {}) } : t,
      );
      return { task: mockAdminTasks.find((t) => t.id === id) };
    },

    deleteTask: async (id) => {
      mockAdminTasks = mockAdminTasks.filter((t) => t.id !== id);
      return { ok: true };
    },

    addEmployee: async () => ({ user: { id: 'new', name: 'New Hire' } }),
    updateEmployee: async () => ({ ok: true }),

    screenshots: async ({ limit = 60 } = {}) => ({
      screenshots: Array.from({ length: Math.min(limit, 14) }, (_, i) => ({
        id: `shot${i}`,
        userId: `p${i % people.length}`,
        name: people[i % people.length].name,
        capturedAt: new Date(Date.now() - i * 6 * 60000).toISOString(),
        monitorLabel: 'Display 1',
        activityPercent: 40 + ((i * 7) % 55),
      })),
    }),

    policy: async () => ({
      policy: {
        id: 'org',
        officeStart: '09:00', officeEnd: '17:30', workDays: '1,2,3,4,5',
        dailyTargetHours: 8, weeklyTargetHours: 40,
        idleThresholdMinutes: 5, idleOnTimeout: 'pause', countIdleAsWork: false,
        screenshotsEnabled: true, screenshotIntervalMinutes: 10, screenshotRandomize: true,
        screenshotQuality: 60, screenshotAllMonitors: true, screenshotBlur: false,
        recordingEnabled: false, recordingMode: 'interval', recordingIntervalMinutes: 3,
        recordingDurationSeconds: 5, recordingSegmentMinutes: 5, recordingMaxWidth: 1280, recordingFrameRate: 12,
        updatedAt: new Date().toISOString(),
      },
      employees: people.map((p) => ({ id: p.id, name: p.name, email: p.email, overrides: null })),
      estimatedDailyBytes: 0,
    }),
    updatePolicy: async () => ({ ok: true }),

    deleteScreenshot: async () => ({ ok: true }),

    recordings: async ({ limit = 60 } = {}) => ({
      configured: true,
      recordings: Array.from({ length: Math.min(limit, 9) }, (_, i) => ({
        id: `clip${i}`,
        userId: `p${i % people.length}`,
        name: people[i % people.length].name,
        startedAt: new Date(Date.now() - i * 11 * 60000).toISOString(),
        durationMs: 5000,
        bytes: 90_000 + ((i * 7331) % 60_000),
        driveFileId: `drive-${i}`,
      })),
    }),

    deleteRecording: async () => ({ ok: true }),

    // No bytes in the preview; the player shows its own empty state.
    clip: async () => null,

    // No bytes in the preview: the placeholder shimmer is the point.
    image: async () => null,
  };
}

function subscribe(channel, fn) {
  listeners[channel].push(fn);
  return () => {
    listeners[channel] = listeners[channel].filter((f) => f !== fn);
  };
}
