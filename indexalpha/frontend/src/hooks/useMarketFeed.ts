import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "../types";

interface Feed {
  data: Snapshot | null;
  error: string | null;
  lastUpdate: Date | null;
  refreshThesis: () => Promise<void>;
}

/** Busca o snapshot do backend a cada `intervalMs` (o simulador gera um tick a cada 5 s). */
export function useMarketFeed(intervalMs = 5000): Feed {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const res = await fetch("/api/snapshot", { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as Snapshot);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError("Backend indisponível — tentando reconectar…");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), intervalMs);
    return () => {
      window.clearInterval(id);
      inFlight.current?.abort();
    };
  }, [load, intervalMs]);

  const refreshThesis = useCallback(async () => {
    await fetch("/api/thesis/refresh", { method: "POST" });
  }, []);

  return { data, error, lastUpdate, refreshThesis };
}
