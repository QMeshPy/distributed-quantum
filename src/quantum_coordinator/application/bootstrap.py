"""Application bootstrap utilities."""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path

from fastapi import FastAPI

from quantum_coordinator.api.app import create_app
from quantum_coordinator.config.loader import load_config
from quantum_coordinator.observability import configure_logging


def create_application(
    config_path: str | Path | None = None,
    env: Mapping[str, str] | None = None,
) -> FastAPI:
    """Build the configured FastAPI application."""
    config = load_config(path=config_path, env=env)
    configure_logging(config.logging)
    return create_app(config)
