"""MarketSimulator: dados fictícios para a demo (substitui o feed da B3).

Cada ativo segue um modelo de fatores:
    r_i = Σ beta_i,f * r_f + ruído idiossincrático
Fatores: mercado, petróleo, minério, juros (positivo = juros subindo) e dólar.
Os fatores têm tendências (regimes) que mudam ao acaso, e o cenário macro
inclina os fatores (ex.: "IPCA acima do esperado" -> juros sobem, mercado cai).
Assim, se o petróleo sobe, PETR4/PETR3/PRIO3 e TAEE11 sobem juntos.
"""

from __future__ import annotations

import math
import random
import statistics
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.engine.index_engine import AssetQuote
from app.engine.weights import WEIGHTS

FACTORS: tuple[str, ...] = ("mkt", "oil", "iron", "rates", "usd")

FACTOR_SIGMA: dict[str, float] = {
    "mkt": 0.0007,
    "oil": 0.0010,
    "iron": 0.0010,
    "rates": 0.0008,
    "usd": 0.0006,
}

LOADINGS: dict[str, dict[str, float]] = {
    "PETR4": {"mkt": 1.0, "oil": 1.2},
    "PETR3": {"mkt": 1.0, "oil": 1.2},
    "PRIO3": {"mkt": 0.9, "oil": 1.5},
    "VALE3": {"mkt": 0.9, "iron": 1.3, "usd": 0.3},
    "ITUB4": {"mkt": 1.1, "rates": 0.3},
    "BBDC4": {"mkt": 1.1, "rates": 0.3},
    "BBAS3": {"mkt": 1.2, "rates": 0.3},
    "ITSA4": {"mkt": 1.0, "rates": 0.3},
    "BPAC11": {"mkt": 1.3, "rates": -0.2},
    "B3SA3": {"mkt": 1.3, "rates": -0.6},
    "ELET3": {"mkt": 0.8, "rates": -0.5},
    "EQTL3": {"mkt": 0.7, "rates": -0.6},
    "TAEE11": {"mkt": 0.5, "rates": -0.4, "oil": 0.3},
    "SBSP3": {"mkt": 0.7, "rates": -0.5},
    "WEGE3": {"mkt": 0.8, "usd": 0.6},
    "ABEV3": {"mkt": 0.6},
    "RENT3": {"mkt": 1.2, "rates": -0.9},
    "RDOR3": {"mkt": 1.0, "rates": -0.7},
    "SUZB3": {"mkt": 0.5, "usd": 0.9},
    "JBSS3": {"mkt": 0.6, "usd": 0.7},
}

BASE_PRICES: dict[str, float] = {
    "PETR4": 37.8, "PETR3": 40.5, "PRIO3": 44.2, "VALE3": 61.3, "ITUB4": 36.9,
    "BBDC4": 15.1, "BBAS3": 26.4, "ITSA4": 10.6, "BPAC11": 41.7, "B3SA3": 12.9,
    "ELET3": 44.8, "EQTL3": 33.5, "TAEE11": 36.2, "SBSP3": 104.0, "WEGE3": 51.2,
    "ABEV3": 13.2, "RENT3": 42.6, "RDOR3": 31.8, "SUZB3": 55.4, "JBSS3": 38.9,
}

MACRO_SCENARIOS: tuple[tuple[str, dict[str, float]], ...] = (
    ("Cenário neutro: agenda macro sem surpresas", {}),
    ("IPCA acima do esperado; curva de juros abre", {"rates": 0.0004, "mkt": -0.0002}),
    ("IPCA abaixo do esperado; mercado precifica cortes da Selic", {"rates": -0.0004, "mkt": 0.0002}),
    ("Brent em alta com tensão no Oriente Médio", {"oil": 0.0005}),
    ("Brent recua com aumento de produção da OPEP+", {"oil": -0.0005}),
    ("China anuncia estímulos; minério de ferro dispara", {"iron": 0.0005, "mkt": 0.0001}),
    ("Dados fracos da China pressionam o minério", {"iron": -0.0005, "mkt": -0.0001}),
    ("Payroll forte nos EUA; dólar se fortalece", {"usd": 0.0004, "mkt": -0.0002}),
    ("Ruído fiscal em Brasília eleva prêmio de risco", {"rates": 0.0003, "usd": 0.0003, "mkt": -0.0003}),
    ("Fluxo global de risco positivo (risk-on)", {"mkt": 0.0003, "usd": -0.0002}),
    ("Copom sinaliza fim do ciclo de alta da Selic", {"rates": -0.0003, "mkt": 0.0002}),
    ("Balança comercial forte; real se valoriza", {"usd": -0.0003, "mkt": 0.0001}),
)

WIN_POINT_VALUE_BRL: float = 0.20
"""Valor de 1 ponto do mini-índice (WIN) por contrato."""


@dataclass(frozen=True)
class MarketState:
    timestamp: datetime
    quotes: list[AssetQuote]
    win_price: float
    foreign_flow: float
    """Fluxo estrangeiro líquido, em R$ milhões (janela móvel)."""
    vix: float
    """Volatilidade implícita simulada, em %."""
    atr_pct: float
    """ATR simulado, em % do preço do WIN."""
    macro_scenario: str
    factor_trends: dict[str, float] = field(default_factory=dict)


class MarketSimulator:
    WINDOW: int = 20
    ATR_WINDOW: int = 14
    ATR_HORIZON_TICKS: int = 12
    """Projeta o ATR para ~1 min (12 ticks de 5 s), escala usada para stop/alvo."""

    def __init__(self, seed: int | None = None, win_start: float = 130_000.0) -> None:
        self._rng = random.Random(seed)
        self._prices: dict[str, float] = dict(BASE_PRICES)
        self._history: dict[str, deque[float]] = {
            t: deque(maxlen=self.WINDOW) for t in WEIGHTS
        }
        self._open_price: dict[str, float] = dict(BASE_PRICES)
        total = sum(WEIGHTS.values())
        self._weights = {t: w / total for t, w in WEIGHTS.items()}
        self._factor_prev: dict[str, float] = {f: 0.0 for f in FACTORS}
        self._regime: dict[str, float] = {f: 0.0 for f in FACTORS}
        self._scenario_idx = 0
        self._win = win_start
        self._win_abs_returns: deque[float] = deque(maxlen=self.ATR_WINDOW)
        self._flow = 0.0
        self._vix = 18.0
        self._last_state: MarketState | None = None

        for _ in range(self.WINDOW + 10):  # aquece as janelas de média/desvio
            self._step()
        self._open_price = dict(self._prices)

    @property
    def last_state(self) -> MarketState | None:
        return self._last_state

    def tick(self) -> MarketState:
        self._step()
        self._last_state = self._snapshot()
        return self._last_state

    def _step(self) -> None:
        rng = self._rng
        if rng.random() < 0.02:
            self._scenario_idx = rng.randrange(len(MACRO_SCENARIOS))
        scenario_bias = MACRO_SCENARIOS[self._scenario_idx][1]

        factor_ret: dict[str, float] = {}
        for f in FACTORS:
            if rng.random() < 0.04:  # troca de regime: tendência de alta, baixa ou lateral
                self._regime[f] = rng.choice((-1.0, 0.0, 0.0, 1.0)) * FACTOR_SIGMA[f] * 0.2
            factor_ret[f] = (
                0.15 * self._factor_prev[f]
                + self._regime[f]
                + 0.5 * scenario_bias.get(f, 0.0)
                + rng.gauss(0.0, FACTOR_SIGMA[f])
            )
        self._factor_prev = factor_ret

        index_ret = 0.0
        for ticker, loadings in LOADINGS.items():
            r = sum(beta * factor_ret[f] for f, beta in loadings.items())
            r += rng.gauss(0.0, 0.0012)
            self._prices[ticker] *= math.exp(r)
            self._history[ticker].append(self._prices[ticker])
            index_ret += self._weights[ticker] * r

        self._win *= math.exp(index_ret + rng.gauss(0.0, 0.0001))
        self._win_abs_returns.append(abs(index_ret))

        # Estrangeiro compra na alta e vende na queda (com inércia).
        self._flow = 0.92 * self._flow + 150_000.0 * factor_ret["mkt"] + rng.gauss(0.0, 30.0)

        # Volatilidade: reverte à média, sobe na queda e tem saltos ocasionais.
        self._vix += 0.05 * (18.0 - self._vix) - 300.0 * factor_ret["mkt"] + rng.gauss(0.0, 0.3)
        if rng.random() < 0.01:
            self._vix += rng.uniform(4.0, 9.0)
        self._vix = min(60.0, max(10.0, self._vix))

    def _snapshot(self) -> MarketState:
        quotes: list[AssetQuote] = []
        for ticker in WEIGHTS:
            hist = self._history[ticker]
            price = self._prices[ticker]
            quotes.append(
                AssetQuote(
                    ticker=ticker,
                    price=round(price, 2),
                    sma20=statistics.fmean(hist),
                    std20=statistics.pstdev(hist),
                    change_pct=round((price / self._open_price[ticker] - 1.0) * 100.0, 2),
                )
            )

        mean_abs = statistics.fmean(self._win_abs_returns) if self._win_abs_returns else 0.0
        atr_pct = max(0.15, mean_abs * math.sqrt(self.ATR_HORIZON_TICKS) * 100.0)

        return MarketState(
            timestamp=datetime.now(timezone.utc),
            quotes=quotes,
            win_price=round(self._win / 5.0) * 5.0,  # WIN negocia em múltiplos de 5 pontos
            foreign_flow=round(self._flow, 1),
            vix=round(self._vix, 2),
            atr_pct=round(atr_pct, 4),
            macro_scenario=MACRO_SCENARIOS[self._scenario_idx][0],
            factor_trends={f: round(v * 1e4, 2) for f, v in self._regime.items()},
        )
