"""FastAPI application assembly."""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.responses import RedirectResponse, Response

from quantum_backend_v2 import __version__
from quantum_backend_v2.application.parity import CircuitJobService, FinancialJobService
from quantum_backend_v2.api.deps.auth import configure_auth
from quantum_backend_v2.api.errors import register_exception_handlers
from quantum_backend_v2.api.routers import discovery_router, system_router
from quantum_backend_v2.api.routers.circuits import build_circuits_router
from quantum_backend_v2.api.routers.enrollment import build_enrollment_router
from quantum_backend_v2.api.routers.financial import build_financial_router
from quantum_backend_v2.api.routers.plans import build_plans_router
from quantum_backend_v2.api.routers.reservations import build_reservations_router
from quantum_backend_v2.api.routers.services import build_services_router
from quantum_backend_v2.api.routers.workflows import build_workflows_router
from quantum_backend_v2.config import AppSettings
from quantum_backend_v2.discovery.service import DiscoveryService
from quantum_backend_v2.libp2p import Libp2pBootstrapPlan, Libp2pRuntime
from quantum_backend_v2.persistence import PersistenceRuntime
from quantum_backend_v2.reservations.service import ReservationService


def create_app(
    settings: AppSettings,
    *,
    persistence_runtime: PersistenceRuntime,
    libp2p_plan: Libp2pBootstrapPlan,
    libp2p_runtime: Libp2pRuntime,
    discovery_service: DiscoveryService,
    circuit_job_service: CircuitJobService | None,
    financial_job_service: FinancialJobService | None,
    reservation_service: ReservationService | None = None,
) -> FastAPI:
    """Create the backend-v2 FastAPI application."""
    configure_auth(enabled=settings.auth_required)
    started_monotonic = time.monotonic()

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> Any:
        await persistence_runtime.startup()
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

    @app.get("/", include_in_schema=False)
    async def root() -> RedirectResponse:
        return RedirectResponse(url="/docs")

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon() -> Response:
        return Response(status_code=204)

    register_exception_handlers(app)

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
    app.include_router(discovery_router(discovery_service=discovery_service))
    app.include_router(
        build_enrollment_router(session_factory=persistence_runtime.postgres_session_factory)
    )
    app.include_router(
        build_workflows_router(session_factory=persistence_runtime.postgres_session_factory)
    )
    if circuit_job_service is not None:
        app.include_router(build_circuits_router(job_service=circuit_job_service))
    app.include_router(build_services_router(discovery_service=discovery_service))
    if circuit_job_service is not None:
        app.include_router(build_plans_router(job_service=circuit_job_service))
    if financial_job_service is not None:
        app.include_router(build_financial_router(financial_job_service=financial_job_service))

    if reservation_service is not None:
        app.include_router(build_reservations_router(reservation_service=reservation_service))

    return app
