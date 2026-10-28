"""Fontes de eventos plugáveis.

Toda fonte implementa ``EventSource.fetch()`` e devolve apenas eventos *novos*
desde a última chamada. O ``EventMonitor`` não conhece detalhes de transporte,
então trocar a simulação pela API real da CVM/B3/Reuters é só registrar outra
fonte.
"""

from __future__ import annotations

import asyncio
import json
from abc import ABC, abstractmethod
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Any

import requests
from loguru import logger

from src.models import RawEvent


class EventSourceError(RuntimeError):
    """Falha recuperável ao consultar uma fonte (rede, parse, HTTP 5xx...)."""


class EventSource(ABC):
    """Contrato de uma fonte de comunicados."""

    name: str = "source"

    @abstractmethod
    async def fetch(self) -> list[RawEvent]:
        """Retorna os eventos novos desde a última chamada."""

    async def close(self) -> None:  # noqa: B027 - hook opcional
        """Libera recursos (sessões HTTP, arquivos)."""


class QueueEventSource(EventSource):
    """Fonte em memória alimentada por ``publish()`` — ideal para demo e testes.

    Também serve de ponte para push-based feeds (websocket, webhook): o handler
    do webhook chama ``publish`` e o monitor drena no próximo ciclo.
    """

    def __init__(self, name: str = "queue", maxsize: int = 10_000) -> None:
        self.name = name
        self._queue: asyncio.Queue[RawEvent] = asyncio.Queue(maxsize=maxsize)

    async def publish(self, event: RawEvent) -> None:
        await self._queue.put(event)

    def publish_nowait(self, event: RawEvent) -> None:
        self._queue.put_nowait(event)

    async def fetch(self) -> list[RawEvent]:
        events: list[RawEvent] = []
        while not self._queue.empty():
            events.append(self._queue.get_nowait())
        return events


class JsonFileEventSource(EventSource):
    """Lê um arquivo JSON (lista de eventos) e emite os itens ainda não vistos.

    O arquivo pode ser reescrito por outro processo (ex.: um scraper); só é
    relido quando o ``mtime`` muda. Itens inválidos são logados e ignorados
    para que um registro corrompido não derrube o feed inteiro.
    """

    def __init__(self, path: str | Path, name: str | None = None) -> None:
        self.path = Path(path)
        self.name = name or f"json:{self.path.name}"
        self._last_mtime: float | None = None
        self._emitted: set[str] = set()

    async def fetch(self) -> list[RawEvent]:
        return await asyncio.to_thread(self._fetch_sync)

    def _fetch_sync(self) -> list[RawEvent]:
        try:
            mtime = self.path.stat().st_mtime
        except FileNotFoundError:
            logger.warning("Arquivo de eventos não encontrado", path=str(self.path))
            return []
        if mtime == self._last_mtime:
            return []
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise EventSourceError(f"falha ao ler {self.path}: {exc}") from exc
        self._last_mtime = mtime

        items: Iterable[Any] = payload if isinstance(payload, list) else payload.get("events", [])
        new_events: list[RawEvent] = []
        for idx, item in enumerate(items):
            try:
                event = RawEvent.from_dict(item)
            except (ValueError, TypeError, AttributeError) as exc:
                logger.warning("Evento inválido ignorado", source=self.name, index=idx, error=str(exc))
                continue
            key = f"{event.source_id}:{event.hash_id}"
            if key in self._emitted:
                continue
            self._emitted.add(key)
            new_events.append(event)
        return new_events


Parser = Callable[[Any], list[RawEvent]]


class HttpJsonEventSource(EventSource):
    """Fonte HTTP genérica (polling em endpoint JSON).

    ``requests`` é síncrono; executamos em thread (``asyncio.to_thread``) para
    não bloquear o event loop. Para volume muito alto, troque por um cliente
    HTTP assíncrono nativo sem alterar a interface.

    Args:
        url: endpoint a consultar.
        parser: função que converte o JSON da resposta em ``RawEvent``.
        headers: cabeçalhos (ex.: token da Reuters/Refinitiv).
        params_factory: gera query params a cada chamada (ex.: ``since=<cursor>``).
    """

    def __init__(
        self,
        url: str,
        parser: Parser,
        name: str = "http",
        headers: dict[str, str] | None = None,
        params_factory: Callable[[], dict[str, Any]] | None = None,
        timeout_s: float = 10.0,
    ) -> None:
        self.url = url
        self.name = name
        self._parser = parser
        self._params_factory = params_factory or (lambda: {})
        self._timeout_s = timeout_s
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": "event-trader/1.0", **(headers or {})})
        self._seen: set[str] = set()

    async def fetch(self) -> list[RawEvent]:
        payload = await asyncio.to_thread(self._get)
        try:
            events = self._parser(payload)
        except Exception as exc:  # parser é código do integrador: isolamos a falha
            raise EventSourceError(f"{self.name}: falha no parser: {exc}") from exc
        fresh = [e for e in events if e.hash_id not in self._seen]
        self._seen.update(e.hash_id for e in fresh)
        return fresh

    def _get(self) -> Any:
        try:
            resp = self._session.get(self.url, params=self._params_factory(), timeout=self._timeout_s)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            raise EventSourceError(f"{self.name}: erro HTTP: {exc}") from exc
        except ValueError as exc:
            raise EventSourceError(f"{self.name}: resposta não é JSON: {exc}") from exc

    async def close(self) -> None:
        await asyncio.to_thread(self._session.close)


def parse_cvm_ipe(payload: Any) -> list[RawEvent]:
    """Parser de referência para um feed de documentos IPE (Fatos Relevantes).

    A CVM não oferece um endpoint JSON de tempo real estável; na prática usa-se
    o RAD/ENET (consulta por período) ou um vendor. Este parser assume o formato
    normalizado abaixo — ajuste o mapeamento ao seu provedor:

    ``[{"codigo_negociacao": "PETR4", "data_entrega": "...", "assunto": "...",
       "texto": "...", "protocolo": "..."}]``
    """
    events: list[RawEvent] = []
    for row in payload or []:
        events.append(
            RawEvent(
                ticker=row["codigo_negociacao"],
                timestamp=row["data_entrega"],
                headline=row.get("assunto", ""),
                body_text=row.get("texto", ""),
                source_id=f"cvm:{row['protocolo']}",
            )
        )
    return events


def build_cvm_source(url: str, api_token: str | None = None, timeout_s: float = 10.0) -> HttpJsonEventSource:
    """Fábrica da fonte CVM/B3 real. Basta apontar ``url`` para o seu endpoint."""
    headers = {"Authorization": f"Bearer {api_token}"} if api_token else None
    return HttpJsonEventSource(url, parse_cvm_ipe, name="cvm", headers=headers, timeout_s=timeout_s)
