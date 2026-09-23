"use client";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import CandleTimer from "./CandleTimer";
import { assetDigits } from "@/lib/assets";

function fmt(n, digits = 5) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toFixed(digits);
}

const CONF_STYLE = {
  Alta: "border-neon/40 bg-neon/10 text-neon",
  "Média": "border-volt/40 bg-volt/10 text-volt-soft",
  Baixa: "border-pulse/40 bg-pulse/10 text-pulse-soft"
};

export default function SignalResult({ result, timing }) {
  const buy = result.direction === "COMPRA";
  const digits = assetDigits(result.pair);
  const c5 = result.chinesa5Candles;

  const rows = [
    { k: "Preço", v: fmt(result.price, digits) },
    { k: "EMA 9", v: fmt(result.ema9, digits) },
    { k: "EMA 21", v: fmt(result.ema21, digits) },
    { k: "RSI 14", v: fmt(result.rsi, 1) },
    { k: "MACD hist.", v: fmt(result.macdHistogram, digits) }
  ];

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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {rows.map((r) => (
          <div key={r.k} className="rounded-xl border border-void-line bg-void-deep/60 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-mist-faint">{r.k}</div>
            <div className="mt-1 font-mono text-sm text-mist">{r.v}</div>
          </div>
        ))}
      </div>

      {c5 && (
        <div className="rounded-xl border border-void-line bg-void-deep/60 p-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-mist-faint">Últimos 5 candles</div>
          <div className="mt-3 flex items-center gap-4">
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={`h-7 w-2.5 rounded-sm ${i < c5.bullCount ? "bg-neon" : i < c5.bullCount + c5.bearCount ? "bg-ember" : "bg-void-line"}`} />
              ))}
            </div>
            <div className="text-sm text-mist-dim">
              <span className="text-neon">{c5.bullCount} alta</span> · <span className="text-ember-soft">{c5.bearCount} baixa</span>
              {c5.volatilidadeAlta && <span className="ml-2 rounded bg-pulse/15 px-1.5 py-0.5 text-xs text-pulse-soft">volatilidade alta</span>}
              {c5.volatilidadeBaixa && <span className="ml-2 rounded bg-volt/15 px-1.5 py-0.5 text-xs text-volt-soft">volatilidade baixa</span>}
            </div>
          </div>
        </div>
      )}

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
