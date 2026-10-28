import type { Pillar } from "../types";
import { useScramble } from "../hooks/useMotion";
import { fmtSigned } from "../lib/format";
import { TerminalPanel } from "./TerminalPanel";

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

/** Intensidade proporcional ao |Z| (satura em 2,5 desvios). */
function tint(z: number): { bg: string; border: string } {
  const k = Math.min(Math.abs(z) / 2.5, 1);
  const rgb = z >= 0 ? "57,255,136" : "255,59,92";
  return { bg: `rgba(${rgb},${(0.04 + k * 0.3).toFixed(2)})`, border: `rgba(${rgb},${(0.2 + k * 0.6).toFixed(2)})` };
}

function Cell({ p, driver }: { p: Pillar; driver: boolean }) {
  const big = p.weight >= 0.1;
  const z = useScramble(fmtSigned(p.z_score), 10, 35);
  const { bg, border } = tint(p.z_score);
  const positive = p.z_score >= 0;

  return (
    <div
      className={`${spanFor(p.weight)} relative flex flex-col justify-between overflow-hidden border p-2 transition-colors duration-700`}
      style={{ backgroundColor: bg, borderColor: border }}
      title={`${p.sector} · contribuição ${fmtSigned(p.contribution, 3)}`}
    >
      {/* flash quando o Z troca de sinal */}
      <span key={positive ? "up" : "down"} className="pointer-events-none absolute inset-0 animate-flash bg-white/20" />
      <div className="flex items-start justify-between gap-1">
        <span className={`glow font-bold text-ph ${big ? "text-lg" : "text-[13px]"}`}>{p.ticker}</span>
        {driver && <span className="glow animate-blink text-[10px] text-amber">{big ? "◆DRV" : "◆"}</span>}
      </div>
      {big && <span className="text-[10px] uppercase tracking-widest text-ph-dim">{p.sector}</span>}
      <div className="flex items-end justify-between tabular-nums">
        <span className={`text-[10px] text-ph-dim ${big ? "" : "hidden sm:inline"}`}>{(p.weight * 100).toFixed(1)}%</span>
        <span
          className={`glow-strong ml-auto font-display leading-none ${positive ? "text-bull" : "text-bear"} ${
            big ? "text-5xl" : "text-[22px] sm:text-2xl"
          }`}
        >
          {z}
        </span>
      </div>
      <span
        className={`absolute bottom-0 left-0 h-[2px] ${positive ? "bg-bull" : "bg-bear"}`}
        style={{ width: `${Math.min(Math.abs(p.z_score) / 4, 1) * 100}%`, boxShadow: "0 0 8px currentColor" }}
      />
    </div>
  );
}

export function PillarHeatmap({ pillars, topDrivers }: Props) {
  const sorted = [...pillars].sort((a, b) => b.weight - a.weight);
  return (
    <TerminalPanel title="pillars.map" path="ibov/top20" right="tam=peso · cor=z">
      <div className="grid auto-rows-[72px] grid-flow-dense grid-cols-4 gap-1.5 sm:grid-cols-6 xl:grid-cols-8">
        {sorted.map((p) => (
          <Cell key={p.ticker} p={p} driver={topDrivers.includes(p.ticker)} />
        ))}
      </div>
    </TerminalPanel>
  );
}
