"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const FALLBACK = [
  { label: "EURUSD", rate: null },
  { label: "EURJPY", rate: null }
];

export default function Ticker() {
  const [quotes, setQuotes] = useState(FALLBACK);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api.publicQuotes().then((q) => { if (Array.isArray(q) && q.length) setQuotes(q); }).catch(() => {});
    api.marketStatus().then((s) => setOpen(!!s?.open)).catch(() => {});
  }, []);

  const items = [
    ...quotes.map((q) => ({ k: q.label, v: q.rate ? q.rate.toFixed(q.label.endsWith("JPY") ? 3 : 5) : "—" })),
    { k: "Mercado", v: open == null ? "—" : open ? "ABERTO" : "FECHADO" },
    { k: "Timeframes", v: "M1 · M5" },
    { k: "Engine", v: "TradeOn AI v2" }
  ];
  const loop = [...items, ...items, ...items, ...items];

  return (
    <div className="relative overflow-hidden border-y border-void-line bg-void-raised/60 py-3">
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap font-mono text-xs">
        {loop.map((it, i) => (
          <span key={i} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-neon" />
            <span className="text-mist-faint">{it.k}</span>
            <span className="text-mist">{it.v}</span>
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-void to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-void to-transparent" />
    </div>
  );
}
