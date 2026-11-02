"""MongoDB persistence boundary for circuit-run provenance."""

from __future__ import annotations

import base64
import hashlib
import logging
from typing import Any, Protocol

import httpx
from pymongo.errors import DuplicateKeyError

from quantum_backend_v2.config import KuboSettings
from quantum_backend_v2.content.kubo import KuboClient
from quantum_backend_v2.persistence.mongodb import ProvenanceBundleDocument, WorkflowRunDocument
from quantum_backend_v2.provenance.hashing import bundle_hash, canonical_json
from quantum_backend_v2.provenance.models import ProvenanceBundle, StorageReference
from quantum_backend_v2.provenance.service import StoredProvenance
from quantum_backend_v2.provenance.verification import RunEvidence, build_result_bundle

logger = logging.getLogger(__name__)

KUBO_BACKEND = "kubo"
# One chunk is the largest payload Kubo stores as a single raw block, which is the
# only shape the verified gateway client can fetch back and check against its CID.
_MAX_PUBLISHED_BYTES = 256 * 1024


def run_evidence(run: WorkflowRunDocument) -> RunEvidence:
    """Load the raw stored result; absence must not make an owned bundle a 404."""
    result = run.output_snapshot.get("result")
    return RunEvidence(
        run_id=run.id,
        workflow_definition_id=run.workflow_definition_id,
        owner_user_id=run.owner_user_id,
        input_snapshot=run.input_snapshot,
        plan_id=run.artifact_bundle_id,
        result=result,
    )


def _reuse_commitment(run: WorkflowRunDocument, existing: ProvenanceBundleDocument) -> str:
    committed = ProvenanceBundle.model_validate(existing.payload)
    # BSON dates lose sub-millisecond precision and timezone representation. The
    # original JSON timestamp, not a reloaded run date, defines an existing hash.
    rebuilt = build_result_bundle(run_evidence(run), created_at=committed.created_at)
    digest = bundle_hash(rebuilt)
    # Check the stored payload too; a matching hash column alone is not enough.
    if (
        existing.workflow_run_id != run.id
        or existing.content_hash != digest
        or bundle_hash(committed) != digest
    ):
        raise ValueError("A different provenance commitment already exists for this run")
    return rebuilt.bundle_id


async def record_run_provenance(run: WorkflowRunDocument) -> str:
    """Persist the commitment before marking a circuit run successfully completed."""
    if run.completed_at is None:
        raise ValueError("Run completion timestamp is required for a stable snapshot")
    bundle_id = f"provenance-{run.id}"
    existing = await ProvenanceBundleDocument.find_one({"bundle_id": bundle_id})
    if existing is not None:
        return _reuse_commitment(run, existing)
    bundle = build_result_bundle(run_evidence(run), created_at=run.completed_at)
    try:
        await ProvenanceBundleDocument(
            bundle_id=bundle.bundle_id,
            workflow_run_id=run.id,
            payload=bundle.model_dump(mode="json"),
            content_hash=bundle_hash(bundle),
            created_at=run.completed_at,
        ).insert()
    except DuplicateKeyError:
        # The unique index arbitrates concurrent writers. Re-read the winner and
        # compare evidence, never overwrite it or erase subsequently added anchors.
        existing = await ProvenanceBundleDocument.find_one({"bundle_id": bundle_id})
        if existing is None:
            raise
        return _reuse_commitment(run, existing)
    return bundle.bundle_id


class MongoProvenanceRepository:
    """Read legacy documents without inventing missing historical commitments."""

    async def get_bundle(self, bundle_id: str) -> StoredProvenance | None:
        document = await ProvenanceBundleDocument.find_one({"bundle_id": bundle_id})
        if document is None:
            return None
        return StoredProvenance(
            bundle_id=document.bundle_id,
            workflow_run_id=document.workflow_run_id,
            payload=document.payload,
            content_hash=document.content_hash,
        )

    async def get_run(self, run_id: str) -> RunEvidence | None:
        run = await WorkflowRunDocument.get(run_id)
        if run is None:
            return None
        return run_evidence(run)


class BundlePublisher(Protocol):
    """Content-addressed home for a recorded bundle; failures must be non-fatal."""

    async def publish(self, payload: dict[str, Any]) -> StorageReference: ...


def _raw_cid(data: bytes) -> str:
    """CIDv1 raw/sha2-256 of the bytes, which Kubo assigns to a single-chunk file."""
    multihash = b"\x01\x55\x12\x20" + hashlib.sha256(data).digest()
    return "b" + base64.b32encode(multihash).decode("ascii").lower().rstrip("=")


class KuboBundlePublisher:
    """Add the canonical bundle JSON to the platform node and pin it.

    The CID covers these JSON bytes, not the commitment, so a reader parses the
    bundle and compares ``bundle_hash``. Storage locations are left out of the
    uploaded bytes so they do not change with later attachments.
    """

    def __init__(
        self,
        settings: KuboSettings,
        *,
        public_gateway_url: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._settings = settings
        self._public_gateway_url = public_gateway_url
        self._transport = transport

    async def publish(self, payload: dict[str, Any]) -> StorageReference:
        data = canonical_json({**payload, "storage": [], "anchors": []})
        if len(data) > _MAX_PUBLISHED_BYTES:
            raise ValueError("Bundle exceeds the single-block publication limit")
        async with KuboClient(self._settings, transport=self._transport) as client:
            added = await client.add(data)
        # A reference the gateway cannot verify is worse than none.
        if added.cid != _raw_cid(data):
            raise ValueError("Kubo returned a CID that does not match the uploaded bytes")
        url = (
            f"{self._public_gateway_url}/ipfs/{added.cid}?filename=bundle.json"
            if self._public_gateway_url
            else None
        )
        return StorageReference(backend=KUBO_BACKEND, cid=added.cid, url=url)


async def publish_run_provenance(bundle_id: str, publisher: BundlePublisher) -> dict[str, str]:
    """Attach a Kubo reference to a recorded bundle; never raises.

    Returns the publication state to flag on the run. Locations are excluded from
    ``bundle_hash``, so attaching one leaves the commitment unchanged.
    """
    try:
        document = await ProvenanceBundleDocument.find_one({"bundle_id": bundle_id})
        if document is None:
            raise LookupError("bundle not found")
        stored = ProvenanceBundle.model_validate(document.payload)
        reference = next((ref for ref in stored.storage if ref.backend == KUBO_BACKEND), None)
        if reference is None:
            reference = await publisher.publish(document.payload)
            # Push atomically: a full save after the upload could overwrite anchors or an
            # anchor batch claim written meanwhile (#21).
            await ProvenanceBundleDocument.get_pymongo_collection().update_one(
                {"bundle_id": bundle_id, "payload.storage.backend": {"$ne": KUBO_BACKEND}},
                {"$push": {"payload.storage": reference.model_dump(mode="json")}},
            )
        return {"status": "published", "cid": reference.cid}
    except Exception as exc:
        # Log the class only: transport errors must not carry credentials or URLs.
        logger.warning("provenance bundle %s not published: %s", bundle_id, type(exc).__name__)
        return {"status": "unpublished"}
