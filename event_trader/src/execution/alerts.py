"""AlertDispatcher: formata sinais em Markdown e envia para Telegram/Discord/console."""

from __future__ import annotations

import asyncio
import re
from abc import ABC, abstractmethod

import requests
from loguru import logger

from src.models import B3_TZ, Action, ClassifiedEvent, TradingSignal

_ACTION_EMOJI = {Action.BUY: "🟢", Action.SELL: "🔴", Action.HOLD: "⚪"}
_TG_SPECIAL = re.compile(r"([_*\[\]()~`>#+\-=|{}.!\\])")


def escape_telegram_v2(text: str) -> str:
    """Escapa caracteres reservados do Telegram MarkdownV2."""
    return _TG_SPECIAL.sub(r"\\\1", text)


def _identity(text: str) -> str:
    return text


def format_signal_markdown(classified: ClassifiedEvent, signal: TradingSignal, flavor: str = "standard") -> str:
    """Monta a mensagem rica.

    Args:
        flavor: ``standard`` (Discord/console, Markdown comum) ou ``telegram``
            (MarkdownV2, com escape obrigatório de caracteres especiais).
    """
    esc = escape_telegram_v2 if flavor == "telegram" else _identity
    bold = (lambda s: f"*{esc(s)}*") if flavor == "telegram" else (lambda s: f"**{s}**")
    c = classified.classification
    ts = classified.event.timestamp.astimezone(B3_TZ).strftime("%d/%m/%Y %H:%M:%S") + " (BRT)"

    lines = [
        f"{_ACTION_EMOJI[signal.action]} {bold(f'{signal.action.value} {signal.ticker}')}",
        f"🕒 {bold('Horário:')} {esc(ts)}",
        f"📰 {bold('Manchete:')} {esc(classified.event.headline[:200])}",
        f"🏷️ {bold('Categoria:')} {esc(c.event_category.value)} · {esc(c.magnitude_estimate.value)}"
        f"{esc(' · MATERIAL') if c.is_material else ''}",
        f"📊 {bold('Score:')} {esc(f'{c.sentiment_score:+.2f}')}",
        f"💡 {bold('Tese:')} {esc(c.actionable_thesis)}",
    ]
    if signal.is_actionable:
        lines.append(
            f"🎯 {bold('Sinal:')} {esc(signal.action.value)} · confiança {esc(f'{signal.confidence:.0%}')}"
        )
        risk = f"SL {signal.stop_loss_pct:.2%} · TP {signal.take_profit_pct:.2%}"
        if signal.reference_price:
            risk += f" (ref R$ {signal.reference_price:.2f} → stop R$ {signal.stop_price:.2f}, alvo R$ {signal.target_price:.2f})"
        lines.append(f"🛡️ {bold('Risco:')} {esc(risk)}")
    else:
        lines.append(f"🎯 {bold('Sinal:')} HOLD")
    lines.append(f"🧠 {bold('Racional:')} {esc(signal.reasoning[:600])}")
    lines.append(esc(f"regra {signal.rule_id} · {classified.provider}/{classified.model} · {classified.event.source_id}"))
    return "\n".join(lines)


class AlertChannel(ABC):
    name: str = "channel"
    flavor: str = "standard"

    @abstractmethod
    async def send(self, text: str) -> None:
        """Envia a mensagem já formatada. Levanta exceção em caso de falha."""


class ConsoleChannel(AlertChannel):
    name = "console"

    async def send(self, text: str) -> None:
        bar = "─" * 72
        print(f"\n{bar}\n{text}\n{bar}", flush=True)


class TelegramChannel(AlertChannel):
    """Bot API do Telegram (``sendMessage`` com MarkdownV2)."""

    name = "telegram"
    flavor = "telegram"

    def __init__(self, bot_token: str, chat_id: str, timeout_s: float = 5.0) -> None:
        self._url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        self._chat_id = chat_id
        self._timeout_s = timeout_s

    async def send(self, text: str) -> None:
        payload = {"chat_id": self._chat_id, "text": text[:4096], "parse_mode": "MarkdownV2",
                   "disable_web_page_preview": True}
        await asyncio.to_thread(self._post, payload)

    def _post(self, payload: dict[str, object]) -> None:
        resp = requests.post(self._url, json=payload, timeout=self._timeout_s)
        if resp.status_code != 200:
            raise RuntimeError(f"Telegram HTTP {resp.status_code}: {resp.text[:200]}")


class DiscordChannel(AlertChannel):
    """Webhook do Discord."""

    name = "discord"

    def __init__(self, webhook_url: str, timeout_s: float = 5.0) -> None:
        self._url = webhook_url
        self._timeout_s = timeout_s

    async def send(self, text: str) -> None:
        await asyncio.to_thread(self._post, {"content": text[:2000]})

    def _post(self, payload: dict[str, object]) -> None:
        resp = requests.post(self._url, json=payload, timeout=self._timeout_s)
        if resp.status_code not in (200, 204):
            raise RuntimeError(f"Discord HTTP {resp.status_code}: {resp.text[:200]}")


class AlertDispatcher:
    """Envia para todos os canais em paralelo; a falha de um não afeta os outros.

    Args:
        channels: canais de destino.
        send_holds: se ``False`` (padrão), sinais HOLD não geram alerta.
    """

    def __init__(self, channels: list[AlertChannel], send_holds: bool = False) -> None:
        self.channels = channels
        self.send_holds = send_holds

    async def dispatch(self, classified: ClassifiedEvent, signal: TradingSignal) -> dict[str, bool]:
        """Retorna ``{canal: sucesso}``."""
        if not signal.is_actionable and not self.send_holds:
            return {}
        results = await asyncio.gather(
            *(ch.send(format_signal_markdown(classified, signal, ch.flavor)) for ch in self.channels),
            return_exceptions=True,
        )
        status: dict[str, bool] = {}
        for ch, result in zip(self.channels, results, strict=True):
            ok = not isinstance(result, BaseException)
            status[ch.name] = ok
            if not ok:
                logger.error("Falha ao enviar alerta", channel=ch.name, ticker=signal.ticker, error=str(result))
        return status
