"""Spending rules shared with the Sepolia policy contract.

Each agent row enforces its own `max_per_call`, `daily_limit`, `expires_at`,
`revoked`, `spent_today`, and `nonce`. Owner Get STRK withdraws to the row
recipient; session-key `spend` checks an ECDSA signature from
`session_public_key` over `(agent_key, payee, amount, nonce, contract, chain_id)`.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, replace
from decimal import Decimal
import hashlib
import re

try:
    from starknet_py.hash.utils import (  # type: ignore[import-not-found]
        message_signature,
        pedersen_hash,
        verify_message_signature,
    )
except ImportError:
    message_signature = None
    pedersen_hash = None
    verify_message_signature = None

_FELT = re.compile(r"^0x[0-9a-fA-F]{1,64}$")
_DAY = 86_400
_STARK_PRIME = (1 << 251) + 17 * (1 << 192) + 1
_U128 = 1 << 128


class PolicyRejectedError(ValueError):
    """A spend the policy contract reverts. `code` matches the Cairo assert."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class SpendingPolicy:
    owner: str
    token: str
    recipient: str
    max_per_call: int
    daily_limit: int
    expires_at: int
    revoked: bool
    day_index: int
    spent_today: int
    session_public_key: str
    agent_key: str = "0x1"
    nonce: int = 0


def token_units(amount: Decimal, decimals: int) -> int:
    if amount <= 0:
        raise ValueError("amount must be positive")
    if not 0 <= decimals <= 255:
        raise ValueError("invalid token decimals")
    scaled = amount * (Decimal(10) ** decimals)
    if scaled != scaled.to_integral_value():
        raise ValueError("amount is finer than the token decimals")
    return int(scaled)


def felt_address(value: str) -> str:
    if _FELT.fullmatch(value) is None or int(value, 16) == 0:
        raise ValueError("invalid starknet address")
    return "0x" + format(int(value, 16), "x")


def felt_int(value: str | int) -> int:
    if isinstance(value, int):
        if value <= 0 or value >= _STARK_PRIME:
            raise ValueError("invalid felt")
        return value
    text = value.strip()
    parsed = int(text, 16) if text.startswith(("0x", "0X")) else int(text)
    if parsed <= 0 or parsed >= _STARK_PRIME:
        raise ValueError("invalid felt")
    return parsed


def agent_key_from_id(agent_id: str) -> str:
    text = agent_id.strip()
    if not text:
        raise ValueError("agent_id is required")
    if _FELT.fullmatch(text) is not None:
        val = int(text, 16) % (_STARK_PRIME - 1)
        return "0x" + format(val or 1, "x")
    digest = int.from_bytes(hashlib.sha256(text.encode()).digest(), "big")
    val = (digest % (_STARK_PRIME - 1)) or 1
    return "0x" + format(val, "x")


def spend_message_hash(
    *,
    agent_key: str,
    payee: str,
    amount: int,
    nonce: int,
    contract: str,
    chain_id: str | int,
) -> int:
    if pedersen_hash is None:
        raise RuntimeError("starknet.py is required for Starknet message hashing")
    if amount <= 0 or amount >= 1 << 256:
        raise ValueError("u256 out of range")
    if nonce < 0 or nonce >= 1 << 64:
        raise ValueError("nonce out of range")
    low = amount & (_U128 - 1)
    high = amount >> 128
    h = 0
    for element in (
        felt_int(agent_key),
        int(felt_address(payee), 16),
        low,
        high,
        nonce,
        int(felt_address(contract), 16),
        felt_int(chain_id),
    ):
        h = pedersen_hash(h, element)
    return pedersen_hash(h, 7)


def sign_session_spend(
    private_key_hex: str,
    *,
    agent_key: str,
    payee: str,
    amount: int,
    nonce: int,
    contract: str,
    chain_id: str | int,
) -> tuple[int, int]:
    if message_signature is None:
        raise RuntimeError("starknet.py is required to sign session spends")
    priv = int(private_key_hex, 16)
    msg = spend_message_hash(
        agent_key=agent_key,
        payee=payee,
        amount=amount,
        nonce=nonce,
        contract=contract,
        chain_id=chain_id,
    )
    r, s = message_signature(msg, priv)
    return int(r), int(s)


def verify_session_spend_signature(
    public_key_hex: str,
    *,
    agent_key: str,
    payee: str,
    amount: int,
    nonce: int,
    contract: str,
    chain_id: str | int,
    signature: tuple[int | str, int | str],
) -> bool:
    if verify_message_signature is None:
        raise RuntimeError("starknet.py is required to verify session spends")
    try:
        msg = spend_message_hash(
            agent_key=agent_key,
            payee=payee,
            amount=amount,
            nonce=nonce,
            contract=contract,
            chain_id=chain_id,
        )
        r_raw, s_raw = signature
        r = int(r_raw, 16) if isinstance(r_raw, str) and r_raw.startswith(("0x", "0X")) else int(r_raw)
        s = int(s_raw, 16) if isinstance(s_raw, str) and s_raw.startswith(("0x", "0X")) else int(s_raw)
        pub = int(felt_address(public_key_hex), 16)
        return bool(verify_message_signature(msg, [r, s], pub))
    except Exception:
        return False


def policy_from_agent_config(
    *,
    max_per_proposal: Decimal,
    daily_budget: Decimal,
    owner: str,
    token: str,
    recipient: str,
    expires_at: int,
    session_public_key: str,
    decimals: int,
    now: int,
    agent_id: str | None = None,
    agent_key: str | None = None,
    nonce: int = 0,
) -> SpendingPolicy:
    """Map agent config fields onto the on-chain per-call and per-day caps."""
    if max_per_proposal > daily_budget:
        raise ValueError("max_per_proposal cannot exceed daily_budget")
    if expires_at <= now:
        raise ValueError("session expiry must be in the future")
    if not session_public_key:
        raise ValueError("session public key is required")
    resolved_key = (
        felt_address(agent_key)
        if agent_key
        else (agent_key_from_id(agent_id) if agent_id else "0x1")
    )
    return SpendingPolicy(
        owner=felt_address(owner),
        token=felt_address(token),
        recipient=felt_address(recipient),
        max_per_call=token_units(max_per_proposal, decimals),
        daily_limit=token_units(daily_budget, decimals),
        expires_at=expires_at,
        revoked=False,
        day_index=now // _DAY,
        spent_today=0,
        session_public_key=felt_address(session_public_key),
        agent_key=resolved_key,
        nonce=nonce,
    )


def authorize(
    policy: SpendingPolicy,
    *,
    amount: int,
    token: str,
    recipient: str,
    now: int,
    caller: str | None = None,
    nonce: int | None = None,
    signature: tuple[int | str, int | str] | None = None,
    contract: str | None = None,
    chain_id: str | int | None = None,
) -> SpendingPolicy:
    """Return the policy after a successful spend. Raises PolicyRejectedError otherwise."""
    if policy.revoked:
        raise PolicyRejectedError("revoked")
    if now >= policy.expires_at:
        raise PolicyRejectedError("expired")
    if felt_address(token) != policy.token:
        raise PolicyRejectedError("token")
    payee = felt_address(recipient)
    if nonce is not None and nonce != policy.nonce:
        raise PolicyRejectedError("nonce")
    if signature is not None:
        if not contract or chain_id is None:
            raise PolicyRejectedError("signature")
        if not verify_session_spend_signature(
            policy.session_public_key,
            agent_key=policy.agent_key,
            payee=payee,
            amount=amount,
            nonce=policy.nonce if nonce is None else nonce,
            contract=contract,
            chain_id=chain_id,
            signature=signature,
        ):
            raise PolicyRejectedError("signature")
    else:
        if caller is not None and felt_address(caller) != policy.owner:
            raise PolicyRejectedError("owner")
        if payee != policy.recipient:
            raise PolicyRejectedError("recipient")
    if amount <= 0 or amount > policy.max_per_call:
        raise PolicyRejectedError("per_call")
    day = now // _DAY
    spent = 0 if day != policy.day_index else policy.spent_today
    if spent + amount > policy.daily_limit:
        raise PolicyRejectedError("daily")
    return replace(
        policy,
        day_index=day,
        spent_today=spent + amount,
        nonce=policy.nonce + 1,
    )


def authorize_row(
    rows: Mapping[str, SpendingPolicy],
    *,
    agent_key: str,
    amount: int,
    token: str,
    payee: str,
    now: int,
    caller: str | None = None,
    nonce: int | None = None,
    signature: tuple[int | str, int | str] | None = None,
    contract: str | None = None,
    chain_id: str | int | None = None,
) -> dict[str, SpendingPolicy]:
    """Authorize a spend on one agent's row without mutating any other agent's row."""
    key = felt_address(agent_key)
    row = rows.get(key)
    if row is None:
        raise PolicyRejectedError("revoked")
    updated = authorize(
        row,
        amount=amount,
        token=token,
        recipient=payee,
        now=now,
        caller=caller,
        nonce=nonce,
        signature=signature,
        contract=contract,
        chain_id=chain_id,
    )
    out = dict(rows)
    out[key] = updated
    return out


def revoke(policy: SpendingPolicy) -> SpendingPolicy:
    return replace(policy, revoked=True)

