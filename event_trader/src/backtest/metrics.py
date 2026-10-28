"""Métricas de desempenho do backtest."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd


def compute_metrics(trades: pd.DataFrame, allocation_per_trade: float = 0.10) -> dict[str, Any]:
    """Calcula Win Rate, Profit Factor, Sharpe e afins.

    Premissas:
        * ``trades`` tem as colunas ``net_return`` (retorno líquido do trade,
          já com custos) e ``exit_date``.
        * Cada trade aloca ``allocation_per_trade`` do patrimônio; o P&L é
          realizado na data de saída. A série diária da carteira (com zeros nos
          dias sem saída) alimenta Sharpe e drawdown. É uma aproximação
          conservadora para Sharpe: ignora marcação a mercado intradiária.
    """
    if trades.empty:
        return {"n_trades": 0}

    r = trades["net_return"].astype(float)
    wins = r[r > 0]
    losses = r[r <= 0]
    gross_win = wins.sum()
    gross_loss = -losses.sum()

    exit_dates = pd.to_datetime(trades["exit_date"])
    daily = (r * allocation_per_trade).groupby(exit_dates.dt.normalize()).sum()
    full_index = pd.bdate_range(daily.index.min(), daily.index.max())
    daily = daily.reindex(full_index, fill_value=0.0)
    equity = (1 + daily).cumprod()
    drawdown = equity / equity.cummax() - 1
    std = daily.std(ddof=1)
    sharpe = float(daily.mean() / std * math.sqrt(252)) if std and std > 0 else float("nan")

    return {
        "n_trades": int(len(r)),
        "win_rate": float(len(wins) / len(r)),
        "profit_factor": float(gross_win / gross_loss) if gross_loss > 0 else float("inf"),
        "avg_return": float(r.mean()),
        "avg_win": float(wins.mean()) if len(wins) else 0.0,
        "avg_loss": float(losses.mean()) if len(losses) else 0.0,
        "expectancy": float(r.mean()),
        "best_trade": float(r.max()),
        "worst_trade": float(r.min()),
        "sharpe_ratio": sharpe,
        "portfolio_total_return": float(equity.iloc[-1] - 1),
        "max_drawdown": float(drawdown.min()),
        "avg_holding_days": float(trades["holding_days"].mean()) if "holding_days" in trades else float("nan"),
        "exit_reasons": trades["exit_reason"].value_counts().to_dict() if "exit_reason" in trades else {},
    }


def format_report(metrics: dict[str, Any], by_rule: pd.DataFrame | None = None) -> str:
    """Relatório em texto para o console."""
    if metrics.get("n_trades", 0) == 0:
        return "Nenhum trade executado no período."

    def pct(x: float) -> str:
        return "n/a" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:+.2%}"

    lines = [
        "═" * 60,
        " RELATÓRIO DE BACKTEST — Event-Driven B3",
        "═" * 60,
        f" Trades ................. {metrics['n_trades']}",
        f" Win rate ............... {metrics['win_rate']:.1%}",
        f" Profit factor .......... {metrics['profit_factor']:.2f}",
        f" Sharpe (anualizado) .... {metrics['sharpe_ratio']:.2f}",
        f" Retorno médio/trade .... {pct(metrics['avg_return'])}",
        f" Ganho médio / Perda média {pct(metrics['avg_win'])} / {pct(metrics['avg_loss'])}",
        f" Melhor / Pior trade .... {pct(metrics['best_trade'])} / {pct(metrics['worst_trade'])}",
        f" Retorno carteira ....... {pct(metrics['portfolio_total_return'])}",
        f" Max drawdown ........... {pct(metrics['max_drawdown'])}",
        f" Holding médio (pregões)  {metrics['avg_holding_days']:.1f}",
        f" Saídas ................. {metrics['exit_reasons']}",
    ]
    if by_rule is not None and not by_rule.empty:
        lines += ["─" * 60, " Por regra:", by_rule.to_string()]
    lines.append("═" * 60)
    return "\n".join(lines)
