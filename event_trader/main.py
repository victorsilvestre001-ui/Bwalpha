"""Demo ponta a ponta: ingestão simulada -> IA -> sinal -> alerta -> paper trading.

Uso:
    python main.py                      # usa LLM real se houver ANTHROPIC_API_KEY/OPENAI_API_KEY, senão mock
    LLM_PROVIDER=mock python main.py    # força o classificador heurístico (offline)
    POLL_INTERVAL_S=2 python main.py --duration 10

Duas fontes rodam em paralelo: uma fila em memória (simula push/webhook) e um
arquivo JSON local (simula o feed CVM). Um dos eventos da fila é duplicado de
propósito para demonstrar a deduplicação/cache por hash_id.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

from src.ai.cache import ClassificationCache
from src.ai.classifier import EventClassifier
from src.ai.providers import build_provider
from src.config import IngestConfig, Settings
from src.execution.alerts import AlertChannel, AlertDispatcher, ConsoleChannel, DiscordChannel, TelegramChannel
from src.execution.broker import PaperBroker
from src.ingest.monitor import EventMonitor
from src.ingest.sources import JsonFileEventSource, QueueEventSource
from src.logging_setup import setup_logging
from src.models import B3_TZ, MarketSnapshot, RawEvent
from src.pipeline import EventPipeline
from src.strategy.market_data import StaticMarketDataProvider
from src.strategy.signals import TradingSignalGenerator

DATA_DIR = Path(__file__).parent / "data"

# Snapshots ilustrativos (em produção: feed de market data).
DEMO_MARKET = {
    "ELET3": MarketSnapshot("ELET3", last_price=41.00, atr=1.05, trailing_dividend_yield=0.04),
    "BBAS3": MarketSnapshot("BBAS3", last_price=27.40, atr=0.62, implied_vol=0.30, trailing_dividend_yield=0.065),
    "MGLU3": MarketSnapshot("MGLU3", last_price=9.10, atr=0.48, implied_vol=0.65),
    "PETR4": MarketSnapshot("PETR4", last_price=37.80, atr=0.85, implied_vol=0.32, trailing_dividend_yield=0.11),
    "SUZB3": MarketSnapshot("SUZB3", last_price=55.20, atr=1.30),
}

QUEUE_EVENTS = [
    RawEvent(
        ticker="PETR4",
        timestamp=datetime(2026, 10, 27, 18, 55, tzinfo=B3_TZ),
        headline="Fato Relevante — Auto de infração bilionário",
        body_text=(
            "A Companhia recebeu auto de infração da Receita Federal no montante de R$ 9,8 bilhões, "
            "incluindo multa, e avalia a possibilidade de perda como provável. [EXEMPLO SIMULADO]"
        ),
        source_id="demo-queue:0101",
    ),
    RawEvent(
        ticker="SUZB3",
        timestamp=datetime(2026, 10, 27, 19, 30, tzinfo=B3_TZ),
        headline="Aviso aos Acionistas — Juros sobre Capital Próprio",
        body_text=(
            "A Companhia informa a declaração de juros sobre capital próprio de R$ 0,35 por ação, "
            "em linha com a política de remuneração vigente. [EXEMPLO SIMULADO]"
        ),
        source_id="demo-queue:0102",
    ),
]


def build_channels(settings: Settings) -> list[AlertChannel]:
    channels: list[AlertChannel] = [ConsoleChannel()]
    a = settings.alerts
    if a.telegram_bot_token and a.telegram_chat_id:
        channels.append(TelegramChannel(a.telegram_bot_token, a.telegram_chat_id, a.timeout_s))
    if a.discord_webhook_url:
        channels.append(DiscordChannel(a.discord_webhook_url, a.timeout_s))
    return channels


async def run(duration_s: float) -> int:
    settings = Settings.from_env()
    setup_logging(settings.log_level, settings.log_json)
    llm = settings.llm

    provider = build_provider(
        llm.provider,
        anthropic_model=llm.anthropic_model,
        anthropic_effort=llm.anthropic_effort,
        anthropic_fallbacks=llm.anthropic_fallbacks,
        openai_model=llm.openai_model,
        max_tokens=llm.max_tokens,
        timeout_s=llm.timeout_s,
    )
    cache = ClassificationCache(ttl_s=llm.cache_ttl_s, path=llm.cache_path)
    classifier = EventClassifier(provider, cache, llm.timeout_s, llm.max_retries, llm.max_concurrency)
    broker = PaperBroker(settings.broker)
    pipeline = EventPipeline(
        classifier=classifier,
        signal_generator=TradingSignalGenerator(settings.signal),
        market_data=StaticMarketDataProvider(DEMO_MARKET),
        dispatcher=AlertDispatcher(build_channels(settings)),
        broker=broker,
    )

    queue_source = QueueEventSource(name="queue-demo")
    for ev in QUEUE_EVENTS:
        queue_source.publish_nowait(ev)
    queue_source.publish_nowait(QUEUE_EVENTS[0])  # duplicado proposital: deve ser descartado
    json_source = JsonFileEventSource(DATA_DIR / "sample_events.json", name="cvm-sim")

    ingest_cfg = IngestConfig(
        poll_interval_s=min(settings.ingest.poll_interval_s, max(duration_s / 2, 0.5)),
        fetch_timeout_s=settings.ingest.fetch_timeout_s,
    )
    monitor = EventMonitor([queue_source, json_source], pipeline.queue, ingest_cfg)

    try:
        await pipeline.run_with_monitor(monitor, duration_s=duration_s)
    finally:
        cache.save()
        await provider.aclose()

    print("\n=== Resumo ===")
    print(f"Provider: {provider.name}/{provider.model} | eventos processados: {len(pipeline.results)} "
          f"| cache hits/misses: {cache.hits}/{cache.misses}")
    rows = [
        {
            "ticker": r.event.ticker,
            "action": r.signal.action.value if r.signal else "-",
            "rule": r.signal.rule_id if r.signal else "-",
            "conf": r.signal.confidence if r.signal else None,
            "latency_ms": round(r.total_latency_ms, 1),
            "error": r.error,
        }
        for r in pipeline.results
    ]
    with pd.option_context("display.width", 160, "display.max_columns", 20):
        print(pd.DataFrame(rows).to_string(index=False))
        print("\nBlotter paper trading:")
        cols = ["ticker", "action", "status", "quantity", "fill_price", "stop_price", "take_profit_price",
                "commission", "cash_after", "message"]
        print(broker.orders[cols].to_string(index=False) if not broker.orders.empty else "(sem ordens)")
    print(f"Caixa: R$ {broker.cash:,.2f} | Posições: {broker.positions} | Equity: R$ {broker.equity():,.2f}")
    return 1 if any(r.error for r in pipeline.results) else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Demo do pipeline event-driven")
    parser.add_argument("--duration", type=float, default=3.0, help="segundos de polling antes de encerrar")
    args = parser.parse_args()
    try:
        return asyncio.run(run(args.duration))
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
