"""Anchor batch state machine on a real MongoDB; the chain is a deterministic fake.

Skipped unless QMESH_TEST_MONGODB_URI is set. The real-chain path is covered by
test_anchor_anvil.py.
"""

from __future__ import annotations

import asyncio
import hashlib
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from beanie import init_beanie
from pymongo import AsyncMongoClient

from quantum_backend_v2.application.anchoring import (
    REBROADCAST_SECONDS,
    REPLACED_GRACE_SECONDS,
    STUCK_SECONDS,
    UNANCHORABLE,
    AnchorConflictError,
    AnchorUnavailableError,
    ProvenanceAnchorService,
)
from quantum_backend_v2.chains.anchor import (
    AnchorBroadcastError,
    AnchorCheck,
    AnchorFeeTooHighError,
    AnchorPayload,
    SignedAnchor,
)
from quantum_backend_v2.persistence.mongodb import (
    AnchorBatchDocument,
    AnchorLeaseDocument,
    ProvenanceBundleDocument,
)
from quantum_backend_v2.provenance.hashing import bundle_hash
from quantum_backend_v2.provenance.merkle import MerkleProof, verify_proof
from quantum_backend_v2.provenance.models import ChainAnchor, ProvenanceBundle
from quantum_backend_v2.provenance.verification import RunEvidence, build_result_bundle

MONGODB_URI = os.environ.get("QMESH_TEST_MONGODB_URI")
pytestmark = pytest.mark.skipif(not MONGODB_URI, reason="set QMESH_TEST_MONGODB_URI")
CHAIN_ID = "eip155:11155111"
SENDER = "0x" + "a1" * 20
NEW_SENDER = "0x" + "c3" * 20
START = datetime(2026, 10, 29, 12, tzinfo=timezone.utc)


class FakeChain:
    """Records what the service asks the chain to do; tests decide each transaction's fate."""

    def __init__(self) -> None:
        self.nonce = 0
        self.mined = 0
        self.final = False
        self.forced_status: str | None = None
        self.fail_broadcasts = 0
        self.reject_broadcasts = False
        self.fee_too_high = False
        self.signed: list[SignedAnchor] = []
        self.broadcasts: list[str] = []
        # tx hash -> "mempool" | "mined" | "final" | "reverted"; overrides `final`.
        self.states: dict[str, str] = {}
        self.checked_senders: list[str] = []
        self.nonce_queries: list[str] = []

    def next_nonce(self) -> int:
        return self.nonce

    def mined_nonce(self, address: str) -> int:
        self.nonce_queries.append(address)
        return self.mined

    def sign(self, payload, nonce, replacing=None) -> SignedAnchor:
        if self.fee_too_high:
            raise AnchorFeeTooHighError("fee cap")
        fee = replacing.max_fee * 9 // 8 + 1 if replacing else 10
        data = payload.encode() + nonce.to_bytes(8, "big") + fee.to_bytes(8, "big")
        signed = SignedAnchor(
            nonce, "0x" + data.hex(), "0x" + hashlib.sha256(data).hexdigest(), fee, fee
        )
        self.signed.append(signed)
        return signed

    def broadcast(self, signed: SignedAnchor) -> None:
        if self.fail_broadcasts:
            self.fail_broadcasts -= 1
            raise AnchorUnavailableError("node unreachable")
        if self.reject_broadcasts:
            raise AnchorBroadcastError("nonce too low")
        self.broadcasts.append(signed.tx_hash)

    def check(self, tx_hash: str, payload: AnchorPayload, sender: str) -> AnchorCheck:
        self.checked_senders.append(sender)
        if self.forced_status is not None:
            return AnchorCheck(self.forced_status, 100)
        state = self.states.get(tx_hash)
        if state is None and tx_hash in self.broadcasts:
            state = "final" if self.final else "mempool"
        return {
            None: AnchorCheck("not_found"),
            "mempool": AnchorCheck("pending"),
            "mined": AnchorCheck("pending", 100),
            "final": AnchorCheck("confirmed", 100),
            "reverted": AnchorCheck("failed", 100),
        }[state]

    def explorer_url(self, tx_hash: str) -> str:
        return f"https://sepolia.etherscan.io/tx/{tx_hash}"


class Clock:
    def __init__(self) -> None:
        self.now = START

    def __call__(self) -> datetime:
        return self.now


def with_database(test):
    async def run():
        database = "qmesh_anchor_test_" + uuid4().hex
        client = AsyncMongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        try:
            await init_beanie(
                database=client[database],
                document_models=[
                    ProvenanceBundleDocument,
                    AnchorBatchDocument,
                    AnchorLeaseDocument,
                ],
            )
            await test()
        finally:
            await client.drop_database(database)
            await client.close()

    asyncio.run(run())


async def add_bundles(count: int, start: int = 0) -> list[str]:
    ids = []
    for index in range(start, start + count):
        run_id = f"workflow-{index:04d}"
        bundle = build_result_bundle(
            RunEvidence(
                run_id=run_id,
                workflow_definition_id="circuit-execution",
                owner_user_id="owner-1",
                input_snapshot={"circuit": "h q[0];"},
                plan_id="plan-1",
                result={
                    "job_id": run_id,
                    "fragment_results": [{"fragment_id": "frag-1"}],
                    "quantum_result": {"probabilities": {"0": 1.0}},
                },
            ),
            created_at=START + timedelta(seconds=index),
        )
        await ProvenanceBundleDocument(
            bundle_id=bundle.bundle_id,
            workflow_run_id=run_id,
            payload=bundle.model_dump(mode="json"),
            content_hash=bundle_hash(bundle),
            created_at=bundle.created_at,
        ).insert()
        ids.append(bundle.bundle_id)
    return ids


def service(chain: FakeChain, clock: Clock | None = None, **options) -> ProvenanceAnchorService:
    return ProvenanceAnchorService(
        chain, chain_id=CHAIN_ID, sender=SENDER, now=clock or Clock(), **options
    )


async def stored(bundle_id: str) -> ProvenanceBundleDocument:
    doc = await ProvenanceBundleDocument.find_one({"bundle_id": bundle_id})
    assert doc is not None
    return doc


async def assert_anchored(bundle_ids: list[str], tx_hash: str) -> None:
    for index, bundle_id in enumerate(bundle_ids):
        doc = await stored(bundle_id)
        bundle = ProvenanceBundle.model_validate(doc.payload)
        # Anchors are attached after hashing, so the commitment never changes.
        assert bundle_hash(bundle) == doc.content_hash
        (anchor,) = bundle.anchors
        assert (anchor.chain, anchor.tx_hash, anchor.leaf_index) == (CHAIN_ID, tx_hash, index)
        assert anchor.leaf_count == len(bundle_ids)
        assert anchor.url == f"https://sepolia.etherscan.io/tx/{tx_hash}"
        proof = MerkleProof(anchor.leaf_index, anchor.leaf_count, anchor.proof)
        assert verify_proof(doc.content_hash, proof, anchor.merkle_root)


def test_one_transaction_anchors_every_bundle_only_once_final():
    async def test():
        chain = FakeChain()
        anchors = service(chain)
        assert await anchors.run_once() == "idle"
        ids = await add_bundles(5)
        assert await anchors.run_once() == "pending"
        (signed,) = chain.signed
        assert chain.broadcasts == [signed.tx_hash]
        # Nothing is written to bundles before the transaction is final.
        assert all([not (await stored(i)).payload.get("anchors") for i in ids])
        chain.final = True
        assert await anchors.run_once() == "anchored"
        await assert_anchored(ids, signed.tx_hash)
        batch = await AnchorBatchDocument.find_one({"tx_hash": signed.tx_hash})
        assert (batch.status, batch.open, batch.bundle_ids) == ("anchored", None, ids)
        assert AnchorPayload.decode(bytes.fromhex(signed.raw_transaction[2:])[:45]) == (
            AnchorPayload(batch.merkle_root, 5)
        )
        assert await anchors.run_once() == "idle"
        assert len(chain.signed) == 1

        newer = await add_bundles(2, start=5)
        chain.final = False
        assert await anchors.run_once() == "pending"
        chain.final = True
        assert await anchors.run_once() == "anchored"
        await assert_anchored(newer, chain.signed[1].tx_hash)

    with_database(test)


def test_a_crash_after_signing_resends_the_identical_transaction():
    async def test():
        chain = FakeChain()
        ids = await add_bundles(3)
        chain.fail_broadcasts = 1
        with pytest.raises(AnchorUnavailableError):
            await service(chain).run_once()
        batch = await AnchorBatchDocument.find_one({"open": True})
        assert batch.status == "signed" and batch.tx_hash == chain.signed[0].tx_hash
        # A new process resumes the stored transaction instead of signing a new one.
        restarted = service(chain, holder="replacement")
        chain.final = True
        await AnchorLeaseDocument.get_pymongo_collection().delete_many({})
        assert await restarted.run_once() == "anchored"
        assert len(chain.signed) == 1
        assert chain.broadcasts == [batch.tx_hash]
        await assert_anchored(ids, batch.tx_hash)

    with_database(test)


@pytest.mark.parametrize("status", ["failed", "mismatch"])
def test_a_failed_transaction_releases_bundles_without_writing_anchors(status):
    async def test():
        chain = FakeChain()
        ids = await add_bundles(4)
        chain.forced_status = status
        anchors = service(chain)
        assert await anchors.run_once() == "failed"
        failed = await AnchorBatchDocument.find_one({"status": "failed"})
        assert failed.open is None and failed.error == f"anchor transaction {status}"
        for bundle_id in ids:
            doc = await stored(bundle_id)
            assert doc.anchor_batch_id is None and not doc.payload.get("anchors")
        # The next run anchors the same bundles in a new batch.
        chain.forced_status = None
        chain.final = True
        chain.nonce = 1
        assert await anchors.run_once() == "anchored"
        await assert_anchored(ids, chain.signed[1].tx_hash)

    with_database(test)


def test_a_lost_transaction_is_resent_until_its_nonce_is_taken():
    async def test():
        chain = FakeChain()
        clock = Clock()
        anchors = service(chain, clock)
        ids = await add_bundles(2)
        assert await anchors.run_once() == "pending"
        chain.broadcasts.clear()  # The node dropped it.
        assert await anchors.run_once() == "pending"
        assert chain.broadcasts == []  # Too soon to re-send.
        clock.now += timedelta(seconds=REBROADCAST_SECONDS + 1)
        assert await anchors.run_once() == "pending"
        assert chain.broadcasts == [chain.signed[0].tx_hash]

        chain.broadcasts.clear()
        chain.mined = 1  # Another transaction used the nonce.
        assert await anchors.run_once() == "pending"  # Could be a lagging node.
        clock.now += timedelta(seconds=REPLACED_GRACE_SECONDS + 1)
        assert await anchors.run_once() == "failed"
        assert all([(await stored(i)).anchor_batch_id is None for i in ids])

    with_database(test)


def test_fee_spikes_wait_without_spending():
    async def test():
        chain = FakeChain()
        anchors = service(chain)
        ids = await add_bundles(2)
        chain.fee_too_high = True
        assert await anchors.run_once() == "fee_too_high"
        assert chain.broadcasts == []
        assert (await AnchorBatchDocument.find_one({"open": True})).status == "prepared"
        chain.fee_too_high = False
        chain.final = True
        assert await anchors.run_once() == "anchored"
        await assert_anchored(ids, chain.signed[0].tx_hash)

    with_database(test)


def test_a_crash_after_writing_anchors_never_duplicates_them():
    async def test():
        chain = FakeChain()
        chain.final = True
        ids = await add_bundles(3)
        crashing = service(chain, holder="a")
        original_close = crashing._close

        async def crash_before_close(*args, **kwargs):
            raise RuntimeError("process killed")

        crashing._close = crash_before_close
        with pytest.raises(RuntimeError):
            await crashing.run_once()
        # Anchors were written but the batch is still open; the next run finishes it.
        crashing._close = original_close
        assert await crashing.run_once() == "anchored"
        await assert_anchored(ids, chain.signed[0].tx_hash)

    with_database(test)


def test_tampered_or_hashless_bundles_are_never_anchored():
    async def test():
        chain = FakeChain()
        chain.final = True
        ids = await add_bundles(3)
        tampered = await stored(ids[1])
        tampered.payload["artifact_refs"] = ["changed after hashing"]
        await tampered.save()
        legacy = await stored(ids[2])
        legacy.content_hash = None
        await legacy.save()
        assert await service(chain).run_once() == "anchored"
        await assert_anchored([ids[0]], chain.signed[0].tx_hash)
        assert (await stored(ids[1])).anchor_batch_id == UNANCHORABLE
        assert (await stored(ids[2])).anchor_batch_id is None  # No commitment to check.
        for bundle_id in ids[1:]:
            assert not (await stored(bundle_id)).payload.get("anchors")

    with_database(test)


def test_one_replica_at_a_time_and_one_open_batch():
    async def test():
        chain = FakeChain()
        clock = Clock()
        first, second = service(chain, clock, holder="a"), service(chain, clock, holder="b")
        await add_bundles(2)
        assert await first.run_once() == "pending"
        assert await second.run_once() == "busy"
        clock.now += timedelta(minutes=11)  # The first replica's lease expired.
        assert await second.run_once() == "pending"
        assert len(chain.signed) == 1  # It resumed the open batch rather than opening one.
        with pytest.raises(Exception):  # noqa: B017 - the unique open-batch index
            await AnchorBatchDocument(
                id="anchor-duplicate",
                status="prepared",
                chain_id=CHAIN_ID,
                sender=SENDER,
                bundle_ids=[],
                bundle_hashes=[],
                merkle_root="00" * 32,
            ).insert()

    with_database(test)


def test_batches_respect_the_size_limit_in_creation_order():
    async def test():
        chain = FakeChain()
        chain.final = True
        ids = await add_bundles(5)
        anchors = service(chain, max_batch=2)
        assert await anchors.run_once() == "anchored"
        assert await anchors.run_once() == "anchored"
        batches = await AnchorBatchDocument.find_all().sort("+created_at").to_list()
        assert [batch.bundle_ids for batch in batches] == [ids[:2], ids[2:4]]
        assert (await stored(ids[4])).anchor_batch_id is None

    with_database(test)


def test_chain_anchor_model_accepts_what_the_service_writes():
    anchor = ChainAnchor(
        chain=CHAIN_ID,
        tx_hash="0x" + "ab" * 32,
        url="https://sepolia.etherscan.io/tx/0x" + "ab" * 32,
        merkle_root="cd" * 32,
        leaf_index=0,
        leaf_count=1,
    )
    assert anchor.proof == ()


def test_a_crash_between_opening_and_claiming_resumes_with_the_claim():
    async def test():
        chain = FakeChain()
        chain.final = True
        anchors = service(chain)
        ids = await add_bundles(3)
        await anchors._prepare()  # Interrupted before the bundles were claimed.
        assert all([(await stored(i)).anchor_batch_id is None for i in ids])
        assert await anchors.run_once() == "anchored"
        await assert_anchored(ids, chain.signed[0].tx_hash)

    with_database(test)


def test_a_lagging_node_does_not_fail_a_mined_batch():
    async def test():
        chain = FakeChain()
        clock = Clock()
        anchors = service(chain, clock)
        ids = await add_bundles(2)
        assert await anchors.run_once() == "pending"
        tx_hash = chain.signed[0].tx_hash
        # One node lost the transaction while another already counts its nonce as used.
        chain.broadcasts.clear()
        chain.mined = 1
        assert await anchors.run_once() == "pending"
        clock.now += timedelta(seconds=REPLACED_GRACE_SECONDS // 2)
        chain.states[tx_hash] = "final"
        assert await anchors.run_once() == "anchored"
        await assert_anchored(ids, tx_hash)
        assert len(chain.signed) == 1

    with_database(test)


def test_a_stuck_transaction_is_outbid_and_either_attempt_can_win():
    async def test():
        chain = FakeChain()
        clock = Clock()
        anchors = service(chain, clock)
        ids = await add_bundles(3)
        assert await anchors.run_once() == "pending"
        first = chain.signed[0]
        clock.now += timedelta(seconds=STUCK_SECONDS + 1)
        assert await anchors.run_once() == "pending"
        second = chain.signed[1]
        assert (second.nonce, chain.broadcasts) == (first.nonce, [first.tx_hash, second.tx_hash])
        assert second.max_fee > first.max_fee
        batch = await AnchorBatchDocument.find_one({"open": True})
        assert [a["tx_hash"] for a in batch.attempts] == [first.tx_hash, second.tx_hash]
        # The original, cheaper transaction is the one that got mined.
        chain.states = {first.tx_hash: "final", second.tx_hash: None}
        assert await anchors.run_once() == "anchored"
        await assert_anchored(ids, first.tx_hash)

    with_database(test)


def test_a_signed_batch_whose_nonce_was_taken_fails_cleanly():
    async def test():
        chain = FakeChain()
        ids = await add_bundles(2)
        chain.fail_broadcasts = 1
        with pytest.raises(AnchorUnavailableError):
            await service(chain, holder="a").run_once()
        chain.reject_broadcasts = True
        chain.mined = 1
        assert await service(chain, holder="a").run_once() == "failed"
        assert all([(await stored(i)).anchor_batch_id is None for i in ids])

    with_database(test)


def test_unanchorable_bundles_do_not_starve_the_queue():
    async def test():
        chain = FakeChain()
        chain.final = True
        ids = await add_bundles(5)
        for bundle_id in ids[:3]:
            doc = await stored(bundle_id)
            doc.payload["artifact_refs"] = ["changed"]
            await doc.save()
        assert await service(chain, max_batch=3).run_once() == "anchored"
        await assert_anchored(ids[3:], chain.signed[0].tx_hash)

    with_database(test)


def test_a_key_rotation_mid_batch_checks_the_batch_sender():
    async def test():
        chain = FakeChain()
        old_sender = SENDER
        ids = await add_bundles(2)
        assert await service(chain, holder="a").run_once() == "pending"
        rotated = ProvenanceAnchorService(
            chain, chain_id=CHAIN_ID, sender="0x" + "c3" * 20, now=Clock(), holder="a"
        )
        chain.final = True
        assert await rotated.run_once() == "anchored"
        assert set(chain.checked_senders) == {old_sender}
        await assert_anchored(ids, chain.signed[0].tx_hash)

    with_database(test)


def rotated(chain: FakeChain, clock: Clock) -> ProvenanceAnchorService:
    return ProvenanceAnchorService(
        chain, chain_id=CHAIN_ID, sender=NEW_SENDER, now=clock, holder="a"
    )


def test_a_rotated_key_never_replaces_an_old_batch_nonce():
    async def test():
        chain = FakeChain()
        clock = Clock()
        ids = await add_bundles(2)
        assert await service(chain, clock, holder="a").run_once() == "pending"
        (original,) = chain.signed
        clock.now += timedelta(seconds=STUCK_SECONDS + 1)
        assert await rotated(chain, clock).run_once() == "pending"
        # The new account cannot replace the old account's nonce, so it signs nothing.
        assert chain.signed == [original]
        # A lost transaction is re-sent as signed, and its nonce is the old account's.
        chain.broadcasts = []
        assert await rotated(chain, clock).run_once() == "pending"
        assert chain.broadcasts == [original.tx_hash]
        assert chain.nonce_queries == [SENDER]
        chain.states = {original.tx_hash: "final"}
        assert await rotated(chain, clock).run_once() == "anchored"
        await assert_anchored(ids, original.tx_hash)

    with_database(test)


def test_an_unsigned_batch_is_signed_by_the_current_account_after_rotation():
    async def test():
        chain = FakeChain()
        clock = Clock()
        ids = await add_bundles(2)
        chain.fee_too_high = True
        assert await service(chain, clock, holder="a").run_once() == "fee_too_high"
        chain.fee_too_high = False
        chain.final = True
        assert await rotated(chain, clock).run_once() == "anchored"
        batch = await AnchorBatchDocument.find_one({"status": "anchored"})
        assert batch.sender == NEW_SENDER and set(chain.checked_senders) == {NEW_SENDER}
        await assert_anchored(ids, chain.signed[0].tx_hash)

    with_database(test)


def payload_of(batch: AnchorBatchDocument) -> AnchorPayload:
    return AnchorPayload(batch.merkle_root, len(batch.bundle_ids))


def test_a_runner_whose_lease_expired_cannot_overwrite_its_successor():
    async def test():
        chain = FakeChain()
        clock = Clock()
        first, second = service(chain, clock, holder="a"), service(chain, clock, holder="b")
        await add_bundles(2)
        assert await first.run_once() == "pending"
        # The first runner pauses holding this snapshot, beyond its lease.
        stale = await AnchorBatchDocument.find_one({"open": True})
        clock.now += timedelta(seconds=STUCK_SECONDS + 1)
        assert await second.run_once() == "pending"
        original, replacement = chain.signed
        # Resuming, it would outbid again; the lost lease stops it before any write.
        with pytest.raises(AnchorConflictError):
            await first._settle(stale, payload_of(stale))
        with pytest.raises(AnchorConflictError):
            await first._fail(stale, "stale runner")
        batch = await AnchorBatchDocument.find_one({"open": True})
        assert [a["tx_hash"] for a in batch.attempts] == [original.tx_hash, replacement.tx_hash]
        assert chain.broadcasts == [original.tx_hash, replacement.tx_hash]
        assert all(
            doc.anchor_batch_id == batch.id
            for doc in await ProvenanceBundleDocument.find_all().to_list()
        )
        assert await first.run_once() == "busy"

    with_database(test)


def test_a_stale_snapshot_is_rejected_even_while_the_lease_is_held():
    async def test():
        chain = FakeChain()
        clock = Clock()
        anchors = service(chain, clock, holder="a")
        await add_bundles(2)
        assert await anchors.run_once() == "pending"
        stale = await AnchorBatchDocument.find_one({"open": True})
        clock.now += timedelta(seconds=STUCK_SECONDS + 1)
        assert await anchors.run_once() == "pending"
        # The batch revision moved on, so the older snapshot cannot be saved.
        with pytest.raises(AnchorConflictError):
            await anchors._settle(stale, payload_of(stale))
        batch = await AnchorBatchDocument.find_one({"open": True})
        assert len(batch.attempts) == 2

    with_database(test)


def test_bundles_of_a_failed_batch_are_released_after_a_crash():
    async def test():
        chain = FakeChain()
        ids = await add_bundles(2)
        chain.forced_status = "failed"
        assert await service(chain, holder="a").run_once() == "failed"
        failed = await AnchorBatchDocument.find_one({"status": "failed"})
        # Simulate a crash between closing the batch and releasing its bundles.
        await ProvenanceBundleDocument.get_pymongo_collection().update_many(
            {}, {"$set": {"anchor_batch_id": failed.id}}
        )
        await AnchorBatchDocument.get_pymongo_collection().update_one(
            {"_id": failed.id}, {"$set": {"released": False}}
        )
        chain.forced_status = None
        chain.final = True
        assert await service(chain, holder="a").run_once() == "anchored"
        await assert_anchored(ids, chain.signed[-1].tx_hash)

    with_database(test)
