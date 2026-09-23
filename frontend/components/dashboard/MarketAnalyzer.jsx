"use client";
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Sparkles, AlertTriangle, Volume2, VolumeX, Lock, Crown, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { ASSETS, ASSET_LIST } from "@/lib/assets";
import TradingViewWidget from "./TradingViewWidget";
import AnalyzingOverlay from "./AnalyzingOverlay";
import SignalResult from "./SignalResult";
import BrokerCard from "./BrokerCard";
import { computeEntry } from "./CandleTimer";
import { speak, isVoiceOn, setVoiceOn } from "@/lib/speech";

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

export default function MarketAnalyzer({ isVip, onUpgrade, upgrading }) {
  const [pair, setPair] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState("M1");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [timing, setTiming] = useState(null);
  const [voice, setVoice] = useState(true);
  const [error, setError] = useState("");
  const [marketOpen, setMarketOpen] = useState(null);

  useEffect(() => {
    api.marketStatus().then((s) => setMarketOpen(!!s?.open)).catch(() => {});
    setVoice(isVoiceOn());
  }, []);

  function toggleVoice() {
    const next = !voice;
    setVoice(next);
    setVoiceOn(next);
  }

  async function analyze() {
    setLoading(true);
    setError("");
    setResult(null);
    setTiming(null);
    const started = Date.now();
    // Falar algo já no clique "libera" a voz no Safari/iPhone para o anúncio do resultado.
    speak(`Analisando ${pair}`);
    try {
      const data = await api.signal(pair, timeframe);
      const wait = MIN_ANIMATION_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const { entry, expiry } = computeEntry(timeframe, Date.now());
      setResult(data);
      setTiming({ requestedAt: started, entry, expiry });
      const hora = new Date(entry).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      speak(`Próximo candle: ${data.direction === "COMPRA" ? "compra" : "venda"}. Entrada às ${hora}.`);
    } catch (err) {
      if (err.data?.marketClosed) setMarketOpen(false);
      if (err.data?.vipRequired) { setError(err.message); return; }
      setError(err.message || "Não foi possível gerar o sinal agora.");
      speak("Não foi possível gerar o sinal agora.");
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
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-semibold text-mist">Nova análise</h2>
              <button onClick={toggleVoice} className={`rounded-lg p-1.5 transition-colors ${voice ? "text-neon hover:bg-neon/10" : "text-mist-faint hover:bg-white/5"}`} aria-label={voice ? "Silenciar voz" : "Ativar voz"} title={voice ? "Voz ligada" : "Voz desligada"}>
                {voice ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
            </div>
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
