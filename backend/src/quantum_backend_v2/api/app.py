"""FastAPI application assembly."""

from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response

from quantum_backend_v2 import __version__
from quantum_backend_v2.application.parity import CircuitJobService, FinancialJobService, RiskJobService
from quantum_backend_v2.api.deps.auth import configure_auth
from quantum_backend_v2.api.errors import register_exception_handlers
from quantum_backend_v2.api.routers import discovery_router, system_router
from quantum_backend_v2.api.routers.circuits import build_circuits_router
from quantum_backend_v2.api.routers.enrollment import build_enrollment_router
from quantum_backend_v2.api.routers.financial import build_financial_router
from quantum_backend_v2.api.routers.options import build_options_router
from quantum_backend_v2.api.routers.risk import build_risk_router
from quantum_backend_v2.api.routers.plans import build_plans_router
from quantum_backend_v2.api.routers.reservations import build_reservations_router
from quantum_backend_v2.api.routers.services import build_services_router
from quantum_backend_v2.api.routers.workflows import build_workflows_router
from quantum_backend_v2.api.benchmark import router as benchmark_router
from quantum_backend_v2.api.routers.pharma import router as pharma_router
from quantum_backend_v2.api.routers.agent import router as agent_router

# AgentKit integration routers (new v1 API routers)
from api.v1.wallet import router as wallet_router
from api.v1.agents import router as agents_router
from api.v1.proposals import router as proposals_router
from api.v1.notifications import router as notifications_router
from api.v1.marketplace import router as marketplace_router
from api.v1.chat_sessions import router as chat_sessions_router
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
    risk_job_service: RiskJobService | None = None,
    reservation_service: ReservationService | None = None,
    runtime_recovery_service: RuntimeRecoveryService | None = None,
) -> FastAPI:
    """Create the backend FastAPI application."""
    configure_auth(
        enabled=settings.auth_required,
        allow_dev_bearer_tokens=settings.allow_dev_bearer_tokens,
    )
    started_monotonic = time.monotonic()

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

    cors_origins_env = os.getenv("CORS_ORIGINS", "")
    if cors_origins_env:
        cors_origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]
    else:
        cors_origins = [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
        ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
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
    app.include_router(build_enrollment_router())
    app.include_router(
        build_workflows_router(mongo_runtime=persistence_runtime.mongodb)
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
    if risk_job_service is not None:
        app.include_router(build_risk_router(risk_job_service=risk_job_service))
    if reservation_service is not None:
        app.include_router(
            build_reservations_router(reservation_service=reservation_service)
        )

    app.include_router(benchmark_router)
    app.include_router(pharma_router)
    app.include_router(agent_router)

    # Register AgentKit integration routers (v1 API)
    app.include_router(wallet_router)
    app.include_router(agents_router)
    app.include_router(proposals_router)
    app.include_router(notifications_router)
    app.include_router(marketplace_router)
    app.include_router(chat_sessions_router)

    return app
