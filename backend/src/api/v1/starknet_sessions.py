"""Opt-in Starknet session for an existing agent. Base USDC funding is unchanged."""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal

import httpx

from bson import Decimal128
from fastapi import APIRouter, status
from pydantic import BaseModel, ConfigDict, Field

from db.agentkit_collections import AIAgentDocument
from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.errors.models import ErrorCode, PlatformException
from quantum_backend_v2.chains.loader import load_chain_registry
from quantum_backend_v2.chains.rpc import resolve_rpc_url
from quantum_backend_v2.chains.starknet import StarknetRpcAdapter
from quantum_backend_v2.starknet.calldata import (
    policy_contract_address,
    register_session_calldata,
    revoke_session_calldata,
    spend_calldata,
)
from quantum_backend_v2.starknet.paymaster import PaymasterSponsorError, build_sponsor_request
from quantum_backend_v2.starknet.policy import (
    PolicyRejectedError,
    authorize,
    policy_from_agent_config,
    token_units,
)
from quantum_backend_v2.starknet.session import (
    encrypt_session_key,
    generate_session_keypair,
    policy_from_document,
    note_submitted_tx,
    public_session,
    refresh_call_statuses,
    session_document,
)

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


class OpenSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    owner: str
    token: str
    recipient: str
    expires_at: int = Field(gt=0)
    decimals: int = Field(default=18, ge=0, le=255)
    max_per_proposal: str | None = None
    daily_budget: str | None = None


class SpendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount: str


class TxNoteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["register", "spend", "revoke"]
    tx_hash: str
    amount: str | None = None


def _decimal(value: object) -> Decimal:
    if isinstance(value, Decimal128):
        return value.to_decimal()
    return Decimal(str(value))


async def _owned_agent(agent_id: str, user_id: str) -> AIAgentDocument:
    agent = await AIAgentDocument.find_one({"agent_id": agent_id})
    if agent is None:
        raise PlatformException(
            status_code=status.HTTP_404_NOT_FOUND,
            error=ErrorCode.NOT_FOUND,
            message=f"Agent '{agent_id}' not found",
        )
    if agent.owner_id != user_id:
        raise PlatformException(
            status_code=status.HTTP_403_FORBIDDEN,
            error=ErrorCode.FORBIDDEN,
            message="You do not have permission to access this agent",
        )
    return agent


class _JsonRpc:
    def __init__(self, url: str) -> None:
        self._url = url

    def request(self, method: str, params: list[object]) -> object:
        response = httpx.post(
            self._url,
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
            timeout=12,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or payload.get("error"):
            raise LookupError("transaction receipt is unavailable")
        return payload.get("result")


def _refresh_receipts(stored: dict[str, Any], now: int) -> dict[str, Any]:
    chain = load_chain_registry().resolve("starknet:SN_SEPOLIA")
    adapter = StarknetRpcAdapter(chain, _JsonRpc(resolve_rpc_url(chain)))

    def verify(tx_hash: str) -> str:
        return adapter.verify_transaction(tx_hash).status

    return refresh_call_statuses(stored, verify, now=now)


def _bad_request(exc: Exception) -> PlatformException:
    return PlatformException(
        status_code=status.HTTP_400_BAD_REQUEST,
        error=ErrorCode.VALIDATION_ERROR,
        message=str(exc),
    )


@router.post("/{agent_id}/starknet-session", status_code=status.HTTP_201_CREATED)
async def open_starknet_session(
    agent_id: str,
    body: OpenSessionRequest,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Store a session key and the owner-signed registration the paymaster may sponsor."""
    agent = await _owned_agent(agent_id, current_user.user_id)
    now = int(time.time())
    try:
        private_hex, public_hex = generate_session_keypair()
        policy = policy_from_agent_config(
            max_per_proposal=_decimal(body.max_per_proposal or agent.config["max_per_proposal"]),
            daily_budget=_decimal(body.daily_budget or agent.config["daily_budget"]),
            owner=body.owner,
            token=body.token,
            recipient=body.recipient,
            expires_at=body.expires_at,
            session_public_key=public_hex,
            decimals=body.decimals,
            now=now,
            agent_id=agent_id,
        )
        encrypted = encrypt_session_key(private_hex)
    except RuntimeError as exc:
        raise PlatformException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error=ErrorCode.INTERNAL_ERROR,
            message=str(exc),
        ) from None
    except ValueError as exc:
        raise _bad_request(exc) from None
    try:
        contract = policy_contract_address()
    except RuntimeError as exc:
        raise PlatformException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error=ErrorCode.INTERNAL_ERROR,
            message=str(exc),
        ) from None
    stored = session_document(policy, encrypted, decimals=body.decimals)
    await AIAgentDocument.find_one({"agent_id": agent_id}).update(
        {"$set": {"starknet_session": stored, "updated_at": datetime.now(timezone.utc)}}
    )
    calldata = register_session_calldata(policy)
    try:
        sponsor = build_sponsor_request(
            entrypoint="register_session",
            account_address=policy.owner,
            contract_address=contract,
            calldata=calldata,
        )
    except PaymasterSponsorError as exc:
        raise _bad_request(exc) from None
    return {
        "starknet_session": public_session(stored, now=now),
        "register_session": {
            "contract": contract,
            "entrypoint": "register_session",
            "calldata": calldata,
        },
        "paymaster": sponsor,
    }


@router.post("/{agent_id}/starknet-session/spend")
async def spend_starknet_session(
    agent_id: str,
    body: SpendRequest,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Read-only preflight. Spending is recorded on-chain after the owner submits `spend`."""
    agent = await _owned_agent(agent_id, current_user.user_id)
    stored = agent.starknet_session
    if not stored:
        raise PlatformException(
            status_code=status.HTTP_404_NOT_FOUND,
            error=ErrorCode.NOT_FOUND,
            message="Agent has no Starknet session",
        )
    now = int(time.time())
    try:
        policy = policy_from_document(stored, agent_id=agent_id)
        decimals = int(stored.get("decimals", 18))
        amount = token_units(Decimal(body.amount), decimals)
        authorize(
            policy,
            amount=amount,
            token=policy.token,
            recipient=policy.recipient,
            now=now,
        )
        contract = policy_contract_address()
    except (PolicyRejectedError, ValueError) as exc:
        raise _bad_request(exc) from None
    except RuntimeError as exc:
        raise PlatformException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error=ErrorCode.INTERNAL_ERROR,
            message=str(exc),
        ) from None
    return {
        "starknet_session": public_session(stored, now=now),
        "spend": {
            "contract": contract,
            "entrypoint": "spend",
            "calldata": spend_calldata(
                amount,
                agent_key=policy.agent_key,
                payee=policy.recipient,
                nonce=policy.nonce,
            ),
        },
    }


@router.post("/{agent_id}/starknet-session/tx")
async def note_starknet_tx(
    agent_id: str,
    body: TxNoteRequest,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Store the hash returned by the owner wallet. Caps and revocation stay unchanged."""
    agent = await _owned_agent(agent_id, current_user.user_id)
    stored = agent.starknet_session
    if not stored:
        raise PlatformException(
            status_code=status.HTTP_404_NOT_FOUND,
            error=ErrorCode.NOT_FOUND,
            message="Agent has no Starknet session",
        )
    try:
        noted = note_submitted_tx(
            stored,
            kind=body.kind,
            tx_hash=body.tx_hash,
            amount=body.amount,
            now=int(time.time()),
        )
    except ValueError as exc:
        raise _bad_request(exc) from None
    await AIAgentDocument.find_one({"agent_id": agent_id}).update(
        {"$set": {"starknet_session": noted, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"starknet_session": public_session(noted, now=int(time.time()))}


@router.post("/{agent_id}/starknet-session/txs")
async def refresh_starknet_txs(agent_id: str, current_user: CurrentUser) -> dict[str, Any]:
    """Read receipts for this session's calls. A confirmed revoke is recorded as revoked."""
    agent = await _owned_agent(agent_id, current_user.user_id)
    stored = agent.starknet_session
    if not stored:
        raise PlatformException(
            status_code=status.HTTP_404_NOT_FOUND,
            error=ErrorCode.NOT_FOUND,
            message="Agent has no Starknet session",
        )
    now = int(time.time())
    try:
        refreshed = await asyncio.to_thread(_refresh_receipts, dict(stored), now)
    except Exception as exc:
        raise PlatformException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error=ErrorCode.INTERNAL_ERROR,
            message="Starknet receipt lookup is unavailable",
        ) from exc
    await AIAgentDocument.find_one({"agent_id": agent_id}).update(
        {"$set": {"starknet_session": refreshed, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"starknet_session": public_session(refreshed, now=now)}


@router.post("/{agent_id}/starknet-session/revoke")
async def revoke_starknet_session(agent_id: str, current_user: CurrentUser) -> dict[str, Any]:
    """Return the owner revoke call. The database stays active until the chain confirms it."""
    agent = await _owned_agent(agent_id, current_user.user_id)
    stored = agent.starknet_session
    if not stored:
        raise PlatformException(
            status_code=status.HTTP_404_NOT_FOUND,
            error=ErrorCode.NOT_FOUND,
            message="Agent has no Starknet session",
        )
    try:
        contract = policy_contract_address()
    except RuntimeError as exc:
        raise PlatformException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            error=ErrorCode.INTERNAL_ERROR,
            message=str(exc),
        ) from None
    pending = dict(stored)
    pending["revocation_pending"] = True
    policy = policy_from_document(stored, agent_id=agent_id)
    revoke_calldata = revoke_session_calldata(policy.agent_key)
    await AIAgentDocument.find_one({"agent_id": agent_id}).update(
        {"$set": {"starknet_session": pending, "updated_at": datetime.now(timezone.utc)}}
    )
    try:
        build_sponsor_request(
            entrypoint="revoke_session",
            account_address=str(stored["owner"]),
            contract_address=contract,
            calldata=revoke_calldata,
        )
    except PaymasterSponsorError:
        sponsored = False
    else:
        sponsored = True
    return {
        "starknet_session": public_session(pending, now=int(time.time())),
        "revoke_session": {
            "contract": contract,
            "entrypoint": "revoke_session",
            "calldata": revoke_calldata,
        },
        "paymaster_sponsored": sponsored,
    }
