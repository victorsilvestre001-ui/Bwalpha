import { useState } from "react";
import type { Thesis } from "../types";
import { fmtTime } from "../lib/format";

interface Props {
  thesis: Thesis | null;
  macroScenario: string;
  aiEnabled: boolean;
  onRefresh: () => Promise<void>;
}

export function AIThesisCard({ thesis, macroScenario, aiEnabled, onRefresh }: Props) {
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      window.setTimeout(() => setBusy(false), 1500);
    }
  };

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-indigo-500/30 bg-gradient-to-b from-indigo-500/10 to-ink-900 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-indigo-300">Tese da IA</h2>
        <span className="rounded bg-ink-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
          {thesis?.source === "llm" ? thesis.model ?? "LLM" : aiEnabled ? "aguardando LLM" : "modo regras"}
        </span>
      </div>

      <p className="text-[15px] leading-relaxed text-slate-200">{thesis?.thesis_text ?? "Gerando tese…"}</p>

      {thesis?.risk_warning && (
        <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          ⚠ {thesis.risk_warning}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between pt-4 text-xs text-slate-500">
        <span className="min-w-0 truncate pr-3">Macro: {macroScenario}</span>
        <div className="flex shrink-0 items-center gap-3">
          {thesis && <span className="font-mono">{fmtTime(thesis.generated_at)}</span>}
          <button
            onClick={() => void refresh()}
            disabled={busy}
            className="rounded border border-ink-600 px-2 py-1 text-slate-300 hover:bg-ink-800 disabled:opacity-40"
          >
            {busy ? "…" : "Atualizar"}
          </button>
        </div>
      </div>
    </section>
  );
}
