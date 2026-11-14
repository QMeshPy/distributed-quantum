"""NEAR provenance publishing for Lab pages and the agent chat's wallet-sign card."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from mcp_server.platform_mcp import owner_headers
from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.deps.research import AIAgentServiceDep
from quantum_backend_v2.api.errors.models import ErrorCode, PlatformException
from services.near_publish import complete_publication, prepare_publication, publication_status

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/near-provenance", tags=["near-provenance"])


class PrepareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    job_ids: list[str] = Field(min_length=1, max_length=50)


class PublishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    signature: str | None = Field(
        default=None, pattern=r"^0x[0-9a-fA-F]{130}$", description="EIP-191 wallet signature"
    )


def _fail(exc: Exception) -> PlatformException:
    if isinstance(exc, OSError):
        # Publisher/adapter OSErrors carry fixed, credential-free messages.
        return PlatformException(
            status_code=503,
            error=ErrorCode.SERVICE_UNAVAILABLE,
            message=f"{exc}. Nothing was lost; try again shortly.",
        )
    if isinstance(exc, ValueError):
        return PlatformException(
            status_code=422, error=ErrorCode.VALIDATION_ERROR, message=str(exc)
        )
    logger.exception("NEAR publication failed")
    return PlatformException(
        status_code=500, error=ErrorCode.INTERNAL_ERROR, message="NEAR publication failed"
    )


@router.post("/prepare", summary="Bundle completed experiments and open a publish request")
async def prepare(
    body: PrepareRequest, current_user: CurrentUser, ai_agent_service: AIAgentServiceDep
) -> dict[str, Any]:
    headers = owner_headers(current_user.user_id, current_user.email, current_user.wallet_address)
    try:
        async with httpx.AsyncClient(headers=headers) as client:
            return await prepare_publication(
                ai_agent_service.db,
                client,
                current_user.user_id,
                current_user.wallet_address,
                body.job_ids,
            )
    except Exception as exc:
        raise _fail(exc) from None


@router.post(
    "/requests/{request_id}", summary="Publish a prepared request (optionally wallet-signed)"
)
async def publish(
    request_id: str,
    body: PublishRequest,
    current_user: CurrentUser,
    ai_agent_service: AIAgentServiceDep,
) -> dict[str, Any]:
    try:
        return await complete_publication(
            ai_agent_service.db, current_user.user_id, request_id, body.signature
        )
    except Exception as exc:
        raise _fail(exc) from None


@router.get("/jobs/{job_id}", summary="Whether a job is anchored on NEAR testnet")
async def status(
    job_id: str, current_user: CurrentUser, ai_agent_service: AIAgentServiceDep
) -> dict[str, Any]:
    return await publication_status(ai_agent_service.db, current_user.user_id, job_id)
