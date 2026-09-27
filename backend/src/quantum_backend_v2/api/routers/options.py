"""Real options pricing API router."""

from __future__ import annotations

import csv
import hmac
import io
import time
from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Header,
    HTTPException,
    Query,
    UploadFile,
    status,
)

from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.errors.models import not_found
from quantum_backend_v2.api.models.options import (
    BatchOptionsResult,
    BatchOptionsRowResult,
    BatchOptionsSummary,
    OptionsJobRequest,
    OptionsJobResponse,
    OptionsJobSummary,
    OptionsSubmitResponse,
)
from quantum_backend_v2.application.parity import OptionsJobService
from quantum_backend_v2.application.real_options_pricing import price_options

_BATCH_MAX_ROWS = 25
_BATCH_DEFAULT_QUBITS = 4
_BATCH_DEFAULT_EPSILON = 0.05  # looser tolerance for speed in batch mode

_X402_GATEWAY_HEADER = "X-X402-Gateway-Secret"
_X402_OWNER_USER_ID = "x402-algorand"


def build_options_router(
    *,
    options_job_service: OptionsJobService,
    x402_gateway_secret: str | None = None,
) -> APIRouter:
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

    @router.post(
        "/batch",
        response_model=BatchOptionsResult,
        summary="Batch benchmark: run IQAE + B-S on every row of a CSV",
    )
    async def batch_options_benchmark(
        current_user: CurrentUser,  # noqa: ARG001
        file: UploadFile = File(..., description="CSV with option contract rows"),
    ) -> BatchOptionsResult:
        """Process a CSV of option contracts synchronously.

        Required columns: option_type, current_value, strike_or_cost,
        time_to_expiry, volatility, risk_free_rate.
        Optional: market_price (enables market-error columns).
        """
        contents = await file.read()
        try:
            text = contents.decode("utf-8-sig")  # handle BOM
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded.")

        reader = csv.DictReader(io.StringIO(text))
        required = {"option_type", "current_value", "strike_or_cost", "time_to_expiry", "volatility", "risk_free_rate"}
        if reader.fieldnames is None:
            raise HTTPException(status_code=400, detail="CSV appears to be empty.")
        missing = required - set(f.strip() for f in reader.fieldnames)
        if missing:
            raise HTTPException(status_code=400, detail=f"CSV missing required columns: {sorted(missing)}")

        raw_rows = list(reader)
        if len(raw_rows) == 0:
            raise HTTPException(status_code=400, detail="CSV has no data rows.")
        if len(raw_rows) > _BATCH_MAX_ROWS:
            raise HTTPException(
                status_code=400,
                detail=f"Batch limit is {_BATCH_MAX_ROWS} rows; CSV has {len(raw_rows)}.",
            )

        t_batch_start = time.perf_counter()
        results: list[BatchOptionsRowResult] = []
        errors: list[dict] = []

        for idx, row in enumerate(raw_rows):
            row = {k.strip(): (v.strip() if v is not None else "") for k, v in row.items()}
            try:
                def _f(key: str, default: float | None = None) -> float | None:
                    v = row.get(key, "").strip()
                    if not v:
                        return default
                    return float(v)

                req_dict = {
                    "job_id": f"batch-row-{idx}",
                    "option_type": row["option_type"].strip(),
                    "current_value": float(row["current_value"]),
                    "strike_or_cost": float(row["strike_or_cost"]),
                    "time_to_expiry": float(row["time_to_expiry"]),
                    "volatility": float(row["volatility"]),
                    "risk_free_rate": float(row["risk_free_rate"]),
                    "annual_cost_of_delay": _f("annual_cost_of_delay"),
                    "reserve_quantity": _f("reserve_quantity"),
                    "resource_price_per_unit": _f("resource_price_per_unit"),
                    "extraction_cost_per_unit": _f("extraction_cost_per_unit"),
                    "annual_cashflow_after_tax": _f("annual_cashflow_after_tax"),
                    "reinvestment_need_pct": _f("reinvestment_need_pct"),
                    "reinvestment_volatility": _f("reinvestment_volatility"),
                    "max_internal_financing_pct": _f("max_internal_financing_pct"),
                    "cost_of_capital": _f("cost_of_capital"),
                    "return_on_capital": _f("return_on_capital"),
                    "num_uncertainty_qubits": int(_f("num_uncertainty_qubits") or _BATCH_DEFAULT_QUBITS),
                    "epsilon": _f("epsilon") or _BATCH_DEFAULT_EPSILON,
                    "alpha": 0.05,
                }

                market_price_raw = row.get("market_price", "").strip()
                market_price = float(market_price_raw) if market_price_raw else None

                result = price_options(req_dict)

                q_price = result["quantum_price"]
                bs_price = result["classical_bs_price"]
                price_diff_pct = result["price_difference_pct"]

                def _market_err(model_price: float) -> float | None:
                    if market_price is None or market_price == 0:
                        return None
                    return round((model_price - market_price) / market_price * 100, 4)

                results.append(
                    BatchOptionsRowResult(
                        row_index=idx,
                        option_type=result["option_type"],
                        current_value=float(row["current_value"]),
                        strike_or_cost=float(row["strike_or_cost"]),
                        time_to_expiry=float(row["time_to_expiry"]),
                        volatility=float(row["volatility"]),
                        risk_free_rate=float(row["risk_free_rate"]),
                        market_price=market_price,
                        quantum_price=q_price,
                        classical_bs_price=bs_price,
                        classical_binomial_price=result["classical_binomial_price"],
                        price_difference_pct=price_diff_pct,
                        quantum_vs_market_pct=_market_err(q_price),
                        bs_vs_market_pct=_market_err(bs_price),
                        quantum_delta=result["quantum_greeks"]["delta"],
                        classical_delta=result["classical_greeks"]["delta"],
                        confidence_interval=result["confidence_interval"],
                        moneyness=result["moneyness"],
                        divergence_warning=result["divergence_warning"],
                        num_qubits=result["num_qubits"],
                        analysis_duration_ms=result["analysis_duration_ms"],
                    )
                )
            except Exception as exc:
                errors.append({"row_index": idx, "error": str(exc)})

        total_ms = int((time.perf_counter() - t_batch_start) * 1000)

        # Aggregate summary
        diffs = [r.price_difference_pct for r in results]
        q_vs_mkt = [r.quantum_vs_market_pct for r in results if r.quantum_vs_market_pct is not None]
        bs_vs_mkt = [r.bs_vs_market_pct for r in results if r.bs_vs_market_pct is not None]
        diverged = sum(1 for r in results if r.divergence_warning)

        summary = BatchOptionsSummary(
            total_rows=len(raw_rows),
            succeeded=len(results),
            failed=len(errors),
            mean_quantum_bs_diff_pct=round(sum(diffs) / len(diffs), 4) if diffs else 0.0,
            mean_quantum_vs_market_pct=round(sum(q_vs_mkt) / len(q_vs_mkt), 4) if q_vs_mkt else None,
            mean_bs_vs_market_pct=round(sum(bs_vs_mkt) / len(bs_vs_mkt), 4) if bs_vs_mkt else None,
            rows_with_divergence_warning=diverged,
            total_duration_ms=total_ms,
        )

        return BatchOptionsResult(rows=results, errors=errors, summary=summary)

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

    if x402_gateway_secret is not None:

        async def require_x402_gateway(
            supplied_secret: Annotated[
                str | None,
                Header(alias=_X402_GATEWAY_HEADER),
            ] = None,
        ) -> None:
            if supplied_secret is None or not hmac.compare_digest(
                supplied_secret,
                x402_gateway_secret,
            ):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid x402 gateway credentials.",
                )

        @router.post(
            "/internal/x402/submit",
            response_model=OptionsSubmitResponse,
            status_code=status.HTTP_201_CREATED,
            include_in_schema=False,
        )
        async def submit_x402_options_job(
            request: OptionsJobRequest,
            background_tasks: BackgroundTasks,
            _: None = Depends(require_x402_gateway),
        ) -> OptionsSubmitResponse:
            request_payload = request.model_dump()
            record = await options_job_service.submit(
                option_type=request.option_type,
                owner_user_id=_X402_OWNER_USER_ID,
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
            "/internal/x402/jobs/{job_id}",
            response_model=OptionsJobResponse,
            include_in_schema=False,
        )
        async def get_x402_options_job(
            job_id: str,
            _: None = Depends(require_x402_gateway),
        ) -> OptionsJobResponse:
            record = await options_job_service.get_job_for_owner(
                job_id,
                owner_user_id=_X402_OWNER_USER_ID,
            )
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

    return router
