"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Eye, X } from "lucide-react";
import { now as serverNow } from "@/lib/clock";

function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// Enquanto a IA acompanha o candle atual até perto do fechamento (M1).
export default function CandleWatch({ pair, timeframe, releaseAt, startedAt, onCancel }) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(id);
  }, []);

  const progress = Math.min(1, Math.max(0, (now - startedAt) / (releaseAt - startedAt)));

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-neon/30 bg-void-deep/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-mist-faint">{pair} · {timeframe}</div>
          <div className="mt-1 flex items-center gap-2 font-display text-lg font-semibold text-mist">
            <Eye size={18} className="animate-pulse text-neon" /> IA lendo o candle atual
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-widest text-mist-faint">Sinal em</div>
          <div className="mt-1 font-mono text-3xl font-semibold tabular-nums text-mist">{mmss(releaseAt - now)}</div>
        </div>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-void-line">
        <div className="h-full rounded-full bg-gradient-to-r from-neon to-volt transition-[width] duration-200 ease-linear" style={{ width: `${progress * 100}%` }} />
      </div>

      <p className="mt-3 text-xs text-mist-dim">
        O sinal sai perto do fechamento do candle, quando a leitura é mais confiável. Deixe a corretora aberta: a entrada será logo em seguida.
      </p>

      <button onClick={onCancel} className="mt-3 flex items-center gap-1.5 text-xs text-mist-faint transition-colors hover:text-mist">
        <X size={13} /> Cancelar
      </button>
    </motion.div>
  );
}
