"""Persistence for reservation records and fragment execution events."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Protocol

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.infra.persistence.migrations import run_sqlite_migrations
from quantum_coordinator.reservation.models import ReservationRecord, ReservationState


@dataclass(frozen=True)
class FragmentExecutionEvent:
    """Persistable runtime event for a fragment execution attempt."""

    event_id: str
    job_id: str
    fragment_id: str
    node_id: str
    attempt: int
    status: str
    error: str | None
    observed_fidelity: float | None
    created_at: datetime


class RuntimeEventStore(Protocol):
    """Storage operations used by reservation/runtime components."""

    def upsert_reservation(self, record: ReservationRecord) -> None:
        """Persist reservation state."""

    def append_fragment_event(self, event: FragmentExecutionEvent) -> None:
        """Persist runtime attempt event."""

    def get_reservation(self, reservation_id: str) -> ReservationRecord | None:
        """Get reservation by id."""

    def list_fragment_events(self, job_id: str) -> list[FragmentExecutionEvent]:
        """List fragment events for a job."""


class SQLiteRuntimeEventStore:
    """SQLite-backed implementation for runtime events and reservations."""

    def __init__(self, database_path: str) -> None:
        self._database_path = Path(database_path)
        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        run_sqlite_migrations(database_path)

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self._database_path)

    def upsert_reservation(self, record: ReservationRecord) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO reservations (
                    reservation_id, job_id, fragment_id, node_id,
                    service_type, min_fidelity, window_start, window_end,
                    state, reason, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(reservation_id) DO UPDATE SET
                    state=excluded.state,
                    reason=excluded.reason,
                    updated_at=excluded.updated_at,
                    window_start=excluded.window_start,
                    window_end=excluded.window_end,
                    min_fidelity=excluded.min_fidelity,
                    node_id=excluded.node_id
                """,
                (
                    record.reservation_id,
                    record.job_id,
                    record.fragment_id,
                    record.node_id,
                    record.service_type.value,
                    record.min_fidelity,
                    record.window_start.isoformat(),
                    record.window_end.isoformat(),
                    record.state.value,
                    record.reason,
                    record.updated_at.isoformat(),
                ),
            )
            conn.commit()

    def append_fragment_event(self, event: FragmentExecutionEvent) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO fragment_execution_events (
                    event_id, job_id, fragment_id, node_id,
                    attempt, status, error, observed_fidelity, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event.event_id,
                    event.job_id,
                    event.fragment_id,
                    event.node_id,
                    event.attempt,
                    event.status,
                    event.error,
                    event.observed_fidelity,
                    event.created_at.isoformat(),
                ),
            )
            conn.commit()

    def get_reservation(self, reservation_id: str) -> ReservationRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT reservation_id, job_id, fragment_id, node_id, service_type,
                       min_fidelity, window_start, window_end, state, reason, updated_at
                FROM reservations
                WHERE reservation_id = ?
                """,
                (reservation_id,),
            ).fetchone()

        if row is None:
            return None

        return ReservationRecord(
            reservation_id=row[0],
            job_id=row[1],
            fragment_id=row[2],
            node_id=row[3],
            service_type=GateType(row[4]),
            min_fidelity=float(row[5]),
            window_start=datetime.fromisoformat(row[6]),
            window_end=datetime.fromisoformat(row[7]),
            state=ReservationState(row[8]),
            reason=row[9],
            updated_at=datetime.fromisoformat(row[10]),
        )

    def list_fragment_events(self, job_id: str) -> list[FragmentExecutionEvent]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT event_id, job_id, fragment_id, node_id,
                       attempt, status, error, observed_fidelity, created_at
                FROM fragment_execution_events
                WHERE job_id = ?
                ORDER BY created_at ASC
                """,
                (job_id,),
            ).fetchall()

        return [
            FragmentExecutionEvent(
                event_id=row[0],
                job_id=row[1],
                fragment_id=row[2],
                node_id=row[3],
                attempt=int(row[4]),
                status=row[5],
                error=row[6],
                observed_fidelity=None if row[7] is None else float(row[7]),
                created_at=datetime.fromisoformat(row[8]),
            )
            for row in rows
        ]
