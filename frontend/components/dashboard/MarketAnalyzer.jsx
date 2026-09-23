"use client";
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Sparkles, AlertTriangle, Lock, Crown, Loader2, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { ASSETS, ASSET_LIST } from "@/lib/assets";
import TradingViewWidget from "./TradingViewWidget";
import AnalyzingOverlay from "./AnalyzingOverlay";
import SignalResult from "./SignalResult";
import BrokerCard from "./BrokerCard";
import { computeEntry } from "./CandleTimer";
import Dropdown from "./Dropdown";
import { now, syncClock } from "@/lib/clock";

const ASSET_OPTIONS = ASSET_LIST.map((k) => ({ value: k, label: k, hint: ASSETS[k].name }));
const TIMEFRAME_OPTIONS = [
  { value: "M1", label: "M1", hint: "1 minuto" },
  { value: "M5", label: "M5", hint: "5 minutos" }
];
const MIN_ANIMATION_MS = 2600;

export default function MarketAnalyzer({ isVip, onUpgrade, upgrading }) {
  const [pair, setPair] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState("M1");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [timing, setTiming] = useState(null);
  const [error, setError] = useState("");
  const [marketOpen, setMarketOpen] = useState(null);
  const [offset, setOffset] = useState(null);

  useEffect(() => {
    api.marketStatus().then((s) => setMarketOpen(!!s?.open)).catch(() => {});
    syncClock({ force: true }).then(setOffset);
  }, []);

  async function analyze() {
    setLoading(true);
    setError("");
    setResult(null);
    setTiming(null);
    // Garante o relógio sincronizado antes de marcar o horário do pedido.
    setOffset(await syncClock());
    const started = now();
    try {
      const data = await api.signal(pair, timeframe);
      const wait = MIN_ANIMATION_MS - (now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const { entry, expiry } = computeEntry(timeframe, now());
      setResult(data);
      setTiming({ requestedAt: started, entry, expiry });
    } catch (err) {
      if (err.data?.marketClosed) setMarketOpen(false);
      if (err.data?.vipRequired) { setError(err.message); return; }
      setError(err.message || "Não foi possível gerar o sinal agora.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
      <div className="space-y-5">
        <div className="panel panel-glow relative p-6">
          <AnimatePresence>{loading && <AnalyzingOverlay />}</AnimatePresence>

          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-mist">Nova análise</h2>
            {marketOpen != null && (
              <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${marketOpen ? "bg-neon/10 text-neon" : "bg-ember/10 text-ember-soft"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${marketOpen ? "bg-neon" : "bg-ember"}`} />
                {marketOpen ? "Mercado aberto" : "Mercado fechado"}
              </span>
            )}
          </div>

          {offset != null && Math.abs(offset) >= 2000 && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-volt/30 bg-volt/10 px-3 py-2 text-xs text-volt-soft">
              <Clock size={14} className="mt-0.5 shrink-0" />
              <span>
                O relógio do seu aparelho está {Math.round(Math.abs(offset) / 1000)} s {offset > 0 ? "atrasado" : "adiantado"}. Os horários de entrada já estão corrigidos pelo horário do servidor.
              </span>
            </div>
          )}

          <div className="mt-6 space-y-4">
            <Dropdown label="Ativo" options={ASSET_OPTIONS} value={pair} onChange={(v) => { setPair(v); setResult(null); }} />
            <Dropdown label="Timeframe" options={TIMEFRAME_OPTIONS} value={timeframe} onChange={(v) => { setTimeframe(v); setResult(null); }} />
          </div>

          {isVip ? (
            <button onClick={analyze} disabled={loading} className="btn-primary mt-6 w-full !py-4 text-base">
              <Sparkles size={18} /> Analisar com IA
            </button>
          ) : (
            <div className="grad-border mt-6 rounded-xl bg-void-deep/70 p-4 text-center">
              <div className="flex items-center justify-center gap-2 font-display text-sm font-semibold text-mist">
                <Lock size={15} className="text-neon" /> Sinais exclusivos para VIP
              </div>
              <p className="mt-1 text-xs text-mist-dim">Assine para receber o sinal do próximo candle, o indicador bwalpha e a contagem de entrada.</p>
              <button onClick={onUpgrade} disabled={upgrading} className="btn-primary mt-4 w-full !py-3.5">
                {upgrading ? <Loader2 size={16} className="animate-spin" /> : <><Crown size={16} /> Quero ser VIP</>}
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 flex gap-2 rounded-xl border border-ember/30 bg-ember/10 p-3 text-sm text-ember-soft">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
        </div>

        {result && <SignalResult result={result} timing={timing} />}

        <BrokerCard />
      </div>

      <div className="panel h-[460px] overflow-hidden p-1 md:h-[620px] xl:h-auto xl:min-h-[640px]">
        <TradingViewWidget pair={pair} timeframe={timeframe} />
      </div>
    </div>
  );
}
