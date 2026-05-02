"""SQLAlchemy runtime and ORM models for Neon/local Postgres."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from quantum_backend_v2.config import PostgresSettings, PostgresTarget


NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class PostgresBase(DeclarativeBase):
    """Declarative base for transactional Postgres entities."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class TimestampedRecordMixin:
    """Common created/updated columns."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class PlatformUserRecord(TimestampedRecordMixin, PostgresBase):
    """Centralized user identity record."""

    __tablename__ = "platform_users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    external_subject: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class WorkflowDefinitionRecord(TimestampedRecordMixin, PostgresBase):
    """Transactional workflow definition header."""

    __tablename__ = "workflow_definitions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(
        ForeignKey("platform_users.id"),
        nullable=False,
    )
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class PeerEnrollmentRecord(TimestampedRecordMixin, PostgresBase):
    """Enrollment state for external or internal peers."""

    __tablename__ = "peer_enrollments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    peer_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    owner_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("platform_users.id"),
        nullable=True,
    )
    trust_tier: Mapped[str] = mapped_column(String(32), nullable=False)
    enrollment_status: Mapped[str] = mapped_column(String(32), nullable=False)
    published_service_count: Mapped[int] = mapped_column(default=0, nullable=False)
    capability_summary: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class WorkflowRunRecord(TimestampedRecordMixin, PostgresBase):
    """Durable header for a workflow execution run."""

    __tablename__ = "workflow_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workflow_definition_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    owner_user_id: Mapped[str] = mapped_column(
        ForeignKey("platform_users.id"), nullable=False, index=True
    )
    project_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    workflow_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="submitted")
    input_snapshot: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)
    output_snapshot: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)
    fragment_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_fragments: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_fragments: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    artifact_bundle_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    benchmark_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ExecutionPlanRecord(TimestampedRecordMixin, PostgresBase):
    """Durable execution plan payload keyed by plan_id."""

    __tablename__ = "execution_plans"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workflow_run_id: Mapped[str] = mapped_column(
        ForeignKey("workflow_runs.id"), nullable=False, index=True
    )
    payload: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)


class FinancialJobRecord(TimestampedRecordMixin, PostgresBase):
    """Durable financial analysis job state."""

    __tablename__ = "financial_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("platform_users.id"), nullable=True, index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    row_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    col_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_payload: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)


class OptionsJobRecord(TimestampedRecordMixin, PostgresBase):
    """Durable real options pricing job state."""

    __tablename__ = "options_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("platform_users.id"), nullable=True, index=True
    )
    option_type: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_payload: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)


class ReservationEventRecord(PostgresBase):
    """Append-only reservation event log — never updated, only inserted.

    Transition path: REQUESTED → ACCEPTED → COMMITTED → CANCELLED | EXPIRED | REJECTED
    """

    __tablename__ = "reservation_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    reservation_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    workflow_run_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    fragment_id: Mapped[str] = mapped_column(String(64), nullable=False)
    transition: Mapped[str] = mapped_column(String(32), nullable=False)
    requesting_peer_id: Mapped[str] = mapped_column(String(255), nullable=False)
    accepting_peer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    service_id: Mapped[str] = mapped_column(String(120), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ExecutionEventRecord(PostgresBase):
    """Append-only execution event log — never updated, only inserted.

    Transition path: DISPATCHED → RUNNING → CHECKPOINTED* → COMPLETED | FAILED | RETRYING
    """

    __tablename__ = "execution_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    execution_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    reservation_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    workflow_run_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    fragment_id: Mapped[str] = mapped_column(String(64), nullable=False)
    transition: Mapped[str] = mapped_column(String(32), nullable=False)
    executing_peer_id: Mapped[str] = mapped_column(String(255), nullable=False)
    service_id: Mapped[str] = mapped_column(String(120), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    retry_attempt: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    fidelity_score: Mapped[float | None] = mapped_column(nullable=True)
    latency_ms: Mapped[float | None] = mapped_column(nullable=True)
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


@dataclass(frozen=True)
class PostgresRuntime:
    """Async SQLAlchemy runtime for the active Postgres target."""

    target: PostgresTarget
    database: str
    engine: AsyncEngine
    session_factory: async_sessionmaker[AsyncSession]
    migration_dsn: str

    async def probe(self) -> tuple[bool, str | None]:
        """Check whether the current Postgres target is reachable."""
        try:
            async with self.engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
            return True, None
        except Exception as exc:  # pragma: no cover - exercised with fake runtimes in unit tests
            return False, f"{exc.__class__.__name__}: {exc}"


def build_postgres_runtime(settings: PostgresSettings) -> PostgresRuntime | None:
    """Create an async SQLAlchemy runtime for the configured target."""
    app_dsn = settings.effective_app_dsn
    migration_dsn = settings.effective_migration_dsn
    if app_dsn is None or migration_dsn is None:
        return None

    normalized_app_dsn, connect_args = normalize_postgres_connectivity(app_dsn)
    normalized_migration_dsn, _ = normalize_postgres_connectivity(migration_dsn)
    engine = create_async_engine(
        normalized_app_dsn,
        echo=settings.echo,
        pool_pre_ping=settings.pool_pre_ping,
        connect_args=connect_args,
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    return PostgresRuntime(
        target=settings.target,
        database=settings.resolved_database,
        engine=engine,
        session_factory=session_factory,
        migration_dsn=normalized_migration_dsn,
    )


def normalize_postgres_connectivity(dsn: str) -> tuple[str, dict[str, Any]]:
    """Normalize libpq-style URLs for SQLAlchemy asyncpg runtimes."""
    url = make_url(dsn)
    query = dict(url.query)
    connect_args: dict[str, Any] = {}

    sslmode = query.pop("sslmode", None)
    if sslmode is not None:
        connect_args["ssl"] = sslmode

    query.pop("channel_binding", None)
    normalized_url = url.set(query=query)
    return normalized_url.render_as_string(hide_password=False), connect_args
