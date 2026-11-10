import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from quantum_backend_v2.api.deps.auth import configure_auth
from quantum_backend_v2.api.errors import register_exception_handlers
from quantum_backend_v2.api.routers.filecoin import build_filecoin_router
from quantum_backend_v2.application.filecoin_service import FilecoinConfig


def test_config_cannot_enable_mainnet_or_unbounded_budget():
    with pytest.raises(ValueError):
        FilecoinConfig(chain_id=314)
    with pytest.raises(ValueError):
        FilecoinConfig(
            agents={
                "agent": {
                    "owner_id": "alice",
                    "key_env": "KEY",
                    "address": "0x" + "1" * 40,
                    "max_monthly_usdfc": "999999",
                }
            }
        )


@pytest.mark.anyio
async def test_storage_writes_require_explicit_publication_and_auth():
    class Service:
        calls = 0

        async def upload(self, *args, **kwargs):
            self.calls += 1

    service = Service()
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(build_filecoin_router(service=service))
    configure_auth(enabled=True, allow_dev_bearer_tokens=True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {"agent_id": "agent", "operation_id": "test-write", "data_base64": "eA=="}
        assert (await client.post("/api/v1/filecoin/artifacts", json=payload)).status_code == 401
        assert (
            await client.post(
                "/api/v1/filecoin/artifacts",
                json=payload,
                headers={"Authorization": "Bearer dev-alice"},
            )
        ).status_code == 422
    assert service.calls == 0
