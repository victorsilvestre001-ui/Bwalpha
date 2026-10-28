"""Cache de classificações por ``hash_id``.

* LRU em memória com TTL — lookup O(1), sem I/O no caminho crítico.
* Persistência opcional em JSON (snapshot), para não reclassificar após restart.
* *Single-flight*: se o mesmo evento chega duas vezes ao mesmo tempo (CVM e
  Reuters no mesmo segundo), só uma chamada ao LLM é feita; a outra aguarda.

Para múltiplas instâncias, implemente ``ClassificationCache`` sobre Redis
mantendo a mesma interface.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from loguru import logger

from src.models import EventClassification


class ClassificationCache:
    def __init__(self, ttl_s: float = 6 * 3600, max_items: int = 50_000, path: Path | None = None) -> None:
        self.ttl_s = ttl_s
        self.max_items = max_items
        self.path = path
        self._items: OrderedDict[str, tuple[float, EventClassification]] = OrderedDict()
        self._inflight: dict[str, asyncio.Future[EventClassification]] = {}
        self._lock = asyncio.Lock()
        self.hits = 0
        self.misses = 0
        if path is not None:
            self._load()

    def __len__(self) -> int:
        return len(self._items)

    def get(self, key: str) -> EventClassification | None:
        entry = self._items.get(key)
        if entry is None:
            return None
        stored_at, value = entry
        if time.time() - stored_at > self.ttl_s:
            self._items.pop(key, None)
            return None
        self._items.move_to_end(key)
        return value

    def set(self, key: str, value: EventClassification) -> None:
        self._items[key] = (time.time(), value)
        self._items.move_to_end(key)
        while len(self._items) > self.max_items:
            self._items.popitem(last=False)

    async def get_or_compute(
        self, key: str, compute: Callable[[], Awaitable[EventClassification]]
    ) -> tuple[EventClassification, bool]:
        """Retorna ``(valor, veio_do_cache)`` executando ``compute`` no máximo uma vez por chave."""
        async with self._lock:
            cached = self.get(key)
            if cached is not None:
                self.hits += 1
                return cached, True
            future = self._inflight.get(key)
            owner = future is None
            if owner:
                future = asyncio.get_running_loop().create_future()
                self._inflight[key] = future
                self.misses += 1
        assert future is not None
        if not owner:
            self.hits += 1
            return await asyncio.shield(future), True
        try:
            value = await compute()
        except BaseException as exc:
            future.set_exception(exc)
            # Evita "Future exception was never retrieved" quando ninguém aguarda.
            future.exception()
            raise
        else:
            self.set(key, value)
            future.set_result(value)
            return value, False
        finally:
            async with self._lock:
                self._inflight.pop(key, None)

    # --- persistência -------------------------------------------------------
    def _load(self) -> None:
        assert self.path is not None
        if not self.path.exists():
            return
        try:
            raw: dict[str, Any] = json.loads(self.path.read_text(encoding="utf-8"))
            now = time.time()
            for key, item in raw.items():
                if now - item["stored_at"] <= self.ttl_s:
                    self._items[key] = (item["stored_at"], EventClassification.from_llm_json(item["value"]))
            logger.info("Cache de classificação carregado", path=str(self.path), items=len(self._items))
        except Exception as exc:  # cache corrompido não pode derrubar o pipeline
            logger.opt(exception=exc).warning("Cache ignorado (arquivo inválido)", path=str(self.path))
            self._items.clear()

    def save(self) -> None:
        """Snapshot atômico (write + rename) do cache em disco."""
        if self.path is None:
            return
        payload = {k: {"stored_at": t, "value": v.to_dict()} for k, (t, v) in self._items.items()}
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            os.replace(tmp, self.path)
        except OSError as exc:
            logger.opt(exception=exc).error("Falha ao salvar cache", path=str(self.path))
