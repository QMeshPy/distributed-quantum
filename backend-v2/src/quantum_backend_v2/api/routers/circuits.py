"""Circuit submission and job management router."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Query, status

from quantum_backend_v2.application.parity import CircuitJobService
from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.errors.models import not_found
from quantum_backend_v2.api.models.circuits import (
    CircuitSubmitRequest,
    CircuitSubmitResponse,
    JobListItemResponse,
    JobProgressResponse,
    JobResult,
    JobStatusResponse,
)


def build_circuits_router(*, job_service: CircuitJobService) -> APIRouter:
    """Build the circuits/jobs router."""
    router = APIRouter(prefix="/api/v1", tags=["circuits", "jobs"])

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
        record = await job_service.submit(
            circuit_text=body.circuit,
            owner_user_id=current_user.user_id,
        )
        background_tasks.add_task(job_service.process, record.id)
        return CircuitSubmitResponse(job_id=record.id, status=record.status)

    @router.get(
        "/jobs",
        response_model=list[JobListItemResponse],
        summary="List recent jobs",
    )
    async def list_jobs(
        current_user: CurrentUser,
        limit: int = Query(default=50, ge=1, le=200),
        status: list[str] | None = Query(default=None),
    ) -> list[JobListItemResponse]:
        runs = await job_service.list_jobs(limit=limit, statuses=status)
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
        run = await job_service.get_job(job_id)
        if run is None:
            raise not_found("Job", job_id)

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
            created_at=run.created_at,
            updated_at=run.updated_at,
        )

    return router


def _to_progress(progress_payload: dict[str, object] | None) -> JobProgressResponse | None:
    if progress_payload is None:
        return None
    return JobProgressResponse(**progress_payload)


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
