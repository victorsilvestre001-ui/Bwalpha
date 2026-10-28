import { useState } from "react";
import type { Signal, TradeLevels } from "../types";
import { actionBadge, fmtBRL, fmtPoints } from "../lib/format";

interface Props {
  signal: Signal;
  trade: TradeLevels | null;
  winPrice: number;
  atrPct: number;
}

function Row({ label, value, sub, tone = "text-slate-100" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-ink-700/60 py-2 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-right font-mono tabular-nums">
        <span className={tone}>{value}</span>
        {sub && <span className="ml-2 text-xs text-slate-500">{sub}</span>}
      </span>
    </div>
  );
}

export function TradeExecutionPanel({ signal, trade, winPrice, atrPct }: Props) {
  const [contracts, setContracts] = useState(1);

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-ink-700 bg-ink-900 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Execução · WIN</h2>
        <span className={`rounded px-2 py-0.5 font-mono text-xs ring-1 ${actionBadge[signal.action]}`}>
          {signal.action}
        </span>
      </div>

      {trade ? (
        <>
          <Row label="Entrada" value={fmtPoints(trade.entry)} sub="pts" />
          <Row
            label="Stop-Loss"
            value={fmtPoints(trade.stop_loss)}
            sub={`−${fmtPoints(trade.stop_points)} pts · ${signal.stop_loss_pct.toFixed(2)}%`}
            tone="text-bear"
          />
          <Row
            label="Take-Profit"
            value={fmtPoints(trade.take_profit)}
            sub={`+${fmtPoints(trade.target_points)} pts · ${signal.take_profit_pct.toFixed(2)}%`}
            tone="text-bull"
          />
          <Row label="Risco / Retorno" value={trade.risk_reward ? `1 : ${trade.risk_reward.toFixed(2)}` : "—"} />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-bear/10 p-3">
              <p className="text-xs text-slate-400">Perda máx.</p>
              <p className="font-mono text-lg text-bear">{fmtBRL(-trade.risk_brl * contracts)}</p>
            </div>
            <div className="rounded-lg bg-bull/10 p-3">
              <p className="text-xs text-slate-400">P&amp;L potencial</p>
              <p className="font-mono text-lg text-bull">{fmtBRL(trade.reward_brl * contracts)}</p>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col justify-center py-6 text-center">
          <p className="font-mono text-2xl text-slate-300">{fmtPoints(winPrice)}</p>
          <p className="mt-2 text-sm text-slate-500">Sem entrada: aguardando |score| &gt; 0,50 com fluxo confirmando.</p>
        </div>
      )}

      <div className="mt-auto flex items-center justify-between pt-4 text-xs text-slate-500">
        <label className="flex items-center gap-2">
          Contratos
          <input
            type="number"
            min={1}
            max={500}
            value={contracts}
            onChange={(e) => setContracts(Math.max(1, Number(e.target.value) || 1))}
            className="w-16 rounded border border-ink-600 bg-ink-800 px-2 py-1 font-mono text-slate-200"
          />
        </label>
        <span className="font-mono">ATR {atrPct.toFixed(2)}% · R$ 0,20/pt</span>
      </div>
    </section>
  );
}
