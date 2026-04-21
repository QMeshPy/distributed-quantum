"""Package manifest and publication protocol wire schemas."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PackageApprovalStatus(str, Enum):
    """Policy approval states for a peer-published service package."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    QUARANTINED = "quarantined"
    REVOKED = "revoked"


class PackageInstallStatus(str, Enum):
    """Local installation state on a peer."""

    FETCHING = "fetching"
    VERIFYING = "verifying"
    INSTALLED = "installed"
    FAILED = "failed"
    SEEDING = "seeding"


class PackageManifestAnnouncement(BaseModel):
    """Pubsub message announcing a new approved package into the network."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    package_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    version: str = Field(min_length=3)
    publisher_peer_id: str = Field(min_length=3)
    manifest_digest: str = Field(min_length=32)
    approval_status: PackageApprovalStatus
    seeder_peers: tuple[str, ...] = Field(default_factory=tuple)
    size_bytes: int = Field(default=0, ge=0)
    announced_at: datetime = Field(default_factory=_utc_now)


class PackageFetchRequest(BaseModel):
    """Peer requests a package or chunk from a seeder peer."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    package_id: str = Field(min_length=3)
    requesting_peer_id: str = Field(min_length=3)
    chunk_indices: tuple[int, ...] = Field(default_factory=tuple)
    sent_at: datetime = Field(default_factory=_utc_now)


class PackageInstallReport(BaseModel):
    """Peer reports local install outcome for a package."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    package_id: str = Field(min_length=3)
    installing_peer_id: str = Field(min_length=3)
    status: PackageInstallStatus
    verified_digest: str | None = Field(default=None, min_length=32)
    error_detail: str | None = Field(default=None, max_length=300)
    reported_at: datetime = Field(default_factory=_utc_now)


class PackageSeedAnnouncement(BaseModel):
    """Peer announces that it is now seeding a package (post-install)."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    package_id: str = Field(min_length=3)
    seeding_peer_id: str = Field(min_length=3)
    chunks_available: int = Field(ge=0)
    announced_at: datetime = Field(default_factory=_utc_now)
