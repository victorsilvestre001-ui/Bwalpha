"""ContextualAI: transforma o sinal quantitativo numa tese em linguagem natural.

Chama o Claude (Anthropic) de forma assíncrona e devolve `thesis_text` e
`risk_warning`. Sem credencial, ou se a API falhar, usa uma tese gerada por
regras para a demo continuar funcionando.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal, Sequence

import anthropic

from app.engine.index_engine import PillarScore
from app.engine.signals import VOL_THRESHOLD, Action

log = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-opus-5-5"

SYSTEM_PROMPT = (
    "Você é um analista de mercado sênior focado no Ibovespa. Com base nos dados técnicos "
    "fornecidos (Index_Score, Top Drivers, Fluxo Estrangeiro), escreva uma tese de investimento "
    "de 3 frases. A tese deve explicar o 'porquê' do sinal (BUY/SELL/HOLD) e citar os ativos que "
    "mais pesaram na decisão. Use linguagem profissional, mas acessível para traders.\n\n"
    "Além da tese, escreva um `risk_warning`: um alerta de risco curto (uma frase) e específico "
    "ao contexto, por exemplo \"Atenção: alta correlação com petróleo\". Responda em português."
)

OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "thesis_text": {"type": "string", "description": "Tese de exatamente 3 frases."},
        "risk_warning": {"type": "string", "description": "Alerta de risco de uma frase."},
    },
    "required": ["thesis_text", "risk_warning"],
    "additionalProperties": False,
}

OIL_NAMES = {"PETR4", "PETR3", "PRIO3"}
BANK_NAMES = {"ITUB4", "BBDC4", "BBAS3", "ITSA4", "BPAC11"}
RATE_SENSITIVE = {"B3SA3", "RENT3", "RDOR3", "ELET3", "EQTL3", "SBSP3", "TAEE11"}


@dataclass(frozen=True)
class ThesisInput:
    index_score: float
    action: Action
    confidence: float
    top_drivers: Sequence[PillarScore]
    foreign_flow: float
    vix: float
    macro_scenario: str


@dataclass(frozen=True)
class ThesisResult:
    thesis_text: str
    risk_warning: str
    source: Literal["llm", "fallback"]
    model: str | None = None
    generated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _br(value: float, digits: int = 2, sign: bool = True) -> str:
    """Formata número no padrão brasileiro (1.234,56)."""
    text = f"{value:{'+' if sign else ''},.{digits}f}"
    return text.replace(",", "_").replace(".", ",").replace("_", ".")


class ContextualAI:
    def __init__(
        self,
        client: anthropic.AsyncAnthropic | None = None,
        model: str | None = None,
        enabled: bool | None = None,
    ) -> None:
        self.model = model or os.getenv("INDEXALPHA_MODEL", DEFAULT_MODEL)
        if enabled is None:
            enabled = os.getenv("INDEXALPHA_AI", "on").lower() != "off"
        self._client: anthropic.AsyncAnthropic | None = None
        if enabled:
            try:
                self._client = client or anthropic.AsyncAnthropic(timeout=30.0, max_retries=1)
            except anthropic.AnthropicError as exc:
                log.warning("ContextualAI sem cliente Anthropic (%s); usando tese por regras", exc)

    @property
    def llm_enabled(self) -> bool:
        return self._client is not None

    async def generate(self, data: ThesisInput) -> ThesisResult:
        if self._client is None:
            return self.fallback(data)
        try:
            response = await self._client.beta.messages.create(
                model=self.model,
                max_tokens=2000,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": self._build_prompt(data)}],
                output_config={
                    # Tese curta e recorrente: esforço baixo mantém latência e custo sob controle.
                    "effort": "low",
                    "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA},
                },
                # Se o modelo recusar, a API refaz o pedido num modelo de reserva.
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
            log.warning("Credencial Anthropic inválida (%s); desativando o LLM", exc)
            self._client = None
            return self.fallback(data)
        except anthropic.RateLimitError:
            log.warning("Rate limit na API Anthropic; usando tese por regras neste ciclo")
            return self.fallback(data)
        except anthropic.APIStatusError as exc:
            log.warning("Erro %s da API Anthropic: %s", exc.status_code, exc.message)
            return self.fallback(data)
        except anthropic.APIConnectionError as exc:
            log.warning("Falha de conexão com a API Anthropic: %s", exc)
            return self.fallback(data)
        except TypeError as exc:
            # O SDK levanta TypeError quando não encontra nenhuma credencial.
            log.warning("Sem credencial Anthropic (%s); desativando o LLM", exc)
            self._client = None
            return self.fallback(data)

        if response.stop_reason in ("refusal", "max_tokens"):
            log.warning("Resposta do LLM incompleta (stop_reason=%s)", response.stop_reason)
            return self.fallback(data)

        text = "".join(block.text for block in response.content if block.type == "text")
        try:
            parsed = json.loads(text)
            thesis, warning = str(parsed["thesis_text"]).strip(), str(parsed["risk_warning"]).strip()
        except (json.JSONDecodeError, KeyError, TypeError):
            log.warning("Resposta do LLM fora do formato esperado")
            return self.fallback(data)

        return ThesisResult(thesis_text=thesis, risk_warning=warning, source="llm", model=response.model)

    @staticmethod
    def _build_prompt(data: ThesisInput) -> str:
        drivers = "\n".join(
            f"- {p.ticker} ({p.sector}): peso {p.weight * 100:.1f}%, Z-Score {p.z_score:+.2f}, "
            f"contribuição {p.contribution:+.3f}, variação no dia {p.change_pct:+.2f}%"
            for p in data.top_drivers
        )
        return (
            f"Sinal: {data.action.value} (confiança {data.confidence * 100:.0f}%)\n"
            f"Index_Score: {data.index_score:+.2f} (escala -1 a +1; limiar de entrada ±0,50)\n"
            f"Top Drivers (maior |peso × Z-Score|):\n{drivers}\n"
            f"Fluxo estrangeiro líquido: R$ {data.foreign_flow:+,.0f} mi\n"
            f"Volatilidade implícita: {data.vix:.1f}% (filtro de risco acima de {VOL_THRESHOLD:.0f}%)\n"
            f"Cenário macro: {data.macro_scenario}"
        )

    @staticmethod
    def fallback(data: ThesisInput) -> ThesisResult:
        """Tese determinística usada quando o LLM não está disponível."""
        names = ", ".join(f"{p.ticker} (Z {_br(p.z_score)})" for p in data.top_drivers) or "nenhum ativo"
        flow_dir = "comprador" if data.foreign_flow > 0 else "vendedor"
        tone = {
            Action.BUY: "viés comprador para o WIN",
            Action.SELL: "viés vendedor para o WIN",
            Action.HOLD: "ausência de vantagem estatística clara, por isso o sinal é HOLD",
        }[data.action]

        thesis = (
            f"O Index_Score em {_br(data.index_score)} indica {tone}. "
            f"Os pilares que mais pesaram foram {names}, que concentram a maior parte do desvio "
            f"ponderado do índice. O estrangeiro está {flow_dir} (R$ {_br(data.foreign_flow, 0)} mi) "
            f"num contexto de \"{data.macro_scenario}\"."
        )

        drivers = {p.ticker for p in data.top_drivers}
        if data.vix > VOL_THRESHOLD:
            warning = (
                f"Atenção: volatilidade implícita em {_br(data.vix, 1, sign=False)}%; "
                "confiança reduzida pela metade."
            )
        elif drivers & OIL_NAMES:
            warning = "Atenção: alta correlação com petróleo; acompanhe o Brent."
        elif "VALE3" in drivers:
            warning = "Atenção: sinal dependente do minério de ferro e de notícias da China."
        elif drivers & BANK_NAMES:
            warning = "Atenção: bancos lideram o movimento; sensível à curva de juros e ao Copom."
        elif drivers & RATE_SENSITIVE:
            warning = "Atenção: ativos sensíveis a juros dominam; dados de inflação podem reverter o sinal."
        else:
            warning = "Atenção: sinal disperso entre setores; confirme com o fluxo antes de entrar."

        return ThesisResult(thesis_text=thesis, risk_warning=warning, source="fallback")
