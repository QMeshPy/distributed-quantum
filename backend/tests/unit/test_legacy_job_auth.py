"""Legacy routes must use the same identity boundary as the current APIs."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from quantum_backend_v2.api.deps.auth import configure_auth
from quantum_backend_v2.api.errors import register_exception_handlers
from quantum_backend_v2.api.routers import agent, pharma
from quantum_backend_v2.agent.models import AgentSession
from quantum_backend_v2.config.models import MongoSettings
from quantum_backend_v2.persistence.mongodb import build_mongo_runtime


@pytest.fixture
def client(monkeypatch):
    configure_auth(enabled=True, allow_dev_bearer_tokens=True)
    pharma._JOB_STORE.clear()
    monkeypatch.setattr("importlib.util.find_spec", lambda name: object())
    monkeypatch.setattr(pharma, "_run_pharma_pipeline", lambda *_: None)
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(agent.router)
    app.include_router(pharma.router)
    with TestClient(app) as client:
        yield client
    pharma._JOB_STORE.clear()
    configure_auth(enabled=True)


def auth(user):
    return {"Authorization": f"Bearer dev-{user}"}


@pytest.mark.parametrize("path", [
    "/api/v1/agent/budget", "/api/v1/agent/models/available",
    "/api/v1/agent/models/default", "/api/v1/pharma/jobs",
])
def test_legacy_routes_reject_anonymous(client, path):
    assert client.get(path).status_code == 401


def test_agent_passes_authenticated_owner(client, monkeypatch):
    service = SimpleNamespace(list_sessions=AsyncMock(return_value=[]),
                              get_session=AsyncMock(return_value=None))
    monkeypatch.setattr(agent, "AgentService", lambda: service)
    assert client.get("/api/v1/agent/sessions", headers=auth("alice")).json() == []
    service.list_sessions.assert_awaited_once_with("alice")
    assert client.get("/api/v1/agent/sessions/bobs", headers=auth("alice")).status_code == 404
    service.get_session.assert_awaited_once_with("bobs", "alice")


def test_agent_websocket_requires_identity_and_session_ownership(client, monkeypatch):
    service = SimpleNamespace(get_session=AsyncMock(return_value=None))
    monkeypatch.setattr(agent, "AgentService", lambda: service)
    for headers in ({}, auth("alice")):
        with pytest.raises(WebSocketDisconnect) as exc:
            with client.websocket_connect("/api/v1/agent/sessions/bobs/stream", headers=headers):
                pytest.fail("unauthorized stream accepted")
        assert exc.value.code == 1008
    service.get_session.assert_awaited_once_with("bobs", "alice")


def test_pharma_jobs_are_owner_scoped(client):
    submitted = client.post("/api/v1/pharma/submit", headers=auth("alice"),
                            json={"mode": "discovery", "target_pdb_id": "1abc"})
    assert submitted.status_code == 202, submitted.text
    job_id = submitted.json()["job_id"]
    path = f"/api/v1/pharma/jobs/{job_id}"
    assert len(client.get("/api/v1/pharma/jobs", headers=auth("alice")).json()) == 1
    assert client.get("/api/v1/pharma/jobs", headers=auth("bob")).json() == []
    assert client.get(path, headers=auth("bob")).status_code == 404
    assert client.get(f"{path}/live", headers=auth("bob")).status_code == 404
    assert client.delete(path, headers=auth("bob")).status_code == 404
    assert pharma._JOB_STORE[job_id]["status"] == "queued"
    assert client.delete(path, headers=auth("alice")).status_code == 204
    assert pharma._JOB_STORE[job_id]["status"] == "cancelled"


def test_disabled_auth_keeps_local_access(client):
    configure_auth(enabled=False)
    assert client.get("/api/v1/agent/budget").status_code == 200
    response = client.post("/api/v1/pharma/submit",
                           json={"mode": "discovery", "target_pdb_id": "1abc"})
    assert response.status_code == 202
    assert client.get(f"/api/v1/pharma/jobs/{response.json()['job_id']}").status_code == 200


def test_legacy_sessions_registered_for_beanie():
    runtime = build_mongo_runtime(MongoSettings(target="local", local_uri="mongodb://localhost"))
    assert AgentSession in runtime.document_models


def test_pharma_missing_optional_stack_rejects_before_creating_job(client, monkeypatch):
    monkeypatch.setattr("importlib.util.find_spec", lambda name: None)
    response = client.post("/api/v1/pharma/submit", headers=auth("alice"),
                           json={"mode": "discovery", "target_pdb_id": "1abc"})
    assert response.status_code == 503
    assert "uv sync --locked --extra pharma" in response.json()["detail"]
    assert not pharma._JOB_STORE


@pytest.mark.anyio
@pytest.mark.parametrize("cancelled, startup_fails", [(True, False), (False, True)])
async def test_pharma_terminal_state_survives_completion_or_startup_failure(
    monkeypatch, cancelled, startup_fails,
):
    import sys
    from types import ModuleType

    job_id = "pharma_test"
    pharma._JOB_STORE[job_id] = {"status": "queued", "log_lines": []}
    orchestrator_module = ModuleType("quantum_backend_v2.pharma.orchestrator")

    class Orchestrator:
        state = SimpleNamespace(value="completed")

        def __init__(self, **kwargs):
            if startup_fails:
                raise ImportError("optional runtime cannot load")

        async def run(self, **kwargs):
            if cancelled:
                pharma._JOB_STORE[job_id].update(status="cancelled", state="failed")
            return SimpleNamespace(candidates=[], model_dump=lambda **_: {})

    orchestrator_module.PharmaOrchestrator = Orchestrator
    monkeypatch.setitem(sys.modules, orchestrator_module.__name__, orchestrator_module)
    config = pharma.PharmaWorkflowConfig(mode="discovery", target_pdb_id="1abc")
    try:
        await pharma._run_pharma_pipeline_async(job_id, config)
        assert pharma._JOB_STORE[job_id]["status"] == ("cancelled" if cancelled else "failed")
        if startup_fails:
            assert "optional runtime" in pharma._JOB_STORE[job_id]["error"]
    finally:
        pharma._JOB_STORE.clear()
