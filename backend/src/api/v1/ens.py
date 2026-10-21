"""ENS resolution HTTP endpoints.

Thin read-only API over :class:`services.ens_service.EnsService`. Payment flows
must still require the user to confirm a resolved address before sending funds;
these endpoints never invent an address on failure.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, ConfigDict, Field

from quantum_backend_v2.api.errors.models import ErrorCode, PlatformException
from services.ens_service import (
    COIN_TYPE_ETH,
    EnsResolutionError,
    get_ens_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ens", tags=["ens"])


class EnsResolveResponse(BaseModel):
    """Forward ENS resolution result."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(description="Normalized ENS name that was resolved")
    address: str = Field(description="Resolved address (checksummed when possible)")
    coin_type: int = Field(description="SLIP-44 / ENSIP-11 coin type used")
    ens_network: str = Field(description="L1 ENS network consulted (sepolia|mainnet)")
    cached: bool = Field(description="True when served from the in-process cache")


class EnsReverseResponse(BaseModel):
    """Reverse ENS resolution result."""

    model_config = ConfigDict(extra="forbid")

    address: str = Field(description="Checksummed input address")
    name: str | None = Field(
        default=None,
        description="Verified primary ENS name, or null if unset",
    )
    coin_type: int = Field(description="SLIP-44 / ENSIP-11 coin type used")
    ens_network: str = Field(description="L1 ENS network consulted (sepolia|mainnet)")
    cached: bool = Field(description="True when served from the in-process cache")


@router.get(
    "/resolve",
    response_model=EnsResolveResponse,
    summary="Resolve an ENS name to an address",
)
async def resolve_ens_name(
    name: str = Query(..., min_length=3, description="ENS name, e.g. alice.eth"),
    coin_type: int = Query(
        COIN_TYPE_ETH,
        ge=0,
        description="SLIP-44 / ENSIP-11 coin type (default 60 = ETH)",
    ),
    fresh: bool = Query(
        False,
        description="Bypass cache (required before sending funds)",
    ),
) -> EnsResolveResponse:
    """Resolve ``name`` on Ethereum L1 (Sepolia for testnets).

    On failure returns a validation error — never a guessed address.
    """
    service = get_ens_service()
    try:
        result = service.resolve(name, coin_type=coin_type, fresh=fresh)
    except EnsResolutionError as exc:
        raise PlatformException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error=ErrorCode.VALIDATION_ERROR,
            message=exc.message,
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected ENS resolve failure for %s", name)
        raise PlatformException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error=ErrorCode.SERVICE_UNAVAILABLE,
            message="ENS resolution is temporarily unavailable",
        ) from exc

    return EnsResolveResponse(
        name=result.name,
        address=result.address,
        coin_type=result.coin_type,
        ens_network=service.ens_network,
        cached=result.cached,
    )


@router.get(
    "/reverse",
    response_model=EnsReverseResponse,
    summary="Reverse-resolve an address to its primary ENS name",
)
async def reverse_ens_name(
    address: str = Query(..., min_length=42, max_length=42, description="0x-prefixed address"),
    coin_type: int = Query(
        COIN_TYPE_ETH,
        ge=0,
        description="SLIP-44 / ENSIP-11 coin type (default 60 = ETH)",
    ),
    fresh: bool = Query(False, description="Bypass cache"),
) -> EnsReverseResponse:
    """Return the verified primary name, or ``name=null`` when unset."""
    service = get_ens_service()
    try:
        result = service.reverse(address, coin_type=coin_type, fresh=fresh)
    except EnsResolutionError as exc:
        raise PlatformException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error=ErrorCode.VALIDATION_ERROR,
            message=exc.message,
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected ENS reverse failure for %s", address)
        raise PlatformException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error=ErrorCode.SERVICE_UNAVAILABLE,
            message="ENS resolution is temporarily unavailable",
        ) from exc

    return EnsReverseResponse(
        address=result.address,
        name=result.name,
        coin_type=result.coin_type,
        ens_network=service.ens_network,
        cached=result.cached,
    )
