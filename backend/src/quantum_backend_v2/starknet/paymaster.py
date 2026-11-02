"""AVNU Sepolia paymaster. Sponsorship covers onboarding, not cap changes or spends."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

AVNU_SEPOLIA_URL = "https://sepolia.paymaster.avnu.fi"
# Owner-signed account deployment and session registration. `spend` and `revoke_session` pay gas.
SPONSORED_ENTRYPOINTS = frozenset({"deploy_account", "register_session"})


class PaymasterSponsorError(ValueError):
    """This call must not be sponsored."""


def assert_sponsorable(entrypoint: str) -> None:
    if entrypoint not in SPONSORED_ENTRYPOINTS:
        raise PaymasterSponsorError("paymaster sponsors onboarding only")


def build_sponsor_request(
    *,
    entrypoint: str,
    account_address: str,
    contract_address: str,
    calldata: list[str],
) -> dict[str, Any]:
    assert_sponsorable(entrypoint)
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "paymaster_buildTransaction",
        "params": {
            "invoke": {
                "userAddress": account_address,
                "calls": [
                    {
                        "contractAddress": contract_address,
                        "entrypoint": entrypoint,
                        "calldata": calldata,
                    }
                ],
            },
            "execution_mode": "sponsored",
        },
    }


def sponsor_headers(api_key: str) -> dict[str, str]:
    if not api_key.strip():
        raise PaymasterSponsorError("AVNU_PAYMASTER_API_KEY is not set")
    return {"x-paymaster-api-key": api_key, "content-type": "application/json"}


def sponsored_call(
    *,
    entrypoint: str,
    account_address: str,
    contract_address: str,
    calldata: list[str],
    api_key: str,
    post: Any,
    endpoint: str = AVNU_SEPOLIA_URL,
) -> object:
    """POST a sponsored build. `post` is an injected HTTP caller so tests stay offline."""
    body = build_sponsor_request(
        entrypoint=entrypoint,
        account_address=account_address,
        contract_address=contract_address,
        calldata=calldata,
    )
    headers: Mapping[str, str] = sponsor_headers(api_key)
    return post(endpoint, body, headers)
