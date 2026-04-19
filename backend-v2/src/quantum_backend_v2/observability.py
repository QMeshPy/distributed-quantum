"""Logging bootstrap for backend v2."""

from __future__ import annotations

import logging
import sys
from typing import Any

from quantum_backend_v2.config import LoggingSettings

try:
    import structlog
except ModuleNotFoundError:  # pragma: no cover
    structlog = None  # type: ignore[assignment]


def configure_logging(config: LoggingSettings) -> None:
    """Configure structured logging for backend-v2."""
    level = getattr(logging, config.level.upper(), logging.INFO)
    logging.basicConfig(level=level, format="%(message)s", stream=sys.stdout, force=True)

    if structlog is None:
        return

    processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]
    if config.json_logs:
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=processors,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
