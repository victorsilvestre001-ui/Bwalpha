"""TradingSignalGenerator: regras de negócio sobre o evento classificado.

As regras são funções puras (sem I/O): mesmo input -> mesmo sinal. Isso torna
o gerador idêntico em produção e no backtest, eliminando divergência
live/backtest por construção.
"""

from __future__ import annotations

import math
from collections.abc import Callable

from loguru import logger

from src.config import SignalConfig
from src.models import (
    Action,
    ClassifiedEvent,
    EventCategory,
    Magnitude,
    MarketSnapshot,
    TradingSignal,
)

_MAGNITUDE_WEIGHT = {Magnitude.LOW: 0.6, Magnitude.MEDIUM: 0.8, Magnitude.HIGH: 1.0}

Rule = Callable[[ClassifiedEvent, MarketSnapshot | None], TradingSignal | None]


class TradingSignalGenerator:
    """Avalia regras em ordem de prioridade; a primeira que dispara vence.

    Ordem: Regra 3 (risco/short) -> Regra 1 (M&A) -> Regra 2 (capital
    allocation). As regras são mutuamente exclusivas pelo sinal do sentimento,
    mas a ordem explícita deixa o comportamento auditável se novas regras forem
    adicionadas.
    """

    def __init__(self, config: SignalConfig | None = None) -> None:
        self.config = config or SignalConfig()
        self._rules: list[tuple[str, Rule]] = [
            ("R3_MATERIAL_NEGATIVE_SHORT", self._rule_material_negative),
            ("R1_MA_POSITIVE", self._rule_ma_positive),
            ("R2_CAPITAL_ALLOCATION_YIELD_GAP", self._rule_capital_allocation),
        ]

    # --- API pública --------------------------------------------------------
    def generate(self, classified: ClassifiedEvent, snapshot: MarketSnapshot | None = None) -> TradingSignal:
        """Gera um sinal; devolve HOLD quando nenhuma regra dispara ou a confiança é baixa."""
        for rule_id, rule in self._rules:
            try:
                signal = rule(classified, snapshot)
            except Exception as exc:  # uma regra com bug não pode gerar ordem
                logger.opt(exception=exc).error("Regra falhou; ignorada", rule=rule_id, ticker=classified.event.ticker)
                continue
            if signal is None:
                continue
            if signal.is_actionable and signal.take_profit_pct < self.config.min_reward_risk * signal.stop_loss_pct:
                return self._hold(
                    classified,
                    snapshot,
                    f"{rule_id} disparou mas reward/risk {signal.take_profit_pct / signal.stop_loss_pct:.2f} < "
                    f"{self.config.min_reward_risk:g}. {signal.reasoning}",
                    rule_id=f"{rule_id}_LOW_REWARD_RISK",
                )
            if signal.is_actionable and signal.confidence < self.config.min_confidence:
                return self._hold(
                    classified,
                    snapshot,
                    f"{rule_id} disparou mas confiança {signal.confidence:.2f} < mínimo "
                    f"{self.config.min_confidence:.2f}. {signal.reasoning}",
                    rule_id=f"{rule_id}_LOW_CONFIDENCE",
                )
            logger.info(
                "Sinal gerado",
                ticker=signal.ticker,
                action=signal.action.value,
                rule=signal.rule_id,
                confidence=round(signal.confidence, 3),
                sl=round(signal.stop_loss_pct, 4),
                tp=round(signal.take_profit_pct, 4),
            )
            return signal
        return self._hold(classified, snapshot, "Nenhuma regra de entrada disparou.", rule_id="NO_RULE")

    # --- Regras -------------------------------------------------------------
    def _rule_ma_positive(self, ce: ClassifiedEvent, snap: MarketSnapshot | None) -> TradingSignal | None:
        """Regra 1: M&A com sentimento > 0.5 -> BUY.

        Alvo = ``offer_target_ratio`` (85%) × preço de oferta, quando houver
        preço por ação e preço de mercado. Os 15% restantes representam o
        desconto de risco de não conclusão (CADE, financiamento, assembleia).
        Sem preço de oferta, usa alvo de momentum baseado em ATR.
        """
        c = ce.classification
        if c.event_category is not EventCategory.MA or c.sentiment_score <= self.config.ma_sentiment_threshold:
            return None
        cfg = self.config
        stop = self._atr_stop(snap)
        price = snap.last_price if snap else None

        if c.offer_price and price:
            target_price = cfg.offer_target_ratio * c.offer_price
            upside = target_price / price - 1
            if upside < cfg.min_take_profit_pct:
                return self._hold(
                    ce,
                    snap,
                    f"M&A positivo, mas preço R$ {price:.2f} já está acima de {cfg.offer_target_ratio:.0%} "
                    f"da oferta (R$ {c.offer_price:.2f} -> alvo R$ {target_price:.2f}); sem assimetria.",
                    rule_id="R1_MA_NO_SPREAD",
                )
            take_profit = upside
            # Em merger-arb o risco é o deal quebrar: stop não deve ser mais
            # largo que o upside capturável.
            stop = min(stop, max(upside, cfg.min_stop_pct))
            how = f"alvo = {cfg.offer_target_ratio:.0%} da oferta (R$ {c.offer_price:.2f} -> R$ {target_price:.2f})"
        else:
            take_profit = self._atr_take_profit(snap)
            how = "sem preço de oferta: alvo de momentum por ATR"

        return self._build(
            ce,
            snap,
            Action.BUY,
            "R1_MA_POSITIVE",
            stop,
            take_profit,
            f"M&A com sentimento {c.sentiment_score:+.2f}; {how}. Tese: {c.actionable_thesis}",
        )

    def _rule_capital_allocation(self, ce: ClassifiedEvent, snap: MarketSnapshot | None) -> TradingSignal | None:
        """Regra 2: Capital allocation com sentimento > 0.7 -> BUY (dividend yield gap).

        Se o comunicado traz dividendo por ação e há DY histórico, o alvo é o
        *gap* entre o yield implícito do anúncio e o DY médio (o preço tende a
        se ajustar até o yield reconvergir), limitado pelo ATR.
        """
        c = ce.classification
        if (
            c.event_category is not EventCategory.CAPITAL_ALLOCATION
            or c.sentiment_score <= self.config.capital_alloc_sentiment_threshold
        ):
            return None
        stop = self._atr_stop(snap)
        take_profit = self._atr_take_profit(snap)
        detail = "alvo por ATR (sem dados de yield)"

        if c.dividend_per_share and snap and snap.last_price > 0:
            event_yield = c.dividend_per_share / snap.last_price
            base_yield = snap.trailing_dividend_yield
            if base_yield is not None:
                gap = event_yield - base_yield
                if gap <= 0:
                    return self._hold(
                        ce,
                        snap,
                        f"Dividendo implica yield {event_yield:.2%} <= DY médio {base_yield:.2%}; sem gap.",
                        rule_id="R2_NO_YIELD_GAP",
                    )
                # Re-rating: o alvo ATR é o piso; um gap grande (metade capturável,
                # o resto sai na data-ex) estende o alvo até 1.5× o alvo ATR.
                take_profit = max(take_profit, min(gap * 0.5, take_profit * 1.5))
                detail = f"yield do evento {event_yield:.2%} vs DY médio {base_yield:.2%} (gap {gap:.2%})"
            else:
                detail = f"yield do evento {event_yield:.2%}; DY médio indisponível, alvo por ATR"

        return self._build(
            ce,
            snap,
            Action.BUY,
            "R2_CAPITAL_ALLOCATION_YIELD_GAP",
            stop,
            take_profit,
            f"Capital allocation com sentimento {c.sentiment_score:+.2f}; {detail}. Tese: {c.actionable_thesis}",
        )

    def _rule_material_negative(self, ce: ClassifiedEvent, snap: MarketSnapshot | None) -> TradingSignal | None:
        """Regra 3: material e sentimento < -0.5 -> SELL/SHORT com stop dinâmico.

        Stop = ``iv_stop_sigmas`` × σ diário implícito (IV/√252) se houver vol
        implícita; senão ``atr_stop_mult`` × ATR%. Alvo = stop × reward/risk.
        """
        c = ce.classification
        if not c.is_material or c.sentiment_score >= self.config.negative_material_threshold:
            return None
        cfg = self.config
        if snap and snap.implied_vol:
            daily_sigma = snap.implied_vol / math.sqrt(252)
            stop = cfg.iv_stop_sigmas * daily_sigma
            basis = f"stop {cfg.iv_stop_sigmas:g}σ da vol implícita ({snap.implied_vol:.0%} a.a.)"
        else:
            stop = self._atr_stop(snap)
            basis = f"stop {cfg.atr_stop_mult:g}×ATR (vol implícita indisponível)"
        stop = self._clamp(stop, cfg.min_stop_pct, cfg.max_stop_pct)
        take_profit = stop * cfg.short_reward_risk
        return self._build(
            ce,
            snap,
            Action.SELL,
            "R3_MATERIAL_NEGATIVE_SHORT",
            stop,
            take_profit,
            f"Evento material com sentimento {c.sentiment_score:+.2f}; {basis}, "
            f"alvo {cfg.short_reward_risk:g}R. Tese: {c.actionable_thesis}",
        )

    # --- Helpers ------------------------------------------------------------
    def _atr_pct(self, snap: MarketSnapshot | None) -> float:
        if snap is not None and snap.atr_pct:
            return snap.atr_pct
        return self.config.default_atr_pct

    def _atr_stop(self, snap: MarketSnapshot | None) -> float:
        return self._atr_pct(snap) * self.config.atr_stop_mult

    def _atr_take_profit(self, snap: MarketSnapshot | None) -> float:
        return self._atr_pct(snap) * self.config.atr_take_profit_mult

    @staticmethod
    def _clamp(value: float, lo: float, hi: float) -> float:
        return max(lo, min(hi, value))

    def _confidence(self, ce: ClassifiedEvent) -> float:
        """Confiança heurística: |sentimento| × peso da magnitude, com bônus por materialidade."""
        c = ce.classification
        conf = abs(c.sentiment_score) * _MAGNITUDE_WEIGHT[c.magnitude_estimate]
        if c.is_material:
            conf = conf + (1 - conf) * 0.25
        return round(self._clamp(conf, 0.0, 1.0), 4)

    def _build(
        self,
        ce: ClassifiedEvent,
        snap: MarketSnapshot | None,
        action: Action,
        rule_id: str,
        stop: float,
        take_profit: float,
        reasoning: str,
    ) -> TradingSignal:
        cfg = self.config
        return TradingSignal(
            ticker=ce.event.ticker,
            action=action,
            confidence=self._confidence(ce),
            stop_loss_pct=round(self._clamp(stop, cfg.min_stop_pct, cfg.max_stop_pct), 4),
            take_profit_pct=round(self._clamp(take_profit, cfg.min_take_profit_pct, cfg.max_take_profit_pct), 4),
            reasoning=reasoning,
            rule_id=rule_id,
            event_hash=ce.event.hash_id,
            reference_price=snap.last_price if snap else None,
        )

    def _hold(self, ce: ClassifiedEvent, snap: MarketSnapshot | None, reasoning: str, rule_id: str) -> TradingSignal:
        return TradingSignal(
            ticker=ce.event.ticker,
            action=Action.HOLD,
            confidence=0.0,
            stop_loss_pct=0.0,
            take_profit_pct=0.0,
            reasoning=reasoning,
            rule_id=rule_id,
            event_hash=ce.event.hash_id,
            reference_price=snap.last_price if snap else None,
        )
