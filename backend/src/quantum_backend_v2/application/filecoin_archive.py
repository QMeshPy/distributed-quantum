"""Explicit public research exports with durable, non-replaying write journals."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

from pymongo.errors import DuplicateKeyError

from quantum_backend_v2.artifacts.filecoin import (
    FilecoinBridgeError,
    FilecoinReceipt,
    FilecoinStore,
    Package,
)
from quantum_backend_v2.provenance.hashing import bundle_hash, canonical_json, hash_json
from quantum_backend_v2.provenance.models import ProvenanceBundle, StorageReference


class FilecoinOperations:
    """A lost write result freezes the signer until an operator reconciles it."""

    def __init__(self, collection: Any, locks: Any) -> None:
        self.collection, self.locks = collection, locks

    async def recover_confirmed_lock(self, agent_id: str, owner_id: str) -> None:
        lock = await self.locks.find_one({"_id": agent_id})
        if lock is None:
            return
        operation = await self.collection.find_one({"_id": lock["operation_key"]})
        if (
            operation
            and operation.get("state") == "confirmed"
            and operation.get("owner_id") == owner_id
            and operation.get("agent_id") == agent_id
        ):
            await self.locks.delete_one({"_id": agent_id, "operation_key": lock["operation_key"]})

    async def execute(
        self,
        *,
        owner_id: str,
        agent_id: str,
        operation_id: str,
        payload: dict[str, Any],
        action: Callable[[], Awaitable[dict]],
        scope: str | None = None,
    ) -> dict:
        key = hash_json([owner_id, agent_id, operation_id])
        digest = hash_json(payload)
        await self.recover_confirmed_lock(agent_id, owner_id)
        existing = await self.collection.find_one({"_id": key})
        if existing:
            if existing["request_hash"] != digest:
                raise ValueError("Operation ID already binds different content")
            if existing["state"] == "confirmed":
                return existing["result"]
            if existing["state"] != "rejected":
                raise ValueError("Operation needs reconciliation; it will not be retried")
        try:
            await self.locks.insert_one({"_id": agent_id, "operation_key": key})
        except DuplicateKeyError:
            raise ValueError(
                "Agent has an active or uncertain operation requiring reconciliation"
            ) from None
        try:
            intent = {
                "_id": key,
                "owner_id": owner_id,
                "agent_id": agent_id,
                "operation_id": operation_id,
                "request_hash": digest,
                "state": "started",
                "created_at": datetime.now(timezone.utc),
                "scope": scope,
            }
            if existing is not None:
                result = await self.collection.update_one(
                    {"_id": key, "state": "rejected"},
                    {"$set": {k: v for k, v in intent.items() if k != "_id"}},
                )
                if not result.matched_count:
                    raise ValueError("Operation state changed; inspect it before retrying")
            else:
                await self.collection.insert_one(intent)
        except Exception:
            await self.locks.delete_one({"_id": agent_id, "operation_key": key})
            raise
        try:
            result = await action()
            await self.collection.update_one(
                {"_id": key},
                {
                    "$set": {
                        "state": "confirmed",
                        "result": result,
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )
        except BaseException as exc:
            # Keep both the write intent and signer lock even on cancellation/process shutdown.
            # A new process cannot distinguish a preflight failure from a lost confirmed receipt.
            safe_rejection = isinstance(exc, FilecoinBridgeError) and not exc.uncertain
            await self.collection.update_one(
                {"_id": key},
                {
                    "$set": {
                        "state": "rejected" if safe_rejection else "uncertain",
                        "error_code": exc.code
                        if isinstance(exc, FilecoinBridgeError)
                        else type(exc).__name__,
                        "transaction_hashes": getattr(exc, "transaction_hashes", []),
                        "submitted_receipt": getattr(exc, "submitted_receipt", None),
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )
            if safe_rejection:
                await self.locks.delete_one({"_id": agent_id, "operation_key": key})
            raise
        await self.locks.delete_one({"_id": agent_id, "operation_key": key})
        return result


class JournaledFilecoinStore:
    """Persist every task checkpoint's write intent, so resume never blindly repays."""

    def __init__(
        self,
        store: FilecoinStore,
        operations: FilecoinOperations,
        *,
        owner_id: str,
        agent_id: str,
        operation_prefix: str,
        before_upload: Callable[[],Awaitable[None]] | None = None,
    ) -> None:
        self.store, self.operations = store, operations
        self.owner_id, self.agent_id, self.operation_prefix = owner_id, agent_id, operation_prefix
        self.before_upload = before_upload

    async def upload(self, data: bytes) -> FilecoinReceipt:
        import hashlib

        if self.before_upload is not None:
            await self.before_upload()

        digest = hashlib.sha256(data).hexdigest()

        async def action() -> dict:
            if self.before_upload is not None:
                await self.before_upload()
            return (await self.store.upload(data)).model_dump(mode="json")

        result = await self.operations.execute(
            owner_id=self.owner_id,
            agent_id=self.agent_id,
            operation_id=f"{self.operation_prefix}:{digest}",
            payload={"sha256": digest},
            scope=self.operation_prefix,
            action=action,
        )
        return FilecoinReceipt.model_validate(result)

    async def download(self, receipt: FilecoinReceipt) -> bytes:
        return await self.store.download(receipt)


class FilecoinBundleStorage:
    def __init__(self, store: FilecoinStore) -> None:
        self.store = store

    async def retrieve(self, reference: StorageReference) -> ProvenanceBundle:
        if reference.filecoin is None:
            raise ValueError("Missing Filecoin receipt")
        package = Package.model_validate_json(await self.store.download(reference.filecoin))
        if package.kind != "experiment" or "provenance.json" not in package.files:
            raise ValueError("Filecoin package is not a provenance export")
        bundle = ProvenanceBundle.model_validate_json(package.files["provenance.json"].data())
        if package.identity != bundle.workflow_run_id:
            raise ValueError("Package identity does not match its provenance")
        return bundle


async def verify_export(data: bytes, *, anchor_adapters: dict | None = None) -> Any:
    """Verify downloaded evidence without a local run database or original files."""
    import json

    from quantum_backend_v2.provenance.verification import RunEvidence, verify_bundle

    package = Package.model_validate_json(data)
    if package.kind != "experiment":
        raise ValueError("Expected an experiment package")
    required = {"provenance.json", "inputs.json", "result.json", "plan.json", "manifest.json"}
    if not required <= package.files.keys():
        raise ValueError("Experiment package is missing reproducibility files")
    bundle = ProvenanceBundle.model_validate_json(package.files["provenance.json"].data())
    manifest = json.loads(package.files["manifest.json"].data())
    plan = json.loads(package.files["plan.json"].data())
    if (
        package.identity != bundle.workflow_run_id
        or manifest.get("workflow_run_id") != package.identity
        or manifest.get("plan_id") != bundle.plan_id
        or not isinstance(plan, dict)
    ):
        raise ValueError("Experiment package identity or plan does not match provenance")
    return await verify_bundle(
        bundle.model_copy(update={"storage": ()}),
        expected_hash=manifest.get("bundle_hash"),
        run=RunEvidence(
            run_id=bundle.workflow_run_id,
            workflow_definition_id=bundle.workflow_definition_id,
            owner_user_id=bundle.owner_user_id,
            plan_id=manifest["plan_id"],
            input_snapshot=json.loads(package.files["inputs.json"].data()),
            result=json.loads(package.files["result.json"].data()),
        ),
        anchor_adapters=anchor_adapters,
    )


async def prepare_run_export(run_id: str, *, owner_id: str) -> tuple[ProvenanceBundle, bytes]:
    from quantum_backend_v2.application.provenance import run_evidence
    from quantum_backend_v2.persistence.mongodb import (
        ExecutionPlanDocument,
        ProvenanceBundleDocument,
        WorkflowRunDocument,
    )
    from quantum_backend_v2.provenance.verification import verify_bundle

    run = await WorkflowRunDocument.get(run_id)
    if run is None or run.owner_user_id != owner_id:
        raise LookupError("Run not found")
    if run.status != "COMPLETED":
        raise ValueError("Only completed runs can be archived")
    record = await ProvenanceBundleDocument.find_one({"workflow_run_id": run_id})
    if record is None:
        raise ValueError("Run has no recorded provenance")
    bundle = ProvenanceBundle.model_validate(record.payload)
    report = await verify_bundle(bundle, expected_hash=record.content_hash, run=run_evidence(run))
    if any(check.status != "passed" for check in report.checks if check.kind == "hash"):
        raise ValueError("Run data no longer matches its provenance")
    plan = (
        await ExecutionPlanDocument.get(run.artifact_bundle_id) if run.artifact_bundle_id else None
    )
    if plan is None:
        raise ValueError("Recorded execution plan is unavailable")
    files = {
        "provenance.json": canonical_json(
            bundle.model_copy(update={"storage": ()}).model_dump(mode="json")
        ),
        "inputs.json": canonical_json(run.input_snapshot),
        "result.json": canonical_json(run.output_snapshot["result"]),
        "plan.json": canonical_json(plan.payload),
        "manifest.json": canonical_json(
            {
                "bundle_hash": bundle_hash(bundle),
                "workflow_run_id": run.id,
                "plan_id": run.artifact_bundle_id,
            }
        ),
    }
    package = Package.create(kind="experiment", identity=run.id, files=files)
    return bundle, package.to_bytes()


async def export_run(
    run_id: str,
    *,
    owner_id: str,
    store: FilecoinStore,
    prepared: tuple[ProvenanceBundle, bytes] | None = None,
) -> FilecoinReceipt:
    from quantum_backend_v2.persistence.mongodb import ProvenanceBundleDocument

    bundle, data = prepared or await prepare_run_export(run_id, owner_id=owner_id)
    receipt = await store.upload(data)
    reference = StorageReference(backend="filecoin", cid=receipt.piece_cid, filecoin=receipt)
    try:
        await ProvenanceBundleDocument.get_pymongo_collection().update_one(
            {"bundle_id": bundle.bundle_id},
            {"$addToSet": {"payload.storage": reference.model_dump(mode="json")}},
        )
    except Exception as exc:
        error = FilecoinBridgeError(
            {
                "code": "receipt_attachment_failed",
                "uncertain": True,
                "transaction_hashes": list(receipt.transaction_hashes),
            }
        )
        error.submitted_receipt = receipt.model_dump(mode="json")
        raise error from exc
    return receipt
