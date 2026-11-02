"""Exercise the real app factory with external services mocked."""

from __future__ import annotations

import importlib
import sys
from importlib.resources import files
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from fastapi.testclient import TestClient

from quantum_backend_v2.chains.loader import RegistryConfigurationError


@pytest.fixture
def application_factory(monkeypatch):
    # Mock the peer boundary before importing bootstrap so these tests never load
    # native networking dependencies or create a real peer host.
    peers = ModuleType("quantum_backend_v2.libp2p")
    peers.__path__ = [str(files("quantum_backend_v2").joinpath("libp2p"))]
    discovery = ModuleType("quantum_backend_v2.discovery.service")
    wallet = ModuleType("services.agentkit_service")
    wallet.AgentKitService = Mock
    import boto3
    import motor.motor_asyncio

    monkeypatch.setattr(boto3, "client", Mock())
    monkeypatch.setattr(motor.motor_asyncio, "AsyncIOMotorClient", MagicMock())
    original_modules = set(sys.modules)
    monkeypatch.setitem(sys.modules, "quantum_backend_v2.libp2p", peers)
    monkeypatch.setitem(sys.modules, "quantum_backend_v2.discovery.service", discovery)
    monkeypatch.setitem(sys.modules, "services.agentkit_service", wallet)
    try:
        models = importlib.import_module("quantum_backend_v2.libp2p.models")
        peers.Libp2pBootstrapPlan = models.Libp2pBootstrapPlan
        peers.Libp2pRuntimeSummary = models.Libp2pRuntimeSummary
        peers.Libp2pRuntime = Mock
        peers.create_libp2p_bootstrap_plan = Mock()
        peers.create_real_libp2p_runtime = Mock()
        discovery.DiscoveryService = Mock
        discovery.build_discovery_service = Mock(
            return_value=SimpleNamespace(start=AsyncMock(), stop=AsyncMock())
        )
        bootstrap = importlib.import_module("quantum_backend_v2.bootstrap.application")
        persistence = Mock(
            return_value=SimpleNamespace(mongodb=None, startup=AsyncMock(), shutdown=AsyncMock())
        )
        recovery = Mock(
            return_value=SimpleNamespace(
                recover_open_reservations=AsyncMock(return_value=[]),
                recover_in_flight_executions=AsyncMock(return_value=[]),
            )
        )
        with (
            patch.object(bootstrap, "create_persistence_runtime", persistence),
            patch.object(bootstrap, "RuntimeRecoveryService", recovery),
            patch.object(bootstrap, "create_libp2p_plan", peers.create_libp2p_bootstrap_plan),
            patch.object(bootstrap, "create_libp2p_runtime", peers.create_real_libp2p_runtime),
            patch.object(bootstrap, "build_discovery_service", discovery.build_discovery_service),
        ):
            yield bootstrap.create_application, persistence, peers.create_real_libp2p_runtime
    finally:
        # Unload only newly imported application modules. Native libraries such as
        # NumPy cannot safely be unloaded and reimported between test cases.
        for name in set(sys.modules) - original_modules:
            if name in {"api", "services"} or name.startswith(
                ("quantum_backend_v2.", "api.", "services.")
            ):
                module = sys.modules.pop(name)
                parent_name, _, attribute = name.rpartition(".")
                parent = sys.modules.get(parent_name)
                if parent is not None and getattr(parent, attribute, None) is module:
                    delattr(parent, attribute)


def test_application_registers_public_chains_and_honors_override(application_factory, tmp_path):
    create_application, _, _ = application_factory
    registry = tmp_path / "chains.toml"
    registry.write_text(
        files("quantum_backend_v2.chains")
        .joinpath("registry.toml")
        .read_text()
        .replace('default_chain_id = "eip155:84532"', 'default_chain_id = "eip155:11155111"')
    )
    env = {"QB2_AUTH_REQUIRED": "true", "QB2_ENVIRONMENT": "test"}
    with (
        TestClient(create_application(env=env)) as default,
        TestClient(
            create_application(env={**env, "QB2_CHAIN_REGISTRY_PATH": str(registry)})
        ) as overridden,
    ):
        for client, chain_id in ((default, "eip155:84532"), (overridden, "eip155:11155111")):
            response = client.get("/api/v1/chains")
            assert response.status_code == 200
            assert response.json()["default_chain_id"] == chain_id
            assert len(response.json()["chains"]) == 5


@pytest.mark.parametrize("contents", ['default_chain_id = "eip155:1"', "chains = ["])
def test_invalid_registry_stops_bootstrap_before_runtime_creation(
    application_factory, tmp_path, contents
):
    create_application, persistence, peers = application_factory
    path = tmp_path / "invalid.toml"
    path.write_text(contents)
    with pytest.raises(RegistryConfigurationError):
        create_application(env={"QB2_CHAIN_REGISTRY_PATH": str(path)})
    persistence.assert_not_called()
    peers.assert_not_called()


@pytest.mark.parametrize("network", ["", "typo", "base-mainnet"])
def test_invalid_wallet_network_stops_bootstrap(application_factory, network):
    create_application, persistence, peers = application_factory
    with pytest.raises(ValueError, match="unknown network"):
        create_application(env={"NETWORK": network})
    persistence.assert_not_called()
    peers.assert_not_called()


def test_application_selects_canonical_wallet_network_and_closes_client(application_factory):
    create_application, _, _ = application_factory
    app = create_application(env={"NETWORK": "eip155:84532"})
    mongo_client = Mock()
    app.state.wallet_service = SimpleNamespace(mongo_client=mongo_client)
    with TestClient(app):
        assert app.state.wallet_chain_id == "eip155:84532"
        assert app.state.chain_registry.resolve().chain_id == "eip155:84532"
    mongo_client.close.assert_called_once()


@pytest.mark.parametrize("bedrock_available", [True, False])
def test_application_closes_scoped_service_clients(application_factory, bedrock_available):
    create_application, _, _ = application_factory
    app = create_application(env={"NETWORK": "base-sepolia"})
    app.state.ai_agent_service = SimpleNamespace(mongo_client=Mock())
    app.state.proposal_service = SimpleNamespace(
        mongo_client=Mock(), bedrock=Mock() if bedrock_available else None
    )
    app.state.marketplace_service = SimpleNamespace(mongo_client=Mock())
    with TestClient(app):
        assert not hasattr(app.state, "wallet_service")
    for service in (
        app.state.ai_agent_service,
        app.state.proposal_service,
        app.state.marketplace_service,
    ):
        service.mongo_client.close.assert_called_once_with()
        if getattr(service, "bedrock", None) is not None:
            service.bedrock.close.assert_called_once_with()


def test_anchor_settings_wire_a_read_only_verifier(application_factory):
    create_application, _, _ = application_factory
    bootstrap = sys.modules["quantum_backend_v2.bootstrap.application"]
    sender = "0x" + "a1" * 20
    with patch.object(bootstrap, "create_app", Mock()) as create_app:
        create_application(
            env={"QB2_ANCHOR_NETWORK": "ethereum-sepolia", "QB2_ANCHOR_SENDER": sender}
        )
        anchored = create_app.call_args.kwargs["provenance_service"]
        create_application(env={})
        default = create_app.call_args.kwargs["provenance_service"]
    assert list(anchored._anchor_adapters) == ["eip155:11155111"]
    assert default is None
    # A network without anchoring support fails startup rather than skipping checks.
    with pytest.raises(ValueError, match="does not support provenance anchoring"):
        create_application(env={"QB2_ANCHOR_NETWORK": "base-sepolia", "QB2_ANCHOR_SENDER": sender})


def test_anchor_key_starts_sending_only_for_its_own_account(application_factory):
    from eth_account import Account

    create_application, _, _ = application_factory
    bootstrap = sys.modules["quantum_backend_v2.bootstrap.application"]
    account = Account.create()
    key = account.key.hex()
    env = {"QB2_ANCHOR_NETWORK": "ethereum-sepolia", "QB2_ANCHOR_SENDER": account.address}
    with patch.object(bootstrap, "create_app", Mock()) as create_app:
        create_application(env={**env, "QB2_ANCHOR_PRIVATE_KEY": key})
        assert create_app.call_args.kwargs["anchor_service"] is not None
        create_application(env=env)
        assert create_app.call_args.kwargs["anchor_service"] is None
    for wrong in (Account.create().key.hex(), "0x" + "zz" * 32):
        with pytest.raises(ValueError, match="QB2_ANCHOR_PRIVATE_KEY") as caught:
            create_application(env={**env, "QB2_ANCHOR_PRIVATE_KEY": wrong})
        assert wrong not in str(caught.value) and key not in str(caught.value)
