"""FastAPI application assembly."""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from quantum_backend_v2 import __version__
from quantum_backend_v2.api.routers import discovery_router, system_router
from quantum_backend_v2.config import AppSettings
from quantum_backend_v2.discovery.service import DiscoveryService
from quantum_backend_v2.libp2p import Libp2pBootstrapPlan, Libp2pRuntime
from quantum_backend_v2.persistence import PersistenceRuntime


def create_app(
    settings: AppSettings,
    *,
    persistence_runtime: PersistenceRuntime,
    libp2p_plan: Libp2pBootstrapPlan,
    libp2p_runtime: Libp2pRuntime,
    discovery_service: DiscoveryService,
) -> FastAPI:
    """Create the backend-v2 FastAPI application."""
    started_monotonic = time.monotonic()

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> Any:
        await persistence_runtime.startup()
        # Start the discovery service after persistence is ready so MongoDB
        # document upserts can happen from the first received event.
        discovery_service.start()
        try:
            yield
        finally:
            await discovery_service.stop()
            await persistence_runtime.shutdown()

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
    app.include_router(
        discovery_router(discovery_service=discovery_service)
    )
    return app
