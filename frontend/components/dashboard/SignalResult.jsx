"use client";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, PauseCircle, RefreshCw } from "lucide-react";
import CandleTimer from "./CandleTimer";


// Barra de pressão: compradores (verde) x vendedores (vermelho) nos últimos candles.
function PressureBar({ pressao }) {
  if (!pressao) return null;
  return (
    <div className="rounded-xl border border-void-line bg-void-deep/60 p-4">
      <div className="flex justify-between font-mono text-[11px] uppercase tracking-wider">
        <span className="text-neon">Compradora {pressao.compradora}%</span>
        <span className="text-ember-soft">Vendedora {pressao.vendedora}%</span>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-void-line">
        <div className="bg-neon" style={{ width: `${pressao.compradora}%` }} />
        <div className="bg-ember" style={{ width: `${pressao.vendedora}%` }} />
      </div>
    </div>
  );
}

// Volatilidade do mercado agora (candles recentes x tamanho típico).
const VOL_STYLE = {
  baixa: { dot: "bg-mist-faint", box: "border-void-line bg-void-deep/60", title: "text-mist-dim", bars: 1 },
  normal: { dot: "bg-neon", box: "border-neon/30 bg-neon/5", title: "text-neon", bars: 2 },
  alta: { dot: "bg-volt", box: "border-volt/40 bg-volt/10", title: "text-volt-soft", bars: 3 },
  extrema: { dot: "bg-ember", box: "border-ember/40 bg-ember/10", title: "text-ember-soft", bars: 4 },
};

function VolatilityCard({ vol }) {
  if (!vol) return null;
  const st = VOL_STYLE[vol.nivel] || VOL_STYLE.normal;
  return (
    <div className={`rounded-xl border p-4 ${st.box}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${st.dot} ${vol.nivel === "alta" || vol.nivel === "extrema" ? "animate-pulse" : ""}`} />
          <span className="font-mono text-[11px] uppercase tracking-wider text-mist-faint">Volatilidade</span>
        </div>
        <div className="flex items-end gap-0.5" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className={`w-1.5 rounded-sm ${i <= st.bars ? st.dot : "bg-void-line"}`} style={{ height: 4 + i * 3 }} />
          ))}
        </div>
      </div>
      <div className={`mt-1.5 font-display text-sm font-semibold ${st.title}`}>{vol.titulo}</div>
      <p className="mt-0.5 text-xs leading-relaxed text-mist-dim">{vol.texto}</p>
    </div>
  );
}

export default function SignalResult({ result, timing, onRetry }) {
  if (result.noEntry) {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-void-line bg-void-deep/70 p-6">
        <div className="font-mono text-xs uppercase tracking-widest text-mist-dim">{result.pair} · {result.timeframe}</div>
        <div className="mt-2 flex items-center gap-2 font-display text-2xl font-bold text-mist">
          <PauseCircle size={26} className="text-volt" /> Sem entrada agora
        </div>
        <p className="mt-2 text-sm text-mist-dim">{result.reason || "Sem um sinal confiável neste candle."}</p>
        {result.pressao && <div className="mt-4"><PressureBar pressao={result.pressao} /></div>}
        {result.volatilidade && <div className="mt-3"><VolatilityCard vol={result.volatilidade} /></div>}
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
          {/* Em vez de "confiança Alta/Média/Baixa" (que não acompanhava o acerto real), mostra o acerto
              histórico de verdade deste ativo e tempo gráfico, de todas as leituras já conferidas. */}
          {result.acertoHistorico && (
            <span className="rounded-full border border-void-line bg-void-deep/60 px-3 py-1 text-right font-mono text-xs text-mist-dim">
              Acerto histórico {result.acertoHistorico.pct}%
              <span className="block text-[10px] text-mist-faint">{result.acertoHistorico.n} leituras</span>
            </span>
          )}
        </div>
      </div>

      {timing && <CandleTimer direction={result.direction} timeframe={result.timeframe} {...timing} />}

      <PressureBar pressao={result.pressao} />

      <VolatilityCard vol={result.volatilidade} />

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
