import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { Candle, SignalRecord } from "../../types";
import { fmtPoints, fmtSigned } from "../../lib/format";
import { useTween } from "../mission/primitives";
import { useElementWidth } from "./hooks";

const UP = "#16c784";
const DOWN = "#ea3943";
const PAD_T = 12;
const GAP = 30;
const AXIS_B = 22;
const AXIS_R = 76;

/** Passo "redondo" para a grade de preços (1, 2, 2,5, 5 × 10ⁿ). */
function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

interface Props {
  candles: Candle[];
  history: SignalRecord[];
  openPosition: SignalRecord | null;
  lastPrice: number;
}

/** Gráfico de candles do WIN com volume, preço ao vivo, entradas, níveis da posição e o Index_Score num painel inferior. */
export function PriceChart({ candles, history, openPosition, lastPrice }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(box);
  const [hover, setHover] = useState<{ i: number; y: number } | null>(null);
  const animated = useTween(lastPrice, 600);

  const W = Math.max(320, width);
  // Em telas largas o gráfico cresce para acompanhar a altura da boleta ao lado.
  const H_PRICE = W >= 900 ? 410 : 300;
  const H_SCORE = W >= 900 ? 104 : 92;
  const H = PAD_T + H_PRICE + GAP + H_SCORE + AXIS_B;
  const plotW = W - AXIS_R;
  const n = candles.length;
  const slot = n ? plotW / n : 1;
  const bodyW = Math.max(1.5, slot * 0.62);

  const levels = openPosition ? [openPosition.stop_loss, openPosition.take_profit, openPosition.entry_price] : [];
  const lo = Math.min(...candles.map((c) => c.l), ...levels, lastPrice);
  const hi = Math.max(...candles.map((c) => c.h), ...levels, lastPrice);
  const pad = Math.max((hi - lo) * 0.08, 40);
  const yMin = lo - pad;
  const yMax = hi + pad;
  const py = (v: number) => PAD_T + ((yMax - v) / (yMax - yMin)) * H_PRICE;
  const vMax = Math.max(1, ...candles.map((c) => c.v));
  const volH = H_PRICE * 0.2;
  const scoreTop = PAD_T + H_PRICE + GAP;
  const sy = (s: number) => scoreTop + ((1 - s) / 2) * H_SCORE;
  const cx = (i: number) => i * slot + slot / 2;

  const step = niceStep((yMax - yMin) / 6);
  const ticks: number[] = [];
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) ticks.push(v);
  const labelEvery = Math.max(1, Math.ceil(80 / slot));

  const last = candles[n - 1];
  const lastUp = last ? last.c >= last.o : true;
  const shown = candles[hover?.i ?? n - 1];
  const times = candles.map((c) => Date.parse(c.t));
  const markers = history
    .map((h) => {
      const t = Date.parse(h.timestamp);
      let idx = -1;
      for (let i = 0; i < times.length; i++) if (times[i] <= t) idx = i;
      return { h, idx };
    })
    .filter((m) => m.idx >= 0);

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x > plotW || n === 0) return setHover(null);
    setHover({ i: Math.min(n - 1, Math.max(0, Math.floor(x / slot))), y: e.clientY - rect.top });
  };
  const hoverPrice = hover && hover.y >= PAD_T && hover.y <= PAD_T + H_PRICE ? yMax - ((hover.y - PAD_T) / H_PRICE) * (yMax - yMin) : null;

  const scorePath = candles.map((c, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${sy(c.score).toFixed(1)}`).join(" ");
  // Ao chegar um candle novo, o grupo desliza um "slot" para a esquerda.
  const shiftStyle = { "--slot": `${slot}px` } as CSSProperties;

  return (
    <div ref={box} className="relative w-full select-none">
      {shown && (
        <div className="pointer-events-none absolute left-2 top-1 z-10 flex flex-wrap gap-x-3 font-inter text-[11px] tabular-nums text-mk-muted">
          <span>{hhmm(shown.t)}</span>
          {(["o", "h", "l", "c"] as const).map((k) => (
            <span key={k}>
              {k.toUpperCase()} <span className={shown.c >= shown.o ? "text-mk-up" : "text-mk-down"}>{fmtPoints(shown[k])}</span>
            </span>
          ))}
          <span>
            Vol <span className="text-mk-text">{shown.v.toLocaleString("pt-BR")}</span>
          </span>
        </div>
      )}

      {width > 0 && n > 0 && (
        <svg
          width={W}
          height={H}
          className="block touch-none"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label="Gráfico de candles do WIN"
        >
          <defs>
            <clipPath id="plot-clip">
              <rect x="0" y="0" width={plotW} height={H} />
            </clipPath>
            <linearGradient id="score-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2f6bff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#2f6bff" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* grade e eixo de preço */}
          {ticks.map((v) => (
            <g key={v}>
              <line x1="0" x2={plotW} y1={py(v)} y2={py(v)} stroke="#232a36" />
              <text x={plotW + 8} y={py(v) + 4} fill="#7d8594" fontSize="11" fontFamily="Inter" style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmtPoints(v)}
              </text>
            </g>
          ))}
          {candles.map((c, i) =>
            i % labelEvery === 0 ? (
              <g key={c.t}>
                <line x1={cx(i)} x2={cx(i)} y1={PAD_T} y2={scoreTop + H_SCORE} stroke="#232a36" strokeOpacity="0.6" />
                <text x={cx(i)} y={H - 6} textAnchor="middle" fill="#7d8594" fontSize="11" fontFamily="Inter">
                  {hhmm(c.t)}
                </text>
              </g>
            ) : null,
          )}
          <line x1={plotW} x2={plotW} y1="0" y2={H - AXIS_B} stroke="#232a36" />

          <g clipPath="url(#plot-clip)">
            <g key={candles[0].t} className="candle-shift" style={shiftStyle}>
              {/* volume */}
              {candles.map((c, i) => {
                const h = (c.v / vMax) * volH;
                return (
                  <rect
                    key={`v${c.t}`}
                    x={cx(i) - bodyW / 2}
                    y={PAD_T + H_PRICE - h}
                    width={bodyW}
                    height={h}
                    fill={c.c >= c.o ? UP : DOWN}
                    fillOpacity="0.18"
                  />
                );
              })}
              {/* candles */}
              {candles.map((c, i) => {
                const up = c.c >= c.o;
                const color = up ? UP : DOWN;
                const top = py(Math.max(c.o, c.c));
                const bodyH = Math.max(1, Math.abs(py(c.o) - py(c.c)));
                return (
                  <g key={c.t}>
                    <line x1={cx(i)} x2={cx(i)} y1={py(c.h)} y2={py(c.l)} stroke={color} strokeWidth="1" />
                    <rect x={cx(i) - bodyW / 2} y={top} width={bodyW} height={bodyH} fill={color} rx="0.5" />
                  </g>
                );
              })}
              {/* entradas do IndexAlpha */}
              {markers.map(({ h, idx }) => {
                const c = candles[idx];
                const buy = h.action === "BUY";
                const y = buy ? py(c.l) + 14 : py(c.h) - 14;
                return (
                  <g key={h.id}>
                    <path
                      d={buy ? `M${cx(idx)},${y - 6} l6,10 h-12 Z` : `M${cx(idx)},${y + 6} l6,-10 h-12 Z`}
                      fill={buy ? UP : DOWN}
                      stroke="#0b0e13"
                      strokeWidth="1"
                    />
                    <text x={cx(idx)} y={buy ? y + 16 : y - 10} textAnchor="middle" fill={buy ? UP : DOWN} fontSize="10" fontFamily="Inter" fontWeight={600}>
                      #{h.id}
                    </text>
                  </g>
                );
              })}
              {/* painel do Index_Score: histograma + linha */}
              {candles.map((c, i) => (
                <rect
                  key={`s${c.t}`}
                  x={cx(i) - bodyW / 2}
                  y={Math.min(sy(0), sy(c.score))}
                  width={bodyW}
                  height={Math.abs(sy(c.score) - sy(0))}
                  fill={c.score >= 0 ? UP : DOWN}
                  fillOpacity="0.35"
                />
              ))}
              <path d={scorePath} fill="none" stroke="#2f6bff" strokeWidth="1.5" />
            </g>
          </g>

          {/* níveis da posição aberta: linha no gráfico, nome à esquerda e etiqueta de preço no eixo */}
          {openPosition &&
            [
              { v: openPosition.take_profit, label: "ALVO", color: UP, dash: "6 3", text: "#0b0e13" },
              { v: openPosition.entry_price, label: `ENTRADA #${openPosition.id}`, color: "#9aa3b2", dash: "4 4", text: "#0b0e13" },
              { v: openPosition.stop_loss, label: "STOP", color: DOWN, dash: "6 3", text: "#ffffff" },
            ].map((l) => (
              <g key={l.label}>
                <line x1="0" x2={plotW} y1={py(l.v)} y2={py(l.v)} stroke={l.color} strokeOpacity="0.7" strokeDasharray={l.dash} />
                <text x="6" y={py(l.v) - 5} fill={l.color} fontSize="10" fontFamily="Inter" fontWeight={600} letterSpacing="0.5">
                  {l.label}
                </text>
                <rect x={plotW + 1} y={py(l.v) - 9} width={AXIS_R - 2} height="18" rx="2" fill={l.color} fillOpacity="0.9" />
                <text x={plotW + AXIS_R / 2} y={py(l.v) + 4} textAnchor="middle" fill={l.text} fontSize="11" fontWeight={600} fontFamily="Inter">
                  {fmtPoints(l.v)}
                </text>
              </g>
            ))}

          {/* preço ao vivo */}
          <line x1="0" x2={plotW} y1={py(animated)} y2={py(animated)} stroke={lastUp ? UP : DOWN} strokeDasharray="2 3" strokeOpacity="0.8" />
          <circle cx={cx(n - 1)} cy={py(animated)} r="3.5" fill={lastUp ? UP : DOWN}>
            <animate attributeName="r" values="3;7;3" dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="fill-opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite" />
          </circle>
          <rect x={plotW + 1} y={py(animated) - 10} width={AXIS_R - 2} height="20" rx="2" fill={lastUp ? UP : DOWN} />
          <text x={plotW + AXIS_R / 2} y={py(animated) + 4} textAnchor="middle" fill="#0b0e13" fontSize="11.5" fontWeight={700} fontFamily="Inter" style={{ fontVariantNumeric: "tabular-nums" }}>
            {fmtPoints(Math.round(animated / 5) * 5)}
          </text>

          {/* eixo do painel de score */}
          <line x1="0" x2={W} y1={scoreTop - GAP / 2} y2={scoreTop - GAP / 2} stroke="#232a36" />
          <text x="8" y={scoreTop - 2} fill="#7d8594" fontSize="11" fontFamily="Inter">
            Index_Score <tspan fill="#2f6bff">{fmtSigned(shown?.score ?? 0)}</tspan>
          </text>
          {[0.5, 0, -0.5].map((g) => (
            <g key={g}>
              <line
                x1="0"
                x2={plotW}
                y1={sy(g)}
                y2={sy(g)}
                stroke={g === 0 ? "#3a4252" : g > 0 ? UP : DOWN}
                strokeOpacity={g === 0 ? 1 : 0.5}
                strokeDasharray={g === 0 ? undefined : "4 4"}
              />
              <text x={plotW + 8} y={sy(g) + 4} fill="#7d8594" fontSize="11" fontFamily="Inter">
                {fmtSigned(g)}
              </text>
            </g>
          ))}

          {/* crosshair */}
          {hover && (
            <g pointerEvents="none">
              <line x1={cx(hover.i)} x2={cx(hover.i)} y1={PAD_T} y2={scoreTop + H_SCORE} stroke="#7d8594" strokeDasharray="3 3" />
              {hoverPrice !== null && (
                <>
                  <line x1="0" x2={plotW} y1={hover.y} y2={hover.y} stroke="#7d8594" strokeDasharray="3 3" />
                  <rect x={plotW + 1} y={hover.y - 10} width={AXIS_R - 2} height="20" rx="2" fill="#363c4a" />
                  <text x={plotW + AXIS_R / 2} y={hover.y + 4} textAnchor="middle" fill="#d1d4dc" fontSize="11" fontFamily="Inter">
                    {fmtPoints(hoverPrice)}
                  </text>
                </>
              )}
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
