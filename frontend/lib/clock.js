import { api } from "@/lib/api";

// Diferença (ms) entre o relógio do servidor e o do aparelho. Positivo = aparelho atrasado.
let offsetMs = 0;
let lastSync = 0;
let pending = null;

// Ajuste manual para o relógio da corretora (ms). Positivo = corretora adiantada.
// Fica salvo neste aparelho; com ele, contagens e entradas seguem o relógio da corretora.
export const MAX_BROKER_OFFSET_MS = 10_000;
const BROKER_KEY = "tradeon_broker_offset";
let brokerOffsetMs = 0;
try {
  const saved = typeof window !== "undefined" ? Number(window.localStorage.getItem(BROKER_KEY)) : 0;
  if (Number.isFinite(saved)) brokerOffsetMs = Math.max(-MAX_BROKER_OFFSET_MS, Math.min(MAX_BROKER_OFFSET_MS, saved));
} catch {}

export function brokerOffset() {
  return brokerOffsetMs;
}

export function setBrokerOffset(ms) {
  brokerOffsetMs = Math.max(-MAX_BROKER_OFFSET_MS, Math.min(MAX_BROKER_OFFSET_MS, Math.round(ms)));
  try { window.localStorage.setItem(BROKER_KEY, String(brokerOffsetMs)); } catch {}
  return brokerOffsetMs;
}

// Horário da corretora: relógio do servidor + ajuste da corretora.
export function now() {
  return Date.now() + offsetMs + brokerOffsetMs;
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
