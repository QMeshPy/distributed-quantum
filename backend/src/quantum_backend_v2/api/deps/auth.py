"""Auth dependency model for FastAPI route handlers.

In the current phase this provides a structured dependency surface with
pluggable validation logic.  Production implementations swap in JWT
verification or API-key lookup without changing route signatures.

Dev bypass
----------
Set ``QB2_AUTH_REQUIRED=false`` (or call ``configure_auth(enabled=False)``) to
disable auth enforcement entirely.  Every request is treated as if it were made
by a local dev user with ADMIN rights so all endpoints are reachable without a
token.  This mode must **never** be enabled in production.
"""

from __future__ import annotations

import logging
import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, Header, status

from quantum_backend_v2.api.errors.models import ErrorCode, PlatformException
from quantum_backend_v2.identity.models import PeerTrustTier, UserRole, UserTokenClaims

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level auth switch — set once at app startup via configure_auth().
# ---------------------------------------------------------------------------

_auth_required: bool = True
_allow_dev_bearer_tokens: bool = False


def configure_auth(*, enabled: bool, allow_dev_bearer_tokens: bool = False) -> None:
    """Toggle auth enforcement for the lifetime of the process.

    Call this early in ``create_app()`` based on the ``QB2_AUTH_REQUIRED``
    setting.  Should not be called after the application has started serving
    traffic.
    """
    global _auth_required
    global _allow_dev_bearer_tokens
    _auth_required = enabled
    _allow_dev_bearer_tokens = allow_dev_bearer_tokens
    if not enabled:
        logger.warning(
            "AUTH DISABLED (QB2_AUTH_REQUIRED=false) — "
            "all requests are treated as the local dev-admin user. "
            "Never use this setting in production."
        )
    elif allow_dev_bearer_tokens:
        logger.warning(
            "Development bearer tokens are enabled in an auth-required environment. "
            "Restrict this to controlled local testing."
        )


def _dev_bypass_user() -> UserTokenClaims:
    """Return a full-access local dev user for the auth-disabled mode."""
    now = datetime.now(timezone.utc)
    return UserTokenClaims(
        user_id="dev-local",
        external_subject="dev|dev-local",
        email="dev@localhost",
        roles=frozenset({UserRole.ADMIN, UserRole.DEVELOPER}),
        org_ids=frozenset(),
        issued_at=now,
        expires_at=now + timedelta(hours=24),
    )


# ---------------------------------------------------------------------------
# Token parsing
# ---------------------------------------------------------------------------


def _parse_bearer_token(authorization: str | None) -> str | None:
    if authorization is None:
        return None
    scheme, _, token = authorization.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


async def _resolve_user_claims(
    authorization: Annotated[str | None, Header()] = None,
) -> UserTokenClaims | None:
    """Extract and validate user claims from the Authorization header.

    Signed frontend identities are validated even in local development.
    Requests without a signed identity may use the configured dev bypass.

    Returns None when no token is present (unauthenticated request).
    Raises 401 for malformed or invalid tokens.

    Note: swap the body of this function for real JWT verification in production.
    """
    token = _parse_bearer_token(authorization)
    if token and token.startswith("qn1."):
        try:
            _, body, signature = token.split(".")
            secret = os.getenv("AGENT_AUTH_BRIDGE_SECRET", "")
            if len(secret) < 32 or len(body) > 4096:
                raise ValueError("Bridge unavailable")
            expected = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, signature):
                raise ValueError("Invalid signature")
            data = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
            now = time.time()
            if (data["aud"] != "quantumnodes-agentkit"
                    or not isinstance(data["iat"], int) or not isinstance(data["exp"], int)
                    or not now - 120 <= data["iat"] <= now + 5
                    or not now < data["exp"] <= data["iat"] + 120):
                raise ValueError("Expired assertion")
            return UserTokenClaims(
                user_id=data["sub"], external_subject=f"betterauth|{data['sub']}",
                email=data["email"], roles=frozenset({UserRole.DEVELOPER}), org_ids=frozenset(),
                issued_at=datetime.fromtimestamp(data["iat"], timezone.utc),
                expires_at=datetime.fromtimestamp(data["exp"], timezone.utc),
                wallet_address=data.get("wallet"),
            )
        except (ValueError, KeyError, TypeError):
            raise PlatformException(status_code=401, error=ErrorCode.UNAUTHORIZED,
                                    message="Invalid or expired session assertion.") from None
    if not _auth_required:
        return _dev_bypass_user()
    if token is None:
        return None

    if token.startswith("dev-") and _allow_dev_bearer_tokens:
        # Minimal dev-mode stub — accepts any `dev-<user_id>` token.
        user_id = token.removeprefix("dev-") or "dev-user"
        now = datetime.now(timezone.utc)
        return UserTokenClaims(
            user_id=user_id,
            external_subject=f"dev|{user_id}",
            email=f"{user_id}@dev.local",
            roles=frozenset({UserRole.DEVELOPER}),
            org_ids=frozenset(),
            issued_at=now,
            expires_at=now + timedelta(hours=8),
        )

    raise PlatformException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        error=ErrorCode.UNAUTHORIZED,
        message="Invalid or expired token.",
    )


OptionalUser = Annotated[UserTokenClaims | None, Depends(_resolve_user_claims)]


async def require_authenticated(
    claims: OptionalUser,
) -> UserTokenClaims:
    """Dependency that rejects unauthenticated requests.

    When auth is disabled (``QB2_AUTH_REQUIRED=false``) this always succeeds
    and returns the dev bypass user.
    """
    if not _auth_required and claims is None:
        return _dev_bypass_user()
    if claims is None:
        raise PlatformException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error=ErrorCode.UNAUTHORIZED,
            message="Authentication required.",
        )
    return claims


CurrentUser = Annotated[UserTokenClaims, Depends(require_authenticated)]


async def require_admin(claims: CurrentUser) -> UserTokenClaims:
    """Dependency that additionally requires the ADMIN role."""
    if not claims.is_admin():
        raise PlatformException(
            status_code=status.HTTP_403_FORBIDDEN,
            error=ErrorCode.FORBIDDEN,
            message="Administrator role required.",
        )
    return claims


AdminUser = Annotated[UserTokenClaims, Depends(require_admin)]


def require_role(role: UserRole) -> "type[UserTokenClaims]":
    """Factory that returns a dependency requiring a specific role."""

    async def _check(claims: CurrentUser) -> UserTokenClaims:
        if not claims.has_role(role):
            raise PlatformException(
                status_code=status.HTTP_403_FORBIDDEN,
                error=ErrorCode.FORBIDDEN,
                message=f"Role '{role.value}' required.",
            )
        return claims

    return Depends(_check)  # type: ignore[return-value]


def require_trust_tier(minimum_tier: PeerTrustTier) -> "type[UserTokenClaims]":
    """Return a dependency that gates enrollment to a minimum trust tier."""
    _tier_order = [
        PeerTrustTier.QUARANTINED,
        PeerTrustTier.PUBLIC_UNTRUSTED,
        PeerTrustTier.USER_CONTRIBUTED,
        PeerTrustTier.ORG_MANAGED,
        PeerTrustTier.PLATFORM_MANAGED,
    ]

    async def _check(claims: CurrentUser) -> UserTokenClaims:
        allowed_tiers = _tier_order[_tier_order.index(minimum_tier):]
        if UserRole.ADMIN not in claims.roles and UserRole.OPERATOR not in claims.roles:
            allowed_tiers_no_managed = [
                t for t in allowed_tiers
                if t not in {PeerTrustTier.PLATFORM_MANAGED, PeerTrustTier.ORG_MANAGED}
            ]
            if not allowed_tiers_no_managed:
                raise PlatformException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    error=ErrorCode.FORBIDDEN,
                    message=f"Minimum trust tier '{minimum_tier.value}' requires elevated access.",
                )
        return claims

    return Depends(_check)  # type: ignore[return-value]
