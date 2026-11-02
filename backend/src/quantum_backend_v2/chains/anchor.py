"""Provenance Merkle-root anchor transactions on EVM chains (#21).

An anchor is a zero-value transaction from the configured anchor account to itself.
Its calldata carries a version tag, the batch's SHA-256 Merkle root, the batch size
and the hash profile, so the size is authenticated together with the root.
"""

from __future__ import annotations

import re
from collections.abc import Collection
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from eth_typing import HexStr

from quantum_backend_v2.chains.adapter import EvmRpcAdapter

if TYPE_CHECKING:
    from eth_account.signers.local import LocalAccount
    from eth_account.types import TransactionDictType

MAGIC = b"QMSHANC1"
# Calldata profile byte -> provenance hash profile. New profiles need a new byte.
HASH_PROFILES = {1: "qmesh-provenance-sha256-v1"}
PAYLOAD_LENGTH = len(MAGIC) + 32 + 4 + 1
_ROOT = re.compile(r"[0-9a-f]{64}")
_TX_HASH = re.compile(r"0x[0-9a-fA-F]{64}")
_ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}")

AnchorStatus = Literal["confirmed", "pending", "not_found", "failed", "mismatch"]


def _hex(value: object) -> str | None:
    """Normalize a block hash that web3 may return as bytes or a hex string."""
    if value is None:
        return None
    if isinstance(value, (bytes, bytearray)):
        return bytes(value).hex()
    return str(value).lower().removeprefix("0x")


@dataclass(frozen=True)
class AnchorPayload:
    merkle_root: str
    leaf_count: int
    hash_profile: str = HASH_PROFILES[1]

    def encode(self) -> bytes:
        if _ROOT.fullmatch(self.merkle_root) is None:
            raise ValueError("Merkle root must be a lowercase 32-byte hex digest")
        if not 0 < self.leaf_count < 2**32:
            raise ValueError("Batch size must fit in 32 bits")
        profile = next(
            (key for key, name in HASH_PROFILES.items() if name == self.hash_profile), None
        )
        if profile is None:
            raise ValueError("Unsupported hash profile")
        return (
            MAGIC
            + bytes.fromhex(self.merkle_root)
            + self.leaf_count.to_bytes(4, "big")
            + bytes([profile])
        )

    @classmethod
    def decode(cls, data: bytes) -> AnchorPayload:
        if len(data) != PAYLOAD_LENGTH or not data.startswith(MAGIC):
            raise ValueError("Not a provenance anchor payload")
        body = data[len(MAGIC) :]
        profile = HASH_PROFILES.get(body[36])
        leaf_count = int.from_bytes(body[32:36], "big")
        if profile is None or leaf_count == 0:
            raise ValueError("Not a provenance anchor payload")
        return cls(merkle_root=body[:32].hex(), leaf_count=leaf_count, hash_profile=profile)


@dataclass(frozen=True)
class AnchorCheck:
    status: AnchorStatus
    block_number: int | None = None


class EvmAnchorAdapter(EvmRpcAdapter):
    """Read-only anchor checks; signing lives with the anchor sender, not here."""

    def check_anchor(
        self, tx_hash: str, payload: AnchorPayload, senders: str | Collection[str]
    ) -> AnchorCheck:
        """Report `confirmed` only for a finalized, successful self-send carrying `payload`.

        `senders` lists the anchor accounts to accept, so anchors sent before a key
        rotation still verify. `pending` without a block means not yet mined.
        """
        from web3.exceptions import TransactionNotFound

        self._require("anchor_root")
        accounts = {senders.lower()} if isinstance(senders, str) else {s.lower() for s in senders}
        if (
            _TX_HASH.fullmatch(tx_hash) is None
            or not accounts
            or any(_ADDRESS.fullmatch(account) is None for account in accounts)
        ):
            raise ValueError("invalid anchor reference")
        expected = payload.encode()
        self._check_chain()
        try:
            transaction = self.web3.eth.get_transaction(HexStr(tx_hash))
        except TransactionNotFound:
            return AnchorCheck(status="not_found")
        block = transaction.get("blockNumber")
        if block is None:
            return AnchorCheck(status="pending")
        try:
            receipt = self.web3.eth.get_transaction_receipt(HexStr(tx_hash))
        except TransactionNotFound:
            return AnchorCheck(status="pending")
        # A load-balanced RPC can serve the transaction and receipt from different
        # snapshots around a reorganization. Trust neither until both name one block.
        block_hash = _hex(transaction.get("blockHash"))
        if (
            receipt.get("blockNumber") is None
            or int(receipt["blockNumber"]) != int(block)
            or block_hash is None
            or _hex(receipt.get("blockHash")) != block_hash
        ):
            return AnchorCheck(status="pending")
        if int(receipt["status"]) != 1:
            return AnchorCheck(status="failed", block_number=int(block))
        account = str(transaction["from"]).lower()
        if (
            account not in accounts
            or str(transaction.get("to") or "").lower() != account
            or int(transaction["value"]) != 0
            or bytes(transaction["input"]) != expected
        ):
            return AnchorCheck(status="mismatch", block_number=int(block))
        # A finalized block cannot be reorganized out; earlier confirmations can.
        if int(block) > int(self.web3.eth.get_block("finalized")["number"]):
            return AnchorCheck(status="pending", block_number=int(block))
        # The finalized chain must hold this exact block at that height, not a sibling.
        if _hex(self.web3.eth.get_block(int(block)).get("hash")) != block_hash:
            return AnchorCheck(status="pending", block_number=int(block))
        return AnchorCheck(status="confirmed", block_number=int(block))


@dataclass(frozen=True)
class SignedAnchor:
    nonce: int
    raw_transaction: str
    tx_hash: str
    max_fee: int = 0
    priority_fee: int = 0


class AnchorFeeTooHighError(RuntimeError):
    """Network fees exceed the configured cap; anchoring waits for a later run."""


class AnchorBroadcastError(RuntimeError):
    """The node rejected the transaction and does not know it."""


# Nodes accept a same-nonce replacement only if both fees rise by at least 10%.
REPLACEMENT_BUMP = (9, 8)  # 12.5%


class EvmAnchorSender(EvmAnchorAdapter):
    """Signs anchor transactions locally with the dedicated anchor account."""

    def next_nonce(self, account: str) -> int:
        self._require("anchor_root")
        self._check_chain()
        return int(
            self.web3.eth.get_transaction_count(self.web3.to_checksum_address(account), "pending")
        )

    def mined_nonce(self, account: str) -> int:
        """Transactions from `account` already in blocks; a lower nonce can never be mined."""
        self._require("anchor_root")
        self._check_chain()
        return int(
            self.web3.eth.get_transaction_count(self.web3.to_checksum_address(account), "latest")
        )

    def sign(
        self,
        account: LocalAccount,
        payload: AnchorPayload,
        nonce: int,
        max_fee_wei: int,
        replacing: SignedAnchor | None = None,
    ) -> SignedAnchor:
        """Sign at `nonce`; when `replacing` a stuck transaction, outbid it by 12.5%."""
        self._require("anchor_root")
        self._check_chain()
        data = payload.encode()
        priority = int(self.web3.eth.max_priority_fee)
        base_fee = int(self.web3.eth.get_block("latest")["baseFeePerGas"])
        # Twice the base fee keeps the transaction includable through a few full blocks.
        max_fee = 2 * base_fee + priority
        floor = 0
        if replacing is not None:
            bump, scale = REPLACEMENT_BUMP
            priority = max(priority, -(-replacing.priority_fee * bump // scale))
            floor = -(-replacing.max_fee * bump // scale)
            max_fee = max(max_fee, floor, base_fee + priority)
        # Never pay more than the cap; give up only if the cap cannot get included.
        max_fee = min(max_fee, max_fee_wei)
        if max_fee < base_fee + priority or max_fee < floor:
            raise AnchorFeeTooHighError("network fee exceeds the anchoring cap")
        call = {"from": account.address, "to": account.address, "value": 0, "data": data}
        transaction: TransactionDictType = {
            "type": 2,
            "chainId": int(self.chain.chain_id.split(":")[1]),
            "nonce": nonce,
            "to": account.address,
            "value": 0,
            "data": data,
            "gas": int(self.web3.eth.estimate_gas(call)),  # type: ignore[arg-type]
            "maxFeePerGas": max_fee,
            "maxPriorityFeePerGas": priority,
        }
        signed = account.sign_transaction(transaction)
        return SignedAnchor(
            nonce=nonce,
            raw_transaction="0x" + bytes(signed.raw_transaction).hex(),
            tx_hash="0x" + bytes(signed.hash).hex(),
            max_fee=max_fee,
            priority_fee=priority,
        )

    def broadcast(self, signed: SignedAnchor) -> None:
        """Send the stored transaction; re-sending one the node already has is a no-op."""
        from web3.exceptions import TransactionNotFound

        self._require("anchor_root")
        self._check_chain()
        try:
            self.web3.eth.send_raw_transaction(HexStr(signed.raw_transaction))
        except Exception:
            try:
                self.web3.eth.get_transaction(HexStr(signed.tx_hash))
            except TransactionNotFound:
                raise AnchorBroadcastError("anchor broadcast failed") from None
