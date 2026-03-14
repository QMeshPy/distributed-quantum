"""Versioned SQLite schema migrations."""

from __future__ import annotations

import sqlite3
from pathlib import Path

MIGRATIONS: tuple[tuple[int, str], ...] = (
    (
        1,
        """
        CREATE TABLE IF NOT EXISTS jobs (
            job_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            circuit_text TEXT NOT NULL,
            plan_id TEXT,
            error TEXT,
            result_json TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS service_ads (
            node_id TEXT NOT NULL,
            service_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (node_id, service_type)
        );

        CREATE TABLE IF NOT EXISTS reservations (
            reservation_id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            fragment_id TEXT NOT NULL,
            node_id TEXT NOT NULL,
            service_type TEXT NOT NULL,
            min_fidelity REAL NOT NULL,
            window_start TEXT NOT NULL,
            window_end TEXT NOT NULL,
            state TEXT NOT NULL,
            reason TEXT,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS fragment_execution_events (
            event_id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            fragment_id TEXT NOT NULL,
            node_id TEXT NOT NULL,
            attempt INTEGER NOT NULL,
            status TEXT NOT NULL,
            error TEXT,
            observed_fidelity REAL,
            created_at TEXT NOT NULL
        );
        """,
    ),
)


def run_sqlite_migrations(database_path: str) -> None:
    """Apply pending schema migrations."""
    path = Path(database_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        rows = conn.execute("SELECT version FROM schema_migrations").fetchall()
        applied_versions = {int(row[0]) for row in rows}

        for version, sql in MIGRATIONS:
            if version in applied_versions:
                continue
            conn.executescript(sql)
            conn.execute(
                "INSERT INTO schema_migrations(version) VALUES (?)",
                (version,),
            )

        conn.commit()
