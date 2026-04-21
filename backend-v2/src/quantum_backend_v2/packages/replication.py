"""Swarm placement and replication metadata for service packages."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PlacementStrategy(str, Enum):
    """How the platform distributes a package across the swarm."""

    RAREST_FIRST = "rarest_first"
    LOCALITY_AWARE = "locality_aware"
    SUPER_SEED = "super_seed"
    BROADCAST = "broadcast"


class SwarmPlacementMeta(BaseModel):
    """Swarm placement metadata attached to a published service package."""

    model_config = ConfigDict(extra="forbid")

    package_id: str = Field(min_length=3)
    strategy: PlacementStrategy = PlacementStrategy.RAREST_FIRST
    desired_seeders: int = Field(default=3, ge=1)
    current_seeders: tuple[str, ...] = Field(default_factory=tuple)
    locality_hints: tuple[str, ...] = Field(default_factory=tuple)
    total_chunks: int = Field(default=1, ge=1)
    chunk_availability: dict[str, int] = Field(default_factory=dict)
    last_replication_at: datetime | None = None
    updated_at: datetime = Field(default_factory=_utc_now)

    @property
    def seeder_count(self) -> int:
        return len(self.current_seeders)

    @property
    def is_sufficiently_seeded(self) -> bool:
        return self.seeder_count >= self.desired_seeders

    @property
    def rarest_chunk_index(self) -> int | None:
        if not self.chunk_availability:
            return None
        return min(self.chunk_availability, key=lambda k: self.chunk_availability[k], default=None)

    def with_new_seeder(self, peer_id: str) -> "SwarmPlacementMeta":
        if peer_id in self.current_seeders:
            return self
        return self.model_copy(
            update={
                "current_seeders": self.current_seeders + (peer_id,),
                "updated_at": _utc_now(),
            }
        )

    def with_chunk_seen(self, chunk_index: int, peer_id: str) -> "SwarmPlacementMeta":
        updated_availability = dict(self.chunk_availability)
        key = str(chunk_index)
        updated_availability[key] = updated_availability.get(key, 0) + 1
        return self.model_copy(
            update={"chunk_availability": updated_availability, "updated_at": _utc_now()}
        )


class PackageApprovalRecord(BaseModel):
    """Control-plane approval record for a peer-published service package."""

    model_config = ConfigDict(extra="forbid")

    package_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    version: str = Field(min_length=3)
    publisher_peer_id: str = Field(min_length=3)
    approval_status: str = Field(default="pending", min_length=3)
    reviewed_by: str | None = None
    review_notes: str | None = Field(default=None, max_length=600)
    manifest_digest: str = Field(min_length=32)
    submitted_at: datetime = Field(default_factory=_utc_now)
    reviewed_at: datetime | None = None
