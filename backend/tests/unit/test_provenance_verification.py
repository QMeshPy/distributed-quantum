"""Verification must distinguish local integrity from external attestations."""

from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import datetime, timezone

import pytest

from quantum_backend_v2.provenance.hashing import bundle_hash
from quantum_backend_v2.provenance.merkle import MerkleTree
from quantum_backend_v2.provenance.models import ChainAnchor, ProvenanceBundle, StorageReference
from quantum_backend_v2.provenance.verification import (
    RunEvidence,
    build_result_bundle,
    verify_bundle,
)


def evidence() -> RunEvidence:
    return RunEvidence(
        run_id="workflow-1",
        workflow_definition_id="circuit-execution",
        owner_user_id="owner-1",
        input_snapshot={"circuit": "h q[0];"},
        plan_id="plan-1",
        result={
            "job_id": "workflow-1",
            "fragment_results": [{"fragment_id": "frag-1"}],
            "quantum_result": {"probabilities": {"0": 0.5, "1": 0.5}},
        },
    )


def built_bundle() -> ProvenanceBundle:
    return build_result_bundle(evidence(), created_at=datetime(2026, 10, 21, tzinfo=timezone.utc))


@pytest.mark.anyio
async def test_local_checks_pass_without_claiming_external_verification() -> None:
    bundle = built_bundle()
    report = await verify_bundle(bundle, expected_hash=bundle_hash(bundle), run=evidence())
    assert report.status == "partially_verified"
    assert all(check.status == "passed" for check in report.checks if check.kind == "hash")
    assert {check.kind for check in report.checks} == {"hash", "storage", "anchor"}
    assert all(check.status == "not_applicable" for check in report.checks if check.kind != "hash")


@pytest.mark.anyio
async def test_changed_run_result_is_rejected() -> None:
    bundle = built_bundle()
    run = evidence()
    run.result["quantum_result"] = {"probabilities": {"0": 1.0}}
    report = await verify_bundle(bundle, expected_hash=bundle_hash(bundle), run=run)
    assert report.status == "unverified"
    assert any(check.name == "result_hash" and check.status == "failed" for check in report.checks)


@pytest.mark.anyio
async def test_unknown_adapters_are_unavailable_not_verified() -> None:
    bundle = built_bundle()
    tree = MerkleTree([bundle_hash(bundle)])
    bundle = ProvenanceBundle.model_validate(
        {
            **bundle.model_dump(),
            "storage": [{"backend": "ipfs", "cid": "fixture-cid"}],
            "anchors": [
                {
                    "chain": "eip155:11155111",
                    "tx_hash": "fixture-tx",
                    "merkle_root": tree.root,
                    "leaf_index": 0,
                    "leaf_count": 1,
                }
            ],
        }
    )
    report = await verify_bundle(bundle, expected_hash=bundle_hash(bundle), run=evidence())
    by_name = {check.name: check.status for check in report.checks}
    assert by_name["anchor_proof"] == "passed"
    assert by_name["anchor_transaction"] == "unavailable"
    assert by_name["storage_content"] == "unavailable"
    assert report.status == "partially_verified"


@pytest.mark.anyio
@pytest.mark.parametrize("field", ["input", "plan", "fragment", "identity"])
async def test_each_run_commitment_detects_changes(field: str) -> None:
    bundle = built_bundle()
    run = evidence()
    if field == "input":
        run.input_snapshot["circuit"] = "x q[0];"
    elif field == "plan":
        run = replace(run, plan_id="different-plan")
    elif field == "fragment":
        run.result["fragment_results"][0]["fragment_id"] = "changed"
    else:
        run = replace(run, owner_user_id="different-owner")
    report = await verify_bundle(bundle, expected_hash=bundle_hash(bundle), run=run)
    assert report.status == "unverified"
    assert any(check.kind == "hash" and check.status == "failed" for check in report.checks)


@pytest.mark.anyio
async def test_missing_result_source_is_unavailable_not_mismatched() -> None:
    bundle = built_bundle()
    run = replace(evidence(), result=None)
    report = await verify_bundle(bundle, expected_hash=bundle_hash(bundle), run=run)
    by_name = {check.name: check.status for check in report.checks}
    assert by_name["bundle_hash"] == "passed"
    assert by_name["result_hash"] == "unavailable"
    assert by_name["fragment_hashes"] == "unavailable"
    assert report.status == "partially_verified"
    with pytest.raises(ValueError, match="completed result"):
        build_result_bundle(run, created_at=bundle.created_at)


@pytest.mark.anyio
@pytest.mark.parametrize("result", [[], "corrupt", {"fragment_results": "invalid"}])
async def test_malformed_result_source_fails_instead_of_looking_missing(result: object) -> None:
    bundle = built_bundle()
    report = await verify_bundle(
        bundle, expected_hash=bundle_hash(bundle), run=replace(evidence(), result=result)
    )
    assert report.status == "unverified"
    assert any(
        check.name == "serialization" and check.status == "failed" for check in report.checks
    )


class MemoryStorage:
    def __init__(self, bundle: ProvenanceBundle) -> None:
        self.bundle = bundle

    async def retrieve(self, reference: StorageReference) -> ProvenanceBundle:
        return self.bundle


class ConfirmedAnchor:
    async def contains_root(self, anchor: ChainAnchor) -> bool:
        return True


@pytest.mark.anyio
async def test_adapters_check_retrieved_content_and_anchor_independently() -> None:
    original = built_bundle()
    tree = MerkleTree([bundle_hash(original)])
    bundle = ProvenanceBundle.model_validate(
        {
            **original.model_dump(),
            "storage": [{"backend": "memory", "cid": "fixture-cid"}],
            "anchors": [
                {
                    "chain": "test:chain",
                    "tx_hash": "fixture-tx",
                    "merkle_root": tree.root,
                    "leaf_index": 0,
                    "leaf_count": 1,
                }
            ],
        }
    )
    report = await verify_bundle(
        bundle,
        expected_hash=bundle_hash(bundle),
        run=evidence(),
        storage_adapters={"memory": MemoryStorage(original)},
        anchor_adapters={"test:chain": ConfirmedAnchor()},
    )
    assert report.status == "verified"
    changed = original.model_copy(update={"summary": {"result_hash": "0" * 64}})
    report = await verify_bundle(
        bundle,
        expected_hash=bundle_hash(bundle),
        run=evidence(),
        storage_adapters={"memory": MemoryStorage(changed)},
        anchor_adapters={"test:chain": ConfirmedAnchor()},
    )
    assert report.status == "unverified"
    assert any(check.kind == "anchor" and check.status == "passed" for check in report.checks)
    assert any(check.kind == "storage" and check.status == "failed" for check in report.checks)


class UnavailableStorage:
    async def retrieve(self, reference: StorageReference) -> ProvenanceBundle:
        raise OSError("fixture outage")


class TimedOutStorage:
    async def retrieve(self, reference: StorageReference) -> ProvenanceBundle:
        raise asyncio.TimeoutError


class TimedOutAnchor:
    async def contains_root(self, anchor: ChainAnchor) -> bool:
        raise asyncio.TimeoutError


@pytest.mark.anyio
async def test_adapter_timeouts_are_unavailable_on_supported_python_versions() -> None:
    original = built_bundle()
    tree = MerkleTree([bundle_hash(original)])
    bundle = ProvenanceBundle.model_validate(
        {
            **original.model_dump(),
            "storage": [{"backend": "timeout", "cid": "fixture-timeout"}],
            "anchors": [
                {
                    "chain": "test:chain",
                    "tx_hash": "fixture-timeout",
                    "merkle_root": tree.root,
                    "leaf_index": 0,
                    "leaf_count": 1,
                }
            ],
        }
    )
    report = await verify_bundle(
        bundle,
        expected_hash=bundle_hash(bundle),
        run=evidence(),
        storage_adapters={"timeout": TimedOutStorage()},
        anchor_adapters={"test:chain": TimedOutAnchor()},
    )
    checks = {check.name: check.status for check in report.checks}
    assert checks["storage_content"] == "unavailable"
    assert checks["anchor_transaction"] == "unavailable"
    assert checks["anchor_proof"] == "passed"
    assert report.status == "partially_verified"


class SlowStorage:
    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.cancelled = asyncio.Event()
        self.attempts = 0

    async def retrieve(self, reference: StorageReference) -> ProvenanceBundle:
        self.attempts += 1
        self.started.set()
        try:
            await asyncio.sleep(60)
        finally:
            self.cancelled.set()
        raise AssertionError("Slow test retrieval must be cancelled, not trusted")


def bundle_with_slow_storage() -> ProvenanceBundle:
    return ProvenanceBundle.model_validate(
        {
            **built_bundle().model_dump(),
            "storage": [
                {"backend": "slow", "cid": "fixture-first"},
                {"backend": "slow", "cid": "fixture-second"},
            ],
        }
    )


@pytest.mark.anyio
async def test_external_checks_share_one_timeout_budget() -> None:
    bundle = bundle_with_slow_storage()
    slow = SlowStorage()
    # A per-reference ten-second timeout would exceed this outer bound. Keep the
    # real production budget here instead of mocking the event loop or verifier.
    report = await asyncio.wait_for(
        verify_bundle(
            bundle,
            expected_hash=bundle_hash(bundle),
            run=evidence(),
            storage_adapters={"slow": slow},
        ),
        timeout=15,
    )
    checks = [check for check in report.checks if check.kind == "storage"]
    assert len(checks) == 2 and all(check.status == "unavailable" for check in checks)
    assert slow.attempts == 1
    assert slow.cancelled.is_set()
    assert report.status == "partially_verified"


@pytest.mark.anyio
async def test_request_cancellation_cleans_up_external_retrieval() -> None:
    bundle = bundle_with_slow_storage()
    slow = SlowStorage()
    task = asyncio.create_task(
        verify_bundle(
            bundle,
            expected_hash=bundle_hash(bundle),
            run=evidence(),
            storage_adapters={"slow": slow},
        )
    )
    try:
        await asyncio.wait_for(slow.started.wait(), timeout=2)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert slow.cancelled.is_set()
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


class RejectedAnchor:
    async def contains_root(self, anchor: ChainAnchor) -> bool:
        return False


@pytest.mark.anyio
async def test_storage_outage_does_not_hide_a_failed_anchor_check() -> None:
    original = built_bundle()
    tree = MerkleTree([bundle_hash(original)])
    bundle = ProvenanceBundle.model_validate(
        {
            **original.model_dump(),
            "storage": [{"backend": "offline", "cid": "fixture-cid", "url": "javascript:alert(1)"}],
            "anchors": [
                {
                    "chain": "test:chain",
                    "tx_hash": "fixture-tx",
                    "merkle_root": tree.root,
                    "leaf_index": 0,
                    "leaf_count": 1,
                    "url": "https://example.org/tx/fixture",
                }
            ],
        }
    )
    report = await verify_bundle(
        bundle,
        expected_hash=bundle_hash(bundle),
        run=evidence(),
        storage_adapters={"offline": UnavailableStorage()},
        anchor_adapters={"test:chain": RejectedAnchor()},
    )
    assert report.status == "unverified"
    assert any(
        check.kind == "storage" and check.status == "unavailable" and check.url is None
        for check in report.checks
    )
    assert any(
        check.name == "anchor_transaction"
        and check.status == "failed"
        and check.url == "https://example.org/tx/fixture"
        for check in report.checks
    )


@pytest.mark.anyio
async def test_missing_legacy_commitments_are_not_silently_recreated() -> None:
    bundle = ProvenanceBundle.model_validate(
        {
            "bundle_id": "old-bundle",
            "workflow_run_id": "workflow-1",
            "workflow_definition_id": "circuit-execution",
            "owner_user_id": "owner-1",
        }
    )
    report = await verify_bundle(bundle, expected_hash=None, run=evidence())
    assert report.status == "unverified"
    assert not any(check.status == "passed" for check in report.checks)
