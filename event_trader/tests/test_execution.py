from __future__ import annotations

from src.config import BrokerConfig
from src.execution.alerts import AlertChannel, AlertDispatcher, escape_telegram_v2, format_signal_markdown
from src.execution.broker import OrderStatus, PaperBroker
from src.models import Action, TradingSignal
from tests.conftest import make_classified


def _signal(action: Action = Action.BUY, price: float | None = 40.0, sl: float = 0.04, tp: float = 0.08) -> TradingSignal:
    return TradingSignal("PETR4", action, 0.8, sl, tp, "teste", "R1", "h" * 64, reference_price=price)


async def test_paper_buy_sizes_by_risk_and_updates_cash() -> None:
    broker = PaperBroker(BrokerConfig(initial_cash=1_000_000, risk_per_trade_pct=0.005, max_position_pct=0.5,
                                      slippage_bps=0, commission_bps=0))
    r = await broker.execute_order(_signal())
    # risco 5.000 / (40 * 4%) = 3125 -> lote 3100
    assert r.status is OrderStatus.FILLED and r.quantity == 3100
    assert broker.cash == 1_000_000 - 3100 * 40
    assert broker.positions == {"PETR4": 3100}
    assert len(broker.orders) == 1 and broker.orders.iloc[0]["status"] == "FILLED"


async def test_paper_short_and_cover() -> None:
    broker = PaperBroker(BrokerConfig(slippage_bps=0, commission_bps=0, max_position_pct=0.5))
    await broker.execute_order(_signal(Action.SELL))
    assert broker.positions["PETR4"] < 0
    assert broker.cash > broker.config.initial_cash  # venda a descoberto credita o caixa
    await broker.execute_order(_signal(Action.BUY))  # mesmo equity -> mesma quantidade -> zera
    assert "PETR4" not in broker.positions
    assert broker.cash == broker.config.initial_cash


async def test_paper_rejects_and_skips() -> None:
    broker = PaperBroker()
    assert (await broker.execute_order(_signal(Action.HOLD))).status is OrderStatus.SKIPPED
    assert (await broker.execute_order(_signal(price=None))).status is OrderStatus.REJECTED
    assert broker.cash == broker.config.initial_cash
    assert len(broker.orders) == 2


def test_telegram_escape() -> None:
    assert escape_telegram_v2("M&A +0.80 (R$ 1.5)") == r"M&A \+0\.80 \(R$ 1\.5\)"


def test_markdown_contains_required_fields() -> None:
    ce = make_classified(event_category="M&A", sentiment_score=0.8, actionable_thesis="OPA com prêmio")
    text = format_signal_markdown(ce, _signal())
    for needle in ("PETR4", "Horário", "M&A", "+0.80", "OPA com prêmio", "BUY"):
        assert needle in text


async def test_dispatcher_isolates_channel_failures() -> None:
    sent: list[str] = []

    class Ok(AlertChannel):
        name = "ok"

        async def send(self, text: str) -> None:
            sent.append(text)

    class Boom(AlertChannel):
        name = "boom"

        async def send(self, text: str) -> None:
            raise RuntimeError("down")

    d = AlertDispatcher([Ok(), Boom()])
    status = await d.dispatch(make_classified(), _signal())
    assert status == {"ok": True, "boom": False} and len(sent) == 1
    assert await d.dispatch(make_classified(), _signal(Action.HOLD)) == {}
