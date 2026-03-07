"""Concrete py-libp2p adapters for pubsub, peers, and request streams.

This module follows the official py-libp2p examples:
- create hosts with ``new_host``
- use ``Pubsub`` + ``GossipSub`` for topic messaging
- run services with ``background_trio_service``
"""

from __future__ import annotations

import importlib
from collections.abc import Awaitable, Callable, Sequence
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import sniffio

from quantum_coordinator.infra.libp2p.interfaces import (
    PeerAdapter,
    PubSubAdapter,
    PubSubMessage,
    StreamAdapter,
)


def create_libp2p_host(
    listen_addrs: Sequence[str],
    *,
    enable_mdns: bool = False,
    bootstrap: Sequence[str] | None = None,
) -> Any:
    """Create a py-libp2p host with explicit listen addresses."""
    from libp2p import new_host

    multi_addrs = tuple(_to_multiaddr(addr) for addr in listen_addrs)
    host = new_host(
        enable_mDNS=enable_mdns,
        bootstrap=list(bootstrap) if bootstrap else None,
    )
    host._quantum_listen_addrs = multi_addrs  # type: ignore[attr-defined]
    return host


def create_gossipsub(
    host: Any,
    *,
    degree: int = 6,
    degree_low: int = 4,
    degree_high: int = 12,
) -> Any:
    """Create a GossipSub-backed PubSub service bound to ``host``."""
    from libp2p.custom_types import TProtocol
    from libp2p.pubsub.gossipsub import GossipSub
    from libp2p.pubsub.pubsub import Pubsub

    protocols = (
        TProtocol("/meshsub/1.1.0"),
        TProtocol("/meshsub/1.0.0"),
    )
    router = GossipSub(
        protocols=protocols,
        degree=degree,
        degree_low=degree_low,
        degree_high=degree_high,
    )
    return Pubsub(host, router)


@asynccontextmanager
async def run_libp2p_services(host: Any, pubsub: Any) -> Any:
    """Run host + pubsub services for the duration of the context.

    py-libp2p services are Trio-native; this context must run in a Trio backend.
    Uses nested async with (no AsyncExitStack) so Trio cancel scopes nest correctly.
    """
    _ensure_trio_backend()
    from libp2p.tools.async_service.trio_service import background_trio_service

    listen_addrs = getattr(host, "_quantum_listen_addrs", None)
    if listen_addrs is None:
        listen_addrs = tuple(host.get_transport_addrs())
    router = getattr(pubsub, "router", None)

    import trio

    async with host.run(listen_addrs):
        if router is not None:
            async with background_trio_service(router):
                async with background_trio_service(pubsub):
                    await _wait_for_host_listen_addrs(host)
                    with trio.move_on_after(2.0):
                        await pubsub.wait_until_ready()
                    await trio.sleep(0.2)
                    yield
        else:
            async with background_trio_service(pubsub):
                await _wait_for_host_listen_addrs(host)
                with trio.move_on_after(2.0):
                    await pubsub.wait_until_ready()
                await trio.sleep(0.2)
                yield


@dataclass(frozen=True)
class PyLibp2pNode:
    """Convenience bundle of a real libp2p node and adapter facades."""

    host: Any
    pubsub: Any
    pubsub_adapter: PyLibp2pPubSubAdapter
    peer_adapter: PyLibp2pPeerAdapter
    stream_adapter: PyLibp2pStreamAdapter

    @property
    def peer_id(self) -> str:
        return str(self.host.get_id())

    def listen_addrs(self) -> tuple[str, ...]:
        addrs = tuple(str(addr) for addr in self.host.get_addrs())
        if addrs:
            return addrs

        configured = tuple(str(addr) for addr in getattr(self.host, "_quantum_listen_addrs", ()))
        if not configured:
            return ()

        peer_suffix = f"/p2p/{self.peer_id}"
        return tuple(
            addr if addr.endswith(peer_suffix) else f"{addr}{peer_suffix}"
            for addr in configured
        )


def build_libp2p_node(
    listen_addrs: Sequence[str],
    *,
    enable_mdns: bool = False,
    bootstrap: Sequence[str] | None = None,
) -> PyLibp2pNode:
    """Build host + pubsub services and wrap them in project adapters."""
    host = create_libp2p_host(
        listen_addrs=listen_addrs,
        enable_mdns=enable_mdns,
        bootstrap=bootstrap,
    )
    pubsub = create_gossipsub(host)
    return PyLibp2pNode(
        host=host,
        pubsub=pubsub,
        pubsub_adapter=PyLibp2pPubSubAdapter(host=host, pubsub=pubsub),
        peer_adapter=PyLibp2pPeerAdapter(host=host),
        stream_adapter=PyLibp2pStreamAdapter(host=host),
    )


class PyLibp2pPubSubAdapter(PubSubAdapter):
    """PubSub adapter backed by py-libp2p GossipSub."""

    def __init__(self, host: Any, pubsub: Any) -> None:
        self._host = host
        self._pubsub = pubsub
        self._subscriptions: dict[str, Any] = {}

    @property
    def peer_id(self) -> str:
        return str(self._host.get_id())

    async def publish(self, topic: str, message: bytes) -> None:
        _ensure_trio_backend()
        await self._pubsub.publish(topic, message)

    async def subscribe(self, topic: str) -> None:
        _ensure_trio_backend()
        if topic in self._subscriptions:
            return
        self._subscriptions[topic] = await self._pubsub.subscribe(topic)

    async def unsubscribe(self, topic: str) -> None:
        """Unsubscribe from topic if currently subscribed."""
        _ensure_trio_backend()
        subscription = self._subscriptions.pop(topic, None)
        if subscription is None:
            return
        await subscription.unsubscribe()

    async def next_message(
        self,
        topic: str,
        timeout_seconds: float | None = None,
    ) -> PubSubMessage | None:
        _ensure_trio_backend()
        subscription = self._subscriptions.get(topic)
        if subscription is None:
            return None

        raw_message = await _next_subscription_message(subscription, timeout_seconds)
        if raw_message is None:
            return None

        sender_raw = getattr(raw_message, "from_id", b"")
        topic_ids = tuple(getattr(raw_message, "topicIDs", ()))
        message_topic = str(topic_ids[0]) if topic_ids else topic
        return PubSubMessage(
            topic=message_topic,
            sender_peer_id=_decode_sender_peer_id(sender_raw),
            payload=bytes(getattr(raw_message, "data", b"")),
            received_at=datetime.now(timezone.utc),
        )


class PyLibp2pPeerAdapter(PeerAdapter):
    """Peer adapter using current host connections."""

    def __init__(self, host: Any) -> None:
        self._host = host

    async def peers(self) -> list[str]:
        _ensure_trio_backend()
        return [str(peer_id) for peer_id in self._host.get_connected_peers()]


class PyLibp2pStreamAdapter(StreamAdapter):
    """Request/response stream adapter using py-libp2p streams."""

    def __init__(self, host: Any) -> None:
        self._host = host

    async def connect_to_peer(self, peer_addr: str) -> None:
        """Connect host to a remote peer from full p2p multiaddr string."""
        _ensure_trio_backend()
        from libp2p.peer.peerinfo import info_from_p2p_addr

        info = info_from_p2p_addr(_to_multiaddr(peer_addr))
        if info.peer_id in self._host.get_connected_peers():
            return
        await self._host.connect(info)

    async def request(self, peer_id: str, protocol_id: str, payload: bytes) -> bytes:
        """Send a request to peer over ``protocol_id`` and return raw bytes response."""
        _ensure_trio_backend()
        from libp2p.peer.id import ID

        target = ID.from_string(peer_id)
        stream = await self._host.new_stream(target, [protocol_id])
        try:
            await stream.write(payload)
            response = await stream.read()
            return bytes(response)
        finally:
            with suppress(Exception):
                await stream.close()

    def set_request_handler(
        self,
        protocol_id: str,
        handler: Callable[[bytes], Awaitable[bytes]],
    ) -> None:
        """Register a request handler for ``protocol_id``."""

        async def stream_handler(stream: Any) -> None:
            try:
                data = await stream.read()
                response = await handler(data)
                await stream.write(response)
            except Exception:
                with suppress(Exception):
                    await stream.reset()
                raise
            finally:
                with suppress(Exception):
                    await stream.close()

        self._host.set_stream_handler(protocol_id, stream_handler)


def _ensure_trio_backend() -> None:
    backend = sniffio.current_async_library()
    if backend != "trio":
        raise RuntimeError(
            "py-libp2p adapter requires Trio backend. "
            "Run under Trio (for example: trio.run(...))."
        )


async def _next_subscription_message(
    subscription: Any,
    timeout_seconds: float | None,
) -> Any | None:
    import trio

    if timeout_seconds is None:
        return await subscription.get()

    with trio.move_on_after(timeout_seconds):
        return await subscription.get()
    return None


def _decode_sender_peer_id(raw_sender: bytes) -> str:
    if not raw_sender:
        return "unknown"

    from libp2p.peer.id import ID

    try:
        return ID(raw_sender).to_base58()
    except Exception:
        return raw_sender.hex()


def _to_multiaddr(raw: str) -> Any:
    multiaddr_module = importlib.import_module("multiaddr")
    multiaddr_cls = multiaddr_module.Multiaddr
    return multiaddr_cls(raw)


async def _wait_for_host_listen_addrs(
    host: Any,
    attempts: int = 100,
    delay_seconds: float = 0.1,
) -> None:
    import trio

    for _ in range(attempts):
        if host.get_addrs():
            return
        await trio.sleep(delay_seconds)

    listen_addrs = tuple(str(addr) for addr in getattr(host, "_quantum_listen_addrs", ()))
    raise RuntimeError(f"Host failed to expose listen addresses for {listen_addrs!r}")
