"""Exercise real libp2p transport using loopback sockets and temporary storage."""

from __future__ import annotations

import json
import time
from queue import Empty, SimpleQueue

from quantum_backend_v2.config import Libp2pSettings
from quantum_backend_v2.discovery.service import LibP2pNetworkThread
from quantum_backend_v2.libp2p import create_real_libp2p_runtime


def test_local_peers_exchange_rpc_and_discovery_then_stop(tmp_path):
    protocol = "/qmesh/transport-test/1.0.0"

    async def reply(payload: bytes) -> bytes:
        return b"ack:" + payload

    threads = []
    runtimes = []
    queues = []
    try:
        for label in ("a", "b"):
            settings = Libp2pSettings(
                peer_id=f"qmesh-transport-test-{label}",
                peerstore_path=tmp_path / f"{label}.sqlite3",
                listen_multiaddrs=("/ip4/127.0.0.1/tcp/0",),
                activate_listeners=True,
                bootstrap_peers=(),
                dev_service_peer_count=0,
                rendezvous_namespace="qmesh-transport-test",
                heartbeat_interval_seconds=5,
            )
            runtime = create_real_libp2p_runtime(settings)
            events = SimpleQueue()
            thread = LibP2pNetworkThread(
                settings, runtime, events, service_ids=(), request_handlers={protocol: reply}
            )
            runtimes.append(runtime)
            queues.append(events)
            threads.append(thread)
            thread.start()
            assert thread.is_running
            addresses = tuple(str(addr) for addr in runtime.host.get_addrs())
            assert addresses
            assert all(addr.startswith("/ip4/127.0.0.1/tcp/") for addr in addresses)
            assert all("/tcp/0/" not in addr for addr in addresses)

        for source, target in ((0, 1), (1, 0)):
            destination = runtimes[target].host
            payload = f"peer-{source}-to-{target}".encode()
            response = threads[source].request_bytes(
                peer_id=str(destination.get_id()),
                protocol_id=protocol,
                payload=payload,
                peer_addresses=tuple(str(addr) for addr in destination.get_addrs()),
                timeout_seconds=10,
            )
            assert response == b"ack:" + payload

        received = [False, False]
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline and not all(received):
            for index, events in enumerate(queues):
                try:
                    event = events.get_nowait()
                except Empty:
                    continue
                if json.loads(event.raw_payload)["peer_id"] == str(
                    runtimes[1 - index].host.get_id()
                ):
                    received[index] = True
            time.sleep(0.1)
        assert all(received), f"Cross-peer discovery delivery: {received}"
    finally:
        for thread in reversed(threads):
            thread.stop()
        for runtime in runtimes:
            runtime.peerstore.close()
    assert all(not thread.is_running for thread in threads)


def test_peer_reconnects_to_bootstrap_peer_that_started_late(tmp_path, monkeypatch):
    """A NAT'd worker cannot be dialed back, so it must re-dial the coordinator itself."""
    import socket

    from quantum_backend_v2.libp2p import transport

    monkeypatch.setattr(transport, "_BOOTSTRAP_CONNECT_RETRIES", 1)
    monkeypatch.setattr(transport, "_BOOTSTRAP_RECONNECT_INTERVAL_SECONDS", 1.0)

    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]

    def settings(label, **kwargs):
        return Libp2pSettings(
            peer_id=f"qmesh-reconnect-{label}",
            peerstore_path=tmp_path / f"{label}.sqlite3",
            dev_service_peer_count=0,
            rendezvous_namespace="qmesh-reconnect-test",
            heartbeat_interval_seconds=5,
            **kwargs,
        )

    coordinator_settings = settings(
        "coordinator", listen_multiaddrs=(f"/ip4/127.0.0.1/tcp/{port}",), activate_listeners=True
    )
    coordinator_runtime = create_real_libp2p_runtime(coordinator_settings)
    coordinator_id = str(coordinator_runtime.host.get_id())

    worker_settings = settings(
        "worker",
        activate_listeners=False,
        bootstrap_peers=(f"/ip4/127.0.0.1/tcp/{port}/p2p/{coordinator_id}",),
    )
    worker_runtime = create_real_libp2p_runtime(worker_settings)
    worker = LibP2pNetworkThread(worker_settings, worker_runtime, None, service_ids=(), consume_discovery=False)
    coordinator_queue = SimpleQueue()
    coordinator = LibP2pNetworkThread(
        coordinator_settings, coordinator_runtime, coordinator_queue, service_ids=()
    )
    try:
        worker.start()  # coordinator is not up yet, so the initial connect fails
        assert coordinator_id not in {str(p) for p in worker_runtime.host.get_connected_peers()}

        coordinator.start()
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if coordinator_id in {str(p) for p in worker_runtime.host.get_connected_peers()}:
                break
            time.sleep(0.5)
        else:
            raise AssertionError("worker never reconnected to the late coordinator")
        assert _wait_for_event_from(coordinator_queue, str(worker_runtime.host.get_id()), 25)
    finally:
        worker.stop()
        coordinator.stop()


def _wait_for_event_from(events, peer_id: str, timeout: float) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            event = events.get(timeout=1)
        except Empty:
            continue
        if json.loads(event.raw_payload)["peer_id"] == peer_id:
            return True
    return False


def test_worker_recovers_when_the_coordinator_restarts(tmp_path, monkeypatch):
    """A redeploy or `make run` restart must not strand workers that cannot be dialed back."""
    import socket

    from quantum_backend_v2.libp2p import transport

    monkeypatch.setattr(transport, "_BOOTSTRAP_RECONNECT_INTERVAL_SECONDS", 1.0)

    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]

    def settings(label, **kwargs):
        return Libp2pSettings(
            peer_id=f"qmesh-restart-{label}",
            peerstore_path=tmp_path / f"{label}.sqlite3",
            dev_service_peer_count=0,
            rendezvous_namespace="qmesh-restart-test",
            heartbeat_interval_seconds=5,
            **kwargs,
        )

    def start_coordinator():
        coordinator_settings = settings(
            "coordinator", listen_multiaddrs=(f"/ip4/127.0.0.1/tcp/{port}",), activate_listeners=True
        )
        runtime = create_real_libp2p_runtime(coordinator_settings)
        events = SimpleQueue()
        thread = LibP2pNetworkThread(coordinator_settings, runtime, events, service_ids=())
        thread.start()
        return runtime, events, thread

    first_runtime, _, first = start_coordinator()
    coordinator_id = str(first_runtime.host.get_id())  # same label => same ID after restart
    worker_settings = settings(
        "worker",
        activate_listeners=False,
        bootstrap_peers=(f"/ip4/127.0.0.1/tcp/{port}/p2p/{coordinator_id}",),
    )
    worker_runtime = create_real_libp2p_runtime(worker_settings)
    worker = LibP2pNetworkThread(worker_settings, worker_runtime, None, service_ids=(), consume_discovery=False)
    second = None

    def connected():
        return coordinator_id in {str(p) for p in worker_runtime.host.get_connected_peers()}

    try:
        worker.start()
        assert connected()

        first.stop()
        deadline = time.monotonic() + 15
        while connected() and time.monotonic() < deadline:
            time.sleep(0.5)
        assert not connected(), "worker never noticed the coordinator went away"

        _, events, second = start_coordinator()
        deadline = time.monotonic() + 20
        while not connected() and time.monotonic() < deadline:
            time.sleep(0.5)
        assert connected(), "worker never reconnected after the coordinator restarted"
        assert _wait_for_event_from(events, str(worker_runtime.host.get_id()), 25)
    finally:
        worker.stop()
        first.stop()
        if second is not None:
            second.stop()
