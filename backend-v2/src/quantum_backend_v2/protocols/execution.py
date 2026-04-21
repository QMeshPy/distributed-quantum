"""Execution protocol wire schemas for fragment dispatch, progress, and completion."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ExecutionTransition(str, Enum):
    """Allowed execution state transitions."""

    DISPATCHED = "dispatched"
    RUNNING = "running"
    CHECKPOINTED = "checkpointed"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"
    CANCELLED = "cancelled"


class FragmentDispatchRequest(BaseModel):
    """Coordinator dispatches a fragment to a committed peer."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    execution_id: str = Field(min_length=8)
    reservation_id: str = Field(min_length=8)
    workflow_run_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    input_payload: dict[str, Any] = Field(default_factory=dict)
    max_retries: int = Field(default=2, ge=0, le=10)
    idempotency_key: str = Field(min_length=8)
    dispatched_at: datetime = Field(default_factory=_utc_now)


class DistributedStateHandoff(BaseModel):
    """Quantum state payload handed from one fragment executor to the next."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    num_qubits: int = Field(ge=1)
    qubit_ids: tuple[int, ...] | None = None
    amplitudes: tuple[str, ...] | None = None
    measured_qubits: tuple[int, ...] = Field(default_factory=tuple)
    previous_peer_id: str | None = Field(default=None, min_length=3)

    @model_validator(mode="after")
    def _validate_qubit_ids(self) -> "DistributedStateHandoff":
        if self.qubit_ids is None:
            return self
        if len(self.qubit_ids) != self.num_qubits:
            raise ValueError("qubit_ids length must match num_qubits")
        if len(set(self.qubit_ids)) != len(self.qubit_ids):
            raise ValueError("qubit_ids must be unique")
        return self


class FragmentDescriptor(BaseModel):
    """Serializable fragment description used by remote workers."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    fragment_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    qubits: tuple[int, ...] = Field(default_factory=tuple)
    operation_ids: tuple[str, ...] = Field(default_factory=tuple)
    dependencies: tuple[str, ...] = Field(default_factory=tuple)
    raw_text: str = ""


class FragmentDispatchInput(BaseModel):
    """Structured fragment execution input carried inside `input_payload`."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    plan_id: str = Field(min_length=8)
    block_id: str | None = Field(default=None, min_length=3)
    fragment: FragmentDescriptor | None = None
    fragments: tuple[FragmentDescriptor, ...] = Field(default_factory=tuple)
    state: DistributedStateHandoff

    @model_validator(mode="after")
    def _validate_fragment_bundle(self) -> "FragmentDispatchInput":
        bundle_size = len(self.fragments) + (1 if self.fragment is not None else 0)
        if bundle_size <= 0:
            raise ValueError("dispatch input requires at least one fragment")
        return self

    def fragment_bundle(self) -> tuple[FragmentDescriptor, ...]:
        if self.fragments:
            return self.fragments
        if self.fragment is not None:
            return (self.fragment,)
        return ()


class FragmentDispatchOutput(BaseModel):
    """Remote execution output for one fragment."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    state: DistributedStateHandoff
    block_id: str | None = Field(default=None, min_length=3)
    fragment_ids: tuple[str, ...] = Field(default_factory=tuple)
    component_qubits: tuple[int, ...] = Field(default_factory=tuple)
    gate_count: int = Field(default=0, ge=0)
    circuit_depth: int = Field(default=0, ge=0)
    state_transfer_bytes: int = Field(default=0, ge=0)


class ExecutionProgressEvent(BaseModel):
    """Peer reports execution progress to the coordinator."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    execution_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    executing_peer_id: str = Field(min_length=3)
    transition: ExecutionTransition
    progress_pct: float | None = Field(default=None, ge=0.0, le=100.0)
    checkpoint_ref: str | None = Field(default=None, min_length=3)
    reported_at: datetime = Field(default_factory=_utc_now)


class ExecutionResultPayload(BaseModel):
    """Final result delivered from peer to coordinator on fragment completion."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    execution_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    executing_peer_id: str = Field(min_length=3)
    transition: ExecutionTransition
    output_payload: dict[str, Any] = Field(default_factory=dict)
    latency_ms: float | None = Field(default=None, ge=0.0)
    fidelity_score: float | None = Field(default=None, ge=0.0, le=1.0)
    error_detail: str | None = Field(default=None, max_length=600)
    artifact_refs: list[str] = Field(default_factory=list)
    completed_at: datetime = Field(default_factory=_utc_now)


class ExecutionRetryRequest(BaseModel):
    """Coordinator requests a retry of a failed fragment on an alternative peer."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    execution_id: str = Field(min_length=8)
    original_fragment_id: str = Field(min_length=3)
    retry_attempt: int = Field(ge=1)
    fallback_peer_id: str = Field(min_length=3)
    reason: str | None = Field(default=None, max_length=300)
    requested_at: datetime = Field(default_factory=_utc_now)
