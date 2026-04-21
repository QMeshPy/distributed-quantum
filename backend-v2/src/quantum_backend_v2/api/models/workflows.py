"""API request/response models for workflow submission and status."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from quantum_backend_v2.workflows.models import WorkflowRunStatus, WorkflowType


class SubmitWorkflowRequest(BaseModel):
    """Request body for submitting a new workflow run."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "workflow_definition_id": "wf_qaoa_portfolio_v1",
                "workflow_type": "quantum_circuit",
                "project_id": "proj_capstone_demo",
                "input_snapshot": {
                    "portfolio_size": 8,
                    "risk_aversion": 0.42,
                    "tickers": ["AAPL", "MSFT", "NVDA", "GOOGL"],
                },
            }
        },
    )

    workflow_definition_id: str = Field(min_length=3)
    workflow_type: WorkflowType
    project_id: str | None = None
    input_snapshot: dict[str, Any] = Field(default_factory=dict)


class WorkflowRunResponse(BaseModel):
    """API representation of a workflow run."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "run_id": "run_2ee36fe758e4462d9a7b2f7d80d2c5e7",
                "workflow_definition_id": "wf_qaoa_portfolio_v1",
                "owner_user_id": "dev-admin-local",
                "project_id": "proj_capstone_demo",
                "workflow_type": "quantum_circuit",
                "status": "submitted",
                "fragment_count": 3,
                "completed_fragments": 0,
                "failed_fragments": 0,
                "fragment_success_rate": 0.0,
                "artifact_bundle_id": None,
                "benchmark_run_id": None,
                "submitted_at": "2026-04-20T00:50:00Z",
                "started_at": None,
                "completed_at": None,
            }
        },
    )

    run_id: str
    workflow_definition_id: str
    owner_user_id: str
    project_id: str | None
    workflow_type: str
    status: str
    fragment_count: int
    completed_fragments: int
    failed_fragments: int
    fragment_success_rate: float
    artifact_bundle_id: str | None
    benchmark_run_id: str | None
    submitted_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class BenchmarkSubmitRequest(BaseModel):
    """Request body for initiating a benchmark run."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "benchmark_family": "portfolio-optimization",
                "quantum_service_id": "svc.quantum.portfolio",
                "classical_service_id": "svc.classical.baseline",
                "dataset_ref": "s3://qb2-demo/portfolio-q1.csv",
                "dataset_version": "2026-04-15",
                "workflow_run_id": "run_2ee36fe758e4462d9a7b2f7d80d2c5e7",
            }
        },
    )

    benchmark_family: str = Field(min_length=3)
    quantum_service_id: str = Field(min_length=2)
    classical_service_id: str | None = None
    dataset_ref: str | None = None
    dataset_version: str | None = None
    workflow_run_id: str | None = None


class BenchmarkRunResponse(BaseModel):
    """API representation of a benchmark run."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "benchmark_id": "bench_856b53dfb53f4525b9fe66ef90eac4cb",
                "benchmark_family": "portfolio-optimization",
                "quantum_service_id": "svc.quantum.portfolio",
                "classical_service_id": "svc.classical.baseline",
                "status": "completed",
                "quantum_metrics": {"latency_ms": 1480, "solution_score": 0.92},
                "classical_metrics": {"latency_ms": 810, "solution_score": 0.84},
                "comparison_summary": {
                    "winner": "quantum",
                    "score_delta": 0.08,
                    "latency_ratio": 1.83,
                },
                "is_publishable": True,
                "submitted_at": "2026-04-20T00:52:00Z",
                "completed_at": "2026-04-20T00:53:14Z",
            }
        },
    )

    benchmark_id: str
    benchmark_family: str
    quantum_service_id: str
    classical_service_id: str | None
    status: str
    quantum_metrics: dict[str, Any] | None = None
    classical_metrics: dict[str, Any] | None = None
    comparison_summary: dict[str, Any]
    is_publishable: bool
    submitted_at: datetime
    completed_at: datetime | None
