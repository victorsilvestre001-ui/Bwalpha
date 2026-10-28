import { AIThesisCard } from "./components/AIThesisCard";
import { HeaderStatus } from "./components/HeaderStatus";
import { PillarHeatmap } from "./components/PillarHeatmap";
import { SignalHistoryTable } from "./components/SignalHistoryTable";
import { TradeExecutionPanel } from "./components/TradeExecutionPanel";
import { useMarketFeed } from "./hooks/useMarketFeed";

export default function App() {
  const { data, error, lastUpdate, refreshThesis } = useMarketFeed();

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 font-sans text-slate-200">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-sm font-semibold tracking-[0.3em] text-slate-400">
          INDEX<span className="text-indigo-400">ALPHA</span> ENGINE
        </h1>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          <span className={`h-2 w-2 rounded-full ${error ? "bg-bear" : "animate-pulse bg-bull"}`} />
          {error ?? "Simulação ao vivo · dados fictícios"}
        </span>
      </div>

      {!data ? (
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-10 text-center text-slate-500">
          {error ?? "Conectando ao engine…"}
        </div>
      ) : (
        <>
          <HeaderStatus data={data} lastUpdate={lastUpdate} />
          <PillarHeatmap pillars={data.pillars} topDrivers={data.top_drivers} />
          <div className="grid gap-4 lg:grid-cols-2">
            <AIThesisCard
              thesis={data.thesis}
              macroScenario={data.market.macro_scenario}
              aiEnabled={data.ai_enabled}
              onRefresh={refreshThesis}
            />
            <TradeExecutionPanel
              signal={data.signal}
              trade={data.trade}
              winPrice={data.market.win_price}
              atrPct={data.market.atr_pct}
            />
          </div>
          <SignalHistoryTable history={data.history} />
        </>
      )}

      <p className="text-center text-[11px] text-slate-600">
        Demonstração educacional com dados simulados. Não é recomendação de investimento.
      </p>
    </div>
  );
}
