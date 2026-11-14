"""NearPublisher signs the registry anchor call correctly and fails closed."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json

import base58
import httpx
import pytest
from nacl.signing import SigningKey

from quantum_backend_v2.config.models import NearRegistrySettings
from quantum_backend_v2.provenance.near_publisher import NearPublisher, signing_key

ACCOUNT = "qmesh-provenance-20261110.testnet"
SEED = bytes(range(32))
KEY = "ed25519:" + base58.b58encode(SEED + bytes(SigningKey(SEED).verify_key)).decode()
ARGS = {"merkle_root": "ab" * 32, "leaf_count": 2, "hash_profile": "qmesh-provenance-sha256-v1"}
BLOCK_HASH = bytes(range(32, 64))


def _settings(key: str | None = KEY) -> NearRegistrySettings:
    return NearRegistrySettings(contract_id=ACCOUNT, publisher_id=ACCOUNT, private_key=key)


def _rpc(sent: list[dict], *, chain: str = "testnet", status: dict | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        sent.append(body)
        method, params = body["method"], body["params"]
        if method == "status":
            result = {"chain_id": chain}
        elif method == "query":
            result = {"nonce": 41, "block_hash": base58.b58encode(BLOCK_HASH).decode()}
        else:
            raw = base64.b64decode(params["signed_tx_base64"])
            digest = hashlib.sha256(raw[:-65]).digest()
            result = {
                "transaction": {"hash": base58.b58encode(digest).decode()},
                "status": status or {"SuccessValue": ""},
            }
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": result})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_signs_the_exact_transaction_it_sends() -> None:
    sent: list[dict] = []
    tx_hash = asyncio.run(NearPublisher(_settings(), client=_rpc(sent)).anchor(ARGS))

    assert [call["method"] for call in sent] == ["status", "query", "send_tx"]
    assert sent[1]["params"]["public_key"] == NearPublisher(_settings()).public_key
    assert sent[2]["params"]["wait_until"] == "FINAL"
    raw = base64.b64decode(sent[2]["params"]["signed_tx_base64"])
    transaction, signature = raw[:-65], raw[-64:]
    assert raw[-65] == 0  # ed25519 signature tag
    SigningKey(SEED).verify_key.verify(hashlib.sha256(transaction).digest(), signature)
    assert base58.b58encode(hashlib.sha256(transaction).digest()).decode() == tx_hash
    # nonce is the key's current nonce + 1, bound to the block hash and the anchor arguments
    assert (42).to_bytes(8, "little") in transaction
    assert BLOCK_HASH in transaction
    assert json.dumps(ARGS, separators=(",", ":")).encode() in transaction


def test_refuses_to_sign_for_a_non_testnet_rpc() -> None:
    sent: list[dict] = []
    with pytest.raises(OSError, match="not on testnet"):
        asyncio.run(NearPublisher(_settings(), client=_rpc(sent, chain="mainnet")).anchor(ARGS))
    assert [call["method"] for call in sent] == ["status"]


def test_failed_registry_call_is_not_reported_as_published() -> None:
    with pytest.raises(OSError, match="rejected the anchor call"):
        asyncio.run(
            NearPublisher(
                _settings(), client=_rpc([], status={"Failure": {"ActionError": {}}})
            ).anchor(ARGS)
        )


def test_key_parsing_and_secrecy() -> None:
    assert bytes(signing_key(KEY).verify_key) == bytes(SigningKey(SEED).verify_key)
    seed_only = "ed25519:" + base58.b58encode(SEED).decode()
    assert bytes(signing_key(seed_only).verify_key) == bytes(SigningKey(SEED).verify_key)
    mismatched = "ed25519:" + base58.b58encode(SEED + bytes(32)).decode()
    with pytest.raises(ValueError, match="do not match"):
        signing_key(mismatched)
    assert KEY not in repr(_settings())
    with pytest.raises(ValueError):
        _settings("not-a-key")
    with pytest.raises(ValueError):
        NearRegistrySettings(private_key=KEY)  # a key without a configured registry
    with pytest.raises(ValueError, match="not configured"):
        NearPublisher(_settings(None))


def test_a_key_the_publisher_account_does_not_hold_is_reported_clearly() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        method = json.loads(request.content)["method"]
        result = (
            {"chain_id": "testnet"}
            if method == "status"
            else {"error": "access key ed25519:... does not exist while viewing", "logs": []}
        )
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": result})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with pytest.raises(OSError, match="not an access key of"):
        asyncio.run(NearPublisher(_settings(), client=client).anchor(ARGS))
