"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Loader2, Trophy, XCircle, ListChecks, Percent, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { now } from "@/lib/clock";
import BankrollSimulator from "./BankrollSimulator";

const FILTERS = [
  { id: "all", label: "Todas" },
  { id: "win", label: "Win" },
  { id: "loss", label: "Red" },
  { id: "pending", label: "Aguardando" }
];

const RESULT = {
  win: { label: "WIN", cls: "border-neon/40 bg-neon/10 text-neon" },
  loss: { label: "RED", cls: "border-ember/40 bg-ember/10 text-ember-soft" },
  draw: { label: "EMPATE", cls: "border-void-line bg-void-line/40 text-mist-dim" },
  unknown: { label: "SEM DADOS", cls: "border-void-line text-mist-faint" }
};

function hhmm(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function day(iso) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Stat({ icon: Icon, label, value, accent }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-mist-faint">
        <Icon size={12} /> {label}
      </div>
      <div className={`mt-2 font-display text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}

export default function AnalysesHistory() {
  const [filter, setFilter] = useState("all");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(() => now());

  const load = useCallback(async (f = filter) => {
    setRefreshing(true);
    try {
      setData(await api.analyses(f));
      setError("");
    } catch (err) {
      setError(err.message || "Não foi possível carregar o histórico.");
    } finally {
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { load(filter); }, [filter, load]);

  // Enquanto houver análise aguardando, atualiza a contagem e busca o resultado de tempos em tempos.
  const hasPending = (data?.stats?.pending || 0) > 0;
  useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(() => setTick(now()), 1000);
    const r = setInterval(() => load(filter), 20_000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [hasPending, filter, load]);

  const s = data?.stats;
  const rate = s?.winRate != null ? `${Math.round(s.winRate * 100)}%` : "—";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ListChecks} label="Análises" value={s?.total ?? "—"} accent="text-mist" />
        <Stat icon={Trophy} label="Win" value={s?.wins ?? "—"} accent="text-neon" />
        <Stat icon={XCircle} label="Red" value={s?.losses ?? "—"} accent="text-ember-soft" />
        <Stat icon={Percent} label="Acerto" value={rate} accent="grad-text" />
      </div>

      <div className="panel panel-glow p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-xl border border-void-line bg-void-deep/70 p-1 text-sm">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-lg px-3.5 py-1.5 font-medium transition-colors ${filter === f.id ? "bg-gradient-to-r from-neon to-volt text-void" : "text-mist-dim hover:text-mist"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button onClick={() => load(filter)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-mist-dim hover:bg-white/5 hover:text-mist" aria-label="Atualizar">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Atualizar
          </button>
        </div>

        {error && <p className="mt-4 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember-soft">{error}</p>}

        {data === null ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-neon" /></div>
        ) : data.items.length === 0 ? (
          <p className="py-16 text-center text-sm text-mist-dim">
            {filter === "all" ? "Você ainda não gerou nenhuma análise. Vá em Análise e clique em \"Analisar com IA\"." : "Nenhuma análise neste filtro."}
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-void-line overflow-hidden rounded-xl border border-void-line">
            {data.items.map((a) => {
              const buy = a.direction === "COMPRA";
              const res = a.result ? RESULT[a.result] : null;
              const expiry = new Date(a.expiry_time).getTime();
              const entry = new Date(a.entry_time).getTime();
              return (
                <li key={a.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 bg-void-deep/40 px-4 py-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${buy ? "bg-neon/10 text-neon" : "bg-ember/10 text-ember"}`}>
                    {buy ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-sm font-semibold text-mist">{a.pair}</span>
                      <span className="font-mono text-xs text-mist-faint">{a.timeframe}</span>
                      <span className={`text-xs font-semibold ${buy ? "text-neon" : "text-ember-soft"}`}>{a.direction}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-mist-dim">
                      {day(a.entry_time)} · entrada {hhmm(a.entry_time)} → {hhmm(a.expiry_time)}
                    </div>
                  </div>
                  {res ? (
                    <span className={`rounded-full border px-3 py-1 font-mono text-xs font-bold ${res.cls}`}>{res.label}</span>
                  ) : (
                    <span className="rounded-full border border-volt/30 bg-volt/10 px-3 py-1 font-mono text-xs text-volt-soft">
                      {tick < entry ? `entra ${mmss(entry - tick)}` : tick < expiry ? `fecha ${mmss(expiry - tick)}` : "conferindo…"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-4 text-xs text-mist-faint">
          O resultado é conferido no candle de entrada: WIN quando o candle fecha a favor do sinal, RED quando fecha contra.
        </p>
      </div>
      <BankrollSimulator />
    </div>
  );
}
