"""Financial analysis API router."""

from __future__ import annotations

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import Response

from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.deps.x402_gateway import X402_OWNER_USER_ID, build_x402_gateway_guard
from quantum_backend_v2.api.errors.models import not_found
from quantum_backend_v2.api.finance_download import finance_provenance_download
from quantum_backend_v2.api.models.financial import (
    FinancialComparisonResponse,
    FinancialJobResponse,
    FinancialJobSummary,
    FinancialSubmitResponse,
    TokenizedAssetInfo,
    TokenizedAssetsResponse,
    TokenizedPortfolioRequest,
)
from quantum_backend_v2.application.financial_portfolio import PortfolioOptimizationConfig
from quantum_backend_v2.application.parity import FinancialJobService
from quantum_backend_v2.application.tokenized_portfolio import DATA_SOURCE, DISCLAIMER
from quantum_backend_v2.chains.price_history import MAX_HISTORY_DAYS, MIN_ALIGNED_DAYS, SAMPLING
from quantum_backend_v2.chains.prices import PriceUnavailableError
from quantum_backend_v2.chains.rpc import RpcConfigurationError


def build_financial_router(
    *,
    financial_job_service: FinancialJobService,
    x402_gateway_secret: str | None = None,
) -> APIRouter:
    """Build the financial analysis router."""
    router = APIRouter(prefix="/api/v1/finance", tags=["financial"])

    async def queue_tokenized_job(
        request: TokenizedPortfolioRequest,
        background_tasks: BackgroundTasks,
        owner_user_id: str,
    ) -> FinancialSubmitResponse:
        try:
            record = await financial_job_service.submit_tokenized(
                owner_user_id=owner_user_id,
                symbols=request.symbols,
                start=request.start_date,
                end=request.end_date,
                config=PortfolioOptimizationConfig(
                    budget=request.budget,
                    risk_aversion=request.risk_aversion,
                    max_assets_considered=request.max_assets_considered,
                    qaoa_reps=request.qaoa_reps,
                    date_column="date",
                    value_mode="prices",
                    parameter_search_steps=request.parameter_search_steps,
                ),
            )
        except PriceUnavailableError:
            raise HTTPException(status_code=503, detail="price history is unavailable") from None
        except ValueError as exc:
            # Validation messages are fixed strings that never echo the request.
            raise HTTPException(status_code=422, detail=str(exc)) from None
        background_tasks.add_task(financial_job_service.process, job_id=record.id, csv_bytes=b"")
        return FinancialSubmitResponse(
            job_id=record.id, status=record.status, problem_type="portfolio_optimization"
        )

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
        use_chainlink: bool = Form(default=False),
        investment_usd: float | None = Form(default=None, gt=0, allow_inf_nan=False),
        expected_eth_price: float | None = Form(default=None, gt=0, allow_inf_nan=False),
        budget: int | None = Form(default=None, ge=1),
        risk_aversion: float = Form(default=0.5, ge=0.0, le=10.0),
        max_assets_considered: int = Form(default=6, ge=2, le=8),
        qaoa_reps: int = Form(default=1, ge=1, le=4),
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

        if use_chainlink and (investment_usd is None or expected_eth_price is None):
            raise HTTPException(
                status_code=422, detail="live valuation requires investment and expected ETH price"
            )
        valuation = None
        if use_chainlink:
            valuation = {
                "current_value": expected_eth_price,
                "investment_usd": investment_usd,
                "chainlink_price": {"network": "ethereum-sepolia", "feed": "eth-usd"},
            }
        try:
            record = await financial_job_service.submit(
                filename=file.filename,
                valuation=valuation,
                csv_bytes=csv_bytes if use_chainlink else None,
                owner_user_id=current_user.user_id,
                problem_type=problem_type,
                config=PortfolioOptimizationConfig(
                    budget=budget,
                    risk_aversion=risk_aversion,
                    max_assets_considered=max_assets_considered,
                    qaoa_reps=qaoa_reps,
                    date_column=date_column,
                    ticker_column=ticker_column,
                    value_column=value_column,
                    value_mode=value_mode,
                    parameter_search_steps=parameter_search_steps,
                ),
            )
        except (PriceUnavailableError, RpcConfigurationError):
            raise HTTPException(status_code=503, detail="price feed is unavailable") from None
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from None
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
        "/tokenized-assets",
        response_model=TokenizedAssetsResponse,
        summary="List Robinhood tokenized stocks available for analysis",
    )
    async def list_tokenized_assets(current_user: CurrentUser) -> TokenizedAssetsResponse:
        market_data = financial_job_service.tokenized_market_data
        if market_data is None:
            raise HTTPException(status_code=503, detail="price history is unavailable")
        return TokenizedAssetsResponse(
            chain_id=market_data.chain_id,
            display_name=market_data.display_name,
            data_source=DATA_SOURCE,
            price_unit="token_usd",
            sampling=SAMPLING,
            min_aligned_days=MIN_ALIGNED_DAYS,
            max_history_days=MAX_HISTORY_DAYS,
            disclaimer=DISCLAIMER,
            assets=[
                TokenizedAssetInfo(
                    symbol=asset.symbol,
                    name=asset.name,
                    isin=asset.isin,
                    token_address=asset.token_address,
                    feed_address=asset.feed_address,
                )
                for asset in market_data.assets
            ],
        )

    @router.post(
        "/tokenized-portfolio",
        response_model=FinancialSubmitResponse,
        status_code=status.HTTP_201_CREATED,
        summary="Optimize Robinhood tokenized stocks from Chainlink price history",
    )
    async def submit_tokenized_portfolio(
        request: TokenizedPortfolioRequest,
        background_tasks: BackgroundTasks,
        current_user: CurrentUser,
    ) -> FinancialSubmitResponse:
        return await queue_tokenized_job(request, background_tasks, current_user.user_id)

    @router.get(
        "/{job_id}",
        response_model=FinancialJobResponse,
        summary="Get financial job status and results",
    )
    async def get_financial_job(
        job_id: str,
        current_user: CurrentUser,
        result_detail: str = Query(default="full", pattern="^(full|summary)$"),
        download: str | None = Query(default=None, pattern="^provenance$"),
    ) -> FinancialJobResponse | Response:
        record = await financial_job_service.get_job(job_id, current_user=current_user)
        if record is None:
            raise not_found("Financial job", job_id)

        if download == "provenance":
            return finance_provenance_download(record.result_payload)

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

    if x402_gateway_secret is not None:
        require_x402_gateway = build_x402_gateway_guard(x402_gateway_secret)

        @router.post(
            "/internal/x402/submit",
            response_model=FinancialSubmitResponse,
            status_code=status.HTTP_201_CREATED,
            include_in_schema=False,
        )
        async def submit_x402_financial_job(
            request: TokenizedPortfolioRequest,
            background_tasks: BackgroundTasks,
            _: None = Depends(require_x402_gateway),
        ) -> FinancialSubmitResponse:
            return await queue_tokenized_job(request, background_tasks, X402_OWNER_USER_ID)

        @router.get(
            "/internal/x402/jobs/{job_id}",
            response_model=FinancialJobResponse,
            include_in_schema=False,
        )
        async def get_x402_financial_job(
            job_id: str,
            _: None = Depends(require_x402_gateway),
        ) -> FinancialJobResponse:
            record = await financial_job_service.get_job_for_owner(
                job_id,
                owner_user_id=X402_OWNER_USER_ID,
            )
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
                result=financial_job_service.get_result_payload(record, detail="full"),
                created_at=record.created_at,
                updated_at=record.updated_at,
            )

    return router
