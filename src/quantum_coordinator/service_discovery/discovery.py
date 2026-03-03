"""Service discovery worker using a pubsub adapter."""

from __future__ import annotations

import asyncio
import logging
from contextlib import suppress
from datetime import timedelta

from quantum_coordinator.infra.libp2p import PubSubAdapter
from quantum_coordinator.service_discovery.advertisement import (
    ServiceAdvertisement,
    validate_advertisement_payload,
)
from quantum_coordinator.service_discovery.registry import ServiceRegistry

SERVICE_AD_TOPIC = "/quantum-coordinator/service-ads/v1"


class ServiceDiscovery:
    """Coordinates advertisement publish/subscribe and registry updates."""

    def __init__(
        self,
        pubsub: PubSubAdapter,
        registry: ServiceRegistry,
        refresh_interval: timedelta,
        topic: str = SERVICE_AD_TOPIC,
    ) -> None:
        self._pubsub = pubsub
        self._registry = registry
        self._refresh_interval = refresh_interval
        self._topic = topic
        self._task: asyncio.Task[None] | None = None
        self._logger = logging.getLogger(__name__)

    @property
    def peer_id(self) -> str:
        """Peer ID for this discovery worker."""
        return self._pubsub.peer_id

    async def start(self) -> None:
        """Subscribe to discovery topic and start background processing."""
        await self._pubsub.subscribe(self._topic)
        self._task = asyncio.create_task(self._run(), name=f"service-discovery-{self.peer_id}")

    async def stop(self) -> None:
        """Stop background processing task."""
        if self._task is None:
            return

        self._task.cancel()
        with suppress(asyncio.CancelledError):
            await self._task
        self._task = None

    async def advertise_service(self, advertisement: ServiceAdvertisement) -> None:
        """Publish local advertisement and update local registry."""
        if advertisement.node_id != self.peer_id:
            raise ValueError(
                "Advertisement node_id must match local peer_id "
                f"({advertisement.node_id!r} != {self.peer_id!r})"
            )

        self._registry.upsert(advertisement)
        await self._pubsub.publish(self._topic, advertisement.to_wire_bytes())

    async def _run(self) -> None:
        timeout_seconds = self._refresh_interval.total_seconds()

        while True:
            message = await self._pubsub.next_message(self._topic, timeout_seconds=timeout_seconds)
            if message is None:
                self._registry.prune_stale()
                continue

            if message.sender_peer_id == self.peer_id:
                continue

            advertisement, error = validate_advertisement_payload(message.payload)
            if advertisement is None:
                self._logger.warning(
                    "invalid_service_advertisement",
                    extra={
                        "sender_peer_id": message.sender_peer_id,
                        "error": error,
                    },
                )
                continue

            self._registry.upsert(advertisement, received_at=message.received_at)
