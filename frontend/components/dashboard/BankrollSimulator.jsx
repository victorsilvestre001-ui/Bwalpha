"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Target, ShieldAlert, Loader2, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { simulateBankroll } from "@/lib/simulate";

const DEFAULTS = { capital: 100, stakePct: 5, payoutPct: 85, targetPct: 30, stopPct: 20, compound: false };
const STORE = "tradeon_sim_settings";

const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`;

const STATUS = {
  target: { label: "Meta batida", cls: "border-neon/40 bg-neon/10 text-neon", icon: Target },
  stop: { label: "Stop atingido", cls: "border-ember/40 bg-ember/10 text-ember-soft", icon: ShieldAlert },
  broke: { label: "Banca zerada", cls: "border-ember/40 bg-ember/10 text-ember-soft", icon: ShieldAlert },
  running: { label: "Em andamento", cls: "border-volt/40 bg-volt/10 text-volt-soft", icon: Calculator }
};

function Field({ label, suffix, value, onChange, step = 1, min = 0 }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-mist-faint">{label}</span>
      <span className="relative block">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="input !py-2.5 !pr-10 font-mono"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-mist-faint">{suffix}</span>
      </span>
    </label>
  );
}

// Gráfico da banca: uma linha (2px) com área suave, linhas de referência finas para
// capital inicial, meta e stop, e tooltip com cruz ao passar o mouse/dedo.
function BalanceChart({ sim, capital }) {
  const ref = useRef(null);
  const wrap = useRef(null);
  const [hover, setHover] = useState(null);
  // Desenha na largura real do container para o texto sair sempre com o mesmo tamanho.
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 480 ? 200 : 240, L = 44, R = 12, T = 18, B = 24;
  const pts = sim.points;
  const values = pts.map((p) => p.balance).concat([sim.target, sim.stopAt, capital]);
  let lo = Math.min(...values), hi = Math.max(...values);
  const pad = (hi - lo) * 0.08 || 5;
  lo = Math.max(0, lo - pad); hi = hi + pad;
  const n = Math.max(1, pts.length - 1);
  const x = (i) => L + (i / n) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);

  const step = (() => {
    const raw = (hi - lo) / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  })();
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);

  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${y(lo)} L${x(0)},${y(lo)} Z`;
  const last = pts[pts.length - 1];

  function onMove(e) {
    const rect = ref.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * n);
    setHover(Math.max(0, Math.min(pts.length - 1, i)));
  }

  const refLines = [
    { v: sim.target, label: "Meta", cls: "stroke-neon/50", text: "fill-mist-dim" },
    { v: capital, label: "Início", cls: "stroke-mist-faint/60", text: "fill-mist-faint" },
    { v: sim.stopAt, label: "Stop", cls: "stroke-ember/50", text: "fill-mist-dim" }
  ];
  const hp = hover != null ? pts[hover] : null;

  return (
    <div ref={wrap} className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block touch-none select-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(null); }}
        role="img"
        aria-label={`Evolução da banca em ${sim.operations} operações, de ${brl(capital)} para ${brl(sim.balance)}`}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-void-line" strokeWidth="1" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" className="fill-mist-faint font-mono text-[10px]">{Math.round(v)}</text>
          </g>
        ))}
        {refLines.map((r) => (
          <g key={r.label}>
            <line x1={L} x2={W - R} y1={y(r.v)} y2={y(r.v)} className={r.cls} strokeWidth="1" />
            <text x={W - R - 14} y={y(r.v) - 5} textAnchor="end" className={`${r.text} font-mono text-[10px]`}>{r.label} {brl(r.v)}</text>
          </g>
        ))}
        <path d={area} className="fill-neon/10" />
        <path d={line} fill="none" className="stroke-neon" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hp && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="stroke-mist-faint" strokeWidth="1" />}
        <circle cx={x(pts.length - 1)} cy={y(last.balance)} r="5" className="fill-neon stroke-void-card" strokeWidth="2" />
        {hp && <circle cx={x(hover)} cy={y(hp.balance)} r="5" className="fill-neon stroke-void-card" strokeWidth="2" />}
        <text x={L} y={H - 6} className="fill-mist-faint font-mono text-[10px]">op. 0</text>
        <text x={W - R} y={H - 6} textAnchor="end" className="fill-mist-faint font-mono text-[10px]">op. {sim.operations}</text>
      </svg>

      {hp && (
        <div
          className={W < 480
            ? "mt-2 rounded-lg border border-void-line bg-void-card px-3 py-2 text-xs"
            : "pointer-events-none absolute top-2 z-10 min-w-[150px] rounded-lg border border-void-line bg-void-card/95 px-3 py-2 text-xs shadow-card"}
          style={W < 480 ? undefined : { left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 75px), calc(100% - 160px))` }}
        >
          <div className="font-mono text-[10px] uppercase tracking-wider text-mist-faint">
            {hover === 0 ? "Início" : `Operação ${hover}`}
          </div>
          <div className="mt-1 font-mono text-sm font-semibold text-mist">{brl(hp.balance)}</div>
          {hp.item && (
            <div className="mt-0.5 text-mist-dim">
              {hp.item.pair} {hp.item.direction} · {hp.item.result === "win" ? "WIN" : hp.item.result === "loss" ? "RED" : "EMPATE"} ({hp.pnl >= 0 ? "+" : ""}{brl(hp.pnl)})
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BankrollSimulator() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(STORE) || "null"); if (saved) setCfg({ ...DEFAULTS, ...saved }); } catch {}
    api.analyses("all", 300)
      .then((d) => setItems(d.items))
      .catch((err) => setError(err.message || "Não foi possível carregar o histórico."));
  }, []);

  function set(key, value) {
    const next = { ...cfg, [key]: value };
    setCfg(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch {}
  }

  const valid = [cfg.capital, cfg.stakePct, cfg.payoutPct, cfg.targetPct, cfg.stopPct].every((v) => typeof v === "number" && v > 0);
  const resolved = useMemo(
    () => (items || []).filter((a) => ["win", "loss", "draw"].includes(a.result)).slice().reverse(),
    [items]
  );
  const sim = useMemo(() => (valid && resolved.length ? simulateBankroll(resolved, cfg) : null), [resolved, cfg, valid]);
  const st = sim ? STATUS[sim.status] : null;

  return (
    <div className="panel panel-glow p-5 md:p-6">
      <div className="flex items-center gap-2">
        <Calculator size={18} className="text-neon" />
        <h2 className="font-display text-lg font-semibold text-mist">Simulador de banca</h2>
      </div>
      <p className="mt-1 text-sm text-mist-dim">
        Aplica os WIN e RED reais do seu histórico, do mais antigo para o mais novo, numa banca fictícia. Nenhum dinheiro real é usado.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Field label="Capital" suffix="R$" value={cfg.capital} onChange={(v) => set("capital", v)} step={10} />
        <Field label="Entrada" suffix="%" value={cfg.stakePct} onChange={(v) => set("stakePct", v)} step={0.5} />
        <Field label="Payout" suffix="%" value={cfg.payoutPct} onChange={(v) => set("payoutPct", v)} />
        <Field label="Meta" suffix="%" value={cfg.targetPct} onChange={(v) => set("targetPct", v)} />
        <Field label="Stop" suffix="%" value={cfg.stopPct} onChange={(v) => set("stopPct", v)} />
      </div>

      <div className="mt-3 flex rounded-xl border border-void-line bg-void-deep/70 p-1 text-xs sm:inline-flex">
        {[[false, "Entrada fixa (% do capital inicial)"], [true, "Juros compostos (% da banca atual)"]].map(([v, l]) => (
          <button key={String(v)} onClick={() => set("compound", v)} className={`flex-1 rounded-lg px-3 py-2 font-medium transition-colors ${cfg.compound === v ? "bg-gradient-to-r from-neon to-volt text-void" : "text-mist-dim hover:text-mist"}`}>
            {l}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember-soft">{error}</p>}

      {items === null && !error ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-neon" /></div>
      ) : !valid ? (
        <p className="py-10 text-center text-sm text-mist-dim">Preencha todos os campos com valores maiores que zero.</p>
      ) : !sim ? (
        <p className="py-10 text-center text-sm text-mist-dim">Ainda não há análises com resultado. Gere algumas análises e volte aqui depois que os candles fecharem.</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-void-line bg-void-deep/60 p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-mist-faint">Banca final</div>
              <div className="mt-1 font-display text-2xl font-bold text-mist">{brl(sim.balance)}</div>
              <div className={`mt-0.5 font-mono text-xs ${sim.pnl >= 0 ? "text-neon" : "text-ember-soft"}`}>{pct(sim.pnlPct)} ({sim.pnl >= 0 ? "+" : ""}{brl(sim.pnl)})</div>
            </div>
            <div className="rounded-xl border border-void-line bg-void-deep/60 p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-mist-faint">Resultado</div>
              <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${st.cls}`}>
                <st.icon size={13} /> {st.label}
              </span>
              <div className="mt-1 text-xs text-mist-dim">em {sim.operations} operações</div>
            </div>
            <div className="rounded-xl border border-void-line bg-void-deep/60 p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-mist-faint">Win / Red / Empate</div>
              <div className="mt-1 font-display text-2xl font-bold text-mist">{sim.wins} / {sim.losses} / {sim.draws}</div>
            </div>
            <div className="rounded-xl border border-void-line bg-void-deep/60 p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-mist-faint">Maior queda</div>
              <div className="mt-1 font-display text-2xl font-bold text-mist">{(sim.maxDrawdown * 100).toFixed(1).replace(".", ",")}%</div>
              <div className="mt-0.5 text-xs text-mist-dim">do topo da banca</div>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-void-line bg-void-deep/40 p-3">
            <BalanceChart sim={sim} capital={cfg.capital} />
          </div>

          {sim.status === "running" && (
            <p className="mt-3 text-xs text-mist-dim">
              Faltam {brl(Math.max(0, sim.target - sim.balance))} para a meta. O simulador continua conforme novas análises forem conferidas.
            </p>
          )}

          <button onClick={() => setShowTable((v) => !v)} className="mt-4 flex items-center gap-1.5 text-sm text-mist-dim hover:text-mist">
            <ChevronDown size={16} className={`transition-transform ${showTable ? "rotate-180" : ""}`} /> {showTable ? "Esconder" : "Ver"} operações da simulação
          </button>
          {showTable && (
            <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-void-line">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-void-card font-mono uppercase tracking-wider text-mist-faint">
                  <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Ativo</th><th className="px-3 py-2">Sinal</th><th className="px-3 py-2">Resultado</th><th className="px-3 py-2 text-right">Entrada</th><th className="px-3 py-2 text-right">Lucro</th><th className="px-3 py-2 text-right">Banca</th></tr>
                </thead>
                <tbody className="divide-y divide-void-line font-mono text-mist">
                  {sim.points.slice(1).map((p) => (
                    <tr key={p.i}>
                      <td className="px-3 py-2 text-mist-faint">{p.i}</td>
                      <td className="px-3 py-2">{p.item.pair} {p.item.timeframe}</td>
                      <td className="px-3 py-2">{p.item.direction}</td>
                      <td className="px-3 py-2">{p.item.result === "win" ? "WIN" : p.item.result === "loss" ? "RED" : "EMPATE"}</td>
                      <td className="px-3 py-2 text-right">{brl(p.stake)}</td>
                      <td className="px-3 py-2 text-right">{p.pnl >= 0 ? "+" : ""}{brl(p.pnl)}</td>
                      <td className="px-3 py-2 text-right">{brl(p.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <p className="mt-4 text-xs text-mist-faint">
        Simulação com resultados passados. Não garante resultados futuros e não representa uma recomendação de investimento.
      </p>
    </div>
  );
}
