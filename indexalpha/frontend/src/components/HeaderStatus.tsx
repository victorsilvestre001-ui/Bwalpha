import type { Snapshot } from "../types";
import { actionBadge, actionColor, fmtPct, fmtPoints, fmtSigned, fmtTime, signColor } from "../lib/format";

interface Props {
  data: Snapshot;
  lastUpdate: Date | null;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 240;
  const h = 56;
  const y = (v: number) => ((1 - v) / 2) * h; // escala fixa -1..+1
  const step = w / (values.length - 1);
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full max-w-[240px]" aria-label="Evolução do Index_Score">
      <line x1="0" x2={w} y1={y(0.5)} y2={y(0.5)} className="stroke-bull/30" strokeDasharray="3 3" />
      <line x1="0" x2={w} y1={y(0)} y2={y(0)} className="stroke-ink-600" />
      <line x1="0" x2={w} y1={y(-0.5)} y2={y(-0.5)} className="stroke-bear/30" strokeDasharray="3 3" />
      <path d={path} fill="none" strokeWidth="1.75" className={last >= 0 ? "stroke-bull" : "stroke-bear"} />
    </svg>
  );
}

export function HeaderStatus({ data, lastUpdate }: Props) {
  const { signal, market } = data;
  return (
    <header className="grid gap-4 rounded-xl border border-ink-700 bg-ink-900 p-5 md:grid-cols-[auto_1fr_auto] md:items-center">
      <div>
        <p className="text-xs uppercase tracking-widest text-slate-500">Index_Score</p>
        <p className={`font-mono text-6xl font-semibold tabular-nums ${signColor(data.index_score)}`}>
          {fmtSigned(data.index_score)}
        </p>
        <p className="mt-1 font-mono text-xs text-slate-500">raw Σw·z {fmtSigned(data.raw_score, 3)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-6 md:justify-center">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Ação</p>
          <span
            className={`mt-1 inline-block rounded-md px-4 py-1.5 font-mono text-2xl font-bold ring-1 ${actionBadge[signal.action]}`}
          >
            {signal.action}
          </span>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Confiança</p>
          <p className={`font-mono text-3xl tabular-nums ${actionColor[signal.action]}`}>{fmtPct(signal.confidence)}</p>
          {signal.volatility_filter_applied && (
            <p className="text-xs text-amber-400">Filtro de vol ativo (−50%)</p>
          )}
        </div>
        <Sparkline values={data.score_history.map((p) => p.score)} />
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm md:text-right">
        <dt className="text-slate-500">WIN</dt>
        <dd className="tabular-nums text-slate-100">{fmtPoints(market.win_price)}</dd>
        <dt className="text-slate-500">Fluxo estr.</dt>
        <dd className={`tabular-nums ${signColor(market.foreign_flow)}`}>R$ {fmtSigned(market.foreign_flow, 0)} mi</dd>
        <dt className="text-slate-500">Vol. impl.</dt>
        <dd className={`tabular-nums ${market.vix > 25 ? "text-amber-400" : "text-slate-100"}`}>
          {market.vix.toFixed(1)}%
        </dd>
        <dt className="text-slate-500">Atualizado</dt>
        <dd className="tabular-nums text-slate-400">{lastUpdate ? fmtTime(lastUpdate.toISOString()) : "—"}</dd>
      </dl>
    </header>
  );
}
