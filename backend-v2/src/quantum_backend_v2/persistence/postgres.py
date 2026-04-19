"""SQLAlchemy runtime and ORM models for Neon/local Postgres."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, MetaData, String, Text, func, text
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
