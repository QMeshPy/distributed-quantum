from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock

import pytest

import services.agentkit_service as module
from quantum_backend_v2.chains.adapter import UnsupportedOperationError
from quantum_backend_v2.chains.loader import load_chain_registry
from quantum_backend_v2.chains.models import (
    ChainRegistry,
    DisabledNetworkError,
    UnknownNetworkError,
)

ADDRESS = "0x" + "11" * 20
DESTINATION = "0x" + "22" * 20
TX_HASH = "0x" + "ab" * 32
pytestmark = pytest.mark.anyio


@pytest.fixture
def wallet_boundary(monkeypatch):
    database = MagicMock()
    database.wallets.find_one = AsyncMock(
        return_value={
            "default_address": ADDRESS,
            "network": "base-sepolia",
            "entity_id": "alice",
            "entity_type": "user",
            "created_at": datetime.now(timezone.utc),
        }
    )
    database.wallets.insert_one = AsyncMock()
    database.wallets.update_one = AsyncMock()
    database.payments.insert_one = AsyncMock()
    motor = MagicMock()
    motor.return_value.__getitem__.return_value = database
    monkeypatch.setattr(module, "AsyncIOMotorClient", motor)
    web3 = MagicMock()
    web3.to_checksum_address.side_effect = lambda value: value
    web3.return_value.eth.get_balance.return_value = 10**18
    web3.return_value.eth.block_number = 123
    contract = web3.return_value.eth.contract.return_value
    contract.functions.balanceOf.return_value.call.return_value = 100 * 10**6
    web3.return_value.to_checksum_address.side_effect = lambda value: value
    web3.return_value.eth.chain_id = 84532
    web3.return_value.eth.call.return_value = (100 * 10**6).to_bytes(32, "big")
    monkeypatch.setattr(module, "Web3", web3)
    provider = MagicMock()
    provider.return_value.get_address.return_value = ADDRESS
    provider.return_value.send_transaction.return_value = TX_HASH
    provider.return_value._web3 = web3.return_value
    monkeypatch.setattr(module, "CdpEvmWalletProvider", provider)

    def document(**values):
        values.setdefault("created_at", datetime.now(timezone.utc))
        return SimpleNamespace(**values, model_dump=lambda: values)

    monkeypatch.setattr(module, "WalletDocument", document)
    monkeypatch.setattr(module, "PaymentDocument", document)

    ledger_calls: list[tuple] = []

    class RecordingLedger:
        def __init__(self, _database) -> None:
            pass

        async def record_event(self, **fields):
            ledger_calls.append(("record", fields))
            return SimpleNamespace(created=True, event=None)

        async def confirm(self, key, *, external_ref=None):
            ledger_calls.append(("confirm", key, external_ref))

    monkeypatch.setattr(module, "LedgerService", RecordingLedger)
    return SimpleNamespace(
        db=database, motor=motor, web3=web3, provider=provider, ledger_calls=ledger_calls
    )


async def test_balance_uses_the_rpc_override(wallet_boundary, monkeypatch):
    monkeypatch.setenv("QB2_BASE_SEPOLIA_RPC_URL", "https://base-sepolia.example/v2/KEY")
    service = module.AgentKitService(registry=load_chain_registry())
    await service.get_balance(ADDRESS)
    assert wallet_boundary.web3.HTTPProvider.call_args.args == (
        "https://base-sepolia.example/v2/KEY",
    )


async def test_balance_refuses_an_rpc_for_another_chain(wallet_boundary):
    wallet_boundary.web3.return_value.eth.chain_id = 1
    service = module.AgentKitService(registry=load_chain_registry())
    with pytest.raises(ValueError, match="different chain"):
        await service.get_balance(ADDRESS)
    wallet_boundary.db.wallets.update_one.assert_not_awaited()


@pytest.mark.parametrize("network", [None, "base-sepolia", "eip155:84532"])
async def test_base_network_aliases_keep_provider_and_token_metadata(wallet_boundary, network):
    service = module.AgentKitService(registry=load_chain_registry(), network=network)
    result = await service.get_balance(ADDRESS)
    assert service.chain.chain_id == "eip155:84532"
    assert result["network_id"] == "base-sepolia"
    assert result["eth_balance"] == Decimal("1")
    assert result["usdc_balance"] == Decimal("100")
    assert (
        wallet_boundary.web3.return_value.eth.call.call_args.args[0]["to"]
        == service.chain.stablecoin.address
    )
    assert wallet_boundary.web3.HTTPProvider.call_args.args == ("https://sepolia.base.org",)
    wallet_boundary.db.wallets.update_one.assert_awaited_once()


@pytest.mark.parametrize("network", ["", "typo", "base-mainnet", "eip155:1"])
def test_unknown_config_fails_before_client_creation(wallet_boundary, network):
    with pytest.raises(UnknownNetworkError):
        module.AgentKitService(registry=load_chain_registry(), network=network)
    wallet_boundary.motor.assert_not_called()
    wallet_boundary.provider.assert_not_called()


def test_disabled_config_fails_before_client_creation(wallet_boundary):
    data = load_chain_registry().model_dump()
    eth = next(c for c in data["chains"] if c["chain_id"] == "eip155:11155111")
    eth["enabled"] = False
    with pytest.raises(DisabledNetworkError):
        module.AgentKitService(
            registry=ChainRegistry.model_validate(data), network="ethereum-sepolia"
        )
    wallet_boundary.motor.assert_not_called()


@pytest.mark.parametrize(
    "operation,args",
    [
        ("create_wallet", ("alice", "user")),
        ("get_balance", (ADDRESS,)),
        ("transfer_usdc", (ADDRESS, DESTINATION, Decimal("1"))),
        ("aave_supply", (ADDRESS, Decimal("1"), ADDRESS)),
        ("aave_withdraw", (ADDRESS, Decimal("1"), ADDRESS)),
        ("request_testnet_funds", (ADDRESS,)),
    ],
)
async def test_metadata_only_network_rejects_operations_before_io(wallet_boundary, operation, args):
    service = module.AgentKitService(registry=load_chain_registry(), network="ethereum-sepolia")
    with pytest.raises(UnsupportedOperationError):
        await getattr(service, operation)(*args)
    assert not wallet_boundary.db.mock_calls
    wallet_boundary.web3.assert_not_called()
    wallet_boundary.provider.assert_not_called()


@pytest.mark.parametrize("network", [None, "", "typo", "ethereum-sepolia", "eip155:11155111"])
@pytest.mark.parametrize("operation", ["get_balance", "_load_wallet", "request_testnet_funds"])
async def test_stored_network_is_checked_before_rpc_or_provider(
    wallet_boundary, network, operation
):
    wallet_boundary.db.wallets.find_one.return_value["network"] = network
    service = module.AgentKitService(registry=load_chain_registry())
    with pytest.raises(ValueError):
        await getattr(service, operation)(ADDRESS)
    wallet_boundary.web3.assert_not_called()
    wallet_boundary.provider.assert_not_called()
    wallet_boundary.db.wallets.update_one.assert_not_awaited()


async def test_existing_wallet_on_other_network_is_not_reused(wallet_boundary):
    wallet_boundary.db.wallets.find_one.return_value["network"] = "ethereum-sepolia"
    service = module.AgentKitService(registry=load_chain_registry())
    with pytest.raises(ValueError, match="does not support wallet operations"):
        await service.create_wallet("alice", "user")
    wallet_boundary.provider.assert_not_called()
    wallet_boundary.db.wallets.insert_one.assert_not_awaited()


async def test_create_wallet_preserves_alias_and_provider_config(wallet_boundary):
    wallet_boundary.db.wallets.find_one.side_effect = [None, {"network": "base-sepolia"}]
    service = module.AgentKitService(registry=load_chain_registry(), network="eip155:84532")
    result = await service.create_wallet("alice", "user")
    assert result["wallet_address"] == ADDRESS
    assert result["network_id"] == "base-sepolia"
    assert wallet_boundary.provider.call_args.args[0].network_id == "base-sepolia"
    record = wallet_boundary.db.wallets.insert_one.call_args.args[0]
    assert record["network"] == "base-sepolia"
    assert record["creation_block"] == 123


@pytest.mark.parametrize(
    "operation,args,capability,count",
    [
        ("transfer_usdc", (ADDRESS, DESTINATION, Decimal("1.25")), "transfer_stablecoin", 1),
        ("aave_supply", (ADDRESS, Decimal("1.25"), ADDRESS), "aave_supply", 2),
        ("aave_withdraw", (ADDRESS, Decimal("1.25"), ADDRESS), "aave_withdraw", 1),
    ],
)
async def test_existing_base_transactions_use_registry_and_record_submission(
    wallet_boundary,
    operation,
    args,
    capability,
    count,
):
    service = module.AgentKitService(registry=load_chain_registry())
    result = await getattr(service, operation)(*args)
    assert result["status"] == "submitted"
    assert result["basescan_url"] == "https://sepolia.basescan.org/tx/" + TX_HASH
    assert wallet_boundary.provider.return_value.send_transaction.call_count == count
    assert wallet_boundary.provider.call_args.args[0].network_id == "base-sepolia"
    record = wallet_boundary.db.payments.insert_one.call_args.args[0]
    assert record["transaction_hash"] == TX_HASH
    assert record["amount"].to_decimal() == Decimal("1.25")
    if operation == "transfer_usdc":
        (_, event), confirmation = wallet_boundary.ledger_calls
        assert event["amount"] == Decimal("1.25")
        assert event["chain_id"] == "eip155:84532"
        assert confirmation == ("confirm", event["idempotency_key"], TX_HASH)
    contract_calls = wallet_boundary.web3.return_value.eth.contract.call_args_list
    allowed = {service.usdc_address, service.aave_pool_address}
    assert all(call.kwargs["address"] in allowed for call in contract_calls)

    data = load_chain_registry().model_dump()
    data["chains"][0]["capabilities"] = [
        item for item in data["chains"][0]["capabilities"] if item != capability
    ]
    restricted = module.AgentKitService(registry=ChainRegistry.model_validate(data))
    wallet_boundary.provider.reset_mock()
    with pytest.raises(UnsupportedOperationError):
        await getattr(restricted, operation)(*args)
    wallet_boundary.provider.assert_not_called()


async def test_custom_token_decimals_and_explorer_are_used(wallet_boundary):
    data = load_chain_registry().model_dump()
    data["chains"][0]["stablecoin"]["decimals"] = 8
    data["chains"][0]["stablecoin"]["address"] = DESTINATION
    data["chains"][0]["explorers"]["transaction"] = "https://explorer.example/tx/{tx_hash}"
    service = module.AgentKitService(registry=ChainRegistry.model_validate(data))
    result = await service.transfer_usdc(ADDRESS, DESTINATION, Decimal("0.25"))
    transfer = wallet_boundary.web3.return_value.eth.contract.return_value.functions.transfer
    transfer.assert_called_once_with(DESTINATION, 25_000_000)
    assert result["basescan_url"] == "https://explorer.example/tx/" + TX_HASH


def wallet_app(monkeypatch, wallet_boundary, *, network="base-sepolia", stored="base-sepolia"):
    from fastapi import FastAPI

    from api.v1 import wallet
    from quantum_backend_v2.api.deps.auth import require_authenticated
    from quantum_backend_v2.api.errors.models import register_exception_handlers

    app = FastAPI()
    app.state.chain_registry = load_chain_registry()
    app.state.wallet_chain_id = app.state.chain_registry.resolve(network).chain_id
    app.dependency_overrides[require_authenticated] = lambda: SimpleNamespace(
        user_id="alice",
        email="alice@example.com",
    )
    monkeypatch.setattr(
        wallet.WalletDocument,
        "find_one",
        AsyncMock(
            return_value=SimpleNamespace(
                default_address=ADDRESS,
                network=stored,
            )
        ),
    )
    wallet_boundary.db.wallets.find_one.return_value["network"] = stored
    app.include_router(wallet.router)
    register_exception_handlers(app)
    return app


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("get", "/balance", None),
        ("post", "/transfer", {"to_address": DESTINATION, "amount": "1"}),
        ("post", "/fund-testnet", None),
        ("get", "/transactions", None),
    ],
)
@pytest.mark.parametrize(
    "selected,stored",
    [
        ("base-sepolia", "ethereum-sepolia"),
        ("base-sepolia", "unknown"),
        ("ethereum-sepolia", "ethereum-sepolia"),
    ],
)
def test_wallet_api_rejects_unavailable_networks_without_external_calls(
    monkeypatch,
    wallet_boundary,
    method,
    path,
    body,
    selected,
    stored,
):
    from fastapi.testclient import TestClient

    app = wallet_app(monkeypatch, wallet_boundary, network=selected, stored=stored)
    with TestClient(app) as client:
        response = client.request(method, "/api/v1/wallet" + path, json=body)
    assert response.status_code == 400, response.text
    assert response.json()["error"] == "validation_error"
    wallet_boundary.provider.assert_not_called()
    wallet_boundary.web3.assert_not_called()
    wallet_boundary.db.payments.insert_one.assert_not_awaited()


def test_wallet_api_transfer_uses_application_registry(monkeypatch, wallet_boundary):
    from fastapi.testclient import TestClient

    app = wallet_app(monkeypatch, wallet_boundary, stored="eip155:84532")
    data = app.state.chain_registry.model_dump()
    data["chains"][0]["explorers"]["transaction"] = "https://custom.example/tx/{tx_hash}"
    app.state.chain_registry = ChainRegistry.model_validate(data)
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/wallet/transfer",
            json={
                "to_address": DESTINATION,
                "amount": "1.25",
            },
        )
    assert response.status_code == 201, response.text
    assert response.json()["basescan_url"] == "https://custom.example/tx/" + TX_HASH
    assert app.state.wallet_service.registry is app.state.chain_registry


def test_faucet_api_returns_cdp_transaction_hash(monkeypatch, wallet_boundary):
    from fastapi.testclient import TestClient

    hashes = {"eth": "0x" + "ab" * 32, "usdc": "0x" + "cd" * 32}

    class _Faucet:
        async def request_faucet(self, **kwargs):
            return hashes[kwargs["token"]]

    class _Client:
        def __init__(self, **_kwargs):
            self.evm = _Faucet()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    monkeypatch.setattr(module, "CdpClient", _Client)
    with TestClient(wallet_app(monkeypatch, wallet_boundary)) as client:
        response = client.post("/api/v1/wallet/fund-testnet")
    assert response.status_code == 201
    body = response.json()
    assert body["eth_transaction_hash"] == hashes["eth"]
    assert body["usdc_transaction_hash"] == hashes["usdc"]
    assert body["eth_basescan_url"] == "https://sepolia.basescan.org/tx/" + hashes["eth"]
    assert body["usdc_basescan_url"] == "https://sepolia.basescan.org/tx/" + hashes["usdc"]
    wallet_boundary.provider.assert_not_called()
    wallet_boundary.web3.assert_not_called()


async def test_wallet_dependencies_do_not_share_network_selection(monkeypatch, wallet_boundary):
    from starlette.requests import Request

    from quantum_backend_v2.api.deps.wallet import get_wallet_service

    base_app = wallet_app(monkeypatch, wallet_boundary)
    ethereum_app = wallet_app(monkeypatch, wallet_boundary, network="ethereum-sepolia")
    base_request = Request({"type": "http", "app": base_app})
    ethereum_request = Request({"type": "http", "app": ethereum_app})
    base = await get_wallet_service(base_request)
    ethereum = await get_wallet_service(ethereum_request)
    assert await get_wallet_service(base_request) is base
    assert base.chain.chain_id == "eip155:84532"
    assert ethereum.chain.chain_id == "eip155:11155111"
    assert base is not ethereum


@pytest.mark.parametrize(
    "balance,expected",
    [
        (Decimal("0"), "Insufficient USDC"),
        (Decimal("1"), "Insufficient ETH"),
    ],
)
async def test_transfer_still_rejects_insufficient_funds(wallet_boundary, balance, expected):
    service = module.AgentKitService(registry=load_chain_registry())
    service.get_balance = AsyncMock(
        return_value={"usdc_balance": balance, "eth_balance": Decimal("0")}
    )
    with pytest.raises(ValueError, match=expected):
        await service.transfer_usdc(ADDRESS, DESTINATION, Decimal("1"))
    wallet_boundary.provider.return_value.send_transaction.assert_not_called()


async def test_network_setting_and_registry_override_are_resolved(
    wallet_boundary, monkeypatch, tmp_path
):
    from importlib.resources import files

    from quantum_backend_v2.config import load_settings

    path = tmp_path / "registry.toml"
    path.write_text(
        files("quantum_backend_v2.chains")
        .joinpath("registry.toml")
        .read_text()
        .replace(
            'default_chain_id = "eip155:84532"',
            'default_chain_id = "eip155:11155111"',
        )
    )
    settings = load_settings(env={"QB2_CHAIN_REGISTRY_PATH": str(path), "NETWORK": "eip155:84532"})
    monkeypatch.setattr(module, "load_settings", lambda: settings)
    service = module.AgentKitService()
    assert service.chain.chain_id == "eip155:84532"
    assert service.registry.default_chain_id == "eip155:11155111"


@pytest.mark.parametrize("rpc_result", ["empty", "logs", "unavailable"])
def test_transaction_history_uses_registry_token_and_explorer(
    monkeypatch, wallet_boundary, rpc_result
):
    import web3
    from bson import Decimal128
    from fastapi.testclient import TestClient

    from api.v1 import wallet

    app = wallet_app(monkeypatch, wallet_boundary)
    data = app.state.chain_registry.model_dump()
    data["chains"][0]["explorers"]["transaction"] = "https://custom.example/tx/{tx_hash}"
    data["chains"][0]["stablecoin"]["address"] = DESTINATION
    data["chains"][0]["stablecoin"]["decimals"] = 8
    app.state.chain_registry = ChainRegistry.model_validate(data)
    wallet.WalletDocument.find_one.return_value.creation_block = 1
    payments = MagicMock()
    payments.sort.return_value.limit.return_value.to_list = AsyncMock(
        return_value=[
            SimpleNamespace(
                transaction_hash=TX_HASH,
                basescan_url="https://old.example/tx/" + TX_HASH,
                from_wallet=ADDRESS,
                to_wallet=DESTINATION,
                amount=Decimal128("1.25"),
                currency="USDC",
                status="submitted",
                created_at=datetime.now(timezone.utc),
            )
        ]
    )
    payments.count = AsyncMock(return_value=1)
    monkeypatch.setattr(wallet.PaymentDocument, "find", Mock(return_value=payments))
    wallet_boundary.web3.return_value.eth.get_logs.return_value = []
    onchain_hash = "0x" + "cd" * 32
    raw_amount = 9_007_199_254_740_993
    if rpc_result == "logs":

        def transfer_log(tx_hash):
            return {
                "transactionHash": bytes.fromhex(tx_hash[2:]),
                "topics": [
                    bytes(32),
                    bytes.fromhex(ADDRESS[2:].zfill(64)),
                    bytes.fromhex(DESTINATION[2:].zfill(64)),
                ],
                "data": raw_amount.to_bytes(32, "big"),
                "blockNumber": 123,
            }

        wallet_boundary.web3.return_value.eth.get_logs.return_value = [
            transfer_log(TX_HASH),
            transfer_log(onchain_hash),
        ]
        wallet_boundary.web3.return_value.eth.get_block.return_value = {"timestamp": 1_700_000_000}
    elif rpc_result == "unavailable":
        wallet_boundary.web3.return_value.eth.get_logs.side_effect = OSError("RPC unavailable")
    wallet_boundary.web3.to_hex.side_effect = web3.Web3.to_hex
    monkeypatch.setattr(web3, "Web3", wallet_boundary.web3)
    with TestClient(app) as client:
        response = client.get("/api/v1/wallet/transactions")
    assert response.status_code == 200, response.text
    transactions = response.json()["transactions"]
    by_hash = {item["transaction_hash"]: item for item in transactions}
    assert by_hash[TX_HASH]["basescan_url"] == "https://custom.example/tx/" + TX_HASH
    assert len(transactions) == response.json()["total"] == (2 if rpc_result == "logs" else 1)
    if rpc_result == "logs":
        assert by_hash[onchain_hash]["amount"] == "90071992.54740993"
        assert by_hash[onchain_hash]["basescan_url"] == "https://custom.example/tx/" + onchain_hash
        assert by_hash[onchain_hash]["from_address"] == ADDRESS
        assert by_hash[onchain_hash]["to_address"] == DESTINATION
    calls = wallet_boundary.web3.return_value.eth.get_logs.call_args_list
    assert len(calls) == (1 if rpc_result == "unavailable" else 2)
    assert all(call.args[0]["address"] == DESTINATION for call in calls)
