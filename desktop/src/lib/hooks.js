import { useCallback, useEffect, useState } from 'react';

/**
 * Live tracker snapshot, pushed from the main process every second.
 * Returns the error too: without it a failed IPC call left the caller with a
 * null snapshot forever, which rendered as an empty window with no clue why.
 */
export function useTrackerState() {
  const [state, setState] = useState({ snapshot: null, error: null });

  useEffect(() => {
    let alive = true;
    window.api.tracker
      .snapshot()
      .then((s) => alive && setState({ snapshot: s, error: null }))
      .catch((err) => alive && setState({ snapshot: null, error: err }));
    const off = window.api.tracker.onState((s) => setState({ snapshot: s, error: null }));
    return () => {
      alive = false;
      off();
    };
  }, []);

  return state;
}

export function useSettings() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    let alive = true;
    window.api.settings.get().then((s) => alive && setSettings(s));
    const off = window.api.settings.onChange(setSettings);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const update = useCallback(async (patch) => setSettings(await window.api.settings.set(patch)), []);
  return [settings, update];
}

export function useTasks() {
  const [tasks, setTasks] = useState({ open: [], done: [], fetchedAt: null });

  useEffect(() => {
    let alive = true;
    window.api.tasks.list().then((t) => alive && setTasks(t));
    const off = window.api.tasks.onChange(setTasks);
    const refreshNow = () => window.api.tasks.refresh().then((t) => alive && setTasks(t)).catch(() => {});
    const id = setInterval(refreshNow, 30000);
    window.addEventListener('focus', refreshNow);
    refreshNow();
    return () => {
      alive = false;
      off();
      clearInterval(id);
      window.removeEventListener('focus', refreshNow);
    };
  }, []);

  const setStatus = useCallback(async (id, status, details) => setTasks(await window.api.tasks.setStatus(id, status, details)), []);
  const refresh = useCallback(async () => setTasks(await window.api.tasks.refresh()), []);
  const addComment = useCallback(async (id, body) => setTasks(await window.api.tasks.addComment(id, body)), []);
  return { ...tasks, setStatus, refresh, addComment };
}

/** Per-day active/idle totals for the bar chart and the calendar. */
export function useDailyTotals(days = 7) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = () => window.api.history.daily(days).then((r) => alive && setRows(r));
    load();
    // Cheap enough to re-read on a timer; the numbers move once a second.
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [days]);

  return rows;
}

export function useSessions(limit = 200) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = () => window.api.history.sessions({ limit }).then((r) => alive && setRows(r));
    load();
    const id = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [limit]);

  return rows;
}

/**
 * Theme lives in settings so it survives a restart, and is applied to <html>
 * as data-theme, which is what the stylesheet keys off.
 */
export function useTheme() {
  const [settings, update] = useSettings();
  const theme = settings?.general.theme || 'dark';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(
    () => update({ general: { theme: theme === 'dark' ? 'light' : 'dark' } }),
    [theme, update],
  );

  return [theme, toggle];
}

export function useAccount() {
  const [account, setAccount] = useState(null);
  const refresh = useCallback(() => window.api.account.get().then(setAccount), []);

  useEffect(() => {
    refresh();
    // Pushed the moment a request is refused, rather than waiting for a poll.
    const off = window.api.account.onChange(setAccount);
    return off;
  }, [refresh]);

  return [account, refresh];
}

export function useUpdateCheck() {
  const [state, setState] = useState(null);

  const check = useCallback(() => window.api.app.checkUpdate().then(setState), []);
  const open = useCallback((url) => window.api.app.openUpdate(url), []);

  useEffect(() => {
    let alive = true;
    const run = () => window.api.app.checkUpdate().then((result) => alive && setState(result)).catch(() => {});
    run();
    const id = setInterval(run, 6 * 60 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return { update: state, check, open };
}

/** The employee's own account: identity, picture, and the ways to change them. */
export function useProfile() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let alive = true;
    window.api.profile.get().then((p) => alive && setProfile(p));
    const off = window.api.profile.onChange(setProfile);
    // The cached copy renders instantly; this pulls anything changed elsewhere.
    window.api.profile.refresh().catch(() => {});
    return () => {
      alive = false;
      off();
    };
  }, []);

  const update = useCallback(async (patch) => {
    const next = await window.api.profile.update(patch);
    setProfile(next);
    return next;
  }, []);

  const changePassword = useCallback((body) => window.api.profile.changePassword(body), []);

  const pickAvatar = useCallback(async () => {
    const next = await window.api.profile.pickAvatar();
    if (next?.cancelled) throw new Error('No picture chosen.');
    setProfile(next);
    return next;
  }, []);

  const removeAvatar = useCallback(async () => {
    const next = await window.api.profile.removeAvatar();
    setProfile(next);
    return next;
  }, []);

  return { profile, update, changePassword, pickAvatar, removeAvatar };
}
