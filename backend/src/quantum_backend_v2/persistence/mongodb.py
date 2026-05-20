"""Beanie and Async PyMongo runtime for all backend persistence."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from beanie import Document, init_beanie
from db.agentkit_collections import (
    AIAgentDocument,
    NotificationDocument,
    PaymentDocument,
    ResearchProposalDocument,
    WalletDocument,
    WorkerPricingDocument,
)
from pydantic import Field
from pymongo import ASCENDING, AsyncMongoClient, IndexModel

from quantum_backend_v2.config import MongoSettings, MongoTarget


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Projection / capability documents (pre-existing)
# ---------------------------------------------------------------------------

class PeerCapabilityDocument(Document):
    """Projection of peer capabilities and published services."""

    peer_id: str
    capabilities: list[str] = Field(default_factory=list)
    published_service_ids: list[str] = Field(default_factory=list)
    network_addresses: list[str] = Field(default_factory=list)
    protocol_versions: dict[str, str] = Field(default_factory=dict)
    last_advertised_at: datetime | None = None
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "peer_capabilities"


class TopologyProjectionDocument(Document):
    """Document-optimized topology view for operators and research tooling."""

    peer_id: str
    connected_peers: list[str] = Field(default_factory=list)
    trust_tier: str
    health_status: str
    active_reservations: int = 0
    active_executions: int = 0
    peer_log_position: int = 0
    observed_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "topology_projections"


class BenchmarkResultDocument(Document):
    """Publishable benchmark projection for quantum-vs-classical comparisons."""

    benchmark_id: str
    owner_user_id: str
    workflow_id: str
    benchmark_family: str
    quantum_service_id: str
    classical_service_id: str | None = None
    metrics: dict[str, Any] = Field(default_factory=dict)
    evidence_refs: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "benchmark_results"


class ProvenanceBundleDocument(Document):
    """Document bundle for workflow evidence and result lineage."""

    bundle_id: str
    workflow_run_id: str
    artifact_refs: list[str] = Field(default_factory=list)
    peer_log_refs: list[str] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "provenance_bundles"


class FragmentDescriptorDocument(Document):
    """Cached VQE descriptors keyed by canonical fragment SMILES.
    Cross-job, cross-user accumulation — never expires."""

    canonical_smiles: str
    fragment_id_hint: str = ""
    homo_energy_ev: float
    lumo_energy_ev: float
    homo_lumo_gap_ev: float
    chemical_hardness_ev: float
    esp_charges: list[float] = Field(default_factory=list)
    ground_state_energy_hartree: float
    qubit_count: int
    gate_count: int
    vqe_iterations: int
    dmet_impurity_size: int | None = None
    source_job_id: str = ""
    computed_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "fragment_descriptors"


# ---------------------------------------------------------------------------
# Platform entity documents (migrated from Postgres)
# ---------------------------------------------------------------------------

class PlatformUserDocument(Document):
    """Centralized user identity record."""

    id: str  # type: ignore[assignment]
    external_subject: str
    email: str
    display_name: str
    is_active: bool = True
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "platform_users"
        indexes = [
            IndexModel("external_subject", unique=True),
            IndexModel("email", unique=True),
        ]


class PeerEnrollmentDocument(Document):
    """Enrollment state for external or internal peers."""

    id: str  # type: ignore[assignment]
    peer_id: str
    owner_user_id: str | None = None
    trust_tier: str
    enrollment_status: str
    published_service_count: int = 0
    capability_summary: dict[str, Any] = Field(default_factory=dict)
    last_seen_at: datetime | None = None
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "peer_enrollments"
        indexes = [
            IndexModel("peer_id", unique=True),
        ]


class WorkflowDefinitionDocument(Document):
    """Transactional workflow definition header."""

    id: str  # type: ignore[assignment]
    owner_user_id: str
    slug: str
    title: str
    description: str | None = None
    is_published: bool = False
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "workflow_definitions"
        indexes = [
            IndexModel("slug", unique=True),
            IndexModel("owner_user_id"),
        ]


class WorkflowRunDocument(Document):
    """Durable header for a workflow execution run."""

    id: str  # type: ignore[assignment]
    workflow_definition_id: str
    owner_user_id: str
    project_id: str | None = None
    workflow_type: str
    status: str = "submitted"
    input_snapshot: dict[str, Any] = Field(default_factory=dict)
    output_snapshot: dict[str, Any] = Field(default_factory=dict)
    fragment_count: int = 0
    completed_fragments: int = 0
    failed_fragments: int = 0
    artifact_bundle_id: str | None = None
    benchmark_run_id: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "workflow_runs"
        indexes = [
            IndexModel("workflow_definition_id"),
            IndexModel("owner_user_id"),
            IndexModel([("owner_user_id", ASCENDING), ("created_at", ASCENDING)]),
        ]


class ExecutionPlanDocument(Document):
    """Durable execution plan payload keyed by plan_id."""

    id: str  # type: ignore[assignment]
    workflow_run_id: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "execution_plans"
        indexes = [
            IndexModel("workflow_run_id"),
        ]


class FinancialJobDocument(Document):
    """Durable financial analysis job state."""

    id: str  # type: ignore[assignment]
    owner_user_id: str | None = None
    filename: str
    status: str
    row_count: int | None = None
    col_count: int | None = None
    error: str | None = None
    result_payload: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "financial_jobs"
        indexes = [
            IndexModel("owner_user_id"),
            IndexModel("status"),
        ]


class OptionsJobDocument(Document):
    """Durable real options pricing job state."""

    id: str  # type: ignore[assignment]
    owner_user_id: str | None = None
    option_type: str
    status: str
    error: str | None = None
    result_payload: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "options_jobs"
        indexes = [
            IndexModel("owner_user_id"),
            IndexModel("status"),
        ]


class RiskJobDocument(Document):
    """Durable Track D quantum risk engine job state."""

    id: str  # type: ignore[assignment]
    owner_user_id: str | None = None
    risk_model: str
    portfolio_size: int = 0
    status: str
    error: str | None = None
    result_payload: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "risk_jobs"
        indexes = [
            IndexModel("owner_user_id"),
            IndexModel("status"),
        ]


class ReservationEventDocument(Document):
    """Append-only reservation event log — never updated, only inserted.

    Transition path: REQUESTED → ACCEPTED → COMMITTED → CANCELLED | EXPIRED | REJECTED
    """

    id: str  # type: ignore[assignment]
    reservation_id: str
    workflow_run_id: str
    fragment_id: str
    transition: str
    requesting_peer_id: str
    accepting_peer_id: str | None = None
    service_id: str
    idempotency_key: str
    reason: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "reservation_events"
        indexes = [
            IndexModel("reservation_id"),
            IndexModel("workflow_run_id"),
            IndexModel("idempotency_key", unique=True),
        ]


class ExecutionEventDocument(Document):
    """Append-only execution event log — never updated, only inserted.

    Transition path: DISPATCHED → RUNNING → CHECKPOINTED* → COMPLETED | FAILED | RETRYING
    """

    id: str  # type: ignore[assignment]
    execution_id: str
    reservation_id: str
    workflow_run_id: str
    fragment_id: str
    transition: str
    executing_peer_id: str
    service_id: str
    idempotency_key: str
    retry_attempt: int = 0
    fidelity_score: float | None = None
    latency_ms: float | None = None
    error_detail: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "execution_events"
        indexes = [
            IndexModel("execution_id"),
            IndexModel("reservation_id"),
            IndexModel("workflow_run_id"),
            IndexModel("idempotency_key", unique=True),
        ]


# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class MongoRuntime:
    """Async Mongo runtime using Beanie-ready document models."""

    target: MongoTarget
    uri: str
    database_name: str
    client: AsyncMongoClient
    document_models: tuple[type[Document], ...]

    @property
    def database(self) -> Any:
        return self.client.get_database(self.database_name)

    async def probe(self) -> tuple[bool, str | None]:
        """Check whether the current Mongo target is reachable."""
        try:
            await self.client.admin.command("ping")
            return True, None
        except Exception as exc:  # pragma: no cover - exercised with fake runtimes in unit tests
            return False, f"{exc.__class__.__name__}: {exc}"

    async def initialize_models(self) -> None:
        """Initialize Beanie collections and indexes for the active database."""
        await init_beanie(
            database=self.database,
            document_models=list(self.document_models),
        )


def build_mongo_runtime(settings: MongoSettings) -> MongoRuntime | None:
    """Create an async Mongo runtime for the configured target."""
    uri = settings.effective_uri
    if uri is None:
        return None

    client = AsyncMongoClient(
        uri,
        serverSelectionTimeoutMS=settings.server_selection_timeout_ms,
    )
    return MongoRuntime(
        target=settings.target,
        uri=uri,
        database_name=settings.database,
        client=client,
        document_models=(
            # Projection documents
            PeerCapabilityDocument,
            TopologyProjectionDocument,
            BenchmarkResultDocument,
            ProvenanceBundleDocument,
            FragmentDescriptorDocument,
            # Platform entity documents (migrated from Postgres)
            PlatformUserDocument,
            PeerEnrollmentDocument,
            WorkflowDefinitionDocument,
            WorkflowRunDocument,
            ExecutionPlanDocument,
            FinancialJobDocument,
            OptionsJobDocument,
            RiskJobDocument,
            ReservationEventDocument,
            ExecutionEventDocument,
            # AgentKit documents
            WalletDocument,
            WorkerPricingDocument,
            ResearchProposalDocument,
            AIAgentDocument,
            PaymentDocument,
            NotificationDocument,
        ),
    )
