"""Persistence adapter for service advertisement snapshots."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Protocol

from quantum_coordinator.service_discovery.advertisement import ServiceAdvertisement


class ServiceRegistryStore(Protocol):
    """Storage interface for persisted service advertisements."""

    def save(self, advertisement: ServiceAdvertisement) -> None:
        """Persist a single advertisement."""

    def load_all(self) -> list[ServiceAdvertisement]:
        """Load all cached advertisements."""


class SQLiteServiceRegistryStore:
    """SQLite-backed storage for registry snapshot persistence."""

    def __init__(self, database_path: str) -> None:
        self._database_path = Path(database_path)
        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self._database_path)

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS service_ads (
                    node_id TEXT NOT NULL,
                    service_type TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (node_id, service_type)
                )
                """
            )
            conn.commit()

    def save(self, advertisement: ServiceAdvertisement) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO service_ads (node_id, service_type, payload, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(node_id, service_type) DO UPDATE SET
                    payload=excluded.payload,
                    updated_at=excluded.updated_at
                """,
                (
                    advertisement.node_id,
                    advertisement.service_type.value,
                    advertisement.model_dump_json(),
                    advertisement.updated_at.isoformat(),
                ),
            )
            conn.commit()

    def load_all(self) -> list[ServiceAdvertisement]:
        with self._connect() as conn:
            cursor = conn.execute("SELECT payload FROM service_ads")
            rows = cursor.fetchall()

        return [ServiceAdvertisement.model_validate_json(row[0]) for row in rows]
