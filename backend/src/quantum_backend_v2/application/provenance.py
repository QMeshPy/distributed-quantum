"""MongoDB persistence boundary for circuit-run provenance."""

from __future__ import annotations

from pymongo.errors import DuplicateKeyError

from quantum_backend_v2.persistence.mongodb import ProvenanceBundleDocument, WorkflowRunDocument
from quantum_backend_v2.provenance.hashing import bundle_hash
from quantum_backend_v2.provenance.models import ProvenanceBundle
from quantum_backend_v2.provenance.service import StoredProvenance
from quantum_backend_v2.provenance.verification import RunEvidence, build_result_bundle


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
