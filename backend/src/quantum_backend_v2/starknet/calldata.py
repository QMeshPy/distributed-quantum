"""Calldata for the spending-policy ABI.

A Cairo `u256` is two felts: the low 128 bits, then the high 128 bits.
Legacy owner-only calldata stays the default until `STARKNET_SESSION_KEY_SPEND=1`
switches to the per-agent session-key ABI in `spending_policy.cairo`.
"""

from __future__ import annotations

import os

from quantum_backend_v2.starknet.policy import SpendingPolicy, felt_address

_U128 = 1 << 128
_LEGACY_REGISTER_FIELDS = (
    "token",
    "recipient",
    "max_per_call",
    "daily_limit",
    "expires_at",
    "session_public_key",
)
_SESSION_REGISTER_FIELDS = (
    "agent_key",
    "token",
    "recipient",
    "max_per_call",
    "daily_limit",
    "expires_at",
    "session_public_key",
)


def session_key_spend_enabled() -> bool:
    return os.getenv("STARKNET_SESSION_KEY_SPEND", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }


def u256_felts(value: int) -> list[str]:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0 or value >= 1 << 256:
        raise ValueError("u256 out of range")
    return [str(value & (_U128 - 1)), str(value >> 128)]


def register_session_calldata(
    policy: SpendingPolicy, *, session_key_spend: bool | None = None
) -> list[str]:
    use_v2 = session_key_spend_enabled() if session_key_spend is None else session_key_spend
    fields = [
        policy.token,
        policy.recipient,
        *u256_felts(policy.max_per_call),
        *u256_felts(policy.daily_limit),
        str(policy.expires_at),
        policy.session_public_key,
    ]
    if use_v2:
        return [policy.agent_key, *fields]
    return fields


def spend_calldata(
    amount: int,
    *,
    agent_key: str | None = None,
    payee: str | None = None,
    nonce: int = 0,
    signature: tuple[int | str, int | str] = (0, 0),
    session_key_spend: bool | None = None,
) -> list[str]:
    use_v2 = session_key_spend_enabled() if session_key_spend is None else session_key_spend
    if not use_v2:
        return u256_felts(amount)
    if not agent_key or not payee:
        raise ValueError("agent_key and payee are required for session-key spend calldata")
    r_val, s_val = signature
    r_str = r_val if isinstance(r_val, str) else hex(r_val)
    s_str = s_val if isinstance(s_val, str) else hex(s_val)
    return [
        felt_address(agent_key),
        *u256_felts(amount),
        felt_address(payee),
        str(nonce),
        r_str,
        s_str,
    ]


def revoke_session_calldata(
    agent_key: str | None = None, *, session_key_spend: bool | None = None
) -> list[str]:
    use_v2 = session_key_spend_enabled() if session_key_spend is None else session_key_spend
    if not use_v2:
        return []
    if not agent_key:
        raise ValueError("agent_key is required for session-key revoke calldata")
    return [felt_address(agent_key)]


def policy_contract_address() -> str:
    raw = os.getenv("STARKNET_POLICY_CONTRACT", "").strip()
    if not raw:
        raise RuntimeError("STARKNET_POLICY_CONTRACT is not set")
    return felt_address(raw)


def register_session_field_names(*, session_key_spend: bool | None = None) -> tuple[str, ...]:
    use_v2 = session_key_spend_enabled() if session_key_spend is None else session_key_spend
    return _SESSION_REGISTER_FIELDS if use_v2 else _LEGACY_REGISTER_FIELDS

