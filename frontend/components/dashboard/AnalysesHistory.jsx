"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Loader2, Trophy, XCircle, ListChecks, Percent, RefreshCw, Hourglass } from "lucide-react";
import { api } from "@/lib/api";
import BankrollSimulator from "./BankrollSimulator";

// A lista mostra só os últimos sinais já conferidos (WIN ou RED).
const LAST_N = 10;

const RESULT = {
  win: { label: "WIN", cls: "border-neon/40 bg-neon/10 text-neon" },
  loss: { label: "RED", cls: "border-ember/40 bg-ember/10 text-ember-soft" },
};

function hhmm(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function day(iso) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
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
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await api.analyses("decided", LAST_N));
      setError("");
    } catch (err) {
      setError(err.message || "Não foi possível carregar o histórico.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Enquanto houver sinal aguardando o candle fechar, busca o resultado de tempos em tempos.
  const pending = data?.stats?.pending || 0;
  useEffect(() => {
    if (!pending) return;
    const r = setInterval(load, 20_000);
    return () => clearInterval(r);
  }, [pending, load]);

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
          <div>
            <h3 className="font-display text-base font-semibold text-mist">Últimos {LAST_N} sinais</h3>
            {pending > 0 && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-volt-soft">
                <Hourglass size={12} /> {pending === 1 ? "1 sinal aguardando o resultado" : `${pending} sinais aguardando o resultado`}
              </p>
            )}
          </div>
          <button onClick={load} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-mist-dim hover:bg-white/5 hover:text-mist" aria-label="Atualizar">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Atualizar
          </button>
        </div>

        {error && <p className="mt-4 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember-soft">{error}</p>}

        {data === null ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-neon" /></div>
        ) : data.items.length === 0 ? (
          <p className="py-16 text-center text-sm text-mist-dim">
            {pending > 0 ? "Seu sinal está aguardando o candle fechar. O resultado aparece aqui em instantes." : "Nenhum sinal conferido ainda. Vá em Análise e clique em \"Analisar com IA\"."}
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-void-line overflow-hidden rounded-xl border border-void-line">
            {data.items.map((a) => {
              const buy = a.direction === "COMPRA";
              const res = RESULT[a.result];
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
                  <span className={`rounded-full border px-3 py-1 font-mono text-xs font-bold ${res.cls}`}>{res.label}</span>
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
