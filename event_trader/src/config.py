"""Configuração central do pipeline, carregada de variáveis de ambiente.

Usamos dataclasses (sem pydantic) para manter o pipeline leve. Cada camada
recebe apenas o bloco de configuração de que precisa, o que facilita testes.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ValueError(f"Variável {name}={raw!r} não é um número válido") from exc


def _env_int(name: str, default: int) -> int:
    return int(_env_float(name, float(default)))


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on", "sim"}


@dataclass(frozen=True)
class IngestConfig:
    """Parâmetros da camada de ingestão."""

    poll_interval_s: float = 15.0
    fetch_timeout_s: float = 10.0
    max_backoff_s: float = 120.0
    dedupe_window: int = 10_000


@dataclass(frozen=True)
class LLMConfig:
    """Parâmetros do provider de LLM.

    ``provider`` aceita ``anthropic``, ``openai`` ou ``mock`` (heurístico
    determinístico, útil para demo/backtest offline). ``auto`` escolhe
    ``anthropic``/``openai`` se houver chave no ambiente, senão ``mock``.
    """

    provider: str = "auto"
    anthropic_model: str = "claude-opus-5-5"
    # Classificação é tarefa curta: esforço baixo reduz latência e custo.
    anthropic_effort: str = "low"
    anthropic_fallbacks: bool = True
    openai_model: str = "gpt-4o-mini"
    max_tokens: int = 1024
    timeout_s: float = 20.0
    max_retries: int = 3
    cache_ttl_s: float = 6 * 3600
    cache_path: Path | None = None
    max_concurrency: int = 8


@dataclass(frozen=True)
class SignalConfig:
    """Regras de negócio e limites de risco do gerador de sinais."""

    ma_sentiment_threshold: float = 0.5
    capital_alloc_sentiment_threshold: float = 0.7
    negative_material_threshold: float = -0.5
    # Regra 1: alvo = 85% do preço de oferta (merger-arb com desconto de risco).
    offer_target_ratio: float = 0.85
    min_confidence: float = 0.35
    min_reward_risk: float = 1.0
    atr_stop_mult: float = 1.5
    atr_take_profit_mult: float = 3.0
    iv_stop_sigmas: float = 2.0
    short_reward_risk: float = 2.0
    min_stop_pct: float = 0.01
    max_stop_pct: float = 0.12
    min_take_profit_pct: float = 0.01
    max_take_profit_pct: float = 0.35
    default_atr_pct: float = 0.025


@dataclass(frozen=True)
class BrokerConfig:
    """Parâmetros do paper trading."""

    initial_cash: float = 1_000_000.0
    risk_per_trade_pct: float = 0.005
    max_position_pct: float = 0.10
    commission_bps: float = 2.5
    slippage_bps: float = 5.0
    lot_size: int = 100


@dataclass(frozen=True)
class AlertConfig:
    """Credenciais dos canais de alerta (opcionais)."""

    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
    discord_webhook_url: str | None = None
    timeout_s: float = 5.0


@dataclass(frozen=True)
class Settings:
    """Agregado de todas as configurações."""

    ingest: IngestConfig = field(default_factory=IngestConfig)
    llm: LLMConfig = field(default_factory=LLMConfig)
    signal: SignalConfig = field(default_factory=SignalConfig)
    broker: BrokerConfig = field(default_factory=BrokerConfig)
    alerts: AlertConfig = field(default_factory=AlertConfig)
    log_level: str = "INFO"
    log_json: bool = False

    @classmethod
    def from_env(cls) -> Settings:
        """Constrói as configurações a partir do ambiente (12-factor)."""
        cache_path = os.getenv("LLM_CACHE_PATH")
        return cls(
            ingest=IngestConfig(
                poll_interval_s=_env_float("POLL_INTERVAL_S", 15.0),
                fetch_timeout_s=_env_float("FETCH_TIMEOUT_S", 10.0),
            ),
            llm=LLMConfig(
                provider=os.getenv("LLM_PROVIDER", "auto").lower(),
                anthropic_model=os.getenv("ANTHROPIC_MODEL", "claude-opus-5-5"),
                anthropic_effort=os.getenv("ANTHROPIC_EFFORT", "low"),
                anthropic_fallbacks=_env_bool("ANTHROPIC_FALLBACKS", True),
                openai_model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                timeout_s=_env_float("LLM_TIMEOUT_S", 20.0),
                max_retries=_env_int("LLM_MAX_RETRIES", 3),
                cache_path=Path(cache_path) if cache_path else None,
                max_concurrency=_env_int("LLM_MAX_CONCURRENCY", 8),
            ),
            broker=BrokerConfig(initial_cash=_env_float("PAPER_INITIAL_CASH", 1_000_000.0)),
            alerts=AlertConfig(
                telegram_bot_token=os.getenv("TELEGRAM_BOT_TOKEN"),
                telegram_chat_id=os.getenv("TELEGRAM_CHAT_ID"),
                discord_webhook_url=os.getenv("DISCORD_WEBHOOK_URL"),
            ),
            log_level=os.getenv("LOG_LEVEL", "INFO"),
            log_json=_env_bool("LOG_JSON", False),
        )
