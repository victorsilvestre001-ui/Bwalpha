import type { Snapshot } from "../../types";
import { fmtPoints, fmtSigned } from "../../lib/format";
import { flashBg, fmtChange, fmtPrice, upDown, useFlash } from "./hooks";

function Item({ label, value, change, raw }: { label: string; value: string; change: number; raw: number }) {
  const flash = useFlash(raw);
  return (
    <span className={`inline-flex items-center gap-2 rounded px-3 py-1 transition-colors duration-700 ${flash ? flashBg[flash] : ""}`}>
      <span className="font-semibold text-mk-text">{label}</span>
      <span className="tabular-nums text-mk-text/90">{value}</span>
      <span className={`tabular-nums ${upDown(change)}`}>
        {change >= 0 ? "▲" : "▼"} {fmtChange(Math.abs(change)).replace("+", "")}
      </span>
    </span>
  );
}

/** Fita de cotações rolando (pausa ao passar o mouse). */
export function TickerTape({ data }: { data: Snapshot }) {
  const open = data.market.session_open ?? data.market.win_price;
  const winChange = ((data.market.win_price / open) - 1) * 100;
  const items = (
    <>
      <Item label="WIN" value={fmtPoints(data.market.win_price)} change={winChange} raw={data.market.win_price} />
      <span className="inline-flex items-center gap-2 px-3 py-1">
        <span className="font-semibold text-mk-accent">IA SCORE</span>
        <span className={`tabular-nums ${upDown(data.index_score)}`}>{fmtSigned(data.index_score)}</span>
      </span>
      {[...data.pillars]
        .sort((a, b) => b.weight - a.weight)
        .map((p) => (
          <Item key={p.ticker} label={p.ticker} value={fmtPrice(p.price)} change={p.change_pct} raw={p.price} />
        ))}
    </>
  );
  return (
    <div className="relative overflow-hidden border-y border-mk-line bg-mk-panel/80 font-inter text-[12.5px]">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-mk-bg to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-mk-bg to-transparent" />
      <div className="marquee flex w-max whitespace-nowrap py-1.5">
        <div className="flex">{items}</div>
        <div className="flex" aria-hidden>
          {items}
        </div>
      </div>
    </div>
  );
}
