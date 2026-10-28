import { useState } from "react";
import type { Signal, TradeLevels } from "../types";
import { actionColor, dotted, fmtBRL, fmtPoints } from "../lib/format";
import { TerminalPanel } from "./TerminalPanel";

interface Props {
  signal: Signal;
  trade: TradeLevels | null;
  winPrice: number;
  atrPct: number;
}

function Line({ label, value, sub, tone = "text-ph" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm leading-7">
      <span className="whitespace-pre text-ph-dim">{dotted(label, 14)}</span>
      <span className="text-right tabular-nums">
        <span className={`glow ${tone}`}>{value}</span>
        {sub && <span className="ml-2 text-[11px] text-ph-dim">{sub}</span>}
      </span>
    </p>
  );
}

export function TradeExecutionPanel({ signal, trade, winPrice, atrPct }: Props) {
  const [contracts, setContracts] = useState(1);

  return (
    <TerminalPanel
      title="order_ticket"
      path="WIN"
      accent={trade ? "ph" : "cy"}
      right={<span className={actionColor[signal.action]}>{trade ? "ARMED" : "STANDBY"}</span>}
    >
      {trade ? (
        <>
          <Line label="side" value={signal.action} tone={actionColor[signal.action]} />
          <Line label="entry" value={fmtPoints(trade.entry)} sub="pts" />
          <Line
            label="stop_loss"
            value={fmtPoints(trade.stop_loss)}
            sub={`−${fmtPoints(trade.stop_points)} pts · ${signal.stop_loss_pct.toFixed(2)}%`}
            tone="text-bear"
          />
          <Line
            label="take_profit"
            value={fmtPoints(trade.take_profit)}
            sub={`+${fmtPoints(trade.target_points)} pts · ${signal.take_profit_pct.toFixed(2)}%`}
            tone="text-bull"
          />
          <Line label="risk:reward" value={trade.risk_reward ? `1:${trade.risk_reward.toFixed(2)}` : "—"} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="border border-bear/40 bg-bear/10 p-2">
              <p className="text-[10px] uppercase tracking-widest text-ph-dim">perda máx</p>
              <p className="glow font-display text-3xl leading-none text-bear">{fmtBRL(-trade.risk_brl * contracts)}</p>
            </div>
            <div className="border border-bull/40 bg-bull/10 p-2">
              <p className="text-[10px] uppercase tracking-widest text-ph-dim">p&amp;l potencial</p>
              <p className="glow font-display text-3xl leading-none text-bull">{fmtBRL(trade.reward_brl * contracts)}</p>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <p className="glow-strong font-display text-5xl leading-none text-cy">{fmtPoints(winPrice)}</p>
          <p className="text-xs uppercase tracking-[0.25em] text-cy/80">
            aguardando gatilho<span className="animate-blink">_</span>
          </p>
          <p className="text-[11px] text-ph-dim">if |score| &gt; 0,50 &amp;&amp; fluxo confirma → arm</p>
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-[11px] text-ph-dim">
        <label className="flex items-center gap-2 uppercase tracking-widest">
          qty
          <input
            type="number"
            min={1}
            max={500}
            value={contracts}
            onChange={(e) => setContracts(Math.max(1, Number(e.target.value) || 1))}
            className="w-14 border border-ph/40 bg-void px-2 py-0.5 text-ph outline-none focus:border-ph"
          />
        </label>
        <span>atr {atrPct.toFixed(2)}% · R$ 0,20/pt</span>
      </div>
    </TerminalPanel>
  );
}
