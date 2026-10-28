import { useEffect, useRef, useState } from "react";
import { AIThesisCard } from "../components/AIThesisCard";
import { BootSequence } from "../components/BootSequence";
import { EventLog } from "../components/EventLog";
import { HeaderStatus } from "../components/HeaderStatus";
import { MatrixRain } from "../components/MatrixRain";
import { PillarHeatmap } from "../components/PillarHeatmap";
import { SignalHistoryTable } from "../components/SignalHistoryTable";
import { TradeExecutionPanel } from "../components/TradeExecutionPanel";
import type { LogLine } from "../hooks/useEventLog";
import type { Feed } from "../hooks/useMarketFeed";

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now.toLocaleTimeString("pt-BR", { hour12: false });
}

export function HackerDashboard({ feed, log }: { feed: Feed; log: LogLine[] }) {
  const { data, error, lastUpdate, refreshThesis } = feed;
  const clock = useClock();
  const syncs = useRef(0);
  const lastTs = useRef<string | null>(null);
  if (data && data.timestamp !== lastTs.current) {
    lastTs.current = data.timestamp;
    syncs.current += 1;
  }

  return (
    <div className="crt min-h-screen bg-void font-mono text-ph">
      <MatrixRain />
      <BootSequence />

      <div className="relative mx-auto max-w-7xl space-y-3 px-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ph/20 pb-3">
          <h1 className="glow-strong font-display text-3xl leading-none text-ph">
            ▌INDEX<span className="text-cy">ALPHA</span>://ENGINE
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.2em]">
            <span className={error ? "glow animate-blink text-bear" : "glow text-ph"}>
              ● {error ? "link lost" : "link ok"}
            </span>
            <span className="text-ph-dim">
              last sync {lastUpdate ? lastUpdate.toLocaleTimeString("pt-BR", { hour12: false }) : "--:--:--"}
            </span>
            <span className="glow text-ph">{clock}</span>
          </div>
        </div>

        {!data ? (
          <div className="border border-ph/30 bg-panel/80 p-10 text-center text-ph-dim box-glow">
            <span className="cursor">{error ?? "estabelecendo conexão com o engine"}</span>
          </div>
        ) : (
          <>
            <HeaderStatus data={data} syncCount={syncs.current} />
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="min-w-0 lg:col-span-2">
                <PillarHeatmap pillars={data.pillars} topDrivers={data.top_drivers} />
              </div>
              <EventLog lines={log} />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <AIThesisCard
                thesis={data.thesis}
                action={data.signal.action}
                drivers={data.top_drivers}
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

        <p className="pb-10 pt-2 text-center text-[10px] uppercase tracking-[0.25em] text-ph-dim/70">
          // demo educacional · dados simulados · não é recomendação de investimento
        </p>
      </div>
    </div>
  );
}
