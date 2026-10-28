import { useState } from "react";
import type { Action, Thesis } from "../../types";
import { useTypewriter } from "../../hooks/useMotion";
import { fmtTime } from "../../lib/format";

const HEADLINE: Record<Action, string> = { BUY: "Viés comprador", SELL: "Viés vendedor", HOLD: "Sem vantagem clara" };

interface Props {
  thesis: Thesis | null;
  action: Action;
  drivers: string[];
  macroScenario: string;
  aiEnabled: boolean;
  onRefresh: () => Promise<void>;
}

/** Tese da IA no formato de nota de research. */
export function ResearchNote({ thesis, action, drivers, macroScenario, aiEnabled, onRefresh }: Props) {
  const [busy, setBusy] = useState(false);
  const { shown, done } = useTypewriter(thesis?.thesis_text ?? "", 12);
  const source = thesis?.source === "llm" ? thesis.model ?? "Claude" : aiEnabled ? "aguardando IA" : "modelo de regras";

  const refresh = async () => {
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      window.setTimeout(() => setBusy(false), 1500);
    }
  };

  return (
    <article className="font-inter">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded bg-mk-accent/15 px-2 py-0.5 font-semibold uppercase tracking-wider text-mk-accent">Research IA</span>
        <span className="rounded bg-mk-raise px-2 py-0.5 text-mk-muted">{macroScenario}</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold leading-snug text-mk-text">
        {HEADLINE[action]} no Ibovespa: {drivers.join(", ")} lideram o movimento
      </h3>
      <p className="mt-1 text-[11.5px] text-mk-muted">
        IndexAlpha Research · {source}
        {thesis && <> · {fmtTime(thesis.generated_at)}</>}
      </p>
      <p className="mt-3 min-h-[7rem] text-[14px] leading-relaxed text-mk-text/90">
        {thesis ? shown : "Gerando análise…"}
        {!done && <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-mk-accent align-[-0.1em]" />}
      </p>
      {thesis?.risk_warning && done && (
        <p className="mt-3 animate-enter rounded-md border border-mk-gold/30 bg-mk-gold/10 px-3 py-2 text-[13px] text-mk-gold">
          <span className="mr-1 font-semibold">Risco:</span>
          {thesis.risk_warning}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <button
          onClick={() => void refresh()}
          disabled={busy}
          className="rounded-md border border-mk-line px-3 py-1.5 text-[12px] font-medium text-mk-text transition-colors hover:border-mk-accent hover:text-mk-accent disabled:opacity-40"
        >
          {busy ? "Atualizando…" : "Atualizar análise"}
        </button>
      </div>
    </article>
  );
}
