"""Sign and broadcast the registry's ``anchor`` call with the publisher's testnet key.

Why a full-access key: ``anchor`` is payable (it pays record storage), and NEAR
function-call keys cannot attach a deposit. Keep this key in the environment only; it never
reaches a prompt, tool result, log or response. Verification stays in ``NearRegistryAdapter``.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import struct
from typing import Any

import base58
import httpx
from nacl.signing import SigningKey

from quantum_backend_v2.config.models import NearRegistrySettings

_GAS = 30 * 10**12  # 30 Tgas, as in docs/near-provenance.md
_DEPOSIT = 10**22  # 0.01 NEAR; the contract refunds whatever storage does not use
_MAX_RPC_BYTES = 1024 * 1024
# shortcut: one lock per process serializes nonces; use a shared lock if the API runs multi-worker.
_NONCE_LOCK = asyncio.Lock()


def _string(text: str) -> bytes:
    raw = text.encode()
    return struct.pack("<I", len(raw)) + raw


def signing_key(secret: str) -> SigningKey:
    """Parse ``ed25519:<base58>`` (32-byte seed or the 64-byte seed+public form near-cli stores)."""
    raw = base58.b58decode(secret.removeprefix("ed25519:"))
    if len(raw) not in (32, 64):
        raise ValueError("NEAR publisher key has the wrong length")
    key = SigningKey(raw[:32])
    if len(raw) == 64 and bytes(key.verify_key) != raw[32:]:
        raise ValueError("NEAR publisher key halves do not match")
    return key


def encode_transaction(
    signer_id: str,
    public_key: bytes,
    nonce: int,
    receiver_id: str,
    block_hash: bytes,
    method: str,
    args: bytes,
) -> bytes:
    """Borsh-encode a one-action FunctionCall transaction."""
    action = (
        b"\x02"
        + _string(method)
        + struct.pack("<I", len(args))
        + args
        + struct.pack("<Q", _GAS)
        + _DEPOSIT.to_bytes(16, "little")
    )
    return (
        _string(signer_id)
        + b"\x00"  # ed25519 public key
        + public_key
        + struct.pack("<Q", nonce)
        + _string(receiver_id)
        + block_hash
        + struct.pack("<I", 1)
        + action
    )


class NearPublisher:
    def __init__(self, settings: NearRegistrySettings, *, client: httpx.AsyncClient | None = None):
        if settings.private_key is None or not settings.configured:
            raise ValueError("NEAR publisher key is not configured")
        self._settings = settings
        self._key = signing_key(settings.private_key.get_secret_value())
        self._client = client

    @property
    def public_key(self) -> str:
        return "ed25519:" + base58.b58encode(bytes(self._key.verify_key)).decode()

    async def _rpc(self, client: httpx.AsyncClient, method: str, params: Any) -> dict[str, Any]:
        try:
            response = await client.post(
                self._settings.rpc_url,
                json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
                timeout=45.0,
                follow_redirects=False,
            )
            response.raise_for_status()
            if len(response.content) > _MAX_RPC_BYTES:
                raise ValueError("Oversized RPC response")
            body = response.json()
        except (httpx.HTTPError, ValueError):
            # Endpoint URLs and RPC payloads can carry credentials.
            raise OSError("NEAR RPC unavailable") from None
        if not isinstance(body, dict) or not isinstance(body.get("result"), dict):
            error = body.get("error") if isinstance(body, dict) else None
            reason = error.get("cause", {}).get("name") if isinstance(error, dict) else None
            raise OSError(f"NEAR RPC rejected {method}" + (f" ({reason})" if reason else ""))
        if "error" in body["result"]:
            # `query` reports failures (e.g. an unknown access key) inside the result.
            raise OSError(f"NEAR RPC rejected {method}")
        return body["result"]

    async def anchor(self, arguments: dict[str, Any]) -> str:
        """Publish one root and return the finalized transaction hash.

        Re-publishing an identical root is idempotent on-chain (the original record is returned
        and the deposit refunded), so retrying after a timeout cannot double-register.
        """
        async with _NONCE_LOCK:
            if self._client is None:
                async with httpx.AsyncClient() as client:
                    return await self._anchor(client, arguments)
            return await self._anchor(self._client, arguments)

    async def _anchor(self, client: httpx.AsyncClient, arguments: dict[str, Any]) -> str:
        settings = self._settings
        status = await self._rpc(client, "status", [])
        if status.get("chain_id") != "testnet":
            raise OSError("NEAR RPC is not on testnet")
        try:
            access_key = await self._rpc(
                client,
                "query",
                {
                    "request_type": "view_access_key",
                    "finality": "final",
                    "account_id": settings.publisher_id,
                    "public_key": self.public_key,
                },
            )
        except OSError:
            raise OSError(
                f"The configured NEAR key is not an access key of {settings.publisher_id}"
            ) from None
        transaction = encode_transaction(
            settings.publisher_id,
            bytes(self._key.verify_key),
            int(access_key["nonce"]) + 1,
            settings.contract_id,
            base58.b58decode(access_key["block_hash"]),
            "anchor",
            json.dumps(arguments, separators=(",", ":")).encode(),
        )
        digest = hashlib.sha256(transaction).digest()
        signed = transaction + b"\x00" + self._key.sign(digest).signature
        result = await self._rpc(
            client,
            "send_tx",
            {"signed_tx_base64": base64.b64encode(signed).decode(), "wait_until": "FINAL"},
        )
        tx_hash = base58.b58encode(digest).decode()
        if result.get("transaction", {}).get("hash") != tx_hash:
            raise OSError("NEAR RPC returned a different transaction")
        if "SuccessValue" not in result.get("status", {}):
            raise OSError("NEAR registry rejected the anchor call")
        return tx_hash
