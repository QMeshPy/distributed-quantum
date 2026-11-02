"""Tokenized-stock history inputs, results and provenance (#18)."""

import asyncio
import time
from datetime import date

import pytest
from robinhood_chain import BLOCK, SOURCE, RecordedChain
from web3 import Web3

from quantum_backend_v2.application import tokenized_portfolio
from quantum_backend_v2.application.finance_provenance import build_finance_provenance
from quantum_backend_v2.application.financial_portfolio import (
    PortfolioOptimizationConfig,
    build_portfolio_optimization_artifacts,
)
from quantum_backend_v2.application.tokenized_portfolio import (
    DISCLAIMER,
    ChainlinkHistorySource,
    resolve_tokenized_history,
    tokenized_request,
    tokenized_result,
)
from quantum_backend_v2.chains.market_data import UnsupportedAssetError
from quantum_backend_v2.chains.price_history import HistoryRejectedError, TokenPriceHistoryReader
from quantum_backend_v2.chains.prices import PriceObservation, PriceUnavailableError
from quantum_backend_v2.provenance.hashing import bundle_hash
from quantum_backend_v2.provenance.models import ProvenanceBundle


class RecordedHistorySource:
    market_data = SOURCE

    def __init__(self, provider=None):
        self.provider = provider or RecordedChain()

    async def read(self, symbols, start, end):
        return TokenPriceHistoryReader(SOURCE, Web3(self.provider)).read(symbols, start, end)


def request(symbols=("SPY", "QQQ"), start=date(2026, 6, 1), end=date(2026, 10, 28), budget=None):
    config = PortfolioOptimizationConfig(value_mode="prices", date_column="date", budget=budget)
    return tokenized_request(SOURCE, list(symbols), start, end, config)


def resolve(payload, source=None):
    return asyncio.run(resolve_tokenized_history(payload, source or RecordedHistorySource()))


def test_request_records_only_a_validated_selection():
    assert request() == {
        "tokenized_assets": {
            "chain_id": "eip155:4663",
            "symbols": ["SPY", "QQQ"],
            "start": "2026-06-01",
            "end": "2026-10-28",
        }
    }
    with pytest.raises(UnsupportedAssetError):
        request(("SPY", "DOGE"))
    with pytest.raises(HistoryRejectedError):
        request(end=date(2026, 5, 1))
    with pytest.raises(HistoryRejectedError, match="budget"):
        request(budget=2)
    assert request(("SPY", "QQQ", "AAPL"), budget=2)["tokenized_assets"]["symbols"][2] == "AAPL"


def test_history_becomes_optimizer_csv_and_per_close_oracle_observations():
    resolved = resolve(request())

    lines = resolved["csv_text"].splitlines()
    assert lines[0] == "date,SPY,QQQ" and len(lines) == 90
    summary = resolved["market_data"]
    assert summary["chain_id"] == "eip155:4663"
    assert (summary["block_number"], summary["block_hash"]) == (BLOCK["number"], BLOCK["hash"])
    assert (summary["first_date"], summary["last_date"], summary["aligned_days"]) == (
        "2026-06-23",
        "2026-10-27",
        89,
    )
    assert summary["price_unit"] == "token_usd"
    assert [asset["symbol"] for asset in summary["assets"]] == ["SPY", "QQQ"]

    observations = [PriceObservation.model_validate(o) for o in resolved["price_observations"]]
    assert len(observations) == 178
    last_spy = observations[88]
    assert last_spy.pair == "spy-usd"
    assert last_spy.feed == "0x319724394D3A0e3669269846abE664Cd621f9f6A"
    assert (last_spy.answer, last_spy.decimals, last_spy.value) == (
        "76961492403",
        8,
        "769.61492403",
    )
    assert last_spy.round_id == str((1 << 64) | 185)
    assert all(o.block_number == BLOCK["number"] for o in observations)


def test_missing_source_never_falls_back():
    with pytest.raises(PriceUnavailableError):
        asyncio.run(resolve_tokenized_history(request(), None))


def test_result_adds_equal_weights_provenance_and_disclaimer():
    resolved = resolve(request())
    artifacts = build_portfolio_optimization_artifacts(
        csv_bytes=resolved["csv_text"].encode(),
        job_id="fin-rh",
        filename="robinhood.csv",
        config=PortfolioOptimizationConfig(value_mode="prices", date_column="date"),
    )
    added = tokenized_result(artifacts.payload, resolved)

    assert added["disclaimer"] == DISCLAIMER
    assert added["market_data"] == resolved["market_data"]
    for method in ("classical", "quantum"):
        selected = artifacts.payload["benchmark"][method]["selected_assets"]
        weights = added["allocation_weights"][method]
        assert [w["symbol"] for w in weights] == selected
        assert sum(w["weight"] for w in weights) == pytest.approx(1.0)

    # The #25 provenance builder binds every daily close as an oracle reference.
    artifacts.payload.update(added)
    provenance = build_finance_provenance(
        "fin-0e9c2f4b-robinhood",
        "alice",
        resolved,
        artifacts.payload,
        workflow="portfolio-optimization",
    )
    bundle = ProvenanceBundle.model_validate(provenance["bundle"])
    assert bundle_hash(bundle) == provenance["bundle_hash"]
    assert len(bundle.oracle_refs) == 178
    assert bundle.oracle_refs[0].feed == "eip155:4663/0x319724394D3A0e3669269846abE664Cd621f9f6A"


def test_history_source_limits_concurrent_chain_reads(monkeypatch):
    active = peak = 0

    class SlowReader:
        def __init__(self, source, web3):
            pass

        def read(self, symbols, start, end):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            time.sleep(0.05)
            active -= 1
            return "history"

    monkeypatch.setattr(tokenized_portfolio, "TokenPriceHistoryReader", SlowReader)
    source = ChainlinkHistorySource(SOURCE, {})

    async def run():
        return await asyncio.gather(
            *(source.read(["SPY", "QQQ"], date(2026, 6, 1), date(2026, 10, 1)) for _ in range(6))
        )

    assert asyncio.run(run()) == ["history"] * 6
    assert peak == 2


def test_history_source_reads_only_its_own_rpc_override():
    source = ChainlinkHistorySource(
        SOURCE,
        {
            "QB2_ROBINHOOD_MAINNET_RPC_URL": "https://robinhood.example/v2/key",
            "QB2_BASE_SEPOLIA_RPC_URL": "https://base.example",
        },
    )
    assert source._rpc_env == {"QB2_ROBINHOOD_MAINNET_RPC_URL": "https://robinhood.example/v2/key"}
    assert source.market_data is SOURCE
