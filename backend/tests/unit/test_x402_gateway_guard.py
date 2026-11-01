from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from quantum_backend_v2.api.deps.x402_gateway import (
    X402_GATEWAY_HEADER,
    build_x402_gateway_guard,
)


def _client() -> TestClient:
    app = FastAPI()
    guard = build_x402_gateway_guard("correct-shared-secret")

    @app.get("/probe", dependencies=[Depends(guard)])
    async def probe() -> dict[str, bool]:
        return {"ok": True}

    return TestClient(app)


def test_guard_rejects_missing_and_wrong_secret() -> None:
    client = _client()

    assert client.get("/probe").status_code == 401
    assert client.get("/probe", headers={X402_GATEWAY_HEADER: "wrong"}).status_code == 401


def test_guard_accepts_the_shared_secret() -> None:
    response = _client().get("/probe", headers={X402_GATEWAY_HEADER: "correct-shared-secret"})

    assert response.status_code == 200
    assert response.json() == {"ok": True}
