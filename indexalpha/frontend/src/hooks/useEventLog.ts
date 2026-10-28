import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../types";
import { fmtBRL, fmtPct, fmtPoints, fmtSigned } from "../lib/format";

export type LogLevel = "sys" | "tick" | "signal" | "order" | "close" | "warn" | "macro";

export interface LogLine {
  id: number;
  time: string;
  level: LogLevel;
  text: string;
}

const MAX_LINES = 60;

/** Gera um log de eventos comparando cada snapshot com o anterior. */
export function useEventLog(data: Snapshot | null): LogLine[] {
  const [lines, setLines] = useState<LogLine[]>([]);
  const prev = useRef<Snapshot | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!data) return;
    const p = prev.current;
    if (p && p.timestamp === data.timestamp) return;
    const time = new Date(data.timestamp).toLocaleTimeString("pt-BR", { hour12: false });
    const out: Omit<LogLine, "id">[] = [];
    const push = (level: LogLevel, text: string) => out.push({ time, level, text });

    if (!p) {
      push("sys", `engine online · WIN ${fmtPoints(data.market.win_price)} · ${data.pillars.length} pilares`);
      push("sys", data.ai_enabled ? "contextual_ai: LLM conectado" : "contextual_ai: modo regras (sem chave)");
      push("macro", data.market.macro_scenario);
    } else {
      push(
        "tick",
        `score=${fmtSigned(data.index_score)} flow=${fmtSigned(data.market.foreign_flow, 0)} vol=${data.market.vix.toFixed(1)}`,
      );
      if (p.signal.action !== data.signal.action) {
        push(
          "signal",
          `${p.signal.action} → ${data.signal.action} · score ${fmtSigned(data.index_score)} · conf ${fmtPct(data.signal.confidence)}`,
        );
      }
      if (!p.signal.volatility_filter_applied && data.signal.volatility_filter_applied) {
        push("warn", `vol implícita ${data.market.vix.toFixed(1)}% > 25% · confiança −50%`);
      }
      if (p.market.macro_scenario !== data.market.macro_scenario) {
        push("macro", data.market.macro_scenario);
      }
      if (p.top_drivers[0] !== data.top_drivers[0]) {
        push("sys", `driver principal → ${data.top_drivers[0]} · top3 ${data.top_drivers.join(" · ")}`);
      }

      const before = new Map(p.history.map((h) => [h.id, h]));
      for (const h of [...data.history].reverse()) {
        const old = before.get(h.id);
        if (!old) {
          push(
            "order",
            `#${h.id} ${h.action} @${fmtPoints(h.entry_price)} stop ${fmtPoints(h.stop_loss)} alvo ${fmtPoints(h.take_profit)}`,
          );
        } else if (old.status === "open" && h.status === "closed") {
          push(
            "close",
            `#${h.id} ${h.exit_reason} ${fmtSigned(h.pnl_points, 0)} pts (${fmtBRL(h.pnl_brl)})`,
          );
        }
      }
    }

    prev.current = data;
    setLines((cur) =>
      [...cur, ...out.map((l) => ({ ...l, id: ++seq.current }))].slice(-MAX_LINES),
    );
  }, [data]);

  return lines;
}
