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
