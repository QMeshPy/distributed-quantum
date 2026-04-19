"""Financial analysis API router."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, UploadFile, status

from quantum_backend_v2.application.parity import FinancialJobService
from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.errors.models import not_found
from quantum_backend_v2.api.models.financial import (
    FinancialJobResponse,
    FinancialJobSummary,
    FinancialSubmitResponse,
)


def build_financial_router(*, financial_job_service: FinancialJobService) -> APIRouter:
    """Build the financial analysis router."""
    router = APIRouter(prefix="/api/v1/finance", tags=["financial"])

    @router.post(
        "/submit",
        response_model=FinancialSubmitResponse,
        status_code=status.HTTP_201_CREATED,
        summary="Submit financial CSV for quantum analysis",
    )
    async def submit_financial_csv(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        current_user: CurrentUser | None = None,
    ) -> FinancialSubmitResponse:
        if not file.filename or not file.filename.lower().endswith(".csv"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only CSV files are accepted",
            )

        csv_bytes = await file.read()
        if len(csv_bytes) > 50 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="CSV file too large (max 50 MB)",
            )

        record = await financial_job_service.submit(
            filename=file.filename,
            owner_user_id=None if current_user is None else current_user.user_id,
        )
        background_tasks.add_task(
            financial_job_service.process,
            job_id=record.id,
            csv_bytes=csv_bytes,
        )
        return FinancialSubmitResponse(job_id=record.id, status=record.status)

    @router.get(
        "/{job_id}",
        response_model=FinancialJobResponse,
        summary="Get financial job status and results",
    )
    async def get_financial_job(
        job_id: str,
        current_user: CurrentUser,
    ) -> FinancialJobResponse:
        record = await financial_job_service.get_job(job_id)
        if record is None:
            raise not_found("Financial job", job_id)

        return FinancialJobResponse(
            job_id=record.id,
            filename=record.filename,
            status=record.status,
            row_count=record.row_count,
            col_count=record.col_count,
            error=record.error,
            result=record.result_payload,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    @router.get(
        "",
        response_model=list[FinancialJobSummary],
        summary="List financial jobs",
    )
    async def list_financial_jobs(
        current_user: CurrentUser,
        limit: int = Query(default=20, ge=1, le=100),
    ) -> list[FinancialJobSummary]:
        records = await financial_job_service.list_jobs(limit=limit)
        return [
            FinancialJobSummary(
                job_id=record.id,
                filename=record.filename,
                status=record.status,
                row_count=record.row_count,
                col_count=record.col_count,
                error=record.error,
                created_at=record.created_at,
                updated_at=record.updated_at,
            )
            for record in records
        ]

    return router
