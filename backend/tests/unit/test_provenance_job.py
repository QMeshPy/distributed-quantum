"""Real circuit-job orchestration with fake database and execution boundaries."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, ClassVar

import httpx
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from quantum_backend_v2.api.deps import auth
from quantum_backend_v2.api.routers.circuits import build_circuits_router
from quantum_backend_v2.api.routers.provenance import build_provenance_router
from quantum_backend_v2.application import parity, provenance
from quantum_backend_v2.config import KuboSettings
from quantum_backend_v2.persistence.mongodb import WorkflowRunDocument
from quantum_backend_v2.provenance.hashing import bundle_hash, canonical_json
from quantum_backend_v2.provenance.models import ProvenanceBundle
from quantum_backend_v2.provenance.service import ProvenanceService

KUBO_SECRET = "fixture-kubo-secret-with-at-least-32-characters"


@dataclass
class MemoryBundleDocument:
    bundle_id: str
    workflow_run_id: str
    payload: dict[str, Any]
    content_hash: str
    created_at: datetime
    stored: ClassVar[dict[str, MemoryBundleDocument]] = {}

    @classmethod
    async def find_one(cls, query: dict[str, str]) -> MemoryBundleDocument | None:
        return cls.stored.get(query["bundle_id"])

    async def insert(self) -> MemoryBundleDocument:
        self.stored[self.bundle_id] = self
        return self

    async def save(self) -> MemoryBundleDocument:
        self.stored[self.bundle_id] = self
        return self

    @classmethod
    def get_pymongo_collection(cls) -> MemoryBundleCollection:
        return MemoryBundleCollection(cls.stored)


@dataclass
class MemoryBundleCollection:
    """The one atomic update publishing uses: push a storage ref if none is from Kubo."""

    stored: dict[str, MemoryBundleDocument]

    async def update_one(self, query: dict[str, Any], update: dict[str, Any]) -> None:
        document = self.stored.get(query["bundle_id"])
        backend = query["payload.storage.backend"]["$ne"]
        storage = document.payload.get("storage", []) if document else []
        if document is None or any(ref.get("backend") == backend for ref in storage):
            return
        document.payload = {
            **document.payload,
            "storage": [*storage, update["$push"]["payload.storage"]],
        }


@dataclass
class MemoryPlanDocument:
    id: str
    workflow_run_id: str
    payload: dict[str, Any]

    async def insert(self) -> MemoryPlanDocument:
        return self


class ScriptedBridge:
    """Execution boundary only; job processing and provenance code stay real."""

    async def wait_for_service_peers(self) -> None:
        return None

    def compile_plan(self, circuit_text: str) -> SimpleNamespace:
        return SimpleNamespace(plan_id="plan-1", fragment_order=("frag-1",))

    def serialize_plan(self, plan: object) -> dict[str, Any]:
        return {"plan_id": "plan-1"}

    async def iter_fragment_executions(self, **kwargs: object) -> AsyncIterator[SimpleNamespace]:
        yield SimpleNamespace(fragment_result={"fragment_id": "frag-1"}, state=None)

    def serialize_fragment_result(self, result: object, **kwargs: object) -> dict[str, Any]:
        return {"fragment_id": "frag-1", "finished_at": "2026-10-21T00:00:00Z"}

    def build_quantum_result(self, **kwargs: object) -> dict[str, Any]:
        return {"counts": {"0": 512, "1": 512}}


@pytest.mark.anyio
@pytest.mark.parametrize("storage_fails", [False, True])
async def test_completed_job_persists_verifiable_provenance(
    monkeypatch: pytest.MonkeyPatch, storage_fails: bool
) -> None:
    MemoryBundleDocument.stored = {}
    now = datetime(2026, 10, 21, tzinfo=timezone.utc)
    run = WorkflowRunDocument.model_construct(
        id="workflow-1",
        workflow_definition_id="circuit-execution",
        owner_user_id="owner-1",
        workflow_type="quantum_circuit",
        status="QUEUED",
        input_snapshot={"circuit": "h q[0];"},
        created_at=now,
        updated_at=now,
    )

    async def get_run(cls: type[WorkflowRunDocument], run_id: str) -> WorkflowRunDocument:
        return run

    async def save_run(self: WorkflowRunDocument) -> WorkflowRunDocument:
        return self

    async def fail_insert(self: MemoryBundleDocument) -> None:
        raise OSError("database unavailable")

    monkeypatch.setattr(WorkflowRunDocument, "get", classmethod(get_run))
    monkeypatch.setattr(WorkflowRunDocument, "save", save_run)
    monkeypatch.setattr(parity, "ExecutionPlanDocument", MemoryPlanDocument)
    monkeypatch.setattr(parity, "_utc_now", lambda: now)
    monkeypatch.setattr(provenance, "ProvenanceBundleDocument", MemoryBundleDocument)
    if storage_fails:
        monkeypatch.setattr(MemoryBundleDocument, "insert", fail_insert)
    service = object.__new__(parity.CircuitJobService)
    monkeypatch.setattr(service, "_quantum_bridge", ScriptedBridge(), raising=False)
    await service.process(run.id)
    if storage_fails:
        assert run.status == "FAILED"
        assert not MemoryBundleDocument.stored
        assert "provenance_bundle_id" not in run.output_snapshot
        return

    assert run.status == "COMPLETED"
    bundle_id = run.output_snapshot["provenance_bundle_id"]
    assert bundle_id == "provenance-workflow-1"
    assert len(MemoryBundleDocument.stored) == 1
    assert await provenance.record_run_provenance(run) == bundle_id
    assert len(MemoryBundleDocument.stored) == 1
    verifier = ProvenanceService(provenance.MongoProvenanceRepository())
    report = await verifier.verify(bundle_id, user_id="owner-1", is_admin=False)
    assert report is not None and report.status == "partially_verified"
    monkeypatch.setattr(auth, "_auth_required", False)
    app = FastAPI()
    app.include_router(build_circuits_router(job_service=service))
    app.include_router(build_provenance_router(service=verifier))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        job_response = await client.get(f"/api/v1/jobs/{run.id}")
        assert job_response.status_code == 200
        assert job_response.json()["provenance_bundle_id"] == bundle_id
        response = await client.get(f"/api/v1/provenance/{bundle_id}/verify")
        assert response.status_code == 200
        assert response.json()["status"] == "partially_verified"
    run.output_snapshot["result"]["quantum_result"]["counts"]["0"] = 999
    report = await verifier.verify(bundle_id, user_id="owner-1", is_admin=False)
    assert report is not None and report.status == "unverified"
    with pytest.raises(ValueError, match="different provenance commitment"):
        await provenance.record_run_provenance(run)


def kubo_transport(*, available: bool, uploads: list[bytes]) -> httpx.MockTransport:
    """Fake node that names single-chunk uploads the way Kubo does: raw, sha2-256."""

    async def handle(request: httpx.Request) -> httpx.Response:
        if not available:
            raise httpx.ConnectError("kubo is down")
        body = await request.aread()
        # The multipart body carries the canonical JSON between its boundary lines.
        data = body.split(b"\r\n\r\n", 1)[1].rsplit(b"\r\n--", 1)[0]
        uploads.append(data)
        return httpx.Response(
            200,
            json={"Name": "content", "Hash": provenance._raw_cid(data), "Size": str(len(data))},
        )

    return httpx.MockTransport(handle)


async def run_job(
    monkeypatch: pytest.MonkeyPatch, publisher: provenance.BundlePublisher | None
) -> WorkflowRunDocument:
    MemoryBundleDocument.stored = {}
    now = datetime(2026, 10, 21, tzinfo=timezone.utc)
    run = WorkflowRunDocument.model_construct(
        id="workflow-1",
        workflow_definition_id="circuit-execution",
        owner_user_id="owner-1",
        workflow_type="quantum_circuit",
        status="QUEUED",
        input_snapshot={"circuit": "h q[0];"},
        created_at=now,
        updated_at=now,
    )

    async def get_run(cls: type[WorkflowRunDocument], run_id: str) -> WorkflowRunDocument:
        return run

    async def save_run(self: WorkflowRunDocument) -> WorkflowRunDocument:
        return self

    monkeypatch.setattr(WorkflowRunDocument, "get", classmethod(get_run))
    monkeypatch.setattr(WorkflowRunDocument, "save", save_run)
    monkeypatch.setattr(parity, "ExecutionPlanDocument", MemoryPlanDocument)
    monkeypatch.setattr(parity, "_utc_now", lambda: now)
    monkeypatch.setattr(provenance, "ProvenanceBundleDocument", MemoryBundleDocument)
    service = object.__new__(parity.CircuitJobService)
    monkeypatch.setattr(service, "_quantum_bridge", ScriptedBridge(), raising=False)
    monkeypatch.setattr(service, "_bundle_publisher", publisher, raising=False)
    await service.process(run.id)
    return run


@pytest.mark.anyio
async def test_completed_job_publishes_bundle_to_kubo(monkeypatch: pytest.MonkeyPatch) -> None:
    uploads: list[bytes] = []
    publisher = provenance.KuboBundlePublisher(
        KuboSettings(rpc_secret=KUBO_SECRET),
        transport=kubo_transport(available=True, uploads=uploads),
    )
    run = await run_job(monkeypatch, publisher)

    assert run.status == "COMPLETED"
    bundle_id = run.output_snapshot["provenance_bundle_id"]
    stored = MemoryBundleDocument.stored[bundle_id]
    (reference,) = ProvenanceBundle.model_validate(stored.payload).storage
    assert reference.backend == "kubo"
    assert run.output_snapshot["provenance_publication"] == {
        "status": "published",
        "cid": reference.cid,
    }
    # The uploaded bytes hash to the CID and parse back to the committed bundle.
    (uploaded,) = uploads
    assert provenance._raw_cid(uploaded) == reference.cid
    published = ProvenanceBundle.model_validate_json(uploaded)
    assert bundle_hash(published) == stored.content_hash
    assert published.storage == ()
    # Attaching the location leaves the commitment and the stored evidence intact.
    assert bundle_hash(ProvenanceBundle.model_validate(stored.payload)) == stored.content_hash
    assert await provenance.record_run_provenance(run) == bundle_id
    verifier = ProvenanceService(provenance.MongoProvenanceRepository())
    report = await verifier.verify(bundle_id, user_id="owner-1", is_admin=False)
    assert report is not None and report.status == "partially_verified"
    # A second publication attempt reuses the reference instead of adding another.
    assert await provenance.publish_run_provenance(bundle_id, publisher) == {
        "status": "published",
        "cid": reference.cid,
    }
    assert len(uploads) == 1


@pytest.mark.anyio
async def test_public_gateway_adds_an_evidence_link(monkeypatch: pytest.MonkeyPatch) -> None:
    publisher = provenance.KuboBundlePublisher(
        KuboSettings(rpc_secret=KUBO_SECRET),
        public_gateway_url="https://ipfs.example.com",
        transport=kubo_transport(available=True, uploads=[]),
    )
    run = await run_job(monkeypatch, publisher)

    stored = MemoryBundleDocument.stored[run.output_snapshot["provenance_bundle_id"]]
    (reference,) = ProvenanceBundle.model_validate(stored.payload).storage
    assert reference.url == f"https://ipfs.example.com/ipfs/{reference.cid}?filename=bundle.json"


@pytest.mark.anyio
async def test_kubo_down_keeps_completed_run_and_marks_bundle_unpublished(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    publisher = provenance.KuboBundlePublisher(
        KuboSettings(rpc_secret=KUBO_SECRET),
        transport=kubo_transport(available=False, uploads=[]),
    )
    run = await run_job(monkeypatch, publisher)

    assert run.status == "COMPLETED"
    assert run.output_snapshot["result"]["quantum_result"] == {"counts": {"0": 512, "1": 512}}
    assert run.output_snapshot["provenance_publication"] == {"status": "unpublished"}
    bundle_id = run.output_snapshot["provenance_bundle_id"]
    stored = MemoryBundleDocument.stored[bundle_id]
    assert ProvenanceBundle.model_validate(stored.payload).storage == ()
    verifier = ProvenanceService(provenance.MongoProvenanceRepository())
    report = await verifier.verify(bundle_id, user_id="owner-1", is_admin=False)
    assert report is not None and report.status == "partially_verified"


@pytest.mark.anyio
async def test_unconfigured_publisher_leaves_run_untouched(monkeypatch: pytest.MonkeyPatch) -> None:
    run = await run_job(monkeypatch, None)

    assert run.status == "COMPLETED"
    assert "provenance_publication" not in run.output_snapshot


@pytest.mark.anyio
async def test_publisher_rejects_unverifiable_uploads() -> None:
    payload = {"bundle_id": "provenance-1", "storage": [], "anchors": []}
    wrong = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json={"Name": "content", "Hash": provenance._raw_cid(b"other"), "Size": "5"},
        )
    )
    publisher = provenance.KuboBundlePublisher(
        KuboSettings(rpc_secret=KUBO_SECRET), transport=wrong
    )
    with pytest.raises(ValueError, match="does not match"):
        await publisher.publish(payload)

    calls: list[httpx.Request] = []

    def unreachable(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(500)

    publisher = provenance.KuboBundlePublisher(
        KuboSettings(rpc_secret=KUBO_SECRET), transport=httpx.MockTransport(unreachable)
    )
    oversized = {**payload, "summary": {"blob": "x" * (provenance._MAX_PUBLISHED_BYTES + 1)}}
    with pytest.raises(ValueError, match="single-block"):
        await publisher.publish(oversized)
    assert not calls
    assert canonical_json(payload)
