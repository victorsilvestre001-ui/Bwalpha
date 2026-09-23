"use client";
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Sparkles, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { ASSETS, ASSET_LIST } from "@/lib/assets";
import TradingViewWidget from "./TradingViewWidget";
import AnalyzingOverlay from "./AnalyzingOverlay";
import SignalResult from "./SignalResult";
import BrokerCard from "./BrokerCard";

const TIMEFRAMES = ["M1", "M5"];
const MIN_ANIMATION_MS = 2600;

function Segmented({ options, value, onChange }) {
  return (
    <div className="grid rounded-xl border border-void-line bg-void-deep/70 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`rounded-lg py-2.5 font-mono text-sm font-medium transition-all ${value === o ? "bg-gradient-to-r from-neon to-volt text-void" : "text-mist-dim hover:text-mist"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export default function MarketAnalyzer() {
  const [pair, setPair] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState("M1");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [analyzedAt, setAnalyzedAt] = useState(null);
  const [error, setError] = useState("");
  const [marketOpen, setMarketOpen] = useState(null);

  useEffect(() => {
    api.marketStatus().then((s) => setMarketOpen(!!s?.open)).catch(() => {});
  }, []);

  async function analyze() {
    setLoading(true);
    setError("");
    setResult(null);
    const started = Date.now();
    try {
      const data = await api.signal(pair, timeframe);
      const wait = MIN_ANIMATION_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      setResult(data);
      setAnalyzedAt(new Date());
    } catch (err) {
      if (err.data?.marketClosed) setMarketOpen(false);
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

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-widest text-mist-faint"><span>Ativo</span><span className="normal-case tracking-normal text-mist-dim">{ASSETS[pair].name}</span></label>
              <Segmented options={ASSET_LIST} value={pair} onChange={(v) => { setPair(v); setResult(null); }} />
            </div>
            <div>
              <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-mist-faint">Timeframe</label>
              <Segmented options={TIMEFRAMES} value={timeframe} onChange={(v) => { setTimeframe(v); setResult(null); }} />
            </div>
          </div>

          <button onClick={analyze} disabled={loading} className="btn-primary mt-6 w-full !py-4 text-base">
            <Sparkles size={18} /> Analisar com IA
          </button>

          {error && (
            <div className="mt-4 flex gap-2 rounded-xl border border-ember/30 bg-ember/10 p-3 text-sm text-ember-soft">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
        </div>

        {result && <SignalResult result={result} analyzedAt={analyzedAt} />}

        <BrokerCard />
      </div>

      <div className="panel h-[460px] overflow-hidden p-1 md:h-[620px] xl:h-auto xl:min-h-[640px]">
        <TradingViewWidget pair={pair} timeframe={timeframe} />
      </div>
    </div>
  );
}
