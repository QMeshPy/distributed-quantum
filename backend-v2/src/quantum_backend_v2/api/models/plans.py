"""Execution plan API models."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class FragmentResponse(BaseModel):
    """Response model for a circuit fragment."""

    fragment_id: str
    service_type: str
    qubits: list[int]
    operation_ids: list[str]
    dependencies: list[str]


class CandidateResponse(BaseModel):
    """Response model for an assignment candidate."""

    node_id: str
    total_cost: float
    latency_cost: float
    failure_risk_cost: float
    entanglement_cost: float
    load_cost: float
    fidelity: float


class AssignmentResponse(BaseModel):
    """Response model for a fragment assignment."""

    fragment_id: str
    primary_node_id: str
    fallback_node_ids: list[str]
    block_id: str | None = None
    stage_index: int | None = None
    candidates: list[CandidateResponse]


class StageResponse(BaseModel):
    """Response model for an execution stage."""

    stage_id: str
    stage_index: int
    block_ids: list[str]
    fragment_ids: list[str]


class BlockResponse(BaseModel):
    """Response model for a parallel execution block."""

    block_id: str
    stage_index: int
    fragment_ids: list[str]
    service_types: list[str]
    active_qubits: list[int]
    state_qubits: list[int]
    input_component_qubits: list[list[int]]
    dependencies: list[str]
    primary_node_id: str
    fallback_node_ids: list[str]
    candidates: list[CandidateResponse]


class ExecutionPlanResponse(BaseModel):
    """Response model for a complete execution plan."""

    plan_id: str
    fragment_order: list[str]
    fragments: dict[str, FragmentResponse]
    assignments: dict[str, AssignmentResponse]
    stages: list[StageResponse] = []
    blocks: dict[str, BlockResponse] = {}
    quality_snapshot_id: str | None = None
