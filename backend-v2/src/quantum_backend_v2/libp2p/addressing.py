"""Helpers for resolving bind and advertised libp2p multiaddrs."""

from __future__ import annotations

from quantum_backend_v2.config.models import Libp2pSettings


def normalize_local_loopback_addr(addr: str) -> str:
    """Convert wildcard bind addresses into loopback addrs for local-only swarms."""
    if addr.startswith("/ip4/0.0.0.0/"):
        return addr.replace("/ip4/0.0.0.0/", "/ip4/127.0.0.1/", 1)
    if addr.startswith("/ip6/::/"):
        return addr.replace("/ip6/::/", "/ip6/::1/", 1)
    return addr


def resolve_advertised_network_addresses(
    host: object,
    settings: Libp2pSettings,
) -> tuple[str, ...]:
    """Return the dialable addresses this peer should publish to the network."""
    if settings.advertise_multiaddrs:
        return settings.advertise_multiaddrs

    host_addrs = tuple(str(addr) for addr in host.get_addrs())  # type: ignore[attr-defined]
    advertised = host_addrs or tuple(settings.listen_multiaddrs)

    # Embedded worker peers are always local to the current machine, so wildcard
    # bind addrs need to be rewritten to loopback to stay dialable.
    if settings.dev_service_peer_count > 0:
        return tuple(normalize_local_loopback_addr(addr) for addr in advertised)

    return advertised
