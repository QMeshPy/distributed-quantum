"""Persistence-facing models for backend v2."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc)


class PersistenceMode(str, Enum):
    """Readiness state for a persistence subsystem."""

    CONFIGURED = "configured"
    NOT_CONFIGURED = "not_configured"
    READY = "ready"
    UNAVAILABLE = "unavailable"


class PeerLogEventType(str, Enum):
    """Append-only peer log categories required by the migration brief."""

    PROTOCOL_RECEIVED = "protocol.received"
    RESERVATION_TRANSITION = "reservation.transition"
    EXECUTION_TRANSITION = "execution.transition"
    PACKAGE_INSTALL = "package.install"
    PEER_SYNC_CHECKPOINT = "peer.sync_checkpoint"


class DatabaseReadiness(BaseModel):
    """Runtime status for a database-backed subsystem."""

    model_config = ConfigDict(extra="forbid")

    backend: str = Field(min_length=1)
    target: str = Field(min_length=1)
    mode: PersistenceMode
    database: str = Field(min_length=1)
    configured: bool
    reachable: bool
    message: str | None = None


class LocalPeerLogReadiness(BaseModel):
    """Runtime status for the append-only peer log."""

    model_config = ConfigDict(extra="forbid")

    mode: PersistenceMode
    peer_id: str = Field(min_length=1)
    path: str = Field(min_length=1)
    writable: bool
    event_count: int = Field(ge=0)
    message: str | None = None


class PersistenceReadiness(BaseModel):
    """Composite health view for the configured persistence topology."""

    model_config = ConfigDict(extra="forbid")

    postgres: DatabaseReadiness
    mongodb: DatabaseReadiness
    peer_log: LocalPeerLogReadiness


class PeerLogRecord(BaseModel):
    """Durable append-only peer event."""

    model_config = ConfigDict(extra="forbid")

    event_id: str = Field(min_length=1)
    event_type: PeerLogEventType
    aggregate_id: str = Field(min_length=1)
    sequence: int = Field(ge=0)
    occurred_at: datetime = Field(default_factory=_utc_now)
    producer_peer_id: str = Field(min_length=1)
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("occurred_at")
    @classmethod
    def _ensure_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("occurred_at must be timezone-aware")
        return value.astimezone(timezone.utc)
