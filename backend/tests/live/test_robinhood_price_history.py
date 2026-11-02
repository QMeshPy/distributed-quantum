"""Opt-in read-only check against Robinhood Chain mainnet Chainlink feeds.

Skipped unless QB2_ROBINHOOD_LIVE_TEST=1. It only sends eth_call reads (optionally
through QB2_ROBINHOOD_MAINNET_RPC_URL) and compares live closes with the recorded
fixture: Chainlink rounds are immutable, so each close's round must match exactly.
"""

import json
import os
from datetime import date
from pathlib import Path

import pytest
from requests import Session
from web3 import Web3

from quantum_backend_v2.chains.market_data import load_market_data
from quantum_backend_v2.chains.price_history import TokenPriceHistoryReader
from quantum_backend_v2.chains.rpc import resolve_rpc_url

pytestmark = [
    pytest.mark.live_robinhood,
    pytest.mark.skipif(
        os.environ.get("QB2_ROBINHOOD_LIVE_TEST") != "1",
        reason="set QB2_ROBINHOOD_LIVE_TEST=1 to read Robinhood Chain mainnet feeds",
    ),
]

FIXTURE = json.loads(
    (Path(__file__).parents[1] / "fixtures" / "robinhood_chainlink_rounds.json").read_text()
)


def test_live_closes_match_recorded_rounds():
    source = load_market_data()
    with Session() as session:
        web3 = Web3(
            Web3.HTTPProvider(
                resolve_rpc_url(source, os.environ),
                session=session,
                request_kwargs={"timeout": 30},
                exception_retry_configuration=None,
            )
        )
        history = TokenPriceHistoryReader(source, web3).read(
            ["SPY", "QQQ"], date(2026, 6, 23), date(2026, 9, 30)
        )

    assert history.block_number > FIXTURE["block"]["number"]
    for asset in history.assets:
        feed = FIXTURE["feeds"][asset.feed_address]
        recorded = {(1 << 64) | r[0]: r for r in feed["rounds"]}
        assert len(asset.closes) >= 60
        for close in asset.closes:
            _, answer, _, updated, _ = recorded[int(close.round_id)]
            assert close.answer == answer
            assert int(close.updated_at.timestamp()) == updated
