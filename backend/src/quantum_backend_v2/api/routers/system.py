"""System routes."""

from __future__ import annotations

import time

from fastapi import APIRouter, Response, status

from quantum_backend_v2.api.models import HealthResponse, ReadinessResponse
from quantum_backend_v2.libp2p import Libp2pBootstrapPlan, Libp2pRuntime, Libp2pRuntimeSummary
from quantum_backend_v2.persistence import (
    PersistenceMode,
    PersistenceReadiness,
    PersistenceRuntime,
)


def build_router(
    *,
    service_name: str,
    environment: str,
    started_monotonic: float,
    version: str,
    persistence_runtime: PersistenceRuntime,
    libp2p_plan: Libp2pBootstrapPlan,
    libp2p_runtime: Libp2pRuntime,
) -> APIRouter:
    """Build the system router."""
    router = APIRouter(prefix="/api/v1", tags=["system"])

    @router.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            service=service_name,
            environment=environment,
            version=version,
            uptime_seconds=time.monotonic() - started_monotonic,
            persistence=persistence_runtime.snapshot(),
        )

    @router.get("/ready", response_model=ReadinessResponse)
    async def ready(response: Response) -> ReadinessResponse:
        persistence = await persistence_runtime.probe()
        ready_status = "ready"
        if _has_unavailable_dependency(persistence):
            ready_status = "degraded"
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ReadinessResponse(
            status=ready_status,
            service=service_name,
            environment=environment,
            version=version,
            persistence=persistence,
        )

    @router.get("/bootstrap/libp2p", response_model=Libp2pBootstrapPlan)
    async def bootstrap_plan() -> Libp2pBootstrapPlan:
        return libp2p_plan

    @router.get("/bootstrap/libp2p/runtime", response_model=Libp2pRuntimeSummary)
    async def bootstrap_runtime() -> Libp2pRuntimeSummary:
        return libp2p_runtime.summary()

    return router


def _has_unavailable_dependency(persistence: PersistenceReadiness) -> bool:
    return persistence.mongodb.mode == PersistenceMode.UNAVAILABLE
