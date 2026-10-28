import { fmtSigned } from "../../lib/format";
import { MPanel } from "./primitives";

const W = 640;
const H = 220;
const PAD_X = 8;
const PAD_Y = 14;

/** Curva suave (Catmull-Rom → Bézier) pelos pontos. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function TrajectoryChart({ history, tickSeconds }: { history: { t: string; score: number }[]; tickSeconds: number }) {
  const y = (v: number) => PAD_Y + ((1 - v) / 2) * (H - 2 * PAD_Y);
  const n = history.length;
  const step = n > 1 ? (W - 2 * PAD_X) / (n - 1) : 0;
  const pts = history.map((p, i) => [PAD_X + i * step, y(p.score)] as [number, number]);
  const line = smoothPath(pts);
  const last = pts[pts.length - 1];
  const lastScore = history[n - 1]?.score ?? 0;
  const color = lastScore >= 0 ? "#3ddc97" : "#ff5a5f";
  const minutes = Math.round((n * tickSeconds) / 60);

  return (
    <MPanel title="Trajetória · Index_Score" right={<span className="font-mono text-[11px] tracking-normal text-white/40">últimos {minutes} min</span>} delay={150}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Trajetória do Index_Score">
        <defs>
          <linearGradient id="traj-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id="traj-glow" x="-10%" y="-30%" width="120%" height="160%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* zonas de disparo */}
        <rect x="0" y={y(1)} width={W} height={y(0.5) - y(1)} fill="#3ddc97" fillOpacity="0.05" />
        <rect x="0" y={y(-0.5)} width={W} height={y(-1) - y(-0.5)} fill="#ff5a5f" fillOpacity="0.05" />
        {[1, 0.5, 0, -0.5, -1].map((g) => (
          <line
            key={g}
            x1="0"
            x2={W}
            y1={y(g)}
            y2={y(g)}
            stroke={g === 0.5 ? "#3ddc97" : g === -0.5 ? "#ff5a5f" : "white"}
            strokeOpacity={Math.abs(g) === 0.5 ? 0.5 : 0.08}
            strokeDasharray={Math.abs(g) === 0.5 ? "4 6" : undefined}
          />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1={(W / 8) * i} x2={(W / 8) * i} y1="0" y2={H} stroke="white" strokeOpacity="0.04" />
        ))}
        <text x={W - 6} y={y(0.5) - 6} textAnchor="end" fill="#3ddc97" fillOpacity="0.8" fontFamily="Barlow Condensed" fontSize="11" letterSpacing="2">
          BUY ZONE
        </text>
        <text x={W - 6} y={y(-0.5) + 15} textAnchor="end" fill="#ff5a5f" fillOpacity="0.8" fontFamily="Barlow Condensed" fontSize="11" letterSpacing="2">
          SELL ZONE
        </text>

        {last && pts.length >= 2 && (
          <>
            <path d={`${line} L${last[0]},${H} L${pts[0][0]},${H} Z`} fill="url(#traj-fill)" />
            <path d={line} fill="none" stroke={color} strokeWidth="2" filter="url(#traj-glow)" />
            <line x1={last[0]} x2={last[0]} y1="0" y2={H} stroke="white" strokeOpacity="0.15" />
            <circle cx={last[0]} cy={last[1]} r="9" fill="none" stroke={color} strokeOpacity="0.6">
              <animate attributeName="r" values="5;14;5" dur="2s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.7;0;0.7" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={last[0]} cy={last[1]} r="4" fill="white" />
            <text
              x={last[0] - 12}
              y={Math.max(16, last[1] - 12)}
              textAnchor="end"
              fill="white"
              fontFamily="Barlow"
              fontWeight={300}
              fontSize="16"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {fmtSigned(lastScore)}
            </text>
          </>
        )}
      </svg>
    </MPanel>
  );
}
