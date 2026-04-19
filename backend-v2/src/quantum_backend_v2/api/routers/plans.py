"""Execution plans API router."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from quantum_backend_v2.application.parity import CircuitJobService
from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.models.plans import ExecutionPlanResponse


def build_plans_router(*, job_service: CircuitJobService) -> APIRouter:
    """Build the execution plans router."""
    router = APIRouter(prefix="/api/v1", tags=["plans"])

    @router.get(
        "/plans/{plan_id}",
        response_model=ExecutionPlanResponse,
        summary="Get execution plan details",
    )
    async def get_plan(
        plan_id: str,
        current_user: CurrentUser,
    ) -> ExecutionPlanResponse:
        plan_record = await job_service.get_plan(plan_id)
        if plan_record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Plan '{plan_id}' not found",
            )

        return ExecutionPlanResponse(**plan_record.payload)

    return router
