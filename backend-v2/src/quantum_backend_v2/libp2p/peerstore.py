"""Project-local libp2p peerstore compatibility layer.

The current upstream py-libp2p SQLite peerstore persists signed peer records
using a placeholder serializer that only stores an enum, which means those rows
cannot be deserialized into real Envelopes on the next process start.  We keep
using the upstream datastore and peerstore implementation, but replace just the
peer-record persistence path with a real on-disk format that stores:

1. a format marker
2. the peer record sequence number
3. the fully serialized signed Envelope
"""

from __future__ import annotations

import logging
import struct
from pathlib import Path

from libp2p.peer.envelope import unmarshal_envelope
from libp2p.peer.id import ID
from libp2p.peer.peerstore import PeerRecordState, PeerStoreError
from libp2p.peer.persistent.datastore import SQLiteDatastoreSync
from libp2p.peer.persistent.sync.peerstore import SyncPersistentPeerStore

logger = logging.getLogger(__name__)

_PEER_RECORD_MAGIC = b"qb2-peer-record-v1\x00"
_SEQ_PACK_FORMAT = ">Q"
_SEQ_PACK_SIZE = struct.calcsize(_SEQ_PACK_FORMAT)


class CompatibleSyncPersistentPeerStore(SyncPersistentPeerStore):
    """SQLite peerstore with real signed peer-record persistence."""

    def _load_peer_record(self, peer_id: ID) -> PeerRecordState | None:
        with self._lock:
            if peer_id not in self.peer_record_map:
                record_key = self._get_peer_record_key(peer_id)
                record_data = self.datastore.get(record_key)
                if record_data:
                    try:
                        record_state = _deserialize_peer_record_state(record_data)
                    except ValueError as exc:
                        logger.warning(
                            "purging unreadable peer record for %s: %s",
                            peer_id,
                            exc,
                        )
                        self.datastore.delete(record_key)
                        self.datastore.sync(b"")
                    else:
                        self.peer_record_map[peer_id] = record_state
                        return record_state
            return self.peer_record_map.get(peer_id)

    def _save_peer_record(self, peer_id: ID, record_state: PeerRecordState) -> None:
        try:
            record_key = self._get_peer_record_key(peer_id)
            record_data = _serialize_peer_record_state(record_state)
            self.datastore.put(record_key, record_data)
            self.peer_record_map[peer_id] = record_state
            self._maybe_sync()
        except Exception as exc:
            raise PeerStoreError(f"Failed to save peer record for {peer_id}") from exc


def create_compatible_sync_sqlite_peerstore(
    db_path: str | Path,
    max_records: int = 10000,
    sync_interval: float = 1.0,
    auto_sync: bool = True,
) -> CompatibleSyncPersistentPeerStore:
    """Create a SQLite-backed peerstore with working peer-record persistence."""
    datastore = SQLiteDatastoreSync(db_path)
    return CompatibleSyncPersistentPeerStore(
        datastore=datastore,
        max_records=max_records,
        sync_interval=sync_interval,
        auto_sync=auto_sync,
    )


def _serialize_peer_record_state(state: PeerRecordState) -> bytes:
    envelope_bytes = state.envelope.marshal_envelope()
    return _PEER_RECORD_MAGIC + struct.pack(_SEQ_PACK_FORMAT, state.seq) + envelope_bytes


def _deserialize_peer_record_state(data: bytes) -> PeerRecordState:
    if not data.startswith(_PEER_RECORD_MAGIC):
        raise ValueError("legacy peer record format does not contain a signed envelope")

    prefix_end = len(_PEER_RECORD_MAGIC) + _SEQ_PACK_SIZE
    if len(data) <= prefix_end:
        raise ValueError("peer record payload is truncated")

    seq = struct.unpack(_SEQ_PACK_FORMAT, data[len(_PEER_RECORD_MAGIC) : prefix_end])[0]
    envelope = unmarshal_envelope(data[prefix_end:])
    record = envelope.record()
    if record.seq != seq:
        raise ValueError(f"peer record sequence mismatch (stored={seq}, envelope={record.seq})")
    return PeerRecordState(envelope, seq)
