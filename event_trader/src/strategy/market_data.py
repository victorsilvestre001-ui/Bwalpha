"""Dados de mercado para dimensionamento de risco (preço, ATR, vol implícita)."""

from __future__ import annotations

from abc import ABC, abstractmethod

import pandas as pd

from src.models import MarketSnapshot


def compute_atr(ohlc: pd.DataFrame, period: int = 14) -> pd.Series:
    """ATR de Wilder.

    Args:
        ohlc: DataFrame com colunas ``high``, ``low``, ``close`` em ordem cronológica.
        period: janela (padrão 14).
    """
    required = {"high", "low", "close"}
    if not required.issubset(ohlc.columns):
        raise ValueError(f"colunas ausentes: {sorted(required - set(ohlc.columns))}")
    prev_close = ohlc["close"].shift(1)
    true_range = pd.concat(
        [
            ohlc["high"] - ohlc["low"],
            (ohlc["high"] - prev_close).abs(),
            (ohlc["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return true_range.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()


class MarketDataProvider(ABC):
    """Fonte de snapshot de mercado. Plugue aqui B3 UMDF, Cedro, IBKR, etc."""

    @abstractmethod
    async def get_snapshot(self, ticker: str) -> MarketSnapshot | None:
        """Retorna o snapshot atual ou ``None`` se o ativo não estiver disponível."""


class StaticMarketDataProvider(MarketDataProvider):
    """Provider em memória (demo/testes)."""

    def __init__(self, snapshots: dict[str, MarketSnapshot] | None = None) -> None:
        self._snapshots = {k.upper(): v for k, v in (snapshots or {}).items()}

    def update(self, snapshot: MarketSnapshot) -> None:
        self._snapshots[snapshot.ticker.upper()] = snapshot

    async def get_snapshot(self, ticker: str) -> MarketSnapshot | None:
        return self._snapshots.get(ticker.upper())
