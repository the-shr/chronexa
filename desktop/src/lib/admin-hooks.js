import { useCallback, useEffect, useRef, useState } from 'react';

export function usePolicy() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await window.api.configuration.get()); setError(null); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    reload();
    const id = setInterval(reload, 60000);
    return () => clearInterval(id);
  }, [reload]);

  const save = useCallback(async (patch) => {
    const result = await window.api.configuration.update(patch);
    setData((current) => {
      if (!current) return current;
      if (result.user) return { ...current, employees: current.employees.map((employee) => employee.id === result.user.id ? { ...employee, ...result.user } : employee) };
      return { ...current, ...result, policy: result.policy || current.policy };
    });
    return result;
  }, []);

  return {
    data,
    error,
    loading,
    reload,
    policy: data?.policy || null,
    employees: data?.employees || [],
    estimatedDailyBytes: data?.estimatedDailyBytes || 0,
    save,
  };
}

function useAdminRead(loader, deps = [], enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  const reload = useCallback(async () => {
    if (!enabled) return;
    const id = ++request.current;
    setLoading(true);
    setData(null);
    try {
      const next = await loader();
      if (id === request.current) { setData(next); setError(null); }
    } catch (err) {
      if (id === request.current) setError(err);
    } finally {
      if (id === request.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);
  useEffect(() => {
    if (enabled) reload();
    else setLoading(false);
  }, [enabled, reload]);
  return { data, error, loading, reload };
}

export function useRoster() {
  const result = useAdminRead(() => window.api.admin.employees());
  return { ...result, users: result.data?.users || [] };
}

export function useEmployee(id) {
  return useAdminRead(() => window.api.admin.employee(id), [id], Boolean(id));
}

export function useScreenshots(userId, page = 1, enabled = true) {
  const result = useAdminRead(() => window.api.admin.screenshots({ userId, page, pageSize: 24 }), [userId, page], Boolean(userId) && enabled);
  return { ...result, rows: result.data?.screenshots || [], total: result.data?.total || 0, pageSize: result.data?.pageSize || 24 };
}

export function useRecordings(userId, enabled = true) {
  const result = useAdminRead(() => window.api.admin.recordings({ userId, limit: 80 }), [userId], Boolean(userId) && enabled);
  return { ...result, rows: result.data?.recordings || [] };
}

export function useImage(id) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let live = true; window.api.admin.image(id).then((value) => live && setUrl(value)).catch(() => live && setUrl(null)); return () => { live = false; }; }, [id]);
  return url;
}

export function useClip(id) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let live = true; if (id) window.api.admin.clip(id).then((value) => live && setUrl(value)).catch(() => live && setUrl(null)); return () => { live = false; }; }, [id]);
  return url;
}
