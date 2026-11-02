"""Session key material for one agent. The owner key never lands here."""

from __future__ import annotations

import base64
import hashlib
import logging
import os
import re
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from typing import Any

from cryptography.fernet import Fernet

try:
    from starknet_py.hash.selector import get_selector_from_name  # type: ignore[import-not-found]
    from starknet_py.net.account.account import Account  # type: ignore[import-not-found]
    from starknet_py.net.client_models import Call  # type: ignore[import-not-found]
    from starknet_py.net.full_node_client import FullNodeClient  # type: ignore[import-not-found]
    from starknet_py.net.models.chains import StarknetChainId  # type: ignore[import-not-found]
    from starknet_py.net.signer.stark_curve_signer import KeyPair  # type: ignore[import-not-found]
except ImportError:
    get_selector_from_name = None
    Account = None
    Call = None
    FullNodeClient = None
    StarknetChainId = None
    KeyPair = None

from quantum_backend_v2.chains.loader import load_chain_registry
from quantum_backend_v2.chains.rpc import resolve_rpc_url
from quantum_backend_v2.chains.starknet import SN_SEPOLIA_CHAIN_ID
from quantum_backend_v2.starknet.calldata import policy_contract_address, spend_calldata
from quantum_backend_v2.starknet.policy import (
    SpendingPolicy,
    agent_key_from_id,
    authorize,
    felt_address,
    sign_session_spend,
)

logger = logging.getLogger(__name__)

_HIDDEN = "session_key_encrypted"
_TX_HASH = re.compile(r"0x[0-9a-fA-F]{1,64}")


def generate_session_keypair() -> tuple[str, str]:
    """Return `(private_hex, public_hex)` from starknet.py. The private half is stored encrypted."""
    if KeyPair is None:
        raise RuntimeError("starknet.py is required to create a session key")
    pair = KeyPair.generate()
    return f"{pair.private_key:x}", f"{pair.public_key:#x}"


def encrypt_session_key(private_hex: str, *, secret: str | None = None) -> str:
    key = secret if secret is not None else os.getenv("WALLET_ENCRYPTION_KEY", "")
    if not key.strip():
        raise RuntimeError("WALLET_ENCRYPTION_KEY is not set")
    fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(key.encode()).digest()))
    return fernet.encrypt(private_hex.encode()).decode()


def decrypt_session_key(encrypted_key: str, *, secret: str | None = None) -> str:
    key = secret if secret is not None else os.getenv("WALLET_ENCRYPTION_KEY", "")
    if not key.strip():
        raise RuntimeError("WALLET_ENCRYPTION_KEY is not set")
    fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(key.encode()).digest()))
    return fernet.decrypt(encrypted_key.encode()).decode()


def session_document(
    policy: SpendingPolicy, encrypted_key: str, *, decimals: int
) -> dict[str, Any]:
    return {
        "decimals": decimals,
        "chain_id": "starknet:SN_SEPOLIA",
        "agent_key": policy.agent_key,
        "nonce": policy.nonce,
        "owner": policy.owner,
        "token": policy.token,
        "recipient": policy.recipient,
        "max_per_call": str(policy.max_per_call),
        "daily_limit": str(policy.daily_limit),
        "expires_at": policy.expires_at,
        "revoked": policy.revoked,
        "day_index": policy.day_index,
        "spent_today": str(policy.spent_today),
        "session_public_key": policy.session_public_key,
        "session_key_encrypted": encrypted_key,
    }


def policy_from_document(
    stored: Mapping[str, Any], *, agent_id: str | None = None
) -> SpendingPolicy:
    raw_agent_key = stored.get("agent_key")
    resolved_agent_key = (
        felt_address(str(raw_agent_key))
        if isinstance(raw_agent_key, str) and raw_agent_key.strip()
        else (agent_key_from_id(agent_id) if agent_id else "0x1")
    )
    return SpendingPolicy(
        owner=str(stored["owner"]),
        token=str(stored["token"]),
        recipient=str(stored["recipient"]),
        max_per_call=int(stored["max_per_call"]),
        daily_limit=int(stored["daily_limit"]),
        expires_at=int(stored["expires_at"]),
        revoked=bool(stored["revoked"]),
        day_index=int(stored["day_index"]),
        spent_today=int(stored["spent_today"]),
        session_public_key=str(stored["session_public_key"]),
        agent_key=resolved_agent_key,
        nonce=int(stored.get("nonce", 0)),
    )


def note_submitted_tx(
    stored: Mapping[str, Any],
    *,
    kind: str,
    tx_hash: str,
    amount: str | None = None,
    now: int,
) -> dict[str, Any]:
    """Remember a hash the owner wallet returned. This does not confirm spend or revoke."""
    if _TX_HASH.fullmatch(tx_hash) is None:
        raise ValueError("invalid transaction hash")
    updated = dict(stored)
    entry: dict[str, Any] = {
        "kind": kind,
        "tx_hash": tx_hash,
        "submitted_at": now,
        "status": "pending",
    }
    if kind == "register":
        updated["register_tx"] = tx_hash
    elif kind == "spend":
        if amount is None or not amount.strip():
            raise ValueError("spend amount is required")
        try:
            parsed = Decimal(amount)
        except InvalidOperation as exc:
            raise ValueError("spend amount must be a number") from exc
        if parsed <= 0:
            raise ValueError("spend amount must be positive")
        updated["last_spend_tx"] = tx_hash
        updated["last_spend_amount"] = amount.strip()
        entry["amount"] = amount.strip()
    elif kind == "revoke":
        updated["revoke_tx"] = tx_hash
    else:
        raise ValueError("unknown transaction kind")
    calls = [dict(row) for row in updated.get("calls") or []]
    if not any(str(row.get("tx_hash")) == tx_hash for row in calls):
        calls.append(entry)
    updated["calls"] = calls
    return updated


def backfill_calls(stored: Mapping[str, Any]) -> dict[str, Any]:
    """Keep older single-hash fields visible in the call list."""
    updated = dict(stored)
    calls = [dict(row) for row in updated.get("calls") or []]
    known = {str(row.get("tx_hash")) for row in calls}
    seeds = (
        ("register", updated.get("register_tx"), None),
        ("spend", updated.get("last_spend_tx"), updated.get("last_spend_amount")),
        ("revoke", updated.get("revoke_tx"), None),
    )
    for kind, tx_hash, amount in seeds:
        if not isinstance(tx_hash, str) or not tx_hash or tx_hash in known:
            continue
        row: dict[str, Any] = {"kind": kind, "tx_hash": tx_hash, "status": "pending"}
        if isinstance(amount, str) and amount:
            row["amount"] = amount
        calls.append(row)
        known.add(tx_hash)
    updated["calls"] = calls
    return updated


def apply_call_status(
    stored: Mapping[str, Any], *, tx_hash: str, status: str, now: int
) -> dict[str, Any]:
    """Record a receipt status. A confirmed revoke is the only path that sets revoked."""
    if status not in {"pending", "confirmed", "failed", "not_found"}:
        raise ValueError("unknown receipt status")
    updated = dict(stored)
    calls: list[dict[str, Any]] = []
    for row in updated.get("calls") or []:
        item = dict(row)
        if item.get("tx_hash") == tx_hash and item.get("status") not in {"confirmed", "failed"}:
            item["status"] = status
            item["checked_at"] = now
        calls.append(item)
    updated["calls"] = calls
    if any(item.get("kind") == "revoke" and item.get("status") == "confirmed" for item in calls):
        updated["revoked"] = True
        updated["revocation_pending"] = False
    return updated


def refresh_call_statuses(
    stored: Mapping[str, Any],
    verify,
    *,
    now: int,
) -> dict[str, Any]:
    """Ask `verify(tx_hash)` for each open call. A lookup error leaves that call pending."""
    updated = backfill_calls(stored)
    for row in list(updated["calls"]):
        if row.get("status") in {"confirmed", "failed"}:
            continue
        tx_hash = str(row.get("tx_hash", ""))
        try:
            status = str(verify(tx_hash))
            updated = apply_call_status(updated, tx_hash=tx_hash, status=status, now=now)
        except Exception as exc:
            logger.warning(
                "Starknet receipt check failed for %s: %s",
                tx_hash,
                exc,
            )
            continue
    return updated


def public_session(stored: Mapping[str, Any] | None, *, now: int) -> dict[str, Any] | None:
    if not stored:
        return None
    if bool(stored.get("revoked")):
        status = "revoked"
    elif bool(stored.get("revocation_pending")):
        status = "revocation_pending"
    elif int(stored["expires_at"]) <= now:
        status = "expired"
    else:
        status = "active"
    visible = {key: value for key, value in stored.items() if key != _HIDDEN}
    visible["status"] = status
    return visible


_SN_MAIN_CHAIN_ID = int.from_bytes(b"SN_MAIN", "big")


def _chain_id_int(chain_id: str) -> int:
    if chain_id == "starknet:SN_MAIN":
        return _SN_MAIN_CHAIN_ID
    return SN_SEPOLIA_CHAIN_ID


async def _default_relayer_submit(
    contract: str, calldata: list[str], *, chain_id: str
) -> str:
    relayer_address = os.getenv("STARKNET_RELAYER_ADDRESS", "").strip()
    relayer_key = os.getenv("STARKNET_RELAYER_PRIVATE_KEY", "").strip()
    if not relayer_address or not relayer_key:
        raise RuntimeError(
            "STARKNET_RELAYER_ADDRESS and STARKNET_RELAYER_PRIVATE_KEY are required for session-key spends"
        )
    if (
        Account is None
        or FullNodeClient is None
        or Call is None
        or get_selector_from_name is None
        or StarknetChainId is None
        or KeyPair is None
    ):
        raise RuntimeError("starknet.py is required for session-key spends")
    chain = load_chain_registry().resolve(chain_id)
    rpc_url = resolve_rpc_url(chain)
    sn_chain = (
        StarknetChainId.MAINNET
        if chain.chain_id == "starknet:SN_MAIN"
        else StarknetChainId.SEPOLIA
    )
    client = FullNodeClient(node_url=rpc_url)
    key_pair = KeyPair.from_private_key(
        int(relayer_key, 16) if relayer_key.startswith(("0x", "0X")) else int(relayer_key, 16)
    )
    account = Account(
        address=int(felt_address(relayer_address), 16),
        client=client,
        key_pair=key_pair,
        chain=sn_chain,
    )
    int_calldata = [
        int(item, 16) if item.startswith(("0x", "0X")) else int(item)
        for item in calldata
    ]
    call = Call(
        to_addr=int(felt_address(contract), 16),
        selector=get_selector_from_name("spend"),
        calldata=int_calldata,
    )
    sent = await account.execute_v3(calls=call, auto_estimate=True)
    return hex(sent.transaction_hash)


async def submit_session_spend(
    stored: Mapping[str, Any],
    *,
    agent_id: str,
    amount_strk: Decimal,
    payee: str,
    now: int,
    submit_fn=None,
) -> tuple[dict[str, Any], str]:
    """Sign a session-key spend, submit it via the relayer, and return `(updated_session, tx_hash)`."""
    policy = policy_from_document(stored, agent_id=agent_id)
    decimals = int(stored.get("decimals", 18))
    amount_units = int(amount_strk * (Decimal(10) ** decimals))
    contract = policy_contract_address()
    chain_id_str = str(stored.get("chain_id") or "starknet:SN_SEPOLIA")
    chain_id_num = _chain_id_int(chain_id_str)
    encrypted = str(stored.get(_HIDDEN) or "")
    if not encrypted:
        raise RuntimeError("Session private key is missing")
    private_hex = decrypt_session_key(encrypted)
    r_sig, s_sig = sign_session_spend(
        private_hex,
        agent_key=policy.agent_key,
        payee=payee,
        amount=amount_units,
        nonce=policy.nonce,
        contract=contract,
        chain_id=chain_id_num,
    )
    next_policy = authorize(
        policy,
        amount=amount_units,
        token=policy.token,
        recipient=payee,
        now=now,
        nonce=policy.nonce,
        signature=(r_sig, s_sig),
        contract=contract,
        chain_id=chain_id_num,
    )
    calldata = spend_calldata(
        amount_units,
        agent_key=policy.agent_key,
        payee=payee,
        nonce=policy.nonce,
        signature=(r_sig, s_sig),
        session_key_spend=True,
    )
    sender = submit_fn or _default_relayer_submit
    tx_hash = await sender(contract, calldata, chain_id=chain_id_str)
    updated = dict(stored)
    updated["agent_key"] = next_policy.agent_key
    updated["day_index"] = next_policy.day_index
    updated["spent_today"] = str(next_policy.spent_today)
    updated["nonce"] = next_policy.nonce
    updated = note_submitted_tx(
        updated,
        kind="spend",
        tx_hash=tx_hash,
        amount=str(amount_strk),
        now=now,
    )
    return updated, tx_hash


