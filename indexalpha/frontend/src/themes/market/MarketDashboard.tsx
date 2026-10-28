import { useEffect, useState, type ReactNode } from "react";
import type { LogLine } from "../../hooks/useEventLog";
import type { Feed } from "../../hooks/useMarketFeed";
import { fmtBRL, fmtPoints, fmtSigned } from "../../lib/format";
import { useTween } from "../mission/primitives";
import { flashBg, upDown, useFlash } from "./hooks";
import { PriceChart } from "./PriceChart";
import { ResearchNote } from "./ResearchNote";
import { SignalTicket } from "./SignalTicket";
import { TickerTape } from "./TickerTape";
import { TradesTable } from "./TradesTable";
import { Treemap } from "./Treemap";
import { Watchlist } from "./Watchlist";

function Card({ title, right, className = "", children }: { title: string; right?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`min-w-0 animate-enter rounded-xl border border-mk-line bg-mk-panel ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-mk-line px-4 py-2.5">
        <h2 className="truncate font-inter text-[13px] font-semibold text-mk-text">{title}</h2>
        {right && <div className="shrink-0 font-inter text-[12px] text-mk-muted">{right}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, tone = "text-mk-text" }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wider text-mk-muted">{label}</p>
      <p className={`text-[13px] font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now.toLocaleTimeString("pt-BR", { hour12: false });
}

export function MarketDashboard({ feed }: { feed: Feed; log: LogLine[] }) {
  const { data, error, refreshThesis } = feed;
  const clock = useClock();
  const price = useTween(data?.market.win_price ?? 0, 600);
  const flash = useFlash(data?.market.win_price ?? 0);

  const open = data?.market.session_open ?? data?.market.win_price ?? 0;
  const change = data ? data.market.win_price - open : 0;
  const changePct = open ? (change / open) * 100 : 0;
  const highs = data?.candles.map((c) => c.h) ?? [];
  const lows = data?.candles.map((c) => c.l) ?? [];
  const closed = data?.history.filter((h) => h.status === "closed") ?? [];
  const realized = closed.reduce((a, h) => a + h.pnl_brl, 0);

  return (
    <div className="min-h-screen bg-mk-bg font-inter text-mk-text">
      <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-mk-line px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-mk-accent to-mk-up text-[13px] font-bold text-white">IA</span>
          <div>
            <p className="text-[15px] font-bold leading-tight">IndexAlpha</p>
            <p className="text-[11px] leading-tight text-mk-muted">Sinais para o mini-índice</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${error ? "bg-mk-down" : "animate-pulse bg-mk-up"}`} />
            <span className={error ? "text-mk-down" : "text-mk-text"}>{error ? "Desconectado" : "Pregão simulado"}</span>
          </span>
          <span className="rounded bg-mk-gold/15 px-2 py-0.5 text-[11px] font-semibold text-mk-gold">Dados simulados</span>
          <span className="tabular-nums text-mk-muted">{clock}</span>
        </div>
      </nav>

      {data && <TickerTape data={data} />}

      <main className="mx-auto max-w-[1500px] space-y-4 px-3 py-4 sm:px-6">
        {!data ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-mk-line bg-mk-panel text-mk-muted">
            {error ?? "Carregando cotações…"}
          </div>
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <section className="min-w-0 animate-enter rounded-xl border border-mk-line bg-mk-panel">
                <div className="flex flex-wrap items-end justify-between gap-4 border-b border-mk-line px-4 py-3">
                  <div>
                    <p className="flex items-center gap-2 text-[13px] font-semibold">
                      WIN <span className="font-normal text-mk-muted">Mini Ibovespa · simulado</span>
                      <span className="rounded bg-mk-raise px-1.5 py-0.5 text-[11px] text-mk-muted">{data.candle_seconds}s</span>
                    </p>
                    <p className="mt-1 flex items-baseline gap-3">
                      <span className={`rounded px-1 text-3xl font-bold tabular-nums transition-colors duration-700 ${flash ? flashBg[flash] : ""}`}>
                        {fmtPoints(Math.round(price / 5) * 5)}
                      </span>
                      <span className={`text-[14px] font-semibold tabular-nums ${upDown(change)}`}>
                        {fmtSigned(change, 0)} ({fmtSigned(changePct)}%)
                      </span>
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-x-5 gap-y-2 sm:grid-cols-6">
                    <Stat label="Abertura" value={fmtPoints(open)} />
                    <Stat label="Máxima" value={fmtPoints(Math.max(...highs))} tone="text-mk-up" />
                    <Stat label="Mínima" value={fmtPoints(Math.min(...lows))} tone="text-mk-down" />
                    <Stat label="Fluxo estr." value={`${fmtSigned(data.market.foreign_flow, 0)} mi`} tone={upDown(data.market.foreign_flow)} />
                    <Stat
                      label="Vol. impl."
                      value={`${data.market.vix.toFixed(1).replace(".", ",")}%`}
                      tone={data.market.vix > 25 ? "text-mk-gold" : "text-mk-text"}
                    />
                    <Stat label="ATR" value={`${data.market.atr_pct.toFixed(2).replace(".", ",")}%`} />
                  </div>
                </div>
                <div className="px-2 pb-2 pt-1">
                  <PriceChart candles={data.candles} history={data.history} openPosition={data.open_position} lastPrice={data.market.win_price} />
                </div>
              </section>

              <Card title="Sinal IndexAlpha" right={<span className="tabular-nums">{new Date(data.timestamp).toLocaleTimeString("pt-BR")}</span>}>
                <SignalTicket data={data} />
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <Card title="Mapa de calor · Pilares do Ibovespa" right="tamanho = peso · cor = Z-Score">
                <div className="hidden sm:block">
                  <Treemap pillars={data.pillars} topDrivers={data.top_drivers} height={400} />
                </div>
                <div className="sm:hidden">
                  <Treemap pillars={data.pillars} topDrivers={data.top_drivers} height={320} />
                </div>
              </Card>
              <Card title="Lista de ativos" right={<span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-mk-gold" />top drivers</span>}>
                <Watchlist pillars={data.pillars} sparks={data.sparks} topDrivers={data.top_drivers} />
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
              <Card title="Análise">
                <ResearchNote
                  thesis={data.thesis}
                  action={data.signal.action}
                  drivers={data.top_drivers}
                  macroScenario={data.market.macro_scenario}
                  aiEnabled={data.ai_enabled}
                  onRefresh={refreshThesis}
                />
              </Card>
              <Card
                title="Operações do robô (simulação)"
                right={
                  closed.length > 0 ? (
                    <span className="tabular-nums">
                      {closed.filter((h) => h.pnl_points > 0).length}/{closed.length} acertos ·{" "}
                      <span className={upDown(realized)}>{fmtBRL(realized)}</span> /contrato
                    </span>
                  ) : undefined
                }
              >
                <TradesTable history={data.history} />
              </Card>
            </div>
          </>
        )}

        <p className="pb-14 pt-2 text-center text-[11px] text-mk-muted">
          Demonstração educacional com dados simulados. Não é recomendação de investimento.
        </p>
      </main>
    </div>
  );
}
