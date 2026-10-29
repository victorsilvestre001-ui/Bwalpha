"""Backtest da Teoria de Dow (topos e fundos) no índice — BOVA11 em pontos como substituto do WIN.

    cd indexalpha/backend
    python -m backtest.dow_backtest

Regra objetiva para "topo" e "fundo" (pivô de N candles): máxima maior que as N máximas de cada
lado (fundo: mínima menor que as N de cada lado). O pivô só é conhecido N candles depois — o
backtest só o usa a partir daí, sem olhar o futuro.

Tendência: alta = os dois últimos topos E os dois últimos fundos subindo; baixa = ambos caindo.
  - Continuação: em alta, compra quando fecha acima do último topo (em baixa, vende abaixo do último fundo).
  - Reversão: em baixa, compra quando fecha acima do último topo (primeiro topo mais alto); espelho na venda.
Stop no último fundo confirmado (compra) ou topo (venda), movido a cada novo fundo mais alto /
topo mais baixo — a saída clássica de Dow: a tendência acaba quando perde o último fundo.

Mesmas premissas dos outros backtests: decisão no fechamento, execução na abertura seguinte,
custo de 10 pts por operação, entradas entre 10:30 e 16:30, posição zerada no fim do dia.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, time
from types import SimpleNamespace

import numpy as np
import pandas as pd

from .run_backtest import COST_POINTS, POINT_VALUE_BRL, RESULTS, load_tradable, table
from .utbot_backtest import stats

FIRST_ENTRY = time(10, 30)
LAST_ENTRY = time(16, 30)
VOLUME_WINDOW = 20
VOLUME_MULT = 1.2


@dataclass(frozen=True)
class Config:
    pivot: int
    mode: str  # "continuação" ou "reversão"
    volume: bool
    timeframe: str

    @property
    def name(self) -> str:
        vol = " · volume confirma" if self.volume else ""
        return f"{self.timeframe} · pivô {self.pivot} · {self.mode}{vol}"


def candles(timeframe: str) -> pd.DataFrame:
    points, vol = load_tradable()
    df = points.assign(volume=vol)
    if timeframe == "5min":
        return df
    parts = [
        g.resample(timeframe, label="left", closed="left")
        .agg({"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"})
        .dropna()
        for _, g in df.groupby(df.index.date)
    ]
    return pd.concat(parts)


def simulate(df: pd.DataFrame, cfg: Config) -> list[tuple[str, float]]:
    o, h, l, c, v = (df[k].to_numpy() for k in ("open", "high", "low", "close", "volume"))
    vol_avg = pd.Series(v).rolling(VOLUME_WINDOW).mean().to_numpy()
    dates = df.index.date
    clock = [t.time() for t in df.index]
    n, k = len(df), cfg.pivot
    half = COST_POINTS / 2

    highs: list[float] = []  # topos confirmados (em ordem)
    lows: list[float] = []
    trades: list[tuple[str, float]] = []
    pos: dict | None = None
    pending: tuple[int, float] | None = None  # lado, stop inicial

    def trend() -> int:
        if len(highs) < 2 or len(lows) < 2:
            return 0
        if highs[-1] > highs[-2] and lows[-1] > lows[-2]:
            return 1
        if highs[-1] < highs[-2] and lows[-1] < lows[-2]:
            return -1
        return 0

    for i in range(n):
        new_day = i > 0 and dates[i] != dates[i - 1]
        if new_day:
            pending = None
        if pending and pos is None:
            side, stop = pending
            entry = o[i] + half * side
            if (entry - stop) * side > 0:  # stop do lado certo após a abertura
                pos = {"side": side, "entry": entry, "stop": stop}
        pending = None

        if pos:
            s = pos["side"]
            if (s == 1 and l[i] <= pos["stop"]) or (s == -1 and h[i] >= pos["stop"]):
                exit_price = min(o[i], pos["stop"]) if s == 1 else max(o[i], pos["stop"])  # gap atravessa o stop
                trades.append((str(dates[i]), (exit_price - pos["entry"]) * s - COST_POINTS))
                pos = None

        # Pivô confirmado agora: o candle i-k tem k candles de cada lado.
        j = i - k
        if j >= k:
            if h[j] == max(h[j - k : i + 1]) and h[j] > max(np.delete(h[j - k : i + 1], k)):
                highs.append(h[j])
                if pos and pos["side"] == -1 and len(highs) >= 2 and highs[-1] < highs[-2]:
                    pos["stop"] = min(pos["stop"], highs[-1])  # topo mais baixo: baixa o stop da venda
            if l[j] == min(l[j - k : i + 1]) and l[j] < min(np.delete(l[j - k : i + 1], k)):
                lows.append(l[j])
                if pos and pos["side"] == 1 and len(lows) >= 2 and lows[-1] > lows[-2]:
                    pos["stop"] = max(pos["stop"], lows[-1])  # fundo mais alto: sobe o stop da compra

        last_bar = i == n - 1 or dates[i + 1] != dates[i]
        if last_bar:
            if pos:
                trades.append((str(dates[i]), (c[i] - pos["entry"]) * pos["side"] - half))
                pos = None
            continue
        if pos or not highs or not lows or not (FIRST_ENTRY <= clock[i] <= LAST_ENTRY):
            continue

        t = trend()
        want = 1 if cfg.mode == "continuação" else -1  # tendência exigida para comprar
        broke_up = c[i] > highs[-1] and (i == 0 or c[i - 1] <= highs[-1])
        broke_dn = c[i] < lows[-1] and (i == 0 or c[i - 1] >= lows[-1])
        vol_ok = not cfg.volume or (not np.isnan(vol_avg[i]) and v[i] > VOLUME_MULT * vol_avg[i])
        if broke_up and t == want and vol_ok:
            pending = (1, lows[-1])
        elif broke_dn and t == -want and vol_ok:
            pending = (-1, highs[-1])
    return trades


CONFIGS = [
    Config(pivot, mode, vol, tf)
    for tf in ("5min", "15min")
    for pivot in (2, 3, 5)
    for mode in ("continuação", "reversão")
    for vol in (False, True)
]


def main() -> None:
    frames = {tf: candles(tf) for tf in ("5min", "15min")}
    days = sorted(set(frames["5min"].index.date))
    rows = [stats(SimpleNamespace(name=cfg.name), simulate(frames[cfg.timeframe], cfg), days) for cfg in CONFIGS]
    rows.sort(key=lambda r: r["total_pts"], reverse=True)

    cols = ["configuracao", "operacoes", "por_dia", "acerto_pct", "total_pts", "profit_factor", "max_dd_pts", "1a_metade", "2a_metade", "semanas_pos", "sem_top5"]
    report = f"""# Backtest da Teoria de Dow (topos e fundos)

Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')} · {len(days)} pregões ({days[0]} a {days[-1]}).

**Instrumento:** BOVA11 em pontos de índice (R$ {POINT_VALUE_BRL:.2f}/ponto no WIN), com volume real do ETF.
**Regras:** topo/fundo = pivô de N candles (só usado depois de confirmado) · alta = 2 topos e 2 fundos subindo ·
continuação = rompe o último topo a favor da tendência · reversão = primeiro topo mais alto numa baixa (e o espelho) ·
stop no último fundo/topo, movido a cada novo fundo mais alto/topo mais baixo · volume confirma = candle do rompimento
com volume > {VOLUME_MULT}× a média de {VOLUME_WINDOW} · custo de {COST_POINTS:.0f} pts · entradas {FIRST_ENTRY:%H:%M}–{LAST_ENTRY:%H:%M} · zera no fim do dia.

{table(rows, cols)}
"""
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "dow_report.md").write_text(report, encoding="utf-8")
    (RESULTS / "dow_results.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
