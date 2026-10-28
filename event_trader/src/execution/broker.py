"""Interface de execução: BrokerInterface, PaperBroker e esqueleto IBKR."""

from __future__ import annotations

import asyncio
import math
import uuid
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum

import pandas as pd
from loguru import logger

from src.config import BrokerConfig
from src.models import Action, TradingSignal


class OrderStatus(str, Enum):
    FILLED = "FILLED"
    REJECTED = "REJECTED"
    SKIPPED = "SKIPPED"


@dataclass(frozen=True)
class OrderResult:
    order_id: str
    ticker: str
    action: Action
    status: OrderStatus
    quantity: int = 0
    fill_price: float | None = None
    stop_price: float | None = None
    take_profit_price: float | None = None
    commission: float = 0.0
    message: str = ""
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class BrokerError(RuntimeError):
    """Erro de execução na corretora."""


class BrokerInterface(ABC):
    """Contrato de execução. Implementações reais: IBKR, Clear/XP, Genial, etc."""

    @abstractmethod
    async def execute_order(self, signal: TradingSignal, price: float | None = None) -> OrderResult:
        """Envia uma ordem a partir do sinal.

        Args:
            signal: sinal acionável (HOLD é ignorado).
            price: preço de referência/limite; usa ``signal.reference_price`` se omitido.
        """


class PaperBroker(BrokerInterface):
    """Paper trading: registra ordens num DataFrame e mantém saldo simulado.

    Sizing por risco fixo: quantidade = (equity × risk_per_trade) / (preço × stop%),
    limitada a ``max_position_pct`` do equity e arredondada ao lote padrão (100).
    Slippage e corretagem são aplicados em bps. Short é permitido (vendido
    a descoberto com aluguel não modelado).
    """

    COLUMNS = [
        "order_id", "timestamp", "ticker", "action", "status", "quantity", "fill_price",
        "stop_price", "take_profit_price", "commission", "notional", "cash_after", "rule_id",
        "confidence", "message",
    ]

    def __init__(self, config: BrokerConfig | None = None) -> None:
        self.config = config or BrokerConfig()
        self.cash = self.config.initial_cash
        self.positions: dict[str, int] = {}
        self.avg_price: dict[str, float] = {}
        self.orders = pd.DataFrame(columns=self.COLUMNS)
        self._lock = asyncio.Lock()

    def equity(self, marks: dict[str, float] | None = None) -> float:
        """Equity = caixa + posições marcadas (usa preço médio se não houver marcação)."""
        marks = marks or {}
        value = sum(qty * marks.get(t, self.avg_price.get(t, 0.0)) for t, qty in self.positions.items())
        return self.cash + value

    async def execute_order(self, signal: TradingSignal, price: float | None = None) -> OrderResult:
        async with self._lock:
            result = self._execute(signal, price)
            self._record(result, signal)
            return result

    def _execute(self, signal: TradingSignal, price: float | None) -> OrderResult:
        oid = uuid.uuid4().hex[:12]
        if not signal.is_actionable:
            return OrderResult(oid, signal.ticker, signal.action, OrderStatus.SKIPPED, message="HOLD")
        ref = price if price is not None else signal.reference_price
        if ref is None or ref <= 0 or not math.isfinite(ref):
            return OrderResult(oid, signal.ticker, signal.action, OrderStatus.REJECTED, message="sem preço de referência")
        if signal.stop_loss_pct <= 0:
            return OrderResult(oid, signal.ticker, signal.action, OrderStatus.REJECTED, message="stop inválido")

        cfg = self.config
        equity = self.equity()
        risk_budget = equity * cfg.risk_per_trade_pct
        qty_by_risk = risk_budget / (ref * signal.stop_loss_pct)
        qty_by_cap = equity * cfg.max_position_pct / ref
        qty = int(min(qty_by_risk, qty_by_cap) // cfg.lot_size * cfg.lot_size)
        if qty <= 0:
            return OrderResult(oid, signal.ticker, signal.action, OrderStatus.REJECTED,
                               message="quantidade abaixo de um lote")

        side = 1 if signal.action is Action.BUY else -1
        fill = ref * (1 + side * cfg.slippage_bps / 10_000)
        notional = qty * fill
        commission = notional * cfg.commission_bps / 10_000
        if side == 1 and notional + commission > self.cash:
            return OrderResult(oid, signal.ticker, signal.action, OrderStatus.REJECTED, message="caixa insuficiente")

        self.cash -= side * notional + commission
        prev_qty = self.positions.get(signal.ticker, 0)
        new_qty = prev_qty + side * qty
        if new_qty == 0:
            self.positions.pop(signal.ticker, None)
            self.avg_price.pop(signal.ticker, None)
        else:
            if prev_qty == 0 or (prev_qty > 0) != (new_qty > 0):
                self.avg_price[signal.ticker] = fill
            elif abs(new_qty) > abs(prev_qty):
                self.avg_price[signal.ticker] = (
                    self.avg_price[signal.ticker] * abs(prev_qty) + fill * qty
                ) / abs(new_qty)
            self.positions[signal.ticker] = new_qty

        stop_px = fill * (1 - side * signal.stop_loss_pct)
        tp_px = fill * (1 + side * signal.take_profit_pct)
        logger.info("Ordem paper executada", ticker=signal.ticker, action=signal.action.value, qty=qty,
                    fill=round(fill, 2), cash=round(self.cash, 2))
        return OrderResult(oid, signal.ticker, signal.action, OrderStatus.FILLED, qty, round(fill, 4),
                           round(stop_px, 2), round(tp_px, 2), round(commission, 2), "ok")

    def _record(self, result: OrderResult, signal: TradingSignal) -> None:
        row = asdict(result)
        row["action"] = result.action.value
        row["status"] = result.status.value
        row["notional"] = round((result.fill_price or 0) * result.quantity, 2)
        row["cash_after"] = round(self.cash, 2)
        row["rule_id"] = signal.rule_id
        row["confidence"] = signal.confidence
        new = pd.DataFrame([row], columns=self.COLUMNS)
        self.orders = new if self.orders.empty else pd.concat([self.orders, new], ignore_index=True)


class IBKRBroker(BrokerInterface):  # pragma: no cover - requer TWS/Gateway
    """Esqueleto para Interactive Brokers (via ``ib_async``/``ib_insync``).

    Passos para ativar:
      1. ``pip install ib_async`` e subir TWS/IB Gateway (porta 7497 paper / 7496 live).
      2. Implementar ``connect`` com ``IB().connectAsync(host, port, clientId)``.
      3. Em ``execute_order``: ``Stock(ticker, 'BOVESPA', 'BRL')`` e um *bracket order*
         (``ib.bracketOrder(side, qty, limit, take_profit, stop_loss)``) para que
         stop e alvo vivam no servidor da corretora, não neste processo.
    """

    def __init__(self, host: str = "127.0.0.1", port: int = 7497, client_id: int = 17) -> None:
        self.host, self.port, self.client_id = host, port, client_id

    async def execute_order(self, signal: TradingSignal, price: float | None = None) -> OrderResult:
        raise NotImplementedError("Integração IBKR não configurada; veja a docstring da classe.")
