"""Arbitrum Sepolia registry + wallet-scoped service helpers (issue #15)."""

from __future__ import annotations

from unittest.mock import MagicMock

from quantum_backend_v2.chains.loader import load_chain_registry
from services.agentkit_service import AgentKitService


def test_arbitrum_sepolia_is_a_wallet_capable_registry_entry():
    registry = load_chain_registry()
    chain = registry.resolve("arbitrum-sepolia")
    assert chain.chain_id == "eip155:421614"
    assert chain.provider_aliases.agentkit == "arbitrum-sepolia"
    assert chain.provider_aliases.cdp == "arbitrum-sepolia"
    assert chain.stablecoin is not None
    assert chain.stablecoin.address == "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d"
    assert chain.aave_pool_address == "0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff"
    assert "create_wallet" in chain.capabilities
    assert "aave_supply" in chain.capabilities
    assert "faucet_instructions" in chain.capabilities


def test_agentkit_for_network_reuses_mongo_and_switches_chain(monkeypatch):
    registry = load_chain_registry()
    monkeypatch.setenv("CDP_API_KEY_ID", "id")
    monkeypatch.setenv("CDP_API_KEY_SECRET", "secret")
    monkeypatch.setenv("CDP_WALLET_SECRET", "wallet-secret")
    monkeypatch.setattr(
        "services.agentkit_service.AsyncIOMotorClient", lambda *_a, **_k: MagicMock()
    )
    base = AgentKitService(registry=registry, network="base-sepolia")
    arb = base.for_network("arbitrum-sepolia")
    assert arb is not base
    assert arb.chain.chain_id == "eip155:421614"
    assert arb.db is base.db
    assert arb.mongo_client is base.mongo_client
    assert base.for_network("eip155:84532") is base
    assert arb.network_id == "arbitrum-sepolia"
