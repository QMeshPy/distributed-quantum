from __future__ import annotations

from quantum_coordinator.config.models import APIConfig, AppConfig, DatabaseConfig, Libp2pConfig


def make_real_libp2p_config(
    database_path: str,
    *,
    enable_auth: bool = False,
    api_key: str | None = None,
    enable_rate_limit: bool = False,
    rate_limit_per_minute: int = 60,
) -> AppConfig:
    from libp2p.utils.address_validation import find_free_port, get_available_interfaces

    coordinator_port = find_free_port()
    service_port = find_free_port()
    coordinator_addrs = get_available_interfaces(coordinator_port)
    # Prefer ip4 loopback for local tests
    coordinator_listen_addrs = tuple(
        str(addr) for addr in coordinator_addrs if "/ip4/127.0.0.1/" in str(addr)
    )
    if not coordinator_listen_addrs:
        coordinator_listen_addrs = tuple(str(addr) for addr in coordinator_addrs)
    return AppConfig(
        database=DatabaseConfig(path=database_path),
        api=APIConfig(
            enable_auth=enable_auth,
            api_key=api_key,
            enable_rate_limit=enable_rate_limit,
            rate_limit_per_minute=rate_limit_per_minute,
        ),
        libp2p=Libp2pConfig(
            enabled=True,
            enable_mdns=False,
            coordinator_listen_addrs=coordinator_listen_addrs,
            embedded_service_count=1,
            embedded_service_base_port=service_port,
            embedded_ad_interval_seconds=0.3,
        ),
    )
