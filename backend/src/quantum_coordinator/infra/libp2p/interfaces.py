"""Abstract interfaces for libp2p integration.

The coordinator core depends on these protocols rather than concrete py-libp2p classes,
which keeps planning/runtime code stable if low-level APIs evolve.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class PubSubMessage:
    """Message delivered from a pubsub topic."""

    topic: str
    sender_peer_id: str
    payload: bytes
    received_at: datetime


class PubSubAdapter(Protocol):
    """Minimal pub/sub contract for service discovery and quality updates."""

    @property
    def peer_id(self) -> str:
        """Return current peer identifier."""

    async def publish(self, topic: str, message: bytes) -> None:
        """Publish bytes to a topic."""

    async def subscribe(self, topic: str) -> None:
        """Subscribe to a topic."""

    async def next_message(
        self,
        topic: str,
        timeout_seconds: float | None = None,
    ) -> PubSubMessage | None:
        """Get next message for a subscribed topic, or None on timeout."""


class StreamAdapter(Protocol):
    """Minimal stream contract for reservation and gate invocation."""

    async def request(
        self,
        peer_id: str,
        protocol_id: str,
        payload: bytes,
        timeout_seconds: float | None = None,
    ) -> bytes:
        """Open a stream, send request bytes, and return response bytes."""


class PeerAdapter(Protocol):
    """Peer-level metadata contract for basic discovery."""

    async def peers(self) -> list[str]:
        """Return currently known peer IDs."""
