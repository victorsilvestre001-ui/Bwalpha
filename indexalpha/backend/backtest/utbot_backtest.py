"""Backtest do indicador "UT Bot Alerts" (TradingView) no índice (Ibovespa à vista como substituto do WIN).

    cd indexalpha/backend
    python -m backtest.utbot_backtest

Reprodução fiel do script Pine v4:
  - xATR = atr(c) (RMA de Wilder do true range, sobre os candles normais)
  - trailing stop recursivo a `a × ATR` do preço
  - Buy quando src cruza para cima do stop; Sell quando cruza para baixo (ema(src,1) = src)
  - com Heikin Ashi, src = fechamento HA = (O+H+L+C)/4

Operação "stop and reverse", como o indicador sugere: Buy compra (e zera a venda), Sell vende
(e zera a compra). Decisão no fechamento, execução na abertura do candle seguinte — no preço
REAL, mesmo quando o sinal vem do Heikin Ashi. Custo de 10 pts por operação, novas entradas
entre 10:30 e 16:30 e posição zerada no fim do dia.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, time

import numpy as np
import pandas as pd

from .run_backtest import COST_POINTS, POINT_VALUE_BRL, RESULTS, fetch, table

FIRST_ENTRY = time(10, 30)
LAST_ENTRY = time(16, 30)


@dataclass(frozen=True)
class Config:
    key: float
    atr_period: int
    heikin_ashi: bool
    timeframe: str  # "5min" ou "15min"

    @property
    def name(self) -> str:
        ha = " · Heikin Ashi" if self.heikin_ashi else ""
        return f"{self.timeframe} · Key {self.key:g} · ATR {self.atr_period}{ha}"


INSTRUMENTS = ("BOVA11", "^BVSP")


def _read(symbol: str) -> pd.DataFrame:
    df = fetch(symbol, refresh=False)
    df.index = pd.to_datetime(df.index, utc=True).tz_convert("America/Sao_Paulo")
    return df[["open", "high", "low", "close"]]


def load_ibov(timeframe: str, instrument: str = "BOVA11") -> pd.DataFrame:
    """Candles em pontos de índice.

    "BOVA11": ETF negociado, convertido para pontos pela razão diária Ibovespa/BOVA11. É o mais
    próximo do WIN: o índice calculado (^BVSP) tem autocorrelação artificial de curto prazo
    (as ações não negociam todas no mesmo instante), o que infla estratégias de tendência.
    "^BVSP": o índice calculado, só para comparação.
    """
    ibov = _read("^BVSP")
    if instrument == "^BVSP":
        df = ibov
    else:
        etf = _read("BOVA11.SA")
        ratio = (ibov["close"] / etf["close"]).dropna().groupby(lambda t: t.date()).median()
        factor = pd.Series(etf.index.date, index=etf.index).map(ratio)
        df = etf.mul(factor, axis=0).dropna()
    if timeframe == "5min":
        return df
    parts = []
    for _, g in df.groupby(df.index.date):
        parts.append(
            g.resample(timeframe, label="left", closed="left")
            .agg({"open": "first", "high": "max", "low": "min", "close": "last"})
            .dropna()
        )
    return pd.concat(parts)


def wilder_atr(df: pd.DataFrame, period: int) -> np.ndarray:
    prev = df["close"].shift()
    tr = pd.concat([df["high"] - df["low"], (df["high"] - prev).abs(), (df["low"] - prev).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False, min_periods=period).mean().to_numpy()


def heikin_ashi_close(df: pd.DataFrame) -> np.ndarray:
    return ((df["open"] + df["high"] + df["low"] + df["close"]) / 4).to_numpy()


def ut_bot(src: np.ndarray, atr: np.ndarray, key: float) -> tuple[np.ndarray, np.ndarray]:
    """Devolve (buy, sell) exatamente como o script Pine."""
    n = len(src)
    stop = np.zeros(n)
    buy = np.zeros(n, dtype=bool)
    sell = np.zeros(n, dtype=bool)
    for i in range(n):
        prev = stop[i - 1] if i else 0.0
        if np.isnan(atr[i]):
            stop[i] = prev
            continue
        loss = key * atr[i]
        s, s1 = src[i], src[i - 1] if i else src[i]
        if s > prev and s1 > prev:
            stop[i] = max(prev, s - loss)
        elif s < prev and s1 < prev:
            stop[i] = min(prev, s + loss)
        elif s > prev:
            stop[i] = s - loss
        else:
            stop[i] = s + loss
        if i:
            buy[i] = s > stop[i] and src[i - 1] <= stop[i - 1]
            sell[i] = s < stop[i] and src[i - 1] >= stop[i - 1]
    return buy, sell


def simulate(df: pd.DataFrame, buy: np.ndarray, sell: np.ndarray) -> list[tuple[str, float]]:
    """Stop and reverse; devolve (data, pontos) de cada operação."""
    trades: list[tuple[str, float]] = []
    half = COST_POINTS / 2
    o, c = df["open"].to_numpy(), df["close"].to_numpy()
    dates = df.index.date
    clock = [t.time() for t in df.index]
    pos: tuple[int, float] | None = None
    pending_side = 0
    pending_exit = False
    for i in range(len(df)):
        new_day = i > 0 and dates[i] != dates[i - 1]
        if new_day:
            pending_side, pending_exit = 0, False
        if pending_exit and pos:
            trades.append((str(dates[i]), (o[i] - half * pos[0] - pos[1]) * pos[0] - half))
            pos = None
        if pending_side and pos is None:
            pos = (pending_side, o[i] + half * pending_side)
        pending_side, pending_exit = 0, False

        last_bar = i == len(df) - 1 or dates[i + 1] != dates[i]
        if last_bar:
            if pos:
                trades.append((str(dates[i]), (c[i] - pos[1]) * pos[0] - half))
                pos = None
            continue

        signal = 1 if buy[i] else -1 if sell[i] else 0
        if not signal:
            continue
        if pos and signal != pos[0]:
            pending_exit = True
        if FIRST_ENTRY <= clock[i] <= LAST_ENTRY and (pos is None or pending_exit):
            pending_side = signal
    return trades


def stats(cfg: Config, trades: list[tuple[str, float]], days: list) -> dict:
    pnl = np.array([p for _, p in trades] or [0.0])
    wins, losses = pnl[pnl > 0], pnl[pnl < 0]
    eq = np.cumsum(pnl)
    dd = float((np.maximum.accumulate(np.concatenate([[0], eq]))[1:] - eq).max())
    half = len(pnl) // 2
    week_of = {str(d): k // 5 for k, d in enumerate(days)}
    weekly = np.zeros(len(range(0, len(days), 5)))
    for d, p in trades:
        weekly[week_of[d]] += p
    return {
        "configuracao": cfg.name,
        "operacoes": len(trades),
        "por_dia": round(len(trades) / len(days), 1),
        "acerto_pct": round(100 * len(wins) / len(pnl), 1),
        "total_pts": round(float(pnl.sum())),
        "profit_factor": round(float(wins.sum() / -losses.sum()), 2) if len(losses) else float("inf"),
        "max_dd_pts": round(dd),
        "1a_metade": round(float(pnl[:half].sum())),
        "2a_metade": round(float(pnl[half:].sum())),
        "semanas_pos": f"{int((weekly > 0).sum())}/{len(weekly)}",
        "sem_top5": round(float(pnl.sum() - np.sort(pnl)[::-1][:5].sum())),
    }


CONFIGS = [
    Config(key, atr, ha, tf)
    for tf in ("5min", "15min")
    for key in (1, 2, 3, 4)
    for atr in (10, 14, 550)
    for ha in (False, True)
]
USER_CONFIGS = [Config(1, 10, False, "5min"), Config(3, 550, False, "5min"), Config(3, 550, False, "15min")]


def run_all(instrument: str) -> tuple[list[dict], list]:
    frames = {tf: load_ibov(tf, instrument) for tf in ("5min", "15min")}
    days = sorted(set(frames["5min"].index.date))
    rows = []
    for cfg in CONFIGS:
        df = frames[cfg.timeframe]
        src = heikin_ashi_close(df) if cfg.heikin_ashi else df["close"].to_numpy()
        buy, sell = ut_bot(src, wilder_atr(df, cfg.atr_period), cfg.key)
        rows.append(stats(cfg, simulate(df, buy, sell), days))
    rows.sort(key=lambda r: r["total_pts"], reverse=True)
    return rows, days


def main() -> None:
    results = {inst: run_all(inst) for inst in INSTRUMENTS}
    rows, days = results["BOVA11"]
    index_rows = {r["configuracao"]: r for r in results["^BVSP"][0]}
    for r in rows:
        r["no_indice_calc"] = index_rows[r["configuracao"]]["total_pts"]

    by_name = {r["configuracao"]: r for r in rows}
    user_lines = "\n".join(
        f"- **{c.name}:** {by_name[c.name]['operacoes']} operações, {by_name[c.name]['total_pts']:+} pts, "
        f"acerto {by_name[c.name]['acerto_pct']}%, profit factor {by_name[c.name]['profit_factor']} "
        f"(no índice calculado: {by_name[c.name]['no_indice_calc']:+} pts)"
        for c in USER_CONFIGS
    )
    cols = ["configuracao", "operacoes", "por_dia", "acerto_pct", "total_pts", "profit_factor", "max_dd_pts", "1a_metade", "2a_metade", "semanas_pos", "sem_top5", "no_indice_calc"]
    report = f"""# Backtest do UT Bot Alerts

Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')} · {len(days)} pregões ({days[0]} a {days[-1]}).

**Instrumento:** BOVA11 (ETF negociado) convertido para pontos de índice. O Ibovespa calculado (^BVSP) tem
autocorrelação artificial de curto prazo (+0,08 contra ≈0 no BOVA11) e infla estratégias de tendência; a última
coluna mostra o resultado que ele daria, só para comparação.

**Premissas:** reprodução fiel do script Pine v4 · stop and reverse · decisão no fechamento, execução na abertura
seguinte no preço real (também com Heikin Ashi) · custo de {COST_POINTS:.0f} pts por operação (R$ {POINT_VALUE_BRL:.2f}/ponto no WIN)
· entradas entre {FIRST_ENTRY:%H:%M} e {LAST_ENTRY:%H:%M} · zera no fim do dia.

**Configurações enviadas:**
{user_lines}

{table(rows, cols)}
"""
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "utbot_report.md").write_text(report, encoding="utf-8")
    (RESULTS / "utbot_results.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
