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
from quantum_backend_v2.api.routers.options import build_options_router
from quantum_backend_v2.api.routers.plans import build_plans_router
from quantum_backend_v2.api.routers.reservations import build_reservations_router
from quantum_backend_v2.api.routers.services import build_services_router
from quantum_backend_v2.api.routers.workflows import build_workflows_router
from quantum_backend_v2.api.benchmark import router as benchmark_router
from quantum_backend_v2.config import AppSettings
from quantum_backend_v2.discovery.service import DiscoveryService
from quantum_backend_v2.libp2p import Libp2pBootstrapPlan, Libp2pRuntime
from quantum_backend_v2.persistence import PersistenceRuntime
from quantum_backend_v2.reservations.service import ReservationService
from quantum_backend_v2.runtime.recovery import RuntimeRecoveryService


def create_app(
    settings: AppSettings,
    *,
    persistence_runtime: PersistenceRuntime,
    libp2p_plan: Libp2pBootstrapPlan,
    libp2p_runtime: Libp2pRuntime,
    discovery_service: DiscoveryService,
    circuit_job_service: CircuitJobService | None,
    financial_job_service: FinancialJobService | None,
    options_job_service: Any | None = None,
    reservation_service: ReservationService | None = None,
    runtime_recovery_service: RuntimeRecoveryService | None = None,
) -> FastAPI:
    """Create the backend-v2 FastAPI application."""
    configure_auth(
        enabled=settings.auth_required,
        allow_dev_bearer_tokens=settings.allow_dev_bearer_tokens,
    )
    started_monotonic = time.monotonic()
    postgres_session_factory = persistence_runtime.postgres_session_factory

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> Any:
        await persistence_runtime.startup()
        if runtime_recovery_service is not None:
            open_reservations = await runtime_recovery_service.recover_open_reservations()
            in_flight_executions = await runtime_recovery_service.recover_in_flight_executions()
            app.state.runtime_recovery = {
                "open_reservations": open_reservations,
                "in_flight_executions": in_flight_executions,
            }
        else:
            app.state.runtime_recovery = {
                "open_reservations": [],
                "in_flight_executions": [],
            }

        await discovery_service.start()
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
    if postgres_session_factory is not None:
        app.include_router(
            build_enrollment_router(session_factory=postgres_session_factory)
        )
        app.include_router(
            build_workflows_router(
                session_factory=postgres_session_factory,
                mongo_runtime=persistence_runtime.mongodb,
            )
        )
    if circuit_job_service is not None:
        app.include_router(build_circuits_router(job_service=circuit_job_service))
    app.include_router(build_services_router(discovery_service=discovery_service))
    if circuit_job_service is not None:
        app.include_router(build_plans_router(job_service=circuit_job_service))
    if financial_job_service is not None:
        app.include_router(build_financial_router(financial_job_service=financial_job_service))
    if options_job_service is not None:
        app.include_router(build_options_router(options_job_service=options_job_service))

    if reservation_service is not None and postgres_session_factory is not None:
        app.include_router(
            build_reservations_router(
                reservation_service=reservation_service,
                session_factory=postgres_session_factory,
            )
        )

    # Benchmark endpoint - no dependencies, uses core portfolio optimization
    app.include_router(benchmark_router)

    return app
