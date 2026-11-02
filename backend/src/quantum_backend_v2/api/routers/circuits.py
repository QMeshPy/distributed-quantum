"""Circuit submission and job management router."""

from __future__ import annotations

import hmac
import logging
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, status

from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.errors.models import ErrorCode, PlatformException, not_found
from quantum_backend_v2.api.models.circuits import (
    CircuitSubmitRequest,
    CircuitSubmitResponse,
    JobListItemResponse,
    JobProgressResponse,
    JobResult,
    JobStatusResponse,
)
from quantum_backend_v2.application.parity import CircuitJobService, new_circuit_job_id
from quantum_backend_v2.payments.credits import JobCreditMeter
from quantum_backend_v2.payments.errors import InsufficientCreditError
from quantum_backend_v2.payments.payouts import FragmentPayoutService, JobPayoutSummary
from quantum_backend_v2.persistence.mongodb import WorkflowRunDocument

logger = logging.getLogger(__name__)

_X402_GATEWAY_HEADER = "X-X402-Gateway-Secret"
_X402_OWNER_USER_ID = "x402-algorand"


def build_circuits_router(
    *,
    job_service: CircuitJobService,
    x402_gateway_secret: str | None = None,
    credit_meter: JobCreditMeter | None = None,
    payout_service: FragmentPayoutService | None = None,
) -> APIRouter:
    """Build the circuits/jobs router.

    With a ``credit_meter``, each user-submitted job holds its cost on submit
    and is charged only if it completes. x402 jobs are paid per request instead.
    """
    router = APIRouter(prefix="/api/v1", tags=["circuits", "jobs"])

    async def process_and_settle(job_id: str, owner_user_id: str, meter: JobCreditMeter) -> None:
        try:
            await job_service.process(job_id)
        finally:
            run = await job_service.get_job_for_owner(job_id, owner_user_id=owner_user_id)
            succeeded = run is not None and run.status == "COMPLETED"
            try:
                payable = (
                    await payout_service.committed(job_id) if payout_service is not None else None
                )
                await meter.settle(job_id, succeeded=succeeded, payable=payable or Decimal("0"))
            except Exception:
                # The hold stays reserved, never spendable twice; the
                # reconciliation sweep reports it.
                logger.exception("failed to settle credits for job %s", job_id)

    @router.post(
        "/circuits/submit",
        response_model=CircuitSubmitResponse,
        status_code=status.HTTP_201_CREATED,
        summary="Submit a quantum circuit for execution",
    )
    async def submit_circuit(
        body: CircuitSubmitRequest,
        background_tasks: BackgroundTasks,
        current_user: CurrentUser,
    ) -> CircuitSubmitResponse:
        if credit_meter is None:
            record = await job_service.submit(
                circuit_text=body.circuit,
                owner_user_id=current_user.user_id,
            )
            background_tasks.add_task(job_service.process, record.id)
            return CircuitSubmitResponse(job_id=record.id, status=record.status)

        job_id = new_circuit_job_id()
        try:
            await credit_meter.reserve(current_user.user_id, job_id)
        except InsufficientCreditError:
            raise PlatformException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                error=ErrorCode.INSUFFICIENT_CREDITS,
                message=f"A circuit job costs {credit_meter.cost} credits. Buy credits to run it.",
            ) from None
        try:
            record = await job_service.submit(
                circuit_text=body.circuit,
                owner_user_id=current_user.user_id,
                job_id=job_id,
            )
        except Exception:
            await credit_meter.settle(job_id, succeeded=False)
            raise
        background_tasks.add_task(
            process_and_settle, record.id, current_user.user_id, credit_meter
        )
        return CircuitSubmitResponse(job_id=record.id, status=record.status)

    @router.get(
        "/jobs",
        response_model=list[JobListItemResponse],
        summary="List recent jobs",
    )
    async def list_jobs(
        current_user: CurrentUser,
        limit: int = Query(default=50, ge=1, le=200),
        status: Annotated[list[str] | None, Query()] = None,
    ) -> list[JobListItemResponse]:
        runs = await job_service.list_jobs(
            current_user=current_user,
            limit=limit,
            statuses=status,
        )
        return [
            JobListItemResponse(
                job_id=run.id,
                status=run.status,
                plan_id=run.artifact_bundle_id,
                error=job_service.get_error(run),
                progress=_to_progress(job_service.build_progress(run)),
                circuit_preview=_extract_circuit_preview(
                    str(run.input_snapshot.get("circuit", ""))
                ),
                result_available=job_service.get_result_payload(run) is not None,
                created_at=run.created_at,
                updated_at=run.updated_at,
            )
            for run in runs
        ]

    @router.get(
        "/jobs/{job_id}",
        response_model=JobStatusResponse,
        summary="Get job status and result",
    )
    async def get_job(
        job_id: str,
        current_user: CurrentUser,
        result_detail: str = Query(default="full", pattern="^(full|summary)$"),
    ) -> JobStatusResponse:
        run = await job_service.get_job(job_id, current_user=current_user)
        if run is None:
            raise not_found("Job", job_id)
        return _to_job_status_response(job_service, run, result_detail=result_detail)

    if payout_service is not None:

        @router.get(
            "/jobs/{job_id}/payouts",
            response_model=JobPayoutSummary,
            summary="Get the job's worker payout summary",
        )
        async def get_job_payouts(job_id: str, current_user: CurrentUser) -> JobPayoutSummary:
            """Every fragment's payout: paid, pending, or withheld with a reason."""
            run = await job_service.get_job(job_id, current_user=current_user)
            if run is None:
                raise not_found("Job", job_id)
            return await payout_service.job_summary(job_id)

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
            "/internal/x402/circuits/submit",
            response_model=CircuitSubmitResponse,
            status_code=status.HTTP_201_CREATED,
            include_in_schema=False,
        )
        async def submit_x402_circuit(
            body: CircuitSubmitRequest,
            background_tasks: BackgroundTasks,
            _: None = Depends(require_x402_gateway),
        ) -> CircuitSubmitResponse:
            record = await job_service.submit(
                circuit_text=body.circuit,
                owner_user_id=_X402_OWNER_USER_ID,
            )
            background_tasks.add_task(job_service.process, record.id)
            return CircuitSubmitResponse(job_id=record.id, status=record.status)

        @router.get(
            "/internal/x402/circuits/jobs/{job_id}",
            response_model=JobStatusResponse,
            include_in_schema=False,
        )
        async def get_x402_job(
            job_id: str,
            _: None = Depends(require_x402_gateway),
            result_detail: str = Query(default="full", pattern="^(full|summary)$"),
        ) -> JobStatusResponse:
            run = await job_service.get_job_for_owner(
                job_id,
                owner_user_id=_X402_OWNER_USER_ID,
            )
            if run is None:
                raise not_found("Job", job_id)
            return _to_job_status_response(job_service, run, result_detail=result_detail)

    return router


def _to_job_status_response(
    job_service: CircuitJobService,
    run: WorkflowRunDocument,
    *,
    result_detail: str,
) -> JobStatusResponse:
    result_payload = job_service.get_result_payload(run)
    result = None
    if result_payload is not None:
        quantum_result = result_payload.get("quantum_result")
        if result_detail == "summary" and isinstance(quantum_result, dict):
            quantum_result = {
                **quantum_result,
                "probabilities": None,
                "statevector": None,
                "reduced_density_matrices": None,
            }
        result = JobResult(
            job_id=run.id,
            fragment_results=list(result_payload.get("fragment_results", [])),
            quantum_result=quantum_result if isinstance(quantum_result, dict) else None,
        )

    return JobStatusResponse(
        job_id=run.id,
        status=run.status,
        plan_id=run.artifact_bundle_id,
        error=job_service.get_error(run),
        result=result,
        progress=_to_progress(job_service.build_progress(run)),
        circuit_text=str(run.input_snapshot.get("circuit", "")),
        provenance_bundle_id=run.output_snapshot.get("provenance_bundle_id"),
        created_at=run.created_at,
        updated_at=run.updated_at,
    )


def _to_progress(progress_payload: dict[str, object] | None) -> JobProgressResponse | None:
    if progress_payload is None:
        return None
    return JobProgressResponse.model_validate(progress_payload)


def _extract_circuit_preview(circuit_text: str, *, max_length: int = 96) -> str:
    """Extract a meaningful preview from circuit text."""
    for line in circuit_text.splitlines():
        normalized = " ".join(line.split())
        if not normalized:
            continue

        upper_line = normalized.upper()
        if any(
            upper_line.startswith(prefix)
            for prefix in ["OPENQASM", "INCLUDE", "QREG", "CREG", "QUBIT[", "BIT["]
        ):
            continue

        if len(normalized) <= max_length:
            return normalized
        return f"{normalized[: max_length - 3]}..."

    return "Circuit submitted"
