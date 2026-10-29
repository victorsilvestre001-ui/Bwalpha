"""Backtest de configurações de RSI no índice (BOVA11 em pontos de índice como substituto do WIN).

    cd indexalpha/backend
    python -m backtest.rsi_backtest

RSI de Wilder, contínuo entre os pregões (como nas plataformas), sobre candles de 5 min.
Mesmas regras do backtest da VWAP: decisão no fechamento, execução na abertura seguinte,
stop antes do alvo no mesmo candle, custo de 10 pontos, entradas entre 10:30 e 16:30,
posição zerada no fim do dia. Stop padrão de 2×ATR(14).
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Callable

import numpy as np
import pandas as pd

from .run_backtest import COST_POINTS, POINT_VALUE_BRL, RESULTS, atr_pct_by_day, load_tradable, table
from .vwap_backtest import FIRST_ENTRY, LAST_ENTRY, Order, Strategy, run, vwap_bands

STOP_ATR = 2.0


def rsi(close: pd.Series, period: int) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False).mean()
    return 100 - 100 / (1 + gain / loss)


def _stop(a: dict, i: int, side: int) -> float:
    return a["close"][i] - side * STOP_ATR * a["close"][i] * a["atr"][i] / 100


def reversion(period: int, low: float, high: float, vwap_filter: bool = False) -> Callable:
    """Compra quando o RSI volta para cima do nível de sobrevenda; vende quando volta para baixo do de sobrecompra."""
    col = f"rsi{period}"

    def f(i: int, a: dict) -> Order | None:
        if i == 0:
            return None
        r, rp = a[col][i], a[col][i - 1]
        above = a["close"][i] > a["vwap"][i]
        if rp < low <= r and (not vwap_filter or above):
            return Order(1, _stop(a, i, 1), None)
        if rp > high >= r and (not vwap_filter or not above):
            return Order(-1, _stop(a, i, -1), None)
        return None

    return f


def exit_mid(period: int) -> Callable:
    """Reversão: sai quando o RSI chega à linha 50."""
    col = f"rsi{period}"
    return lambda i, a, side: (a[col][i] >= 50) if side == 1 else (a[col][i] <= 50)


def momentum(period: int, up: float, down: float) -> Callable:
    """Compra quando o RSI cruza para cima de `up`; vende quando cruza para baixo de `down`."""
    col = f"rsi{period}"

    def f(i: int, a: dict) -> Order | None:
        if i == 0:
            return None
        r, rp = a[col][i], a[col][i - 1]
        if rp <= up < r:
            return Order(1, _stop(a, i, 1), None)
        if rp >= down > r:
            return Order(-1, _stop(a, i, -1), None)
        return None

    return f


def exit_cross50(period: int) -> Callable:
    """Momentum: sai quando o RSI cruza a linha 50 contra a posição."""
    col = f"rsi{period}"
    return lambda i, a, side: (a[col][i] < 50) if side == 1 else (a[col][i] > 50)


def vwap_cross_rsi(period: int, level: float) -> Callable:
    """Cruzamento da VWAP só quando o RSI confirma (> level na compra, < 100−level na venda)."""
    col = f"rsi{period}"

    def f(i: int, a: dict) -> Order | None:
        if i == 0:
            return None
        d, dp = a["close"][i] - a["vwap"][i], a["close"][i - 1] - a["vwap"][i - 1]
        if dp <= 0 < d and a[col][i] > level:
            return Order(1, _stop(a, i, 1), None)
        if dp >= 0 > d and a[col][i] < 100 - level:
            return Order(-1, _stop(a, i, -1), None)
        return None

    return f


def vwap_cross_plain(i: int, a: dict) -> Order | None:
    if i == 0:
        return None
    d, dp = a["close"][i] - a["vwap"][i], a["close"][i - 1] - a["vwap"][i - 1]
    if dp <= 0 < d:
        return Order(1, _stop(a, i, 1), None)
    if dp >= 0 > d:
        return Order(-1, _stop(a, i, -1), None)
    return None


STRATEGIES = [
    Strategy("Reversão RSI 14 (30/70) → sai no 50", reversion(14, 30, 70), exit_when=exit_mid(14)),
    Strategy("Reversão RSI 14 (20/80) → sai no 50", reversion(14, 20, 80), exit_when=exit_mid(14)),
    Strategy("Reversão RSI 9 (30/70) → sai no 50", reversion(9, 30, 70), exit_when=exit_mid(9)),
    Strategy("Reversão RSI 7 (25/75) → sai no 50", reversion(7, 25, 75), exit_when=exit_mid(7)),
    Strategy("Reversão RSI 2 (10/90) → sai no 50", reversion(2, 10, 90), exit_when=exit_mid(2)),
    Strategy("Reversão RSI 2 (5/95) → sai no 50", reversion(2, 5, 95), exit_when=exit_mid(2)),
    Strategy("Reversão RSI 14 (30/70) a favor da VWAP", reversion(14, 30, 70, True), exit_when=exit_mid(14)),
    Strategy("Reversão RSI 7 (25/75) a favor da VWAP", reversion(7, 25, 75, True), exit_when=exit_mid(7)),
    Strategy("Reversão RSI 2 (10/90) a favor da VWAP", reversion(2, 10, 90, True), exit_when=exit_mid(2)),
    Strategy("Momentum RSI 14 cruzando 50", momentum(14, 50, 50), exit_when=exit_cross50(14)),
    Strategy("Momentum RSI 9 cruzando 50", momentum(9, 50, 50), exit_when=exit_cross50(9)),
    Strategy("Momentum RSI 21 cruzando 50", momentum(21, 50, 50), exit_when=exit_cross50(21)),
    Strategy("Momentum RSI 14 (60/40) → sai no 50", momentum(14, 60, 40), exit_when=exit_cross50(14)),
    Strategy("Cruzamento da VWAP (referência)", vwap_cross_plain, exit_on_cross=True),
    Strategy("Cruzamento da VWAP + RSI 14 > 50", vwap_cross_rsi(14, 50), exit_on_cross=True),
    Strategy("Cruzamento da VWAP + RSI 14 > 55", vwap_cross_rsi(14, 55), exit_on_cross=True),
    Strategy("Cruzamento da VWAP + RSI 9 > 50", vwap_cross_rsi(9, 50), exit_on_cross=True),
]


def stats(name: str, df: pd.DataFrame, strat: Strategy, days: list) -> dict:
    pnl = np.array(run(df, strat) or [0.0])
    wins, losses = pnl[pnl > 0], pnl[pnl < 0]
    eq = np.cumsum(pnl)
    dd = float((np.maximum.accumulate(np.concatenate([[0], eq]))[1:] - eq).max())
    half = len(pnl) // 2
    weekly = []
    for k in range(0, len(days), 5):
        week = set(days[k : k + 5])
        weekly.append(sum(run(df[[d in week for d in df.index.date]], strat)))
    top5 = np.sort(pnl)[::-1][:5].sum()
    return {
        "configuracao": name,
        "operacoes": len(pnl),
        "acerto_pct": round(100 * len(wins) / len(pnl), 1),
        "total_pts": round(float(pnl.sum())),
        "profit_factor": round(float(wins.sum() / -losses.sum()), 2) if len(losses) else float("inf"),
        "max_dd_pts": round(dd),
        "1a_metade": round(float(pnl[:half].sum())),
        "2a_metade": round(float(pnl[half:].sum())),
        "semanas_pos": f"{sum(w > 0 for w in weekly)}/{len(weekly)}",
        "sem_top5": round(float(pnl.sum() - top5)),
    }


def main() -> None:
    points, vol = load_tradable()
    df = points.join(vwap_bands(points, vol)).assign(atr=atr_pct_by_day(points))
    for period in (2, 7, 9, 14, 21):
        df[f"rsi{period}"] = rsi(points["close"], period)
    days = sorted(set(df.index.date))

    rows = sorted((stats(s.name, df, s, days) for s in STRATEGIES), key=lambda r: r["total_pts"], reverse=True)
    cols = ["configuracao", "operacoes", "acerto_pct", "total_pts", "profit_factor", "max_dd_pts", "1a_metade", "2a_metade", "semanas_pos", "sem_top5"]
    report = f"""# Backtest de RSI no índice

Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')} · {len(days)} pregões ({days[0]} a {days[-1]}) · candles de 5 min.

**Premissas:** BOVA11 em pontos de índice no lugar do WIN (R$ {POINT_VALUE_BRL:.2f}/ponto/contrato; o ^BVSP calculado
tem autocorrelação artificial que distorce o resultado) · RSI de Wilder · decisão no
fechamento e execução na abertura seguinte · stop de {STOP_ATR:.0f}×ATR(14) · custo de {COST_POINTS:.0f} pts por operação ·
entradas entre {FIRST_ENTRY:%H:%M} e {LAST_ENTRY:%H:%M} · zera no fim do dia.

Colunas de robustez: positiva nas duas metades, semanas positivas e resultado **sem os 5 maiores ganhos**
(quanto sobra se os melhores dias não se repetirem).

{table(rows, cols)}
"""
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "rsi_report.md").write_text(report, encoding="utf-8")
    (RESULTS / "rsi_results.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
