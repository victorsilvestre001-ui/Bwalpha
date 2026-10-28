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
  HOLD: "text-cy",
};

export const actionBadge: Record<Action, string> = {
  BUY: "border-bull/60 bg-bull/10 text-bull",
  SELL: "border-bear/60 bg-bear/10 text-bear",
  HOLD: "border-cy/50 bg-cy/10 text-cy",
};

export const signColor = (v: number): string =>
  v > 0 ? "text-bull" : v < 0 ? "text-bear" : "text-ph-dim";

/** Barra ASCII: [██████░░░░] */
export const asciiBar = (fraction: number, width = 20): string => {
  const filled = Math.round(Math.min(1, Math.max(0, fraction)) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
};

/** Linha de "chave ........ valor" com pontos de preenchimento. */
export const dotted = (label: string, width = 16): string => `${label} ${".".repeat(Math.max(2, width - label.length))}`;
