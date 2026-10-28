import type { Pillar } from "../types";
import { fmtSigned } from "../lib/format";

interface Props {
  pillars: Pillar[];
  topDrivers: string[];
}

/** Tamanho do card proporcional ao peso no índice. */
function spanFor(weight: number): string {
  if (weight >= 0.1) return "col-span-2 row-span-2";
  if (weight >= 0.045) return "col-span-2";
  return "";
}

/** Intensidade da cor proporcional ao |Z| (satura em 2.5 desvios). */
function background(z: number): string {
  const alpha = Math.min(Math.abs(z) / 2.5, 1) * 0.55 + 0.05;
  const rgb = z >= 0 ? "34,197,94" : "239,68,68";
  return `rgba(${rgb},${alpha.toFixed(2)})`;
}

export function PillarHeatmap({ pillars, topDrivers }: Props) {
  const sorted = [...pillars].sort((a, b) => b.weight - a.weight);
  return (
    <section className="rounded-xl border border-ink-700 bg-ink-900 p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Pilares do Ibovespa</h2>
        <p className="text-xs text-slate-500">tamanho = peso · cor = Z-Score · ★ = top driver</p>
      </div>
      <div className="grid auto-rows-[76px] grid-flow-dense grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {sorted.map((p) => {
          const big = p.weight >= 0.1;
          return (
            <div
              key={p.ticker}
              className={`${spanFor(p.weight)} flex flex-col justify-between rounded-lg border border-white/5 p-2.5 transition-colors duration-700`}
              style={{ backgroundColor: background(p.z_score) }}
              title={`${p.sector} · contribuição ${fmtSigned(p.contribution, 3)}`}
            >
              <div className="flex items-start justify-between">
                <span className={`font-mono font-semibold text-slate-50 ${big ? "text-xl" : "text-sm"}`}>
                  {p.ticker}
                </span>
                {topDrivers.includes(p.ticker) && <span className="text-xs text-amber-300">★</span>}
              </div>
              <div className="flex items-end justify-between font-mono tabular-nums">
                <span className="text-[11px] text-slate-200/80">{(p.weight * 100).toFixed(1)}%</span>
                <span className={`font-semibold text-white ${big ? "text-2xl" : "text-sm"}`}>
                  {fmtSigned(p.z_score)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
