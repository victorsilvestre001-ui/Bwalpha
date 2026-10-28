from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd
import pytest

from src.ai.classifier import EventClassifier
from src.backtest.engine import BacktestConfig, BacktestEngine
from src.backtest.metrics import compute_metrics
from src.models import B3_TZ, Action, TradingSignal
from src.strategy.market_data import compute_atr
from src.strategy.signals import TradingSignalGenerator
from tests.conftest import FakeProvider, make_event


def _bars(rows: list[tuple[float, float, float, float]]) -> pd.DataFrame:
    idx = pd.bdate_range("2026-01-05", periods=len(rows))
    return pd.DataFrame(rows, index=idx, columns=["open", "high", "low", "close"])


def _engine(cfg: BacktestConfig | None = None) -> BacktestEngine:
    return BacktestEngine(EventClassifier(FakeProvider([{}])), TradingSignalGenerator(), {}, config=cfg)


def _sig(action: Action, sl: float, tp: float, ref: float | None = None) -> TradingSignal:
    return TradingSignal("X", action, 0.9, sl, tp, "", "R", "h", reference_price=ref)


def test_take_profit_hit() -> None:
    bars = _bars([(100, 104, 99, 103), (103, 112, 102, 111)])
    t = _engine(BacktestConfig(cost_bps_round_trip=0)).simulate_trade(_sig(Action.BUY, 0.05, 0.10), bars, 0)
    assert t["exit_reason"] == "TARGET" and t["net_return"] == pytest.approx(0.10)


def test_stop_wins_when_both_hit_same_bar() -> None:
    bars = _bars([(100, 115, 90, 100)])
    t = _engine(BacktestConfig(cost_bps_round_trip=0)).simulate_trade(_sig(Action.BUY, 0.05, 0.10), bars, 0)
    assert t["exit_reason"] == "STOP" and t["net_return"] == pytest.approx(-0.05)


def test_short_time_exit_with_costs() -> None:
    bars = _bars([(100, 101, 99, 100), (100, 101, 97, 98)])
    t = _engine(BacktestConfig(max_holding_days=2, cost_bps_round_trip=10)).simulate_trade(
        _sig(Action.SELL, 0.05, 0.10), bars, 0
    )
    assert t["exit_reason"] == "TIME" and t["net_return"] == pytest.approx(0.02 - 0.001)


def test_gap_through_target_is_skipped() -> None:
    bars = _bars([(120, 125, 118, 121)])
    t = _engine().simulate_trade(_sig(Action.BUY, 0.05, 0.10, ref=100.0), bars, 0)
    assert t["exit_reason"] == "GAP_THROUGH_TARGET" and "net_return" not in t


def test_entry_after_close_goes_to_next_session_and_no_lookahead() -> None:
    bars = _bars([(10, 11, 9, 10)] * 20)
    eng = _engine()
    ev_after = make_event(timestamp=datetime(2026, 1, 6, 19, 0, tzinfo=B3_TZ))
    ev_before = make_event(timestamp=datetime(2026, 1, 6, 8, 0, tzinfo=B3_TZ))
    assert bars.index[eng._entry_index(bars, ev_after)] == pd.Timestamp("2026-01-07")
    assert bars.index[eng._entry_index(bars, ev_before)] == pd.Timestamp("2026-01-06")
    snap = eng.snapshot_before(ev_after, bars, 2)
    assert snap is not None and snap.last_price == 10


def test_atr_constant_range() -> None:
    bars = _bars([(10, 11, 9, 10)] * 30)
    assert compute_atr(bars).iloc[-1] == pytest.approx(2.0)


def test_metrics() -> None:
    trades = pd.DataFrame({
        "net_return": [0.10, -0.05, 0.05, -0.05],
        "exit_date": pd.bdate_range("2026-01-05", periods=4),
        "holding_days": [1, 2, 3, 4],
        "exit_reason": ["TARGET", "STOP", "TIME", "STOP"],
    })
    m = compute_metrics(trades)
    assert m["win_rate"] == 0.5
    assert m["profit_factor"] == pytest.approx(1.5)
    assert np.isfinite(m["sharpe_ratio"]) and m["sharpe_ratio"] > 0
    assert compute_metrics(trades.iloc[0:0]) == {"n_trades": 0}
