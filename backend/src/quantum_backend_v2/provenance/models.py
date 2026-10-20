"""Provenance domain models — lineage events, bundles, evidence packs."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ProvenanceEventKind(str, Enum):
    """Categories of events captured in a provenance chain."""

    WORKFLOW_SUBMITTED = "workflow.submitted"
    WORKFLOW_PLANNED = "workflow.planned"
    FRAGMENT_ASSIGNED = "fragment.assigned"
    FRAGMENT_DISPATCHED = "fragment.dispatched"
    FRAGMENT_COMPLETED = "fragment.completed"
    FRAGMENT_FAILED = "fragment.failed"
    RESULT_AGGREGATED = "result.aggregated"
    ARTIFACT_STORED = "artifact.stored"
    BENCHMARK_RECORDED = "benchmark.recorded"
    PACKAGE_INSTALLED = "package.installed"
    PEER_JOINED = "peer.joined"


class ProvenanceEvent(BaseModel):
    """Single immutable event in a workflow's provenance chain."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    event_id: str = Field(min_length=8)
    workflow_run_id: str = Field(min_length=8)
    kind: ProvenanceEventKind
    actor_peer_id: str | None = None
    actor_user_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime = Field(default_factory=_utc_now)


Sha256Digest = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


class OracleReference(BaseModel):
    """External price observation; retain its decimal value without float rounding."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    provider: str = Field(min_length=1)
    feed: str = Field(min_length=1)
    round_id: str = Field(min_length=1)
    value: str = Field(min_length=1)
    observed_at: datetime


class StorageReference(BaseModel):
    """Location of evidence; the CID must be checked when retrieving its bytes."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    backend: str = Field(min_length=1)
    cid: str = Field(min_length=1)
    url: str | None = None
    expires_at: datetime | None = None


class ChainAnchor(BaseModel):
    """Anchor receipt and positional proof; existence does not imply verification."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    chain: str = Field(min_length=1)
    tx_hash: str = Field(min_length=1)
    url: str | None = None
    merkle_root: Sha256Digest
    leaf_index: int = Field(ge=0, strict=True)
    leaf_count: int = Field(gt=0, strict=True)
    proof: tuple[Sha256Digest, ...] = Field(default_factory=tuple)
    hash_profile: Literal["qmesh-provenance-sha256-v1"] = "qmesh-provenance-sha256-v1"

    @model_validator(mode="after")
    def validate_position(self) -> ChainAnchor:
        """Reject impossible positions/paths before attempting anchor verification."""
        if self.leaf_index >= self.leaf_count:
            raise ValueError("Leaf index must be smaller than batch size")
        if len(self.proof) != (self.leaf_count - 1).bit_length():
            raise ValueError("Proof length must match batch size")
        return self


class ProvenanceBundle(BaseModel):
    """Complete provenance record for a workflow run — designed for publication."""

    model_config = ConfigDict(extra="forbid")

    bundle_id: str = Field(min_length=3)
    workflow_run_id: str = Field(min_length=8)
    workflow_definition_id: str = Field(min_length=3)
    owner_user_id: str = Field(min_length=3)
    events: tuple[ProvenanceEvent, ...] = Field(default_factory=tuple)
    artifact_refs: tuple[str, ...] = Field(default_factory=tuple)
    peer_log_refs: tuple[str, ...] = Field(default_factory=tuple)
    summary: dict[str, Any] = Field(default_factory=dict)
    is_publishable: bool = False
    created_at: datetime = Field(default_factory=_utc_now)
    input_hash: Sha256Digest | None = None
    plan_id: str | None = None
    fragment_result_hashes: tuple[Sha256Digest, ...] = Field(default_factory=tuple)
    oracle_refs: tuple[OracleReference, ...] = Field(default_factory=tuple)
    storage: tuple[StorageReference, ...] = Field(default_factory=tuple)
    anchors: tuple[ChainAnchor, ...] = Field(default_factory=tuple)

    def event_count_by_kind(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for event in self.events:
            counts[event.kind.value] = counts.get(event.kind.value, 0) + 1
        return counts


class DatasetLineage(BaseModel):
    """Lineage record connecting an input dataset to a workflow run."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    lineage_id: str = Field(min_length=3)
    dataset_ref: str = Field(min_length=3)
    workflow_run_id: str = Field(min_length=8)
    dataset_version: str = Field(min_length=1)
    ingested_at: datetime = Field(default_factory=_utc_now)


class ModelLineage(BaseModel):
    """Lineage record connecting a model version to a workflow run."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    lineage_id: str = Field(min_length=3)
    model_id: str = Field(min_length=3)
    model_version: str = Field(min_length=1)
    workflow_run_id: str = Field(min_length=8)
    applied_at: datetime = Field(default_factory=_utc_now)
