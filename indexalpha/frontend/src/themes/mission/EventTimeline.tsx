import type { LogLevel, LogLine } from "../../hooks/useEventLog";
import { MPanel } from "./primitives";

const LEVEL: Record<Exclude<LogLevel, "tick">, { label: string; dot: string; text: string }> = {
  sys: { label: "Sistema", dot: "bg-ion", text: "text-ion" },
  signal: { label: "Sinal", dot: "bg-white", text: "text-white" },
  order: { label: "Ordem", dot: "bg-go", text: "text-go" },
  close: { label: "Encerrada", dot: "bg-white/60", text: "text-white/70" },
  warn: { label: "Caution", dot: "bg-caution", text: "text-caution" },
  macro: { label: "Macro", dot: "bg-caution/70", text: "text-caution/80" },
};

/** Linha do tempo da missão: eventos relevantes, mais recentes no topo. */
export function EventTimeline({ lines }: { lines: LogLine[] }) {
  const events = lines.filter((l) => l.level !== "tick").slice(-16).reverse();
  const ticks = lines.filter((l) => l.level === "tick").length;

  return (
    <MPanel title="Mission events" right={<span className="font-mono text-[11px] tracking-normal text-white/40">{ticks} ticks</span>} delay={250}>
      <ol className="relative max-h-[300px] space-y-3 overflow-y-auto overflow-x-hidden pl-5 lg:max-h-none lg:flex-1">
        <span className="absolute bottom-0 left-[5px] top-1 w-px bg-gradient-to-b from-ion/60 via-white/10 to-transparent" />
        {events.length === 0 && <li className="text-sm text-white/40">Aguardando eventos…</li>}
        {events.map((e, i) => {
          const lv = LEVEL[e.level as Exclude<LogLevel, "tick">];
          return (
            <li key={e.id} className="relative animate-enter">
              <span
                className={`absolute -left-5 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-black ${lv.dot} ${
                  i === 0 ? "shadow-[0_0_10px_currentColor] ring-2 ring-ion/40" : ""
                }`}
              />
              <p className="flex items-baseline gap-2 font-cond text-[11px] uppercase tracking-[0.2em]">
                <span className="font-mono tracking-normal text-white/35">{e.time}</span>
                <span className={lv.text}>{lv.label}</span>
              </p>
              <p className="break-words text-[13px] leading-snug text-white/80">{e.text}</p>
            </li>
          );
        })}
      </ol>
    </MPanel>
  );
}
