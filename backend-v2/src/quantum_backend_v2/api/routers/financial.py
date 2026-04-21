"""Financial analysis API router."""

from __future__ import annotations

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)

from quantum_backend_v2.application.financial_portfolio import PortfolioOptimizationConfig
from quantum_backend_v2.application.parity import FinancialJobService
from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.errors.models import not_found
from quantum_backend_v2.api.models.financial import (
    FinancialJobResponse,
    FinancialJobSummary,
    FinancialComparisonResponse,
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
        current_user: CurrentUser,
        file: UploadFile = File(...),
        problem_type: str = Form(default="portfolio_optimization"),
        budget: int | None = Form(default=None, ge=1),
        risk_aversion: float = Form(default=0.5, ge=0.0, le=10.0),
        max_assets_considered: int = Form(default=6, ge=2, le=8),
        date_column: str | None = Form(default=None),
        ticker_column: str | None = Form(default=None),
        value_column: str | None = Form(default=None),
        value_mode: str = Form(default="auto"),
        parameter_search_steps: int = Form(default=9, ge=3, le=25),
    ) -> FinancialSubmitResponse:
        if not file.filename or not file.filename.lower().endswith(".csv"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only CSV files are accepted",
            )
        if problem_type != "portfolio_optimization":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only problem_type=portfolio_optimization is supported right now.",
            )

        csv_bytes = await file.read()
        if len(csv_bytes) > 50 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="CSV file too large (max 50 MB)",
            )

        record = await financial_job_service.submit(
            filename=file.filename,
            owner_user_id=current_user.user_id,
            problem_type=problem_type,
            config=PortfolioOptimizationConfig(
                budget=budget,
                risk_aversion=risk_aversion,
                max_assets_considered=max_assets_considered,
                date_column=date_column,
                ticker_column=ticker_column,
                value_column=value_column,
                value_mode=value_mode,
                parameter_search_steps=parameter_search_steps,
            ),
        )
        background_tasks.add_task(
            financial_job_service.process,
            job_id=record.id,
            csv_bytes=csv_bytes,
        )
        return FinancialSubmitResponse(
            job_id=record.id,
            status=record.status,
            problem_type=financial_job_service.get_problem_type(record) or problem_type,
        )

    @router.get(
        "/{job_id}",
        response_model=FinancialJobResponse,
        summary="Get financial job status and results",
    )
    async def get_financial_job(
        job_id: str,
        current_user: CurrentUser,
        result_detail: str = Query(default="full", pattern="^(full|summary)$"),
    ) -> FinancialJobResponse:
        record = await financial_job_service.get_job(job_id, current_user=current_user)
        if record is None:
            raise not_found("Financial job", job_id)

        return FinancialJobResponse(
            job_id=record.id,
            filename=record.filename,
            problem_type=financial_job_service.get_problem_type(record),
            status=record.status,
            row_count=record.row_count,
            col_count=record.col_count,
            error=record.error,
            result=financial_job_service.get_result_payload(record, detail=result_detail),
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    @router.get(
        "/{job_id}/comparison",
        response_model=FinancialComparisonResponse,
        summary="Get quantum-vs-classical comparison report for a finance job",
    )
    async def get_financial_comparison(
        job_id: str,
        current_user: CurrentUser,
    ) -> FinancialComparisonResponse:
        record = await financial_job_service.get_job(job_id, current_user=current_user)
        if record is None:
            raise not_found("Financial job", job_id)

        comparison_payload = financial_job_service.get_comparison_payload(record)
        if comparison_payload is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Comparison report is only available after the finance job completes.",
            )

        return FinancialComparisonResponse.model_validate(comparison_payload)

    @router.get(
        "",
        response_model=list[FinancialJobSummary],
        summary="List financial jobs",
    )
    async def list_financial_jobs(
        current_user: CurrentUser,
        limit: int = Query(default=20, ge=1, le=100),
    ) -> list[FinancialJobSummary]:
        records = await financial_job_service.list_jobs(current_user=current_user, limit=limit)
        return [
            FinancialJobSummary(
                job_id=record.id,
                filename=record.filename,
                problem_type=financial_job_service.get_problem_type(record),
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
