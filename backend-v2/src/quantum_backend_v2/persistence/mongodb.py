"""Beanie and Async PyMongo runtime for backend-v2 projections."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from beanie import Document, init_beanie
from pydantic import Field
from pymongo import AsyncMongoClient

from quantum_backend_v2.config import MongoSettings, MongoTarget


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PeerCapabilityDocument(Document):
    """Projection of peer capabilities and published services."""

    peer_id: str
    capabilities: list[str] = Field(default_factory=list)
    published_service_ids: list[str] = Field(default_factory=list)
    protocol_versions: dict[str, str] = Field(default_factory=dict)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "peer_capabilities"


class TopologyProjectionDocument(Document):
    """Document-optimized topology view for operators and research tooling."""

    peer_id: str
    connected_peers: list[str] = Field(default_factory=list)
    trust_tier: str
    health_status: str
    observed_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "topology_projections"


class BenchmarkResultDocument(Document):
    """Publishable benchmark projection for quantum-vs-classical comparisons."""

    benchmark_id: str
    workflow_id: str
    quantum_service_id: str
    classical_service_id: str | None = None
    metrics: dict[str, Any] = Field(default_factory=dict)
    evidence_refs: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_utc_now)

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
            PeerCapabilityDocument,
            TopologyProjectionDocument,
            BenchmarkResultDocument,
            ProvenanceBundleDocument,
        ),
    )
