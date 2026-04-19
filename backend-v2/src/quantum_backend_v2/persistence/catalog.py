"""Persistence ownership catalogs for backend v2."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict


class PostgresTable(str, Enum):
    """Transactional entities owned by Neon Postgres."""

    USERS = "users"
    ORGANIZATIONS = "organizations"
    PROJECTS = "projects"
    API_KEYS = "api_keys"
    SERVICE_ACCOUNTS = "service_accounts"
    WORKFLOW_DEFINITIONS = "workflow_definitions"
    WORKFLOW_RUNS = "workflow_runs"
    JOB_OWNERSHIP = "job_ownership"
    PLAN_SNAPSHOTS = "plan_snapshots"
    IDEMPOTENCY_RECORDS = "idempotency_records"
    PACKAGE_APPROVAL_RECORDS = "package_approval_records"
    POLICY_STATE = "policy_state"
    QUOTAS = "quotas"
    AUDIT_LOGS = "audit_logs"
    PEER_ENROLLMENTS = "peer_enrollments"
    TRUST_DECISIONS = "trust_decisions"


class MongoCollection(str, Enum):
    """Document and projection collections owned by MongoDB."""

    PEER_CAPABILITIES = "peer_capabilities"
    TOPOLOGY_PROJECTIONS = "topology_projections"
    PROVENANCE_GRAPHS = "provenance_graphs"
    BENCHMARK_RESULTS = "benchmark_results"
    WORKFLOW_EVIDENCE = "workflow_evidence"
    ARTIFACT_METADATA = "artifact_metadata"
    TELEMETRY_PROJECTIONS = "telemetry_projections"
    TELEMETRY_TIME_SERIES = "telemetry_time_series"


class PersistenceCatalog(BaseModel):
    """High-level ownership map for durable stores."""

    model_config = ConfigDict(extra="forbid")

    postgres_tables: tuple[PostgresTable, ...]
    mongo_collections: tuple[MongoCollection, ...]


def default_persistence_catalog() -> PersistenceCatalog:
    """Return the default ownership catalog from the migration plan."""
    return PersistenceCatalog(
        postgres_tables=tuple(PostgresTable),
        mongo_collections=tuple(MongoCollection),
    )
