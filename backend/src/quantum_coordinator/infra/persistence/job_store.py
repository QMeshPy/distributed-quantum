"""Persistent storage for job lifecycle records."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Protocol

from quantum_coordinator.domain.models import JobStatus
from quantum_coordinator.infra.persistence.migrations import run_sqlite_migrations

UNFINISHED_STATUSES = (
    JobStatus.QUEUED.value,
    JobStatus.COMPILING.value,
    JobStatus.RESERVING.value,
    JobStatus.EXECUTING.value,
)


@dataclass(frozen=True)
class JobRecord:
    """Persistent job metadata and latest lifecycle state."""

    job_id: str
    status: JobStatus
    circuit_text: str
    plan_id: str | None
    error: str | None
    result_json: str | None
    created_at: datetime
    updated_at: datetime


class JobStore(Protocol):
    """Storage operations needed by API lifecycle manager."""

    def upsert(self, record: JobRecord) -> None:
        """Insert or update a job record."""

    def get(self, job_id: str) -> JobRecord | None:
        """Load a job by ID."""

    def list_unfinished(self) -> list[JobRecord]:
        """Load unfinished jobs for restart recovery."""

    def list_recent(
        self,
        *,
        limit: int = 50,
        statuses: tuple[JobStatus, ...] | None = None,
    ) -> list[JobRecord]:
        """Load recent jobs ordered from newest to oldest."""


class SQLiteJobStore:
    """SQLite-backed job lifecycle store."""

    def __init__(self, database_path: str) -> None:
        self._database_path = Path(database_path)
        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        run_sqlite_migrations(database_path)

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self._database_path)

    def upsert(self, record: JobRecord) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO jobs (
                    job_id, status, circuit_text, plan_id,
                    error, result_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    status=excluded.status,
                    circuit_text=excluded.circuit_text,
                    plan_id=excluded.plan_id,
                    error=excluded.error,
                    result_json=excluded.result_json,
                    updated_at=excluded.updated_at
                """,
                (
                    record.job_id,
                    record.status.value,
                    record.circuit_text,
                    record.plan_id,
                    record.error,
                    record.result_json,
                    record.created_at.isoformat(),
                    record.updated_at.isoformat(),
                ),
            )
            conn.commit()

    def get(self, job_id: str) -> JobRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT job_id, status, circuit_text, plan_id,
                       error, result_json, created_at, updated_at
                FROM jobs
                WHERE job_id = ?
                """,
                (job_id,),
            ).fetchone()

        if row is None:
            return None

        return _row_to_record(row)

    def list_unfinished(self) -> list[JobRecord]:
        placeholders = ", ".join("?" for _ in UNFINISHED_STATUSES)
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT job_id, status, circuit_text, plan_id,
                       error, result_json, created_at, updated_at
                FROM jobs
                WHERE status IN ({placeholders})
                ORDER BY created_at ASC
                """,
                UNFINISHED_STATUSES,
            ).fetchall()

        return [_row_to_record(row) for row in rows]

    def list_recent(
        self,
        *,
        limit: int = 50,
        statuses: tuple[JobStatus, ...] | None = None,
    ) -> list[JobRecord]:
        query = """
            SELECT job_id, status, circuit_text, plan_id,
                   error, result_json, created_at, updated_at
            FROM jobs
        """
        params: list[object] = []

        if statuses:
            placeholders = ", ".join("?" for _ in statuses)
            query += f" WHERE status IN ({placeholders})"
            params.extend(status.value for status in statuses)

        query += """
            ORDER BY created_at DESC
            LIMIT ?
        """
        params.append(limit)

        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()

        return [_row_to_record(row) for row in rows]


def _row_to_record(row: tuple[object, ...]) -> JobRecord:
    return JobRecord(
        job_id=str(row[0]),
        status=JobStatus(str(row[1])),
        circuit_text=str(row[2]),
        plan_id=None if row[3] is None else str(row[3]),
        error=None if row[4] is None else str(row[4]),
        result_json=None if row[5] is None else str(row[5]),
        created_at=datetime.fromisoformat(str(row[6])),
        updated_at=datetime.fromisoformat(str(row[7])),
    )
