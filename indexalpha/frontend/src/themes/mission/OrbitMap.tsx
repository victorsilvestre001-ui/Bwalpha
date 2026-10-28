import type { Pillar } from "../../types";
import { fmtSigned } from "../../lib/format";
import { useTween } from "./primitives";

const C = 260;
const RINGS = [
  { min: 0.1, r: 92, offset: -90, period: 110, reverse: false },
  { min: 0.04, r: 155, offset: -60, period: 160, reverse: true },
  { min: 0, r: 212, offset: -75, period: 220, reverse: false },
];

function zColor(z: number): string {
  return z >= 0 ? "#3ddc97" : "#ff5a5f";
}

/** Os 20 pilares como satélites orbitando o índice: órbita = faixa de peso, tamanho = peso, cor = Z-Score. */
export function OrbitMap({ pillars, topDrivers, score }: { pillars: Pillar[]; topDrivers: string[]; score: number }) {
  const s = useTween(score);
  const sorted = [...pillars].sort((a, b) => b.weight - a.weight);
  const groups = RINGS.map((ring, i) =>
    sorted.filter((p) => p.weight >= ring.min && (i === 0 || p.weight < RINGS[i - 1].min)),
  );

  return (
    <svg viewBox="0 0 520 520" className="h-auto w-full" role="img" aria-label="Mapa orbital dos pilares do Ibovespa">
      <defs>
        <radialGradient id="core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4da3ff" stopOpacity="0.45" />
          <stop offset="70%" stopColor="#4da3ff" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#4da3ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="scan" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4da3ff" stopOpacity="0" />
          <stop offset="100%" stopColor="#4da3ff" stopOpacity="0.22" />
        </linearGradient>
        <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* varredura de radar */}
      <g className="orbit" style={{ animationDuration: "9s" }}>
        <path d={`M${C},${C} L${C + 228},${C} A228,228 0 0 0 ${C + 228 * Math.cos(-0.6)},${C + 228 * Math.sin(-0.6)} Z`} fill="url(#scan)" />
      </g>

      {RINGS.map((ring) => (
        <circle key={ring.r} cx={C} cy={C} r={ring.r} fill="none" stroke="white" strokeOpacity="0.1" strokeDasharray="2 5" />
      ))}

      {RINGS.map((ring, ri) => {
        const items = groups[ri];
        return (
          <g
            key={ring.r}
            className="orbit"
            style={{ animationDuration: `${ring.period}s`, animationDirection: ring.reverse ? "reverse" : "normal" }}
          >
            {items.map((p, i) => {
              const a = ((ring.offset + (360 / items.length) * i) * Math.PI) / 180;
              const x = C + ring.r * Math.cos(a);
              const y = C + ring.r * Math.sin(a);
              const size = 5 + p.weight * 85;
              const color = zColor(p.z_score);
              const driver = topDrivers.includes(p.ticker);
              const intensity = Math.min(Math.abs(p.z_score) / 2.5, 1);
              return (
                <g key={p.ticker}>
                  {driver && (
                    <line x1={C} y1={C} x2={x} y2={y} stroke="#4da3ff" strokeOpacity="0.55" strokeDasharray="3 7" className="dash-flow" />
                  )}
                  <g
                    className="orbit-counter"
                    style={{
                      transformOrigin: `${x}px ${y}px`,
                      animationDuration: `${ring.period}s`,
                      animationDirection: ring.reverse ? "normal" : "reverse",
                    }}
                  >
                    {driver && (
                      <circle cx={x} cy={y} r={size + 6} fill="none" stroke="#4da3ff" strokeOpacity="0.7">
                        <animate attributeName="r" values={`${size + 3};${size + 14};${size + 3}`} dur="2.4s" repeatCount="indefinite" />
                        <animate attributeName="stroke-opacity" values="0.8;0;0.8" dur="2.4s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle
                      cx={x}
                      cy={y}
                      r={size}
                      fill={color}
                      fillOpacity={0.12 + intensity * 0.45}
                      stroke={color}
                      strokeOpacity={0.5 + intensity * 0.5}
                      strokeWidth="1.2"
                      filter="url(#node-glow)"
                      style={{ transition: "fill 700ms, stroke 700ms, fill-opacity 700ms" }}
                    >
                      <title>{`${p.ticker} · peso ${(p.weight * 100).toFixed(1)}% · Z ${fmtSigned(p.z_score)}`}</title>
                    </circle>
                    <text x={x} y={y + size + 13} textAnchor="middle" fill="white" fillOpacity="0.85" fontFamily="Barlow Condensed" fontSize="12" letterSpacing="1">
                      {p.ticker}
                    </text>
                    <text
                      x={x}
                      y={y + size + 26}
                      textAnchor="middle"
                      fill={color}
                      fontFamily="Barlow"
                      fontSize="11"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {fmtSigned(p.z_score)}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        );
      })}

      <circle cx={C} cy={C} r="62" fill="url(#core)" />
      <circle cx={C} cy={C} r="44" fill="black" fillOpacity="0.6" stroke="#4da3ff" strokeOpacity="0.6" />
      <circle cx={C} cy={C} r="50" fill="none" stroke="#4da3ff" strokeOpacity="0.25" strokeDasharray="1 4" className="orbit" style={{ animationDuration: "30s" }} />
      <text x={C} y={C - 10} textAnchor="middle" fill="white" fillOpacity="0.5" fontFamily="Barlow Condensed" fontSize="11" letterSpacing="3">
        IBOV
      </text>
      <text
        x={C}
        y={C + 18}
        textAnchor="middle"
        fill={zColor(s)}
        fontFamily="Barlow"
        fontWeight={300}
        fontSize="26"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {fmtSigned(s)}
      </text>
    </svg>
  );
}
