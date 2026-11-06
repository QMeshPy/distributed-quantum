"""Compose Kubo round-trip: Python client add → gateway read → CID match.

Starts a disposable offline Kubo extracted from docker-compose.yaml (same pattern
as scripts/smoke_kubo.py). Production leaves RPC unpublished; this fixture briefly
publishes it on 127.0.0.1 only for the uniquely named test project so the host
process can exercise KuboClient. Gateway stays loopback-only.

Skipped unless QB2_KUBO_COMPOSE_TEST=1 (CI sets this). Never targets a shared
deployment volume or project .env secrets.
"""

from __future__ import annotations

import json
import os
import secrets
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from quantum_backend_v2.config import AppSettings
from quantum_backend_v2.content.kubo import KuboClient

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = b"QMeshPy Kubo client compose fixture: harmless public bytes.\n"

pytestmark = [
    pytest.mark.anyio,
    pytest.mark.kubo_compose,
    pytest.mark.skipif(
        os.environ.get("QB2_KUBO_COMPOSE_TEST") != "1",
        reason="Compose Kubo client round-trip not enabled",
    ),
    pytest.mark.skipif(shutil.which("docker") is None, reason="Docker Compose CLI is required"),
]


def _run(command: list[str], data: bytes | None = None) -> bytes:
    """Capture commands without printing configuration or inherited credentials."""
    try:
        return subprocess.run(
            command,
            input=data,
            capture_output=True,
            check=True,
            timeout=120,
        ).stdout
    except subprocess.CalledProcessError as error:
        raise RuntimeError(
            f"docker operation failed (exit {error.returncode}); "
            "output withheld to avoid exposing credentials"
        ) from None
    except subprocess.TimeoutExpired:
        raise RuntimeError("docker operation timed out after 120 seconds") from None


def _loopback_port(bindings: object, *, label: str) -> str:
    message = f"{label} must bind only to IPv4 loopback on a valid port; observed: {bindings!r}"
    if not isinstance(bindings, list) or not bindings:
        raise RuntimeError(message)
    ports: list[str] = []
    for binding in bindings:
        if not isinstance(binding, dict) or binding.get("HostIp") != "127.0.0.1":
            raise RuntimeError(message)
        port = binding.get("HostPort")
        if not isinstance(port, str) or not port.isdecimal() or not 0 < int(port) <= 65535:
            raise RuntimeError(message)
        ports.append(port)
    return ports[0]


def _published_ports(container: str) -> tuple[str, str]:
    """Wait briefly for Docker to expose loopback RPC and gateway mappings."""
    deadline = time.monotonic() + 10
    while True:
        ports = json.loads(
            _run(
                [
                    "docker",
                    "inspect",
                    "--format",
                    "{{json .NetworkSettings.Ports}}",
                    container,
                ]
            )
        )
        if not isinstance(ports, dict):
            raise RuntimeError("Docker returned invalid port metadata")
        rpc = ports.get("5001/tcp")
        gateway = ports.get("8080/tcp")
        if (rpc not in (None, []) and gateway not in (None, [])) or time.monotonic() >= deadline:
            return (
                _loopback_port(rpc, label="RPC"),
                _loopback_port(gateway, label="Gateway"),
            )
        time.sleep(0.25)


@pytest.fixture(scope="module")
def kubo_compose_endpoints() -> Iterator[tuple[str, str, str]]:
    """Yield (rpc_url, gateway_base, secret) for one disposable offline Kubo."""
    model: dict[str, Any] = json.loads(
        _run(
            [
                "docker",
                "compose",
                "--env-file",
                os.devnull,
                "-f",
                str(ROOT / "docker-compose.yaml"),
                "config",
                "--no-interpolate",
                "--format",
                "json",
            ]
        )
    )
    service = model["services"]["kubo"]
    secret = secrets.token_urlsafe(32)
    service.setdefault("environment", {}).update(KUBO_RPC_SECRET=secret)
    service["command"] = ["daemon", "--offline", "--migrate=false"]
    for port in service["ports"]:
        port.pop("published", None)
    # Test-only: expose RPC on loopback so KuboClient can reach the disposable node.
    service["ports"].append(
        {
            "mode": "ingress",
            "host_ip": "127.0.0.1",
            "target": 5001,
            "protocol": "tcp",
        }
    )
    manifest = {
        "services": {"kubo": service},
        "volumes": {"kubo_data": {"driver": "local"}},
        "networks": {"content_network": {"driver": "bridge"}},
    }
    project = f"qmesh-kubo-client-{uuid.uuid4().hex[:12]}"
    primary_failed = False
    with tempfile.TemporaryDirectory(prefix="qmesh-kubo-client-") as directory:
        config = Path(directory) / "compose.json"
        config.write_text(json.dumps(manifest), encoding="utf-8")
        config.chmod(0o600)
        compose = [
            "docker",
            "compose",
            "--env-file",
            os.devnull,
            "-p",
            project,
            "-f",
            str(config),
        ]
        try:
            _run([*compose, "up", "-d", "--wait", "--wait-timeout", "90", "kubo"])
            container = _run([*compose, "ps", "-q", "kubo"]).decode().strip()
            rpc_port, gateway_port = _published_ports(container)
            yield (
                f"http://127.0.0.1:{rpc_port}",
                f"http://127.0.0.1:{gateway_port}",
                secret,
            )
        except BaseException:
            primary_failed = True
            raise
        finally:
            try:
                _run([*compose, "down", "--volumes", "--remove-orphans"])
            except (RuntimeError, OSError, subprocess.SubprocessError):
                if not primary_failed:
                    raise
                # Keep the original failure; disposable label is enough to inspect leftovers.


async def test_client_add_gateway_read_cid_roundtrip(
    kubo_compose_endpoints: tuple[str, str, str],
) -> None:
    rpc_url, gateway_base, secret = kubo_compose_endpoints
    settings = AppSettings.from_env(
        {
            "KUBO_RPC_URL": rpc_url,
            "KUBO_RPC_SECRET": secret,
        }
    )
    async with KuboClient(settings.kubo) as client:
        added = await client.add(FIXTURE)
        assert added.cid
        assert "\n" not in added.cid

        with urllib.request.urlopen(f"{gateway_base}/ipfs/{added.cid}", timeout=15) as response:
            body = response.read()
        assert body == FIXTURE

        recomputed = await client.add(body)
        assert recomputed.cid == added.cid

        # Writes through the read-only gateway must stay rejected.
        for method in ("POST", "PUT", "DELETE"):
            request = urllib.request.Request(
                f"{gateway_base}/ipfs/{added.cid}",
                data=b"must-not-write",
                method=method,
            )
            with pytest.raises(urllib.error.HTTPError) as raised:
                urllib.request.urlopen(request, timeout=15)
            assert raised.value.code in (404, 405)
