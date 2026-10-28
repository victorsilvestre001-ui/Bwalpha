import type { Pillar } from "../../types";
import { fmtSigned } from "../../lib/format";

const Z_RANGE = 3;

/** Telemetria por pilar: barra divergente do Z-Score (−3σ a +3σ), ordenada por peso. */
export function PillarBars({ pillars, topDrivers }: { pillars: Pillar[]; topDrivers: string[] }) {
  const sorted = [...pillars].sort((a, b) => b.weight - a.weight);
  return (
    <div className="text-[12px]">
      <div className="mb-1 grid grid-cols-[86px_1fr_48px] gap-3 font-cond text-[10px] uppercase tracking-[0.2em] text-white/35">
        <span>ativo · peso</span>
        <span className="flex justify-between">
          <span>−3σ</span>
          <span>0</span>
          <span>+3σ</span>
        </span>
        <span className="text-right">z</span>
      </div>
      {sorted.map((p) => {
        const pos = p.z_score >= 0;
        const width = (Math.min(Math.abs(p.z_score), Z_RANGE) / Z_RANGE) * 50;
        const driver = topDrivers.includes(p.ticker);
        return (
          <div key={p.ticker} className="grid h-[22px] grid-cols-[86px_1fr_48px] items-center gap-3">
            <span className="flex items-center gap-1.5 truncate">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${driver ? "animate-pulse bg-ion shadow-[0_0_8px_#4da3ff]" : "bg-white/15"}`}
              />
              <span className={driver ? "font-medium text-white" : "text-white/75"}>{p.ticker}</span>
              <span className="font-mono text-[10px] text-white/35">{(p.weight * 100).toFixed(1)}</span>
            </span>
            <div className="relative h-[5px] bg-white/[0.06]">
              <span className="absolute left-1/2 top-[-3px] h-[11px] w-px bg-white/30" />
              <span
                className={`absolute top-0 h-full transition-all duration-700 ease-out ${pos ? "bg-go" : "bg-nogo"}`}
                style={{
                  [pos ? "left" : "right"]: "50%",
                  width: `${width}%`,
                  boxShadow: `0 0 10px ${pos ? "#3ddc97" : "#ff5a5f"}`,
                }}
              />
            </div>
            <span className={`text-right font-mono tabular-nums ${pos ? "text-go" : "text-nogo"}`}>{fmtSigned(p.z_score)}</span>
          </div>
        );
      })}
    </div>
  );
}
