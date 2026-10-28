import type { Snapshot } from "../../types";
import { usePulse } from "../../hooks/useMotion";
import { fmtPoints, fmtSigned } from "../../lib/format";
import { Gauge } from "./Gauge";
import { Chip, useTween } from "./primitives";

const ACTION_TONE = { BUY: "text-go", SELL: "text-nogo", HOLD: "text-white" } as const;
const ACTION_LABEL = { BUY: "Compra", SELL: "Venda", HOLD: "Aguardar" } as const;

function Readout({ label, value, unit, tone = "text-white" }: { label: string; value: string; unit?: string; tone?: string }) {
  return (
    <div className="border-l border-white/10 pl-4">
      <p className="font-cond text-[11px] uppercase tracking-[0.3em] text-white/45">{label}</p>
      <p className={`font-sans text-3xl font-extralight tabular-nums ${tone}`}>
        {value}
        {unit && <span className="ml-1 text-sm text-white/40">{unit}</span>}
      </p>
    </div>
  );
}

/** Painel principal: medidores de telemetria e a decisão atual. */
export function TelemetryHero({ data }: { data: Snapshot }) {
  const { signal, market } = data;
  const flash = usePulse(signal.action, 1200);
  const win = useTween(market.win_price);
  const flow = useTween(market.foreign_flow);
  const scoreColor = data.index_score >= 0 ? "#3ddc97" : "#ff5a5f";

  return (
    <section className="relative animate-enter overflow-hidden border border-white/10 bg-white/[0.02] backdrop-blur-md">
      <div className="beam pointer-events-none absolute inset-x-0 top-0 h-px" />
      {flash && <div className="pointer-events-none absolute inset-0 animate-flash bg-ion/15" />}

      <div className="grid items-center gap-6 p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)] lg:p-6">
        <div className="flex items-center gap-4">
          <Gauge
            value={data.index_score}
            min={-1}
            max={1}
            origin={0}
            label="Index score"
            display={(v) => fmtSigned(v)}
            color={scoreColor}
            markers={[
              { at: 0.5, color: "#3ddc97" },
              { at: -0.5, color: "#ff5a5f" },
            ]}
            big
            className="h-auto w-[52%] max-w-[260px] shrink-0"
          />
          <div className="min-w-0">
            <p className="font-cond text-[11px] uppercase tracking-[0.35em] text-white/45">Decisão</p>
            <p
              key={signal.action}
              className={`animate-enter font-cond text-6xl font-semibold uppercase leading-none tracking-[0.12em] sm:text-7xl ${ACTION_TONE[signal.action]}`}
              style={{ textShadow: signal.action === "HOLD" ? undefined : "0 0 28px currentColor" }}
            >
              {signal.action}
            </p>
            <p className="mt-2 font-cond text-sm uppercase tracking-[0.3em] text-white/50">{ACTION_LABEL[signal.action]}</p>
            {signal.volatility_filter_applied && (
              <div className="mt-3">
                <Chip tone="caution" pulse>
                  Filtro de vol · −50%
                </Chip>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Gauge
            value={signal.confidence}
            min={0}
            max={1}
            label="Confiança"
            display={(v) => `${Math.round(v * 100)}%`}
            color="#4da3ff"
            className="h-auto w-full"
          />
          <Gauge
            value={market.vix}
            min={10}
            max={45}
            label="Vol. implícita"
            display={(v) => `${v.toFixed(1)}`}
            color={market.vix > 25 ? "#ffb547" : "#ffffff"}
            markers={[{ at: 25, color: "#ffb547" }]}
            className="h-auto w-full"
          />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-1">
          <Readout label="WIN · pontos" value={fmtPoints(win)} />
          <Readout
            label="Fluxo estrangeiro"
            value={fmtSigned(flow, 0)}
            unit="R$ mi"
            tone={market.foreign_flow >= 0 ? "text-go" : "text-nogo"}
          />
          <Readout label="ATR projetado" value={market.atr_pct.toFixed(2).replace(".", ",")} unit="%" />
        </div>
      </div>
    </section>
  );
}
