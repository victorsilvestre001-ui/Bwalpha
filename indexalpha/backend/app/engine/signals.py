"""Regras de sinal (BUY/SELL/HOLD), filtro de volatilidade e parâmetros de risco."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from enum import Enum
from typing import Any

ENTRY_THRESHOLD: float = 0.5
VOL_THRESHOLD: float = 25.0
"""Volatilidade implícita (em %) acima da qual a confiança é cortada pela metade."""
VOL_PENALTY: float = 0.5
SL_ATR_MULT: float = 1.5
TP_ATR_MULT: float = 3.0


class Action(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


@dataclass(frozen=True)
class Signal:
    action: Action
    confidence: float
    """0 a 1."""
    stop_loss_pct: float
    """Distância do stop em % do preço de entrada (0.45 = 0,45%)."""
    take_profit_pct: float
    volatility_filter_applied: bool

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["action"] = self.action.value
        return data


def apply_volatility_filter(confidence: float, implied_vol: float) -> tuple[float, bool]:
    """Corta a confiança em 50% quando a volatilidade implícita passa de 25%."""
    if implied_vol > VOL_THRESHOLD:
        return confidence * VOL_PENALTY, True
    return confidence, False


def generate_signal(
    index_score: float,
    foreign_flow: float,
    vix_level: float,
    atr_pct: float = 0.3,
) -> Signal:
    """Gera o sinal a partir do Index_Score, fluxo estrangeiro e volatilidade.

    - BUY:  index_score > 0.5  e foreign_flow > 0
    - SELL: index_score < -0.5 e foreign_flow < 0
    - HOLD: caso contrário

    `vix_level` e `atr_pct` são em pontos percentuais (25.0 = 25%).
    """
    if index_score > ENTRY_THRESHOLD and foreign_flow > 0:
        action = Action.BUY
    elif index_score < -ENTRY_THRESHOLD and foreign_flow < 0:
        action = Action.SELL
    else:
        action = Action.HOLD

    strength = abs(index_score)
    if action is Action.HOLD:
        # Score perto de zero = HOLD convicto; score forte barrado pelo fluxo = HOLD fraco.
        confidence = max(0.0, 1.0 - strength)
    else:
        # 0.5 no limiar de entrada, sobe linearmente até 1.0 com score = ±1.
        excess = (strength - ENTRY_THRESHOLD) / (1.0 - ENTRY_THRESHOLD)
        confidence = 0.5 + 0.5 * min(1.0, max(0.0, excess))

    confidence, filtered = apply_volatility_filter(confidence, vix_level)

    return Signal(
        action=action,
        confidence=round(confidence, 4),
        stop_loss_pct=round(SL_ATR_MULT * atr_pct, 4),
        take_profit_pct=round(TP_ATR_MULT * atr_pct, 4),
        volatility_filter_applied=filtered,
    )
