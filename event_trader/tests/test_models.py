from __future__ import annotations

import pytest

from src.models import ClassificationError, EventCategory, EventClassification
from tests.conftest import make_event


def test_hash_ignores_whitespace_case_and_timestamp() -> None:
    a = make_event(headline="Fato  Relevante", body="Texto X", source_id="a")
    b = make_event(headline="fato relevante", body="texto   x", source_id="b", timestamp="2026-01-01T10:00:00")
    assert a.hash_id == b.hash_id


def test_hash_differs_by_ticker() -> None:
    assert make_event(ticker="PETR4").hash_id != make_event(ticker="VALE3").hash_id


def test_naive_timestamp_assumed_b3() -> None:
    e = make_event(timestamp="2026-10-27T18:00:00")
    assert e.timestamp.utcoffset() is not None


def test_empty_event_rejected() -> None:
    with pytest.raises(ValueError):
        make_event(headline=" ", body="")


def test_classification_clamps_and_normalizes(valid_payload: dict) -> None:
    valid_payload.update(sentiment_score=3.0, event_category="ma", offer_price="abc")
    c = EventClassification.from_llm_json(valid_payload)
    assert c.sentiment_score == 1.0
    assert c.event_category is EventCategory.MA
    assert c.offer_price is None


@pytest.mark.parametrize(
    "field,value",
    [
        ("event_category", "SPORTS"),
        ("magnitude_estimate", "HUGE"),
        ("sentiment_score", "0.5"),
        ("sentiment_score", True),
        ("is_material", "true"),
        ("actionable_thesis", ""),
    ],
)
def test_classification_rejects_contract_violations(valid_payload: dict, field: str, value: object) -> None:
    valid_payload[field] = value
    with pytest.raises(ClassificationError):
        EventClassification.from_llm_json(valid_payload)
