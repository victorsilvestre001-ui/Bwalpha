import type { Snapshot } from "../types";
import { usePulse, useScramble } from "../hooks/useMotion";
import { actionBadge, actionColor, asciiBar, dotted, fmtPct, fmtPoints, fmtSigned, signColor } from "../lib/format";
import { TerminalPanel } from "./TerminalPanel";

interface Props {
  data: Snapshot;
  syncCount: number;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 300;
  const h = 80;
  const y = (v: number) => ((1 - v) / 2) * h; // escala fixa -1..+1
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, y(v)] as const);
  const path = pts.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  const color = values[values.length - 1] >= 0 ? "#39ff88" : "#ff3b5c";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full" aria-label="Evolução do Index_Score">
      <defs>
        <filter id="neon" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {[0.5, 0, -0.5].map((g) => (
        <line
          key={g}
          x1="0"
          x2={w}
          y1={y(g)}
          y2={y(g)}
          stroke={g === 0 ? "#1f9a55" : g > 0 ? "#39ff88" : "#ff3b5c"}
          strokeOpacity={g === 0 ? 0.5 : 0.35}
          strokeDasharray={g === 0 ? undefined : "2 4"}
        />
      ))}
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" filter="url(#neon)" />
      <circle cx={lx} cy={ly} r="3" fill={color} filter="url(#neon)">
        <animate attributeName="r" values="2.5;5;2.5" dur="1.4s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export function HeaderStatus({ data, syncCount }: Props) {
  const { signal, market } = data;
  const scoreText = fmtSigned(data.index_score);
  const scrambled = useScramble(scoreText, 16, 30);
  const glitching = usePulse(signal.action, 700);

  return (
    <TerminalPanel
      title="index_score"
      path="~/engine/live"
      right={<span className="text-ph-dim">sync #{syncCount.toString().padStart(4, "0")}</span>}
    >
      <div className="grid gap-6 lg:grid-cols-[auto_1fr_auto] lg:items-center">
        <div className={glitching ? "shake" : ""}>
          <p className="text-[11px] uppercase tracking-[0.3em] text-ph-dim">&gt; Σ peso × z-score</p>
          <p
            data-text={scoreText}
            className={`glitch glow-strong font-display text-8xl leading-none tabular-nums ${signColor(data.index_score)} ${
              glitching ? "is-glitching" : ""
            }`}
          >
            {scrambled}
          </p>
          <p className="mt-1 text-xs text-ph-dim">
            raw = <span className="text-ph/80">{fmtSigned(data.raw_score, 3)}</span> · tanh(raw) · cobertura{" "}
            {fmtPct(data.coverage)}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-ph-dim">signal::</p>
            <p
              className={`glow-strong mt-1 inline-block border px-4 py-1 font-display text-5xl leading-none ${actionBadge[signal.action]} ${
                glitching ? "shake" : ""
              }`}
            >
              {signal.action}
              <span className="animate-blink">_</span>
            </p>
            <p className={`mt-3 whitespace-nowrap text-sm ${actionColor[signal.action]}`}>
              conf [<span className="glow">{asciiBar(signal.confidence, 16)}</span>] {fmtPct(signal.confidence)}
            </p>
            {signal.volatility_filter_applied && (
              <p className="glow mt-1 animate-blink text-xs text-amber">!! VOL FILTER ATIVO · confiança −50%</p>
            )}
          </div>
          <Sparkline values={data.score_history.map((p) => p.score)} />
        </div>

        <dl className="grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-sm">
          <dt className="whitespace-pre text-ph-dim">{dotted("WIN", 12)}</dt>
          <dd className="glow text-right tabular-nums text-ph">{fmtPoints(market.win_price)}</dd>
          <dt className="whitespace-pre text-ph-dim">{dotted("FLUXO.ESTR", 12)}</dt>
          <dd className={`text-right tabular-nums ${signColor(market.foreign_flow)}`}>
            {fmtSigned(market.foreign_flow, 0)} mi
          </dd>
          <dt className="whitespace-pre text-ph-dim">{dotted("VOL.IMPL", 12)}</dt>
          <dd className={`text-right tabular-nums ${market.vix > 25 ? "glow text-amber" : "text-ph"}`}>
            {market.vix.toFixed(1)}%
          </dd>
          <dt className="whitespace-pre text-ph-dim">{dotted("ATR", 12)}</dt>
          <dd className="text-right tabular-nums text-ph">{market.atr_pct.toFixed(2)}%</dd>
        </dl>
      </div>
    </TerminalPanel>
  );
}
