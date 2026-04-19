from __future__ import annotations

import hashlib
from unittest.mock import MagicMock

from libp2p import create_new_ed25519_key_pair
from libp2p.peer.id import ID
from libp2p.peer.peerstore import create_signed_peer_record
from multiaddr import Multiaddr

from quantum_backend_v2.config.models import Libp2pSettings
from quantum_backend_v2.libp2p.addressing import resolve_advertised_network_addresses
from quantum_backend_v2.libp2p.peerstore import create_compatible_sync_sqlite_peerstore


def _keypair_for(label: str):
    seed = hashlib.sha256(label.encode("utf-8")).digest()
    return create_new_ed25519_key_pair(seed=seed)


def test_compatible_peerstore_round_trips_signed_peer_record(tmp_path) -> None:
    path = tmp_path / "peerstore.sqlite3"
    key_pair = _keypair_for("peer-alpha")
    peer_id = ID.from_pubkey(key_pair.public_key)
    envelope = create_signed_peer_record(
        peer_id,
        [Multiaddr("/ip4/127.0.0.1/tcp/4011")],
        key_pair.private_key,
    )

    store = create_compatible_sync_sqlite_peerstore(path)
    assert store.consume_peer_record(envelope, ttl=60) is True

    reloaded = create_compatible_sync_sqlite_peerstore(path)
    loaded = reloaded.get_peer_record(peer_id)

    assert loaded is not None
    assert loaded.marshal_envelope() == envelope.marshal_envelope()
    assert loaded.record().seq == envelope.record().seq


def test_compatible_peerstore_purges_legacy_record_state_rows(tmp_path) -> None:
    path = tmp_path / "peerstore.sqlite3"
    key_pair = _keypair_for("peer-beta")
    peer_id = ID.from_pubkey(key_pair.public_key)

    store = create_compatible_sync_sqlite_peerstore(path)
    record_key = store._get_peer_record_key(peer_id)
    store.datastore.put(record_key, b"\x08\x01")

    reloaded = create_compatible_sync_sqlite_peerstore(path)
    assert reloaded._load_peer_record(peer_id) is None
    assert reloaded.datastore.get(record_key) is None


def test_embedded_dev_swarm_advertises_loopback_addrs() -> None:
    settings = Libp2pSettings(
        peer_id="qb2-dev-peer",
        listen_multiaddrs=("/ip4/0.0.0.0/tcp/4011",),
        dev_service_peer_count=4,
    )
    host = MagicMock()
    host.get_addrs.return_value = [Multiaddr("/ip4/0.0.0.0/tcp/4011")]

    assert resolve_advertised_network_addresses(host, settings) == ("/ip4/127.0.0.1/tcp/4011",)
