"""Persistence ownership catalogs for backend v2."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict


class MongoCollection(str, Enum):
    """Document and projection collections owned by MongoDB."""

    # Platform entities (migrated from Postgres)
    PLATFORM_USERS = "platform_users"
    PEER_ENROLLMENTS = "peer_enrollments"
    WORKFLOW_DEFINITIONS = "workflow_definitions"
    WORKFLOW_RUNS = "workflow_runs"
    EXECUTION_PLANS = "execution_plans"
    FINANCIAL_JOBS = "financial_jobs"
    OPTIONS_JOBS = "options_jobs"
    RISK_JOBS = "risk_jobs"
    RESERVATION_EVENTS = "reservation_events"
    EXECUTION_EVENTS = "execution_events"
    # Projection / capability documents
    PEER_CAPABILITIES = "peer_capabilities"
    TOPOLOGY_PROJECTIONS = "topology_projections"
    PROVENANCE_GRAPHS = "provenance_graphs"
    BENCHMARK_RESULTS = "benchmark_results"
    WORKFLOW_EVIDENCE = "workflow_evidence"
    ARTIFACT_METADATA = "artifact_metadata"
    TELEMETRY_PROJECTIONS = "telemetry_projections"
    TELEMETRY_TIME_SERIES = "telemetry_time_series"
    FRAGMENT_DESCRIPTORS = "fragment_descriptors"


class PersistenceCatalog(BaseModel):
    """High-level ownership map for durable stores."""

    model_config = ConfigDict(extra="forbid")

    mongo_collections: tuple[MongoCollection, ...]


def default_persistence_catalog() -> PersistenceCatalog:
    """Return the default ownership catalog."""
    return PersistenceCatalog(
        mongo_collections=tuple(MongoCollection),
    )
