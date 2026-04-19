"""Internal event types for the trio→asyncio discovery bridge.

Events flow from the trio network thread through a ``queue.SimpleQueue``
into the asyncio drain loop inside ``DiscoveryService``.  The queue is the
only shared data structure between the two runtimes; all other state lives
exclusively in one or the other.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum


class DiscoveryEventKind(str, Enum):
    """Discriminator for events received over libp2p pubsub topics."""

    ADVERTISEMENT = "advertisement"
    HEARTBEAT = "heartbeat"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class DiscoveryEvent:
    """An opaque event received from a GossipSub topic.

    ``raw_payload`` is the raw bytes from the pubsub message.  The asyncio
    drain loop deserialises it against the appropriate Pydantic model once it
    is safely back on the asyncio side.
    """

    kind: DiscoveryEventKind
    raw_payload: bytes
    received_at: datetime
