import type { Pillar } from "../../types";
import { fmtSigned } from "../../lib/format";
import { flashBg, fmtChange, fmtPrice, upDown, useFlash } from "./hooks";

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 76;
  const h = 24;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1)}`);
  const up = values[values.length - 1] >= values[0];
  const color = up ? "#16c784" : "#ea3943";
  return (
    <svg width={w} height={h} className="block" aria-hidden>
      <polyline points={`0,${h} ${pts.join(" ")} ${w},${h}`} fill={color} fillOpacity="0.12" stroke="none" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.3" />
    </svg>
  );
}

function Row({ p, spark, driver }: { p: Pillar; spark: number[]; driver: boolean }) {
  const flash = useFlash(p.price);
  return (
    <tr className={`border-b border-mk-line/60 transition-colors duration-700 last:border-0 hover:bg-mk-raise ${flash ? flashBg[flash] : ""}`}>
      <td className="py-1.5 pl-1">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${driver ? "animate-pulse bg-mk-gold" : "bg-transparent"}`} />
          <span className="font-semibold text-mk-text">{p.ticker}</span>
        </span>
        <span className="block pl-3 text-[10px] text-mk-muted">{p.sector}</span>
      </td>
      <td className="py-1.5 text-right font-medium tabular-nums text-mk-text">{fmtPrice(p.price)}</td>
      <td className="py-1.5 text-right">
        <span
          className={`inline-block min-w-[62px] rounded px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums ${
            p.change_pct >= 0 ? "bg-mk-up/15 text-mk-up" : "bg-mk-down/15 text-mk-down"
          }`}
        >
          {fmtChange(p.change_pct)}
        </span>
      </td>
      <td className={`py-1.5 text-right tabular-nums ${upDown(p.z_score)}`}>{fmtSigned(p.z_score)}</td>
      <td className="hidden py-1.5 text-right tabular-nums text-mk-muted sm:table-cell">{(p.weight * 100).toFixed(1)}%</td>
      <td className="py-1.5 pl-3 pr-1">
        <Spark values={spark} />
      </td>
    </tr>
  );
}

export function Watchlist({ pillars, sparks, topDrivers }: { pillars: Pillar[]; sparks: Record<string, number[]>; topDrivers: string[] }) {
  const sorted = [...pillars].sort((a, b) => b.weight - a.weight);
  return (
    <div className="max-h-[440px] overflow-auto">
      <table className="w-full font-inter text-[12.5px]">
        <thead className="sticky top-0 z-10 bg-mk-panel">
          <tr className="border-b border-mk-line text-[10.5px] uppercase tracking-wider text-mk-muted">
            <th className="py-2 pl-1 text-left font-medium">Ativo</th>
            <th className="py-2 text-right font-medium">Último</th>
            <th className="py-2 text-right font-medium">Var. dia</th>
            <th className="py-2 text-right font-medium">Z</th>
            <th className="hidden py-2 text-right font-medium sm:table-cell">Peso</th>
            <th className="py-2 pl-3 text-left font-medium">20p</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <Row key={p.ticker} p={p} spark={sparks[p.ticker] ?? []} driver={topDrivers.includes(p.ticker)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
