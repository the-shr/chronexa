import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Admin reads are plain fetches on a timer rather than pushed over IPC: the
 * numbers come from the server, not from this machine, so there is nothing
 * local to subscribe to.
 *
 * Every hook returns { data, error, loading, reload } so a failed request shows
 * a reason instead of an empty card.
 */
function usePolled(fn, { interval = 20000, deps = [], enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  // Keeps the callback fresh without restarting the timer on every render.
  const latest = useRef(fn);
  latest.current = fn;

  const load = useCallback(async () => {
    try {
      const data = await latest.current();
      setState({ data, error: null, loading: false });
      return data;
    } catch (err) {
      setState((prev) => ({ data: prev.data, error: err, loading: false }));
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const run = () => alive && load();
    run();
    const id = setInterval(run, interval);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, interval, enabled]);

  return { ...state, reload: load };
}

export function useOverview(days = 7) {
  return usePolled(() => window.api.admin.overview(days), { interval: 15000, deps: [days] });
}

export function useRoster() {
  const polled = usePolled(() => window.api.admin.employees(), { interval: 60000 });

  const add = useCallback(
    async (payload) => {
      const result = await window.api.admin.addEmployee(payload);
      await polled.reload();
      return result;
    },
    [polled],
  );

  const update = useCallback(
    async (payload) => {
      const result = await window.api.admin.updateEmployee(payload);
      await polled.reload();
      return result;
    },
    [polled],
  );

  return { ...polled, users: polled.data?.users || [], add, update };
}

export function useEmployee(id) {
  return usePolled(() => window.api.admin.employee(id), { interval: 20000, deps: [id], enabled: Boolean(id) });
}

export function useAdminTasks({ userId = '', status = 'all' } = {}) {
  const polled = usePolled(() => window.api.admin.tasks({ userId, status }), {
    interval: 30000,
    deps: [userId, status],
  });

  const wrap = (fn) => async (...args) => {
    const result = await fn(...args);
    await polled.reload();
    return result;
  };

  return {
    ...polled,
    tasks: polled.data?.tasks || [],
    assign: wrap((payload) => window.api.admin.assignTask(payload)),
    update: wrap((payload) => window.api.admin.updateTask(payload)),
    remove: wrap((id) => window.api.admin.deleteTask(id)),
  };
}

export function useScreenshots({ userId = '', limit = 60 } = {}) {
  const polled = usePolled(() => window.api.admin.screenshots({ userId, limit }), {
    interval: 30000,
    deps: [userId, limit],
  });

  const remove = useCallback(
    async (id) => {
      const result = await window.api.admin.deleteScreenshot(id);
      await polled.reload();
      return result;
    },
    [polled],
  );

  return { ...polled, screenshots: polled.data?.screenshots || [], remove };
}

export function useRecordings({ userId = '', limit = 60 } = {}) {
  const polled = usePolled(() => window.api.admin.recordings({ userId, limit }), {
    interval: 30000,
    deps: [userId, limit],
  });

  const remove = useCallback(
    async (id) => {
      const result = await window.api.admin.deleteRecording(id);
      await polled.reload();
      return result;
    },
    [polled],
  );

  return {
    ...polled,
    recordings: polled.data?.recordings || [],
    // False when the server has no Drive set up, so the page can say why it is
    // empty instead of implying nobody has been recorded.
    configured: polled.data?.configured !== false,
    remove,
  };
}

/** One clip's bytes as a data URL, fetched only when it is actually played. */
export function useClip(id) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!id) return undefined;
    setLoading(true);
    window.api.admin
      .clip(id)
      .then((next) => alive && setUrl(next))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  return { url, loading };
}

/**
 * Loads one capture's bytes on demand. The main process holds the token and
 * hands back a data URL, so nothing about storage reaches the renderer.
 */
export function useImage(id) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!id) return undefined;
    window.api.admin
      .image(id)
      .then((next) => alive && setUrl(next))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  return url;
}
