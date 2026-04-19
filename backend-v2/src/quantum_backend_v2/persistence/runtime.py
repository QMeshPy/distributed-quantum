"""Persistence runtime assembly for backend v2."""

from __future__ import annotations

from dataclasses import dataclass, field

from quantum_backend_v2.config.models import PersistenceSettings
from quantum_backend_v2.persistence.catalog import PersistenceCatalog, default_persistence_catalog
from quantum_backend_v2.persistence.local_log import LocalPeerLogStore
from quantum_backend_v2.persistence.models import (
    DatabaseReadiness,
    PersistenceMode,
    PersistenceReadiness,
)
from quantum_backend_v2.persistence.mongodb import MongoRuntime, build_mongo_runtime
from quantum_backend_v2.persistence.postgres import (
    PostgresBase,
    PostgresRuntime,
    build_postgres_runtime,
)


@dataclass(frozen=True)
class PersistenceRuntime:
    """Runtime handles for hybrid persistence without in-memory truth."""

    settings: PersistenceSettings
    peer_log: LocalPeerLogStore
    postgres: PostgresRuntime | None = None
    mongodb: MongoRuntime | None = None
    catalog: PersistenceCatalog = field(default_factory=default_persistence_catalog)

    @classmethod
    def from_settings(cls, settings: PersistenceSettings) -> PersistenceRuntime:
        """Build the persistence runtime from validated settings."""
        return cls(
            settings=settings,
            peer_log=LocalPeerLogStore(
                base_directory=settings.peer_log.directory,
                peer_id=settings.peer_log.peer_id,
                fsync=settings.peer_log.fsync,
            ),
            postgres=build_postgres_runtime(settings.postgres),
            mongodb=build_mongo_runtime(settings.mongodb),
        )

    def snapshot(self) -> PersistenceReadiness:
        """Return an API-friendly configuration snapshot of durable stores."""
        return PersistenceReadiness(
            postgres=_configured_database_snapshot(
                backend="postgresql",
                target=self.settings.postgres.target.value,
                database=self.settings.postgres.resolved_database,
                configured=self.settings.postgres.configured,
            ),
            mongodb=_configured_database_snapshot(
                backend="mongodb",
                target=self.settings.mongodb.target.value,
                database=self.settings.mongodb.database,
                configured=self.settings.mongodb.configured,
            ),
            peer_log=self.peer_log.readiness(),
        )

    async def startup(self) -> None:
        """Initialize database clients that require async setup (for example Beanie)."""
        if self.postgres is not None:
            async with self.postgres.engine.begin() as connection:
                await connection.run_sync(PostgresBase.metadata.create_all)
        if self.mongodb is not None:
            await self.mongodb.initialize_models()

    async def shutdown(self) -> None:
        """Release pooled connections and close database clients."""
        if self.postgres is not None:
            await self.postgres.engine.dispose()
        if self.mongodb is not None:
            await self.mongodb.client.close()

    @property
    def postgres_session_factory(self) -> object:
        """Return the async session factory for injection into routers and services.

        Returns ``None`` if Postgres is not configured, so callers must guard.
        """
        if self.postgres is None:
            return None
        return self.postgres.session_factory

    async def probe(self) -> PersistenceReadiness:
        """Run lightweight readiness checks for configured durable stores."""
        postgres_ready = await _probe_database_runtime(
            backend="postgresql",
            target=self.settings.postgres.target.value,
            database=self.settings.postgres.resolved_database,
            configured=self.settings.postgres.configured,
            runtime=self.postgres,
        )
        mongodb_ready = await _probe_database_runtime(
            backend="mongodb",
            target=self.settings.mongodb.target.value,
            database=self.settings.mongodb.database,
            configured=self.settings.mongodb.configured,
            runtime=self.mongodb,
        )
        return PersistenceReadiness(
            postgres=postgres_ready,
            mongodb=mongodb_ready,
            peer_log=self.peer_log.readiness(),
        )


def _configured_database_snapshot(
    *,
    backend: str,
    target: str,
    database: str,
    configured: bool,
) -> DatabaseReadiness:
    return DatabaseReadiness(
        backend=backend,
        target=target,
        mode=_database_mode(configured),
        database=database,
        configured=configured,
        reachable=False,
        message=None,
    )


async def _probe_database_runtime(
    *,
    backend: str,
    target: str,
    database: str,
    configured: bool,
    runtime: PostgresRuntime | MongoRuntime | None,
) -> DatabaseReadiness:
    if not configured or runtime is None:
        return _configured_database_snapshot(
            backend=backend,
            target=target,
            database=database,
            configured=False,
        )

    reachable, message = await runtime.probe()
    return DatabaseReadiness(
        backend=backend,
        target=target,
        mode=PersistenceMode.READY if reachable else PersistenceMode.UNAVAILABLE,
        database=database,
        configured=True,
        reachable=reachable,
        message=message,
    )


def _database_mode(configured: bool) -> PersistenceMode:
    return PersistenceMode.CONFIGURED if configured else PersistenceMode.NOT_CONFIGURED
