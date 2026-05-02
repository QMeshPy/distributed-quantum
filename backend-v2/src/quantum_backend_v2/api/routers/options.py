"""Real options pricing API router."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status

from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.errors.models import not_found
from quantum_backend_v2.api.models.options import (
    OptionsJobResponse,
    OptionsJobSummary,
    OptionsSubmitResponse,
    OptionsJobRequest,
)
from quantum_backend_v2.application.parity import OptionsJobService


def build_options_router(*, options_job_service: OptionsJobService) -> APIRouter:
    """Build the real options pricing router."""
    router = APIRouter(prefix="/api/v1/options", tags=["options"])

    @router.post(
        "/submit",
        response_model=OptionsSubmitResponse,
        status_code=status.HTTP_201_CREATED,
        summary="Submit a real options pricing job",
    )
    async def submit_options_job(
        request: OptionsJobRequest,
        background_tasks: BackgroundTasks,
        current_user: CurrentUser,
    ) -> OptionsSubmitResponse:
        request_payload = request.model_dump()
        record = await options_job_service.submit(
            option_type=request.option_type,
            owner_user_id=current_user.user_id,
            request_payload=request_payload,
        )
        background_tasks.add_task(
            options_job_service.process,
            job_id=record.id,
            request_payload=request_payload,
        )
        return OptionsSubmitResponse(
            job_id=record.id,
            status=record.status,
            option_type=record.option_type,
        )

    @router.get(
        "/{job_id}",
        response_model=OptionsJobResponse,
        summary="Get options job status and results",
    )
    async def get_options_job(
        job_id: str,
        current_user: CurrentUser,
    ) -> OptionsJobResponse:
        record = await options_job_service.get_job(job_id, current_user=current_user)
        if record is None:
            raise not_found("Options job", job_id)

        return OptionsJobResponse(
            job_id=record.id,
            option_type=record.option_type,
            status=record.status,
            error=record.error,
            result=record.result_payload,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    @router.get(
        "",
        response_model=list[OptionsJobSummary],
        summary="List options pricing jobs",
    )
    async def list_options_jobs(
        current_user: CurrentUser,
        limit: int = Query(default=20, ge=1, le=100),
    ) -> list[OptionsJobSummary]:
        records = await options_job_service.list_jobs(current_user=current_user, limit=limit)
        return [
            OptionsJobSummary(
                job_id=record.id,
                option_type=record.option_type,
                status=record.status,
                error=record.error,
                created_at=record.created_at,
                updated_at=record.updated_at,
            )
            for record in records
        ]

    return router
