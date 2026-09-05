import { useEffect, useRef, useState } from "react";

export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = () => {
    fetcher()
      .then((d) => { setData(d); setError(null); setLoading(false); })
      .catch((e) => { setError(e.message || "Failed to load"); setLoading(false); });
  };

  useEffect(() => {
    setLoading(true);
    refresh();
    if (intervalMs > 0) {
      timer.current = setInterval(refresh, intervalMs);
      return () => { if (timer.current) clearInterval(timer.current); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, refresh };
}
