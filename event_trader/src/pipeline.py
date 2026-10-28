"""Orquestrador: ingestão -> classificação -> sinal -> alerta -> execução.

Arquitetura producer/consumer: o ``EventMonitor`` produz numa ``asyncio.Queue``
e N workers consomem em paralelo. Um evento lento no LLM não bloqueia os
demais, e a fila absorve picos (ex.: rajada de Fatos Relevantes às 18h).
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

from loguru import logger

from src.ai.classifier import EventClassifier
from src.execution.alerts import AlertDispatcher
from src.execution.broker import BrokerInterface, OrderResult
from src.ingest.monitor import EventMonitor
from src.models import ClassifiedEvent, RawEvent, TradingSignal
from src.strategy.market_data import MarketDataProvider
from src.strategy.signals import TradingSignalGenerator


@dataclass
class PipelineResult:
    event: RawEvent
    classified: ClassifiedEvent | None = None
    signal: TradingSignal | None = None
    order: OrderResult | None = None
    alerts: dict[str, bool] = field(default_factory=dict)
    error: str | None = None
    total_latency_ms: float = 0.0


class EventPipeline:
    def __init__(
        self,
        classifier: EventClassifier,
        signal_generator: TradingSignalGenerator,
        market_data: MarketDataProvider,
        dispatcher: AlertDispatcher,
        broker: BrokerInterface | None = None,
        workers: int = 4,
    ) -> None:
        self.classifier = classifier
        self.signal_generator = signal_generator
        self.market_data = market_data
        self.dispatcher = dispatcher
        self.broker = broker
        self.workers = workers
        self.queue: asyncio.Queue[RawEvent] = asyncio.Queue(maxsize=1_000)
        self.results: list[PipelineResult] = []
        self._worker_tasks: list[asyncio.Task[None]] = []

    async def process(self, event: RawEvent) -> PipelineResult:
        """Processa um evento ponta a ponta. Nunca levanta exceção: erros vão em ``result.error``."""
        started = time.perf_counter()
        result = PipelineResult(event=event)
        log = logger.bind(ticker=event.ticker, hash_id=event.hash_id[:12])
        try:
            # Classificação (LLM) e snapshot de mercado são independentes: em paralelo.
            classified, snapshot = await asyncio.gather(
                self.classifier.classify(event), self.market_data.get_snapshot(event.ticker)
            )
            result.classified = classified
            if snapshot is None:
                log.warning("Sem snapshot de mercado; stops usarão ATR padrão")
            signal = self.signal_generator.generate(classified, snapshot)
            result.signal = signal

            tasks: list[asyncio.Future[object]] = [asyncio.ensure_future(self.dispatcher.dispatch(classified, signal))]
            if self.broker is not None and signal.is_actionable:
                tasks.append(asyncio.ensure_future(self.broker.execute_order(signal)))
            outcomes = await asyncio.gather(*tasks, return_exceptions=True)
            alerts = outcomes[0]
            result.alerts = alerts if isinstance(alerts, dict) else {}
            if len(outcomes) > 1:
                order = outcomes[1]
                if isinstance(order, BaseException):
                    log.opt(exception=order).error("Falha na execução da ordem")
                    result.error = f"broker: {order}"
                else:
                    result.order = order  # type: ignore[assignment]
        except Exception as exc:
            log.opt(exception=exc).error("Falha no pipeline")
            result.error = f"{type(exc).__name__}: {exc}"
        result.total_latency_ms = (time.perf_counter() - started) * 1000
        log.info("Evento processado", latency_ms=round(result.total_latency_ms, 1),
                 action=result.signal.action.value if result.signal else None, error=result.error)
        self.results.append(result)
        return result

    async def _worker(self, idx: int) -> None:
        while True:
            event = await self.queue.get()
            try:
                await self.process(event)
            finally:
                self.queue.task_done()

    async def start(self) -> None:
        self._worker_tasks = [asyncio.create_task(self._worker(i), name=f"worker:{i}") for i in range(self.workers)]

    async def drain(self) -> None:
        """Aguarda a fila esvaziar."""
        await self.queue.join()

    async def stop(self) -> None:
        for task in self._worker_tasks:
            task.cancel()
        await asyncio.gather(*self._worker_tasks, return_exceptions=True)
        self._worker_tasks = []

    async def run_with_monitor(self, monitor: EventMonitor, duration_s: float | None = None) -> None:
        """Roda monitor + workers até ``duration_s`` (ou até cancelamento)."""
        if monitor.output is not self.queue:
            raise ValueError("monitor.output deve ser pipeline.queue")
        await self.start()
        await monitor.start()
        try:
            if duration_s is None:
                await asyncio.Event().wait()
            else:
                await asyncio.sleep(duration_s)
        finally:
            await monitor.stop()
            await self.drain()
            await self.stop()
