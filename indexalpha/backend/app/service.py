"""Orquestra simulador -> engine -> sinal -> IA e mantém o estado servido pela API."""

from __future__ import annotations

import asyncio
import itertools
import logging
import random
import time
from collections import deque
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from app.ai.contextual_ai import ContextualAI, ThesisInput, ThesisResult
from app.data.market_simulator import WIN_POINT_VALUE_BRL, MarketSimulator, MarketState
from app.engine.index_engine import IndexEngine, IndexReading
from app.engine.signals import Action, Signal, generate_signal

log = logging.getLogger(__name__)

TICK_SECONDS: float = 5.0
AI_REFRESH_SECONDS: float = 60.0
AI_DRIVER_REFRESH_SECONDS: float = 20.0
"""Intervalo mínimo para refazer a tese quando só os top drivers mudam (eles trocam de ordem quase todo tick)."""
HISTORY_SIZE: int = 10
SCORE_HISTORY_SIZE: int = 120
CANDLE_TICKS: int = 6
"""Ticks por candle do WIN (6 × 5 s = candles de 30 s)."""
CANDLE_HISTORY: int = 80
WARMUP_TICKS: int = 360
"""Histórico gerado na partida do servidor (~30 min) para o gráfico já abrir cheio."""


@dataclass
class SignalRecord:
    id: int
    timestamp: str
    index_score: float
    action: str
    confidence: float
    entry_price: float
    stop_loss: float
    take_profit: float
    status: Literal["open", "closed"] = "open"
    exit_price: float | None = None
    exit_reason: str | None = None
    pnl_points: float = 0.0
    pnl_brl: float = 0.0

    @property
    def direction(self) -> int:
        return 1 if self.action == Action.BUY.value else -1

    def mark(self, price: float) -> None:
        self.pnl_points = round((price - self.entry_price) * self.direction, 1)
        self.pnl_brl = round(self.pnl_points * WIN_POINT_VALUE_BRL, 2)

    def close(self, price: float, reason: str) -> None:
        self.mark(price)
        self.status, self.exit_price, self.exit_reason = "closed", price, reason


def trade_levels(entry: float, signal: Signal) -> dict[str, Any] | None:
    """Converte stop/alvo percentuais em preços do WIN e R$ por contrato."""
    if signal.action is Action.HOLD:
        return None
    direction = 1 if signal.action is Action.BUY else -1
    sl_points = round(entry * signal.stop_loss_pct / 100.0 / 5.0) * 5.0
    tp_points = round(entry * signal.take_profit_pct / 100.0 / 5.0) * 5.0
    return {
        "entry": entry,
        "stop_loss": entry - direction * sl_points,
        "take_profit": entry + direction * tp_points,
        "stop_points": sl_points,
        "target_points": tp_points,
        "risk_brl": round(sl_points * WIN_POINT_VALUE_BRL, 2),
        "reward_brl": round(tp_points * WIN_POINT_VALUE_BRL, 2),
        "risk_reward": round(tp_points / sl_points, 2) if sl_points else None,
        "point_value_brl": WIN_POINT_VALUE_BRL,
    }


@dataclass
class Candle:
    t: str
    o: float
    h: float
    l: float  # noqa: E741
    c: float
    v: int
    score: float


class IndexAlphaService:
    def __init__(
        self,
        simulator: MarketSimulator | None = None,
        engine: IndexEngine | None = None,
        ai: ContextualAI | None = None,
        warmup_ticks: int = 0,
    ) -> None:
        self.simulator = simulator or MarketSimulator()
        self.engine = engine or IndexEngine()
        self.ai = ai or ContextualAI()
        self._ids = itertools.count(1)
        self._history: deque[SignalRecord] = deque(maxlen=HISTORY_SIZE)
        self._score_history: deque[dict[str, Any]] = deque(maxlen=SCORE_HISTORY_SIZE)
        self._open: SignalRecord | None = None
        self._last_action: Action = Action.HOLD
        self._state: MarketState | None = None
        self._reading: IndexReading | None = None
        self._signal: Signal | None = None
        self._thesis: ThesisResult | None = None
        self._thesis_key: tuple[str, tuple[str, ...]] | None = None
        self._thesis_at: float = 0.0
        self._thesis_task: asyncio.Task[None] | None = None
        self._candles: deque[Candle] = deque(maxlen=CANDLE_HISTORY)
        self._tick_no = 0
        self._last_price: float | None = None
        self._session_open: float | None = None
        self._rng = random.Random()

        if warmup_ticks > 0:
            start = datetime.now(timezone.utc) - timedelta(seconds=warmup_ticks * TICK_SECONDS)
            for i in range(warmup_ticks):
                self.step(start + timedelta(seconds=i * TICK_SECONDS))
            self._thesis_at = 0.0  # primeiro tick ao vivo já gera a tese com o LLM

    async def run(self) -> None:
        while True:
            try:
                self.step()
            except Exception:  # o loop da demo não pode morrer por um tick ruim
                log.exception("Falha no tick do simulador")
            await asyncio.sleep(TICK_SECONDS)

    def step(self, now: datetime | None = None) -> None:
        state = self.simulator.tick(now)
        reading = self.engine.compute(state.quotes)
        signal = generate_signal(reading.index_score, state.foreign_flow, state.vix, state.atr_pct)
        self._state, self._reading, self._signal = state, reading, signal

        self._score_history.append(
            {"t": state.timestamp.isoformat(), "score": round(reading.index_score, 4)}
        )
        self._update_candles(state, reading)
        self._update_trades(state, reading, signal)
        self._maybe_refresh_thesis(force=False)

    def _update_candles(self, state: MarketState, reading: IndexReading) -> None:
        price = state.win_price
        prev = self._last_price if self._last_price is not None else price
        if self._session_open is None:
            self._session_open = price
        if self._tick_no % CANDLE_TICKS == 0 or not self._candles:
            # Abre no fechamento anterior para os candles ficarem contínuos.
            self._candles.append(
                Candle(t=state.timestamp.isoformat(), o=prev, h=max(prev, price), l=min(prev, price), c=price, v=0, score=0.0)
            )
        candle = self._candles[-1]
        candle.h, candle.l, candle.c = max(candle.h, price), min(candle.l, price), price
        candle.score = round(reading.index_score, 4)
        # Volume simulado: base aleatória + proporcional ao deslocamento do preço.
        candle.v += int(self._rng.uniform(60, 180) + abs(price - prev) * 4)
        self._last_price = price
        self._tick_no += 1

    def _update_trades(self, state: MarketState, reading: IndexReading, signal: Signal) -> None:
        price = state.win_price
        if self._open is not None:
            trade = self._open
            hit_stop = (price - trade.stop_loss) * trade.direction <= 0
            hit_target = (price - trade.take_profit) * trade.direction >= 0
            reversed_ = signal.action is not Action.HOLD and signal.action.value != trade.action
            if hit_stop:
                trade.close(trade.stop_loss, "stop")
            elif hit_target:
                trade.close(trade.take_profit, "alvo")
            elif reversed_:
                trade.close(price, "reversão")
            else:
                trade.mark(price)
            if trade.status == "closed":
                self._open = None

        # Só abre na transição para BUY/SELL, para não reentrar a cada tick.
        if signal.action is not Action.HOLD and signal.action is not self._last_action and self._open is None:
            levels = trade_levels(price, signal)
            assert levels is not None
            record = SignalRecord(
                id=next(self._ids),
                timestamp=state.timestamp.isoformat(),
                index_score=round(reading.index_score, 4),
                action=signal.action.value,
                confidence=signal.confidence,
                entry_price=price,
                stop_loss=levels["stop_loss"],
                take_profit=levels["take_profit"],
            )
            self._history.appendleft(record)
            self._open = record
        self._last_action = signal.action

    def _maybe_refresh_thesis(self, force: bool) -> None:
        if self._reading is None or self._signal is None or self._state is None:
            return
        if self._thesis_task is not None and not self._thesis_task.done():
            return
        key = (self._signal.action.value, tuple(sorted(p.ticker for p in self._reading.top_drivers)))
        age = time.monotonic() - self._thesis_at
        action_changed = self._thesis_key is None or key[0] != self._thesis_key[0]
        drivers_changed = self._thesis_key is not None and key[1] != self._thesis_key[1]
        if not (
            force
            or self._thesis is None
            or action_changed
            or (drivers_changed and age >= AI_DRIVER_REFRESH_SECONDS)
            or age >= AI_REFRESH_SECONDS
        ):
            return

        data = ThesisInput(
            index_score=self._reading.index_score,
            action=self._signal.action,
            confidence=self._signal.confidence,
            top_drivers=self._reading.top_drivers,
            foreign_flow=self._state.foreign_flow,
            vix=self._state.vix,
            macro_scenario=self._state.macro_scenario,
        )
        self._thesis_key, self._thesis_at = key, time.monotonic()
        if self._thesis is None:
            self._thesis = self.ai.fallback(data)  # mostra algo enquanto o LLM responde
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return  # chamado fora do loop (ex.: testes síncronos)
        self._thesis_task = loop.create_task(self._run_thesis(data))

    async def _run_thesis(self, data: ThesisInput) -> None:
        self._thesis = await self.ai.generate(data)

    def refresh_thesis(self) -> None:
        self._maybe_refresh_thesis(force=True)

    def snapshot(self) -> dict[str, Any]:
        if self._state is None or self._reading is None or self._signal is None:
            self.step()
        assert self._state and self._reading and self._signal
        state, reading, signal = self._state, self._reading, self._signal
        return {
            "timestamp": state.timestamp.isoformat(),
            "index_score": round(reading.index_score, 4),
            "raw_score": round(reading.raw_score, 4),
            "coverage": round(reading.coverage, 4),
            "signal": signal.to_dict(),
            "market": {
                "win_price": state.win_price,
                "foreign_flow": state.foreign_flow,
                "vix": state.vix,
                "atr_pct": state.atr_pct,
                "macro_scenario": state.macro_scenario,
                "factor_trends": state.factor_trends,
                "session_open": self._session_open,
            },
            "candles": [asdict(c) for c in self._candles],
            "candle_seconds": CANDLE_TICKS * TICK_SECONDS,
            "sparks": {p.ticker: self.simulator.price_history(p.ticker) for p in reading.pillars},
            "pillars": [p.to_dict() for p in reading.pillars],
            "top_drivers": [p.ticker for p in reading.top_drivers],
            "thesis": self._thesis.to_dict() if self._thesis else None,
            "ai_enabled": self.ai.llm_enabled,
            "trade": trade_levels(state.win_price, signal),
            "open_position": asdict(self._open) if self._open else None,
            "history": [asdict(r) for r in self._history],
            "score_history": list(self._score_history),
            "tick_seconds": TICK_SECONDS,
        }
