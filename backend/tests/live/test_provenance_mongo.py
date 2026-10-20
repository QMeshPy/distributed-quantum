"""Opt-in real MongoDB checks; each test owns and drops a unique database.

Run against disposable local MongoDB only:
QB2_MONGODB_TEST_URI=mongodb://127.0.0.1:27028 uv run pytest tests/live -q
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from urllib.parse import urlsplit
from uuid import uuid4

import pytest
from beanie import init_beanie
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pymongo import AsyncMongoClient
from pymongo.errors import OperationFailure

from quantum_backend_v2.api.deps import auth
from quantum_backend_v2.api.errors import register_exception_handlers
from quantum_backend_v2.api.routers.provenance import build_provenance_router
from quantum_backend_v2.application.provenance import (
    MongoProvenanceRepository,
    record_run_provenance,
)
from quantum_backend_v2.persistence.mongodb import ProvenanceBundleDocument, WorkflowRunDocument
from quantum_backend_v2.provenance.models import ProvenanceBundle
from quantum_backend_v2.provenance.service import ProvenanceService

pytestmark = pytest.mark.anyio


@pytest.fixture
async def local_mongo() -> AsyncIterator[None]:
    uri = os.getenv("QB2_MONGODB_TEST_URI")
    if not uri:
        pytest.skip("Set QB2_MONGODB_TEST_URI to opt into disposable local MongoDB tests")
    parsed = urlsplit(uri)
    if parsed.scheme != "mongodb" or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        pytest.fail("Live provenance tests accept only local MongoDB")
    client: AsyncMongoClient = AsyncMongoClient(uri, serverSelectionTimeoutMS=2000)
    database_name = f"qmesh_provenance_test_{uuid4().hex}"
    try:
        await client.admin.command("ping")
        await init_beanie(
            database=client[database_name],
            document_models=[ProvenanceBundleDocument, WorkflowRunDocument],
        )
        yield
    finally:
        await client.drop_database(database_name)
        await client.close()


def completed_run() -> WorkflowRunDocument:
    now = datetime(2026, 10, 21, 1, 2, 3, 123456, tzinfo=timezone.utc)
    return WorkflowRunDocument(
        id="workflow-live-1",
        workflow_definition_id="circuit-execution",
        owner_user_id="owner-live-1",
        workflow_type="quantum_circuit",
        status="COMPLETED",
        input_snapshot={"circuit": "h q[0];"},
        artifact_bundle_id="plan-live-1",
        output_snapshot={
            "result": {
                "job_id": "workflow-live-1",
                "fragment_results": [{"fragment_id": "fragment-1"}],
                "quantum_result": {"probabilities": {"0": 0.5, "1": 0.5}},
            }
        },
        completed_at=now,
    )


async def test_real_mongo_reload_and_tamper_detection(local_mongo: None) -> None:
    run = completed_run()
    await run.insert()
    bundle_id = await record_run_provenance(run)
    verifier = ProvenanceService(MongoProvenanceRepository())
    report = await verifier.verify(bundle_id, user_id=run.owner_user_id, is_admin=False)
    assert report is not None and report.status == "partially_verified"
    assert await verifier.verify(bundle_id, user_id="other-user", is_admin=False) is None
    collection = WorkflowRunDocument.get_pymongo_collection()
    await collection.update_one(
        {"_id": run.id},
        {"$set": {"output_snapshot.result.quantum_result.probabilities": {"0": 1.0}}},
    )
    report = await verifier.verify(bundle_id, user_id=run.owner_user_id, is_admin=False)
    assert report is not None and report.status == "unverified"
    assert any(check.name == "result_hash" and check.status == "failed" for check in report.checks)


async def test_real_mongo_legacy_document_loads_without_backfilling_hash(local_mongo: None) -> None:
    run = completed_run()
    await run.insert()
    bundle = ProvenanceBundle(
        bundle_id="legacy-live-1",
        workflow_run_id=run.id,
        workflow_definition_id=run.workflow_definition_id,
        owner_user_id=run.owner_user_id,
    )
    legacy = bundle.model_dump(
        mode="json",
        exclude={
            "input_hash",
            "plan_id",
            "fragment_result_hashes",
            "oracle_refs",
            "storage",
            "anchors",
        },
    )
    await ProvenanceBundleDocument.get_pymongo_collection().insert_one(
        {
            "bundle_id": bundle.bundle_id,
            "workflow_run_id": run.id,
            "payload": legacy,
        }
    )
    collection = ProvenanceBundleDocument.get_pymongo_collection()
    # Simulate deploying the new model/index over a pre-existing legacy record.
    await collection.drop_index("bundle_id_1")
    await init_beanie(
        database=collection.database,
        document_models=[ProvenanceBundleDocument, WorkflowRunDocument],
    )
    assert (await collection.index_information())["bundle_id_1"]["unique"]
    stored = await MongoProvenanceRepository().get_bundle(bundle.bundle_id)
    assert stored is not None and stored.content_hash is None
    assert ProvenanceBundle.model_validate(stored.payload).anchors == ()
    report = await ProvenanceService(MongoProvenanceRepository()).verify(
        bundle.bundle_id, user_id=run.owner_user_id, is_admin=False
    )
    assert report is not None and report.status == "unverified"


async def test_real_mongo_missing_result_keeps_bundle_verifiable(local_mongo: None) -> None:
    run = completed_run()
    await run.insert()
    bundle_id = await record_run_provenance(run)
    await WorkflowRunDocument.get_pymongo_collection().update_one(
        {"_id": run.id}, {"$unset": {"output_snapshot.result": ""}}
    )
    report = await ProvenanceService(MongoProvenanceRepository()).verify(
        bundle_id, user_id=run.owner_user_id, is_admin=False
    )
    assert report is not None
    assert report.status == "partially_verified"
    checks = {check.name: check.status for check in report.checks}
    assert checks["result_hash"] == "unavailable"
    assert checks["fragment_hashes"] == "unavailable"


async def test_real_mongo_malformed_result_fails_verification(local_mongo: None) -> None:
    run = completed_run()
    await run.insert()
    bundle_id = await record_run_provenance(run)
    await WorkflowRunDocument.get_pymongo_collection().update_one(
        {"_id": run.id}, {"$set": {"output_snapshot.result": []}}
    )
    report = await ProvenanceService(MongoProvenanceRepository()).verify(
        bundle_id, user_id=run.owner_user_id, is_admin=False
    )
    assert report is not None and report.status == "unverified"
    assert any(
        check.name == "serialization" and check.status == "failed" for check in report.checks
    )


async def test_real_mongo_corrupt_payload_is_not_reused(local_mongo: None) -> None:
    run = completed_run()
    await run.insert()
    bundle_id = await record_run_provenance(run)
    await ProvenanceBundleDocument.get_pymongo_collection().update_one(
        {"bundle_id": bundle_id}, {"$set": {"payload.summary.result_hash": "0" * 64}}
    )
    with pytest.raises(ValueError, match="different provenance commitment"):
        await record_run_provenance(run)
    assert await ProvenanceBundleDocument.count() == 1


async def test_real_mongo_concurrent_recording_creates_one_bundle(local_mongo: None) -> None:
    run = completed_run()
    await run.insert()
    bundle_ids = await asyncio.gather(*(record_run_provenance(run) for _ in range(8)))
    assert len(set(bundle_ids)) == 1
    assert await ProvenanceBundleDocument.count() == 1


async def test_real_mongo_duplicate_legacy_ids_block_index_without_deleting_data(
    local_mongo: None,
) -> None:
    collection = ProvenanceBundleDocument.get_pymongo_collection()
    await collection.drop_index("bundle_id_1")
    for _ in range(2):
        await collection.insert_one(
            {
                "bundle_id": "legacy-duplicate",
                "workflow_run_id": "workflow-legacy",
                "payload": {},
            }
        )
    with pytest.raises(OperationFailure) as error:
        await init_beanie(
            database=collection.database,
            document_models=[ProvenanceBundleDocument, WorkflowRunDocument],
        )
    assert error.value.code == 11000
    assert await collection.count_documents({"bundle_id": "legacy-duplicate"}) == 2


async def test_real_mongo_conflicting_writers_cannot_overwrite_winner(local_mongo: None) -> None:
    run = completed_run()
    await run.insert()
    changed = run.model_copy(deep=True)
    changed.output_snapshot["result"]["quantum_result"] = {"probabilities": {"0": 1.0}}
    outcomes = await asyncio.gather(
        record_run_provenance(run),
        record_run_provenance(changed),
        return_exceptions=True,
    )
    assert sum(isinstance(outcome, str) for outcome in outcomes) == 1
    assert sum(isinstance(outcome, ValueError) for outcome in outcomes) == 1
    assert await ProvenanceBundleDocument.count() == 1
    loser = changed if isinstance(outcomes[0], str) else run
    before = await ProvenanceBundleDocument.find_one({"bundle_id": f"provenance-{run.id}"})
    assert before is not None
    with pytest.raises(ValueError, match="different provenance commitment"):
        await record_run_provenance(loser)
    after = await ProvenanceBundleDocument.find_one({"bundle_id": before.bundle_id})
    assert after is not None and after.payload == before.payload
    assert after.content_hash == before.content_hash


async def test_real_mongo_http_access_policy(
    local_mongo: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run = completed_run()
    await run.insert()
    bundle_id = await record_run_provenance(run)
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(
        build_provenance_router(service=ProvenanceService(MongoProvenanceRepository()))
    )
    monkeypatch.setattr(auth, "_auth_required", True)
    monkeypatch.setattr(auth, "_allow_dev_bearer_tokens", False)
    path = f"/api/v1/provenance/{bundle_id}/verify"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get(path)).status_code == 401
        owner_headers = {"Authorization": f"Bearer dev-{run.owner_user_id}"}
        assert (await client.get(path, headers=owner_headers)).status_code == 401
        monkeypatch.setattr(auth, "_allow_dev_bearer_tokens", True)
        owner_response = await client.get(path, headers=owner_headers)
        assert owner_response.status_code == 200
        assert owner_response.json()["status"] == "partially_verified"
        assert owner_response.headers["cache-control"] == "private, no-store"
        assert (
            await client.get(path, headers={"Authorization": "Bearer dev-other-user"})
        ).status_code == 404
        await ProvenanceBundleDocument.get_pymongo_collection().update_one(
            {"bundle_id": bundle_id}, {"$set": {"payload.owner_user_id": "attacker"}}
        )
        assert (
            await client.get(path, headers={"Authorization": "Bearer dev-attacker"})
        ).status_code == 404
        authorized = await client.get(path, headers=owner_headers)
        assert authorized.status_code == 200
        assert authorized.json()["status"] == "unverified"
        # The repo's explicit local dev bypass grants admin, not production auth.
        monkeypatch.setattr(auth, "_auth_required", False)
        assert (await client.get(path)).status_code == 200


async def test_real_mongo_retry_after_reload_preserves_commitment(local_mongo: None) -> None:
    run = completed_run()
    await run.insert()
    bundle_id = await record_run_provenance(run)
    await ProvenanceBundleDocument.get_pymongo_collection().update_one(
        {"bundle_id": bundle_id},
        {
            "$set": {
                "payload.storage": [{"backend": "fixture", "cid": "fixture-preserved-on-retry"}]
            }
        },
    )
    restored = await WorkflowRunDocument.get(run.id)
    assert restored is not None
    # BSON stores milliseconds and defaults to naive UTC on retrieval. Neither
    # representation change should invalidate an otherwise identical retry.
    assert restored.completed_at != run.completed_at
    assert await record_run_provenance(restored) == bundle_id
    assert await ProvenanceBundleDocument.count() == 1
    stored = await ProvenanceBundleDocument.find_one({"bundle_id": bundle_id})
    assert stored is not None
    assert stored.payload["storage"][0]["cid"] == "fixture-preserved-on-retry"
