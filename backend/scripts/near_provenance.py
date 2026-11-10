"""Prepare, verify or attach an operator-signed NEAR testnet provenance batch.

Run from backend with the project environment. See docs/near-provenance.md.
Publication is signed separately using the official NEAR CLI; this script never
loads a NEAR key, submits a transaction or initializes the application's peer mesh.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from quantum_backend_v2.application.near_provenance import (
    NearManifest,
    attach_manifest,
    prepare_manifest,
)
from quantum_backend_v2.config import load_settings
from quantum_backend_v2.persistence.mongodb import ProvenanceBundleDocument, build_mongo_runtime
from quantum_backend_v2.provenance.merkle import MerkleTree
from quantum_backend_v2.provenance.models import ChainAnchor
from quantum_backend_v2.provenance.near_registry import CHAIN_ID, NearRegistryAdapter


async def run(args: argparse.Namespace) -> None:
    settings = load_settings()
    adapter = NearRegistryAdapter(settings.near_registry)
    manifest = None
    if args.command != "prepare":
        data = args.manifest.read_bytes()
        if len(data) > 8 * 1024 * 1024:
            raise ValueError("Manifest exceeds 8 MiB")
        manifest = NearManifest.model_validate_json(data)
        if (
            manifest.contract_id != settings.near_registry.contract_id
            or manifest.publisher_id != settings.near_registry.publisher_id
        ):
            raise ValueError("Manifest differs from the configured registry/publisher")
    if args.command == "verify":
        tree = MerkleTree([entry.digest for entry in manifest.bundles])
        reference = ChainAnchor(
            chain=CHAIN_ID,
            tx_hash=args.tx_hash,
            merkle_root=tree.root,
            leaf_index=0,
            leaf_count=manifest.leaf_count,
            proof=tree.proof(0).siblings,
        )
        if not await adapter.contains_root(reference):
            raise ValueError("Finalized registry transaction does not match the manifest")
        print(f"PASS {adapter.explorer_url(args.tx_hash)}")
        return
    runtime = build_mongo_runtime(settings.persistence.mongodb)
    if runtime is None:
        raise ValueError("QB2_MONGODB_URI is required for prepare/attach")
    try:
        collection = runtime.database[ProvenanceBundleDocument.Settings.name]
        if args.command == "prepare":
            manifest = await prepare_manifest(collection, args.bundle_id, settings.near_registry)
            args.output.write_text(manifest.model_dump_json(indent=2) + "\n", encoding="utf-8")
            print(json.dumps(manifest.contract_arguments(), separators=(",", ":")))
        else:
            await attach_manifest(collection, manifest, args.tx_hash, adapter)
            print(f"Attached {manifest.leaf_count} verified NEAR anchors")
    finally:
        await runtime.client.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare", help="Build a manifest from committed Mongo bundles")
    prepare.add_argument("--bundle-id", action="append", required=True)
    prepare.add_argument("--output", type=Path, required=True)
    for command in ("verify", "attach"):
        item = commands.add_parser(command)
        item.add_argument("manifest", type=Path)
        item.add_argument("--tx-hash", required=True)
    args = parser.parse_args()
    try:
        asyncio.run(run(args))
    except Exception as exc:
        # Neither database exceptions nor validation dumps may expose credentials/content.
        print(
            f"NEAR provenance {args.command} failed ({type(exc).__name__}). "
            "Check configuration, evidence and transaction finality; attach can be rerun safely."
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
