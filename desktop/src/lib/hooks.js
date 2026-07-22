import { useEffect, useState } from 'react';

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

  const update = async (patch) => setSettings(await window.api.settings.set(patch));
  return [settings, update];
}

export function useSyncStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let alive = true;
    window.api.sync.status().then((s) => alive && setStatus(s));
    const off = window.api.sync.onStatus(setStatus);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return [status, setStatus];
}
