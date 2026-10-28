import { useState } from "react";
import type { Action, Thesis } from "../types";
import { useTypewriter } from "../hooks/useMotion";
import { fmtTime } from "../lib/format";
import { TerminalPanel } from "./TerminalPanel";

interface Props {
  thesis: Thesis | null;
  action: Action;
  drivers: string[];
  macroScenario: string;
  aiEnabled: boolean;
  onRefresh: () => Promise<void>;
}

export function AIThesisCard({ thesis, action, drivers, macroScenario, aiEnabled, onRefresh }: Props) {
  const [busy, setBusy] = useState(false);
  const { shown, done } = useTypewriter(thesis?.thesis_text ?? "", 16);
  const source = thesis?.source === "llm" ? thesis.model ?? "llm" : aiEnabled ? "aguardando llm" : "modo regras";

  const refresh = async () => {
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      window.setTimeout(() => setBusy(false), 1500);
    }
  };

  return (
    <TerminalPanel title="contextual_ai" path="tese" accent="cy" right={<span className="text-cy/70">{source}</span>}>
      <p className="break-words text-xs text-ph-dim">
        <span className="text-cy">root@indexalpha</span>:<span className="text-ph">~</span>$ claude analyze --signal {action}{" "}
        --drivers {drivers.join(",")}
      </p>

      <p className={`mt-3 min-h-[7.5rem] text-[15px] leading-relaxed text-ph/90 ${done ? "" : "cursor"}`}>
        {thesis ? shown : "processando…"}
      </p>

      {thesis?.risk_warning && done && (
        <p className="glow mt-3 animate-rise border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
          [!] {thesis.risk_warning}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-[11px] text-ph-dim">
        <span className="min-w-0 truncate">macro: {macroScenario}</span>
        <div className="flex shrink-0 items-center gap-3">
          {thesis && <span>{fmtTime(thesis.generated_at)}</span>}
          <button
            onClick={() => void refresh()}
            disabled={busy}
            className="border border-cy/40 px-2 py-0.5 uppercase tracking-widest text-cy hover:bg-cy/10 disabled:opacity-40"
          >
            {busy ? "[ ... ]" : "[ re-run ]"}
          </button>
        </div>
      </div>
    </TerminalPanel>
  );
}
