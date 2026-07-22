import { useCallback, useEffect, useState } from 'react';

/** Live tracker snapshot, pushed from the main process every second. */
export function useTrackerState() {
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    let alive = true;
    window.api.tracker.snapshot().then((s) => alive && setSnapshot(s));
    const off = window.api.tracker.onState(setSnapshot);
    return () => {
      alive = false;
      off();
    };
  }, []);

  return snapshot;
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
    return () => {
      alive = false;
      off();
    };
  }, []);

  const setStatus = useCallback(async (id, status) => setTasks(await window.api.tasks.setStatus(id, status)), []);
  const refresh = useCallback(async () => setTasks(await window.api.tasks.refresh()), []);
  return { ...tasks, setStatus, refresh };
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
  }, [refresh]);
  return [account, refresh];
}
