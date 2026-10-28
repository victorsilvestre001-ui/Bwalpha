import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "../../hooks/useMotion";

/** Interpola suavemente até o novo valor (telemetria "deslizando"). */
export function useTween(target: number, ms = 900): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    if (reduced) {
      current.current = target;
      setValue(target);
      return;
    }
    const from = current.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      current.current = from + (target - from) * eased;
      setValue(current.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);

  return value;
}

interface PanelProps {
  title: string;
  right?: ReactNode;
  className?: string;
  delay?: number;
  children: ReactNode;
}

/** Painel de vidro com feixe de luz correndo pela borda superior. */
export function MPanel({ title, right, className = "", delay = 0, children }: PanelProps) {
  return (
    <section
      className={`relative flex min-w-0 animate-enter flex-col border border-white/10 bg-white/[0.025] backdrop-blur-md ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="beam pointer-events-none absolute inset-x-0 top-0 h-px" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/15" />
      <header className="flex items-center justify-between gap-3 px-5 pt-4 font-cond text-[12px] uppercase tracking-[0.28em] text-white/50">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="h-3 w-[2px] shrink-0 bg-ion shadow-[0_0_10px_#4da3ff]" />
          <span className="truncate">{title}</span>
        </span>
        {right && <span className="shrink-0">{right}</span>}
      </header>
      <div className="flex flex-1 flex-col p-5 pt-3">{children}</div>
    </section>
  );
}

export function Chip({ tone, children, pulse = false }: { tone: "go" | "nogo" | "caution" | "ion" | "idle"; children: ReactNode; pulse?: boolean }) {
  const cls = {
    go: "border-go/50 bg-go/10 text-go",
    nogo: "border-nogo/50 bg-nogo/10 text-nogo",
    caution: "border-caution/50 bg-caution/10 text-caution",
    ion: "border-ion/50 bg-ion/10 text-ion",
    idle: "border-white/20 bg-white/5 text-white/60",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-cond text-[11px] uppercase tracking-[0.2em] ${cls}`}>
      {pulse && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current shadow-[0_0_6px_currentColor]" />}
      {children}
    </span>
  );
}
