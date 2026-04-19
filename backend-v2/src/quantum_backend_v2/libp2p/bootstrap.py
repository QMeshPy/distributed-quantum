"""Real py-libp2p bootstrap helpers."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import logging
from pathlib import Path

from libp2p import (
    __version__ as py_libp2p_version,
    create_new_ed25519_key_pair,
    new_host,
)
from libp2p.abc import IHost, IPeerStore
from multiaddr import Multiaddr

from quantum_backend_v2.config import Libp2pSettings
from quantum_backend_v2.libp2p.addressing import resolve_advertised_network_addresses
from quantum_backend_v2.libp2p.models import Libp2pBootstrapPlan, Libp2pRuntimeSummary
from quantum_backend_v2.libp2p.peerstore import create_compatible_sync_sqlite_peerstore
from quantum_backend_v2.protocols import ProtocolDescriptor, ProtocolVersion

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Libp2pRuntime:
    """Concrete py-libp2p runtime created from project settings."""

    settings: Libp2pSettings
    plan: Libp2pBootstrapPlan
    host: IHost
    peerstore: IPeerStore
    listeners_active: bool

    def summary(self) -> Libp2pRuntimeSummary:
        """Return an API-friendly summary of the real py-libp2p runtime."""
        return Libp2pRuntimeSummary(
            driver="py-libp2p",
            driver_version=py_libp2p_version,
            using_real_py_libp2p=True,
            host_type=type(self.host).__name__,
            peerstore_backend=type(self.peerstore).__name__,
            peerstore_path=str(self.settings.peerstore_path),
            requested_peer_label=self.settings.peer_id,
            host_peer_id=str(self.host.get_id()),
            listeners_active=self.listeners_active,
            configured_listen_multiaddrs=self.settings.listen_multiaddrs,
            advertised_multiaddrs=resolve_advertised_network_addresses(self.host, self.settings),
            bootstrap_peers=self.settings.bootstrap_peers,
            rendezvous_namespace=self.settings.rendezvous_namespace,
        )


def create_libp2p_bootstrap_plan(settings: Libp2pSettings) -> Libp2pBootstrapPlan:
    """Create the initial protocol suite and bootstrap plan for the peer host."""
    version = ProtocolVersion(major=1, minor=0, patch=0)
    namespace = settings.rendezvous_namespace
    return Libp2pBootstrapPlan(
        enabled=settings.enabled,
        peer_id=settings.peer_id,
        rendezvous_namespace=namespace,
        listen_multiaddrs=settings.listen_multiaddrs,
        bootstrap_peers=settings.bootstrap_peers,
        advertisement_protocol=ProtocolDescriptor(
            name="peer-advertisement",
            version=version,
            topic=f"{namespace}.peer-advertisement.v1",
            description="Broadcasts peer capabilities and published service summaries.",
        ),
        heartbeat_protocol=ProtocolDescriptor(
            name="peer-heartbeat",
            version=version,
            topic=f"{namespace}.peer-heartbeat.v1",
            description="Tracks peer liveness and stale-peer detection.",
        ),
        peer_exchange_protocol=ProtocolDescriptor(
            name="peer-exchange",
            version=version,
            stream_id=f"/qb2/{namespace}/peer-exchange/1.0.0",
            description="Shares useful peers and swarm topology hints.",
        ),
    )


def create_real_libp2p_runtime(settings: Libp2pSettings) -> Libp2pRuntime:
    """Create a real py-libp2p host and peerstore for backend-v2."""
    settings.peerstore_path.parent.mkdir(parents=True, exist_ok=True)
    _reset_dev_peerstore_if_needed(settings)
    peerstore = create_compatible_sync_sqlite_peerstore(settings.peerstore_path)
    key_pair = create_new_ed25519_key_pair(seed=_derive_seed(settings.peer_id))
    plan = create_libp2p_bootstrap_plan(settings)
    listen_addrs = _parse_listen_addrs(settings) if settings.activate_listeners else None
    host = new_host(
        key_pair=key_pair,
        peerstore_opt=peerstore,
        listen_addrs=listen_addrs,
        bootstrap=None,
        enable_mDNS=False,
    )
    return Libp2pRuntime(
        settings=settings,
        plan=plan,
        host=host,
        peerstore=peerstore,
        listeners_active=settings.activate_listeners,
    )


def _derive_seed(peer_label: str) -> bytes:
    return hashlib.sha256(peer_label.encode("utf-8")).digest()


def _parse_listen_addrs(settings: Libp2pSettings) -> list[Multiaddr] | None:
    if not settings.listen_multiaddrs:
        return None
    return [Multiaddr(addr) for addr in settings.listen_multiaddrs]


def _reset_dev_peerstore_if_needed(settings: Libp2pSettings) -> None:
    if settings.dev_service_peer_count <= 0:
        return

    removed_paths = []
    for path in _sqlite_artifact_paths(settings.peerstore_path):
        if path.exists():
            path.unlink()
            removed_paths.append(path.name)

    if removed_paths:
        logger.info(
            "reset local libp2p peerstore state for embedded dev swarm (%s)",
            ", ".join(sorted(removed_paths)),
        )


def _sqlite_artifact_paths(path: Path) -> tuple[Path, ...]:
    return (
        path,
        Path(f"{path}-shm"),
        Path(f"{path}-wal"),
    )
