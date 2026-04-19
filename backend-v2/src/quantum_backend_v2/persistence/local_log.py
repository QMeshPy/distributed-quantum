"""Append-only durable local peer log support."""

from __future__ import annotations

import json
import os
from pathlib import Path

from quantum_backend_v2.persistence.models import (
    LocalPeerLogReadiness,
    PeerLogRecord,
    PersistenceMode,
)


class LocalPeerLogStore:
    """Filesystem-backed append-only peer event log."""

    def __init__(
        self,
        *,
        base_directory: Path,
        peer_id: str,
        namespace: str = "peer-events",
        fsync: bool = True,
    ) -> None:
        self._base_directory = base_directory
        self._peer_id = peer_id
        self._namespace = namespace
        self._fsync = fsync

    @property
    def path(self) -> Path:
        """Resolved JSONL path for this peer log."""
        return self._base_directory / self._peer_id / f"{self._namespace}.jsonl"

    def append(self, record: PeerLogRecord) -> None:
        """Append a single durable event to the peer log."""
        path = self.ensure_exists()
        payload = json.dumps(record.model_dump(mode="json"), sort_keys=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(payload)
            handle.write("\n")
            handle.flush()
            if self._fsync:
                os.fsync(handle.fileno())

    def read_all(self) -> list[PeerLogRecord]:
        """Replay the full peer log from disk."""
        path = self.ensure_exists()
        records: list[PeerLogRecord] = []
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                payload = line.strip()
                if not payload:
                    continue
                records.append(PeerLogRecord.model_validate_json(payload))
        return records

    def readiness(self) -> LocalPeerLogReadiness:
        """Inspect the peer log path without making it a source of truth."""
        path = self.ensure_exists()
        return LocalPeerLogReadiness(
            mode=PersistenceMode.READY,
            peer_id=self._peer_id,
            path=str(path),
            writable=os.access(path, os.W_OK),
            event_count=_count_lines(path),
            message=None,
        )

    def ensure_exists(self) -> Path:
        """Create the parent directory and log file if missing."""
        path = self.path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch(exist_ok=True)
        return path


def _count_lines(path: Path) -> int:
    with path.open("r", encoding="utf-8") as handle:
        return sum(1 for _ in handle)
