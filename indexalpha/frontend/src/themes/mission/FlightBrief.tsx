import { useState } from "react";
import type { Thesis } from "../../types";
import { useTypewriter } from "../../hooks/useMotion";
import { fmtTime } from "../../lib/format";
import { Chip, MPanel } from "./primitives";

interface Props {
  thesis: Thesis | null;
  macroScenario: string;
  aiEnabled: boolean;
  onRefresh: () => Promise<void>;
}

/** Briefing do "diretor de voo": a tese da IA digitada e o alerta de risco. */
export function FlightBrief({ thesis, macroScenario, aiEnabled, onRefresh }: Props) {
  const [busy, setBusy] = useState(false);
  const { shown, done } = useTypewriter(thesis?.thesis_text ?? "", 14);
  const source = thesis?.source === "llm" ? thesis.model ?? "LLM" : aiEnabled ? "aguardando LLM" : "modo regras";

  const refresh = async () => {
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      window.setTimeout(() => setBusy(false), 1500);
    }
  };

  return (
    <MPanel title="Flight director · briefing da IA" right={<Chip tone={thesis?.source === "llm" ? "ion" : "idle"}>{source}</Chip>} delay={350}>
      <p className="min-h-[8.5rem] font-sans text-[17px] font-light leading-relaxed text-white/90">
        {thesis ? shown : "Gerando briefing…"}
        {!done && <span className="ml-0.5 inline-block h-[1.05em] w-[2px] animate-pulse bg-ion align-[-0.15em]" />}
      </p>

      {thesis?.risk_warning && done && (
        <div className="mt-4 flex animate-enter items-start gap-3 border-l-2 border-caution bg-caution/[0.08] px-4 py-3">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-caution" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3 2 21h20L12 3Z" />
            <path d="M12 10v5M12 18h.01" />
          </svg>
          <p className="text-sm text-caution">
            <span className="mr-2 font-cond uppercase tracking-[0.25em]">Caution</span>
            {thesis.risk_warning}
          </p>
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-[12px] text-white/40">
        <span className="min-w-0 truncate">
          <span className="font-cond uppercase tracking-[0.2em]">Macro</span> · {macroScenario}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {thesis && <span className="font-mono">{fmtTime(thesis.generated_at)}</span>}
          <button
            onClick={() => void refresh()}
            disabled={busy}
            className="border border-white/20 px-3 py-1 font-cond uppercase tracking-[0.25em] text-white/80 transition-colors hover:border-ion hover:text-ion disabled:opacity-40"
          >
            {busy ? "…" : "Regenerar"}
          </button>
        </span>
      </div>
    </MPanel>
  );
}
