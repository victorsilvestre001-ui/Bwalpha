import { useEffect, useRef, useState, type RefObject } from "react";

/** Largura atual de um elemento (ResizeObserver), para desenhar SVG nítido em qualquer tela. */
export function useElementWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** "up"/"down" por ~900 ms quando o valor sobe ou cai: o flash verde/vermelho do home broker. */
export function useFlash(value: number): "up" | "down" | null {
  const prev = useRef(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (value === prev.current) return;
    setFlash(value > prev.current ? "up" : "down");
    prev.current = value;
    const id = window.setTimeout(() => setFlash(null), 900);
    return () => window.clearTimeout(id);
  }, [value]);
  return flash;
}

export const flashBg = { up: "bg-mk-up/25", down: "bg-mk-down/25" } as const;

const price = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtPrice = (v: number): string => price.format(v);
export const fmtChange = (v: number, digits = 2): string =>
  `${v >= 0 ? "+" : ""}${v.toFixed(digits).replace(".", ",")}%`;
export const upDown = (v: number): string => (v > 0 ? "text-mk-up" : v < 0 ? "text-mk-down" : "text-mk-muted");
