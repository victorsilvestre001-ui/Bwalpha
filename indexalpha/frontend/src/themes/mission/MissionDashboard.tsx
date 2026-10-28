import { useEffect, useState } from "react";
import type { LogLine } from "../../hooks/useEventLog";
import type { Feed } from "../../hooks/useMarketFeed";
import { Countdown } from "./Countdown";
import { EventTimeline } from "./EventTimeline";
import { FlightBrief } from "./FlightBrief";
import { LaunchParams } from "./LaunchParams";
import { MissionLog } from "./MissionLog";
import { OrbitMap } from "./OrbitMap";
import { PillarBars } from "./PillarBars";
import { Chip, MPanel } from "./primitives";
import { SpaceBackdrop } from "./SpaceBackdrop";
import { TelemetryHero } from "./TelemetryHero";
import { TrajectoryChart } from "./TrajectoryChart";

/** Relógio de missão: tempo desde que a página abriu (T+). */
function useMissionClock(): string {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const s = Math.floor((now - start) / 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `T+ ${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function MissionDashboard({ feed, log }: { feed: Feed; log: LogLine[] }) {
  const { data, error, refreshThesis } = feed;
  const clock = useMissionClock();
  const status = error
    ? { tone: "nogo" as const, label: "Perda de sinal" }
    : data && data.market.vix > 25
      ? { tone: "caution" as const, label: "Vol. elevada" }
      : { tone: "go" as const, label: "Nominal" };

  return (
    <div className="relative min-h-screen font-sans text-white">
      <SpaceBackdrop />
      <Countdown />

      <div className="relative mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
        <header className="flex animate-enter flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="font-cond text-[11px] uppercase tracking-[0.45em] text-ion">Mission WIN-01 · Ibovespa</p>
            <h1 className="font-cond text-3xl font-medium uppercase tracking-[0.4em] text-white sm:text-4xl">IndexAlpha</h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="font-mono text-sm tabular-nums text-white/70">{clock}</span>
            <Chip tone={status.tone} pulse>
              {status.label}
            </Chip>
          </div>
        </header>

        {!data ? (
          <div className="flex h-64 animate-enter items-center justify-center border border-white/10 bg-white/[0.02] font-cond uppercase tracking-[0.4em] text-white/50">
            {error ?? "Adquirindo sinal…"}
          </div>
        ) : (
          <>
            <TelemetryHero data={data} />

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="min-w-0 lg:col-span-2">
                <TrajectoryChart history={data.score_history} tickSeconds={data.tick_seconds} />
              </div>
              <EventTimeline lines={log} />
            </div>

            <MPanel title="Constelação · 20 pilares do Ibovespa" right={<span className="hidden sm:inline">órbita = peso · cor = z-score</span>} delay={300}>
              <div className="grid items-center gap-6 lg:grid-cols-2">
                <div className="mx-auto hidden w-full max-w-[520px] md:block">
                  <OrbitMap pillars={data.pillars} topDrivers={data.top_drivers} score={data.index_score} />
                </div>
                <PillarBars pillars={data.pillars} topDrivers={data.top_drivers} />
              </div>
            </MPanel>

            <div className="grid gap-4 lg:grid-cols-2">
              <FlightBrief
                thesis={data.thesis}
                macroScenario={data.market.macro_scenario}
                aiEnabled={data.ai_enabled}
                onRefresh={refreshThesis}
              />
              <LaunchParams data={data} />
            </div>

            <MissionLog history={data.history} />
          </>
        )}

        <p className="pb-14 pt-4 text-center font-cond text-[11px] uppercase tracking-[0.35em] text-white/30">
          Demo educacional · dados simulados · não é recomendação de investimento
        </p>
      </div>
    </div>
  );
}
