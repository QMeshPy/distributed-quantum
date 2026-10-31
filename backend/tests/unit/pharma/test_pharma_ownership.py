from unittest.mock import AsyncMock
from fastapi import FastAPI
from fastapi.testclient import TestClient
from quantum_backend_v2.api.deps.auth import require_authenticated, _dev_bypass_user
from quantum_backend_v2.api.routers import pharma


def test_pharma_owner_isolation(monkeypatch):
    monkeypatch.setattr(pharma, '_JOB_STORE', {})
    monkeypatch.setattr(pharma, '_run_pharma_pipeline', AsyncMock())
    app = FastAPI()
    app.include_router(pharma.router)
    user = _dev_bypass_user().model_copy(update={'user_id': 'owner', 'roles': frozenset()})
    app.dependency_overrides[require_authenticated] = lambda: user
    client = TestClient(app)
    response = client.post('/api/v1/pharma/submit', json={'mode':'discovery','target_pdb_id':'6LU7','candidate_count':10})
    assert response.status_code == 202
    jid = response.json()['job_id']
    assert pharma._JOB_STORE[jid].get('owner_user_id') == 'owner'
    assert client.get(f'/api/v1/pharma/jobs/{jid}').status_code == 200
    user = user.model_copy(update={'user_id':'stranger'})
    assert client.get('/api/v1/pharma/jobs').json() == []
    for suffix in ('', '/live'):
        assert client.get(f'/api/v1/pharma/jobs/{jid}{suffix}').status_code == 404
    assert client.delete(f'/api/v1/pharma/jobs/{jid}').status_code == 404
    pharma._JOB_STORE[jid].pop('owner_user_id')
    assert client.get(f'/api/v1/pharma/jobs/{jid}').status_code == 404
