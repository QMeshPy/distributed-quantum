"""Read-only NEAR testnet registry verification; no wallet or signing key needed."""

from __future__ import annotations

import asyncio
import base64
import json
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx

from quantum_backend_v2.config.models import NearRegistrySettings
from quantum_backend_v2.provenance.models import ChainAnchor

CHAIN_ID = "near:testnet"
HASH_PROFILE = "qmesh-provenance-sha256-v1"
_TX_HASH = re.compile(r"[1-9A-HJ-NP-Za-km-z]{32,44}")
_EVM_ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}")
_EVM_SIGNATURE = re.compile(r"0x[0-9a-fA-F]{130}")


def anchor_intent(contract_id: str, merkle_root: str, leaf_count: int, submitter: str) -> str:
    """The text a submitter's Ethereum wallet signs (EIP-191) to approve one publication.

    Everything in it is also in the anchor call, so anyone can re-check the signature
    from the explorer alone.
    """
    return (
        "QMesh provenance anchor\n"
        f"Registry: {contract_id} (NEAR testnet)\n"
        f"Merkle root: {merkle_root}\n"
        f"Experiments: {leaf_count}\n"
        f"Hash profile: {HASH_PROFILE}\n"
        f"Submitter: {submitter}"
    )


def signed_by(message: str, signature: str, address: str) -> bool:
    from eth_account import Account
    from eth_account.messages import encode_defunct

    try:
        signer = Account.recover_message(encode_defunct(text=message), signature=signature)
    except Exception:
        return False
    return signer.lower() == address.lower()
_MAX_RPC_BYTES = 1024 * 1024


class NearRegistryAdapter:
    """Require a finalized successful call and matching state at the trusted registry."""

    def __init__(self, settings: NearRegistrySettings, *, client: httpx.Client | None = None):
        if not settings.configured:
            raise ValueError("NEAR registry is not configured")
        self.settings = settings
        self._client = client

    async def contains_root(
        self, anchor: ChainAnchor, submitter: str | None = None, signature: str | None = None
    ) -> bool:
        """``submitter``/``signature``: when given, the call must carry exactly these too."""
        if anchor.chain != CHAIN_ID or _TX_HASH.fullmatch(anchor.tx_hash) is None:
            return False
        return await asyncio.to_thread(self._check, anchor, submitter, signature)

    @staticmethod
    def explorer_url(tx_hash: str) -> str:
        if _TX_HASH.fullmatch(tx_hash) is None:
            raise ValueError("Invalid NEAR transaction hash")
        return f"https://testnet.nearblocks.io/txns/{tx_hash}"

    def _rpc(self, client: httpx.Client, method: str, params: Any) -> dict[str, Any]:
        try:
            with client.stream(
                "POST",
                self.settings.rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": method,
                    "params": params,
                },
                timeout=5.0,
                follow_redirects=False,
            ) as response:
                response.raise_for_status()
                data = bytearray()
                for chunk in response.iter_bytes():
                    data.extend(chunk)
                    if len(data) > _MAX_RPC_BYTES:
                        raise ValueError("Oversized RPC response")
            body = json.loads(data)
            if (
                not isinstance(body, dict)
                or "error" in body
                or not isinstance(body.get("result"), dict)
            ):
                raise ValueError("RPC result unavailable")
            return body["result"]
        except (httpx.HTTPError, httpx.InvalidURL, ValueError, TypeError):
            # RPC error payloads and endpoint URLs can contain credentials.
            raise OSError("NEAR registry lookup unavailable") from None

    def _check(
        self, anchor: ChainAnchor, submitter: str | None = None, signature: str | None = None
    ) -> bool:
        if self._client is None:
            with httpx.Client() as client:
                return self._check_with(client, anchor, submitter, signature)
        return self._check_with(self._client, anchor, submitter, signature)

    def _check_with(
        self,
        client: httpx.Client,
        anchor: ChainAnchor,
        submitter: str | None = None,
        signature: str | None = None,
    ) -> bool:
        try:
            # Independent reads run together within the verifier's ten-second I/O budget.
            with ThreadPoolExecutor(max_workers=3) as pool:
                network_read = pool.submit(self._rpc, client, "status", [])
                transaction_read = pool.submit(
                    self._rpc,
                    client,
                    "tx",
                    {
                        "tx_hash": anchor.tx_hash,
                        "sender_account_id": self.settings.publisher_id,
                        "wait_until": "FINAL",
                    },
                )
                record_read = pool.submit(
                    self._rpc,
                    client,
                    "query",
                    {
                        "request_type": "call_function",
                        "finality": "final",
                        "account_id": self.settings.contract_id,
                        "method_name": "get_anchor",
                        "args_base64": base64.b64encode(
                            json.dumps(
                                {
                                    "merkle_root": anchor.merkle_root,
                                }
                            ).encode()
                        ).decode(),
                    },
                )
                network, result, view = (
                    network_read.result(),
                    transaction_read.result(),
                    record_read.result(),
                )
            if network["chain_id"] != "testnet":
                raise OSError("NEAR registry lookup unavailable: wrong network")
            if result.get("final_execution_status") != "FINAL":
                raise OSError("NEAR registry transaction is not final")
            tx = result["transaction"]
            if (
                tx["hash"] != anchor.tx_hash
                or tx["signer_id"] != self.settings.publisher_id
                or tx["receiver_id"] != self.settings.contract_id
                or len(tx["actions"]) != 1
            ):
                return False
            call = tx["actions"][0].get("FunctionCall", {})
            expected = {
                "merkle_root": anchor.merkle_root,
                "leaf_count": anchor.leaf_count,
                "hash_profile": anchor.hash_profile,
            }
            if call.get("method_name") != "anchor":
                return False
            arguments = json.loads(base64.b64decode(call["args"], validate=True))
            # The contract ignores unknown input fields, so the call may name the user's wallet
            # for explorer readers. It is never stored in the record; only its format is checked.
            if not isinstance(arguments, dict):
                return False
            claimed = arguments.pop("submitter", None)
            claimed_signature = arguments.pop("submitter_signature", None)
            if claimed is not None and (
                not isinstance(claimed, str) or _EVM_ADDRESS.fullmatch(claimed) is None
            ):
                return False
            if submitter is not None and (claimed or "").lower() != submitter.lower():
                return False
            if claimed_signature is not None and not (
                isinstance(claimed_signature, str)
                and _EVM_SIGNATURE.fullmatch(claimed_signature)
                and claimed is not None
                and signed_by(
                    anchor_intent(
                        self.settings.contract_id,
                        anchor.merkle_root,
                        anchor.leaf_count,
                        claimed,
                    ),
                    claimed_signature,
                    claimed,
                )
            ):
                return False
            if signature is not None and (claimed_signature or "").lower() != signature.lower():
                return False
            if arguments != expected or type(arguments.get("leaf_count")) is not int:
                return False
            if not _successful_status(result["status"]):
                return False
            receipts = result["receipts_outcome"]
            if not isinstance(receipts, list) or not receipts:
                raise OSError("NEAR registry receipt evidence unavailable")
            for receipt in receipts:
                if not _successful_status(receipt["outcome"]["status"]):
                    return False
            transaction_status = result["transaction_outcome"]["outcome"]["status"]
            if not _successful_status(transaction_status):
                return False
            receipt_id = transaction_status.get("SuccessReceiptId")
            executed = [receipt["outcome"] for receipt in receipts if receipt["id"] == receipt_id]
            if len(executed) != 1 or executed[0]["executor_id"] != self.settings.contract_id:
                raise OSError("NEAR registry execution receipt unavailable")
            returned = json.loads(
                base64.b64decode(
                    executed[0]["status"]["SuccessValue"],
                    validate=True,
                )
            )
            record = json.loads(bytes(view["result"]))
            if record is None:
                return False
            return (
                isinstance(record, dict)
                and record == returned
                and all(record.get(key) == value for key, value in expected.items())
                and type(record.get("leaf_count")) is int
                and record.get("publisher_id") == self.settings.publisher_id
                and 0 < int(record["block_height"]) <= view["block_height"]
                and int(record["timestamp_ns"]) > 0
            )
        except (AttributeError, KeyError, TypeError, ValueError, OverflowError):
            raise OSError("NEAR registry returned malformed evidence") from None


def _successful_status(value: Any) -> bool:
    """Accept NEAR execution status objects, never arrays masquerading as their keys."""
    if not isinstance(value, dict) or len(value) != 1:
        raise OSError("NEAR execution status unavailable")
    kind, payload = next(iter(value.items()))
    if kind == "Failure" and isinstance(payload, dict):
        return False
    if kind not in {"SuccessValue", "SuccessReceiptId"} or not isinstance(payload, str):
        raise OSError("NEAR execution status unavailable")
    return True
