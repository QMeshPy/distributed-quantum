"""Quantum-vs-classical benchmark framework.

Provides models and a service for recording, comparing, and publishing
quantum-vs-classical benchmark runs against the same input dataset.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class BenchmarkRunStatus(str, Enum):
    """Lifecycle state of a benchmark run pair."""

    SUBMITTED = "submitted"
    QUANTUM_RUNNING = "quantum_running"
    CLASSICAL_RUNNING = "classical_running"
    COMPARING = "comparing"
    COMPLETED = "completed"
    FAILED = "failed"


class BenchmarkMetrics(BaseModel):
    """Comparable output metrics for one arm of a benchmark run."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    latency_ms: float | None = Field(default=None, ge=0.0)
    cost_estimate: float | None = Field(default=None, ge=0.0)
    success_rate: float | None = Field(default=None, ge=0.0, le=1.0)
    fidelity_score: float | None = Field(default=None, ge=0.0, le=1.0)
    output_quality_score: float | None = Field(default=None, ge=0.0, le=1.0)
    shots: int | None = Field(default=None, ge=1)
    custom_metrics: dict[str, float] = Field(default_factory=dict)


class BenchmarkRun(BaseModel):
    """Durable record for a quantum-vs-classical benchmark comparison."""

    model_config = ConfigDict(extra="forbid")

    benchmark_id: str = Field(min_length=8)
    workflow_run_id: str | None = None
    benchmark_family: str = Field(min_length=3)
    dataset_ref: str | None = None
    dataset_version: str | None = None
    quantum_service_id: str = Field(min_length=2)
    classical_service_id: str | None = None
    quantum_peer_id: str | None = None
    classical_peer_id: str | None = None
    status: BenchmarkRunStatus = BenchmarkRunStatus.SUBMITTED
    quantum_metrics: BenchmarkMetrics | None = None
    classical_metrics: BenchmarkMetrics | None = None
    comparison_summary: dict[str, Any] = Field(default_factory=dict)
    provenance_bundle_id: str | None = None
    is_publishable: bool = False
    submitted_at: datetime = Field(default_factory=_utc_now)
    completed_at: datetime | None = None

    def compute_comparison(self) -> dict[str, Any]:
        """Derive a structured comparison between quantum and classical metrics."""
        if self.quantum_metrics is None or self.classical_metrics is None:
            return {"status": "incomplete"}

        comparison: dict[str, Any] = {}

        if (
            self.quantum_metrics.latency_ms is not None
            and self.classical_metrics.latency_ms is not None
        ):
            speedup = self.classical_metrics.latency_ms / max(
                self.quantum_metrics.latency_ms, 0.001
            )
            comparison["latency_speedup_factor"] = round(speedup, 4)

        if (
            self.quantum_metrics.fidelity_score is not None
            and self.classical_metrics.fidelity_score is not None
        ):
            fidelity_delta = (
                self.quantum_metrics.fidelity_score - self.classical_metrics.fidelity_score
            )
            comparison["fidelity_delta"] = round(fidelity_delta, 6)

        if (
            self.quantum_metrics.output_quality_score is not None
            and self.classical_metrics.output_quality_score is not None
        ):
            quality_delta = (
                self.quantum_metrics.output_quality_score
                - self.classical_metrics.output_quality_score
            )
            comparison["quality_delta"] = round(quality_delta, 6)
            comparison["quantum_advantage"] = quality_delta > 0

        return comparison


class BenchmarkRunService:
    """Creates and updates quantum-vs-classical benchmark runs."""

    def create(
        self,
        *,
        benchmark_family: str,
        quantum_service_id: str,
        classical_service_id: str | None = None,
        dataset_ref: str | None = None,
        dataset_version: str | None = None,
        workflow_run_id: str | None = None,
    ) -> BenchmarkRun:
        benchmark_id = uuid.uuid4().hex
        run = BenchmarkRun(
            benchmark_id=benchmark_id,
            workflow_run_id=workflow_run_id,
            benchmark_family=benchmark_family,
            dataset_ref=dataset_ref,
            dataset_version=dataset_version,
            quantum_service_id=quantum_service_id,
            classical_service_id=classical_service_id,
        )
        logger.info(
            "benchmark %s created family=%s q=%s c=%s",
            benchmark_id,
            benchmark_family,
            quantum_service_id,
            classical_service_id,
        )
        return run

    def record_quantum_result(
        self,
        run: BenchmarkRun,
        metrics: BenchmarkMetrics,
        *,
        peer_id: str | None = None,
    ) -> BenchmarkRun:
        updated = run.model_copy(
            update={
                "quantum_metrics": metrics,
                "quantum_peer_id": peer_id,
                "status": BenchmarkRunStatus.CLASSICAL_RUNNING
                if run.classical_service_id
                else BenchmarkRunStatus.COMPARING,
            }
        )
        logger.info("benchmark %s: quantum result recorded", run.benchmark_id)
        return updated

    def record_classical_result(
        self,
        run: BenchmarkRun,
        metrics: BenchmarkMetrics,
        *,
        peer_id: str | None = None,
    ) -> BenchmarkRun:
        updated = run.model_copy(
            update={
                "classical_metrics": metrics,
                "classical_peer_id": peer_id,
                "status": BenchmarkRunStatus.COMPARING,
            }
        )
        logger.info("benchmark %s: classical result recorded", run.benchmark_id)
        return updated

    def finalize(self, run: BenchmarkRun) -> BenchmarkRun:
        comparison = run.compute_comparison()
        finalized = run.model_copy(
            update={
                "comparison_summary": comparison,
                "status": BenchmarkRunStatus.COMPLETED,
                "completed_at": _utc_now(),
            }
        )
        logger.info(
            "benchmark %s COMPLETED comparison=%s",
            run.benchmark_id,
            comparison,
        )
        return finalized
