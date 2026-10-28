"""Abstração de provider de LLM.

O ``EventClassifier`` depende só de ``LLMProvider.complete_json``. Trocar
Anthropic por OpenAI (ou por um modelo self-hosted) é escolher outra
implementação — a lógica de negócio não muda.

Os SDKs são importados de forma preguiçosa: quem usa só o ``MockLLMProvider``
(demo/backtest offline) não precisa instalá-los.
"""

from __future__ import annotations

import json
import re
import unicodedata
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

from loguru import logger


class LLMProviderError(RuntimeError):
    """Falha ao obter resposta do provider.

    Attributes:
        retryable: ``True`` para falhas transitórias (429, 5xx, timeout, rede).
    """

    def __init__(self, message: str, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


@dataclass(frozen=True)
class LLMResponse:
    data: dict[str, Any]
    model: str
    input_tokens: int | None = None
    output_tokens: int | None = None


class LLMProvider(ABC):
    """Contrato mínimo: system + user -> objeto JSON validado pelo schema."""

    name: str = "llm"
    model: str = "unknown"

    @abstractmethod
    async def complete_json(self, system: str, user: str, schema: dict[str, Any]) -> LLMResponse:
        """Executa a chamada e devolve o JSON já decodificado."""

    async def aclose(self) -> None:  # noqa: B027 - hook opcional
        """Fecha conexões HTTP."""


def _decode_json(text: str) -> dict[str, Any]:
    """Decodifica JSON tolerando cercas ```json``` (defesa extra)."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise LLMProviderError(f"resposta não é JSON válido: {exc}; trecho={text[:200]!r}", retryable=True) from exc
    if not isinstance(data, dict):
        raise LLMProviderError("JSON da resposta não é um objeto", retryable=True)
    return data


class AnthropicProvider(LLMProvider):
    """Claude via SDK oficial ``anthropic`` (cliente assíncrono).

    * ``output_config.format`` com JSON Schema garante JSON válido no schema.
    * ``effort`` baixo: classificação curta não precisa de raciocínio longo,
      e isso corta latência/custo de forma relevante.
    * ``fallbacks="default"`` (beta): se o classificador de segurança recusar
      um comunicado (falso positivo em texto jurídico, por ex.), o servidor
      reexecuta no modelo de fallback dentro da mesma chamada.
    """

    name = "anthropic"

    def __init__(
        self,
        model: str = "claude-opus-5-5",
        max_tokens: int = 1024,
        effort: str = "low",
        timeout_s: float = 20.0,
        enable_fallbacks: bool = True,
        api_key: str | None = None,
    ) -> None:
        try:
            import anthropic
        except ImportError as exc:  # pragma: no cover - depende do ambiente
            raise LLMProviderError("pacote 'anthropic' não instalado (pip install anthropic)") from exc
        self._anthropic = anthropic
        # Retries ficam a cargo do EventClassifier (política única de backoff).
        self._client = anthropic.AsyncAnthropic(api_key=api_key, timeout=timeout_s, max_retries=0)
        self.model = model
        self._max_tokens = max_tokens
        self._effort = effort
        self._enable_fallbacks = enable_fallbacks

    async def complete_json(self, system: str, user: str, schema: dict[str, Any]) -> LLMResponse:
        a = self._anthropic
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": self._max_tokens,
            # System prompt estático + cache_control: reaproveita o prefixo
            # entre chamadas (menor latência e custo de input).
            "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            "messages": [{"role": "user", "content": user}],
            "output_config": {
                "effort": self._effort,
                "format": {"type": "json_schema", "schema": schema},
            },
        }
        try:
            if self._enable_fallbacks:
                response = await self._client.beta.messages.create(
                    betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs
                )
            else:
                response = await self._client.messages.create(**kwargs)
        except a.RateLimitError as exc:
            raise LLMProviderError(f"rate limit: {exc}", retryable=True) from exc
        except (a.AuthenticationError, a.PermissionDeniedError) as exc:
            raise LLMProviderError(f"credencial inválida: {exc}") from exc
        except a.BadRequestError as exc:
            raise LLMProviderError(f"requisição inválida: {exc}") from exc
        except a.APIStatusError as exc:
            raise LLMProviderError(f"HTTP {exc.status_code}: {exc}", retryable=exc.status_code >= 500) from exc
        except (a.APITimeoutError, a.APIConnectionError) as exc:
            raise LLMProviderError(f"rede/timeout: {exc}", retryable=True) from exc

        if response.stop_reason == "refusal":
            raise LLMProviderError(f"modelo recusou o conteúdo: {getattr(response, 'stop_details', None)}")
        if response.stop_reason == "max_tokens":
            raise LLMProviderError("resposta truncada por max_tokens", retryable=False)

        text = next((b.text for b in response.content if b.type == "text"), None)
        if text is None:
            raise LLMProviderError("resposta sem bloco de texto", retryable=True)
        usage = response.usage
        return LLMResponse(
            data=_decode_json(text),
            model=response.model,
            input_tokens=getattr(usage, "input_tokens", None),
            output_tokens=getattr(usage, "output_tokens", None),
        )

    async def aclose(self) -> None:
        await self._client.close()


class OpenAIProvider(LLMProvider):
    """OpenAI via SDK oficial ``openai`` com Structured Outputs (strict)."""

    name = "openai"

    def __init__(
        self,
        model: str = "gpt-4o-mini",
        max_tokens: int = 1024,
        timeout_s: float = 20.0,
        api_key: str | None = None,
    ) -> None:
        try:
            import openai
        except ImportError as exc:  # pragma: no cover
            raise LLMProviderError("pacote 'openai' não instalado (pip install openai)") from exc
        self._openai = openai
        self._client = openai.AsyncOpenAI(api_key=api_key, timeout=timeout_s, max_retries=0)
        self.model = model
        self._max_tokens = max_tokens

    async def complete_json(self, system: str, user: str, schema: dict[str, Any]) -> LLMResponse:
        o = self._openai
        try:
            response = await self._client.chat.completions.create(
                model=self.model,
                max_tokens=self._max_tokens,
                temperature=0,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                response_format={
                    "type": "json_schema",
                    "json_schema": {"name": "event_classification", "strict": True, "schema": schema},
                },
            )
        except o.RateLimitError as exc:
            raise LLMProviderError(f"rate limit: {exc}", retryable=True) from exc
        except (o.AuthenticationError, o.PermissionDeniedError, o.BadRequestError) as exc:
            raise LLMProviderError(f"erro não recuperável: {exc}") from exc
        except o.APIStatusError as exc:
            raise LLMProviderError(f"HTTP {exc.status_code}: {exc}", retryable=exc.status_code >= 500) from exc
        except (o.APITimeoutError, o.APIConnectionError) as exc:
            raise LLMProviderError(f"rede/timeout: {exc}", retryable=True) from exc

        choice = response.choices[0]
        if getattr(choice.message, "refusal", None):
            raise LLMProviderError(f"modelo recusou o conteúdo: {choice.message.refusal}")
        if choice.finish_reason == "length":
            raise LLMProviderError("resposta truncada por max_tokens")
        usage = response.usage
        return LLMResponse(
            data=_decode_json(choice.message.content or ""),
            model=response.model,
            input_tokens=getattr(usage, "prompt_tokens", None),
            output_tokens=getattr(usage, "completion_tokens", None),
        )

    async def aclose(self) -> None:
        await self._client.close()


def _strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


class MockLLMProvider(LLMProvider):
    """Classificador heurístico determinístico (léxico PT-BR).

    NÃO é um modelo de produção: existe para rodar demo, testes e backtest sem
    chave de API e sem custo, exercitando exatamente o mesmo contrato JSON.
    """

    name = "mock"
    model = "keyword-heuristic-v1"

    _CATEGORY_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
        ("M&A", ("oferta publica", " opa", "aquisicao", "incorporacao", "fusao", "alienacao de controle",
                 "joint venture", "cisao", "venda de ativo", "compra da totalidade")),
        ("LITIGATION", ("processo", "auto de infracao", "arbitragem", "acao judicial", "investigacao",
                        "multa", "condenacao", "recuperacao judicial", "fraude")),
        ("CAPITAL_ALLOCATION", ("dividendo", "juros sobre capital", "jcp", "recompra", "follow-on",
                                "debentures", "capex", "desdobramento", "grupamento")),
        ("REGULATORY", ("aneel", "anp", "anatel", " ans ", "bacen", "cade", "tarifa", "concessao",
                        "regulat", "licenca")),
        ("GOVERNANCE", ("diretor presidente", " ceo", "conselho de administracao", "renuncia",
                        "acordo de acionistas", "eleicao", "novo mercado")),
    ]
    _POSITIVE = ("premio", "aprovacao", "aprovou", "extraordinario", "recorde", "acima", "favoravel",
                 "absolvi", "reajuste positivo", "crescimento", "recompra", "elevacao", "arquivamento")
    _NEGATIVE = ("multa", "fraude", "perda", "rebaixa", "prejuizo", "condenacao", "suspens", "investigacao",
                 "recuperacao judicial", "queda", "reducao", "negou", "revisao para baixo", "inconsisten",
                 "renuncia", "diluicao", "cancelamento")
    _HIGH = ("bilh", "totalidade", "controle", "extraordinario", "fraude", "recuperacao judicial", "opa")

    _OFFER_RE = re.compile(r"r\$\s*([\d.]+,\d{1,2}|\d+(?:\.\d{1,2})?)\s*(?:\(.*?\)\s*)?por acao", re.I)

    async def complete_json(self, system: str, user: str, schema: dict[str, Any]) -> LLMResponse:
        text = " " + _strip_accents(user.lower()) + " "
        category = "OTHER"
        for cat, keywords in self._CATEGORY_KEYWORDS:
            if any(k in text for k in keywords):
                category = cat
                break

        pos = sum(text.count(k) for k in self._POSITIVE)
        neg = sum(text.count(k) for k in self._NEGATIVE)
        score = 0.0 if pos + neg == 0 else (pos - neg) / (pos + neg)
        high = any(k in text for k in self._HIGH)
        if category == "M&A" and "premio" in text:
            score = max(score, 0.75)
        if category in {"M&A", "LITIGATION"} and high:
            score = max(-1.0, min(1.0, score * 1.2))
        magnitude = "HIGH" if high else ("MEDIUM" if abs(score) >= 0.4 else "LOW")

        price = self._first_price(text)
        offer_price = price if category == "M&A" else None
        dps = price if category == "CAPITAL_ALLOCATION" and ("dividendo" in text or "jcp" in text) else None

        data = {
            "event_category": category,
            "sentiment_score": round(score, 2),
            "magnitude_estimate": magnitude,
            "is_material": magnitude == "HIGH" and abs(score) >= 0.4,
            "actionable_thesis": f"[mock] {category} com viés {'positivo' if score > 0 else 'negativo' if score < 0 else 'neutro'} "
                                 f"(+{pos}/-{neg} termos), magnitude {magnitude}.",
            "offer_price": offer_price,
            "dividend_per_share": dps,
        }
        logger.debug("MockLLMProvider classificou", category=category, score=score)
        return LLMResponse(data=data, model=self.model)

    def _first_price(self, text: str) -> float | None:
        match = self._OFFER_RE.search(text)
        if not match:
            return None
        raw = match.group(1)
        if "," in raw:
            raw = raw.replace(".", "").replace(",", ".")
        try:
            return float(raw)
        except ValueError:
            return None


def build_provider(
    provider: str,
    *,
    anthropic_model: str = "claude-opus-5-5",
    anthropic_effort: str = "low",
    anthropic_fallbacks: bool = True,
    openai_model: str = "gpt-4o-mini",
    max_tokens: int = 1024,
    timeout_s: float = 20.0,
) -> LLMProvider:
    """Fábrica: ``auto`` usa a chave disponível no ambiente, senão ``mock``."""
    import os

    choice = provider.lower()
    if choice == "auto":
        if os.getenv("ANTHROPIC_API_KEY"):
            choice = "anthropic"
        elif os.getenv("OPENAI_API_KEY"):
            choice = "openai"
        else:
            choice = "mock"
            logger.warning("Nenhuma chave de LLM no ambiente; usando MockLLMProvider (heurístico)")
    if choice == "anthropic":
        return AnthropicProvider(
            model=anthropic_model,
            max_tokens=max_tokens,
            effort=anthropic_effort,
            timeout_s=timeout_s,
            enable_fallbacks=anthropic_fallbacks,
        )
    if choice == "openai":
        return OpenAIProvider(model=openai_model, max_tokens=max_tokens, timeout_s=timeout_s)
    if choice == "mock":
        return MockLLMProvider()
    raise ValueError(f"provider desconhecido: {provider!r}")
