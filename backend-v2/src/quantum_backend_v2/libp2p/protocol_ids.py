"""Well-known libp2p stream IDs for backend-v2 execution RPCs."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Libp2pExecutionProtocolIds:
    """Concrete stream IDs used for reservation and execution RPC."""

    reservation_prepare: str
    reservation_commit: str
    reservation_cancel: str
    fragment_dispatch: str


def build_execution_protocol_ids(namespace: str) -> Libp2pExecutionProtocolIds:
    """Derive the execution protocol suite from the rendezvous namespace."""
    base = f"/qb2/{namespace}"
    return Libp2pExecutionProtocolIds(
        reservation_prepare=f"{base}/reservation/prepare/1.0.0",
        reservation_commit=f"{base}/reservation/commit/1.0.0",
        reservation_cancel=f"{base}/reservation/cancel/1.0.0",
        fragment_dispatch=f"{base}/execution/fragment-dispatch/1.0.0",
    )
