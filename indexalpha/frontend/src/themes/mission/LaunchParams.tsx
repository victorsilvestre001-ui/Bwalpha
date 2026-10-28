import { useState } from "react";
import type { Snapshot, SignalRecord } from "../../types";
import { fmtBRL, fmtPoints, fmtSigned } from "../../lib/format";
import { Chip, MPanel, useTween } from "./primitives";

type Poll = { label: string; detail: string; state: "go" | "nogo" | "caution" };

/** Votação GO/NO-GO: as condições que liberam um sinal, como numa contagem de lançamento. */
function goNoGo(data: Snapshot): Poll[] {
  const s = data.index_score;
  const flow = data.market.foreign_flow;
  const vol = data.market.vix;
  return [
    {
      label: "Index_Score",
      detail: `força ${Math.abs(s).toFixed(2).replace(".", ",")} ${Math.abs(s) > 0.5 ? ">" : "<"} 0,50`,
      state: Math.abs(s) > 0.5 ? "go" : "nogo",
    },
    {
      label: "Fluxo estrangeiro",
      detail: `${fmtSigned(flow, 0)} mi ${Math.sign(flow) === Math.sign(s) ? "confirma" : "diverge"}`,
      state: flow !== 0 && Math.sign(flow) === Math.sign(s) ? "go" : "nogo",
    },
    { label: "Volatilidade", detail: `${vol.toFixed(1)}% ${vol > 25 ? "> 25% (−50% conf.)" : "< 25%"}`, state: vol > 25 ? "caution" : "go" },
  ];
}

function Ladder({ pos, price }: { pos: SignalRecord; price: number }) {
  const p = useTween(price, 800);
  const lo = Math.min(pos.stop_loss, pos.take_profit);
  const hi = Math.max(pos.stop_loss, pos.take_profit);
  const pad = (hi - lo) * 0.12;
  const H = 230;
  const y = (v: number) => 10 + ((hi + pad - v) / (hi - lo + 2 * pad)) * (H - 20);
  const clampY = (v: number) => Math.min(H - 8, Math.max(8, y(v)));
  const levels = [
    { v: pos.take_profit, label: "ALVO", color: "#3ddc97" },
    { v: pos.entry_price, label: "ENTRADA", color: "#ffffff" },
    { v: pos.stop_loss, label: "STOP", color: "#ff5a5f" },
  ];
  const progress = (price - pos.stop_loss) / (pos.take_profit - pos.stop_loss);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between font-cond text-[11px] uppercase tracking-[0.2em] text-white/50">
        <span>
          Em voo · #{pos.id} <span className={pos.action === "BUY" ? "text-go" : "text-nogo"}>{pos.action}</span>
        </span>
        <span className={`font-mono tracking-normal ${pos.pnl_points >= 0 ? "text-go" : "text-nogo"}`}>
          {fmtSigned(pos.pnl_points, 0)} pts
        </span>
      </div>
      <svg viewBox={`0 0 220 ${H}`} className="h-auto w-full" role="img" aria-label="Posição aberta entre stop e alvo">
        <rect x="58" y={y(hi)} width="6" height={y(lo) - y(hi)} fill="white" fillOpacity="0.06" />
        {levels.map((l) => (
          <g key={l.label}>
            <line x1="40" x2="210" y1={y(l.v)} y2={y(l.v)} stroke={l.color} strokeOpacity="0.55" strokeDasharray={l.label === "ENTRADA" ? "3 5" : undefined} />
            <text x="2" y={y(l.v) + 4} fill={l.color} fillOpacity="0.85" fontFamily="Barlow Condensed" fontSize="10" letterSpacing="1.5">
              {l.label}
            </text>
            <text x="210" y={y(l.v) - 5} textAnchor="end" fill="white" fillOpacity="0.6" fontFamily="Barlow" fontSize="11">
              {fmtPoints(l.v)}
            </text>
          </g>
        ))}
        <g style={{ transform: `translateY(${clampY(p)}px)` }}>
          <line x1="56" x2="210" y1="0" y2="0" stroke="#4da3ff" strokeWidth="1.5" style={{ filter: "drop-shadow(0 0 4px #4da3ff)" }} />
          <path d="M50,-6 L60,0 L50,6 Z" fill="#4da3ff" />
          <text x="70" y="16" fill="#4da3ff" fontFamily="Barlow" fontWeight={500} fontSize="12">
            {fmtPoints(price)}
          </text>
        </g>
      </svg>
      <div className="mt-1 h-1 bg-white/10">
        <div
          className="h-full bg-gradient-to-r from-nogo via-ion to-go transition-all duration-700"
          style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }}
        />
      </div>
      <p className="mt-1 flex justify-between font-cond text-[10px] uppercase tracking-[0.2em] text-white/40">
        <span>stop</span>
        <span>{fmtBRL(pos.pnl_brl)} / contrato</span>
        <span>alvo</span>
      </p>
    </div>
  );
}

export function LaunchParams({ data }: { data: Snapshot }) {
  const [qty, setQty] = useState(1);
  const { trade, signal, open_position: pos } = data;
  const poll = goNoGo(data);

  return (
    <MPanel
      title="Parâmetros de lançamento · WIN"
      right={trade ? <Chip tone="go" pulse>GO</Chip> : <Chip tone="idle">Standby</Chip>}
      delay={400}
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-4">
          <ul className="space-y-2">
            {poll.map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-3 border-b border-white/5 pb-2">
                <span>
                  <span className="block font-cond text-[11px] uppercase tracking-[0.2em] text-white/50">{item.label}</span>
                  <span className="font-mono text-[12px] text-white/80">{item.detail}</span>
                </span>
                <Chip tone={item.state}>{item.state === "nogo" ? "NO-GO" : item.state === "go" ? "GO" : "CAUTION"}</Chip>
              </li>
            ))}
          </ul>

          {trade ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              {[
                ["Lado", signal.action, signal.action === "BUY" ? "text-go" : "text-nogo"],
                ["Entrada", fmtPoints(trade.entry), "text-white"],
                ["Stop", `${fmtPoints(trade.stop_loss)}`, "text-nogo"],
                ["Alvo", `${fmtPoints(trade.take_profit)}`, "text-go"],
                ["Risco", fmtBRL(-trade.risk_brl * qty), "text-nogo"],
                ["P&L potencial", fmtBRL(trade.reward_brl * qty), "text-go"],
              ].map(([k, v, cls]) => (
                <div key={k}>
                  <dt className="font-cond text-[10px] uppercase tracking-[0.25em] text-white/40">{k}</dt>
                  <dd className={`font-sans text-xl font-light tabular-nums ${cls}`}>{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-white/50">
              Aguardando todas as condições em <span className="text-go">GO</span> para armar uma entrada.
            </p>
          )}

          <label className="flex items-center gap-3 font-cond text-[11px] uppercase tracking-[0.2em] text-white/50">
            Contratos
            <input
              type="number"
              min={1}
              max={500}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 border border-white/20 bg-black/60 px-2 py-1 font-mono text-white outline-none focus:border-ion"
            />
            <span className="font-mono normal-case tracking-normal text-white/35">
              stop {signal.stop_loss_pct.toFixed(2).replace(".", ",")}% · alvo{" "}
              {signal.take_profit_pct.toFixed(2).replace(".", ",")}%
            </span>
          </label>
        </div>

        {pos ? (
          <Ladder pos={pos} price={data.market.win_price} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-white/10 p-6 text-center">
            <div className="relative h-20 w-20">
              <span className="absolute inset-0 animate-ping rounded-full border border-ion/30" />
              <span className="absolute inset-3 rounded-full border border-ion/50" />
              <span className="absolute inset-[34px] rounded-full bg-ion shadow-[0_0_14px_#4da3ff]" />
            </div>
            <p className="font-cond text-[11px] uppercase tracking-[0.3em] text-white/50">Nenhuma posição em voo</p>
            <p className="font-sans text-3xl font-extralight tabular-nums text-white">{fmtPoints(data.market.win_price)}</p>
          </div>
        )}
      </div>
    </MPanel>
  );
}
