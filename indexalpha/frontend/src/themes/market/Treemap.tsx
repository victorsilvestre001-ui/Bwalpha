import { useRef } from "react";
import type { Pillar } from "../../types";
import { fmtSigned } from "../../lib/format";
import { fmtChange, useElementWidth } from "./hooks";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Treemap "squarified": blocos o mais quadrados possível, área proporcional ao valor. */
function squarify<T>(items: { item: T; value: number }[], box: Box): (Box & { item: T })[] {
  const total = items.reduce((a, b) => a + b.value, 0);
  if (!total || box.w <= 0 || box.h <= 0) return [];
  const scale = (box.w * box.h) / total;
  const rest = [...items].sort((a, b) => b.value - a.value).map((e) => ({ item: e.item, area: e.value * scale }));
  const worst = (row: typeof rest, side: number) => {
    const s = row.reduce((a, b) => a + b.area, 0);
    const max = Math.max(...row.map((r) => r.area));
    const min = Math.min(...row.map((r) => r.area));
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };

  const out: (Box & { item: T })[] = [];
  let r = { ...box };
  let i = 0;
  while (i < rest.length) {
    const side = Math.min(r.w, r.h);
    const row = [rest[i]];
    let j = i + 1;
    while (j < rest.length && worst([...row, rest[j]], side) <= worst(row, side)) row.push(rest[j++]);
    const s = row.reduce((a, b) => a + b.area, 0);
    if (r.w >= r.h) {
      const cw = s / r.h;
      let y = r.y;
      for (const e of row) {
        const h = e.area / cw;
        out.push({ item: e.item, x: r.x, y, w: cw, h });
        y += h;
      }
      r = { x: r.x + cw, y: r.y, w: r.w - cw, h: r.h };
    } else {
      const rh = s / r.w;
      let x = r.x;
      for (const e of row) {
        const w = e.area / rh;
        out.push({ item: e.item, x, y: r.y, w, h: rh });
        x += w;
      }
      r = { x: r.x, y: r.y + rh, w: r.w, h: r.h - rh };
    }
    i = j;
  }
  return out;
}

/** Vermelho ← cinza → verde conforme o Z-Score (satura em ±2,5). */
function heat(z: number): string {
  const t = Math.max(-1, Math.min(1, z / 2.5));
  const base = [38, 43, 54];
  const target = t >= 0 ? [22, 199, 132] : [234, 57, 67];
  const k = Math.abs(t) * 0.85;
  const [r, g, b] = base.map((c, i) => Math.round(c + (target[i] - c) * k));
  return `rgb(${r},${g},${b})`;
}

const SECTOR_LABEL = 16;

/** Mapa de calor estilo Finviz: setores → ativos, tamanho = peso, cor = Z-Score. */
export function Treemap({ pillars, topDrivers, height }: { pillars: Pillar[]; topDrivers: string[]; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);

  const sectors = new Map<string, Pillar[]>();
  for (const p of pillars) sectors.set(p.sector, [...(sectors.get(p.sector) ?? []), p]);
  const sectorBoxes = squarify(
    [...sectors.entries()].map(([name, items]) => ({ item: { name, items }, value: items.reduce((a, b) => a + b.weight, 0) })),
    { x: 0, y: 0, w: width, h: height },
  );

  return (
    <div ref={ref} className="relative w-full overflow-hidden" style={{ height }}>
      {width > 0 &&
        sectorBoxes.map((s) => {
          const showLabel = s.w > 70 && s.h > 60;
          const inner = { x: s.x + 1, y: s.y + (showLabel ? SECTOR_LABEL : 1), w: s.w - 2, h: s.h - (showLabel ? SECTOR_LABEL + 1 : 2) };
          const tiles = squarify(s.item.items.map((p) => ({ item: p, value: p.weight })), inner);
          return (
            <div key={s.item.name}>
              <div className="absolute border border-mk-bg bg-mk-bg" style={{ left: s.x, top: s.y, width: s.w, height: s.h }} />
              {showLabel && (
                <span
                  className="absolute truncate px-1 font-inter text-[10px] font-semibold uppercase tracking-wider text-mk-muted"
                  style={{ left: s.x + 1, top: s.y + 1, width: s.w - 2, lineHeight: `${SECTOR_LABEL - 2}px` }}
                >
                  {s.item.name}
                </span>
              )}
              {tiles.map((t) => {
                const p = t.item;
                const big = t.w > 90 && t.h > 70;
                const fits = t.w > 46 && t.h > 30;
                const size = Math.max(11, Math.min(26, Math.min(t.w / 4.2, t.h / 3)));
                return (
                  <div
                    key={p.ticker}
                    title={`${p.ticker} · ${p.sector} · peso ${(p.weight * 100).toFixed(1)}% · Z ${fmtSigned(p.z_score)} · ${fmtChange(p.change_pct)}`}
                    className="absolute flex flex-col items-center justify-center overflow-hidden border border-mk-bg font-inter text-white transition-[background-color] duration-700 hover:brightness-125"
                    style={{ left: t.x, top: t.y, width: t.w, height: t.h, backgroundColor: heat(p.z_score) }}
                  >
                    {topDrivers.includes(p.ticker) && (
                      <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-mk-gold shadow-[0_0_6px_#f0b90b]" />
                    )}
                    {fits && (
                      <>
                        <span className="font-bold leading-none drop-shadow" style={{ fontSize: size }}>
                          {p.ticker}
                        </span>
                        <span className="mt-1 tabular-nums leading-none text-white/90" style={{ fontSize: Math.max(10, size * 0.62) }}>
                          {fmtSigned(p.z_score)}σ
                        </span>
                        {big && (
                          <span className="mt-1 text-[11px] tabular-nums text-white/70">
                            {fmtChange(p.change_pct)} · {(p.weight * 100).toFixed(1)}%
                          </span>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
    </div>
  );
}
