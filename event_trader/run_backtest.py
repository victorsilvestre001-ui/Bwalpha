"""Backtest do pipeline event-driven sobre eventos históricos (CSV).

Uso:
    python run_backtest.py                       # gera dados simulados se faltarem e roda com o mock
    python run_backtest.py --provider anthropic  # usa o LLM real (custa tokens!)
    python run_backtest.py --events meus_eventos.csv --prices precos.csv --holding-days 3

Formato dos CSVs:
    events: ticker,timestamp,headline,body_text,source_id
    prices: date,ticker,open,high,low,close           (diário)
    meta:   source_id,implied_vol,trailing_dividend_yield (opcional, point-in-time)
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from loguru import logger

from src.ai.cache import ClassificationCache
from src.ai.classifier import EventClassifier
from src.ai.providers import build_provider
from src.backtest.engine import BacktestConfig, BacktestEngine, load_event_meta, load_events, load_prices
from src.backtest.metrics import compute_metrics, format_report
from src.backtest.sample_data import generate_sample_data
from src.config import Settings
from src.logging_setup import setup_logging
from src.strategy.signals import TradingSignalGenerator

DATA_DIR = Path(__file__).parent / "data"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--events", default=str(DATA_DIR / "historical_events.csv"))
    p.add_argument("--prices", default=str(DATA_DIR / "historical_prices.csv"))
    p.add_argument("--meta", default=str(DATA_DIR / "event_meta.csv"))
    p.add_argument("--provider", default="mock", help="mock | anthropic | openai | auto")
    p.add_argument("--holding-days", type=int, default=5)
    p.add_argument("--cost-bps", type=float, default=15.0, help="custo round-trip em bps")
    p.add_argument("--regenerate", action="store_true", help="regera os dados simulados")
    p.add_argument("--out", default=str(DATA_DIR / "backtest_trades.csv"))
    p.add_argument("--log-level", default="WARNING")
    return p.parse_args()


async def main() -> int:
    args = parse_args()
    setup_logging(args.log_level)
    settings = Settings.from_env()

    if args.regenerate or not (Path(args.events).exists() and Path(args.prices).exists()):
        events_path, meta_path, prices_path = generate_sample_data(DATA_DIR)
        args.events, args.meta, args.prices = str(events_path), str(meta_path), str(prices_path)
        print(f"Dados SIMULADOS gerados em {DATA_DIR}/")

    events = load_events(args.events)
    prices = load_prices(args.prices)
    meta = load_event_meta(args.meta) if Path(args.meta).exists() else {}
    if not events:
        logger.error("Nenhum evento válido em {}", args.events)
        return 1

    llm = settings.llm
    provider = build_provider(
        args.provider,
        anthropic_model=llm.anthropic_model,
        anthropic_effort=llm.anthropic_effort,
        anthropic_fallbacks=llm.anthropic_fallbacks,
        openai_model=llm.openai_model,
        max_tokens=llm.max_tokens,
        timeout_s=llm.timeout_s,
    )
    cache = ClassificationCache(ttl_s=10 * 365 * 86400, path=DATA_DIR / f".cache_{provider.name}.json")
    classifier = EventClassifier(provider, cache, timeout_s=llm.timeout_s, max_retries=llm.max_retries,
                                 max_concurrency=llm.max_concurrency)
    engine = BacktestEngine(
        classifier,
        TradingSignalGenerator(settings.signal),
        prices,
        meta,
        BacktestConfig(max_holding_days=args.holding_days, cost_bps_round_trip=args.cost_bps),
    )
    try:
        trades, signals = await engine.run(events)
    finally:
        cache.save()
        await provider.aclose()

    print(f"\nEventos: {len(events)} | provider: {provider.name}/{provider.model} | "
          f"cache hits/misses: {cache.hits}/{cache.misses}")
    print("Status dos sinais:", signals["status"].value_counts().to_dict())

    metrics = compute_metrics(trades)
    by_rule = None
    if not trades.empty:
        by_rule = trades.groupby("rule_id").agg(
            trades=("net_return", "size"),
            win_rate=("net_return", lambda r: (r > 0).mean()),
            avg_ret=("net_return", "mean"),
            total=("net_return", "sum"),
        ).round(4)
        trades.to_csv(args.out, index=False)
        signals.to_csv(Path(args.out).with_name("backtest_signals.csv"), index=False)
        print(f"Trades salvos em {args.out}")
    print(format_report(metrics, by_rule))
    if provider.name == "mock":
        print("Aviso: dados simulados + classificador heurístico. Resultados ilustram a mecânica, não o alpha.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
