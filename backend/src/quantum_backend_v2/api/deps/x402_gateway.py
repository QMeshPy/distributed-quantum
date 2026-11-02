"""Shared guard for the internal routes that the x402 gateway calls."""

from __future__ import annotations

import hmac
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Header, HTTPException, status

X402_GATEWAY_HEADER = "X-X402-Gateway-Secret"
X402_OWNER_USER_ID = "x402-algorand"


def build_x402_gateway_guard(secret: str) -> Callable[..., Awaitable[None]]:
    """Return a dependency that rejects requests without the gateway secret."""

    async def require_x402_gateway(
        supplied_secret: Annotated[str | None, Header(alias=X402_GATEWAY_HEADER)] = None,
    ) -> None:
        if supplied_secret is None or not hmac.compare_digest(supplied_secret, secret):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid x402 gateway credentials.",
            )

    return require_x402_gateway
