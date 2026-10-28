"""EventMonitor: polling assíncrono e concorrente de várias fontes."""

from __future__ import annotations

import asyncio
import random
from collections import OrderedDict

from loguru import logger

from src.config import IngestConfig
from src.ingest.sources import EventSource
from src.models import RawEvent


class EventMonitor:
    """Faz polling em N fontes em paralelo e publica eventos novos numa fila.

    * Cada fonte roda num loop próprio: uma fonte lenta/quebrada não atrasa as
      outras (isolamento de falhas).
    * Erros geram backoff exponencial com jitter por fonte, limitado a
      ``max_backoff_s``; o intervalo volta ao normal após um sucesso.
    * Deduplicação por ``hash_id`` numa janela LRU evita que o mesmo comunicado
      vindo de duas fontes (CVM + Reuters) seja processado duas vezes.
    """

    def __init__(
        self,
        sources: list[EventSource],
        output: asyncio.Queue[RawEvent],
        config: IngestConfig | None = None,
    ) -> None:
        if not sources:
            raise ValueError("EventMonitor precisa de ao menos uma fonte")
        self.sources = sources
        self.output = output
        self.config = config or IngestConfig()
        self._seen: OrderedDict[str, None] = OrderedDict()
        self._stop = asyncio.Event()
        self._tasks: list[asyncio.Task[None]] = []

    def _is_new(self, event: RawEvent) -> bool:
        key = event.hash_id
        if key in self._seen:
            self._seen.move_to_end(key)
            return False
        self._seen[key] = None
        if len(self._seen) > self.config.dedupe_window:
            self._seen.popitem(last=False)
        return True

    async def poll_once(self, source: EventSource) -> int:
        """Executa um ciclo de fetch numa fonte; retorna quantos eventos publicou."""
        events = await asyncio.wait_for(source.fetch(), timeout=self.config.fetch_timeout_s)
        published = 0
        for event in events:
            if not self._is_new(event):
                logger.debug("Evento duplicado descartado", source=source.name, hash_id=event.hash_id[:12])
                continue
            await self.output.put(event)
            published += 1
            logger.info(
                "Evento ingerido",
                source=source.name,
                ticker=event.ticker,
                hash_id=event.hash_id[:12],
                headline=event.headline[:80],
            )
        return published

    async def _run_source(self, source: EventSource) -> None:
        interval = self.config.poll_interval_s
        delay = interval
        while not self._stop.is_set():
            try:
                await self.poll_once(source)
                delay = interval
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # qualquer falha da fonte é isolada aqui
                delay = min(max(delay, interval) * 2, self.config.max_backoff_s)
                logger.opt(exception=exc).warning(
                    "Falha no polling; aplicando backoff", source=source.name, retry_in_s=round(delay, 1)
                )
            jitter = random.uniform(0, 0.1 * delay)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=delay + jitter)
            except TimeoutError:
                pass

    async def start(self) -> None:
        """Inicia um loop de polling por fonte (não bloqueia)."""
        if self._tasks:
            return
        self._stop.clear()
        self._tasks = [
            asyncio.create_task(self._run_source(s), name=f"poll:{s.name}") for s in self.sources
        ]
        logger.info(
            "EventMonitor iniciado",
            sources=[s.name for s in self.sources],
            interval_s=self.config.poll_interval_s,
        )

    async def stop(self) -> None:
        """Encerra os loops e fecha as fontes."""
        self._stop.set()
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks = []
        await asyncio.gather(*(s.close() for s in self.sources), return_exceptions=True)
        logger.info("EventMonitor parado")
