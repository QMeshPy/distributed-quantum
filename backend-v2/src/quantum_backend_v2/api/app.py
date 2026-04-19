"""FastAPI application assembly."""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from quantum_backend_v2 import __version__
from quantum_backend_v2.api.routers import system_router
from quantum_backend_v2.config import AppSettings
from quantum_backend_v2.libp2p import Libp2pBootstrapPlan, Libp2pRuntime
from quantum_backend_v2.persistence import PersistenceRuntime


def create_app(
    settings: AppSettings,
    *,
    persistence_runtime: PersistenceRuntime,
    libp2p_plan: Libp2pBootstrapPlan,
    libp2p_runtime: Libp2pRuntime,
) -> FastAPI:
    """Create the backend-v2 FastAPI application."""
    started_monotonic = time.monotonic()

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> Any:
        await persistence_runtime.startup()
        try:
            yield
        finally:
            await persistence_runtime.shutdown()
            await libp2p_runtime.host.close()

    app = FastAPI(
        title="Quantum Backend V2",
        version=__version__,
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )
    app.include_router(
        system_router(
            service_name=settings.service_name,
            environment=settings.environment,
            started_monotonic=started_monotonic,
            version=__version__,
            persistence_runtime=persistence_runtime,
            libp2p_plan=libp2p_plan,
            libp2p_runtime=libp2p_runtime,
        )
    )
    return app
