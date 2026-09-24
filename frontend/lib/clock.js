import { api } from "@/lib/api";

// Diferença (ms) entre o relógio do servidor e o do aparelho. Positivo = aparelho atrasado.
let offsetMs = 0;
let lastSync = 0;
let pending = null;

export function now() {
  return Date.now() + offsetMs;
}

export function clockOffset() {
  return offsetMs;
}

// Mede o relógio do servidor algumas vezes e fica com a medida de menor latência
// (a mais precisa), compensando metade do tempo de ida e volta da requisição.
export function syncClock({ samples = 4, force = false } = {}) {
  if (!force && Date.now() - lastSync < 5 * 60_000) return Promise.resolve(offsetMs);
  if (pending) return pending;
  pending = (async () => {
    let best = null;
    for (let i = 0; i < samples; i++) {
      try {
        const t0 = Date.now();
        const { now: server } = await api.serverTime();
        const t1 = Date.now();
        const rtt = t1 - t0;
        const offset = server + rtt / 2 - t1;
        if (!best || rtt < best.rtt) best = { rtt, offset };
      } catch {}
    }
    if (best) {
      offsetMs = Math.round(best.offset);
      lastSync = Date.now();
    }
    pending = null;
    return offsetMs;
  })();
  return pending;
}

// Mantém o relógio sincronizado enquanto o painel está aberto: a cada minuto e sempre
// que a aba volta a ficar visível (o relógio do aparelho pode ter mudado nesse meio-tempo).
// Devolve uma função para parar.
export function startClockSync(onSync, intervalMs = 60_000) {
  const run = () => syncClock({ force: true }).then((o) => onSync?.(o));
  const onVisible = () => { if (document.visibilityState === "visible") run(); };
  // Remove o ajuste manual de corretora que existiu numa versão anterior.
  try { window.localStorage.removeItem("tradeon_broker_offset"); } catch {}
  run();
  const id = setInterval(run, intervalMs);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", run);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", run);
  };
}
