from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from pymongo.errors import ServerSelectionTimeoutError

from quantum_backend_v2.config import PersistenceSettings
from quantum_backend_v2.config.models import MongoSettings, PeerLogSettings
from quantum_backend_v2.persistence import (
    LocalPeerLogStore,
    MongoCollection,
    PeerLogEventType,
    PeerLogRecord,
    PersistenceRuntime,
    build_mongo_runtime,
    default_persistence_catalog,
)


@pytest.fixture
def mongo_client_factory(monkeypatch):
    client = MagicMock()
    client.admin.command = AsyncMock(return_value={"ok": 1})
    client.close = AsyncMock()
    factory = MagicMock(return_value=client)
    monkeypatch.setattr("quantum_backend_v2.persistence.mongodb.AsyncMongoClient", factory)
    return factory


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


def test_persistence_runtime_snapshot_reports_configured_stores(
    tmp_path, mongo_client_factory
) -> None:
    runtime = PersistenceRuntime.from_settings(
        PersistenceSettings(
            mongodb=MongoSettings(
                target="remote",
                remote_uri="mongodb://mongo.example:27017",
                database="platform",
            ),
            peer_log=PeerLogSettings(
                directory=tmp_path / "peer-logs",
                peer_id="peer-777",
                fsync=False,
            ),
        )
    )

    snapshot = runtime.snapshot()

    assert set(snapshot.model_dump()) == {"mongodb", "peer_log"}
    assert snapshot.mongodb.mode == "configured"
    assert snapshot.mongodb.backend == "mongodb"
    assert snapshot.mongodb.target == "remote"
    assert snapshot.mongodb.database == "platform"
    assert snapshot.mongodb.configured is True
    assert snapshot.mongodb.reachable is False
    assert snapshot.peer_log.mode == "ready"
    assert snapshot.peer_log.peer_id == "peer-777"
    assert snapshot.peer_log.event_count == 0
    mongo_client_factory.return_value.admin.command.assert_not_called()


def test_default_persistence_catalog_covers_core_ownership() -> None:
    catalog = default_persistence_catalog()

    assert MongoCollection.EXECUTION_PLANS in catalog.mongo_collections
    assert MongoCollection.PEER_ENROLLMENTS in catalog.mongo_collections
    assert MongoCollection.PLATFORM_USERS in catalog.mongo_collections
    assert MongoCollection.RESERVATION_EVENTS in catalog.mongo_collections
    assert MongoCollection.EXECUTION_EVENTS in catalog.mongo_collections
    assert MongoCollection.BENCHMARK_RESULTS in catalog.mongo_collections
    assert MongoCollection.PROVENANCE_GRAPHS in catalog.mongo_collections


@pytest.mark.parametrize("target", ["local", "remote"])
def test_mongo_runtime_builder_uses_active_target(target, mongo_client_factory) -> None:
    uris = {
        "local": "mongodb://local.example:27017",
        "remote": "mongodb://remote.example:27017",
    }
    runtime = build_mongo_runtime(
        MongoSettings(
            target=target,
            local_uri=uris["local"],
            remote_uri=uris["remote"],
            database="qb2_platform",
            server_selection_timeout_ms=1200,
        )
    )

    assert runtime is not None
    assert runtime.target == target
    assert runtime.database_name == "qb2_platform"
    assert runtime.uri == uris[target]
    mongo_client_factory.assert_called_once_with(uris[target], serverSelectionTimeoutMS=1200)
    assert runtime.database is mongo_client_factory.return_value.get_database.return_value
    mongo_client_factory.return_value.get_database.assert_called_once_with("qb2_platform")
    document_names = {model.Settings.name for model in runtime.document_models}
    assert {
        "platform_users",
        "peer_enrollments",
        "execution_plans",
        "reservation_events",
        "execution_events",
        "benchmark_results",
        "provenance_bundles",
    } <= document_names


@pytest.mark.parametrize("target", ["local", "remote"])
def test_persistence_requires_selected_mongodb_uri(target, mongo_client_factory) -> None:
    settings = MongoSettings(
        target=target,
        local_uri=None if target == "local" else "mongodb://unused-local.example:27017",
        remote_uri=None if target == "remote" else "mongodb://unused-remote.example:27017",
    )

    assert build_mongo_runtime(settings) is None
    with pytest.raises(RuntimeError, match="MongoDB is not configured"):
        PersistenceRuntime.from_settings(PersistenceSettings(mongodb=settings))
    mongo_client_factory.assert_not_called()


@pytest.mark.anyio
async def test_persistence_startup_initializes_models_and_shutdown_closes_client(
    tmp_path, monkeypatch, mongo_client_factory
) -> None:
    initialize = AsyncMock()
    monkeypatch.setattr("quantum_backend_v2.persistence.mongodb.init_beanie", initialize)
    runtime = PersistenceRuntime.from_settings(
        PersistenceSettings(
            mongodb=MongoSettings(local_uri="mongodb://local.example:27017"),
            peer_log=PeerLogSettings(directory=tmp_path / "peer-logs"),
        )
    )

    await runtime.startup()

    initialize.assert_awaited_once_with(
        database=mongo_client_factory.return_value.get_database.return_value,
        document_models=list(runtime.mongodb.document_models),
    )
    mongo_client_factory.return_value.close.assert_not_awaited()

    await runtime.shutdown()

    mongo_client_factory.return_value.close.assert_awaited_once()


@pytest.mark.anyio
@pytest.mark.parametrize("reachable", [True, False])
async def test_persistence_probe_reports_mongodb_and_peer_log(
    tmp_path, mongo_client_factory, reachable
) -> None:
    ping = mongo_client_factory.return_value.admin.command
    if not reachable:
        ping.side_effect = ServerSelectionTimeoutError("mongo unavailable")
    runtime = PersistenceRuntime.from_settings(
        PersistenceSettings(
            mongodb=MongoSettings(local_uri="mongodb://local.example:27017"),
            peer_log=PeerLogSettings(directory=tmp_path / "peer-logs", peer_id="probe-peer"),
        )
    )
    runtime.peer_log.append(
        PeerLogRecord(
            event_id="evt-probe",
            event_type=PeerLogEventType.PEER_SYNC_CHECKPOINT,
            aggregate_id="probe-peer",
            sequence=1,
            producer_peer_id="probe-peer",
        )
    )

    readiness = await runtime.probe()

    ping.assert_awaited_once_with("ping")
    assert readiness.mongodb.configured is True
    assert readiness.mongodb.reachable is reachable
    assert readiness.mongodb.mode == ("ready" if reachable else "unavailable")
    assert readiness.mongodb.message == (
        None if reachable else "ServerSelectionTimeoutError: mongo unavailable"
    )
    assert readiness.peer_log.mode == "ready"
    assert readiness.peer_log.peer_id == "probe-peer"
    assert readiness.peer_log.event_count == 1
