import { useId } from "react";
import { useTween } from "./primitives";

interface Props {
  value: number;
  min: number;
  max: number;
  /** De onde o arco de valor parte (0 num medidor -1..+1). */
  origin?: number;
  label: string;
  display: (v: number) => string;
  color: string;
  markers?: { at: number; color: string }[];
  sweep?: number;
  big?: boolean;
  className?: string;
}

const C = 100;
const R = 84;

/** Medidor circular estilo telemetria de lançamento. */
export function Gauge({ value, min, max, origin, label, display, color, markers = [], sweep = 260, big = false, className = "" }: Props) {
  const v = useTween(value);
  const id = useId().replace(/:/g, "");
  const start = 90 + (360 - sweep) / 2;
  const clamp = (x: number) => Math.min(max, Math.max(min, x));
  const ang = (x: number) => start + ((clamp(x) - min) / (max - min)) * sweep;
  const pt = (a: number, r = R): [number, number] => [C + r * Math.cos((a * Math.PI) / 180), C + r * Math.sin((a * Math.PI) / 180)];
  const arc = (a0: number, a1: number, r = R) => {
    const [lo, hi] = a0 <= a1 ? [a0, a1] : [a1, a0];
    const [x0, y0] = pt(lo, r);
    const [x1, y1] = pt(hi, r);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${hi - lo > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };

  const a0 = ang(origin ?? min);
  const a1 = ang(v);
  const [tx, ty] = pt(a1);
  const ticks = Array.from({ length: 41 }, (_, i) => start + (i / 40) * sweep);

  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label={`${label}: ${display(value)}`}>
      <defs>
        <filter id={`g${id}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {ticks.map((a, i) => {
        const major = i % 10 === 0;
        const [x0, y0] = pt(a, R - (major ? 16 : 12));
        const [x1, y1] = pt(a, R - 8);
        return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="white" strokeOpacity={major ? 0.5 : 0.18} strokeWidth={major ? 1.2 : 0.8} />;
      })}

      <path d={arc(start, start + sweep)} fill="none" stroke="white" strokeOpacity="0.1" strokeWidth="4" strokeLinecap="round" />
      {Math.abs(a1 - a0) > 0.4 && (
        <path d={arc(a0, a1)} fill="none" stroke={color} strokeWidth="4.5" strokeLinecap="round" filter={`url(#g${id})`} />
      )}

      {markers.map((m) => {
        const [x0, y0] = pt(ang(m.at), R - 18);
        const [x1, y1] = pt(ang(m.at), R + 6);
        return <line key={m.at} x1={x0} y1={y0} x2={x1} y2={y1} stroke={m.color} strokeWidth="1.5" strokeOpacity="0.9" />;
      })}

      <circle cx={tx} cy={ty} r="4.5" fill="white" filter={`url(#g${id})`} />

      <text
        x={C}
        y={big ? 108 : 106}
        textAnchor="middle"
        fill="white"
        fontFamily="Barlow"
        fontWeight={200}
        fontSize={big ? 46 : 34}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {display(v)}
      </text>
      <text x={C} y={big ? 136 : 130} textAnchor="middle" fill="white" fillOpacity="0.5" fontFamily="Barlow Condensed" fontSize="11" letterSpacing="3">
        {label.toUpperCase()}
      </text>
    </svg>
  );
}
