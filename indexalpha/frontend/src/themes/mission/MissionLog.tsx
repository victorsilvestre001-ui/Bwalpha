import type { SignalRecord } from "../../types";
import { fmtBRL, fmtPct, fmtPoints, fmtSigned, fmtTime } from "../../lib/format";
import { Chip, MPanel } from "./primitives";

function outcome(h: SignalRecord) {
  if (h.status === "open") return <Chip tone="ion" pulse>Em voo</Chip>;
  if (h.exit_reason === "alvo") return <Chip tone="go">Alvo</Chip>;
  if (h.exit_reason === "stop") return <Chip tone="nogo">Stop</Chip>;
  return <Chip tone="idle">{h.exit_reason ?? "—"}</Chip>;
}

export function MissionLog({ history }: { history: SignalRecord[] }) {
  const closed = history.filter((h) => h.status === "closed");
  const total = closed.reduce((acc, h) => acc + h.pnl_brl, 0);
  const wins = closed.filter((h) => h.pnl_points > 0).length;

  return (
    <MPanel
      title="Registro de missões · últimos 10 sinais"
      right={
        closed.length > 0 ? (
          <span className="font-mono text-[11px] tracking-normal">
            {wins}/{closed.length} acertos · <span className={total >= 0 ? "text-go" : "text-nogo"}>{fmtBRL(total)}</span>
          </span>
        ) : undefined
      }
      delay={500}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-[13px]">
          <thead>
            <tr className="border-b border-white/10 text-left font-cond text-[10px] uppercase tracking-[0.25em] text-white/40">
              <th className="pb-2 font-normal">Missão</th>
              <th className="pb-2 font-normal">Hora</th>
              <th className="pb-2 font-normal">Lado</th>
              <th className="pb-2 text-right font-normal">Score</th>
              <th className="pb-2 text-right font-normal">Conf.</th>
              <th className="pb-2 text-right font-normal">Entrada</th>
              <th className="pb-2 text-right font-normal">Saída</th>
              <th className="pb-2 text-right font-normal">Pts</th>
              <th className="pb-2 text-right font-normal">R$</th>
              <th className="pb-2 pl-4 font-normal">Status</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {history.length === 0 && (
              <tr>
                <td colSpan={10} className="py-6 text-center text-white/40">
                  Nenhuma missão lançada ainda.
                </td>
              </tr>
            )}
            {history.map((h) => (
              <tr key={h.id} className="animate-enter border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                <td className="py-2.5 font-mono text-white/40">WIN-{h.id.toString().padStart(3, "0")}</td>
                <td className="py-2.5 font-mono text-white/60">{fmtTime(h.timestamp)}</td>
                <td className={`py-2.5 font-medium ${h.action === "BUY" ? "text-go" : "text-nogo"}`}>{h.action}</td>
                <td className="py-2.5 text-right text-white/80">{fmtSigned(h.index_score)}</td>
                <td className="py-2.5 text-right text-white/60">{fmtPct(h.confidence)}</td>
                <td className="py-2.5 text-right text-white">{fmtPoints(h.entry_price)}</td>
                <td className="py-2.5 text-right text-white/60">{h.exit_price != null ? fmtPoints(h.exit_price) : "—"}</td>
                <td className={`py-2.5 text-right ${h.pnl_points >= 0 ? "text-go" : "text-nogo"}`}>{fmtSigned(h.pnl_points, 0)}</td>
                <td className={`py-2.5 text-right ${h.pnl_brl >= 0 ? "text-go" : "text-nogo"}`}>{fmtBRL(h.pnl_brl)}</td>
                <td className="py-2.5 pl-4">{outcome(h)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MPanel>
  );
}
