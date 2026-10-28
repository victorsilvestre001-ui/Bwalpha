import type { SignalRecord } from "../types";
import { actionColor, fmtBRL, fmtPct, fmtPoints, fmtSigned, fmtTime, signColor } from "../lib/format";

interface Props {
  history: SignalRecord[];
}

export function SignalHistoryTable({ history }: Props) {
  const closed = history.filter((h) => h.status === "closed");
  const total = closed.reduce((acc, h) => acc + h.pnl_brl, 0);
  const wins = closed.filter((h) => h.pnl_points > 0).length;

  return (
    <section className="rounded-xl border border-ink-700 bg-ink-900 p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Últimos 10 sinais</h2>
        <p className="font-mono text-xs text-slate-500">
          {closed.length > 0 ? (
            <>
              acerto {wins}/{closed.length} · realizado{" "}
              <span className={signColor(total)}>{fmtBRL(total)}</span> /contrato
            </>
          ) : (
            "nenhum sinal encerrado ainda"
          )}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="py-2 font-medium">Hora</th>
              <th className="py-2 font-medium">Ação</th>
              <th className="py-2 text-right font-medium">Score</th>
              <th className="py-2 text-right font-medium">Conf.</th>
              <th className="py-2 text-right font-medium">Entrada</th>
              <th className="py-2 text-right font-medium">Saída</th>
              <th className="py-2 text-right font-medium">P&amp;L (pts)</th>
              <th className="py-2 text-right font-medium">P&amp;L (R$)</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {history.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-500">
                  Aguardando o primeiro sinal BUY/SELL…
                </td>
              </tr>
            )}
            {history.map((h) => (
              <tr key={h.id} className="border-b border-ink-800 last:border-0">
                <td className="py-2 text-slate-400">{fmtTime(h.timestamp)}</td>
                <td className={`py-2 font-semibold ${actionColor[h.action]}`}>{h.action}</td>
                <td className={`py-2 text-right ${signColor(h.index_score)}`}>{fmtSigned(h.index_score)}</td>
                <td className="py-2 text-right text-slate-300">{fmtPct(h.confidence)}</td>
                <td className="py-2 text-right text-slate-200">{fmtPoints(h.entry_price)}</td>
                <td className="py-2 text-right text-slate-400">
                  {h.status === "open" ? (
                    <span className="text-sky-400">aberto</span>
                  ) : (
                    <>
                      {fmtPoints(h.exit_price ?? 0)} <span className="text-xs text-slate-500">{h.exit_reason}</span>
                    </>
                  )}
                </td>
                <td className={`py-2 text-right ${signColor(h.pnl_points)}`}>{fmtSigned(h.pnl_points, 0)}</td>
                <td className={`py-2 text-right ${signColor(h.pnl_brl)}`}>{fmtBRL(h.pnl_brl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
