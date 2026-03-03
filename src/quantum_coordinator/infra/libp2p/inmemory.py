"""In-memory libp2p-like adapters for local integration tests."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timezone

from quantum_coordinator.infra.libp2p.interfaces import PeerAdapter, PubSubAdapter, PubSubMessage


class InMemoryPubSubBus:
    """Simple in-process pubsub bus keyed by topic and peer."""

    def __init__(self) -> None:
        self._queues: dict[str, dict[str, asyncio.Queue[PubSubMessage]]] = defaultdict(dict)
        self._lock = asyncio.Lock()

    async def subscribe(self, peer_id: str, topic: str) -> None:
        async with self._lock:
            topic_queues = self._queues[topic]
            if peer_id not in topic_queues:
                topic_queues[peer_id] = asyncio.Queue()

    async def publish(self, sender_peer_id: str, topic: str, payload: bytes) -> None:
        async with self._lock:
            subscribers = list(self._queues.get(topic, {}).items())

        for _, queue in subscribers:
            await queue.put(
                PubSubMessage(
                    topic=topic,
                    sender_peer_id=sender_peer_id,
                    payload=payload,
                    received_at=datetime.now(timezone.utc),
                )
            )

    async def next_message(
        self,
        peer_id: str,
        topic: str,
        timeout_seconds: float | None,
    ) -> PubSubMessage | None:
        async with self._lock:
            queue = self._queues.get(topic, {}).get(peer_id)

        if queue is None:
            return None

        try:
            if timeout_seconds is None:
                return await queue.get()
            return await asyncio.wait_for(queue.get(), timeout=timeout_seconds)
        except asyncio.TimeoutError:
            return None


class InMemoryPubSubAdapter(PubSubAdapter):
    """PubSub adapter backed by an in-memory bus."""

    def __init__(self, peer_id: str, bus: InMemoryPubSubBus) -> None:
        self._peer_id = peer_id
        self._bus = bus

    @property
    def peer_id(self) -> str:
        return self._peer_id

    async def publish(self, topic: str, message: bytes) -> None:
        await self._bus.publish(sender_peer_id=self.peer_id, topic=topic, payload=message)

    async def subscribe(self, topic: str) -> None:
        await self._bus.subscribe(peer_id=self.peer_id, topic=topic)

    async def next_message(
        self,
        topic: str,
        timeout_seconds: float | None = None,
    ) -> PubSubMessage | None:
        return await self._bus.next_message(
            peer_id=self.peer_id,
            topic=topic,
            timeout_seconds=timeout_seconds,
        )


class InMemoryPeerAdapter(PeerAdapter):
    """Simple peer adapter over a static peer list."""

    def __init__(self, peer_ids: list[str]) -> None:
        self._peer_ids = list(peer_ids)

    async def peers(self) -> list[str]:
        return list(self._peer_ids)
