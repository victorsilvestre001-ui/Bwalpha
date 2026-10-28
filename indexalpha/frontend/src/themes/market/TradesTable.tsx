import type { SignalRecord } from "../../types";
import { fmtBRL, fmtPct, fmtPoints, fmtSigned, fmtTime } from "../../lib/format";
import { upDown } from "./hooks";

const STATUS: Record<string, string> = {
  alvo: "bg-mk-up/15 text-mk-up",
  stop: "bg-mk-down/15 text-mk-down",
  reversão: "bg-mk-raise text-mk-muted",
};

export function TradesTable({ history }: { history: SignalRecord[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] font-inter text-[12.5px] tabular-nums">
        <thead>
          <tr className="border-b border-mk-line text-[10.5px] uppercase tracking-wider text-mk-muted">
            <th className="py-2 text-left font-medium">#</th>
            <th className="py-2 text-left font-medium">Hora</th>
            <th className="py-2 text-left font-medium">Lado</th>
            <th className="py-2 text-right font-medium">Score</th>
            <th className="py-2 text-right font-medium">Conf.</th>
            <th className="py-2 text-right font-medium">Entrada</th>
            <th className="py-2 text-right font-medium">Stop</th>
            <th className="py-2 text-right font-medium">Alvo</th>
            <th className="py-2 text-right font-medium">Saída</th>
            <th className="py-2 text-right font-medium">Pts</th>
            <th className="py-2 text-right font-medium">Resultado</th>
            <th className="py-2 pl-4 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {history.length === 0 && (
            <tr>
              <td colSpan={12} className="py-6 text-center text-mk-muted">
                Nenhuma operação ainda.
              </td>
            </tr>
          )}
          {history.map((h) => (
            <tr key={h.id} className="animate-enter border-b border-mk-line/60 last:border-0 hover:bg-mk-raise">
              <td className="py-2 text-mk-muted">{h.id}</td>
              <td className="py-2 text-mk-muted">{fmtTime(h.timestamp)}</td>
              <td className="py-2">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${h.action === "BUY" ? "bg-mk-up/15 text-mk-up" : "bg-mk-down/15 text-mk-down"}`}>
                  {h.action === "BUY" ? "Compra" : "Venda"}
                </span>
              </td>
              <td className={`py-2 text-right ${upDown(h.index_score)}`}>{fmtSigned(h.index_score)}</td>
              <td className="py-2 text-right text-mk-muted">{fmtPct(h.confidence)}</td>
              <td className="py-2 text-right text-mk-text">{fmtPoints(h.entry_price)}</td>
              <td className="py-2 text-right text-mk-muted">{fmtPoints(h.stop_loss)}</td>
              <td className="py-2 text-right text-mk-muted">{fmtPoints(h.take_profit)}</td>
              <td className="py-2 text-right text-mk-text">{h.exit_price != null ? fmtPoints(h.exit_price) : "—"}</td>
              <td className={`py-2 text-right font-medium ${upDown(h.pnl_points)}`}>{fmtSigned(h.pnl_points, 0)}</td>
              <td className={`py-2 text-right font-semibold ${upDown(h.pnl_brl)}`}>{fmtBRL(h.pnl_brl)}</td>
              <td className="py-2 pl-4">
                {h.status === "open" ? (
                  <span className="inline-flex items-center gap-1.5 rounded bg-mk-accent/15 px-1.5 py-0.5 text-[11px] font-semibold text-mk-accent">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mk-accent" />
                    Aberta
                  </span>
                ) : (
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold capitalize ${STATUS[h.exit_reason ?? ""] ?? "bg-mk-raise text-mk-muted"}`}>
                    {h.exit_reason}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
