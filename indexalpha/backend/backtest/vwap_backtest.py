"""Backtest de configurações de VWAP no índice (BOVA11 em pontos de índice como substituto do WIN).

    cd indexalpha/backend
    python -m backtest.vwap_backtest

Preço e volume do BOVA11 (ETF negociado), convertidos para pontos de índice: o ^BVSP calculado
tem autocorrelação artificial que inflava o cruzamento da VWAP (ver `run_backtest.load_tradable`).
A VWAP é ancorada no pregão (zera todo dia) e as bandas usam o desvio padrão ponderado por volume.

Mesmas regras do backtest principal: decisão no fechamento, execução na abertura seguinte,
stop antes do alvo quando os dois são tocados no mesmo candle, custo de 10 pontos por operação,
posição zerada no fim do dia. Sem novas entradas antes das 10:30 nem depois das 16:30.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import datetime, time
from typing import Callable

import numpy as np
import pandas as pd

from app.engine.weights import WEIGHTS

from .run_backtest import (
    ALIASES,
    COST_POINTS,
    POINT_VALUE_BRL,
    RESULTS,
    atr_pct_by_day,
    compute_features,
    fetch,
    load,
    load_tradable,
    table,
)

FIRST_ENTRY = time(10, 30)
LAST_ENTRY = time(16, 30)


def index_volume(index: pd.DatetimeIndex) -> pd.Series:
    """Volume financeiro (R$) somado dos 20 pilares, alinhado aos candles do índice."""
    total = pd.Series(0.0, index=index)
    for ticker in WEIGHTS:
        df = fetch(ALIASES.get(ticker, ticker) + ".SA", refresh=False)
        df.index = pd.to_datetime(df.index, utc=True).tz_convert("America/Sao_Paulo")
        fin = (df["close"] * df["volume"]).reindex(index).fillna(0.0)
        total = total + fin
    return total


def vwap_bands(ibov: pd.DataFrame, vol: pd.Series) -> pd.DataFrame:
    tp = (ibov["high"] + ibov["low"] + ibov["close"]) / 3
    day = ibov.index.date
    w = vol.where(vol > 0, np.nan).fillna(1.0)  # candle sem volume pesa pouco, mas não quebra a soma
    cum_w = w.groupby(day).cumsum()
    vwap = (tp * w).groupby(day).cumsum() / cum_w
    var = ((tp - vwap) ** 2 * w).groupby(day).cumsum() / cum_w
    sigma = np.sqrt(var)
    return pd.DataFrame({"vwap": vwap, "sigma": sigma}, index=ibov.index)


@dataclass
class Order:
    side: int
    stop: float
    target: float | None


@dataclass
class Strategy:
    name: str
    entry: Callable[[int, dict[str, np.ndarray]], Order | None]
    exit_on_cross: bool = False
    """Sai quando o preço fecha do outro lado da VWAP (na abertura seguinte)."""
    exit_when: Callable[[int, dict[str, np.ndarray], int], bool] | None = None
    """Saída genérica (ex.: RSI voltando a 50), avaliada no fechamento; executa na abertura seguinte."""


def run(df: pd.DataFrame, strat: Strategy) -> list[float]:
    pnl: list[float] = []
    half = COST_POINTS / 2
    for _, g in df.groupby(df.index.date):
        a = {k: g[k].to_numpy() for k in g.columns}
        clock = [t.time() for t in g.index]
        pos: dict | None = None
        pending: Order | None = None
        pending_exit = False

        def close(price: float) -> None:
            pnl.append((price - pos["entry"]) * pos["side"] - COST_POINTS)

        for i in range(len(g)):
            if pending_exit and pos:
                close(a["open"][i] - half * pos["side"])
                pos = None
            if pending and pos is None:
                entry = a["open"][i] + half * pending.side
                # Ordem cujo stop já ficou do lado errado na abertura (gap) é descartada.
                if (entry - pending.stop) * pending.side > 0:
                    pos = {"side": pending.side, "entry": entry, "stop": pending.stop, "target": pending.target}
            pending, pending_exit = None, False

            if pos:
                s = pos["side"]
                hit_stop = a["low"][i] <= pos["stop"] if s == 1 else a["high"][i] >= pos["stop"]
                tgt = pos["target"]
                hit_tgt = tgt is not None and (a["high"][i] >= tgt if s == 1 else a["low"][i] <= tgt)
                if hit_stop:
                    close(pos["stop"])
                    pos = None
                elif hit_tgt:
                    close(tgt)
                    pos = None

            if i == len(g) - 1:
                if pos:
                    close(a["close"][i])
                break

            if any(math.isnan(a[k][i]) for k in ("vwap", "sigma", "atr")) or a["sigma"][i] == 0:
                continue
            if pos and strat.exit_on_cross and (a["close"][i] - a["vwap"][i]) * pos["side"] < 0:
                pending_exit = True
                continue
            if pos and strat.exit_when and strat.exit_when(i, a, pos["side"]):
                pending_exit = True
                continue
            if pos is None and FIRST_ENTRY <= clock[i] <= LAST_ENTRY:
                pending = strat.entry(i, a)
    return pnl


def stats(name: str, pnl: list[float], n_days: int) -> dict:
    p = np.array(pnl) if pnl else np.array([0.0])
    wins, losses = p[p > 0], p[p < 0]
    eq = np.cumsum(p)
    dd = float((np.maximum.accumulate(np.concatenate([[0], eq]))[1:] - eq).max()) if pnl else 0.0
    half = len(p) // 2
    return {
        "configuracao": name,
        "operacoes": len(pnl),
        "por_dia": round(len(pnl) / n_days, 1),
        "acerto_pct": round(100 * len(wins) / len(pnl), 1) if pnl else 0.0,
        "total_pts": round(float(p.sum())),
        "media_pts": round(float(p.mean()), 1) if pnl else 0.0,
        "profit_factor": round(float(wins.sum() / -losses.sum()), 2) if len(losses) else float("inf"),
        "max_dd_pts": round(dd),
        "1a_metade": round(float(p[:half].sum())),
        "2a_metade": round(float(p[half:].sum())),
    }


# ----------------------------------------------------------------------------- estratégias


def cross(confirm_sigma: float) -> Callable:
    """Compra quando fecha acima da VWAP (vindo de baixo); vende no inverso. Stop 1,5×ATR."""

    def f(i: int, a: dict) -> Order | None:
        if i == 0:
            return None
        d_now = (a["close"][i] - a["vwap"][i]) / a["sigma"][i]
        d_prev = (a["close"][i - 1] - a["vwap"][i - 1]) / a["sigma"][i - 1] if a["sigma"][i - 1] else 0
        atr_pts = a["close"][i] * a["atr"][i] / 100
        if d_prev <= confirm_sigma < d_now:
            return Order(1, a["close"][i] - 1.5 * atr_pts, None)
        if d_prev >= -confirm_sigma > d_now:
            return Order(-1, a["close"][i] + 1.5 * atr_pts, None)
        return None

    return f


def reversion(k: float) -> Callable:
    """Fecha fora da banda de k desvios → aposta na volta à VWAP. Stop na banda k+1."""

    def f(i: int, a: dict) -> Order | None:
        if i == 0:
            return None
        v, s, c, cp = a["vwap"][i], a["sigma"][i], a["close"][i], a["close"][i - 1]
        up, dn = v + k * s, v - k * s
        prev_up = a["vwap"][i - 1] + k * a["sigma"][i - 1]
        prev_dn = a["vwap"][i - 1] - k * a["sigma"][i - 1]
        if c > up and cp <= prev_up:
            return Order(-1, v + (k + 1) * s, v)
        if c < dn and cp >= prev_dn:
            return Order(1, v - (k + 1) * s, v)
        return None

    return f


def breakout(k: float) -> Callable:
    """Fecha rompendo a banda de k desvios → segue o movimento. Stop na VWAP, alvo 2× o risco."""

    def f(i: int, a: dict) -> Order | None:
        if i == 0:
            return None
        v, s, c, cp = a["vwap"][i], a["sigma"][i], a["close"][i], a["close"][i - 1]
        prev_up = a["vwap"][i - 1] + k * a["sigma"][i - 1]
        prev_dn = a["vwap"][i - 1] - k * a["sigma"][i - 1]
        if c > v + k * s and cp <= prev_up:
            return Order(1, v, c + 2 * (c - v))
        if c < v - k * s and cp >= prev_dn:
            return Order(-1, v, c - 2 * (v - c))
        return None

    return f


def pullback(trend_bars: int) -> Callable:
    """Tendência (N fechamentos do mesmo lado e VWAP inclinada) + candle que toca a VWAP e fecha a favor."""

    def f(i: int, a: dict) -> Order | None:
        if i < trend_bars + 1:
            return None
        v, s = a["vwap"][i], a["sigma"][i]
        prior = a["close"][i - trend_bars : i] - a["vwap"][i - trend_bars : i]
        slope = a["vwap"][i] - a["vwap"][i - trend_bars]
        if (prior > 0).all() and slope > 0 and a["low"][i] <= v + 0.1 * s and a["close"][i] > v:
            risk = a["close"][i] - (v - s)
            return Order(1, v - s, a["close"][i] + 2 * risk)
        if (prior < 0).all() and slope < 0 and a["high"][i] >= v - 0.1 * s and a["close"][i] < v:
            risk = (v + s) - a["close"][i]
            return Order(-1, v + s, a["close"][i] - 2 * risk)
        return None

    return f


def score_filter(use_vwap: bool) -> Callable:
    """Index_Score dos pilares (|score| > 0,5, sem filtro de fluxo) com ou sem a VWAP como filtro de lado."""

    def f(i: int, a: dict) -> Order | None:
        sc = a["pillars"][i]
        if math.isnan(sc) or abs(sc) <= 0.5:
            return None
        side = 1 if sc > 0 else -1
        if use_vwap and (a["close"][i] - a["vwap"][i]) * side <= 0:
            return None
        prev = a["pillars"][i - 1] if i else float("nan")
        if not math.isnan(prev) and abs(prev) > 0.5 and np.sign(prev) == side:
            return None  # só na transição, como no motor
        atr_pts = a["close"][i] * a["atr"][i] / 100
        return Order(side, a["close"][i] - side * 1.5 * atr_pts, a["close"][i] + side * 3 * atr_pts)

    return f


STRATEGIES = [
    Strategy("Cruzamento da VWAP", cross(0.0), exit_on_cross=True),
    Strategy("Cruzamento confirmado (0,5σ)", cross(0.5), exit_on_cross=True),
    Strategy("Reversão banda 1σ → VWAP", reversion(1.0)),
    Strategy("Reversão banda 1,5σ → VWAP", reversion(1.5)),
    Strategy("Reversão banda 2σ → VWAP", reversion(2.0)),
    Strategy("Reversão banda 2,5σ → VWAP", reversion(2.5)),
    Strategy("Rompimento banda 1σ (stop VWAP, alvo 2R)", breakout(1.0)),
    Strategy("Rompimento banda 2σ (stop VWAP, alvo 2R)", breakout(2.0)),
    Strategy("Pullback na VWAP, tendência de 6 candles", pullback(6)),
    Strategy("Pullback na VWAP, tendência de 12 candles", pullback(12)),
    Strategy("Index_Score sem VWAP (referência)", score_filter(False)),
    Strategy("Index_Score + VWAP como filtro de lado", score_filter(True)),
]


def main() -> None:
    ibov, panel, usd, _ = load(refresh=False)
    feats = compute_features(ibov, panel, usd)
    points, vol = load_tradable()
    df = points.join(vwap_bands(points, vol)).assign(atr=atr_pct_by_day(points)).join(feats[["pillars"]])
    days = sorted(set(df.index.date))
    rows = [stats(s.name, run(df, s), len(days)) for s in STRATEGIES]
    rows_sorted = sorted(rows, key=lambda r: r["total_pts"], reverse=True)

    cols = ["configuracao", "operacoes", "por_dia", "acerto_pct", "total_pts", "media_pts", "profit_factor", "max_dd_pts", "1a_metade", "2a_metade"]
    report = f"""# Backtest de VWAP no índice

Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')} · {len(days)} pregões ({days[0]} a {days[-1]}) · candles de 5 min.

**Premissas:** BOVA11 em pontos de índice no lugar do WIN (R$ {POINT_VALUE_BRL:.2f}/ponto/contrato) · VWAP ancorada no pregão,
com o volume financeiro real do BOVA11 · bandas = desvio padrão
ponderado por volume · decisão no fechamento e execução na abertura seguinte · custo de {COST_POINTS:.0f} pts por operação
· entradas só entre {FIRST_ENTRY:%H:%M} e {LAST_ENTRY:%H:%M} · zera no fim do dia.

Ordenado pelo resultado total. "1a/2a metade" = soma de pontos na primeira e na segunda metade das operações:
uma configuração confiável precisa ser positiva nas duas.

{table(rows_sorted, cols)}
"""
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "vwap_report.md").write_text(report, encoding="utf-8")
    (RESULTS / "vwap_results.json").write_text(json.dumps(rows_sorted, ensure_ascii=False, indent=1), encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
