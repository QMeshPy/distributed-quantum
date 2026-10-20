"""Build run evidence and report independent integrity/storage/anchor checks."""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal, Protocol
from urllib.parse import urlsplit

from httpx import HTTPError
from pydantic import BaseModel, ConfigDict

from quantum_backend_v2.provenance.hashing import bundle_hash, hash_json
from quantum_backend_v2.provenance.merkle import MerkleProof, verify_proof
from quantum_backend_v2.provenance.models import ChainAnchor, ProvenanceBundle, StorageReference

CheckStatus = Literal["passed", "failed", "unavailable", "not_applicable"]
VerificationStatus = Literal["verified", "partially_verified", "unverified"]


@dataclass(frozen=True)
class RunEvidence:
    """Authorized run snapshot, loaded separately from the bundle being checked."""

    run_id: str
    workflow_definition_id: str
    owner_user_id: str
    input_snapshot: dict[str, Any]
    plan_id: str | None
    result: object  # None means absent; malformed stored JSON must fail, not look missing.


class VerificationCheck(BaseModel):
    """One check; unavailable is not success, and failed is not an outage."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["hash", "storage", "anchor"]
    name: str
    status: CheckStatus
    message: str
    reference: str | None = None
    url: str | None = None


class VerificationReport(BaseModel):
    """Integrity of recorded simulation evidence, never proof of quantum execution."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    bundle_id: str
    status: VerificationStatus
    checks: tuple[VerificationCheck, ...]
    checked_at: datetime


class StorageAdapter(Protocol):
    """Retrieve a bundle using configured, trusted gateways, not arbitrary URLs."""

    async def retrieve(self, reference: StorageReference) -> ProvenanceBundle: ...


class AnchorAdapter(Protocol):
    """Check successful, confirmed publication of this root on the stated chain.

    Implementations must check the configured anchor destination and root payload,
    not just transaction existence. Chain-specific code belongs behind #2 adapters.
    """

    async def contains_root(self, anchor: ChainAnchor) -> bool: ...


def build_result_bundle(run: RunEvidence, *, created_at: datetime) -> ProvenanceBundle:
    """Snapshot a completed circuit result without duplicating its statevector."""
    return ProvenanceBundle(
        bundle_id=f"provenance-{run.run_id}",
        workflow_run_id=run.run_id,
        workflow_definition_id=run.workflow_definition_id,
        owner_user_id=run.owner_user_id,
        input_hash=hash_json(run.input_snapshot),
        plan_id=run.plan_id,
        fragment_result_hashes=tuple(hash_json(value) for value in _fragments(run)),
        summary={"result_hash": hash_json(run.result)},
        created_at=created_at,
    )


def _fragments(run: RunEvidence) -> list[dict[str, Any]]:
    if not isinstance(run.result, dict):
        raise ValueError("Run has no completed result object to commit")
    fragments = run.result.get("fragment_results")
    if not isinstance(fragments, list) or any(not isinstance(item, dict) for item in fragments):
        raise ValueError("Result must contain a list of fragment result objects")
    return fragments


def _public_url(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        parsed = urlsplit(value)
        if (
            parsed.scheme in {"https", "http"}
            and parsed.hostname
            and parsed.username is None
            and parsed.password is None
        ):
            return value
    except ValueError:
        pass
    return None


def make_report(bundle_id: str, checks: list[VerificationCheck]) -> VerificationReport:
    """Fail closed; full verification additionally requires an external witness."""
    for kind in ("storage", "anchor"):
        if not any(check.kind == kind for check in checks):
            checks.append(
                VerificationCheck(
                    kind=kind,
                    name=f"{kind}_validation",
                    status="unavailable",
                    message="Check could not be performed on invalid bundle evidence",
                )
            )
    applicable = [check for check in checks if check.status != "not_applicable"]
    passed = any(check.status == "passed" for check in applicable)
    external = any(
        check.name in {"storage_content", "anchor_transaction"} and check.status == "passed"
        for check in applicable
    )
    status: VerificationStatus = "unverified"
    if passed and not any(check.status == "failed" for check in applicable):
        status = "partially_verified"
        if external and all(check.status == "passed" for check in applicable):
            status = "verified"
    return VerificationReport(
        bundle_id=bundle_id,
        status=status,
        checks=tuple(checks),
        checked_at=datetime.now(timezone.utc),
    )


async def verify_bundle(
    bundle: ProvenanceBundle,
    *,
    expected_hash: str | None,
    run: RunEvidence,
    storage_adapters: Mapping[str, StorageAdapter] | None = None,
    anchor_adapters: Mapping[str, AnchorAdapter] | None = None,
) -> VerificationReport:
    """Recompute commitments and verify available attachments without trusting metadata."""
    checks: list[VerificationCheck] = []
    # Bound total I/O, not ten seconds per reference. Catch asyncio.TimeoutError
    # below for Python 3.10, where it is distinct from the built-in TimeoutError.
    deadline = asyncio.get_running_loop().time() + 10.0

    def remaining_timeout() -> float:
        return max(0.0, deadline - asyncio.get_running_loop().time())

    def compare(name: str, expected: object, actual: object) -> None:
        status: CheckStatus = (
            "unavailable" if expected is None else ("passed" if expected == actual else "failed")
        )
        checks.append(
            VerificationCheck(
                kind="hash",
                name=name,
                status=status,
                message="Commitment matches"
                if status == "passed"
                else ("Commitment missing" if status == "unavailable" else "Commitment mismatch"),
            )
        )

    try:
        digest = bundle_hash(bundle)
        compare("bundle_hash", expected_hash, digest)
        compare("input_hash", bundle.input_hash, hash_json(run.input_snapshot))
        compare("plan_id", bundle.plan_id, run.plan_id)
        if run.result is None:
            for name in ("result_hash", "fragment_hashes"):
                checks.append(
                    VerificationCheck(
                        kind="hash",
                        name=name,
                        status="unavailable",
                        message="Run result source unavailable",
                    )
                )
        else:
            compare("result_hash", bundle.summary.get("result_hash"), hash_json(run.result))
            # An empty legacy default is not evidence of a deliberately hashed list.
            compare(
                "fragment_hashes",
                bundle.fragment_result_hashes if bundle.input_hash else None,
                tuple(hash_json(fragment) for fragment in _fragments(run)),
            )
    except (TypeError, ValueError, OverflowError):
        digest = None
        checks.append(
            VerificationCheck(
                kind="hash",
                name="serialization",
                status="failed",
                message="Evidence cannot be canonically serialized",
            )
        )

    if (bundle.workflow_run_id, bundle.workflow_definition_id, bundle.owner_user_id) != (
        run.run_id,
        run.workflow_definition_id,
        run.owner_user_id,
    ):
        checks.append(
            VerificationCheck(
                kind="hash",
                name="run_identity",
                status="failed",
                message="Bundle does not belong to this run",
            )
        )

    for storage in bundle.storage:
        status: CheckStatus = "unavailable"
        adapter = (storage_adapters or {}).get(storage.backend)
        if adapter is not None and digest is not None:
            try:
                retrieved = await asyncio.wait_for(
                    adapter.retrieve(storage), timeout=remaining_timeout()
                )
                status = "passed" if bundle_hash(retrieved) == digest else "failed"
            except (OSError, asyncio.TimeoutError, HTTPError):
                status = "unavailable"
            except (TypeError, ValueError, OverflowError):
                status = "failed"
        checks.append(
            VerificationCheck(
                kind="storage",
                name="storage_content",
                status=status,
                message={
                    "passed": "Retrieved bundle matches",
                    "failed": "Stored evidence mismatch",
                    "unavailable": "Storage adapter missing or retrieval unavailable",
                }[status],
                reference=storage.cid,
                url=_public_url(storage.url),
            )
        )
    if not bundle.storage:
        checks.append(
            VerificationCheck(
                kind="storage",
                name="storage_content",
                status="not_applicable",
                message="No storage references recorded",
            )
        )

    for anchor in bundle.anchors:
        proof_ok = digest is not None and verify_proof(
            digest,
            MerkleProof(anchor.leaf_index, anchor.leaf_count, anchor.proof),
            anchor.merkle_root,
        )
        checks.append(
            VerificationCheck(
                kind="anchor",
                name="anchor_proof",
                status="passed" if proof_ok else "failed",
                message="Merkle inclusion matches" if proof_ok else "Merkle inclusion mismatch",
                reference=f"{anchor.chain}:{anchor.tx_hash}",
            )
        )
        status = "unavailable"
        chain_adapter = (anchor_adapters or {}).get(anchor.chain)
        if chain_adapter is not None:
            try:
                matched = await asyncio.wait_for(
                    chain_adapter.contains_root(anchor), timeout=remaining_timeout()
                )
                status = "passed" if matched else "failed"
            except (OSError, asyncio.TimeoutError, HTTPError):
                status = "unavailable"
            except (TypeError, ValueError):
                status = "failed"
        checks.append(
            VerificationCheck(
                kind="anchor",
                name="anchor_transaction",
                status=status,
                message={
                    "passed": "Confirmed anchor root matches",
                    "failed": "Anchor root not confirmed",
                    "unavailable": "Chain adapter missing or anchor lookup unavailable",
                }[status],
                reference=f"{anchor.chain}:{anchor.tx_hash}",
                url=_public_url(anchor.url),
            )
        )
    if not bundle.anchors:
        checks.append(
            VerificationCheck(
                kind="anchor",
                name="anchor_transaction",
                status="not_applicable",
                message="No chain anchors recorded",
            )
        )
    return make_report(bundle.bundle_id, checks)
