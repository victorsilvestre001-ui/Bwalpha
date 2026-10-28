"""EventClassifier: NLP via LLM com cache, timeout, retry e validação."""

from __future__ import annotations

import asyncio
import random
import time
from collections.abc import Iterable

from loguru import logger

from src.ai.cache import ClassificationCache
from src.ai.prompts import CLASSIFICATION_SCHEMA, SYSTEM_PROMPT, build_user_prompt
from src.ai.providers import LLMProvider, LLMProviderError
from src.models import ClassificationError, ClassifiedEvent, EventClassification, RawEvent


class EventClassifier:
    """Classifica comunicados em JSON estrito usando um ``LLMProvider``.

    Fluxo: cache (hash_id) -> LLM com timeout -> validação do contrato ->
    retry com backoff exponencial em falhas transitórias ou JSON inválido.

    Args:
        provider: implementação de ``LLMProvider``.
        cache: cache por ``hash_id``; um novo em memória é criado se ``None``.
        timeout_s: timeout total por tentativa (inclui rede + geração).
        max_retries: tentativas adicionais após a primeira.
        max_concurrency: limite de chamadas simultâneas ao provider (rate limit).
    """

    def __init__(
        self,
        provider: LLMProvider,
        cache: ClassificationCache | None = None,
        timeout_s: float = 20.0,
        max_retries: int = 3,
        max_concurrency: int = 8,
        base_backoff_s: float = 0.5,
    ) -> None:
        self.provider = provider
        self.cache = cache if cache is not None else ClassificationCache()
        self.timeout_s = timeout_s
        self.max_retries = max_retries
        self.base_backoff_s = base_backoff_s
        self._semaphore = asyncio.Semaphore(max_concurrency)

    async def classify(self, event: RawEvent) -> ClassifiedEvent:
        """Classifica um evento. Levanta ``LLMProviderError``/``ClassificationError`` se esgotar tentativas."""
        started = time.perf_counter()
        classification, from_cache = await self.cache.get_or_compute(
            event.hash_id, lambda: self._classify_with_retry(event)
        )
        latency_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "Evento classificado",
            ticker=event.ticker,
            hash_id=event.hash_id[:12],
            category=classification.event_category.value,
            sentiment=classification.sentiment_score,
            magnitude=classification.magnitude_estimate.value,
            material=classification.is_material,
            cache=from_cache,
            latency_ms=round(latency_ms, 1),
        )
        return ClassifiedEvent(
            event=event,
            classification=classification,
            provider=self.provider.name,
            model=self.provider.model,
            latency_ms=latency_ms,
            from_cache=from_cache,
        )

    async def classify_many(self, events: Iterable[RawEvent]) -> list[ClassifiedEvent | Exception]:
        """Classifica em paralelo; falhas individuais voltam como exceção na posição do evento."""
        return await asyncio.gather(*(self.classify(e) for e in events), return_exceptions=True)

    async def _classify_with_retry(self, event: RawEvent) -> EventClassification:
        user_prompt = build_user_prompt(event)
        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                async with self._semaphore:
                    response = await asyncio.wait_for(
                        self.provider.complete_json(SYSTEM_PROMPT, user_prompt, CLASSIFICATION_SCHEMA),
                        timeout=self.timeout_s,
                    )
                return EventClassification.from_llm_json(response.data)
            except TimeoutError:
                last_error = LLMProviderError(f"timeout após {self.timeout_s}s", retryable=True)
            except LLMProviderError as exc:
                last_error = exc
                if not exc.retryable:
                    break
            except ClassificationError as exc:
                # Schema-constrained decoding torna isto raro; uma nova amostra costuma resolver.
                last_error = exc

            if attempt < self.max_retries:
                delay = self.base_backoff_s * (2**attempt) * (1 + random.random() * 0.25)
                logger.warning(
                    "Classificação falhou; nova tentativa",
                    ticker=event.ticker,
                    attempt=attempt + 1,
                    retry_in_s=round(delay, 2),
                    error=str(last_error),
                )
                await asyncio.sleep(delay)

        logger.error("Classificação abandonada", ticker=event.ticker, hash_id=event.hash_id[:12], error=str(last_error))
        assert last_error is not None
        raise last_error
