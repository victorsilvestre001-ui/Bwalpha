from __future__ import annotations

from datetime import datetime
from typing import Any

import pytest

from src.ai.providers import LLMProvider, LLMResponse
from src.models import B3_TZ, ClassifiedEvent, EventClassification, RawEvent


def make_event(ticker: str = "PETR4", headline: str = "Fato Relevante", body: str = "corpo", **kw: Any) -> RawEvent:
    return RawEvent(
        ticker=ticker,
        timestamp=kw.pop("timestamp", datetime(2026, 10, 27, 18, 30, tzinfo=B3_TZ)),
        headline=headline,
        body_text=body,
        source_id=kw.pop("source_id", "test:1"),
    )


def make_classified(event: RawEvent | None = None, **fields: Any) -> ClassifiedEvent:
    data = {
        "event_category": "OTHER",
        "sentiment_score": 0.0,
        "magnitude_estimate": "LOW",
        "is_material": False,
        "actionable_thesis": "tese",
        "offer_price": None,
        "dividend_per_share": None,
    }
    data.update(fields)
    return ClassifiedEvent(
        event=event or make_event(),
        classification=EventClassification.from_llm_json(data),
        provider="fake",
        model="fake",
        latency_ms=1.0,
    )


class FakeProvider(LLMProvider):
    """Provider programável: devolve respostas/exceções em sequência."""

    name = "fake"
    model = "fake-1"

    def __init__(self, responses: list[dict[str, Any] | Exception]) -> None:
        self.responses = list(responses)
        self.calls = 0

    async def complete_json(self, system: str, user: str, schema: dict[str, Any]) -> LLMResponse:
        self.calls += 1
        item = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if isinstance(item, Exception):
            raise item
        return LLMResponse(data=item, model=self.model)


VALID = {
    "event_category": "M&A",
    "sentiment_score": 0.8,
    "magnitude_estimate": "HIGH",
    "is_material": True,
    "actionable_thesis": "OPA com prêmio de 40%.",
    "offer_price": 50.0,
    "dividend_per_share": None,
}


@pytest.fixture
def valid_payload() -> dict[str, Any]:
    return dict(VALID)
