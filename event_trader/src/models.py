"""Modelos de domínio compartilhados por todas as camadas.

Os objetos são imutáveis (``frozen``) para que possam trafegar entre tasks
asyncio sem risco de mutação concorrente.
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from zoneinfo import ZoneInfo

B3_TZ = ZoneInfo("America/Sao_Paulo")


class EventCategory(str, Enum):
    MA = "M&A"
    GOVERNANCE = "GOVERNANCE"
    REGULATORY = "REGULATORY"
    CAPITAL_ALLOCATION = "CAPITAL_ALLOCATION"
    LITIGATION = "LITIGATION"
    OTHER = "OTHER"


class Magnitude(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class Action(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


# Variações que alguns modelos devolvem apesar do enum no schema.
_CATEGORY_ALIASES = {"MA": "M&A", "M_AND_A": "M&A", "M&AMP;A": "M&A", "MERGERS_ACQUISITIONS": "M&A"}


class ClassificationError(ValueError):
    """A resposta do LLM não respeita o contrato do schema."""


def _parse_timestamp(value: datetime | str) -> datetime:
    """Normaliza timestamps: strings ISO-8601 e datetimes naive viram horário da B3."""
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=B3_TZ)
    return value


@dataclass(frozen=True)
class RawEvent:
    """Comunicado bruto vindo de qualquer fonte (CVM, B3, Reuters, fila local)."""

    ticker: str
    timestamp: datetime
    headline: str
    body_text: str
    source_id: str

    def __post_init__(self) -> None:
        if not self.ticker or not self.ticker.strip():
            raise ValueError("ticker vazio")
        if not self.headline.strip() and not self.body_text.strip():
            raise ValueError("evento sem headline e sem corpo")
        object.__setattr__(self, "ticker", self.ticker.strip().upper())
        object.__setattr__(self, "timestamp", _parse_timestamp(self.timestamp))

    @property
    def hash_id(self) -> str:
        """Hash de conteúdo estável usado como chave de cache/deduplicação.

        Não inclui o timestamp: o mesmo Fato Relevante republicado por outra
        fonte (ou reprocessado) gera o mesmo hash e não é reclassificado.
        """
        normalized = "\x1f".join(
            [
                self.ticker,
                " ".join(self.headline.lower().split()),
                " ".join(self.body_text.lower().split()),
            ]
        )
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> RawEvent:
        missing = {"ticker", "timestamp", "headline", "body_text", "source_id"} - data.keys()
        if missing:
            raise ValueError(f"campos obrigatórios ausentes: {sorted(missing)}")
        return cls(
            ticker=str(data["ticker"]),
            timestamp=data["timestamp"],
            headline=str(data["headline"]),
            body_text=str(data["body_text"]),
            source_id=str(data["source_id"]),
        )

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["timestamp"] = self.timestamp.isoformat()
        d["hash_id"] = self.hash_id
        return d


@dataclass(frozen=True)
class EventClassification:
    """Saída estruturada do EventClassifier (contrato do system prompt)."""

    event_category: EventCategory
    sentiment_score: float
    magnitude_estimate: Magnitude
    is_material: bool
    actionable_thesis: str
    offer_price: float | None = None
    dividend_per_share: float | None = None

    @classmethod
    def from_llm_json(cls, data: dict[str, Any]) -> EventClassification:
        """Valida e normaliza o JSON do LLM. Levanta ``ClassificationError``."""
        if not isinstance(data, dict):
            raise ClassificationError(f"esperado objeto JSON, recebido {type(data).__name__}")
        try:
            raw_category = str(data["event_category"]).strip().upper()
            category = EventCategory(_CATEGORY_ALIASES.get(raw_category, raw_category))
        except (KeyError, ValueError) as exc:
            raise ClassificationError(f"event_category inválido: {data.get('event_category')!r}") from exc
        try:
            magnitude = Magnitude(str(data["magnitude_estimate"]).strip().upper())
        except (KeyError, ValueError) as exc:
            raise ClassificationError(
                f"magnitude_estimate inválido: {data.get('magnitude_estimate')!r}"
            ) from exc

        score = data.get("sentiment_score")
        if isinstance(score, bool) or not isinstance(score, (int, float)) or math.isnan(score):
            raise ClassificationError(f"sentiment_score inválido: {score!r}")
        score = max(-1.0, min(1.0, float(score)))

        is_material = data.get("is_material")
        if not isinstance(is_material, bool):
            raise ClassificationError(f"is_material deve ser boolean: {is_material!r}")

        thesis = str(data.get("actionable_thesis") or "").strip()
        if not thesis:
            raise ClassificationError("actionable_thesis vazio")

        return cls(
            event_category=category,
            sentiment_score=score,
            magnitude_estimate=magnitude,
            is_material=is_material,
            actionable_thesis=thesis[:500],
            offer_price=_positive_or_none(data.get("offer_price")),
            dividend_per_share=_positive_or_none(data.get("dividend_per_share")),
        )

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["event_category"] = self.event_category.value
        d["magnitude_estimate"] = self.magnitude_estimate.value
        return d


def _positive_or_none(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if f > 0 and math.isfinite(f) else None


@dataclass(frozen=True)
class ClassifiedEvent:
    """Evento + classificação + metadados de proveniência."""

    event: RawEvent
    classification: EventClassification
    provider: str
    model: str
    latency_ms: float
    from_cache: bool = False


@dataclass(frozen=True)
class MarketSnapshot:
    """Estado de mercado necessário para dimensionar stops/alvos.

    Attributes:
        last_price: último preço (ou fechamento anterior no backtest).
        atr: Average True Range (14) em unidades de preço.
        implied_vol: volatilidade implícita anualizada (0.35 = 35%), se houver.
        trailing_dividend_yield: DY médio dos últimos 12m (0.06 = 6%), se houver.
    """

    ticker: str
    last_price: float
    atr: float | None = None
    implied_vol: float | None = None
    trailing_dividend_yield: float | None = None

    @property
    def atr_pct(self) -> float | None:
        if self.atr is None or self.last_price <= 0:
            return None
        return self.atr / self.last_price


@dataclass(frozen=True)
class TradingSignal:
    """Sinal executável emitido pelo TradingSignalGenerator."""

    ticker: str
    action: Action
    confidence: float
    stop_loss_pct: float
    take_profit_pct: float
    reasoning: str
    rule_id: str
    event_hash: str
    reference_price: float | None = None
    generated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def is_actionable(self) -> bool:
        return self.action is not Action.HOLD

    @property
    def stop_price(self) -> float | None:
        if self.reference_price is None or not self.is_actionable:
            return None
        sign = -1 if self.action is Action.BUY else 1
        return round(self.reference_price * (1 + sign * self.stop_loss_pct), 2)

    @property
    def target_price(self) -> float | None:
        if self.reference_price is None or not self.is_actionable:
            return None
        sign = 1 if self.action is Action.BUY else -1
        return round(self.reference_price * (1 + sign * self.take_profit_pct), 2)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["action"] = self.action.value
        d["generated_at"] = self.generated_at.isoformat()
        d["stop_price"] = self.stop_price
        d["target_price"] = self.target_price
        return d
