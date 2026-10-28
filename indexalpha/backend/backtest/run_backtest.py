"""Backtest do IndexAlpha Engine com dados reais da B3 (Yahoo Finance, candles de 5 min, ~60 dias).

    cd indexalpha/backend
    python -m backtest.run_backtest            # baixa (ou usa o cache) e roda
    python -m backtest.run_backtest --refresh  # força baixar de novo

O Ibovespa à vista (^BVSP) é usado no lugar do WIN, que o Yahoo não tem. Os dois andam
juntos, então os resultados em pontos são uma boa aproximação do mini-índice
(R$ 0,20 por ponto por contrato).

Sem olhar o futuro: o sinal é calculado no fechamento do candle e a ordem é executada na
abertura do candle seguinte. Stop e alvo são checados com a máxima e a mínima de cada candle
(se os dois forem tocados no mesmo candle, conta o stop). Toda posição é zerada no fim do dia.
"""

from __future__ import annotations

import argparse
import json
import math
import time
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

from app.engine.index_engine import IndexEngine
from app.engine.signals import SL_ATR_MULT, TP_ATR_MULT, VOL_PENALTY, VOL_THRESHOLD
from app.engine.weights import WEIGHTS

HERE = Path(__file__).resolve().parent
CACHE = HERE / "data"
RESULTS = HERE / "results"

INDEX_SYMBOL = "^BVSP"
USD_SYMBOL = "BRL=X"
# Tickers que mudaram na B3: Eletrobras virou Axia (AXIA3) e a JBS passou a ter BDR (JBSS32).
ALIASES = {"ELET3": "AXIA3", "JBSS3": "JBSS32"}

WINDOW = 20
ATR_WINDOW = 14
BARS_PER_YEAR = 252 * 84  # ~84 candles de 5 min por pregão
COST_POINTS = 10.0
"""Custo por operação (ida + volta) em pontos: spread/derrapagem do WIN."""
POINT_VALUE_BRL = 0.20
FORWARD_BARS = (1, 3, 6, 12)


# ----------------------------------------------------------------------------- dados


def fetch(symbol: str, refresh: bool) -> pd.DataFrame:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{symbol.replace('^', '_').replace('=', '_')}.csv"
    if path.exists() and not refresh:
        return pd.read_csv(path, index_col=0, parse_dates=True)

    url = (
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        f"{urllib.parse.quote(symbol)}?interval=5m&range=60d"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                payload = json.load(resp)
            break
        except OSError:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))
    result = payload["chart"]["result"][0]
    quote = result["indicators"]["quote"][0]
    idx = pd.to_datetime(result["timestamp"], unit="s", utc=True).tz_convert("America/Sao_Paulo")
    df = pd.DataFrame(
        {k: quote[k] for k in ("open", "high", "low", "close", "volume")}, index=idx
    ).dropna(subset=["close"])
    df.to_csv(path)
    return df


def load(refresh: bool) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, list[str]]:
    """Ibovespa (OHLC), fechamentos dos pilares e dólar alinhados nos horários do índice."""
    ibov = fetch(INDEX_SYMBOL, refresh)
    ibov.index = pd.to_datetime(ibov.index, utc=True).tz_convert("America/Sao_Paulo")
    closes: dict[str, pd.Series] = {}
    missing: list[str] = []
    for ticker in WEIGHTS:
        symbol = ALIASES.get(ticker, ticker) + ".SA"
        try:
            df = fetch(symbol, refresh)
        except Exception:  # ativo sem dados: o engine renormaliza os pesos
            missing.append(ticker)
            continue
        s = df["close"]
        s.index = pd.to_datetime(s.index, utc=True).tz_convert("America/Sao_Paulo")
        closes[ticker] = s
    usd = fetch(USD_SYMBOL, refresh)["close"]
    usd.index = pd.to_datetime(usd.index, utc=True).tz_convert("America/Sao_Paulo")

    panel = pd.DataFrame(closes).reindex(ibov.index)
    day = ibov.index.date
    panel = panel.groupby(day).ffill(limit=2)  # buracos curtos dentro do dia
    usd_aligned = usd.reindex(ibov.index.union(usd.index)).ffill().reindex(ibov.index)
    return ibov, panel, usd_aligned, missing


# ----------------------------------------------------------------------------- sinais


def rolling_by_day(s: pd.Series | pd.DataFrame, fn: str, window: int):
    """Janela móvel que reinicia a cada pregão (evita misturar o gap da noite)."""
    return s.groupby(s.index.date, group_keys=False).apply(lambda g: getattr(g.rolling(window), fn)())


def compute_features(ibov: pd.DataFrame, panel: pd.DataFrame, usd: pd.Series) -> pd.DataFrame:
    engine = IndexEngine()
    sma = rolling_by_day(panel, "mean", WINDOW)
    std = rolling_by_day(panel, "std", WINDOW)
    z = ((panel - sma) / std).clip(-IndexEngine.Z_CLIP, IndexEngine.Z_CLIP)
    weights = pd.Series(engine.weights)

    valid = z.notna()
    w = valid.mul(weights.reindex(z.columns).fillna(0), axis=1)
    coverage = w.sum(axis=1)
    raw = (z.fillna(0) * w).sum(axis=1) / coverage.replace(0, np.nan)
    pillars_score = np.tanh(raw)

    ibov_z = (ibov["close"] - rolling_by_day(ibov["close"], "mean", WINDOW)) / rolling_by_day(
        ibov["close"], "std", WINDOW
    )
    usd_z = (usd - rolling_by_day(usd, "mean", WINDOW)) / rolling_by_day(usd, "std", WINDOW)

    log_ret = np.log(ibov["close"]).groupby(ibov.index.date).diff()
    realized_vol = rolling_by_day(log_ret, "std", WINDOW) * math.sqrt(BARS_PER_YEAR) * 100

    prev_close = ibov["close"].groupby(ibov.index.date).shift()
    tr = pd.concat(
        [ibov["high"] - ibov["low"], (ibov["high"] - prev_close).abs(), (ibov["low"] - prev_close).abs()], axis=1
    ).max(axis=1)
    atr_pct = rolling_by_day(tr, "mean", ATR_WINDOW) / ibov["close"] * 100

    return pd.DataFrame(
        {
            "pillars": pillars_score,
            "ibov_only": np.tanh(ibov_z),
            # Dólar caindo (real forte) costuma vir com estrangeiro comprando: fluxo ≈ −z(USD/BRL).
            "flow_usd": -usd_z,
            "vol": realized_vol,
            "atr_pct": atr_pct,
            "coverage": coverage,
        },
        index=ibov.index,
    )


# ----------------------------------------------------------------------------- simulação


@dataclass
class Trade:
    side: int
    entry_time: str
    entry: float
    stop: float
    target: float
    confidence: float
    exit_time: str = ""
    exit: float = 0.0
    reason: str = ""
    points: float = 0.0


@dataclass
class Variant:
    name: str
    score_col: str
    use_flow: bool
    threshold: float = 0.5
    contrarian: bool = False


@dataclass
class Result:
    variant: str
    trades: list[Trade] = field(default_factory=list)

    def stats(self, subset: list[Trade] | None = None) -> dict[str, float]:
        ts = self.trades if subset is None else subset
        pts = np.array([t.points for t in ts]) if ts else np.array([0.0])
        wins = pts[pts > 0]
        losses = pts[pts < 0]
        equity = np.cumsum(pts)
        drawdown = float((np.maximum.accumulate(np.concatenate([[0], equity]))[1:] - equity).max()) if ts else 0.0
        return {
            "operacoes": len(ts),
            "acerto_pct": round(100 * len(wins) / len(ts), 1) if ts else 0.0,
            "total_pts": round(float(pts.sum()), 0),
            "media_pts": round(float(pts.mean()), 1) if ts else 0.0,
            "profit_factor": round(float(wins.sum() / -losses.sum()), 2) if len(losses) else float("inf"),
            "max_drawdown_pts": round(drawdown, 0),
            "total_brl_1_contrato": round(float(pts.sum()) * POINT_VALUE_BRL, 2),
        }


def decide(score: float, flow: float, vol: float, v: Variant) -> tuple[int, float]:
    """Mesma regra do `generate_signal`, com limiar e uso do fluxo configuráveis."""
    if math.isnan(score) or (v.use_flow and math.isnan(flow)):
        return 0, 0.0
    side = 0
    if score > v.threshold and (not v.use_flow or flow > 0):
        side = 1
    elif score < -v.threshold and (not v.use_flow or flow < 0):
        side = -1
    if v.contrarian:
        side = -side
    excess = (abs(score) - v.threshold) / (1 - v.threshold)
    conf = 0.5 + 0.5 * min(1.0, max(0.0, excess)) if side else 0.0
    if vol > VOL_THRESHOLD:
        conf *= VOL_PENALTY
    return side, conf


def simulate(ibov: pd.DataFrame, feats: pd.DataFrame, v: Variant) -> Result:
    res = Result(v.name)
    half = COST_POINTS / 2
    for _, g in ibov.join(feats).groupby(ibov.index.date):
        o, h, l, c = (g[k].to_numpy() for k in ("open", "high", "low", "close"))
        score, flow, vol, atr = (g[k].to_numpy() for k in (v.score_col, "flow_usd", "vol", "atr_pct"))
        times = [t.isoformat() for t in g.index]
        pos: Trade | None = None
        pending_exit = False
        pending_entry: tuple[int, float, float] | None = None  # lado, atr%, confiança
        last_side = 0

        def close(t: Trade, price: float, i: int, reason: str) -> None:
            t.exit, t.exit_time, t.reason = price, times[i], reason
            t.points = (price - t.entry) * t.side - COST_POINTS
            res.trades.append(t)

        for i in range(len(g)):
            if pending_exit and pos:
                close(pos, o[i] - half * pos.side, i, "reversão")
                pos = None
            if pending_entry and pos is None:
                side, atr_i, conf = pending_entry
                entry = o[i] + half * side
                sl = round(entry * SL_ATR_MULT * atr_i / 100 / 5) * 5
                tp = round(entry * TP_ATR_MULT * atr_i / 100 / 5) * 5
                pos = Trade(side, times[i], entry, entry - side * sl, entry + side * tp, conf)
            pending_exit, pending_entry = False, None

            if pos:
                hit_stop = l[i] <= pos.stop if pos.side == 1 else h[i] >= pos.stop
                hit_tgt = h[i] >= pos.target if pos.side == 1 else l[i] <= pos.target
                if hit_stop:
                    close(pos, pos.stop, i, "stop")
                    pos = None
                elif hit_tgt:
                    close(pos, pos.target, i, "alvo")
                    pos = None

            if i == len(g) - 1:
                if pos:
                    close(pos, c[i], i, "fim do dia")
                break

            side, conf = decide(score[i], flow[i], vol[i], v)
            if math.isnan(atr[i]):
                side = 0
            if pos and side and side != pos.side:
                pending_exit = True
            if side and side != last_side and (pos is None or pending_exit):
                pending_entry = (side, atr[i], conf)
            last_side = side
    return res


def predictive_power(ibov: pd.DataFrame, feats: pd.DataFrame, col: str) -> list[dict[str, float]]:
    """O score antecipa o índice? Correlação e acerto de direção nos próximos k candles."""
    out = []
    close = ibov["close"]
    for k in FORWARD_BARS:
        fwd = close.groupby(close.index.date).shift(-k) / close - 1
        df = pd.DataFrame({"s": feats[col], "f": fwd}).dropna()
        strong = df[df["s"].abs() > 0.5]
        hit = float((np.sign(strong["s"]) == np.sign(strong["f"])).mean() * 100) if len(strong) else float("nan")
        out.append(
            {
                "candles_a_frente": k,
                "minutos": k * 5,
                "correlacao": round(float(df["s"].corr(df["f"])), 3),
                "acerto_direcao_score_forte_pct": round(hit, 1),
                "amostras_score_forte": int(len(strong)),
            }
        )
    return out


# ----------------------------------------------------------------------------- relatório


VARIANTS = [
    Variant("Pilares + fluxo (dólar), limiar 0,5", "pillars", True),
    Variant("Pilares sem fluxo, limiar 0,5", "pillars", False),
    Variant("Pilares + fluxo, limiar 0,3", "pillars", True, 0.3),
    Variant("Pilares + fluxo, limiar 0,7", "pillars", True, 0.7),
    Variant("Só o Ibovespa (sem pilares), limiar 0,5", "ibov_only", False),
    Variant("Pilares + fluxo, operando ao CONTRÁRIO", "pillars", True, 0.5, contrarian=True),
]


def table(rows: list[dict], cols: list[str]) -> str:
    head = "| " + " | ".join(cols) + " |\n|" + "---|" * len(cols) + "\n"
    return head + "\n".join("| " + " | ".join(str(r[c]) for c in cols) + " |" for r in rows)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="baixa os dados de novo em vez de usar o cache")
    args = ap.parse_args()

    ibov, panel, usd, missing = load(args.refresh)
    feats = compute_features(ibov, panel, usd)
    days = sorted(set(ibov.index.date))
    split = days[len(days) // 2]

    results = [simulate(ibov, feats, v) for v in VARIANTS]
    rows = []
    for r in results:
        rows.append({"variante": r.variant, **r.stats()})
    main_r = results[0]
    halves = [
        {"periodo": f"{days[0]} a {days[len(days) // 2 - 1]}", **main_r.stats([t for t in main_r.trades if t.entry_time[:10] < str(split)])},
        {"periodo": f"{split} a {days[-1]}", **main_r.stats([t for t in main_r.trades if t.entry_time[:10] >= str(split)])},
    ]
    reasons = pd.Series([t.reason for t in main_r.trades]).value_counts().to_dict() if main_r.trades else {}
    pred_p = predictive_power(ibov, feats, "pillars")
    pred_i = predictive_power(ibov, feats, "ibov_only")
    corr_same = round(float(feats["pillars"].corr(feats["ibov_only"])), 3)

    stat_cols = ["operacoes", "acerto_pct", "total_pts", "media_pts", "profit_factor", "max_drawdown_pts", "total_brl_1_contrato"]
    pred_cols = ["minutos", "correlacao", "acerto_direcao_score_forte_pct", "amostras_score_forte"]
    report = f"""# Backtest IndexAlpha · dados reais da B3

Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')} · {len(days)} pregões ({days[0]} a {days[-1]}) · candles de 5 min (Yahoo Finance).

**Premissas:** Ibovespa à vista como substituto do WIN (R$ {POINT_VALUE_BRL:.2f}/ponto/contrato) · sinal no fechamento, execução na abertura do candle seguinte · stop {SL_ATR_MULT}×ATR e alvo {TP_ATR_MULT}×ATR · custo de {COST_POINTS:.0f} pontos por operação · posição zerada no fim do dia · janela de {WINDOW} candles reiniciando a cada pregão.
**Fluxo estrangeiro:** como não existe ao vivo, usa o dólar como substituto (real se valorizando = fluxo positivo).
**Volatilidade:** volatilidade realizada do Ibovespa (anualizada), no lugar da implícita.
**Ativos sem dados:** {", ".join(missing) or "nenhum"} · tickers atualizados: {", ".join(f"{k}→{v}" for k, v in ALIASES.items())}.

## Resultado por variante

{table(rows, ["variante", *stat_cols])}

## Variante principal nas duas metades do período

{table(halves, ["periodo", *stat_cols])}

Saídas da variante principal: {", ".join(f"{k} {v}" for k, v in reasons.items()) or "—"}.

## O score antecipa o índice?

Correlação entre o score e o retorno do Ibovespa nos próximos minutos, e acerto da direção quando |score| > 0,5.

**Score dos pilares**

{table(pred_p, pred_cols)}

**Só o Ibovespa (comparação)**

{table(pred_i, pred_cols)}

Correlação entre o score dos pilares e o Z-Score do próprio Ibovespa: **{corr_same}**.
"""
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "report.md").write_text(report, encoding="utf-8")
    (RESULTS / "trades_principal.json").write_text(
        json.dumps([asdict(t) for t in main_r.trades], ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(report)


if __name__ == "__main__":
    main()
