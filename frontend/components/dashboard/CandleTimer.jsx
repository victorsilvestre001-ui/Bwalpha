"use client";
import { useEffect, useMemo, useState } from "react";
import { Timer, CheckCircle2 } from "lucide-react";
import { now as serverNow } from "@/lib/clock";

const TF_MS = { M1: 60_000, M5: 300_000 };
// Se faltar menos que isso para o próximo candle abrir, a entrada vai para o candle seguinte
// (não dá tempo de abrir a operação).
const MIN_LEAD_MS = 10_000;

export function computeEntry(timeframe, fromMs) {
  const tf = TF_MS[timeframe] || TF_MS.M1;
  let entry = Math.ceil((fromMs + 1) / tf) * tf;
  if (entry - fromMs < MIN_LEAD_MS) entry += tf;
  return { entry, expiry: entry + tf };
}

function hhmmss(ms) {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function CandleTimer({ direction, timeframe, requestedAt, entry, expiry }) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(id);
  }, []);

  const buy = direction === "COMPRA";
  const phase = now < entry ? "waiting" : now < expiry ? "running" : "done";

  const { label, value, progress } = useMemo(() => {
    if (phase === "waiting") {
      return { label: "Entrada em", value: mmss(entry - now), progress: (now - requestedAt) / (entry - requestedAt) };
    }
    if (phase === "running") {
      return { label: "Candle fecha em", value: mmss(expiry - now), progress: (now - entry) / (expiry - entry) };
    }
    return { label: "Candle encerrado", value: "00:00", progress: 1 };
  }, [phase, now, entry, expiry, requestedAt]);

  const accent = buy ? "text-neon" : "text-ember";
  const bar = buy ? "from-neon to-volt" : "from-ember to-pulse";

  return (
    <div className="rounded-2xl border border-void-line bg-void-deep/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-mist-faint">Próximo candle ({timeframe})</div>
          <div className={`mt-1 font-display text-2xl font-bold ${accent}`}>{direction}</div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5 font-mono text-[10px] uppercase tracking-widest text-mist-faint">
            {phase === "done" ? <CheckCircle2 size={12} /> : <Timer size={12} />} {label}
          </div>
          <div className={`mt-1 font-mono text-3xl font-semibold tabular-nums ${phase === "done" ? "text-mist-faint" : "text-mist"}`}>{value}</div>
        </div>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-void-line">
        <div className={`h-full rounded-full bg-gradient-to-r ${bar} transition-[width] duration-200 ease-linear`} style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          { k: "Pedido", v: hhmmss(requestedAt), on: true },
          { k: "Entrada", v: hhmmss(entry), on: phase !== "waiting" },
          { k: "Expiração", v: hhmmss(expiry), on: phase === "done" }
        ].map((s) => (
          <div key={s.k} className={`rounded-lg border px-2 py-2 ${s.on ? "border-void-line bg-void-card" : "border-void-line/60"}`}>
            <div className="font-mono text-[10px] uppercase tracking-wider text-mist-faint">{s.k}</div>
            <div className="mt-0.5 font-mono text-sm text-mist">{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
