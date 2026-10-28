"""Gerador de dados históricos SIMULADOS para o backtest.

Os comunicados e preços são sintéticos (empresas reais apenas como tickers de
exemplo; nenhum texto corresponde a um fato real). Cada template tem uma reação
"verdadeira" de preço com ruído, incluindo casos em que o mercado reage contra
a leitura óbvia — para o backtest não ser trivialmente perfeito.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from src.models import B3_TZ

TICKERS = {
    "PETR4": 38.0, "VALE3": 62.0, "ITUB4": 33.0, "BBAS3": 27.0, "ELET3": 41.0,
    "WEGE3": 52.0, "RENT3": 48.0, "SUZB3": 55.0, "CMIG4": 11.5, "MGLU3": 9.0,
}


@dataclass(frozen=True)
class Template:
    headline: str
    body: str
    gap_mu: float  # reação média na abertura
    gap_sigma: float
    drift: float  # deriva adicional nos pregões seguintes
    needs_offer: bool = False
    needs_dps: bool = False


TEMPLATES: list[Template] = [
    Template(
        "Fato Relevante — Recebimento de Oferta Pública de Aquisição (OPA)",
        "A Companhia comunica que recebeu proposta vinculante para Oferta Pública de Aquisição da "
        "totalidade das ações, ao preço de R$ {offer} por ação, representando prêmio de {premium}% sobre "
        "o fechamento. A alienação de controle está sujeita à aprovação do CADE.",
        0.17, 0.04, 0.01, needs_offer=True,
    ),
    Template(
        "Fato Relevante — Acordo de incorporação com prêmio",
        "O Conselho de Administração aprovou protocolo de incorporação pela qual os acionistas receberão "
        "R$ {offer} por ação em dinheiro, prêmio de {premium}% e aprovação unânime do conselho.",
        0.14, 0.05, 0.0, needs_offer=True,
    ),
    Template(
        "Comunicado — Aquisição de ativo no exterior",
        "A Companhia celebrou acordo para aquisição de ativo no exterior, com crescimento esperado de "
        "receita e sinergias relevantes, mediante aprovação regulatória. Prêmio pago considerado "
        "estratégico pela administração.",
        0.02, 0.04, 0.005,
    ),
    Template(
        "Fato Relevante — Dividendos extraordinários",
        "O Conselho aprovou a distribuição de dividendos extraordinários de R$ {dps} por ação, valor "
        "recorde e acima da política de remuneração, com crescimento do lucro e aprovação do conselho.",
        0.035, 0.02, 0.004, needs_dps=True,
    ),
    Template(
        "Aviso aos Acionistas — Juros sobre Capital Próprio",
        "A Companhia informa a declaração de juros sobre capital próprio de R$ {dps} por ação, em linha "
        "com a política de remuneração vigente.",
        0.0, 0.01, 0.0, needs_dps=True,
    ),
    Template(
        "Fato Relevante — Programa de recompra de ações",
        "O Conselho aprovou programa de recompra de até 5% das ações em circulação, com elevação do "
        "retorno ao acionista e aprovação para cancelamento posterior.",
        0.02, 0.015, 0.003,
    ),
    Template(
        "Fato Relevante — Auto de infração bilionário",
        "A Companhia recebeu auto de infração da Receita Federal no montante de R$ 4,2 bilhões, "
        "incluindo multa, e avalia a possibilidade de perda como provável. Há investigação em curso.",
        -0.07, 0.03, -0.01,
    ),
    Template(
        "Fato Relevante — Inconsistências contábeis",
        "A Companhia identificou inconsistências em lançamentos contábeis de exercícios anteriores, com "
        "potencial fraude. Foi instaurada investigação independente e houve renúncia do Diretor Financeiro. "
        "A divulgação de resultados está suspensa.",
        -0.18, 0.06, -0.03,
    ),
    Template(
        "Comunicado — Decisão desfavorável em arbitragem",
        "O tribunal arbitral proferiu decisão com condenação da Companhia ao pagamento de R$ 1,1 bilhão, "
        "gerando perda e redução de caixa. A Companhia avalia medidas cabíveis.",
        -0.045, 0.035, 0.012,  # mercado frequentemente já precificava: repique posterior
    ),
    Template(
        "Comunicado ao Mercado — Reajuste tarifário",
        "A ANEEL aprovou reajuste tarifário positivo de 9,1%, acima do esperado, favorável ao equilíbrio "
        "econômico-financeiro da concessão.",
        0.025, 0.02, 0.002,
    ),
    Template(
        "Fato Relevante — Renúncia do Diretor Presidente",
        "A Companhia informa a renúncia do Diretor Presidente (CEO). O Conselho de Administração "
        "conduzirá o processo de eleição de substituto.",
        -0.03, 0.025, -0.002,
    ),
    Template(
        "Release de Resultados 3T",
        "A Companhia divulga resultados do trimestre com receita em linha com o consenso e margens "
        "estáveis.",
        0.0, 0.03, 0.0,
    ),
]


def _fmt_brl(value: float) -> str:
    return f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def generate_sample_data(out_dir: str | Path, n_events: int = 80, seed: int = 7) -> tuple[Path, Path, Path]:
    """Gera ``historical_events.csv``, ``event_meta.csv`` e ``historical_prices.csv``.

    Retorna os três caminhos.
    """
    rng = np.random.default_rng(seed)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    dates = pd.bdate_range("2025-01-02", "2025-12-30")

    # 1) Sorteia eventos (data, ticker, template) com espaçamento mínimo por ticker.
    plans: list[dict[str, object]] = []
    used: dict[str, list[int]] = {t: [] for t in TICKERS}
    tickers = list(TICKERS)
    while len(plans) < n_events:
        ticker = tickers[int(rng.integers(len(tickers)))]
        day = int(rng.integers(30, len(dates) - 10))
        if any(abs(day - d) < 12 for d in used[ticker]):
            continue
        used[ticker].append(day)
        plans.append({"ticker": ticker, "day": day, "tpl": TEMPLATES[int(rng.integers(len(TEMPLATES)))]})

    event_rows, meta_rows = [], []

    # 2) Preços com GBM + choques nos dias de entrada.
    price_rows = []
    by_ticker: dict[str, list[dict[str, object]]] = {t: [] for t in TICKERS}
    for p in plans:
        by_ticker[str(p["ticker"])].append(p)

    for ticker, base_price in TICKERS.items():
        sigma = float(rng.uniform(0.014, 0.026))
        close = base_price
        plan_by_entry = {int(p["day"]) + 1: p for p in by_ticker[ticker]}  # evento após o fechamento
        drift_left: list[tuple[int, float]] = []
        for i, d in enumerate(dates):
            prev_close = close
            gap = float(rng.normal(0, sigma * 0.3))
            plan = plan_by_entry.get(i)
            if plan is not None:
                tpl: Template = plan["tpl"]  # type: ignore[assignment]
                premium = float(rng.uniform(0.20, 0.60))
                if tpl.needs_offer:
                    # Mercado abre com desconto à oferta (risco de não conclusão) e converge depois.
                    shock = premium * float(rng.uniform(0.40, 0.85)) + float(rng.normal(0, tpl.gap_sigma))
                    drift = premium * float(rng.uniform(-0.05, 0.15))
                else:
                    shock = float(rng.normal(tpl.gap_mu, tpl.gap_sigma))
                    drift = tpl.drift
                gap += shock
                drift_left.append((4, drift / 4))
                event_day = dates[i - 1]
                ts = datetime.combine(event_day.date(), time(18, 0), tzinfo=B3_TZ) + timedelta(
                    minutes=int(rng.integers(0, 150))
                )
                body, headline = tpl.body, tpl.headline
                offer = prev_close * (1 + premium)
                dps = prev_close * float(rng.uniform(0.04, 0.09) if "extraord" in body else rng.uniform(0.005, 0.012))
                body = body.format(offer=_fmt_brl(offer), premium=f"{premium * 100:.1f}".replace(".", ","),
                                   dps=_fmt_brl(dps))
                source_id = f"sim:{ticker}:{event_day.date()}"
                event_rows.append({
                    "ticker": ticker, "timestamp": ts.isoformat(), "headline": headline,
                    "body_text": body, "source_id": source_id,
                })
                meta_rows.append({
                    "source_id": source_id,
                    # Vol implícita só existe para parte dos papéis (liquidez de opções).
                    "implied_vol": round(sigma * np.sqrt(252) * float(rng.uniform(1.0, 1.4)), 4)
                    if ticker in {"PETR4", "VALE3", "ITUB4", "BBAS3"} else None,
                    "trailing_dividend_yield": round(float(rng.uniform(0.03, 0.08)), 4),
                })

            extra = sum(step for _, step in drift_left)
            drift_left = [(n - 1, s) for n, s in drift_left if n > 1]
            open_ = prev_close * (1 + gap)
            ret = float(rng.normal(extra, sigma))
            close = max(0.5, open_ * (1 + ret))
            hi = max(open_, close) * (1 + abs(float(rng.normal(0, sigma * 0.5))))
            lo = min(open_, close) * (1 - abs(float(rng.normal(0, sigma * 0.5))))
            price_rows.append({"date": d.date().isoformat(), "ticker": ticker, "open": round(open_, 2),
                               "high": round(hi, 2), "low": round(lo, 2), "close": round(close, 2)})

    events_path = out / "historical_events.csv"
    meta_path = out / "event_meta.csv"
    prices_path = out / "historical_prices.csv"
    pd.DataFrame(event_rows).sort_values("timestamp").to_csv(events_path, index=False)
    pd.DataFrame(meta_rows).to_csv(meta_path, index=False)
    pd.DataFrame(price_rows).to_csv(prices_path, index=False)
    return events_path, meta_path, prices_path
