import type { Action } from "../types";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const points = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export const fmtBRL = (v: number): string => brl.format(v);
export const fmtPoints = (v: number): string => points.format(v);
export const fmtSigned = (v: number, digits = 2): string =>
  `${v >= 0 ? "+" : ""}${v.toFixed(digits).replace(".", ",")}`;
export const fmtPct = (v: number, digits = 0): string =>
  `${(v * 100).toFixed(digits).replace(".", ",")}%`;
export const fmtTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const actionColor: Record<Action, string> = {
  BUY: "text-bull",
  SELL: "text-bear",
  HOLD: "text-slate-300",
};

export const actionBadge: Record<Action, string> = {
  BUY: "bg-bull/15 text-bull ring-bull/40",
  SELL: "bg-bear/15 text-bear ring-bear/40",
  HOLD: "bg-slate-500/15 text-slate-300 ring-slate-500/40",
};

export const signColor = (v: number): string =>
  v > 0 ? "text-bull" : v < 0 ? "text-bear" : "text-slate-400";
