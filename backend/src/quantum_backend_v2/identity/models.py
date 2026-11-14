"""Identity domain models — users, orgs, projects, tokens, API keys, trust tiers."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(str, Enum):
    """Platform-level user roles."""

    ADMIN = "admin"
    OPERATOR = "operator"
    DEVELOPER = "developer"
    VIEWER = "viewer"


class PeerTrustTier(str, Enum):
    """Trust classification for enrolled peers.

    PLATFORM_MANAGED — operated by the core team, fully trusted.
    ORG_MANAGED      — operated by a verified organization.
    USER_CONTRIBUTED — contributed by an authenticated user.
    PUBLIC_UNTRUSTED — unknown origin, sandboxed execution only.
    QUARANTINED      — suspended pending review.
    """

    PLATFORM_MANAGED = "platform_managed"
    ORG_MANAGED = "org_managed"
    USER_CONTRIBUTED = "user_contributed"
    PUBLIC_UNTRUSTED = "public_untrusted"
    QUARANTINED = "quarantined"


class UserTokenClaims(BaseModel):
    """Validated claims extracted from a user bearer token."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    user_id: str = Field(min_length=3)
    external_subject: str = Field(min_length=3)
    email: str = Field(min_length=5)
    roles: frozenset[UserRole] = Field(default_factory=frozenset)
    org_ids: frozenset[str] = Field(default_factory=frozenset)
    issued_at: datetime
    expires_at: datetime
    # Primary SIWE wallet, only from a signed frontend assertion.
    wallet_address: str | None = Field(default=None, pattern=r"^0x[0-9a-fA-F]{40}$")

    def has_role(self, role: UserRole) -> bool:
        return role in self.roles

    def is_admin(self) -> bool:
        return UserRole.ADMIN in self.roles


class Organization(BaseModel):
    """Platform organization record."""

    model_config = ConfigDict(extra="forbid")

    org_id: str = Field(min_length=3)
    display_name: str = Field(min_length=1, max_length=120)
    slug: str = Field(min_length=3, max_length=60, pattern=r"^[a-z0-9\-]+$")
    owner_user_id: str = Field(min_length=3)
    is_active: bool = True
    created_at: datetime = Field(default_factory=_utc_now)


class Project(BaseModel):
    """Project scoped within an organization."""

    model_config = ConfigDict(extra="forbid")

    project_id: str = Field(min_length=3)
    org_id: str = Field(min_length=3)
    display_name: str = Field(min_length=1, max_length=120)
    slug: str = Field(min_length=3, max_length=60, pattern=r"^[a-z0-9\-]+$")
    owner_user_id: str = Field(min_length=3)
    is_active: bool = True
    created_at: datetime = Field(default_factory=_utc_now)


class ApiKey(BaseModel):
    """API key record for programmatic access."""

    model_config = ConfigDict(extra="forbid")

    key_id: str = Field(min_length=3)
    user_id: str = Field(min_length=3)
    org_id: str | None = None
    project_id: str | None = None
    display_name: str = Field(min_length=1, max_length=80)
    key_prefix: str = Field(min_length=4, max_length=12)
    hashed_secret: str = Field(min_length=32)
    roles: frozenset[UserRole] = Field(default_factory=frozenset)
    is_active: bool = True
    expires_at: datetime | None = None
    created_at: datetime = Field(default_factory=_utc_now)

    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        return datetime.now(timezone.utc) > self.expires_at
