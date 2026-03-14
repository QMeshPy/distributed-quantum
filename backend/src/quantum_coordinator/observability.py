"""Logging and observability setup."""

from __future__ import annotations

import logging
import sys
from typing import Any

from quantum_coordinator.config.models import LoggingConfig

try:
    import structlog
except ModuleNotFoundError:  # pragma: no cover - fallback path for minimal envs
    structlog = None  # type: ignore[assignment]


def configure_logging(config: LoggingConfig) -> None:
    """Configure structured logging for the coordinator process."""
    level = getattr(logging, config.level.upper(), logging.INFO)

    logging.basicConfig(
        level=level,
        format="%(message)s",
        stream=sys.stdout,
    )

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
