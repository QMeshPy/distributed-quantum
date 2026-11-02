"""Send and check provenance Merkle-root anchors on the configured chain (#21)."""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Callable, Collection, Mapping
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Protocol, TypeVar

from pymongo import UpdateOne
from pymongo.errors import DuplicateKeyError
from requests import Session
from web3 import Web3

from quantum_backend_v2.chains.adapter import (
    ChainMismatchError,
    EvmExplorerAdapter,
    UnsupportedOperationError,
)
from quantum_backend_v2.chains.anchor import (
    AnchorBroadcastError,
    AnchorCheck,
    AnchorFeeTooHighError,
    AnchorPayload,
    EvmAnchorAdapter,
    EvmAnchorSender,
    SignedAnchor,
)
from quantum_backend_v2.chains.models import ChainSpec, DisabledNetworkError
from quantum_backend_v2.chains.rpc import RpcConfigurationError, resolve_rpc_url
from quantum_backend_v2.persistence.mongodb import (
    AnchorBatchDocument,
    AnchorLeaseDocument,
    ProvenanceBundleDocument,
)
from quantum_backend_v2.provenance.hashing import bundle_hash
from quantum_backend_v2.provenance.merkle import MerkleTree
from quantum_backend_v2.provenance.models import ChainAnchor, ProvenanceBundle

if TYPE_CHECKING:
    from eth_account.signers.local import LocalAccount

logger = logging.getLogger(__name__)
T = TypeVar("T")

# Configuration problems, not evidence about the anchor itself.
_LOOKUP_UNAVAILABLE = (
    ChainMismatchError,
    DisabledNetworkError,
    RpcConfigurationError,
    UnsupportedOperationError,
)


class AnchorConflictError(RuntimeError):
    """Another runner took over the lease or moved the batch; this one must stop."""


class AnchorUnavailableError(OSError):
    """Not final yet, not found or not reachable; verification reports `unavailable`."""


def _web3(chain: ChainSpec, rpc_env: Mapping[str, str], session: Session, timeout: int) -> Web3:
    return Web3(
        Web3.HTTPProvider(
            resolve_rpc_url(chain, rpc_env),
            session=session,
            request_kwargs={"timeout": timeout},
            exception_retry_configuration=None,
        )
    )


def _rpc_env(chain: ChainSpec, env: Mapping[str, str]) -> dict[str, str]:
    return {chain.rpc_env_var: env[chain.rpc_env_var]} if chain.rpc_env_var in env else {}


class RegistryAnchorAdapter:
    """`AnchorAdapter` for one registry chain; read-only.

    `senders` is every anchor account this deployment has used, current first, so
    anchors sent before a key rotation keep verifying.
    """

    def __init__(
        self, chain: ChainSpec, senders: str | Collection[str], env: Mapping[str, str]
    ) -> None:
        if "anchor_root" not in chain.capabilities:
            raise ValueError("network does not support provenance anchoring")
        self._senders = (senders,) if isinstance(senders, str) else tuple(senders)
        if not self._senders:
            raise ValueError("at least one anchor sender is required")
        self.chain = chain
        self._rpc_env = _rpc_env(chain, env)

    async def contains_root(self, anchor: ChainAnchor) -> bool:
        if anchor.chain != self.chain.chain_id:
            return False
        payload = AnchorPayload(anchor.merkle_root, anchor.leaf_count, anchor.hash_profile)

        def check() -> AnchorCheck:
            try:
                with Session() as session:
                    adapter = EvmAnchorAdapter(
                        self.chain, _web3(self.chain, self._rpc_env, session, 10)
                    )
                    return adapter.check_anchor(anchor.tx_hash, payload, self._senders)
            except _LOOKUP_UNAVAILABLE:
                raise AnchorUnavailableError("anchor lookup misconfigured") from None
            except ValueError:
                raise  # A malformed anchor reference fails verification.
            except Exception:
                # RPC errors can include a credential-bearing endpoint URL.
                raise AnchorUnavailableError("anchor lookup failed") from None

        result = await asyncio.to_thread(check)
        if result.status in ("pending", "not_found"):
            # A missing transaction may be pruned history, so it is not proof of absence.
            raise AnchorUnavailableError(f"anchor transaction {result.status}")
        return result.status == "confirmed"


class AnchorChain(Protocol):
    """Chain operations the anchor service needs; one implementation per network."""

    def next_nonce(self) -> int: ...

    def mined_nonce(self, address: str) -> int: ...

    def sign(
        self, payload: AnchorPayload, nonce: int, replacing: SignedAnchor | None = None
    ) -> SignedAnchor: ...

    def broadcast(self, signed: SignedAnchor) -> None: ...

    def check(self, tx_hash: str, payload: AnchorPayload, sender: str) -> AnchorCheck: ...

    def explorer_url(self, tx_hash: str) -> str | None: ...


class EvmAnchorChain:
    """`AnchorChain` over a registry network; each call uses a fresh HTTP session."""

    def __init__(
        self,
        chain: ChainSpec,
        account: LocalAccount,
        env: Mapping[str, str],
        *,
        max_fee_wei: int,
    ) -> None:
        if "anchor_root" not in chain.capabilities:
            raise ValueError("network does not support provenance anchoring")
        self.chain = chain
        self._account = account
        self._rpc_env = _rpc_env(chain, env)
        self._max_fee_wei = max_fee_wei

    def _call(self, operation: Callable[[EvmAnchorSender], T]) -> T:
        try:
            with Session() as session:
                web3 = _web3(self.chain, self._rpc_env, session, 20)
                return operation(EvmAnchorSender(self.chain, web3))
        except (AnchorFeeTooHighError, AnchorBroadcastError, *_LOOKUP_UNAVAILABLE):
            raise
        except Exception:
            # RPC errors can include a credential-bearing endpoint URL; never log them.
            raise AnchorUnavailableError("anchor RPC call failed") from None

    def next_nonce(self) -> int:
        return self._call(lambda sender: sender.next_nonce(self._account.address))

    def mined_nonce(self, address: str) -> int:
        return self._call(lambda sender: sender.mined_nonce(address))

    def sign(
        self, payload: AnchorPayload, nonce: int, replacing: SignedAnchor | None = None
    ) -> SignedAnchor:
        return self._call(
            lambda sender: sender.sign(
                self._account, payload, nonce, self._max_fee_wei, replacing=replacing
            )
        )

    def broadcast(self, signed: SignedAnchor) -> None:
        self._call(lambda sender: sender.broadcast(signed))

    def check(self, tx_hash: str, payload: AnchorPayload, sender: str) -> AnchorCheck:
        return self._call(lambda adapter: adapter.check_anchor(tx_hash, payload, sender))

    def explorer_url(self, tx_hash: str) -> str | None:
        if "explorer_url" not in self.chain.capabilities:
            return None
        return EvmExplorerAdapter(self.chain).explorer_url("transaction", tx_hash)


LEASE_ID = "provenance-anchor"
LEASE_SECONDS = 600
# Re-send a submitted transaction the node has lost after this long.
REBROADCAST_SECONDS = 300
# Outbid an unmined transaction (same nonce, higher fee) after this long.
STUCK_SECONDS = 1800
# A lagging node can miss a mined transaction; only call it replaced after this long.
REPLACED_GRACE_SECONDS = 600
# Bundles whose stored payload no longer matches their commitment are never anchored.
UNANCHORABLE = "unanchorable"


class ProvenanceAnchorService:
    """Batches unanchored circuit bundles into one transaction per run (#21).

    Bundles are claimed before signing, each signed transaction is stored before it
    is broadcast, and anchors are written only after the transaction is final, so a
    crash or retry at any step resumes the same batch without corrupting bundles.
    """

    def __init__(
        self,
        chain: AnchorChain,
        *,
        chain_id: str,
        sender: str,
        max_batch: int = 10_000,
        holder: str | None = None,
        now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        self._chain = chain
        self._chain_id = chain_id
        self._sender = sender
        self._max_batch = max_batch
        self._holder = holder or f"anchor-{uuid.uuid4()}"
        self._now = now

    async def run_once(self) -> str:
        """Advance anchoring as far as possible; returns the batch state reached."""
        if not await self._acquire_lease():
            return "busy"
        try:
            batch = await AnchorBatchDocument.find_one({"open": True})
            if batch is None:
                batch = await self._prepare()
                if batch is None:
                    return "idle"
            return await self._advance(batch)
        except AnchorConflictError:
            # A paused runner whose lease expired must not overwrite its successor.
            logger.warning("anchor run stopped: another runner took over the batch")
            return "busy"

    async def _acquire_lease(self) -> bool:
        now = self._now()
        try:
            await AnchorLeaseDocument.get_pymongo_collection().find_one_and_update(
                {"_id": LEASE_ID, "$or": [{"expires_at": {"$lt": now}}, {"holder": self._holder}]},
                {
                    "$set": {
                        "holder": self._holder,
                        "expires_at": now + timedelta(seconds=LEASE_SECONDS),
                    }
                },
                upsert=True,
            )
        except DuplicateKeyError:
            return False  # Another replica holds an unexpired lease.
        return True

    async def _renew_lease(self) -> None:
        """Extend the lease only while this runner still holds it, before any write."""
        now = self._now()
        renewed = await AnchorLeaseDocument.get_pymongo_collection().find_one_and_update(
            {"_id": LEASE_ID, "holder": self._holder, "expires_at": {"$gt": now}},
            {"$set": {"expires_at": now + timedelta(seconds=LEASE_SECONDS)}},
        )
        if renewed is None:
            raise AnchorConflictError("anchor lease lost")

    async def _prepare(self) -> AnchorBatchDocument | None:
        bundles = ProvenanceBundleDocument.get_pymongo_collection()
        # A crash after closing a failed batch can leave its bundles claimed.
        async for failed in AnchorBatchDocument.find({"status": "failed", "released": False}):
            await self._release(failed.id)
        while True:
            candidates = (
                await ProvenanceBundleDocument.find(
                    {"anchor_batch_id": None, "content_hash": {"$ne": None}}
                )
                .sort("+created_at", "+bundle_id")
                .limit(self._max_batch)
                .to_list()
            )
            if not candidates:
                return None
            entries = [(doc.bundle_id, str(doc.content_hash)) for doc in candidates if _intact(doc)]
            rejected = [doc.bundle_id for doc in candidates if not _intact(doc)]
            if rejected:
                # Mark them once so they cannot fill every future batch.
                await bundles.update_many(
                    {"bundle_id": {"$in": rejected}, "anchor_batch_id": None},
                    {"$set": {"anchor_batch_id": UNANCHORABLE}},
                )
                logger.warning("%d provenance bundles fail their commitment", len(rejected))
            if entries:
                break
        batch = AnchorBatchDocument(
            id=f"anchor-{uuid.uuid4()}",
            status="prepared",
            chain_id=self._chain_id,
            sender=self._sender,
            bundle_ids=[bundle_id for bundle_id, _ in entries],
            bundle_hashes=[digest for _, digest in entries],
            merkle_root=MerkleTree([digest for _, digest in entries]).root,
        )
        try:
            await batch.insert()
        except DuplicateKeyError:
            return None  # A concurrent run opened a batch first.
        return batch

    async def _claim(self, batch: AnchorBatchDocument) -> bool:
        """Claim the batch's bundles; idempotent, so a resumed batch re-runs it."""
        bundles = ProvenanceBundleDocument.get_pymongo_collection()
        await bundles.update_many(
            {"bundle_id": {"$in": batch.bundle_ids}, "anchor_batch_id": None},
            {"$set": {"anchor_batch_id": batch.id}},
        )
        claimed = {
            doc["bundle_id"]
            async for doc in bundles.find({"anchor_batch_id": batch.id}, {"bundle_id": 1})
        }
        if claimed == set(batch.bundle_ids):
            return True
        # Anchor only bundles this batch owns, in their original order.
        kept = [
            (bundle_id, digest)
            for bundle_id, digest in zip(batch.bundle_ids, batch.bundle_hashes, strict=True)
            if bundle_id in claimed
        ]
        if not kept:
            await self._close(batch, "failed", error="no bundles could be claimed")
            return False
        batch.bundle_ids = [bundle_id for bundle_id, _ in kept]
        batch.bundle_hashes = [digest for _, digest in kept]
        batch.merkle_root = MerkleTree(batch.bundle_hashes).root
        await self._update(batch, "prepared")
        return True

    async def _advance(self, batch: AnchorBatchDocument) -> str:
        payload = AnchorPayload(batch.merkle_root, len(batch.bundle_ids))
        if batch.status == "prepared":
            if not await self._claim(batch):
                return "failed"
            # Nothing is signed yet, so a batch prepared before a key rotation can move.
            batch.sender = self._sender
            try:
                nonce = await asyncio.to_thread(self._chain.next_nonce)
                signed = await asyncio.to_thread(self._chain.sign, payload, nonce)
            except AnchorFeeTooHighError:
                return "fee_too_high"
            # Persist before broadcasting: a crash after sending re-sends this exact tx.
            batch.nonce = signed.nonce
            batch.attempts = [_attempt(signed, self._now())]
            batch.tx_hash = signed.tx_hash
            batch.status = "signed"
            await self._update(batch, "prepared")
        if batch.status == "signed":
            try:
                await self._broadcast(batch)
            except AnchorBroadcastError:
                if await self._nonce_taken(batch):
                    await self._fail(batch, "anchor nonce was used by another transaction")
                    return "failed"
                raise
            batch.status = "submitted"
            await self._update(batch, "signed")
        return await self._settle(batch, payload)

    async def _settle(self, batch: AnchorBatchDocument, payload: AnchorPayload) -> str:
        """Check every signed attempt; any one being final anchors the batch."""
        checks = [
            (
                attempt,
                await asyncio.to_thread(
                    self._chain.check, attempt["tx_hash"], payload, batch.sender
                ),
            )
            for attempt in reversed(batch.attempts)
        ]
        for attempt, check in checks:
            if check.status == "confirmed":
                await self._apply(batch, attempt["tx_hash"], check.block_number)
                return "anchored"
            if check.status in ("failed", "mismatch"):
                await self._fail(batch, f"anchor transaction {check.status}")
                return "failed"
        now = self._now()
        if any(check.block_number is not None for _, check in checks):
            batch.missing_since = None  # Mined; waiting for finality.
        elif any(check.status == "pending" for _, check in checks):
            batch.missing_since = None
            latest = batch.attempts[-1]
            if now - _aware(latest["signed_at"]) > timedelta(seconds=STUCK_SECONDS):
                if self._signs_for(batch):
                    await self._replace(batch, payload)
                else:
                    # Only the batch's own account can replace its nonce.
                    logger.warning("anchor batch from a previous key is unmined; not replacing")
        elif await self._nonce_taken(batch):
            batch.missing_since = batch.missing_since or now
            if now - _aware(batch.missing_since) > timedelta(seconds=REPLACED_GRACE_SECONDS):
                await self._fail(batch, "anchor nonce was used by another transaction")
                return "failed"
        else:
            last = batch.last_broadcast_at
            if last is None or now - _aware(last) > timedelta(seconds=REBROADCAST_SECONDS):
                await self._broadcast(batch)
        await self._update(batch, "submitted")
        return "pending"

    async def _replace(self, batch: AnchorBatchDocument, payload: AnchorPayload) -> None:
        """Outbid an unmined attempt at the same nonce; earlier attempts stay valid."""
        if not self._signs_for(batch):
            return
        latest = batch.attempts[-1]
        previous = SignedAnchor(
            int(batch.nonce or 0),
            latest["raw_transaction"],
            latest["tx_hash"],
            latest["max_fee"],
            latest["priority_fee"],
        )
        try:
            signed = await asyncio.to_thread(self._chain.sign, payload, previous.nonce, previous)
        except AnchorFeeTooHighError:
            logger.warning("anchor transaction is underpriced and the fee cap prevents a bump")
            return
        batch.attempts = [*batch.attempts, _attempt(signed, self._now())]
        batch.tx_hash = signed.tx_hash
        await self._update(batch, "submitted")
        await self._broadcast(batch)

    def _signs_for(self, batch: AnchorBatchDocument) -> bool:
        return batch.sender.lower() == self._sender.lower()

    async def _broadcast(self, batch: AnchorBatchDocument) -> None:
        await self._renew_lease()
        latest = batch.attempts[-1]
        signed = SignedAnchor(int(batch.nonce or 0), latest["raw_transaction"], latest["tx_hash"])
        await asyncio.to_thread(self._chain.broadcast, signed)
        batch.broadcasts += 1
        batch.last_broadcast_at = self._now()

    async def _nonce_taken(self, batch: AnchorBatchDocument) -> bool:
        # The batch's own account, which differs from the signer after a key rotation.
        mined = await asyncio.to_thread(self._chain.mined_nonce, batch.sender)
        return mined > int(batch.nonce or 0)

    async def _update(self, batch: AnchorBatchDocument, expected: str) -> None:
        """Save only if no other runner moved the batch since this one read it."""
        await self._write(batch, {"status": expected, "open": True})

    async def _write(self, batch: AnchorBatchDocument, match: dict[str, Any]) -> None:
        # The lease stops a paused runner; the revision catches any write it races.
        await self._renew_lease()
        batch.updated_at = self._now()
        result = await AnchorBatchDocument.get_pymongo_collection().update_one(
            {"_id": batch.id, "revision": batch.revision, **match},
            {
                "$set": batch.model_dump(exclude={"id", "revision_id", "revision"}),
                "$inc": {"revision": 1},
            },
        )
        if result.matched_count != 1:
            raise AnchorConflictError("anchor batch changed concurrently")
        batch.revision += 1

    async def _apply(self, batch: AnchorBatchDocument, tx_hash: str, block: int | None) -> None:
        await self._renew_lease()
        tree = MerkleTree(batch.bundle_hashes)
        url = self._chain.explorer_url(tx_hash)
        operations = [
            # Idempotent: a retried apply never adds the same anchor twice.
            UpdateOne(
                {
                    "bundle_id": bundle_id,
                    "anchor_batch_id": batch.id,
                    "payload.anchors.tx_hash": {"$ne": tx_hash},
                },
                {
                    "$push": {
                        "payload.anchors": ChainAnchor(
                            chain=batch.chain_id,
                            tx_hash=tx_hash,
                            url=url,
                            merkle_root=batch.merkle_root,
                            leaf_index=index,
                            leaf_count=len(batch.bundle_ids),
                            proof=tree.proof(index).siblings,
                        ).model_dump(mode="json")
                    }
                },
            )
            for index, bundle_id in enumerate(batch.bundle_ids)
        ]
        await ProvenanceBundleDocument.get_pymongo_collection().bulk_write(
            operations, ordered=False
        )
        batch.tx_hash = tx_hash
        batch.block_number = block
        await self._close(batch, "anchored")

    async def _fail(self, batch: AnchorBatchDocument, error: str) -> None:
        # Close first: a runner that lost the batch must not release its successor's claim.
        await self._close(batch, "failed", error=error)
        await self._release(batch.id)

    async def _release(self, batch_id: str) -> None:
        # Failed attempts never wrote anchors; free the bundles for the next batch.
        await ProvenanceBundleDocument.get_pymongo_collection().update_many(
            {"anchor_batch_id": batch_id}, {"$set": {"anchor_batch_id": None}}
        )
        await AnchorBatchDocument.get_pymongo_collection().update_one(
            {"_id": batch_id}, {"$set": {"released": True}}
        )

    async def _close(
        self, batch: AnchorBatchDocument, status: str, *, error: str | None = None
    ) -> None:
        batch.status = status
        batch.open = None
        batch.error = error
        await self._write(batch, {"open": True})


def _attempt(signed: SignedAnchor, signed_at: datetime) -> dict[str, Any]:
    return {
        "tx_hash": signed.tx_hash,
        "raw_transaction": signed.raw_transaction,
        "max_fee": signed.max_fee,
        "priority_fee": signed.priority_fee,
        "signed_at": signed_at,
    }


def _intact(doc: ProvenanceBundleDocument) -> bool:
    """Anchor only evidence whose stored payload still matches its recorded hash."""
    try:
        return bundle_hash(ProvenanceBundle.model_validate(doc.payload)) == doc.content_hash
    except (TypeError, ValueError):
        return False


def _aware(value: datetime) -> datetime:
    # MongoDB returns naive UTC datetimes.
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


# Seconds to wait after each outcome; a batch awaiting finality or a backlog runs soon.
_FOLLOW_UP = {"pending": 60, "busy": 60, "anchored": 5, "failed": 5, "fee_too_high": 300}


async def anchor_periodically(service: ProvenanceAnchorService, interval_seconds: int) -> None:
    """Run anchoring until shutdown."""
    while True:
        try:
            outcome = await service.run_once()
        except Exception as exc:
            # A failed run must not stop later ones; the next run resumes the batch.
            # Log the class only: transport errors can carry credential-bearing URLs.
            logger.warning("provenance anchoring run failed: %s", type(exc).__name__)
            outcome = "error"
        await asyncio.sleep(_FOLLOW_UP.get(outcome, interval_seconds if outcome == "idle" else 300))
