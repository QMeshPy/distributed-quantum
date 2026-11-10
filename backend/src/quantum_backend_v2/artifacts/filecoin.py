"""Calibration-only storage and portable research packages.

The Node bridge owns SDK interaction. Python independently checks bytes before
they become inputs, checkpoints, or externally verifiable provenance.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import re
import uuid
from pathlib import Path, PurePosixPath
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_BYTES = 16 * 1024 * 1024


class FilecoinBridgeError(OSError):
    """Only validated public reconciliation metadata crosses the subprocess boundary."""

    def __init__(self, error: dict[str, Any]) -> None:
        code = error.get("code", "bridge_failed")
        self.code = (
            code
            if isinstance(code, str) and re.fullmatch(r"[a-z_]{1,64}", code)
            else "bridge_failed"
        )
        hashes = error.get("transaction_hashes", [])
        self.transaction_hashes = (
            [
                value
                for value in hashes
                if isinstance(value, str) and re.fullmatch(r"0x[0-9a-fA-F]{64}", value)
            ]
            if isinstance(hashes, list)
            else []
        )
        self.uncertain = error.get("uncertain") is not False or bool(self.transaction_hashes)
        super().__init__(f"Filecoin operation failed ({self.code}); check its journal")


class FilecoinCopy(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    provider_id: str
    data_set_id: str
    piece_id: str
    transaction_hash: str | None = None
    provider_address: str | None = None
    retrieval_url: str | None = None


class FilecoinReceipt(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    network: Literal["calibration"] = "calibration"
    chain_id: Literal[314159] = 314159
    piece_cid: str = Field(min_length=10, max_length=256, pattern=r"^b[a-z2-7]+$")
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    size_bytes: int = Field(ge=1, le=MAX_BYTES, strict=True)
    complete: bool = True
    copies: tuple[FilecoinCopy, ...] = ()
    transaction_hashes: tuple[str, ...] = ()
    payer_address: str | None = None


class PackageFile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    content_base64: str = Field(max_length=MAX_BYTES * 4 // 3 + 4)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    size_bytes: int = Field(ge=0, le=MAX_BYTES, strict=True)

    def data(self) -> bytes:
        value = base64.b64decode(self.content_base64, validate=True)
        if (
            len(value) != self.size_bytes
            or hashlib.sha256(value).hexdigest() != self.sha256
            or base64.b64encode(value).decode() != self.content_base64
        ):
            raise ValueError("Package file bytes do not match the manifest")
        return value

    @model_validator(mode="after")
    def verified(self) -> PackageFile:
        self.data()
        return self


class Package(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    schema_version: Literal["qmesh-filecoin-package-v1"] = "qmesh-filecoin-package-v1"
    kind: Literal["experiment", "dataset", "checkpoint"]
    identity: str = Field(min_length=1, max_length=256)
    files: dict[str, PackageFile] = Field(min_length=1, max_length=256)

    @model_validator(mode="after")
    def safe_manifest(self) -> Package:
        for name in self.files:
            path = PurePosixPath(name)
            if (
                not name
                or "\\" in name
                or ":" in name
                or path.is_absolute()
                or ".." in path.parts
                or str(path) != name
            ):
                raise ValueError("Package path must be a normalized relative path")
        if sum(item.size_bytes for item in self.files.values()) > MAX_BYTES:
            raise ValueError("Package exceeds the maximum size")
        return self

    @classmethod
    def create(cls, *, kind: str, identity: str, files: dict[str, bytes]) -> Package:
        return cls(
            kind=kind,
            identity=identity,
            files={
                name: PackageFile(
                    content_base64=base64.b64encode(data).decode(),
                    sha256=hashlib.sha256(data).hexdigest(),
                    size_bytes=len(data),
                )
                for name, data in files.items()
            },
        )

    def to_bytes(self) -> bytes:
        from quantum_backend_v2.provenance.hashing import canonical_json

        data = canonical_json(self.model_dump(mode="json"))
        if len(data) > MAX_BYTES:
            raise ValueError("Encoded package exceeds the maximum size")
        return data


class FilecoinStore:
    """One-shot bridge; writes are never retried after a timeout or lost response."""

    def __init__(
        self,
        *,
        bridge_path: Path | None = None,
        node: str = "node",
        env: dict[str, str] | None = None,
        timeout_seconds: float = 600,
        retention_days: int = 7,
        max_monthly_usdfc: str = "0.25",
        max_lockup_usdfc: str = "1",
    ) -> None:
        self.bridge_path = (
            bridge_path or Path(__file__).resolve().parents[4] / "services/filecoin/bridge.mjs"
        )
        self.node = node
        self.env = env
        self.timeout_seconds = timeout_seconds
        self.retention_days = retention_days
        self.max_monthly_usdfc = max_monthly_usdfc
        self.max_lockup_usdfc = max_lockup_usdfc

    async def command(self, command: str, **arguments: Any) -> dict[str, Any]:
        request = json.dumps({"command": command, **arguments}).encode()
        if len(request) > MAX_BYTES * 2:
            raise ValueError("Filecoin request exceeds size limit")
        env = dict(self.env if self.env is not None else os.environ)
        journal = None
        if command == "upload" or (command == "payments" and arguments.get("action") != "balance"):
            directory = Path(
                env.get(
                    "QMESH_FILECOIN_JOURNAL_DIR",
                    str(self.bridge_path.parent.parent.parent / "tmp/filecoin-journal"),
                )
            )
            directory.mkdir(parents=True, exist_ok=True)
            journal = directory / f"{uuid.uuid4().hex}.jsonl"
            env["QMESH_FILECOIN_JOURNAL_PATH"] = str(journal.resolve())
        else:
            env.pop("QMESH_FILECOIN_JOURNAL_PATH", None)

        def submitted_hashes() -> list[str]:
            if journal is None or not journal.exists() or journal.stat().st_size > 65536:
                return []
            hashes = []
            for line in journal.read_text().splitlines():
                try:
                    event = json.loads(line)
                    value = event.get("transaction_hash")
                    if isinstance(value, str) and re.fullmatch(r"0x[0-9a-fA-F]{64}", value):
                        hashes.append(value)
                except (ValueError, AttributeError):
                    continue
            return list(dict.fromkeys(hashes))

        process = await asyncio.create_subprocess_exec(
            self.node,
            str(self.bridge_path),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            limit=MAX_BYTES * 2,
        )
        try:
            stdout, _ = await asyncio.wait_for(process.communicate(request), self.timeout_seconds)
        except (TimeoutError, asyncio.CancelledError) as exc:
            if process.returncode is None:
                process.kill()
            await process.wait()
            if isinstance(exc, asyncio.CancelledError):
                exc.transaction_hashes = submitted_hashes()
                raise
            raise FilecoinBridgeError(
                {
                    "code": "confirmation_timeout",
                    "uncertain": True,
                    "transaction_hashes": submitted_hashes(),
                }
            ) from None
        if process.returncode != 0:
            try:
                body = json.loads(stdout) if len(stdout) < 65536 else {}
                error = body.get("error", {}) if isinstance(body, dict) else {}
            except (ValueError, UnicodeDecodeError):
                error = {}
            error = error if isinstance(error, dict) else {}
            hashes = error.get("transaction_hashes", [])
            error["transaction_hashes"] = [
                *(hashes if isinstance(hashes, list) else []),
                *submitted_hashes(),
            ]
            raise FilecoinBridgeError(error)
        if len(stdout) > MAX_BYTES * 2:
            raise ValueError("Filecoin response exceeds size limit")
        response = json.loads(stdout)
        if not isinstance(response, dict):
            raise ValueError("Filecoin bridge returned an invalid response")
        return response

    async def upload(self, data: bytes) -> FilecoinReceipt:
        if not 127 <= len(data) <= MAX_BYTES:
            raise ValueError(
                "Filecoin uploads require 127 bytes to 16 MiB; package smaller artifacts"
            )
        raw = await self.command(
            "upload",
            data_base64=base64.b64encode(data).decode(),
            retention_days=self.retention_days,
            max_monthly_usdfc=self.max_monthly_usdfc,
            max_lockup_usdfc=self.max_lockup_usdfc,
            copies=1,
        )
        receipt = FilecoinReceipt.model_validate(raw)
        if (
            not receipt.complete
            or receipt.size_bytes != len(data)
            or receipt.sha256 != hashlib.sha256(data).hexdigest()
        ):
            raise ValueError("Filecoin receipt does not match the upload")
        try:
            await self.download(receipt)
        except (OSError, ValueError, TimeoutError) as exc:
            error = FilecoinBridgeError(
                {
                    "code": "post_upload_retrieval_failed",
                    "uncertain": True,
                    "transaction_hashes": list(receipt.transaction_hashes),
                }
            )
            error.submitted_receipt = receipt.model_dump(mode="json")
            raise error from exc
        return receipt

    async def download(self, receipt: FilecoinReceipt) -> bytes:
        response = await self.command(
            "download",
            piece_cid=receipt.piece_cid,
            sha256=receipt.sha256,
            size_bytes=receipt.size_bytes,
            payer_address=receipt.payer_address,
            provider_address=(receipt.copies[0].provider_address if receipt.copies else None),
        )
        data = base64.b64decode(response["data_base64"], validate=True)
        if len(data) != receipt.size_bytes or hashlib.sha256(data).hexdigest() != receipt.sha256:
            raise ValueError("Filecoin bytes do not match the receipt")
        return data

    async def status(self, receipt: FilecoinReceipt) -> dict[str, Any]:
        proof = await self.command(
            "status",
            piece_cid=receipt.piece_cid,
            copies=[item.model_dump() for item in receipt.copies],
        )
        try:
            await self.download(receipt)
            retrieval = "verified"
        except (OSError, ValueError, TimeoutError):
            retrieval = "unavailable_or_mismatched"
        return {"network": "calibration", "retrieval": retrieval, "possession": proof}
