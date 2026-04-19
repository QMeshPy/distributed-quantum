"""GossipSub pubsub factory for peer-discovery transport."""

from __future__ import annotations

from libp2p.abc import IHost
from libp2p.custom_types import TProtocol
from libp2p.pubsub.gossipsub import GossipSub
from libp2p.pubsub.pubsub import Pubsub

GOSSIPSUB_PROTOCOL_ID = TProtocol("/meshsub/1.0.0")

_DEFAULT_DEGREE = 3
_DEFAULT_DEGREE_LOW = 2
_DEFAULT_DEGREE_HIGH = 4
_DEFAULT_TTL = 300


def create_gossipsub_pubsub(
    host: IHost,
    *,
    heartbeat_interval: int = 60,
    degree: int = _DEFAULT_DEGREE,
    degree_low: int = _DEFAULT_DEGREE_LOW,
    degree_high: int = _DEFAULT_DEGREE_HIGH,
) -> tuple[GossipSub, Pubsub]:
    """Create a GossipSub router and a Pubsub instance wired to the host.

    The returned objects must be started inside a trio context using
    ``background_trio_service`` before they are usable.
    """
    gossipsub = GossipSub(
        protocols=[GOSSIPSUB_PROTOCOL_ID],
        degree=degree,
        degree_low=degree_low,
        degree_high=degree_high,
        time_to_live=_DEFAULT_TTL,
        heartbeat_initial_delay=2.0,
        heartbeat_interval=heartbeat_interval,
    )
    pubsub = Pubsub(host, gossipsub)
    return gossipsub, pubsub
