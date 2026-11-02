"""The verifier must read published bundles back, not just trust the reference."""

from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest

from quantum_backend_v2.application.provenance import (
    KUBO_BACKEND,
    GatewayBundleStorage,
    _raw_cid,
)
from quantum_backend_v2.config import GatewaySettings
from quantum_backend_v2.provenance.hashing import bundle_hash, canonical_json
from quantum_backend_v2.provenance.models import ProvenanceBundle, StorageReference
from quantum_backend_v2.provenance.verification import (
    RunEvidence,
    build_result_bundle,
    verify_bundle,
)

pytestmark = pytest.mark.anyio


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


def published(bundle: ProvenanceBundle) -> bytes:
    return canonical_json({**bundle.model_dump(mode="json"), "storage": [], "anchors": []})


def gateway(handler) -> GatewayBundleStorage:
    return GatewayBundleStorage(
        GatewaySettings(url="http://gateway.test"), transport=httpx.MockTransport(handler)
    )


def serve(body: bytes):
    return lambda _: httpx.Response(
        200, stream=httpx.ByteStream(body), headers={"Content-Type": "application/vnd.ipld.raw"}
    )


def with_kubo_reference(bundle: ProvenanceBundle, cid: str) -> ProvenanceBundle:
    return bundle.model_copy(update={"storage": (StorageReference(backend=KUBO_BACKEND, cid=cid),)})


async def check(bundle: ProvenanceBundle, storage: GatewayBundleStorage):
    report = await verify_bundle(
        bundle,
        expected_hash=bundle_hash(bundle),
        run=evidence(),
        storage_adapters={KUBO_BACKEND: storage},
    )
    return report, next(item for item in report.checks if item.name == "storage_content")


async def test_published_bundle_passes_and_can_reach_verified() -> None:
    bundle = build_result_bundle(evidence(), created_at=datetime(2026, 11, 1, tzinfo=timezone.utc))
    body = published(bundle)
    report, storage = await check(with_kubo_reference(bundle, _raw_cid(body)), gateway(serve(body)))
    assert storage.status == "passed"
    assert report.status == "verified"


async def test_stored_bundle_with_a_different_commitment_fails() -> None:
    bundle = build_result_bundle(evidence(), created_at=datetime(2026, 11, 1, tzinfo=timezone.utc))
    other = bundle.model_copy(update={"plan_id": "plan-2"})
    body = published(other)
    report, storage = await check(with_kubo_reference(bundle, _raw_cid(body)), gateway(serve(body)))
    assert storage.status == "failed"
    assert report.status == "unverified"


async def test_bytes_that_do_not_match_the_cid_fail() -> None:
    bundle = build_result_bundle(evidence(), created_at=datetime(2026, 11, 1, tzinfo=timezone.utc))
    body = published(bundle)
    report, storage = await check(
        with_kubo_reference(bundle, _raw_cid(body)), gateway(serve(body + b" "))
    )
    assert storage.status == "failed"
    assert report.status == "unverified"


async def test_unreachable_gateway_stays_unavailable_and_never_verified() -> None:
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("gateway down", request=request)

    bundle = build_result_bundle(evidence(), created_at=datetime(2026, 11, 1, tzinfo=timezone.utc))
    report, storage = await check(with_kubo_reference(bundle, _raw_cid(b"{}")), gateway(down))
    assert storage.status == "unavailable"
    assert report.status == "partially_verified"


async def test_not_json_stored_content_fails() -> None:
    bundle = build_result_bundle(evidence(), created_at=datetime(2026, 11, 1, tzinfo=timezone.utc))
    report, storage = await check(
        with_kubo_reference(bundle, _raw_cid(b"not json")), gateway(serve(b"not json"))
    )
    assert storage.status == "failed"
    assert report.status == "unverified"
