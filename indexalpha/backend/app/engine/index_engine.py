"""Cálculo do Index_Score: Z-Score ponderado dos Pilares do Ibovespa."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from typing import Any, Mapping, Sequence

from .weights import SECTORS, WEIGHTS


@dataclass(frozen=True)
class AssetQuote:
    """Dado de mercado de um ativo num instante."""

    ticker: str
    price: float
    sma20: float
    std20: float
    change_pct: float = 0.0


@dataclass(frozen=True)
class PillarScore:
    ticker: str
    sector: str
    weight: float
    z_score: float
    contribution: float
    price: float
    change_pct: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class IndexReading:
    index_score: float
    """Score final em (-1, +1): tanh(raw_score)."""
    raw_score: float
    """Σ (peso_i * z_i), com pesos renormalizados pelos ativos presentes."""
    coverage: float
    """Fração do peso total com dados válidos (1.0 = todos os 20 ativos)."""
    pillars: list[PillarScore] = field(default_factory=list)
    top_drivers: list[PillarScore] = field(default_factory=list)


class IndexEngine:
    """Transforma cotações dos Pilares em um único Index_Score.

    z_i = (Preço_Atual - Média20) / Desvio20
    raw = Σ (w_i * z_i)
    Index_Score = tanh(raw)  -> limita o score ao intervalo (-1, +1)
    """

    Z_CLIP: float = 4.0
    TOP_N: int = 3

    def __init__(self, weights: Mapping[str, float] = WEIGHTS) -> None:
        total = sum(weights.values())
        if total <= 0:
            raise ValueError("A soma dos pesos deve ser positiva")
        self.weights: dict[str, float] = {t: w / total for t, w in weights.items()}

    @classmethod
    def z_score(cls, price: float, mean: float, std: float) -> float:
        if std <= 0 or not all(math.isfinite(v) for v in (price, mean, std)):
            return 0.0
        z = (price - mean) / std
        # Limita outliers (gaps, leilões) para um único ativo não dominar o índice.
        return max(-cls.Z_CLIP, min(cls.Z_CLIP, z))

    def compute(self, quotes: Sequence[AssetQuote]) -> IndexReading:
        by_ticker = {q.ticker: q for q in quotes}
        pillars: list[PillarScore] = []
        coverage = 0.0

        for ticker, weight in self.weights.items():
            quote = by_ticker.get(ticker)
            if quote is None:
                continue
            z = self.z_score(quote.price, quote.sma20, quote.std20)
            pillars.append(
                PillarScore(
                    ticker=ticker,
                    sector=SECTORS.get(ticker, "Outros"),
                    weight=weight,
                    z_score=z,
                    contribution=weight * z,
                    price=quote.price,
                    change_pct=quote.change_pct,
                )
            )
            coverage += weight

        # Se faltar algum ativo, renormaliza para não "diluir" o score em direção a zero.
        raw = sum(p.contribution for p in pillars) / coverage if coverage > 0 else 0.0
        top = sorted(pillars, key=lambda p: abs(p.contribution), reverse=True)[: self.TOP_N]

        return IndexReading(
            index_score=math.tanh(raw),
            raw_score=raw,
            coverage=coverage,
            pillars=pillars,
            top_drivers=top,
        )
