"use client";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, PauseCircle, RefreshCw } from "lucide-react";
import CandleTimer from "./CandleTimer";

const CONF_STYLE = {
  Alta: "border-neon/40 bg-neon/10 text-neon",
  "Média": "border-volt/40 bg-volt/10 text-volt-soft",
  Baixa: "border-pulse/40 bg-pulse/10 text-pulse-soft"
};

export default function SignalResult({ result, timing, onRetry }) {
  if (result.noEntry) {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-void-line bg-void-deep/70 p-6">
        <div className="font-mono text-xs uppercase tracking-widest text-mist-dim">{result.pair} · {result.timeframe}</div>
        <div className="mt-2 flex items-center gap-2 font-display text-2xl font-bold text-mist">
          <PauseCircle size={26} className="text-volt" /> Sem entrada agora
        </div>
        <p className="mt-2 text-sm text-mist-dim">{result.reason || "Sem um sinal confiável neste candle."}</p>
        {onRetry && (
          <button onClick={onRetry} className="btn-ghost mt-4 w-full !py-3">
            <RefreshCw size={15} /> Analisar o próximo candle
          </button>
        )}
      </motion.div>
    );
  }

  const buy = result.direction === "COMPRA";

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="space-y-4">
      <div className={`relative overflow-hidden rounded-2xl border p-6 ${buy ? "border-neon/40 bg-gradient-to-br from-neon/15 to-transparent" : "border-ember/40 bg-gradient-to-br from-ember/15 to-transparent"}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-mist-dim">{result.pair} · {result.timeframe}</div>
            <div className={`mt-2 flex items-center gap-2 font-display text-4xl font-bold ${buy ? "text-neon" : "text-ember"}`}>
              {buy ? <ArrowUpRight size={36} /> : <ArrowDownRight size={36} />}
              {result.direction}
            </div>
          </div>
          <span className={`rounded-full border px-3 py-1 font-mono text-xs ${CONF_STYLE[result.confidence] || CONF_STYLE["Média"]}`}>
            Confiança {result.confidence}
          </span>
        </div>
      </div>

      {timing && <CandleTimer direction={result.direction} timeframe={result.timeframe} {...timing} />}

      {result.candlePatterns?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {result.candlePatterns.map((p) => (
            <span key={p} className="rounded-full border border-void-line bg-void-deep/60 px-3 py-1 text-xs text-mist-dim">{p}</span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
