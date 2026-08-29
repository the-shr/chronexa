import { useCallback, useEffect, useState } from 'react';

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
    setData((current) => current ? { ...current, ...result, policy: result.policy || current.policy } : current);
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
