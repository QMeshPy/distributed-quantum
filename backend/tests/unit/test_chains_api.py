from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from quantum_backend_v2.api.routers.chains import build_chains_router
from quantum_backend_v2.chains.loader import load_chain_registry
from quantum_backend_v2.chains.models import ChainRegistry


def make_app(registry):
    app = FastAPI()
    app.include_router(build_chains_router(registry=registry))
    return app


def test_public_chains_without_wallet_credentials(monkeypatch):
    for name in ("CDP_API_KEY_ID", "CDP_API_KEY_SECRET", "CDP_WALLET_SECRET"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("QB2_BASE_SEPOLIA_RPC_URL", "https://user:TOP_SECRET@rpc.example/key")
    with TestClient(make_app(load_chain_registry())) as client:
        response = client.get("/api/v1/chains")
        schema = client.get("/openapi.json").json()
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"default_chain_id", "chains"}
    assert body["default_chain_id"] == "eip155:84532"
    assert [c["chain_id"] for c in body["chains"]] == [
        "eip155:84532",
        "eip155:421614",
        "eip155:11155111",
        "eip155:46630",
        "starknet:SN_SEPOLIA",
    ]
    wallet_caps = {
        "explorer_url",
        "create_wallet",
        "get_balance",
        "transfer_stablecoin",
        "verify_transaction",
        "aave_supply",
        "aave_withdraw",
        "faucet_instructions",
    }
    for chain in body["chains"]:
        assert set(chain) == {
            "chain_id",
            "family",
            "display_name",
            "aliases",
            "testnet",
            "native_token",
            "stablecoin",
            "explorers",
            "capabilities",
        }
        assert set(chain["native_token"]) == {"symbol", "decimals"}
        assert (
            chain["aliases"]
            == {
                "eip155:84532": ["base-sepolia"],
                "eip155:421614": ["arbitrum-sepolia"],
                "eip155:11155111": ["ethereum-sepolia"],
                "eip155:46630": ["robinhood-testnet"],
                "starknet:SN_SEPOLIA": ["starknet-sepolia"],
            }[chain["chain_id"]]
        )
        if chain["chain_id"] == "starknet:SN_SEPOLIA":
            assert chain["stablecoin"] is None
        elif chain["chain_id"] != "eip155:46630":
            assert set(chain["stablecoin"]) == {"symbol", "decimals", "address"}
        if chain["chain_id"] in {"eip155:84532", "eip155:421614"}:
            assert set(chain["capabilities"]) == wallet_caps
        elif chain["chain_id"] == "eip155:11155111":
            assert chain["capabilities"] == [
                "explorer_url",
                "verify_transaction",
                "get_price",
                "anchor_root",
            ]
        else:
            assert chain["capabilities"] == ["explorer_url", "verify_transaction"]
            assert chain["stablecoin"] is None
    for private in (
        "TOP_SECRET",
        "rpc_env_var",
        "public_rpc_url",
        "sepolia.base.org",
        "QB2_BASE_SEPOLIA_RPC_URL",
        "QB2_STARKNET_SEPOLIA_RPC_URL",
        "starknet-sepolia.public.blastapi.io",
        "provider_aliases",
        "aave_pool_address",
    ):
        assert private not in response.text
        assert private not in str(schema)
    assert not schema["paths"]["/api/v1/chains"]["get"].get("security")


def test_disabled_networks_are_not_advertised():
    data = load_chain_registry().model_dump()
    for chain in data["chains"]:
        if chain["chain_id"] in {"eip155:421614", "eip155:11155111"}:
            chain["enabled"] = False
    with TestClient(make_app(ChainRegistry.model_validate(data))) as client:
        response = client.get("/api/v1/chains")
    assert [c["chain_id"] for c in response.json()["chains"]] == [
        "eip155:84532",
        "eip155:46630",
        "starknet:SN_SEPOLIA",
    ]


def test_registries_are_scoped_to_each_app():
    original = load_chain_registry()
    data = original.model_dump()
    data["default_chain_id"] = "eip155:11155111"
    with (
        TestClient(make_app(original)) as base,
        TestClient(make_app(ChainRegistry.model_validate(data))) as ethereum,
    ):
        assert ethereum.get("/api/v1/chains").json()["default_chain_id"] == "eip155:11155111"
        assert base.get("/api/v1/chains").json()["default_chain_id"] == "eip155:84532"
