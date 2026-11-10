"""Operator-prepared NEAR batches; attach only independently verified receipts."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from quantum_backend_v2.config.models import NearRegistrySettings, NearTestnetAccount
from quantum_backend_v2.provenance.hashing import bundle_hash
from quantum_backend_v2.provenance.merkle import MerkleTree
from quantum_backend_v2.provenance.models import ChainAnchor, ProvenanceBundle, Sha256Digest
from quantum_backend_v2.provenance.near_registry import CHAIN_ID, HASH_PROFILE, NearRegistryAdapter


class BundleCommitment(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    bundle_id: str = Field(min_length=3, max_length=256)
    digest: Sha256Digest


class NearManifest(BaseModel):
    """Public commitments only; never contains prompts, results or signing material."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    chain: Literal["near:testnet"] = CHAIN_ID
    contract_id: NearTestnetAccount
    publisher_id: NearTestnetAccount
    hash_profile: Literal["qmesh-provenance-sha256-v1"] = HASH_PROFILE
    bundles: Annotated[tuple[BundleCommitment, ...], Field(min_length=1, max_length=20_000)]
    merkle_root: Sha256Digest
    leaf_count: int = Field(ge=1, le=20_000, strict=True)

    @model_validator(mode="after")
    def validate_commitments(self) -> NearManifest:
        ids = [item.bundle_id for item in self.bundles]
        if (
            len(set(ids)) != len(ids)
            or self.leaf_count != len(ids)
            or MerkleTree([item.digest for item in self.bundles]).root != self.merkle_root
        ):
            raise ValueError("Manifest root/count must match its unique ordered commitments")
        return self

    def contract_arguments(self) -> dict[str, Any]:
        return self.model_dump(include={"merkle_root", "leaf_count", "hash_profile"})


async def _load(collection: Any, ids: list[str]) -> dict[str, dict[str, Any]]:
    if not 1 <= len(ids) <= 20_000 or len(set(ids)) != len(ids):
        raise ValueError("Select 1–20000 unique bundle IDs")
    rows = await collection.find({"bundle_id": {"$in": ids}}).to_list(length=20_000)
    found = {row["bundle_id"]: row for row in rows}
    if len(found) != len(ids):
        raise ValueError("One or more provenance bundles were not found")
    for row in rows:
        bundle = ProvenanceBundle.model_validate(row["payload"])
        if (
            bundle.bundle_id != row["bundle_id"]
            or bundle.workflow_run_id != row["workflow_run_id"]
            or bundle_hash(bundle) != row.get("content_hash")
        ):
            raise ValueError("Stored provenance commitment does not match its bundle")
    return found


async def prepare_manifest(
    collection: Any,
    bundle_ids: list[str],
    settings: NearRegistrySettings,
) -> NearManifest:
    if not settings.configured:
        raise ValueError("NEAR registry is not configured")
    rows = await _load(collection, bundle_ids)
    entries = tuple(
        BundleCommitment(bundle_id=key, digest=rows[key]["content_hash"]) for key in bundle_ids
    )
    return NearManifest(
        contract_id=settings.contract_id,
        publisher_id=settings.publisher_id,
        bundles=entries,
        merkle_root=MerkleTree([e.digest for e in entries]).root,
        leaf_count=len(entries),
    )


async def attach_manifest(
    collection: Any,
    manifest: NearManifest,
    tx_hash: str,
    adapter: NearRegistryAdapter,
) -> None:
    # Revalidate even model_construct/model_copy inputs at this write boundary.
    manifest = NearManifest.model_validate(manifest.model_dump())
    if (
        manifest.contract_id != adapter.settings.contract_id
        or manifest.publisher_id != adapter.settings.publisher_id
    ):
        raise ValueError("Manifest does not name the configured registry and publisher")
    rows = await _load(collection, [entry.bundle_id for entry in manifest.bundles])
    if any(rows[e.bundle_id]["content_hash"] != e.digest for e in manifest.bundles):
        raise ValueError("Manifest differs from the current provenance commitments")
    tree = MerkleTree([entry.digest for entry in manifest.bundles])
    first = ChainAnchor(
        chain=CHAIN_ID,
        tx_hash=tx_hash,
        merkle_root=tree.root,
        leaf_index=0,
        leaf_count=manifest.leaf_count,
        proof=tree.proof(0).siblings,
    )
    if not await adapter.contains_root(first):
        raise ValueError("NEAR registry transaction does not match this manifest")
    for index, entry in enumerate(manifest.bundles):
        row = rows[entry.bundle_id]
        reference = first.model_copy(
            update={
                "leaf_index": index,
                "proof": tree.proof(index).siblings,
                "url": adapter.explorer_url(tx_hash),
            }
        ).model_dump(mode="json")
        existing = row["payload"].get("anchors", [])
        if reference in existing:
            continue
        if any(a.get("chain") == CHAIN_ID and a.get("tx_hash") == tx_hash for a in existing):
            raise ValueError("A conflicting NEAR anchor is already attached")
        updated = await collection.update_one(
            {
                "bundle_id": entry.bundle_id,
                "content_hash": entry.digest,
                "payload": row["payload"],
            },
            {"$addToSet": {"payload.anchors": reference}},
        )
        if updated.matched_count != 1:
            raise ValueError("Bundle changed concurrently; rerun attach to resume safely")
