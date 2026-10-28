"""Logging estruturado com loguru.

Em produção use ``LOG_JSON=1``: cada linha vira um objeto JSON com os campos
``extra`` (ticker, hash_id, latency_ms...), pronto para Loki/Datadog/ELK.
"""

from __future__ import annotations

import sys

from loguru import logger


def setup_logging(level: str = "INFO", json_output: bool = False) -> None:
    """Reconfigura o sink padrão do loguru.

    Args:
        level: nível mínimo de log.
        json_output: se ``True`` serializa cada registro como JSON.
    """
    logger.remove()
    if json_output:
        logger.add(sys.stderr, level=level, serialize=True, enqueue=True)
        return
    logger.add(
        sys.stderr,
        level=level,
        enqueue=True,
        format=(
            "<green>{time:HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | "
            "<cyan>{name}</cyan>:<cyan>{line}</cyan> - <level>{message}</level> "
            "<dim>{extra}</dim>"
        ),
    )
