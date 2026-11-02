"""Analysis-only portfolio inputs from Robinhood tokenized-stock price history (#18)."""

from __future__ import annotations

import asyncio
from collections.abc import Mapping, Sequence
from datetime import date, datetime, timezone
from typing import Any, Protocol

from requests import Session
from web3 import Web3

from quantum_backend_v2.application.financial_portfolio import PortfolioOptimizationConfig
from quantum_backend_v2.chains.market_data import MarketDataSource
from quantum_backend_v2.chains.price_history import (
    HistoryRejectedError,
    PriceHistory,
    TokenPriceHistoryReader,
    select_assets,
)
from quantum_backend_v2.chains.prices import PriceObservation, PriceUnavailableError
from quantum_backend_v2.chains.rpc import resolve_rpc_url

TOKENIZED_FILENAME = "robinhood-chain-token-prices.csv"
DATA_SOURCE = "Chainlink tokenized-equity price feeds on Robinhood Chain (eip155:4663)"
# Reads go to a rate-limited public RPC by default; jobs beyond this wait their turn.
_MAX_CONCURRENT_READS = 2
DISCLAIMER = (
    "Analysis only, not investment advice. Prices are Chainlink token prices read from "
    "Robinhood Chain; no wallet, signature or transaction is involved. Robinhood Stock "
    "Tokens are not offered to U.S. persons or in other restricted jurisdictions."
)


class TokenPriceHistorySource(Protocol):
    @property
    def market_data(self) -> MarketDataSource: ...

    async def read(self, symbols: Sequence[str], start: date, end: date) -> PriceHistory: ...


class ChainlinkHistorySource:
    def __init__(self, market_data: MarketDataSource, env: Mapping[str, str]) -> None:
        self._market_data = market_data
        self._reads = asyncio.Semaphore(_MAX_CONCURRENT_READS)
        self._rpc_env = (
            {market_data.rpc_env_var: env[market_data.rpc_env_var]}
            if market_data.rpc_env_var in env
            else {}
        )

    @property
    def market_data(self) -> MarketDataSource:
        return self._market_data

    async def read(self, symbols: Sequence[str], start: date, end: date) -> PriceHistory:
        rpc_url = resolve_rpc_url(self._market_data, self._rpc_env)

        def read_history() -> PriceHistory:
            with Session() as session:
                web3 = Web3(
                    Web3.HTTPProvider(
                        rpc_url,
                        session=session,
                        request_kwargs={"timeout": 30},
                        exception_retry_configuration=None,
                    )
                )
                return TokenPriceHistoryReader(self._market_data, web3).read(symbols, start, end)

        async with self._reads:
            return await asyncio.to_thread(read_history)


def tokenized_request(
    market_data: MarketDataSource,
    symbols: Sequence[str],
    start: date,
    end: date,
    config: PortfolioOptimizationConfig,
) -> dict[str, Any]:
    """Validate the selection before a job exists; history is read in the background."""
    select_assets(market_data, symbols, start, end)
    if end > datetime.now(timezone.utc).date():
        raise HistoryRejectedError("end date is in the future")
    # Mirrors the optimizer's budget rule, which would otherwise fail the job later.
    screened = min(len(symbols), config.max_assets_considered)
    if config.budget is not None and not 1 <= config.budget < screened:
        raise HistoryRejectedError("budget must be smaller than the number of assets analysed")
    return {
        "tokenized_assets": {
            "chain_id": market_data.chain_id,
            "symbols": list(symbols),
            "start": start.isoformat(),
            "end": end.isoformat(),
        }
    }


async def resolve_tokenized_history(
    request_payload: dict[str, Any], source: TokenPriceHistorySource | None
) -> dict[str, Any]:
    if source is None:
        raise PriceUnavailableError("price history source is not configured")
    selection = request_payload["tokenized_assets"]
    history = await source.read(
        selection["symbols"],
        date.fromisoformat(selection["start"]),
        date.fromisoformat(selection["end"]),
    )
    return {
        **request_payload,
        "csv_text": history.to_wide_csv().decode(),
        "market_data": _market_data_summary(history),
        # Every close is an oracle input, so the existing provenance bundle records each.
        "price_observations": [
            PriceObservation(
                chain_id=history.chain_id,
                feed=asset.feed_address,
                pair=f"{asset.symbol.lower()}-usd",
                round_id=close.round_id,
                answer=close.answer,
                decimals=asset.feed_decimals,
                value=close.price,
                observed_at=close.updated_at,
                block_number=history.block_number,
                block_hash=history.block_hash,
            ).model_dump(mode="json")
            for asset in history.assets
            for close in asset.closes
        ],
    }


def tokenized_result(result: dict[str, Any], request_payload: dict[str, Any]) -> dict[str, Any]:
    """Result fields added to an optimizer payload built from tokenized history."""
    benchmark = result["benchmark"]
    return {
        "market_data": request_payload["market_data"],
        # The optimizer selects assets and weights them equally.
        "allocation_weights": {
            method: [{"symbol": symbol, "weight": 1 / len(selected)} for symbol in selected]
            for method in ("classical", "quantum")
            for selected in (benchmark[method]["selected_assets"],)
        },
        "disclaimer": DISCLAIMER,
    }


def _market_data_summary(history: PriceHistory) -> dict[str, Any]:
    closes = history.assets[0].closes
    return {
        "source": DATA_SOURCE,
        "chain_id": history.chain_id,
        "block_number": history.block_number,
        "block_hash": history.block_hash,
        "block_timestamp": history.block_timestamp.isoformat(),
        "price_unit": history.price_unit,
        "sampling": history.sampling,
        "requested_start": history.start.isoformat(),
        "requested_end": history.end.isoformat(),
        "first_date": closes[0].date.isoformat(),
        "last_date": closes[-1].date.isoformat(),
        "aligned_days": len(closes),
        "assets": [
            {
                "symbol": asset.symbol,
                "name": asset.name,
                "isin": asset.isin,
                "token_address": asset.token_address,
                "feed_address": asset.feed_address,
                "feed_description": asset.feed_description,
                "feed_decimals": asset.feed_decimals,
                "rounds_read": asset.rounds_read,
                "days_available": asset.days_available,
                "first_round_id": asset.closes[0].round_id,
                "last_round_id": asset.closes[-1].round_id,
            }
            for asset in history.assets
        ],
    }
