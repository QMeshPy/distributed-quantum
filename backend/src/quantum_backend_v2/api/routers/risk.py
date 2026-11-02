"""Quantum Risk Engine API router — Track D."""

from __future__ import annotations

import csv
import io
import math
from datetime import date

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
from quantum_backend_v2.api.models.risk import (
    CreditAsset,
    EquityHolding,
    RiskJobRequest,
    RiskJobResponse,
    RiskJobSummary,
    RiskSubmitResponse,
)
from quantum_backend_v2.api.models.wallet_portfolio import (
    WalletPortfolioAnalysisResponse,
    WalletPortfolioRequest,
)
from quantum_backend_v2.application.parity import RiskJobService
from quantum_backend_v2.application.wallet_portfolio import analyze_wallet_portfolio
from quantum_backend_v2.chains.adapter import UnsupportedOperationError
from quantum_backend_v2.chains.models import (
    ChainRegistry,
    DisabledNetworkError,
    UnknownNetworkError,
)
from quantum_backend_v2.chains.prices import PriceRejectedError, PriceUnavailableError
from quantum_backend_v2.chains.rpc import RpcConfigurationError

# Paid x402 callers are anonymous, so bound the work one payment can request.
_X402_MAX_HOLDINGS = 20
_X402_MAX_CREDIT_ASSETS = 15


def _daily_log_returns(rows: list[dict[str, str]]) -> list[list[float]]:
    try:
        history = sorted((date.fromisoformat(row["date"]), float(row["close"])) for row in rows)
    except ValueError:
        raise ValueError(
            "Each row needs a date in YYYY-MM-DD format and a numeric closing price."
        ) from None
    if len(history) < 5 or len({day for day, _ in history}) != len(history):
        raise ValueError("provide at least five distinct daily closing prices")
    if any(
        (current[0] - previous[0]).days != 1
        for previous, current in zip(history, history[1:], strict=False)
    ):
        raise ValueError("provide consecutive daily ETH/USD closing prices without gaps")
    if any(not math.isfinite(price) or price <= 0 for _, price in history):
        raise ValueError("historical prices must be finite and positive")
    return [
        [math.log(current[1]) - math.log(previous[1])]
        for previous, current in zip(history, history[1:], strict=False)
    ]


def build_risk_router(
    *,
    risk_job_service: RiskJobService,
    chain_registry: ChainRegistry | None = None,
    x402_gateway_secret: str | None = None,
) -> APIRouter:
    """Build the quantum risk engine router."""
    router = APIRouter(prefix="/api/v1/risk", tags=["risk"])

    @router.post(
        "/analyze-wallet",
        response_model=WalletPortfolioAnalysisResponse,
        summary="Analyze on-chain wallet holdings (read-only VaR/CVaR)",
    )
    async def analyze_wallet(
        body: WalletPortfolioRequest,
        current_user: CurrentUser,
    ) -> WalletPortfolioAnalysisResponse:
        """Public-address portfolio risk. No signing, approvals, or transfers."""
        _ = current_user
        if chain_registry is None:
            raise HTTPException(
                status_code=503, detail="chain registry is not configured"
            )
        try:
            return await analyze_wallet_portfolio(
                registry=chain_registry,
                address=body.address,
                networks=body.networks,
                lookback_days=body.lookback_days,
                num_uncertainty_qubits=body.num_uncertainty_qubits,
                epsilon=body.epsilon,
                alpha=body.alpha,
            )
        except ValueError as exc:
            # Invalid address checksum / format beyond the request model.
            raise HTTPException(status_code=422, detail=str(exc)) from None
        except (
            PriceRejectedError,
            DisabledNetworkError,
            UnknownNetworkError,
            UnsupportedOperationError,
        ) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from None
        except (PriceUnavailableError, RpcConfigurationError):
            raise HTTPException(
                status_code=503, detail="price feed or RPC is unavailable"
            ) from None

    @router.post(
        "/submit",
        response_model=RiskSubmitResponse,
        status_code=status.HTTP_201_CREATED,
        summary="Submit a quantum risk analysis job (JSON body)",
    )
    async def submit_risk_job(
        request: RiskJobRequest,
        background_tasks: BackgroundTasks,
        current_user: CurrentUser,
    ) -> RiskSubmitResponse:
        request_payload = request.model_dump()
        portfolio_size = (
            len(request.holdings) if request.risk_model == "equity" else len(request.assets)
        )
        try:
            record = await risk_job_service.submit(
                risk_model=request.risk_model,
                portfolio_size=portfolio_size,
                owner_user_id=current_user.user_id,
                request_payload=request_payload,
            )
        except (PriceUnavailableError, RpcConfigurationError):
            raise HTTPException(status_code=503, detail="price feed is unavailable") from None
        except (
            PriceRejectedError, DisabledNetworkError, UnknownNetworkError, UnsupportedOperationError
        ) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from None
        background_tasks.add_task(
            risk_job_service.process,
            job_id=record.id,
            request_payload=request_payload,
        )
        return RiskSubmitResponse(
            job_id=record.id,
            status=record.status,
            risk_model=record.risk_model,
            portfolio_size=record.portfolio_size,
        )

    @router.post(
        "/submit-csv",
        response_model=RiskSubmitResponse,
        status_code=status.HTTP_201_CREATED,
        summary="Submit a risk job by uploading a portfolio CSV",
    )
    async def submit_risk_csv(
        background_tasks: BackgroundTasks,
        current_user: CurrentUser,
        file: UploadFile = File(..., description="Portfolio CSV — equity or credit format"),
        num_uncertainty_qubits: int = Query(default=5, ge=3, le=8),
        epsilon: float = Query(default=0.05, gt=0, lt=0.5),
        alpha: float = Query(default=0.05, gt=0, lt=0.5),
        lookback_days: int = Query(default=504, ge=60, le=2520),
        use_chainlink: bool = Form(default=False),
        quantity: float = Form(default=1, gt=0),
        current_value: float | None = Form(default=None, gt=0),
    ) -> RiskSubmitResponse:
        contents = await file.read()
        if use_chainlink and len(contents) > 4 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="live valuation CSV exceeds 4 MB")
        try:
            text = contents.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded.")

        try:
            reader = csv.DictReader(io.StringIO(text), strict=True)
            if reader.fieldnames is None:
                raise HTTPException(status_code=400, detail="CSV appears to be empty.")
            headers = [field.strip().lower() for field in reader.fieldnames]
            if len(set(headers)) != len(headers):
                raise HTTPException(status_code=422, detail="CSV column names must be unique")
            fields = set(headers)
            rows = []
            for row in reader:
                if None in row:
                    raise HTTPException(
                        status_code=422, detail="CSV row has more values than columns"
                    )
                rows.append({
                    key.strip().lower(): (value or "").strip() for key, value in row.items()
                })
        except csv.Error:
            raise HTTPException(
                status_code=422, detail="CSV is malformed or a field is too large"
            ) from None
        if not rows:
            raise HTTPException(status_code=400, detail="CSV has no data rows.")

        if use_chainlink:
            try:
                if fields != {"date", "close"}:
                    raise ValueError(
                        "Live ETH/USD history must contain only date and close columns."
                    )
                returns = _daily_log_returns(rows)
                request = RiskJobRequest(
                    holdings=[EquityHolding(ticker="ETH-USD", weight=1, quantity=quantity,
                                            current_value=current_value, chainlink_price={})],
                    historical_returns=returns,
                    num_uncertainty_qubits=num_uncertainty_qubits, epsilon=epsilon, alpha=alpha,
                )
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from None
            return await submit_risk_job(request, background_tasks, current_user)

        # Auto-detect mode: credit if it has 'default_probability', equity otherwise
        if "default_probability" in fields:
            risk_model = "credit"
            required = {"principal", "default_probability", "recovery_rate"}
            missing = required - fields
            if missing:
                raise HTTPException(status_code=400, detail=f"CSV missing: {sorted(missing)}")
            assets: list[CreditAsset] = []
            for i, row in enumerate(rows):
                assets.append(
                    CreditAsset(
                        loan_id=row.get("loan_id", f"L{i:03d}"),
                        principal=float(row["principal"]),
                        default_probability=float(row["default_probability"]),
                        recovery_rate=float(row["recovery_rate"]),
                        sensitivity_rho=float(row.get("sensitivity_rho") or 0.15),
                        sector=row.get("sector", ""),
                    )
                )
            request_payload = {
                "risk_model": "credit",
                "assets": [a.model_dump() for a in assets],
                "num_uncertainty_qubits": num_uncertainty_qubits,
                "epsilon": epsilon,
                "alpha": alpha,
            }
            portfolio_size = len(assets)
        else:
            risk_model = "equity"
            required = {"ticker"}
            missing = required - fields
            if missing:
                raise HTTPException(status_code=400, detail="CSV must have a 'ticker' column for equity mode.")
            holdings: list[EquityHolding] = []
            for row in rows:
                weight_raw = row.get("weight", "").strip()
                weight = float(weight_raw) if weight_raw else 1.0
                holdings.append(EquityHolding(ticker=row["ticker"].upper(), weight=weight))
            request_payload = {
                "risk_model": "equity",
                "holdings": [h.model_dump() for h in holdings],
                "lookback_days": lookback_days,
                "num_uncertainty_qubits": num_uncertainty_qubits,
                "epsilon": epsilon,
                "alpha": alpha,
            }
            portfolio_size = len(holdings)

        record = await risk_job_service.submit(
            risk_model=risk_model,
            portfolio_size=portfolio_size,
            owner_user_id=current_user.user_id,
            request_payload=request_payload,
        )
        background_tasks.add_task(
            risk_job_service.process,
            job_id=record.id,
            request_payload=request_payload,
        )
        return RiskSubmitResponse(
            job_id=record.id,
            status=record.status,
            risk_model=record.risk_model,
            portfolio_size=record.portfolio_size,
        )

    @router.get(
        "/{job_id}",
        response_model=RiskJobResponse,
        summary="Get risk job status and results",
    )
    async def get_risk_job(
        job_id: str,
        current_user: CurrentUser,
        download: str | None = Query(default=None, pattern="^provenance$"),
    ) -> RiskJobResponse | Response:
        record = await risk_job_service.get_job(job_id, current_user=current_user)
        if record is None:
            raise not_found("Risk job", job_id)
        if download == "provenance":
            return finance_provenance_download(record.result_payload)

        return RiskJobResponse(
            job_id=record.id,
            status=record.status,
            risk_model=record.risk_model,
            portfolio_size=record.portfolio_size,
            result=record.result_payload,
            error=record.error,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    @router.get(
        "",
        response_model=list[RiskJobSummary],
        summary="List risk jobs",
    )
    async def list_risk_jobs(
        current_user: CurrentUser,
        limit: int = Query(default=20, ge=1, le=100),
    ) -> list[RiskJobSummary]:
        records = await risk_job_service.list_jobs(current_user=current_user, limit=limit)
        return [
            RiskJobSummary(
                job_id=record.id,
                status=record.status,
                risk_model=record.risk_model,
                portfolio_size=record.portfolio_size,
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
            response_model=RiskSubmitResponse,
            status_code=status.HTTP_201_CREATED,
            include_in_schema=False,
        )
        async def submit_x402_risk_job(
            request: RiskJobRequest,
            background_tasks: BackgroundTasks,
            _: None = Depends(require_x402_gateway),
        ) -> RiskSubmitResponse:
            if any(holding.chainlink_price is not None for holding in request.holdings):
                raise HTTPException(status_code=422, detail="oracle pricing is unavailable on x402")
            if (
                len(request.holdings) > _X402_MAX_HOLDINGS
                or len(request.assets) > _X402_MAX_CREDIT_ASSETS
            ):
                raise HTTPException(status_code=422, detail="portfolio is too large for x402")
            request_payload = request.model_dump()
            portfolio_size = (
                len(request.holdings) if request.risk_model == "equity" else len(request.assets)
            )
            try:
                record = await risk_job_service.submit(
                    risk_model=request.risk_model,
                    portfolio_size=portfolio_size,
                    owner_user_id=X402_OWNER_USER_ID,
                    request_payload=request_payload,
                )
            except (PriceUnavailableError, RpcConfigurationError):
                raise HTTPException(status_code=503, detail="price feed is unavailable") from None
            except (
                PriceRejectedError,
                DisabledNetworkError,
                UnknownNetworkError,
                UnsupportedOperationError,
            ) as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from None
            background_tasks.add_task(
                risk_job_service.process,
                job_id=record.id,
                request_payload=request_payload,
            )
            return RiskSubmitResponse(
                job_id=record.id,
                status=record.status,
                risk_model=record.risk_model,
                portfolio_size=record.portfolio_size,
            )

        @router.get(
            "/internal/x402/jobs/{job_id}",
            response_model=RiskJobResponse,
            include_in_schema=False,
        )
        async def get_x402_risk_job(
            job_id: str,
            _: None = Depends(require_x402_gateway),
        ) -> RiskJobResponse:
            record = await risk_job_service.get_job_for_owner(
                job_id,
                owner_user_id=X402_OWNER_USER_ID,
            )
            if record is None:
                raise not_found("Risk job", job_id)
            return RiskJobResponse(
                job_id=record.id,
                status=record.status,
                risk_model=record.risk_model,
                portfolio_size=record.portfolio_size,
                result=record.result_payload,
                error=record.error,
                created_at=record.created_at,
                updated_at=record.updated_at,
            )

    return router
