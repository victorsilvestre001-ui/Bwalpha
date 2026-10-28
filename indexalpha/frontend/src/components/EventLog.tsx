import { useEffect, useRef } from "react";
import type { LogLevel, LogLine } from "../hooks/useEventLog";
import { TerminalPanel } from "./TerminalPanel";

const LEVEL: Record<LogLevel, { tag: string; cls: string }> = {
  sys: { tag: "SYS", cls: "text-cy" },
  tick: { tag: "TCK", cls: "text-ph/45" },
  signal: { tag: "SIG", cls: "text-ph glow" },
  order: { tag: "ORD", cls: "text-cy glow" },
  close: { tag: "CLS", cls: "text-ph" },
  warn: { tag: "WRN", cls: "text-amber glow" },
  macro: { tag: "MAC", cls: "text-amber/80" },
};

export function EventLog({ lines }: { lines: LogLine[] }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight; // rola só o log, não a página
  }, [lines]);

  return (
    <TerminalPanel title="event.log" path="tail -f" bodyClassName="min-h-[340px] p-0" right={<span className="animate-blink text-bear">● REC</span>}>
      <div ref={box} className="absolute inset-0 overflow-y-auto overflow-x-hidden px-3 py-2 text-[11.5px] leading-5">
        {lines.map((l) => (
          <p key={l.id} className="animate-rise break-words">
            <span className="text-ph-dim">{l.time}</span>{" "}
            <span className={LEVEL[l.level].cls}>[{LEVEL[l.level].tag}]</span>{" "}
            <span className={l.level === "tick" ? "text-ph/45" : "text-ph/90"}>{l.text}</span>
          </p>
        ))}
        <p className="cursor text-ph" />
      </div>
    </TerminalPanel>
  );
}
