from __future__ import annotations

import asyncio
import json
from pathlib import Path

from src.ai.classifier import EventClassifier
from src.config import IngestConfig
from src.execution.alerts import AlertDispatcher, ConsoleChannel
from src.execution.broker import PaperBroker
from src.ingest.monitor import EventMonitor
from src.ingest.sources import EventSource, JsonFileEventSource, QueueEventSource
from src.models import Action, MarketSnapshot, RawEvent
from src.pipeline import EventPipeline
from src.strategy.market_data import StaticMarketDataProvider
from src.strategy.signals import TradingSignalGenerator
from tests.conftest import FakeProvider, make_event


async def test_monitor_dedupes_across_sources() -> None:
    out: asyncio.Queue[RawEvent] = asyncio.Queue()
    a, b = QueueEventSource("a"), QueueEventSource("b")
    a.publish_nowait(make_event(source_id="cvm:1"))
    b.publish_nowait(make_event(source_id="reuters:9"))
    monitor = EventMonitor([a, b], out, IngestConfig())
    assert await monitor.poll_once(a) == 1
    assert await monitor.poll_once(b) == 0
    assert out.qsize() == 1


async def test_json_source_emits_only_new_and_skips_invalid(tmp_path: Path) -> None:
    path = tmp_path / "ev.json"
    good = make_event().to_dict()
    path.write_text(json.dumps([good, {"ticker": "X"}]), encoding="utf-8")
    src = JsonFileEventSource(path)
    assert len(await src.fetch()) == 1
    assert await src.fetch() == []


async def test_monitor_survives_failing_source() -> None:
    class Broken(EventSource):
        name = "broken"
        calls = 0

        async def fetch(self) -> list[RawEvent]:
            Broken.calls += 1
            raise RuntimeError("cvm fora do ar")

    out: asyncio.Queue[RawEvent] = asyncio.Queue()
    good = QueueEventSource("good")
    good.publish_nowait(make_event())
    monitor = EventMonitor([Broken(), good], out, IngestConfig(poll_interval_s=0.01, max_backoff_s=0.02))
    await monitor.start()
    await asyncio.sleep(0.1)
    await monitor.stop()
    assert out.qsize() == 1 and Broken.calls >= 2


async def test_pipeline_end_to_end(valid_payload: dict) -> None:
    broker = PaperBroker()
    pipeline = EventPipeline(
        EventClassifier(FakeProvider([valid_payload])),
        TradingSignalGenerator(),
        StaticMarketDataProvider({"PETR4": MarketSnapshot("PETR4", 40.0, atr=1.0)}),
        AlertDispatcher([ConsoleChannel()]),
        broker,
    )
    result = await pipeline.process(make_event())
    assert result.error is None
    assert result.signal is not None and result.signal.action is Action.BUY
    assert result.order is not None and broker.positions["PETR4"] > 0
    assert result.alerts == {"console": True}


async def test_pipeline_reports_classifier_failure_without_raising() -> None:
    pipeline = EventPipeline(
        EventClassifier(FakeProvider([{"bad": 1}]), max_retries=0),
        TradingSignalGenerator(),
        StaticMarketDataProvider(),
        AlertDispatcher([]),
    )
    result = await pipeline.process(make_event())
    assert result.signal is None and result.error and "ClassificationError" in result.error
