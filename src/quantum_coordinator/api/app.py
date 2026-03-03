"""FastAPI application assembly."""

from __future__ import annotations

import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from quantum_coordinator import __version__
from quantum_coordinator.config.models import AppConfig


class HealthResponse(BaseModel):
    """Response payload for health checks."""

    status: str
    service: str
    version: str
    environment: str
    uptime_seconds: float


def create_app(config: AppConfig) -> FastAPI:
    """Create and configure FastAPI app instance."""
    app = FastAPI(
        title="Quantum Libp2p Coordinator",
        version=__version__,
        docs_url="/docs",
        redoc_url="/redoc",
    )
    app.state.started_monotonic = time.monotonic()
    app.state.config = config

    if config.api.enable_cors:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=config.api.cors_origins,
            allow_methods=["*"],
            allow_headers=["*"],
            allow_credentials=True,
        )

    @app.get("/api/v1/health", response_model=HealthResponse, tags=["system"])
    async def health() -> HealthResponse:
        uptime = time.monotonic() - app.state.started_monotonic
        return HealthResponse(
            status="ok",
            service=config.logging.service_name,
            version=__version__,
            environment=config.environment,
            uptime_seconds=uptime,
        )

    return app
