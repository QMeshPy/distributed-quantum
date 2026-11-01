"""Run this machine as a remote worker peer for a coordinator running elsewhere.

The worker only dials OUT to the coordinator (no listener), so it works behind any
NAT or Wi-Fi without port-forwarding. The coordinator sends work back over that
same connection.

    uv run python scripts/run_remote_worker.py \
        --coordinator /ip4/<host>/tcp/4011/p2p/<coordinator-peer-id> --label laptop-b
"""

from __future__ import annotations

import argparse
import logging
import re
import sys
import time
from pathlib import Path

# Lets the script run from a plain checkout without installing the backend package.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from libp2p.peer.peerinfo import info_from_p2p_addr
from multiaddr import Multiaddr

from quantum_backend_v2.config import Libp2pSettings

# Import via discovery.service: importing fragment_worker/transport first hits a circular import.
from quantum_backend_v2.discovery.service import PeerFragmentWorker, build_network_thread
from quantum_backend_v2.libp2p import create_real_libp2p_runtime
from quantum_backend_v2.libp2p.protocol_ids import build_execution_protocol_ids
from quantum_backend_v2.quality.catalog import KNOWN_SERVICE_IDS


def _logged(name: str, handler):
    async def wrapped(payload: bytes) -> bytes:
        print(f"[{time.strftime('%H:%M:%S')}] {name} ({len(payload)} bytes)", flush=True)
        return await handler(payload)

    return wrapped


def _label(value: str) -> str:
    # The label becomes a file name and seeds the peer ID, so keep it simple and path-safe.
    if not re.fullmatch(r"[A-Za-z0-9._-]{3,64}", value) or value.startswith("."):
        raise argparse.ArgumentTypeError("use 3-64 letters, digits, '.', '_' or '-'")
    return value


def _coordinator(value: str) -> str:
    try:
        info_from_p2p_addr(Multiaddr(value))
    except Exception as exc:
        raise argparse.ArgumentTypeError(
            f"not a valid multiaddr ending in /p2p/<peer-id> ({exc})"
        ) from exc
    return value


def _connected(runtime, coordinator_id: str) -> bool:
    return coordinator_id in {str(p) for p in runtime.host.get_connected_peers()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--coordinator", required=True, type=_coordinator, help="/ip4|dns4/<host>/tcp/<port>/p2p/<id>"
    )
    parser.add_argument(
        "--label", required=True, type=_label,
        help="Unique per machine; derives this peer's stable ID (two machines must not share one)",
    )
    parser.add_argument("--namespace", default="quantum-backend", help="Must match the coordinator")
    parser.add_argument("--heartbeat", type=int, default=10, help="Seconds between heartbeats")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    settings = Libp2pSettings(
        peer_id=args.label,
        listen_multiaddrs=(),
        activate_listeners=False,
        bootstrap_peers=(args.coordinator,),
        rendezvous_namespace=args.namespace,
        peerstore_path=Path.home() / ".qb2-worker" / f"{args.label}.sqlite3",
        heartbeat_interval_seconds=args.heartbeat,
    )
    runtime = create_real_libp2p_runtime(settings)
    peer_id = str(runtime.host.get_id())
    worker = PeerFragmentWorker(peer_id=peer_id)
    protocols = build_execution_protocol_ids(args.namespace)
    thread = build_network_thread(
        settings,
        runtime,
        None,
        service_ids=KNOWN_SERVICE_IDS,
        request_handlers={
            protocols.reservation_prepare: _logged("reservation/prepare", worker.handle_prepare),
            protocols.reservation_commit: _logged("reservation/commit", worker.handle_commit),
            protocols.reservation_cancel: _logged("reservation/cancel", worker.handle_cancel),
            protocols.fragment_dispatch: _logged("fragment/dispatch", worker.handle_dispatch),
        },
        heartbeat_provider=worker.heartbeat_snapshot,
        consume_discovery=False,
    )
    try:
        thread.start()
    except RuntimeError as exc:
        thread.stop()
        sys.exit(f"Could not start the worker: {exc}\nIs the coordinator address reachable from here?")

    coordinator_id = args.coordinator.rsplit("/p2p/", 1)[-1]
    print(f"Worker {args.label!r} peer ID: {peer_id} (namespace {args.namespace!r})")
    print("Waiting for work. Ctrl+C to stop.", flush=True)
    was_connected = None
    try:
        while thread.is_running:
            now_connected = _connected(runtime, coordinator_id)
            if now_connected != was_connected:
                state = "CONNECTED" if now_connected else "NOT CONNECTED - retrying every 15s"
                print(f"[{time.strftime('%H:%M:%S')}] Coordinator {state}", flush=True)
                was_connected = now_connected
            time.sleep(1)
        sys.exit("The libp2p network thread stopped unexpectedly; see the log above.")
    except KeyboardInterrupt:
        pass
    finally:
        thread.stop()


if __name__ == "__main__":
    main()
