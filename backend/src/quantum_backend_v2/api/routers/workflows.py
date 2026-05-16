"""Workflow submission and benchmark router."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, status

from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.errors.models import ErrorCode, PlatformException, not_found
from quantum_backend_v2.api.models.workflows import (
    BenchmarkRunResponse,
    BenchmarkSubmitRequest,
    SubmitWorkflowRequest,
    WorkflowRunResponse,
)
from quantum_backend_v2.application.workflows import create_workflow_run
from quantum_backend_v2.persistence.mongodb import BenchmarkResultDocument, MongoRuntime, WorkflowRunDocument
from quantum_backend_v2.workflows.benchmark import BenchmarkRun, BenchmarkRunService
from quantum_backend_v2.workflows.models import WorkflowRun, WorkflowRunStatus, WorkflowType


def build_workflows_router(
    *,
    mongo_runtime: MongoRuntime | None,
) -> APIRouter:
    """Build the workflows + benchmarks router."""
    router = APIRouter(prefix="/api/v1/workflows", tags=["workflows"])
    benchmark_service = BenchmarkRunService()

    @router.post(
        "/runs",
        response_model=WorkflowRunResponse,
        status_code=status.HTTP_201_CREATED,
        summary="Submit a new workflow run",
    )
    async def submit_workflow(
        body: SubmitWorkflowRequest,
        current_user: CurrentUser,
    ) -> WorkflowRunResponse:
        run = create_workflow_run(
            workflow_definition_id=body.workflow_definition_id,
            owner_user_id=current_user.user_id,
            workflow_type=body.workflow_type,
            input_snapshot=body.input_snapshot,
            project_id=body.project_id,
        )

        doc = WorkflowRunDocument(
            id=run.run_id,
            workflow_definition_id=run.workflow_definition_id,
            owner_user_id=run.owner_user_id,
            project_id=run.project_id,
            workflow_type=run.workflow_type.value,
            status=run.status.value,
            input_snapshot=run.input_snapshot,
            output_snapshot=run.output_snapshot,
            fragment_count=run.fragment_count,
            completed_fragments=run.completed_fragments,
            failed_fragments=run.failed_fragments,
            artifact_bundle_id=run.artifact_bundle_id,
            benchmark_run_id=run.benchmark_run_id,
            started_at=run.started_at,
            completed_at=run.completed_at,
        )
        await doc.insert()
        return _run_to_response(doc)

    @router.get(
        "/runs/{run_id}",
        response_model=WorkflowRunResponse,
        summary="Get a workflow run",
    )
    async def get_workflow_run(
        run_id: str,
        current_user: CurrentUser,
    ) -> WorkflowRunResponse:
        doc = await WorkflowRunDocument.get(run_id)
        if doc is None:
            raise not_found("Workflow run", run_id)
        if not current_user.is_admin() and doc.owner_user_id != current_user.user_id:
            raise not_found("Workflow run", run_id)
        return _run_to_response(doc)

    @router.get(
        "/runs",
        response_model=list[WorkflowRunResponse],
        summary="List workflow runs",
    )
    async def list_workflow_runs(
        current_user: CurrentUser,
    ) -> list[WorkflowRunResponse]:
        query = WorkflowRunDocument.find()
        if not current_user.is_admin():
            query = query.find(WorkflowRunDocument.owner_user_id == current_user.user_id)
        docs = await query.sort("-created_at").limit(50).to_list()
        return [_run_to_response(d) for d in docs]

    @router.post(
        "/benchmarks",
        response_model=BenchmarkRunResponse,
        status_code=status.HTTP_201_CREATED,
        summary="Submit a benchmark run",
    )
    async def submit_benchmark(
        body: BenchmarkSubmitRequest,
        current_user: CurrentUser,
    ) -> BenchmarkRunResponse:
        if mongo_runtime is None:
            raise PlatformException(
                status_code=503,
                error_code=ErrorCode.SERVICE_UNAVAILABLE,
                message="Benchmark storage requires MongoDB to be configured.",
            )

        benchmark_run = benchmark_service.create(
            owner_user_id=current_user.user_id,
            workflow_id=body.workflow_id,
            benchmark_family=body.benchmark_family,
            quantum_service_id=body.quantum_service_id,
            classical_service_id=body.classical_service_id,
        )

        doc = BenchmarkResultDocument(
            benchmark_id=benchmark_run.benchmark_id,
            owner_user_id=benchmark_run.owner_user_id,
            workflow_id=benchmark_run.workflow_id,
            benchmark_family=benchmark_run.benchmark_family,
            quantum_service_id=benchmark_run.quantum_service_id,
            classical_service_id=benchmark_run.classical_service_id,
        )
        await doc.insert()
        return _benchmark_to_response(benchmark_run)

    @router.get(
        "/benchmarks/{benchmark_id}",
        response_model=BenchmarkRunResponse,
        summary="Get a benchmark run",
    )
    async def get_benchmark(
        benchmark_id: str,
        current_user: CurrentUser,
    ) -> BenchmarkRunResponse:
        doc = await BenchmarkResultDocument.find_one(
            BenchmarkResultDocument.benchmark_id == benchmark_id
        )
        if doc is None:
            raise not_found("Benchmark run", benchmark_id)
        if not current_user.is_admin() and doc.owner_user_id != current_user.user_id:
            raise not_found("Benchmark run", benchmark_id)
        return BenchmarkRunResponse(
            benchmark_id=doc.benchmark_id,
            owner_user_id=doc.owner_user_id,
            workflow_id=doc.workflow_id,
            benchmark_family=doc.benchmark_family,
            quantum_service_id=doc.quantum_service_id,
            classical_service_id=doc.classical_service_id,
            metrics=doc.metrics,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
        )

    return router


def _run_to_response(doc: WorkflowRunDocument) -> WorkflowRunResponse:
    return WorkflowRunResponse(
        run_id=doc.id,
        workflow_definition_id=doc.workflow_definition_id,
        owner_user_id=doc.owner_user_id,
        project_id=doc.project_id,
        workflow_type=doc.workflow_type,
        status=doc.status,
        input_snapshot=doc.input_snapshot,
        output_snapshot=doc.output_snapshot,
        fragment_count=doc.fragment_count,
        completed_fragments=doc.completed_fragments,
        failed_fragments=doc.failed_fragments,
        artifact_bundle_id=doc.artifact_bundle_id,
        benchmark_run_id=doc.benchmark_run_id,
        started_at=doc.started_at,
        completed_at=doc.completed_at,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


def _benchmark_to_response(run: BenchmarkRun) -> BenchmarkRunResponse:
    return BenchmarkRunResponse(
        benchmark_id=run.benchmark_id,
        owner_user_id=run.owner_user_id,
        workflow_id=run.workflow_id,
        benchmark_family=run.benchmark_family,
        quantum_service_id=run.quantum_service_id,
        classical_service_id=run.classical_service_id,
        metrics={},
        created_at=run.created_at,
        updated_at=run.updated_at,
    )
