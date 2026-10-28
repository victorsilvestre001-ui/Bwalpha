import { useState } from "react";
import type { Snapshot } from "../../types";
import { fmtBRL, fmtPct, fmtPoints, fmtSigned } from "../../lib/format";
import { useTween } from "../mission/primitives";
import { upDown } from "./hooks";

const BADGE = {
  BUY: { label: "COMPRA", cls: "bg-mk-up text-mk-bg shadow-[0_0_24px_-4px_#16c784]" },
  SELL: { label: "VENDA", cls: "bg-mk-down text-white shadow-[0_0_24px_-4px_#ea3943]" },
  HOLD: { label: "NEUTRO", cls: "bg-mk-raise text-mk-text ring-1 ring-mk-line" },
} as const;

function Check({ ok, warn = false, label, detail }: { ok: boolean; warn?: boolean; label: string; detail: string }) {
  const tone = warn ? "text-mk-gold bg-mk-gold/15" : ok ? "text-mk-up bg-mk-up/15" : "text-mk-down bg-mk-down/15";
  return (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <span className="flex items-center gap-2">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${tone}`}>{warn ? "!" : ok ? "✓" : "✕"}</span>
        <span className="text-mk-text">{label}</span>
      </span>
      <span className="text-right tabular-nums text-mk-muted">{detail}</span>
    </li>
  );
}

/** Sinal atual + boleta sugerida, no formato de home broker. */
export function SignalTicket({ data }: { data: Snapshot }) {
  const [qty, setQty] = useState(1);
  const { signal, trade, market, open_position: pos } = data;
  const score = useTween(data.index_score);
  const marker = ((score + 1) / 2) * 100;
  const flowOk = market.foreign_flow !== 0 && Math.sign(market.foreign_flow) === Math.sign(data.index_score);

  return (
    <div className="space-y-4 font-inter text-[13px]">
      <div className="flex items-center justify-between gap-3">
        <span key={signal.action} className={`animate-enter rounded-md px-4 py-2 text-xl font-bold tracking-wide ${BADGE[signal.action].cls}`}>
          {BADGE[signal.action].label}
        </span>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wider text-mk-muted">Confiança</p>
          <p className="text-2xl font-semibold tabular-nums text-mk-text">{fmtPct(signal.confidence)}</p>
        </div>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-[11px] text-mk-muted">
          <span>Venda forte</span>
          <span className={`font-semibold tabular-nums ${upDown(data.index_score)}`}>Index_Score {fmtSigned(score)}</span>
          <span>Compra forte</span>
        </div>
        <div className="relative h-2 rounded-full bg-gradient-to-r from-mk-down via-mk-raise to-mk-up">
          <span className="absolute inset-y-[-3px] left-1/4 w-px bg-mk-text/40" />
          <span className="absolute inset-y-[-3px] left-3/4 w-px bg-mk-text/40" />
          <span
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-mk-bg bg-white shadow-[0_0_10px_rgba(255,255,255,0.6)]"
            style={{ left: `${marker}%` }}
          />
        </div>
      </div>

      <ul className="divide-y divide-mk-line/60">
        <Check ok={Math.abs(data.index_score) > 0.5} label="Força do score" detail={`${Math.abs(data.index_score).toFixed(2).replace(".", ",")} / 0,50`} />
        <Check ok={flowOk} label="Fluxo estrangeiro" detail={`R$ ${fmtSigned(market.foreign_flow, 0)} mi`} />
        <Check ok warn={market.vix > 25} label="Volatilidade" detail={`${market.vix.toFixed(1).replace(".", ",")}%`} />
      </ul>

      <div className="rounded-lg border border-mk-line bg-mk-bg/60 p-3">
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-md bg-mk-raise p-1 text-center text-[12px] font-semibold">
          <span className={`rounded py-1 ${signal.action === "BUY" ? "bg-mk-up text-mk-bg" : "text-mk-muted"}`}>Compra</span>
          <span className={`rounded py-1 ${signal.action === "SELL" ? "bg-mk-down text-white" : "text-mk-muted"}`}>Venda</span>
        </div>
        {trade ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 tabular-nums">
            <dt className="text-mk-muted">Preço</dt>
            <dd className="text-right font-semibold text-mk-text">{fmtPoints(trade.entry)}</dd>
            <dt className="text-mk-muted">Stop</dt>
            <dd className="text-right text-mk-down">
              {fmtPoints(trade.stop_loss)} <span className="text-[11px] text-mk-muted">({signal.stop_loss_pct.toFixed(2).replace(".", ",")}%)</span>
            </dd>
            <dt className="text-mk-muted">Alvo</dt>
            <dd className="text-right text-mk-up">
              {fmtPoints(trade.take_profit)} <span className="text-[11px] text-mk-muted">({signal.take_profit_pct.toFixed(2).replace(".", ",")}%)</span>
            </dd>
            <dt className="flex items-center text-mk-muted">Contratos</dt>
            <dd className="text-right">
              <input
                type="number"
                min={1}
                max={500}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 rounded border border-mk-line bg-mk-raise px-2 py-1 text-right text-mk-text outline-none focus:border-mk-accent"
              />
            </dd>
            <dt className="text-mk-muted">Risco</dt>
            <dd className="text-right text-mk-down">{fmtBRL(-trade.risk_brl * qty)}</dd>
            <dt className="text-mk-muted">Retorno potencial</dt>
            <dd className="text-right font-semibold text-mk-up">{fmtBRL(trade.reward_brl * qty)}</dd>
            <dt className="text-mk-muted">Risco : retorno</dt>
            <dd className="text-right text-mk-text">1 : {trade.risk_reward?.toFixed(2).replace(".", ",")}</dd>
          </dl>
        ) : (
          <p className="py-4 text-center text-mk-muted">Sem ordem sugerida: as condições de entrada não estão todas atendidas.</p>
        )}
        <p className="mt-3 border-t border-mk-line pt-2 text-center text-[11px] text-mk-muted">Simulação · nenhuma ordem é enviada</p>
      </div>

      {pos && (
        <div className="rounded-lg border border-mk-accent/40 bg-mk-accent/10 p-3">
          <div className="flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-2 font-semibold text-mk-text">
              <span className="h-2 w-2 animate-pulse rounded-full bg-mk-accent" />
              Posição aberta #{pos.id} · <span className={pos.action === "BUY" ? "text-mk-up" : "text-mk-down"}>{pos.action === "BUY" ? "Comprado" : "Vendido"}</span>
            </span>
            <span className={`font-semibold tabular-nums ${upDown(pos.pnl_points)}`}>
              {fmtSigned(pos.pnl_points, 0)} pts · {fmtBRL(pos.pnl_brl)}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-mk-raise">
            <div
              className="h-full rounded-full bg-gradient-to-r from-mk-down via-mk-accent to-mk-up transition-all duration-700"
              style={{
                width: `${Math.min(1, Math.max(0, (market.win_price - pos.stop_loss) / (pos.take_profit - pos.stop_loss))) * 100}%`,
              }}
            />
          </div>
          <p className="mt-1 flex justify-between text-[10.5px] tabular-nums text-mk-muted">
            <span>Stop {fmtPoints(pos.stop_loss)}</span>
            <span>Entrada {fmtPoints(pos.entry_price)}</span>
            <span>Alvo {fmtPoints(pos.take_profit)}</span>
          </p>
        </div>
      )}
    </div>
  );
}
