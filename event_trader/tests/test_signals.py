from __future__ import annotations

import math

import pytest

from src.config import SignalConfig
from src.models import Action, MarketSnapshot
from src.strategy.signals import TradingSignalGenerator
from tests.conftest import make_classified

GEN = TradingSignalGenerator(SignalConfig())
SNAP = MarketSnapshot("PETR4", last_price=40.0, atr=1.0, implied_vol=None, trailing_dividend_yield=0.05)


def test_rule1_ma_buy_with_offer_target() -> None:
    ce = make_classified(event_category="M&A", sentiment_score=0.8, magnitude_estimate="HIGH",
                         is_material=True, offer_price=60.0)
    s = GEN.generate(ce, SNAP)
    assert s.action is Action.BUY and s.rule_id == "R1_MA_POSITIVE"
    assert s.target_price == pytest.approx(0.85 * 60.0, abs=0.01)
    assert s.stop_loss_pct <= s.take_profit_pct


def test_rule1_hold_when_price_above_85pct_of_offer() -> None:
    ce = make_classified(event_category="M&A", sentiment_score=0.8, offer_price=45.0)
    s = GEN.generate(ce, SNAP)  # 0.85*45 = 38.25 < 40
    assert s.action is Action.HOLD and s.rule_id == "R1_MA_NO_SPREAD"


def test_rule1_momentum_without_offer() -> None:
    ce = make_classified(event_category="M&A", sentiment_score=0.9, magnitude_estimate="HIGH")
    s = GEN.generate(ce, SNAP)
    assert s.action is Action.BUY
    assert s.take_profit_pct == pytest.approx(0.025 * 3)


def test_rule1_threshold_is_strict() -> None:
    ce = make_classified(event_category="M&A", sentiment_score=0.5, magnitude_estimate="HIGH")
    assert GEN.generate(ce, SNAP).action is Action.HOLD


def test_rule2_capital_allocation_buy() -> None:
    ce = make_classified(event_category="CAPITAL_ALLOCATION", sentiment_score=0.8, magnitude_estimate="HIGH",
                         dividend_per_share=4.0)
    s = GEN.generate(ce, SNAP)
    assert s.action is Action.BUY and s.rule_id == "R2_CAPITAL_ALLOCATION_YIELD_GAP"
    assert "gap" in s.reasoning


def test_rule2_hold_without_yield_gap() -> None:
    ce = make_classified(event_category="CAPITAL_ALLOCATION", sentiment_score=0.8, dividend_per_share=1.0)
    assert GEN.generate(ce, SNAP).rule_id == "R2_NO_YIELD_GAP"  # 2.5% < 5%


def test_rule2_needs_sentiment_above_07() -> None:
    ce = make_classified(event_category="CAPITAL_ALLOCATION", sentiment_score=0.65, magnitude_estimate="HIGH")
    assert GEN.generate(ce, SNAP).action is Action.HOLD


def test_rule3_short_uses_implied_vol() -> None:
    snap = MarketSnapshot("PETR4", 40.0, atr=1.0, implied_vol=0.40)
    ce = make_classified(event_category="LITIGATION", sentiment_score=-0.8, magnitude_estimate="HIGH",
                         is_material=True)
    s = GEN.generate(ce, snap)
    assert s.action is Action.SELL
    assert s.stop_loss_pct == pytest.approx(round(2 * 0.40 / math.sqrt(252), 4))
    assert s.take_profit_pct == pytest.approx(s.stop_loss_pct * 2, abs=1e-4)
    assert s.stop_price > 40.0 > s.target_price


def test_rule3_falls_back_to_atr() -> None:
    ce = make_classified(event_category="REGULATORY", sentiment_score=-0.9, magnitude_estimate="HIGH",
                         is_material=True)
    s = GEN.generate(ce, SNAP)
    assert s.stop_loss_pct == pytest.approx(0.025 * 1.5)
    assert "ATR" in s.reasoning


def test_rule3_requires_material() -> None:
    ce = make_classified(event_category="LITIGATION", sentiment_score=-0.9, is_material=False)
    assert GEN.generate(ce, SNAP).action is Action.HOLD


def test_low_confidence_becomes_hold() -> None:
    gen = TradingSignalGenerator(SignalConfig(min_confidence=0.9))
    ce = make_classified(event_category="M&A", sentiment_score=0.6, magnitude_estimate="LOW")
    assert gen.generate(ce, SNAP).rule_id.endswith("LOW_CONFIDENCE")


def test_no_snapshot_uses_default_atr() -> None:
    ce = make_classified(event_category="M&A", sentiment_score=0.9, magnitude_estimate="HIGH")
    s = GEN.generate(ce, None)
    assert s.action is Action.BUY and s.reference_price is None and s.stop_price is None
