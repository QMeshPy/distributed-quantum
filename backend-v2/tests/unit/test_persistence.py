from __future__ import annotations

from datetime import datetime, timezone

import pytest

from quantum_backend_v2.config import PersistenceSettings
from quantum_backend_v2.config.models import MongoSettings, PeerLogSettings, PostgresSettings
from quantum_backend_v2.persistence import (
    LocalPeerLogStore,
    MongoCollection,
    PeerLogEventType,
    PeerLogRecord,
    PersistenceRuntime,
    PostgresTable,
    build_mongo_runtime,
    build_postgres_runtime,
    default_persistence_catalog,
)


def test_local_peer_log_store_appends_and_replays(tmp_path) -> None:
    store = LocalPeerLogStore(
        base_directory=tmp_path / "peer-logs",
        peer_id="peer-001",
        fsync=False,
    )
    record = PeerLogRecord(
        event_id="evt-001",
        event_type=PeerLogEventType.RESERVATION_TRANSITION,
        aggregate_id="reservation-123",
        sequence=1,
        occurred_at=datetime(2026, 4, 19, 12, 0, tzinfo=timezone.utc),
        producer_peer_id="peer-001",
        payload={"from": "requested", "to": "accepted"},
    )

    store.append(record)

    replayed = store.read_all()
    readiness = store.readiness()

    assert replayed == [record]
    assert readiness.peer_id == "peer-001"
    assert readiness.event_count == 1
    assert readiness.writable is True
    assert readiness.path.endswith("peer-001/peer-events.jsonl")


def test_persistence_runtime_snapshot_reports_configured_stores(tmp_path) -> None:
    runtime = PersistenceRuntime.from_settings(
        PersistenceSettings(
            postgres=PostgresSettings(
                target="neon",
                neon_pooled_dsn="postgresql+asyncpg://pool.example/qb2",
                neon_direct_dsn="postgresql+asyncpg://direct.example/qb2",
                database="platform",
            ),
            mongodb=MongoSettings(
                target="remote",
                remote_uri="mongodb://mongo.example:27017",
                database="projections",
            ),
            peer_log=PeerLogSettings(
                directory=tmp_path / "peer-logs",
                peer_id="peer-777",
                fsync=False,
            ),
        )
    )

    snapshot = runtime.snapshot()

    assert snapshot.postgres.mode == "configured"
    assert snapshot.postgres.backend == "postgresql"
    assert snapshot.postgres.target == "neon"
    assert snapshot.postgres.database == "qb2"
    assert snapshot.postgres.reachable is False
    assert snapshot.mongodb.mode == "configured"
    assert snapshot.mongodb.backend == "mongodb"
    assert snapshot.mongodb.target == "remote"
    assert snapshot.mongodb.database == "projections"
    assert snapshot.mongodb.reachable is False
    assert snapshot.peer_log.mode == "ready"
    assert snapshot.peer_log.peer_id == "peer-777"
    assert snapshot.peer_log.event_count == 0


def test_default_persistence_catalog_covers_core_ownership() -> None:
    catalog = default_persistence_catalog()

    assert PostgresTable.PLAN_SNAPSHOTS in catalog.postgres_tables
    assert PostgresTable.PEER_ENROLLMENTS in catalog.postgres_tables
    assert MongoCollection.BENCHMARK_RESULTS in catalog.mongo_collections
    assert MongoCollection.PROVENANCE_GRAPHS in catalog.mongo_collections


def test_database_runtime_builders_use_active_targets() -> None:
    postgres_runtime = build_postgres_runtime(
        PostgresSettings(
            target="local",
            local_dsn="postgresql+asyncpg://postgres:pw@127.0.0.1:5432/qb2",
            database="qb2",
        )
    )
    mongo_runtime = build_mongo_runtime(
        MongoSettings(
            target="remote",
            remote_uri="mongodb://mongo.example:27017",
            database="qb2_docs",
        )
    )

    assert postgres_runtime is not None
    assert postgres_runtime.database == "qb2"
    assert postgres_runtime.migration_dsn == "postgresql+asyncpg://postgres:pw@127.0.0.1:5432/qb2"
    assert mongo_runtime is not None
    assert mongo_runtime.database_name == "qb2_docs"
    assert mongo_runtime.uri == "mongodb://mongo.example:27017"


@pytest.mark.anyio
async def test_persistence_startup_shutdown_skips_unconfigured_databases(tmp_path) -> None:
    runtime = PersistenceRuntime.from_settings(
        PersistenceSettings(
            postgres=PostgresSettings(target="local", local_dsn=None),
            mongodb=MongoSettings(target="local", local_uri=None),
            peer_log=PeerLogSettings(
                directory=tmp_path / "peer-logs",
                peer_id="peer-lifecycle",
                fsync=False,
            ),
        )
    )

    await runtime.startup()
    await runtime.shutdown()
