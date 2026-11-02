"""Reviewed tokenized-asset allowlist and the Robinhood Chain testnet registry entry."""

import pytest
from pydantic import ValidationError

from quantum_backend_v2.chains.loader import load_chain_registry
from quantum_backend_v2.chains.market_data import (
    MarketDataConfigurationError,
    MarketDataSource,
    UnsupportedAssetError,
    load_market_data,
)
from quantum_backend_v2.chains.models import ChainRegistry, UnknownNetworkError
from quantum_backend_v2.chains.rpc import resolve_rpc_url


@pytest.fixture
def data():
    return load_market_data().model_dump()


def test_packaged_allowlist_is_read_only_robinhood_mainnet_data():
    source = load_market_data()
    assert source.chain_id == "eip155:4663"
    assert [asset.symbol for asset in source.assets] == [
        "AAPL",
        "MSFT",
        "NVDA",
        "GOOGL",
        "AMZN",
        "META",
        "TSLA",
        "SPY",
        "QQQ",
    ]
    assert all(asset.feed_decimals == 8 and asset.phase_id == 1 for asset in source.assets)
    assert all(asset.first_valid_round > 1 for asset in source.assets)
    assert source.asset("GOOGL").feed_address == "0xF6f373a037c30F0e5010d854385cA89185AE638b"
    assert source.asset("GOOGL").isin == "US02079K3059"
    # Market data has no capabilities: nothing here can create wallets or send transactions.
    assert "capabilities" not in MarketDataSource.model_fields


def test_mainnet_market_data_stays_out_of_the_chain_registry():
    registry = load_chain_registry()
    with pytest.raises(UnknownNetworkError):
        registry.resolve("eip155:4663")
    testnet = registry.resolve("robinhood-testnet")
    assert registry.resolve("eip155:46630") is testnet
    assert testnet.testnet is True
    assert testnet.capabilities == ("explorer_url", "verify_transaction")
    assert testnet.stablecoin is None
    assert testnet.price_feeds == {}


def test_robinhood_testnet_cannot_gain_wallet_operations():
    data = load_chain_registry().model_dump()
    entry = next(chain for chain in data["chains"] if chain["chain_id"] == "eip155:46630")
    entry["capabilities"] = ["explorer_url", "get_balance"]
    with pytest.raises(ValidationError, match="wallet provider does not support"):
        ChainRegistry.model_validate(data)


def test_market_data_rpc_uses_override_then_public_endpoint():
    source = load_market_data()
    assert resolve_rpc_url(source, {}) == "https://rpc.mainnet.chain.robinhood.com"
    override = "https://robinhood-mainnet.example/v2/key"
    assert resolve_rpc_url(source, {"QB2_ROBINHOOD_MAINNET_RPC_URL": override}) == override


def test_unknown_assets_are_not_echoed():
    with pytest.raises(UnsupportedAssetError) as caught:
        load_market_data().asset("TOP_SECRET")
    assert "TOP_SECRET" not in str(caught.value)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda d: d["assets"][1].update(symbol="AAPL"),
        lambda d: d["assets"][1].update(feed_address=d["assets"][0]["feed_address"]),
        lambda d: d["assets"][1].update(token_address=d["assets"][0]["token_address"]),
        lambda d: d.update(assets=d["assets"][:1]),
        lambda d: d["assets"][0].update(isin="US037833100"),
        lambda d: d["assets"][0].update(feed_decimals=19),
        lambda d: d["assets"][0].update(first_valid_round=0),
        lambda d: d["assets"][0].update(private_key="0xTOP_SECRET"),
        lambda d: d.update(capabilities=["transfer_stablecoin"]),
        lambda d: d.update(public_rpc_url="https://user:TOP_SECRET@rpc.example"),
    ],
)
def test_invalid_allowlists_are_rejected(data, mutate):
    mutate(data)
    with pytest.raises(ValidationError) as caught:
        MarketDataSource.model_validate(data)
    assert "TOP_SECRET" not in str(caught.value)


def test_loader_errors_omit_file_contents(tmp_path):
    path = tmp_path / "market_data.toml"
    path.write_text('chain_id = "https://user:TOP_SECRET@rpc.example"\n')
    with pytest.raises(MarketDataConfigurationError) as caught:
        load_market_data(path)
    assert "TOP_SECRET" not in str(caught.value)
    path.write_text("chain_id = TOP_SECRET\n")
    with pytest.raises(MarketDataConfigurationError, match="invalid market data TOML"):
        load_market_data(path)
    with pytest.raises(MarketDataConfigurationError, match="unable to read"):
        load_market_data(tmp_path / "missing.toml")
