import type { SignalRecord } from "../types";
import { actionColor, fmtBRL, fmtPct, fmtPoints, fmtSigned, fmtTime, signColor } from "../lib/format";
import { TerminalPanel } from "./TerminalPanel";

interface Props {
  history: SignalRecord[];
}

export function SignalHistoryTable({ history }: Props) {
  const closed = history.filter((h) => h.status === "closed");
  const total = closed.reduce((acc, h) => acc + h.pnl_brl, 0);
  const wins = closed.filter((h) => h.pnl_points > 0).length;

  return (
    <TerminalPanel
      title="signals.db"
      path="last 10"
      right={
        closed.length > 0 ? (
          <span>
            hit {wins}/{closed.length} · <span className={signColor(total)}>{fmtBRL(total)}</span>
          </span>
        ) : (
          "sem fechamentos"
        )
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-[13px]">
          <thead>
            <tr className="border-b border-ph/20 text-left text-[10px] uppercase tracking-[0.2em] text-ph-dim">
              <th className="py-2 font-normal">pid</th>
              <th className="py-2 font-normal">hora</th>
              <th className="py-2 font-normal">side</th>
              <th className="py-2 text-right font-normal">score</th>
              <th className="py-2 text-right font-normal">conf</th>
              <th className="py-2 text-right font-normal">entry</th>
              <th className="py-2 text-right font-normal">exit</th>
              <th className="py-2 text-right font-normal">pts</th>
              <th className="py-2 text-right font-normal">R$</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {history.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-ph-dim">
                  aguardando o primeiro BUY/SELL<span className="animate-blink">_</span>
                </td>
              </tr>
            )}
            {history.map((h) => (
              <tr key={h.id} className="animate-rise border-b border-ph/10 last:border-0 hover:bg-ph/5">
                <td className="py-1.5 text-ph-dim">{h.id.toString().padStart(4, "0")}</td>
                <td className="py-1.5 text-ph/70">{fmtTime(h.timestamp)}</td>
                <td className={`glow py-1.5 font-bold ${actionColor[h.action]}`}>{h.action}</td>
                <td className={`py-1.5 text-right ${signColor(h.index_score)}`}>{fmtSigned(h.index_score)}</td>
                <td className="py-1.5 text-right text-ph/80">{fmtPct(h.confidence)}</td>
                <td className="py-1.5 text-right text-ph">{fmtPoints(h.entry_price)}</td>
                <td className="py-1.5 text-right text-ph/70">
                  {h.status === "open" ? (
                    <span className="glow animate-blink text-cy">● LIVE</span>
                  ) : (
                    <>
                      {fmtPoints(h.exit_price ?? 0)} <span className="text-[10px] text-ph-dim">{h.exit_reason}</span>
                    </>
                  )}
                </td>
                <td className={`py-1.5 text-right ${signColor(h.pnl_points)}`}>{fmtSigned(h.pnl_points, 0)}</td>
                <td className={`glow py-1.5 text-right ${signColor(h.pnl_brl)}`}>{fmtBRL(h.pnl_brl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TerminalPanel>
  );
}
