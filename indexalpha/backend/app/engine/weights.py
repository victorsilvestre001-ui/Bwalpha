"""Pesos dos 20 "Pilares" do Ibovespa usados pelo IndexAlpha Engine.

Os valores são aproximações ilustrativas da carteira teórica (não oficiais).
Atualize a partir da carteira da B3 a cada rebalanceamento quadrimestral.
O `IndexEngine` normaliza os pesos para somarem 1.0.
"""

from __future__ import annotations

from typing import Final

WEIGHTS: Final[dict[str, float]] = {
    "PETR4": 0.120,
    "VALE3": 0.100,
    "ITUB4": 0.090,
    "BBDC4": 0.050,
    "PETR3": 0.050,
    "BBAS3": 0.040,
    "B3SA3": 0.040,
    "ELET3": 0.040,
    "WEGE3": 0.035,
    "ABEV3": 0.030,
    "ITSA4": 0.030,
    "BPAC11": 0.030,
    "SBSP3": 0.030,
    "RENT3": 0.025,
    "SUZB3": 0.025,
    "EQTL3": 0.020,
    "PRIO3": 0.020,
    "RDOR3": 0.020,
    "JBSS3": 0.020,
    "TAEE11": 0.015,
}

SECTORS: Final[dict[str, str]] = {
    "PETR4": "Petróleo",
    "PETR3": "Petróleo",
    "PRIO3": "Petróleo",
    "VALE3": "Mineração",
    "ITUB4": "Bancos",
    "BBDC4": "Bancos",
    "BBAS3": "Bancos",
    "ITSA4": "Bancos",
    "BPAC11": "Bancos",
    "B3SA3": "Financeiro",
    "ELET3": "Energia",
    "EQTL3": "Energia",
    "TAEE11": "Energia",
    "SBSP3": "Saneamento",
    "WEGE3": "Industrial",
    "ABEV3": "Consumo",
    "RENT3": "Consumo",
    "RDOR3": "Saúde",
    "SUZB3": "Papel e Celulose",
    "JBSS3": "Proteína",
}
