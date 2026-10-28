"""Motor de backtest event-driven.

Usa o MESMO ``EventClassifier`` e ``TradingSignalGenerator`` da produção.
Regras de simulação (sem look-ahead):

* Snapshot (preço, ATR) é calculado só com barras ANTERIORES à entrada.
* Entrada na abertura do primeiro pregão após o evento (o "gap de abertura").
  Eventos antes das 10:00 (abertura B3) entram na abertura do mesmo dia.
* Alvo absoluto vem do sinal (referência = fechamento anterior). Se o gap já
  ultrapassou o alvo, o trade é descartado (``GAP_THROUGH_TARGET``).
* Stop relativo ao preço de entrada. Se stop e alvo são tocados no mesmo
  candle, assume-se o stop (premissa conservadora).
* Sem saída em ``max_holding_days`` pregões, sai no fechamento (``TIME``).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import time as dtime
from typing import Any

import pandas as pd
from loguru import logger

from src.ai.classifier import EventClassifier
from src.models import B3_TZ, Action, ClassifiedEvent, MarketSnapshot, RawEvent, TradingSignal
from src.strategy.market_data import compute_atr
from src.strategy.signals import TradingSignalGenerator

B3_OPEN = dtime(10, 0)


@dataclass(frozen=True)
class BacktestConfig:
    max_holding_days: int = 5
    cost_bps_round_trip: float = 15.0  # corretagem + emolumentos + slippage
    allocation_per_trade: float = 0.10
    atr_period: int = 14


def load_events(path: str) -> list[RawEvent]:
    """Lê o CSV de eventos. Colunas extras (implied_vol, trailing_dividend_yield) são opcionais."""
    df = pd.read_csv(path)
    events: list[RawEvent] = []
    for idx, row in df.iterrows():
        try:
            events.append(RawEvent.from_dict(row.to_dict()))
        except (ValueError, TypeError) as exc:
            logger.warning("Linha de evento inválida ignorada", row=idx, error=str(exc))
    return events


def load_event_meta(path: str) -> dict[str, dict[str, float | None]]:
    """Metadados point-in-time por ``source_id`` (vol implícita, DY na data do evento)."""
    df = pd.read_csv(path)
    meta: dict[str, dict[str, float | None]] = {}
    for _, row in df.iterrows():
        meta[str(row["source_id"])] = {
            "implied_vol": _nan_to_none(row.get("implied_vol")),
            "trailing_dividend_yield": _nan_to_none(row.get("trailing_dividend_yield")),
        }
    return meta


def _nan_to_none(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None
    return float(value)


def load_prices(path: str) -> dict[str, pd.DataFrame]:
    """Lê OHLC diário (colunas: date, ticker, open, high, low, close)."""
    df = pd.read_csv(path, parse_dates=["date"])
    out: dict[str, pd.DataFrame] = {}
    for ticker, g in df.groupby("ticker"):
        g = g.sort_values("date").set_index("date")[["open", "high", "low", "close"]].astype(float)
        out[str(ticker).upper()] = g
    return out


class BacktestEngine:
    def __init__(
        self,
        classifier: EventClassifier,
        signal_generator: TradingSignalGenerator,
        prices: dict[str, pd.DataFrame],
        event_meta: dict[str, dict[str, float | None]] | None = None,
        config: BacktestConfig | None = None,
    ) -> None:
        self.classifier = classifier
        self.signal_generator = signal_generator
        self.prices = prices
        self.event_meta = event_meta or {}
        self.config = config or BacktestConfig()

    def _entry_index(self, bars: pd.DataFrame, event: RawEvent) -> int | None:
        ts = event.timestamp.astimezone(B3_TZ)
        event_day = pd.Timestamp(ts.date())
        if ts.timetz().replace(tzinfo=None) < B3_OPEN:
            pos = bars.index.searchsorted(event_day, side="left")
        else:
            pos = bars.index.searchsorted(event_day, side="right")
        return int(pos) if pos < len(bars) else None

    def snapshot_before(self, event: RawEvent, bars: pd.DataFrame, entry_pos: int) -> MarketSnapshot | None:
        history = bars.iloc[:entry_pos]
        if history.empty:
            return None
        atr_series = compute_atr(history, self.config.atr_period)
        atr = atr_series.iloc[-1]
        meta = self.event_meta.get(event.source_id, {})
        return MarketSnapshot(
            ticker=event.ticker,
            last_price=float(history["close"].iloc[-1]),
            atr=None if pd.isna(atr) else float(atr),
            implied_vol=meta.get("implied_vol"),
            trailing_dividend_yield=meta.get("trailing_dividend_yield"),
        )

    def simulate_trade(self, signal: TradingSignal, bars: pd.DataFrame, entry_pos: int) -> dict[str, Any]:
        """Simula um trade candle a candle a partir de ``entry_pos``."""
        entry_bar = bars.iloc[entry_pos]
        entry = float(entry_bar["open"])
        side = 1 if signal.action is Action.BUY else -1
        target = signal.target_price
        if target is None:
            target = entry * (1 + side * signal.take_profit_pct)
        stop = entry * (1 - side * signal.stop_loss_pct)

        base = {"entry_date": bars.index[entry_pos], "entry_price": entry, "stop_price": stop, "target_price": target}
        if (side == 1 and entry >= target) or (side == -1 and entry <= target):
            return {**base, "exit_reason": "GAP_THROUGH_TARGET"}

        last_pos = min(entry_pos + self.config.max_holding_days - 1, len(bars) - 1)
        exit_price, exit_reason, exit_pos = float(bars.iloc[last_pos]["close"]), "TIME", last_pos
        for pos in range(entry_pos, last_pos + 1):
            bar = bars.iloc[pos]
            hit_stop = bar["low"] <= stop if side == 1 else bar["high"] >= stop
            hit_target = bar["high"] >= target if side == 1 else bar["low"] <= target
            if hit_stop:
                exit_price, exit_reason, exit_pos = stop, "STOP", pos
                break
            if hit_target:
                exit_price, exit_reason, exit_pos = target, "TARGET", pos
                break

        gross = side * (exit_price / entry - 1)
        net = gross - self.config.cost_bps_round_trip / 10_000
        return {
            **base,
            "exit_date": bars.index[exit_pos],
            "exit_price": exit_price,
            "exit_reason": exit_reason,
            "holding_days": exit_pos - entry_pos + 1,
            "gross_return": gross,
            "net_return": net,
        }

    async def run(self, events: list[RawEvent]) -> tuple[pd.DataFrame, pd.DataFrame]:
        """Retorna ``(trades, signals)``: trades executados e o log de todos os sinais."""
        results = await self.classifier.classify_many(events)
        trade_rows: list[dict[str, Any]] = []
        signal_rows: list[dict[str, Any]] = []

        for event, outcome in zip(events, results, strict=True):
            base = {"ticker": event.ticker, "timestamp": event.timestamp, "headline": event.headline[:90],
                    "source_id": event.source_id}
            if isinstance(outcome, Exception):
                signal_rows.append({**base, "status": f"CLASSIFY_ERROR: {outcome}"})
                continue
            classified: ClassifiedEvent = outcome
            bars = self.prices.get(event.ticker)
            entry_pos = self._entry_index(bars, event) if bars is not None else None
            if bars is None or entry_pos is None:
                signal_rows.append({**base, "status": "NO_PRICE_DATA"})
                continue
            snapshot = self.snapshot_before(event, bars, entry_pos)
            signal = self.signal_generator.generate(classified, snapshot)
            c = classified.classification
            row = {
                **base,
                "category": c.event_category.value,
                "sentiment": c.sentiment_score,
                "magnitude": c.magnitude_estimate.value,
                "material": c.is_material,
                "action": signal.action.value,
                "rule_id": signal.rule_id,
                "confidence": signal.confidence,
                "stop_loss_pct": signal.stop_loss_pct,
                "take_profit_pct": signal.take_profit_pct,
            }
            if not signal.is_actionable:
                signal_rows.append({**row, "status": "HOLD"})
                continue
            trade = self.simulate_trade(signal, bars, entry_pos)
            signal_rows.append({**row, "status": trade["exit_reason"]})
            if "net_return" in trade:
                trade_rows.append({**row, **trade})

        return pd.DataFrame(trade_rows), pd.DataFrame(signal_rows)
