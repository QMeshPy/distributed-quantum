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


@dataclass(frozen=True)
class PersistenceRuntime:
    """Runtime handles for MongoDB-backed persistence."""

    settings: PersistenceSettings
    peer_log: LocalPeerLogStore
    mongodb: MongoRuntime
    catalog: PersistenceCatalog = field(default_factory=default_persistence_catalog)

    @classmethod
    def from_settings(cls, settings: PersistenceSettings) -> PersistenceRuntime:
        """Build the persistence runtime from validated settings."""
        mongo = build_mongo_runtime(settings.mongodb)
        if mongo is None:
            raise RuntimeError(
                "MongoDB is not configured. Set QB2_MONGODB_LOCAL_URI or QB2_MONGODB_REMOTE_URI."
            )
        return cls(
            settings=settings,
            peer_log=LocalPeerLogStore(
                base_directory=settings.peer_log.directory,
                peer_id=settings.peer_log.peer_id,
                fsync=settings.peer_log.fsync,
            ),
            mongodb=mongo,
        )

    def snapshot(self) -> PersistenceReadiness:
        """Return an API-friendly configuration snapshot of durable stores."""
        return PersistenceReadiness(
            mongodb=_configured_database_snapshot(
                backend="mongodb",
                target=self.settings.mongodb.target.value,
                database=self.settings.mongodb.database,
                configured=self.settings.mongodb.configured,
            ),
            peer_log=self.peer_log.readiness(),
        )

    async def startup(self) -> None:
        """Initialize Beanie document models and indexes."""
        await self.mongodb.initialize_models()

    async def shutdown(self) -> None:
        """Close the MongoDB client."""
        await self.mongodb.client.close()

    async def probe(self) -> PersistenceReadiness:
        """Run lightweight readiness checks for configured durable stores."""
        mongodb_ready = await _probe_database_runtime(
            backend="mongodb",
            target=self.settings.mongodb.target.value,
            database=self.settings.mongodb.database,
            configured=self.settings.mongodb.configured,
            runtime=self.mongodb,
        )
        return PersistenceReadiness(
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
    runtime: MongoRuntime | None,
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
