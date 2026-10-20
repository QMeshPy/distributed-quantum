"""Real circuit-job orchestration with fake database and execution boundaries."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, ClassVar

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from quantum_backend_v2.api.deps import auth
from quantum_backend_v2.api.routers.circuits import build_circuits_router
from quantum_backend_v2.api.routers.provenance import build_provenance_router
from quantum_backend_v2.application import parity, provenance
from quantum_backend_v2.persistence.mongodb import WorkflowRunDocument
from quantum_backend_v2.provenance.service import ProvenanceService


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
