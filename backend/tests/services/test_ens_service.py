"""Unit tests for EnsService — mocked ENS client, no network I/O."""

from __future__ import annotations

import time
from unittest.mock import MagicMock

import pytest

from services.ens_service import (
    COIN_TYPE_ETH,
    EnsResolutionError,
    EnsService,
    detect_homoglyph_risk,
    ens_network_for_payment_network,
    evm_coin_type,
    looks_like_ens_name,
    normalize_ens_name,
)


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_ens_client():
    client = MagicMock()
    client.address.return_value = "0x1111111111111111111111111111111111111111"
    client.name.return_value = "alice.eth"
    return client


@pytest.fixture
def ens_service(mock_ens_client, monkeypatch):
    monkeypatch.setenv("NETWORK", "base-sepolia")
    monkeypatch.delenv("ENS_RPC_URL", raising=False)
    monkeypatch.delenv("ENS_NETWORK", raising=False)
    return EnsService(
        ens_client=mock_ens_client,
        cache_ttl=60,
        timeout=2.0,
        ens_network="sepolia",
    )


# ---------------------------------------------------------------------------
# Network / coin-type helpers
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("payment", "expected"),
    [
        ("base-sepolia", "sepolia"),
        ("base-mainnet", "mainnet"),
        ("ethereum-sepolia", "sepolia"),
        ("sepolia", "sepolia"),
        (None, "sepolia"),  # default NETWORK in tests is unset → sepolia via env default
    ],
)
def test_ens_network_for_payment_network(payment, expected, monkeypatch):
    monkeypatch.setenv("NETWORK", "base-sepolia")
    assert ens_network_for_payment_network(payment) == expected


def test_ens_network_mainnet_when_payment_is_mainnet():
    assert ens_network_for_payment_network("base-mainnet") == "mainnet"


def test_evm_coin_type_eth_and_base():
    assert evm_coin_type(1) == COIN_TYPE_ETH
    # Base mainnet chain id 8453 → ENSIP-11
    assert evm_coin_type(8453) == 0x80000000 | 8453


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("alice.eth", True),
        ("worker.qmesh.eth", True),
        ("0x1111111111111111111111111111111111111111", False),
        ("alice", False),
        ("", False),
    ],
)
def test_looks_like_ens_name(value, expected):
    assert looks_like_ens_name(value) is expected


# ---------------------------------------------------------------------------
# Normalization / homoglyphs
# ---------------------------------------------------------------------------


def test_normalize_lowercases_and_strips():
    assert normalize_ens_name("  Alice.ETH  ") == "alice.eth"


def test_normalize_rejects_hex_address():
    with pytest.raises(EnsResolutionError, match="hex address"):
        normalize_ens_name("0x1111111111111111111111111111111111111111")


def test_normalize_rejects_empty():
    with pytest.raises(EnsResolutionError, match="empty"):
        normalize_ens_name("   ")


def test_normalize_rejects_malformed():
    with pytest.raises(EnsResolutionError, match="Invalid ENS name"):
        normalize_ens_name("not a name!!!")


def test_homoglyph_cyrillic_a_mixed_with_latin():
    # Cyrillic а (U+0430) mixed into an otherwise Latin name
    sneaky = "аlice.eth"  # leading Cyrillic 'а'
    reason = detect_homoglyph_risk(sneaky)
    assert reason is not None
    with pytest.raises(EnsResolutionError, match="lookalike|scripts"):
        normalize_ens_name(sneaky)


def test_ascii_name_has_no_homoglyph_risk():
    assert detect_homoglyph_risk("alice.eth") is None


# ---------------------------------------------------------------------------
# Forward resolution
# ---------------------------------------------------------------------------


def test_resolve_success(ens_service, mock_ens_client):
    result = ens_service.resolve("Alice.eth")
    assert result.name == "alice.eth"
    assert result.address.lower() == "0x1111111111111111111111111111111111111111"
    assert result.coin_type == COIN_TYPE_ETH
    assert result.cached is False
    mock_ens_client.address.assert_called()


def test_resolve_uses_cache_on_second_call(ens_service, mock_ens_client):
    first = ens_service.resolve("alice.eth")
    second = ens_service.resolve("alice.eth")
    assert first.cached is False
    assert second.cached is True
    assert second.address == first.address
    assert mock_ens_client.address.call_count == 1


def test_resolve_fresh_bypasses_cache(ens_service, mock_ens_client):
    ens_service.resolve("alice.eth")
    ens_service.resolve("alice.eth", fresh=True)
    assert mock_ens_client.address.call_count == 2


def test_resolve_empty_result_raises_and_does_not_guess(ens_service, mock_ens_client):
    mock_ens_client.address.return_value = None
    with pytest.raises(EnsResolutionError, match="No address found"):
        ens_service.resolve("missing.eth")


def test_resolve_negative_cache(ens_service, mock_ens_client):
    mock_ens_client.address.return_value = None
    with pytest.raises(EnsResolutionError):
        ens_service.resolve("missing.eth")
    mock_ens_client.address.reset_mock()
    with pytest.raises(EnsResolutionError, match="No address found"):
        ens_service.resolve("missing.eth")
    mock_ens_client.address.assert_not_called()


def test_resolve_passes_coin_type(ens_service, mock_ens_client):
    coin = evm_coin_type(8453)
    ens_service.resolve("alice.eth", coin_type=coin)
    kwargs = mock_ens_client.address.call_args.kwargs
    assert kwargs.get("coin_type") == coin


def test_resolve_timeout(ens_service, mock_ens_client):
    def _slow(*_args, **_kwargs):
        time.sleep(3)
        return "0x1111111111111111111111111111111111111111"

    mock_ens_client.address.side_effect = _slow
    ens_service.timeout = 0.2
    with pytest.raises(EnsResolutionError, match="timed out"):
        ens_service.resolve("alice.eth", fresh=True)


def test_cache_ttl_capped(monkeypatch, mock_ens_client):
    monkeypatch.setenv("ENS_CACHE_TTL", "99999")
    service = EnsService(
        ens_client=mock_ens_client,
        cache_ttl=99999,
        ens_network="sepolia",
    )
    assert service.cache_ttl == 900  # hard cap


# ---------------------------------------------------------------------------
# Reverse resolution
# ---------------------------------------------------------------------------


def test_reverse_success(ens_service, mock_ens_client):
    addr = "0x1111111111111111111111111111111111111111"
    mock_ens_client.name.return_value = "alice.eth"
    mock_ens_client.address.return_value = addr
    result = ens_service.reverse(addr)
    assert result.name == "alice.eth"
    assert result.cached is False


def test_reverse_no_primary_name(ens_service, mock_ens_client):
    mock_ens_client.name.return_value = None
    result = ens_service.reverse("0x1111111111111111111111111111111111111111")
    assert result.name is None


def test_reverse_rejects_unverified_forward(ens_service, mock_ens_client):
    mock_ens_client.name.return_value = "alice.eth"
    # Forward resolves to a different address → ignore primary name
    mock_ens_client.address.return_value = "0x2222222222222222222222222222222222222222"
    result = ens_service.reverse("0x1111111111111111111111111111111111111111")
    assert result.name is None


def test_reverse_invalid_address(ens_service):
    with pytest.raises(EnsResolutionError, match="Invalid address"):
        ens_service.reverse("not-an-address")


def test_reverse_uses_cache(ens_service, mock_ens_client):
    addr = "0x1111111111111111111111111111111111111111"
    mock_ens_client.name.return_value = "alice.eth"
    mock_ens_client.address.return_value = addr
    ens_service.reverse(addr)
    ens_service.reverse(addr)
    assert mock_ens_client.name.call_count == 1
