"""Calibration artifact CLI. No wallet funding or write retries are implicit.

Run with the installed backend environment. Credentials come from environment;
receipts and journal files contain public data only.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path

from quantum_backend_v2.application.filecoin_archive import verify_export
from quantum_backend_v2.artifacts.filecoin import FilecoinReceipt, FilecoinStore, Package
from quantum_backend_v2.config.models import NearRegistrySettings
from quantum_backend_v2.provenance.near_registry import NearRegistryAdapter


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    pack = commands.add_parser("pack")
    pack.add_argument("directory", type=Path)
    pack.add_argument("output", type=Path)
    pack.add_argument("--identity", required=True)
    upload = commands.add_parser("upload")
    upload.add_argument("input", type=Path)
    upload.add_argument("receipt", type=Path)
    upload.add_argument("--publish-publicly", action="store_true", required=True)
    upload.add_argument("--monthly-budget", default="0.25")
    upload.add_argument("--lockup-budget", default="1")
    for name in ("download", "verify", "status"):
        command = commands.add_parser(name)
        command.add_argument("receipt", type=Path)
        if name == "download":
            command.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.command == "pack":
        files = {}
        root = args.directory.resolve(strict=True)
        for path in sorted(root.rglob("*")):
            if path.is_symlink():
                raise ValueError("Package directories must not contain symbolic links")
            if path.is_file():
                if not path.resolve().is_relative_to(root):
                    raise ValueError("Package file escaped its directory")
                files[path.relative_to(root).as_posix()] = path.read_bytes()
        package = Package.create(kind="experiment", identity=args.identity, files=files)
        with args.output.open("xb") as handle:
            handle.write(package.to_bytes())
        print(json.dumps({"package": str(args.output), "files": len(files)}))
        return
    store = FilecoinStore(
        max_monthly_usdfc=getattr(args, "monthly_budget", "0.25"),
        max_lockup_usdfc=getattr(args, "lockup_budget", "1"),
    )
    if args.command == "upload":
        journal = args.receipt.with_suffix(args.receipt.suffix + ".intent")
        if args.receipt.exists():
            raise ValueError("Receipt exists; verify it instead of uploading again")
        # Exclusive intent survives timeout/kill; never automatically clear uncertain writes.
        with journal.open("x") as handle:
            json.dump({"state": "started", "input": str(args.input)}, handle)
        receipt = await store.upload(args.input.read_bytes())
        with args.receipt.open("x") as handle:
            handle.write(receipt.model_dump_json(indent=2))
        journal.write_text(json.dumps({"state": "confirmed", "receipt": str(args.receipt)}))
        print(receipt.model_dump_json())
        return
    receipt = FilecoinReceipt.model_validate_json(args.receipt.read_bytes())
    if args.command == "status":
        print(json.dumps(await store.status(receipt)))
        return
    data = await store.download(receipt)
    if args.command == "download":
        with args.output.open("xb") as handle:
            handle.write(data)
        print(json.dumps({"retrieval": "verified", "sha256": receipt.sha256}))
        return
    settings = NearRegistrySettings(
        contract_id=os.getenv("QB2_NEAR_REGISTRY_CONTRACT"),
        publisher_id=os.getenv("QB2_NEAR_REGISTRY_PUBLISHER"),
        rpc_url=os.getenv("QB2_NEAR_RPC_URL", "https://rpc.testnet.near.org"),
    )
    adapters = {"near:testnet": NearRegistryAdapter(settings)} if settings.configured else {}
    report = await verify_export(data, anchor_adapters=adapters)
    print(report.model_dump_json(indent=2))
    if any(check.status == "failed" for check in report.checks):
        raise SystemExit(1)
    if report.status != "verified":
        raise SystemExit(2)


if __name__ == "__main__":
    asyncio.run(main())
