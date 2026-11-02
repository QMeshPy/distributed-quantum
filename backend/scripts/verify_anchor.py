"""Independently verify a provenance bundle's chain anchors (#21). No key is needed.

Usage, from backend/:
    uv run --frozen python scripts/verify_anchor.py BUNDLE.json --sender 0xANCHOR_ACCOUNT

BUNDLE.json is the bundle JSON (or the `{"bundle": ..., "bundle_hash": ...}` download).
For each anchor it recomputes the bundle commitment and Merkle proof locally, then
checks the transaction through the chain registry's RPC (overridable with the
network's env var, e.g. QB2_ETHEREUM_SEPOLIA_RPC_URL). Like the application, it
loads QB2_CHAIN_REGISTRY_PATH when set. Exit codes: 0 every anchor passed, 1 any
check failed, 2 none failed but a transaction was unavailable (not final, or not
found on this node).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from requests import Session
from web3 import Web3

from quantum_backend_v2.chains.anchor import AnchorPayload, EvmAnchorAdapter
from quantum_backend_v2.chains.loader import load_chain_registry
from quantum_backend_v2.chains.rpc import resolve_rpc_url
from quantum_backend_v2.provenance.hashing import bundle_hash
from quantum_backend_v2.provenance.merkle import MerkleProof, verify_proof
from quantum_backend_v2.provenance.models import ProvenanceBundle


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("bundle", type=Path)
    parser.add_argument(
        "--sender",
        action="append",
        required=True,
        help="published anchor account; repeat for accounts used before a key rotation",
    )
    args = parser.parse_args()

    try:
        # Bundles are UTF-8 JSON; the platform default encoding (e.g. on Windows) may not be.
        document = json.loads(args.bundle.read_text(encoding="utf-8"))
        bundle = ProvenanceBundle.model_validate(document.get("bundle", document))
    except (OSError, ValueError):
        print("FAIL could not read a provenance bundle from the file")
        return 1
    digest = bundle_hash(bundle)
    claimed = document.get("bundle_hash")
    if claimed is not None and claimed != digest:
        print(f"FAIL commitment: recomputed {digest}, bundle claims {claimed}")
        return 1
    print(f"commitment {digest}")
    if not bundle.anchors:
        print("FAIL no anchors recorded")
        return 1

    # Same registry the application loads, including a QB2_CHAIN_REGISTRY_PATH override.
    registry = load_chain_registry(os.environ.get("QB2_CHAIN_REGISTRY_PATH", "").strip() or None)
    outcome = 0
    for anchor in bundle.anchors:
        label = f"{anchor.chain} {anchor.tx_hash}"
        proof = MerkleProof(anchor.leaf_index, anchor.leaf_count, anchor.proof)
        if not verify_proof(digest, proof, anchor.merkle_root):
            print(f"FAIL {label}: Merkle proof does not reach root {anchor.merkle_root}")
            outcome = 1
            continue
        payload = AnchorPayload(anchor.merkle_root, anchor.leaf_count, anchor.hash_profile)
        try:
            chain = registry.resolve(anchor.chain)
            with Session() as session:
                web3 = Web3(
                    Web3.HTTPProvider(
                        resolve_rpc_url(chain, os.environ),
                        session=session,
                        request_kwargs={"timeout": 30},
                    )
                )
                status = (
                    EvmAnchorAdapter(chain, web3)
                    .check_anchor(anchor.tx_hash, payload, args.sender)
                    .status
                )
        except Exception as exc:
            # Never print the error: RPC errors can include a credential-bearing URL.
            print(f"UNAVAILABLE {label}: lookup failed ({type(exc).__name__})")
            outcome = 1 if outcome == 1 else 2
            continue
        position = f"leaf {anchor.leaf_index + 1} of {anchor.leaf_count}"
        if status == "confirmed":
            print(f"PASS {label}: confirmed, {position}")
        elif status in ("pending", "not_found"):
            # Not final yet, or pruned from this node's history: not evidence either way.
            print(f"UNAVAILABLE {label}: {status}, {position}")
            outcome = 1 if outcome == 1 else 2
        else:
            print(f"FAIL {label}: {status}, {position}")
            outcome = 1
    return outcome


if __name__ == "__main__":
    sys.exit(main())
