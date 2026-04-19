"""Top-level application bootstrap."""

from __future__ import annotations

from collections.abc import Mapping

from fastapi import FastAPI

from quantum_backend_v2.api.app import create_app
from quantum_backend_v2.bootstrap.libp2p import create_libp2p_plan, create_libp2p_runtime
from quantum_backend_v2.config import load_settings
from quantum_backend_v2.bootstrap.persistence import create_persistence_runtime
from quantum_backend_v2.observability import configure_logging


def create_application(env: Mapping[str, str] | None = None) -> FastAPI:
    """Build a configured FastAPI application."""
    settings = load_settings(env=env)
    configure_logging(settings.logging)
    persistence_runtime = create_persistence_runtime(settings.persistence)
    libp2p_plan = create_libp2p_plan(settings.libp2p)
    libp2p_runtime = create_libp2p_runtime(settings.libp2p)
    return create_app(
        settings,
        persistence_runtime=persistence_runtime,
        libp2p_plan=libp2p_plan,
        libp2p_runtime=libp2p_runtime,
    )
