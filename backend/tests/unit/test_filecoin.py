"""Filecoin manifests and trusted subprocess boundary; no network in unit tests."""

import base64
import hashlib
import json
import os
import sys

import pytest
from pydantic import ValidationError

from quantum_backend_v2.artifacts.filecoin import (
    FilecoinBridgeError,
    FilecoinReceipt,
    FilecoinStore,
    Package,
    PackageFile,
)


def receipt(data: bytes) -> FilecoinReceipt:
    return FilecoinReceipt(
        piece_cid="bafkzcibfixture",
        sha256=hashlib.sha256(data).hexdigest(),
        size_bytes=len(data),
        copies=[],
    )


def test_package_roundtrip_and_file_hash_validation():
    package = Package.create(
        kind="experiment",
        identity="run-12345",
        files={"input.json": b'{"circuit":"h 0"}', "results/output.json": b'{"0":32}'},
    )
    assert package.files["input.json"].data() == b'{"circuit":"h 0"}'
    assert Package.model_validate_json(package.to_bytes()) == package
    payload = json.loads(package.to_bytes())
    payload["files"]["input.json"]["content_base64"] = base64.b64encode(b"tamper").decode()
    with pytest.raises(ValueError):
        Package.model_validate(payload)


@pytest.mark.parametrize("path", ["../secret", "/abs", "C:/secret", "a\\b", "a/../b", ""])
def test_package_rejects_unsafe_paths(path):
    with pytest.raises(ValueError):
        Package.create(kind="experiment", identity="run-12345", files={path: b"x"})


def test_receipt_rejects_mainnet_and_bad_digest():
    with pytest.raises(ValidationError):
        FilecoinReceipt(chain_id=314, piece_cid="bafkzcibfixture", sha256="a" * 64, size_bytes=1)
    with pytest.raises(ValidationError):
        FilecoinReceipt(piece_cid="bafkzcibfixture", sha256="bad", size_bytes=1)


@pytest.mark.anyio
async def test_download_validates_bytes_not_bridge_claim():
    class Boundary(FilecoinStore):
        async def command(self, command, **kwargs):
            return {"data_base64": base64.b64encode(b"wrong").decode()}

    store = Boundary()
    with pytest.raises(ValueError, match="match"):
        await store.download(receipt(b"right"))


@pytest.mark.anyio
async def test_upload_requires_retrieval_before_returning_receipt():
    data = b"input" * 32

    class Boundary(FilecoinStore):
        async def command(self, command, **kwargs):
            if command == "upload":
                return receipt(data).model_dump()
            raise OSError("provider unavailable")

    with pytest.raises(OSError):
        await Boundary().upload(data)


def test_noncanonical_base64_and_oversize_are_rejected():
    with pytest.raises(ValueError):
        PackageFile(content_base64="!!!", sha256="0" * 64, size_bytes=0)


@pytest.mark.anyio
async def test_killed_write_preserves_public_transaction_journal(tmp_path):
    script = tmp_path / "bridge.py"
    tx = "0x" + "a" * 64
    script.write_text(
        "import os,json,time\n"
        "with open(os.environ['QMESH_FILECOIN_JOURNAL_PATH'],'a') as f:\n"
        f" f.write(json.dumps({{'transaction_hash':'{tx}'}})+'\\n')\n"
        " f.flush(); os.fsync(f.fileno())\n"
        "time.sleep(10)\n"
    )
    store = FilecoinStore(
        bridge_path=script,
        node=sys.executable,
        timeout_seconds=1,
        env={**os.environ, "QMESH_FILECOIN_JOURNAL_DIR": str(tmp_path / "journals")},
    )
    with pytest.raises(FilecoinBridgeError) as result:
        await store.command("payments", action="deposit", amount_usdfc="0.1")
    assert result.value.uncertain
    assert result.value.transaction_hashes == [tx]


@pytest.mark.anyio
async def test_real_node_bridge_and_python_agree_on_exclusive_journal(tmp_path):
    store = FilecoinStore(
        env={
            **os.environ,
            "QMESH_FILECOIN_PRIVATE_KEY": "",
            "QMESH_FILECOIN_JOURNAL_DIR": str(tmp_path),
        }
    )
    if not (store.bridge_path.parent / "node_modules/@filoz/synapse-sdk").exists():
        pytest.skip("Install services/filecoin dependencies for subprocess contract check")
    with pytest.raises(FilecoinBridgeError) as error:
        await store.command("payments", action="deposit", amount_usdfc="0.1")
    assert error.value.code == "key_required"
    assert not error.value.uncertain
