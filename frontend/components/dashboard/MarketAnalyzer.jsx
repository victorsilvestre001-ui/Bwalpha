"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Sparkles, AlertTriangle, Lock, Crown, Loader2, Info, Gift } from "lucide-react";
import { api, updateSessionUser } from "@/lib/api";
import { formatCpf, isValidCpf } from "@/lib/cpf";
import { ASSETS, ASSET_LIST, isOtc } from "@/lib/assets";
import LiveChart from "./LiveChart";
import AnalyzingOverlay from "./AnalyzingOverlay";
import CandleWatch from "./CandleWatch";
import SignalResult from "./SignalResult";
import { computeEntry } from "./CandleTimer";
import Dropdown from "./Dropdown";
import { now, syncClock, startClockSync } from "@/lib/clock";

const ASSET_OPTIONS = ASSET_LIST.map((k) => ({ value: k, label: k, hint: ASSETS[k].name }));
const TIMEFRAME_OPTIONS = [
  { value: "M1", label: "M1", hint: "1 minuto" },
  { value: "M5", label: "M5", hint: "5 minutos" }
];
const MIN_ANIMATION_MS = 2600;

// Conta antiga sem CPF: o teste grátis é um por CPF, então pede antes de liberar.
function CpfGate({ onDone }) {
  const [cpf, setCpf] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!isValidCpf(cpf)) { setError("CPF inválido. Confira os números."); return; }
    setSaving(true);
    setError("");
    try {
      updateSessionUser(await api.updateProfile({ cpf }));
      onDone();
    } catch (err) {
      setError(err.message || "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grad-border mt-6 rounded-xl bg-void-deep/70 p-4">
      <div className="flex items-center gap-2 font-display text-sm font-semibold text-mist">
        <Gift size={15} className="text-neon" /> Libere sua análise grátis diária
      </div>
      <p className="mt-1 text-xs text-mist-dim">A análise grátis é uma por pessoa. Cadastre seu CPF para liberar (não pode ser alterado depois).</p>
      <div className="mt-3 flex gap-2">
        <input className="input" value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
        <button type="submit" disabled={saving} className="btn-primary !px-5">
          {saving ? <Loader2 size={16} className="animate-spin" /> : "Liberar"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-ember-soft">{error}</p>}
    </form>
  );
}
// M1: o sinal sai perto do fechamento do candle atual (validado no backtest).
const M1_MS = 60_000;
const M1_RELEASE_BEFORE_CLOSE_MS = 13_000;

// Próximo instante de liberar o sinal M1: 13s antes do candle atual fechar,
// ou do seguinte se esse ponto já passou.
function nextM1Release(t) {
  let release = Math.floor(t / M1_MS) * M1_MS + M1_MS - M1_RELEASE_BEFORE_CLOSE_MS;
  if (t > release - 500) release += M1_MS;
  return release;
}

export default function MarketAnalyzer({ isVip, onUpgrade, upgrading }) {
  const [pair, setPair] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState("M1");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [timing, setTiming] = useState(null);
  const [error, setError] = useState("");
  const [marketOpen, setMarketOpen] = useState(null);
  const [offset, setOffset] = useState(null);
  const [watching, setWatching] = useState(null); // { pair, timeframe, releaseAt, startedAt }
  const [quota, setQuota] = useState(null); // plano free: { limit, used, remaining, started, expired }
  const runId = useRef(0);

  useEffect(() => {
    const check = () => api.marketStatus().then((s) => setMarketOpen(!!s?.open)).catch(() => {});
    check();
    const id = setInterval(check, 60_000);
    const stop = startClockSync(setOffset);
    return () => { clearInterval(id); if (typeof stop === "function") stop(); };
  }, []);

  const loadQuota = () => api.signalQuota().then((q) => setQuota(q.vip ? null : q)).catch(() => {});
  useEffect(() => {
    if (isVip) { setQuota(null); return; }
    loadQuota();
  }, [isVip]);

  // OTC funciona 24h: não segue o horário do mercado aberto.
  const otc = isOtc(pair);
  const open = otc ? true : marketOpen;
  const needsCpf = !isVip && quota?.cpfRequired && quota.remaining > 0;
  const canAnalyze = isVip || (quota != null && quota.remaining > 0 && !quota.cpfRequired);

  function cancelWatch() {
    runId.current += 1;
    setWatching(null);
  }

  async function analyze() {
    const id = ++runId.current;
    setError("");
    setResult(null);
    setTiming(null);
    // Garante o relógio sincronizado antes de marcar os horários.
    setOffset(await syncClock({ force: true }));
    if (id !== runId.current) return;

    if (timeframe === "M1") {
      const startedAt = now();
      const releaseAt = nextM1Release(startedAt);
      setWatching({ pair, timeframe, releaseAt, startedAt });
      while (now() < releaseAt) {
        await new Promise((r) => setTimeout(r, Math.min(250, releaseAt - now())));
        if (id !== runId.current) return;
      }
      setWatching(null);
    }

    setLoading(true);
    const started = now();
    try {
      const data = await api.signal(pair, timeframe);
      if (id !== runId.current) return;
      // No M1 cada segundo conta para a entrada: sem animação mínima.
      const wait = timeframe === "M1" ? 0 : MIN_ANIMATION_MS - (now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      setResult(data);
      if (data.freeRemaining != null) setQuota((q) => q && { ...q, remaining: data.freeRemaining, used: q.limit - data.freeRemaining, started: true });
      if (data.noEntry) return;
      // Usa a entrada calculada e salva pelo servidor (a mesma que vai para o histórico).
      const local = computeEntry(timeframe, now());
      const entry = data.entry ?? local.entry;
      const expiry = data.expiry ?? local.expiry;
      setTiming({ requestedAt: data.requestedAt ?? started, entry, expiry });
    } catch (err) {
      if (err.data?.marketClosed && !otc) setMarketOpen(false);
      if (err.data?.freeLimitReached) setQuota((q) => q && { ...q, remaining: 0, used: q.limit });
      if (err.data?.cpfRequired) setQuota((q) => q && { ...q, cpfRequired: true });
      setError(err.message || "Não foi possível gerar o sinal agora.");
    } finally {
      if (id === runId.current) setLoading(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
      <div className="space-y-5">
        <div className="panel panel-glow relative p-6">
          <AnimatePresence>{loading && <AnalyzingOverlay />}</AnimatePresence>

          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-mist">Nova análise</h2>
            {open != null && (
              <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${open ? "bg-neon/10 text-neon" : "bg-ember/10 text-ember-soft"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-neon" : "bg-ember"}`} />
                {otc ? "OTC · 24h" : open ? "Mercado aberto" : "Mercado fechado"}
              </span>
            )}
          </div>


          <div className="mt-6 space-y-4">
            <Dropdown label="Ativo" options={ASSET_OPTIONS} value={pair} onChange={(v) => { cancelWatch(); setPair(v); setResult(null); }} />
            <Dropdown label="Timeframe" options={TIMEFRAME_OPTIONS} value={timeframe} onChange={(v) => { cancelWatch(); setTimeframe(v); setResult(null); }} />
          </div>

          {otc && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-volt/30 bg-volt/10 px-3 py-2 text-xs text-volt-soft">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>OTC é o preço da própria corretora (24h). Os sinais de OTC são novos e ainda estão em fase de teste.</span>
            </div>
          )}

          {timeframe === "M5" && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-volt/30 bg-volt/10 px-3 py-2 text-xs text-volt-soft">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>O M5 teve menor precisão nos nossos testes. Para sinais mais assertivos, use o M1.</span>
            </div>
          )}

          {needsCpf ? (
            <CpfGate onDone={loadQuota} />
          ) : canAnalyze ? (
            <>
              <button onClick={analyze} disabled={loading || !!watching || open === false} className="btn-primary mt-6 w-full !py-4 text-base disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">
                <Sparkles size={18} /> {open === false ? "Mercado fechado" : "Analisar com IA"}
              </button>
              {open === false && <p className="mt-2 text-center text-xs text-mist-faint">As análises voltam quando o mercado abrir (domingo, 19h de Brasília).</p>}
              {!isVip && quota && (
                <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-mist-dim">
                    <Gift size={13} className="text-neon" /> {quota.daily ? (quota.limit === 1 ? "1 análise grátis por dia" : `${quota.remaining} de ${quota.limit} análises grátis hoje`) : quota.started ? `${quota.remaining} de ${quota.limit} sinais grátis (só hoje)` : `${quota.limit} sinais grátis no seu primeiro dia`}
                  </span>
                  <button onClick={onUpgrade} disabled={upgrading} className="font-semibold text-neon hover:underline">Ilimitado no VIP</button>
                </div>
              )}
            </>
          ) : (
            <div className="grad-border mt-6 rounded-xl bg-void-deep/70 p-4 text-center">
              <div className="flex items-center justify-center gap-2 font-display text-sm font-semibold text-mist">
                <Lock size={15} className="text-neon" /> {quota?.daily ? "Análise grátis de hoje usada" : quota?.limit > 0 ? "Seu teste grátis acabou" : "Sinais exclusivos para VIP"}
              </div>
              <p className="mt-1 text-xs text-mist-dim">
                {quota?.daily
                  ? "Amanhã você ganha uma nova análise grátis. Com o VIP as análises são ilimitadas, com contagem de entrada, pressão e volatilidade."
                  : quota?.limit > 0
                  ? `Você já usou os ${quota.limit} sinais grátis do seu primeiro dia. Com o VIP os sinais são ilimitados, com contagem de entrada, pressão e volatilidade.`
                  : "Ative o VIP para receber o sinal do próximo candle, a contagem de entrada, a pressão e a volatilidade."}
              </p>
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

        {watching && <CandleWatch {...watching} onCancel={cancelWatch} />}
        {result && <SignalResult result={result} timing={timing} onRetry={analyze} />}

      </div>

      <div className="panel h-[460px] overflow-hidden p-1 md:h-[620px] xl:h-auto xl:min-h-[640px]">
        <LiveChart pair={pair} timeframe={timeframe} live={open !== false} />
      </div>
    </div>
  );
}
