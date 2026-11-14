"""Publish completed experiments to the NEAR testnet registry (agent chat and Lab pages).

Flow: ``prepare_publication`` writes one ``near-<job_id>`` bundle per job and a single-use
request; the user optionally signs ``message`` with their Ethereum wallet (MetaMask); then
``complete_publication`` has the backend sign the NEAR ``anchor`` call, verifies it on-chain
and attaches inclusion proofs. Wallet keys never leave the browser and the NEAR key never
leaves the backend.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from eth_account import Account
from eth_account.messages import encode_defunct

from quantum_backend_v2.application.near_provenance import (
    NearManifest,
    attach_manifest,
    common_wallet,
    prepare_manifest,
)
from quantum_backend_v2.config import load_settings
from quantum_backend_v2.config.models import NearRegistrySettings
from quantum_backend_v2.persistence.mongodb import ProvenanceBundleDocument
from quantum_backend_v2.provenance.hashing import bundle_hash, hash_json
from quantum_backend_v2.provenance.models import ProvenanceBundle
from quantum_backend_v2.provenance.near_publisher import NearPublisher
from quantum_backend_v2.provenance.near_registry import (
    CHAIN_ID,
    NearRegistryAdapter,
    anchor_intent,
)

API = "http://localhost:8081"
REQUESTS = "near_publish_requests"
REQUEST_TTL = timedelta(minutes=15)

# (experiment type, owner-scoped result path, Lab page); probed in order to find a job by ID.
EXPERIMENTS = (
    ("quantum-circuit", "/api/v1/jobs/{}", "/runs/{}"),
    ("portfolio-optimization", "/api/v1/finance/{}?result_detail=full", "/finance/{}"),
    ("drug-discovery", "/api/v1/pharma/jobs/{}", "/pharma/jobs/{}"),
    ("options-pricing", "/api/v1/options/{}", "/options/{}"),
    ("risk-analysis", "/api/v1/risk/{}", "/risk/{}"),
)
VIEW_PATHS = {kind: view for kind, _, view in EXPERIMENTS}


def near_settings() -> NearRegistrySettings:
    settings = load_settings().near_registry
    if not settings.configured:
        raise ValueError("NEAR registry is not configured (QB2_NEAR_REGISTRY_CONTRACT/PUBLISHER)")
    return settings


def bundle_ids_for(job_ids: list[str]) -> list[str]:
    if not 1 <= len(job_ids) <= 50 or len(set(job_ids)) != len(job_ids):
        raise ValueError("Provide 1-50 unique job IDs")
    return [f"near-{job_id}" for job_id in job_ids]


async def owned_rows(collection: Any, bundle_ids: list[str], owner_id: str) -> list[dict]:
    rows = await collection.find({"bundle_id": {"$in": bundle_ids}}).to_list(length=len(bundle_ids))
    if any(row["payload"].get("owner_user_id") != owner_id for row in rows):
        raise ValueError("One or more provenance bundles belong to another account")
    return rows


async def experiment_bundle(
    client: httpx.AsyncClient, job_id: str, owner_id: str, owner_wallet: str | None
) -> ProvenanceBundle:
    """Commit an owned, completed job's result and the owner's SIWE wallet into one bundle.

    ``client`` must call the API as the owner, so foreign jobs are simply not found.
    """
    for kind, path, view in EXPERIMENTS:  # noqa: B007 - used after the break
        resp = await client.get(API + path.format(job_id), timeout=10.0)
        if resp.status_code == 200:
            break
    else:
        raise ValueError(f"No job {job_id} found in your account")
    job = resp.json()
    if str(job.get("status", "")).lower() != "completed":
        raise ValueError(
            f"Job {job_id} is {job.get('status')}; only completed experiments can be published"
        )
    result = job.get("result") if job.get("result") is not None else job
    summary: dict[str, Any] = {
        "experiment_type": kind,
        "result_hash": hash_json(result),
        "result_hash_scope": "job result as returned by result_url at publication",
        "result_url": path.format(job_id),
        "view_url": view.format(job_id),
        "owner_wallet": owner_wallet,
    }
    if job.get("provenance_bundle_id"):
        summary["source_bundle_id"] = job["provenance_bundle_id"]
    embedded = result.get("provenance") if isinstance(result, dict) else None
    if isinstance(embedded, dict) and embedded.get("bundle_hash"):
        summary["source_bundle_hash"] = embedded["bundle_hash"]
    return ProvenanceBundle(
        bundle_id=f"near-{job_id}",
        workflow_run_id=job_id,
        workflow_definition_id=kind,
        owner_user_id=owner_id,
        summary=summary,
        is_publishable=True,
        created_at=datetime.now(timezone.utc),
    )


def _near_anchor(row: dict, merkle_root: str | None = None) -> dict | None:
    for anchor in row["payload"].get("anchors", []):
        if anchor.get("chain") == CHAIN_ID and merkle_root in (None, anchor.get("merkle_root")):
            return anchor
    return None


async def prepare_publication(
    db: Any,
    client: httpx.AsyncClient,
    owner_id: str,
    owner_wallet: str | None,
    job_ids: list[str],
) -> dict[str, Any]:
    settings = near_settings()
    collection = db[ProvenanceBundleDocument.Settings.name]
    bundle_ids = bundle_ids_for(job_ids)
    existing = {row["bundle_id"] for row in await owned_rows(collection, bundle_ids, owner_id)}
    for job_id, bundle_id in zip(job_ids, bundle_ids, strict=True):
        if bundle_id in existing:
            continue  # keep the original commitment so retries reuse the same root
        bundle = await experiment_bundle(client, job_id, owner_id, owner_wallet)
        await collection.insert_one(
            {
                "bundle_id": bundle_id,
                "workflow_run_id": job_id,
                "artifact_refs": [],
                "peer_log_refs": [],
                "payload": bundle.model_dump(mode="json"),
                "content_hash": bundle_hash(bundle),
                "created_at": bundle.created_at,
                "anchor_batch_id": None,
            }
        )
    submitter = await common_wallet(collection, bundle_ids)
    manifest = await prepare_manifest(collection, bundle_ids, settings, submitter)
    rows = await owned_rows(collection, bundle_ids, owner_id)
    anchors = [_near_anchor(row, manifest.merkle_root) for row in rows]
    if anchors and all(anchors):
        return {
            "published": True,
            "explorer_url": anchors[0].get("url"),
            "tx_hash": anchors[0].get("tx_hash"),
            "merkle_root": manifest.merkle_root,
            "bundle_ids": bundle_ids,
            "submitter": submitter,
        }
    base = {
        "merkle_root": manifest.merkle_root,
        "leaf_count": manifest.leaf_count,
        "bundle_ids": bundle_ids,
        "submitter": submitter,
        "registry": settings.contract_id,
    }
    if settings.private_key is None:
        args = json.dumps(manifest.contract_arguments(), separators=(",", ":"))
        return base | {
            "status": "awaiting_signature",
            "near_cli_command": (
                f"near contract call-function as-transaction {settings.contract_id} anchor "
                f"json-args '{args}' prepaid-gas '30 Tgas' attached-deposit '0.01 NEAR' "
                f"sign-as {settings.publisher_id} network-config testnet "
                "sign-with-keychain send"
            ),
        }
    message = (
        anchor_intent(settings.contract_id, manifest.merkle_root, manifest.leaf_count, submitter)
        if submitter
        else None
    )
    now = datetime.now(timezone.utc)
    request_id = uuid.uuid4().hex
    await db[REQUESTS].insert_one(
        {
            "_id": request_id,
            "owner_id": owner_id,
            "bundle_ids": bundle_ids,
            "merkle_root": manifest.merkle_root,
            "submitter": submitter,
            "message": message,
            "status": "pending",
            "created_at": now,
            "expires_at": now + REQUEST_TTL,
        }
    )
    return base | {
        "status": "awaiting_user_confirmation",
        "request_id": request_id,
        "message": message,
    }


async def complete_publication(
    db: Any, owner_id: str, request_id: str, signature: str | None
) -> dict[str, Any]:
    """Single-use: claim the request, publish, verify, attach. Failures release the claim."""
    settings = near_settings()
    if settings.private_key is None:
        raise ValueError("Automatic NEAR publishing is not configured on this server")
    requests = db[REQUESTS]
    now = datetime.now(timezone.utc)
    request = await requests.find_one_and_update(
        {"_id": request_id, "owner_id": owner_id, "status": "pending", "expires_at": {"$gt": now}},
        {"$set": {"status": "publishing", "claimed_at": now}},
    )
    if request is None:
        raise ValueError("This publish request is unknown, expired or already used")
    try:
        submitter = request.get("submitter")
        if signature is not None:
            if not submitter or not request.get("message"):
                raise ValueError("This publication has no wallet to sign with")
            try:
                signer = Account.recover_message(
                    encode_defunct(text=request["message"]), signature=signature
                )
            except Exception:
                raise ValueError("The wallet signature is malformed") from None
            if signer.lower() != submitter.lower():
                raise ValueError(f"Sign with {submitter}; the signature came from {signer}")
        collection = db[ProvenanceBundleDocument.Settings.name]
        await owned_rows(collection, request["bundle_ids"], owner_id)
        manifest = await prepare_manifest(collection, request["bundle_ids"], settings, submitter)
        if manifest.merkle_root != request["merkle_root"]:
            raise ValueError("The experiments changed since this request; prepare it again")
        if signature is not None:
            manifest = NearManifest.model_validate(
                manifest.model_dump() | {"submitter_signature": signature}
            )
        tx_hash = await NearPublisher(settings).anchor(manifest.contract_arguments())
        adapter = NearRegistryAdapter(settings)
        await attach_manifest(collection, manifest, tx_hash, adapter)
    except BaseException:
        await requests.update_one({"_id": request_id}, {"$set": {"status": "pending"}})
        raise
    await requests.update_one(
        {"_id": request_id}, {"$set": {"status": "published", "tx_hash": tx_hash}}
    )
    return {
        "published": True,
        "explorer_url": adapter.explorer_url(tx_hash),
        "tx_hash": tx_hash,
        "registry": settings.contract_id,
        "merkle_root": manifest.merkle_root,
        "bundle_ids": request["bundle_ids"],
        "submitter": submitter,
        "wallet_signed": signature is not None,
    }


async def publication_status(db: Any, owner_id: str, job_id: str) -> dict[str, Any]:
    row = await db[ProvenanceBundleDocument.Settings.name].find_one({"bundle_id": f"near-{job_id}"})
    if row is None or row["payload"].get("owner_user_id") != owner_id:
        return {"published": False}
    anchor = _near_anchor(row)
    if anchor is None:
        return {"published": False}
    return {
        "published": True,
        "explorer_url": anchor.get("url"),
        "tx_hash": anchor.get("tx_hash"),
        "merkle_root": anchor.get("merkle_root"),
        "submitter": (row["payload"].get("summary") or {}).get("owner_wallet"),
    }
