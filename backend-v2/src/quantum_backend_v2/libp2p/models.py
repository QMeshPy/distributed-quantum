"""Libp2p bootstrap plan models."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from quantum_backend_v2.protocols import ProtocolDescriptor


class Libp2pBootstrapPlan(BaseModel):
    """Developer-facing description of the intended libp2p runtime."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    enabled: bool
    peer_id: str = Field(min_length=3)
    rendezvous_namespace: str = Field(min_length=3)
    listen_multiaddrs: tuple[str, ...] = Field(default_factory=tuple)
    bootstrap_peers: tuple[str, ...] = Field(default_factory=tuple)
    advertisement_protocol: ProtocolDescriptor
    heartbeat_protocol: ProtocolDescriptor
    peer_exchange_protocol: ProtocolDescriptor


class Libp2pRuntimeSummary(BaseModel):
    """Observable summary of the real py-libp2p runtime wiring."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    driver: str = Field(min_length=3)
    driver_version: str = Field(min_length=1)
    using_real_py_libp2p: bool
    host_type: str = Field(min_length=1)
    peerstore_backend: str = Field(min_length=1)
    peerstore_path: str = Field(min_length=1)
    requested_peer_label: str = Field(min_length=3)
    host_peer_id: str = Field(min_length=3)
    listeners_active: bool
    configured_listen_multiaddrs: tuple[str, ...] = Field(default_factory=tuple)
    advertised_multiaddrs: tuple[str, ...] = Field(default_factory=tuple)
    bootstrap_peers: tuple[str, ...] = Field(default_factory=tuple)
    rendezvous_namespace: str = Field(min_length=3)
