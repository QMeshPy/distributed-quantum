"""Wallet portfolio analyzer — mocked RPC / price feeds (issue #19)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from unittest.mock import patch

import pytest
from eth_abi import encode
from web3 import Web3
from web3.providers import BaseProvider

from quantum_backend_v2.api.models.wallet_portfolio import (
    HoldingSource,
    PricedHolding,
    WalletPortfolioRiskSummary,
)
from quantum_backend_v2.application import wallet_portfolio as wp
from quantum_backend_v2.chains.loader import load_chain_registry
from quantum_backend_v2.chains.prices import PriceObservation

ADDRESS = "0x" + "11" * 20
NOW = 1_780_000_000
BLOCK_HASH = "0x" + "ab" * 32
BASE_SEPOLIA = 84532
ETHEREUM_SEPOLIA = 11155111
USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"


class ScriptedProvider(BaseProvider):
    def __init__(self, chain_id: int, results: dict[str, Any]) -> None:
        super().__init__()
        self.results = {"eth_chainId": hex(chain_id), **results}
        self.calls: list[tuple[str, Any]] = []

    def make_request(self, method: str, params: Any) -> dict[str, Any]:
        self.calls.append((method, params))
        result = self.results.get(method)
        if callable(result):
            result = result(params)
        return {"jsonrpc": "2.0", "id": 1, "result": result}

    def is_connected(self, show_traceback: bool = False) -> bool:
        return True


def _word(value: int) -> str:
    return "0x" + format(value, "064x")


def _balance_provider(*, native_wei: int, usdc_units: int) -> ScriptedProvider:
    def eth_call(params: Any) -> str:
        data = params[0]["data"]
        if data.startswith("0x70a08231"):
            return _word(usdc_units)
        raise AssertionError(data)

    return ScriptedProvider(
        BASE_SEPOLIA,
        {
            "eth_getBalance": hex(native_wei),
            "eth_call": eth_call,
        },
    )


def _price_provider(*, answer: int = 2500 * 10**8) -> ScriptedProvider:
    round_data = (42, answer, NOW - 30, NOW - 10, 42)

    def eth_call(params: Any) -> str:
        data = params[0]["data"]
        if data == "0x313ce567":
            return "0x" + encode(["uint8"], [8]).hex()
        return (
            "0x"
            + encode(
                ["uint80", "int256", "uint256", "uint256", "uint80"], round_data
            ).hex()
        )

    return ScriptedProvider(
        ETHEREUM_SEPOLIA,
        {
            "eth_getBlockByNumber": {
                "number": "0x64",
                "hash": BLOCK_HASH,
                "timestamp": hex(NOW),
            },
            "eth_call": eth_call,
        },
    )


def test_fetch_raw_holdings_reads_native_and_stablecoin():
    registry = load_chain_registry()
    provider = _balance_provider(native_wei=15 * 10**17, usdc_units=2_500_000)
    env = {"QB2_BASE_SEPOLIA_RPC_URL": "https://rpc.test"}

    with patch.object(wp, "_web3", return_value=Web3(provider)):
        holdings = wp.fetch_raw_holdings(
            registry=registry,
            address=ADDRESS,
            networks=["base-sepolia"],
            env=env,
        )

    assert len(holdings) == 2
    native, usdc = holdings
    assert native.symbol == "ETH"
    assert native.kind == "native"
    assert native.balance == Decimal("1.5")
    assert usdc.symbol == "USDC"
    assert usdc.kind == "stablecoin"
    assert usdc.balance == Decimal("2.5")
    assert usdc.token_address == USDC


def test_price_holdings_pegs_stablecoin_and_marks_unpriceable_native():
    registry = load_chain_registry()
    chain = registry.resolve("base-sepolia")
    now = datetime.fromtimestamp(NOW, timezone.utc)
    raw = [
        wp._RawHolding(
            network="base-sepolia",
            chain=chain,
            symbol="ETH",
            kind="native",
            token_address=None,
            balance=Decimal("1"),
            decimals=18,
            observed_at=now,
        ),
        wp._RawHolding(
            network="base-sepolia",
            chain=chain,
            symbol="USDC",
            kind="stablecoin",
            token_address=USDC,
            balance=Decimal("10"),
            decimals=6,
            observed_at=now,
        ),
    ]

    with patch.object(wp, "_price_native_usd", return_value=None):
        priced, unpriceable, sources = wp.price_holdings(
            registry=registry, raw=raw, env={}
        )

    assert len(priced) == 1
    assert priced[0].symbol == "USDC"
    assert priced[0].price_usd == "1"
    assert priced[0].weight == pytest.approx(1.0)
    assert len(unpriceable) == 1
    assert unpriceable[0].symbol == "ETH"
    assert "eth-usd" in unpriceable[0].reason
    assert any(s.kind == "stablecoin-peg" for s in sources)


def test_price_holdings_uses_chainlink_for_native():
    registry = load_chain_registry()
    chain = registry.resolve("base-sepolia")
    now = datetime.fromtimestamp(NOW, timezone.utc)
    raw = [
        wp._RawHolding(
            network="base-sepolia",
            chain=chain,
            symbol="ETH",
            kind="native",
            token_address=None,
            balance=Decimal("2"),
            decimals=18,
            observed_at=now,
        ),
    ]
    source = HoldingSource(
        kind="chainlink",
        detail="ethereum-sepolia:eth-usd",
        observed_at=now,
    )

    with patch.object(
        wp, "_price_native_usd", return_value=(Decimal("2500"), source)
    ):
        priced, unpriceable, sources = wp.price_holdings(
            registry=registry, raw=raw, env={}
        )

    assert unpriceable == []
    assert len(priced) == 1
    assert priced[0].value_usd == "5000"
    assert priced[0].weight == pytest.approx(1.0)
    assert sources[0].kind == "chainlink"


def test_price_native_usd_reads_sepolia_feed():
    registry = load_chain_registry()
    provider = _price_provider(answer=2500 * 10**8)
    env = {"QB2_ETHEREUM_SEPOLIA_RPC_URL": "https://rpc.test"}
    observed_at = datetime.fromtimestamp(NOW - 10, timezone.utc)

    def fake_get_price(self, feed_id, reference_value, *, now=None):
        assert feed_id == "eth-usd"
        assert reference_value == Decimal("2500")
        return PriceObservation(
            chain_id=self.chain.chain_id,
            feed=self.chain.price_feeds["eth-usd"].address,
            pair="eth-usd",
            round_id="42",
            answer=str(2500 * 10**8),
            decimals=8,
            value="2500",
            observed_at=observed_at,
            block_number=100,
            block_hash=BLOCK_HASH,
        )

    with (
        patch.object(wp, "_web3", return_value=Web3(provider)),
        patch.object(wp, "_eth_market_reference", return_value=Decimal("2500")),
        patch(
            "quantum_backend_v2.application.wallet_portfolio.EvmPriceAdapter.get_price",
            fake_get_price,
        ),
    ):
        result = wp._price_native_usd(registry, env)

    assert result is not None
    price, source = result
    assert price == Decimal("2500")
    assert source.kind == "chainlink"
    assert "eth-usd" in source.detail


def test_price_native_usd_rejects_out_of_range_feed_without_reference_ladder():
    """A $4500 feed vs $3000 market reference must not be accepted via retries."""
    from quantum_backend_v2.chains.prices import PriceRejectedError

    registry = load_chain_registry()
    provider = _price_provider(answer=4500 * 10**8)
    env = {"QB2_ETHEREUM_SEPOLIA_RPC_URL": "https://rpc.test"}
    calls: list[Decimal] = []

    def fake_get_price(self, feed_id, reference_value, *, now=None):
        calls.append(reference_value)
        raise PriceRejectedError("price feed exceeds the allowed reference-price deviation")

    with (
        patch.object(wp, "_web3", return_value=Web3(provider)),
        patch.object(wp, "_eth_market_reference", return_value=Decimal("3000")),
        patch(
            "quantum_backend_v2.application.wallet_portfolio.EvmPriceAdapter.get_price",
            fake_get_price,
        ),
    ):
        result = wp._price_native_usd(registry, env)

    assert result is None
    assert calls == [Decimal("3000")]


def test_enabled_balance_chains_dedupes_alias_and_caip_id():
    registry = load_chain_registry()
    selected = wp._enabled_balance_chains(
        registry, ["base-sepolia", "eip155:84532", "base-sepolia"]
    )
    assert len(selected) == 1
    assert selected[0][1].chain_id == "eip155:84532"


def test_run_portfolio_risk_skips_empty():
    summary, job, sources = wp.run_portfolio_risk(
        [],
        lookback_days=60,
        num_uncertainty_qubits=3,
        epsilon=0.05,
        alpha=0.05,
    )
    assert summary.portfolio_value_usd == 0.0
    assert job == {}
    assert sources == []


def test_run_portfolio_risk_applies_weights(monkeypatch: pytest.MonkeyPatch):
    now = datetime.fromtimestamp(NOW, timezone.utc)
    priced = [
        PricedHolding(
            network="base-sepolia",
            chain_id="eip155:84532",
            symbol="ETH",
            kind="native",
            balance="1",
            decimals=18,
            price_usd="1000",
            value_usd="1000",
            weight=1.0,
            source=HoldingSource(kind="chainlink", detail="test", observed_at=now),
        )
    ]
    history_source = HoldingSource(
        kind="eth-usd-history", detail="test history", observed_at=now
    )

    def fake_compute(request: dict[str, Any]) -> dict[str, Any]:
        assert request["holdings"][0]["weight"] == 1.0
        assert len(request["historical_returns"]) >= 1
        return {
            "var_results": [
                {
                    "confidence_level": 0.95,
                    "classical_mc_var": 0.1,
                    "quantum_var": 0.11,
                },
                {
                    "confidence_level": 0.99,
                    "classical_mc_var": 0.2,
                    "quantum_var": 0.22,
                },
            ],
            "classical_mc_cvar_99": 0.25,
            "quantum_cvar_99": 0.27,
        }

    monkeypatch.setattr(
        wp,
        "_historical_returns_for_holdings",
        lambda *_a, **_k: ([[0.01]], history_source),
    )
    monkeypatch.setattr(wp, "compute_equity_risk", fake_compute)

    summary, job, sources = wp.run_portfolio_risk(
        priced,
        lookback_days=60,
        num_uncertainty_qubits=3,
        epsilon=0.05,
        alpha=0.05,
    )
    assert summary.portfolio_value_usd == 1000.0
    assert summary.classical_var_95 == 100.0
    assert summary.quantum_var_99 == 220.0
    assert job["classical_mc_cvar_99"] == 0.25
    assert sources == [history_source]
    assert "ETH-USD market history" in summary.confidence_note


def test_run_portfolio_risk_labels_synthetic_history(monkeypatch: pytest.MonkeyPatch):
    now = datetime.fromtimestamp(NOW, timezone.utc)
    priced = [
        PricedHolding(
            network="base-sepolia",
            chain_id="eip155:84532",
            symbol="ETH",
            kind="native",
            balance="1",
            decimals=18,
            price_usd="1000",
            value_usd="1000",
            weight=1.0,
            source=HoldingSource(kind="chainlink", detail="test", observed_at=now),
        )
    ]
    synthetic = HoldingSource(
        kind="synthetic-simulation",
        detail="ETH-USD market history unavailable",
        observed_at=now,
    )

    monkeypatch.setattr(
        wp,
        "_historical_returns_for_holdings",
        lambda *_a, **_k: ([[0.01]], synthetic),
    )
    monkeypatch.setattr(
        wp,
        "compute_equity_risk",
        lambda _req: {
            "var_results": [
                {"confidence_level": 0.95, "classical_mc_var": 0.1, "quantum_var": 0.1},
                {"confidence_level": 0.99, "classical_mc_var": 0.2, "quantum_var": 0.2},
            ],
            "classical_mc_cvar_99": 0.25,
            "quantum_cvar_99": 0.25,
        },
    )

    summary, _job, sources = wp.run_portfolio_risk(
        priced,
        lookback_days=60,
        num_uncertainty_qubits=3,
        epsilon=0.05,
        alpha=0.05,
    )
    assert sources[0].kind == "synthetic-simulation"
    assert "synthetic simulation" in summary.confidence_note


def test_analyze_wallet_portfolio_end_to_end_mocked(monkeypatch: pytest.MonkeyPatch):
    registry = load_chain_registry()
    now = datetime.fromtimestamp(NOW, timezone.utc)
    chain = registry.resolve("base-sepolia")
    raw = [
        wp._RawHolding(
            network="base-sepolia",
            chain=chain,
            symbol="USDC",
            kind="stablecoin",
            token_address=USDC,
            balance=Decimal("100"),
            decimals=6,
            observed_at=now,
        )
    ]

    monkeypatch.setattr(wp, "fetch_raw_holdings", lambda **_k: raw)
    monkeypatch.setattr(
        wp,
        "run_portfolio_risk",
        lambda priced, **_k: (
            WalletPortfolioRiskSummary(
                portfolio_value_usd=100.0,
                classical_var_95=1.0,
                classical_var_99=2.0,
                classical_cvar_99=2.5,
                confidence_note="test",
            ),
            {"ok": True},
            [
                HoldingSource(
                    kind="eth-usd-history", detail="test", observed_at=now
                )
            ],
        ),
    )

    result = asyncio.run(
        wp.analyze_wallet_portfolio(
            registry=registry,
            address=ADDRESS,
            networks=["base-sepolia"],
            env={},
        )
    )
    assert result.address == Web3.to_checksum_address(ADDRESS)
    assert len(result.priced_holdings) == 1
    assert result.unpriceable_holdings == []
    assert result.risk is not None
    assert result.risk.portfolio_value_usd == 100.0
    assert any("Read-only" in note for note in result.notes)
    assert any(s.kind == "stablecoin-peg" for s in result.data_sources)
    assert any(s.kind == "eth-usd-history" for s in result.data_sources)
