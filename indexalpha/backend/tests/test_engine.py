from __future__ import annotations

import asyncio
import math

import pytest

from app.ai.contextual_ai import ContextualAI, ThesisInput
from app.data.market_simulator import MarketSimulator
from app.engine.index_engine import AssetQuote, IndexEngine
from app.engine.signals import Action, apply_volatility_filter, generate_signal
from app.service import IndexAlphaService, trade_levels


def test_z_score_formula_and_guards() -> None:
    assert IndexEngine.z_score(110, 100, 5) == pytest.approx(2.0)
    assert IndexEngine.z_score(100, 100, 0) == 0.0
    assert IndexEngine.z_score(200, 100, 1) == IndexEngine.Z_CLIP


def test_index_score_is_weighted_sum_of_z() -> None:
    engine = IndexEngine({"AAA": 3.0, "BBB": 1.0})
    reading = engine.compute(
        [AssetQuote("AAA", 102, 100, 2), AssetQuote("BBB", 96, 100, 2)]  # z = +1 e -2
    )
    raw = 0.75 * 1 + 0.25 * -2
    assert reading.raw_score == pytest.approx(raw)
    assert reading.index_score == pytest.approx(math.tanh(raw))
    assert [p.ticker for p in reading.top_drivers] == ["AAA", "BBB"]


def test_missing_asset_renormalizes_weights() -> None:
    engine = IndexEngine({"AAA": 1.0, "BBB": 1.0})
    reading = engine.compute([AssetQuote("AAA", 102, 100, 2)])
    assert reading.coverage == pytest.approx(0.5)
    assert reading.raw_score == pytest.approx(1.0)


@pytest.mark.parametrize(
    ("score", "flow", "expected"),
    [
        (0.7, 100, Action.BUY),
        (0.7, -100, Action.HOLD),
        (-0.7, -100, Action.SELL),
        (-0.7, 100, Action.HOLD),
        (0.3, 100, Action.HOLD),
    ],
)
def test_signal_rules(score: float, flow: float, expected: Action) -> None:
    assert generate_signal(score, flow, vix_level=18).action is expected


def test_volatility_filter_halves_confidence() -> None:
    calm = generate_signal(0.9, 100, vix_level=20)
    stressed = generate_signal(0.9, 100, vix_level=30)
    assert stressed.volatility_filter_applied and not calm.volatility_filter_applied
    assert stressed.confidence == pytest.approx(calm.confidence * 0.5)
    assert apply_volatility_filter(0.8, 25.0) == (0.8, False)


def test_risk_params_scale_with_atr() -> None:
    sig = generate_signal(0.8, 100, 18, atr_pct=0.4)
    assert sig.stop_loss_pct == pytest.approx(0.6)
    assert sig.take_profit_pct == pytest.approx(1.2)
    levels = trade_levels(130_000, sig)
    assert levels is not None
    assert levels["stop_loss"] < 130_000 < levels["take_profit"]


def test_simulator_produces_all_pillars() -> None:
    state = MarketSimulator(seed=7).tick()
    assert len(state.quotes) == 20
    assert all(q.std20 > 0 for q in state.quotes)
    assert state.win_price % 5 == 0


def test_service_snapshot_offline() -> None:
    service = IndexAlphaService(MarketSimulator(seed=1), ai=ContextualAI(enabled=False))
    for _ in range(300):
        service.step()
    snap = service.snapshot()
    assert -1 < snap["index_score"] < 1
    assert len(snap["pillars"]) == 20
    assert snap["thesis"]["source"] == "fallback"
    assert len(snap["history"]) <= 10


def test_fallback_thesis_without_llm() -> None:
    ai = ContextualAI(enabled=False)
    reading = IndexEngine().compute(MarketSimulator(seed=3).tick().quotes)
    result = asyncio.run(
        ai.generate(
            ThesisInput(reading.index_score, Action.HOLD, 0.6, reading.top_drivers, 120.0, 30.0, "IPCA")
        )
    )
    assert result.source == "fallback"
    assert result.thesis_text.count(". ") >= 2
    assert "volatilidade" in result.risk_warning
