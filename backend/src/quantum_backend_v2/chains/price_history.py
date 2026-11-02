"""Read validated daily token-price history from allowlisted Chainlink feeds.

Only eth_call reads at one pinned block. Rounds are immutable, so the recorded round
IDs reproduce a series later even on RPC nodes that no longer serve the block's state.
"""

from __future__ import annotations

import csv
import io
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel, ConfigDict

from quantum_backend_v2.chains.market_data import MarketDataSource, TokenizedAsset
from quantum_backend_v2.chains.prices import PriceRejectedError, PriceUnavailableError

if TYPE_CHECKING:
    from web3 import Web3

MAX_HISTORY_DAYS = 366
# The optimizer accepts four returns; a covariance estimate needs far more.
MIN_ALIGNED_DAYS = 60
# Feeds pause over weekends and market holidays (24/5 trading); a week means stopped.
MAX_FEED_SILENCE_SECONDS = 7 * 86400
# Daily prices are sampled after the 16:00 ET close in both EDT and EST.
CLOSE_CUTOFF = time(21, 0)
# A 24h heartbeat plus slack: an older round means the market was closed that day.
MAX_CLOSE_AGE_SECONDS = 36 * 3600
# Real consecutive rounds moved under 5%; launch-scale errors were about 1e8x.
MAX_ROUND_MOVE = Decimal("0.5")
# One multicall of 1000 getRoundData calls takes about 1.6s on the public RPC.
_CALLS_PER_BATCH = 1000
_PROBES_PER_FEED = 64

SAMPLING = (
    "last valid Chainlink round at or before 21:00 UTC each weekday, if under 36h old; "
    "kept on dates when a selected feed published (not market holidays) and every "
    "selected asset has a price"
)


class HistoryUnavailableError(PriceUnavailableError):
    """The history could not be read reliably; nothing is substituted."""


class HistoryRejectedError(PriceRejectedError):
    """The request or the returned rounds violate the history policy."""


class InsufficientHistoryError(HistoryRejectedError):
    """Too few aligned observations for the requested assets and dates."""


class _HistoryModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class DailyClose(_HistoryModel):
    date: date
    answer: str
    price: str
    round_id: str
    updated_at: datetime


class AssetHistory(_HistoryModel):
    symbol: str
    name: str
    isin: str
    token_address: str
    feed_address: str
    feed_description: str
    feed_decimals: int
    rounds_read: int
    days_available: int
    closes: tuple[DailyClose, ...]


class PriceHistory(_HistoryModel):
    chain_id: str
    block_number: int
    block_hash: str
    block_timestamp: datetime
    start: date
    end: date
    # Chainlink tokenized-equity feeds already include the token's uiMultiplier.
    price_unit: Literal["token_usd"] = "token_usd"
    sampling: str = SAMPLING
    assets: tuple[AssetHistory, ...]

    def to_wide_csv(self) -> bytes:
        """The optimizer's wide price format: one date column plus one column per asset."""
        stream = io.StringIO()
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(["date", *(asset.symbol for asset in self.assets)])
        for row in zip(*(asset.closes for asset in self.assets), strict=True):
            writer.writerow([row[0].date.isoformat(), *(close.price for close in row)])
        return stream.getvalue().encode()


@dataclass(frozen=True)
class _Round:
    round_id: int
    answer: int
    started_at: int
    updated_at: int
    answered_in_round: int


_ROUND_OUTPUTS = [
    {"name": name, "type": kind}
    for name, kind in (
        ("roundId", "uint80"),
        ("answer", "int256"),
        ("startedAt", "uint256"),
        ("updatedAt", "uint256"),
        ("answeredInRound", "uint80"),
    )
]
_ROUND_TYPES = [output["type"] for output in _ROUND_OUTPUTS]
_FEED_ABI: list[dict[str, Any]] = [
    {
        "name": name,
        "type": "function",
        "stateMutability": "view",
        "inputs": inputs,
        "outputs": outputs,
    }
    for name, inputs, outputs in (
        ("decimals", [], [{"name": "", "type": "uint8"}]),
        ("description", [], [{"name": "", "type": "string"}]),
        ("latestRoundData", [], _ROUND_OUTPUTS),
        ("getRoundData", [{"name": "_roundId", "type": "uint80"}], _ROUND_OUTPUTS),
    )
]
_MULTICALL_ABI: list[dict[str, Any]] = [
    {
        "name": "tryAggregate",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "requireSuccess", "type": "bool"},
            {
                "name": "calls",
                "type": "tuple[]",
                "components": [
                    {"name": "target", "type": "address"},
                    {"name": "callData", "type": "bytes"},
                ],
            },
        ],
        "outputs": [
            {
                "name": "returnData",
                "type": "tuple[]",
                "components": [
                    {"name": "success", "type": "bool"},
                    {"name": "returnData", "type": "bytes"},
                ],
            }
        ],
    }
]


def select_assets(
    source: MarketDataSource, symbols: Sequence[str], start: date, end: date
) -> list[TokenizedAsset]:
    """Validate a request without network I/O; the reader also rejects future end dates."""
    if len(set(symbols)) != len(symbols):
        raise HistoryRejectedError("duplicate asset")
    if not 2 <= len(symbols) <= len(source.assets):
        raise HistoryRejectedError(f"select between 2 and {len(source.assets)} supported assets")
    assets = [source.asset(symbol) for symbol in symbols]
    if start > end or (end - start).days > MAX_HISTORY_DAYS:
        raise HistoryRejectedError(f"date range must span 0 to {MAX_HISTORY_DAYS} days")
    if len(sampling_dates(start, end)) < MIN_ALIGNED_DAYS:
        raise InsufficientHistoryError(
            f"date range must include at least {MIN_ALIGNED_DAYS} weekdays"
        )
    return assets


def sampling_dates(start: date, end: date) -> list[date]:
    """Weekdays in [start, end]; market holidays drop out because no feed is fresh."""
    days = (start + timedelta(days=offset) for offset in range((end - start).days + 1))
    return [day for day in days if day.weekday() < 5]


@dataclass
class TokenPriceHistoryReader:
    """Read-only history for allowlisted tokenized assets through an injected Web3 client.

    Reads are batched through Multicall3: one call for feed metadata, one or more for
    evenly spaced probe rounds that bracket the window, then the rounds inside it.
    """

    source: MarketDataSource
    web3: Web3
    _block: int = field(default=0, init=False, repr=False)

    def read(self, symbols: Sequence[str], start: date, end: date) -> PriceHistory:
        assets = select_assets(self.source, symbols, start, end)
        try:
            if int(self.web3.eth.chain_id) != self.source.numeric_chain_id:
                raise HistoryUnavailableError("RPC endpoint serves a different chain")
            block = self.web3.eth.get_block("latest")
            self._block = int(block["number"])
            block_time = int(block["timestamp"])
            if end > _utc(block_time).date():
                raise HistoryRejectedError("end date is in the future")
            # A cutoff later than the pinned block is not a close yet.
            days = [day for day in sampling_dates(start, end) if _cutoff(day) <= block_time]
            if not days:
                raise InsufficientHistoryError("no completed trading day in the date range")
            start_ts = _cutoff(days[0]) - MAX_CLOSE_AGE_SECONDS
            end_ts = _cutoff(days[-1]) + 1
            ranges = self._valid_ranges(assets, block_time)
            windows = self._bracket(assets, ranges, start_ts, end_ts)
            rounds = self._read_rounds(assets, windows)
            if self.web3.eth.get_block(self._block)["hash"] != block["hash"]:
                raise HistoryUnavailableError("price block changed during the read")
        except (HistoryRejectedError, HistoryUnavailableError):
            raise
        except Exception:
            # RPC errors can include a credential-bearing endpoint URL.
            raise HistoryUnavailableError("price history read failed") from None

        daily = [
            _sample_closes(asset, asset_rounds, days, start_ts, end_ts, block_time)
            for asset, asset_rounds in zip(assets, rounds, strict=True)
        ]
        # On market holidays no feed publishes; carrying prices over them would add
        # zero returns for days that did not trade.
        active = {
            _utc(current.updated_at).date()
            for asset_rounds in rounds
            for current in asset_rounds
            if start_ts <= current.updated_at < end_ts
        }
        aligned = sorted(active.intersection(*(set(closes) for closes, _ in daily)))
        if len(aligned) < MIN_ALIGNED_DAYS:
            raise InsufficientHistoryError(
                f"need at least {MIN_ALIGNED_DAYS} aligned daily prices for the selected assets"
            )
        return PriceHistory(
            chain_id=self.source.chain_id,
            block_number=self._block,
            block_hash="0x" + bytes(block["hash"]).hex(),
            block_timestamp=_utc(block_time),
            start=start,
            end=end,
            assets=tuple(
                AssetHistory(
                    symbol=asset.symbol,
                    name=asset.name,
                    isin=asset.isin,
                    token_address=asset.token_address,
                    feed_address=asset.feed_address,
                    feed_description=asset.feed_description,
                    feed_decimals=asset.feed_decimals,
                    rounds_read=rounds_read,
                    days_available=len(closes),
                    closes=tuple(closes[day] for day in aligned),
                )
                for asset, (closes, rounds_read) in zip(assets, daily, strict=True)
            ),
        )

    def _valid_ranges(
        self, assets: Sequence[TokenizedAsset], block_time: int
    ) -> list[tuple[int, int]]:
        """Check each feed against the allowlist; return its first valid and latest round."""
        calls = []
        for asset in assets:
            feed = self._feed(asset)
            calls += [
                (feed.address, feed.encode_abi("description")),
                (feed.address, feed.encode_abi("decimals")),
                (feed.address, feed.encode_abi("latestRoundData")),
            ]
        results = self._aggregate(calls)
        ranges = []
        for index, asset in enumerate(assets):
            description, decimals, latest = (
                _payload(result) for result in results[3 * index : 3 * index + 3]
            )
            if (
                self.web3.codec.decode(["string"], description)[0] != asset.feed_description
                or self.web3.codec.decode(["uint8"], decimals)[0] != asset.feed_decimals
            ):
                raise HistoryUnavailableError("price feed no longer matches the reviewed allowlist")
            latest_round = _Round(*self.web3.codec.decode(_ROUND_TYPES, latest))
            if latest_round.round_id >> 64 != asset.phase_id:
                raise HistoryUnavailableError(
                    "price feed phase changed; the allowlist needs review"
                )
            if block_time - latest_round.updated_at > MAX_FEED_SILENCE_SECONDS:
                raise HistoryUnavailableError("price feed has stopped updating")
            first = (asset.phase_id << 64) | asset.first_valid_round
            if latest_round.round_id < first:
                raise InsufficientHistoryError("price feed has no valid history yet")
            ranges.append((first, latest_round.round_id))
        return ranges

    def _bracket(
        self,
        assets: Sequence[TokenizedAsset],
        ranges: Sequence[tuple[int, int]],
        start_ts: int,
        end_ts: int,
    ) -> list[tuple[int, int]]:
        """Narrow each feed to the rounds around [start_ts, end_ts) with spaced probes.

        Rounds are time-ordered, so the window lies between the last probe before the
        start and the first probe at or after the end.
        """
        probes = []
        for first, last in ranges:
            step = max(1, -(-(last - first + 1) // _PROBES_PER_FEED))
            ids = list(range(first, last + 1, step))
            probes.append(ids if ids[-1] == last else [*ids, last])
        calls = [
            (feed.address, feed.encode_abi("getRoundData", args=[round_id]))
            for asset, ids in zip(assets, probes, strict=True)
            for feed in (self._feed(asset),)
            for round_id in ids
        ]
        results = iter(self._aggregate(calls))
        windows = []
        for (first, last), ids in zip(ranges, probes, strict=True):
            low, high = first, last
            for round_id in ids:
                probe = self._decode_round(next(results), round_id)
                if probe.updated_at < start_ts:
                    low = round_id
                elif probe.updated_at >= end_ts and high == last:
                    high = round_id
            windows.append((low, high))
        return windows

    def _read_rounds(
        self, assets: Sequence[TokenizedAsset], windows: Sequence[tuple[int, int]]
    ) -> list[list[_Round]]:
        calls = [
            (feed.address, feed.encode_abi("getRoundData", args=[round_id]))
            for asset, (low, high) in zip(assets, windows, strict=True)
            for feed in (self._feed(asset),)
            for round_id in range(low, high + 1)
        ]
        results = iter(self._aggregate(calls))
        return [
            [self._decode_round(next(results), round_id) for round_id in range(low, high + 1)]
            for low, high in windows
        ]

    def _feed(self, asset: TokenizedAsset) -> Any:
        return self.web3.eth.contract(
            address=self.web3.to_checksum_address(asset.feed_address), abi=_FEED_ABI
        )

    def _aggregate(self, calls: Sequence[tuple[str, Any]]) -> list[tuple[bool, bytes]]:
        multicall = self.web3.eth.contract(
            address=self.web3.to_checksum_address(self.source.multicall_address),
            abi=_MULTICALL_ABI,
        )
        results: list[tuple[bool, bytes]] = []
        for offset in range(0, len(calls), _CALLS_PER_BATCH):
            batch = calls[offset : offset + _CALLS_PER_BATCH]
            returned = multicall.functions.tryAggregate(False, batch).call(
                block_identifier=self._block
            )
            if len(returned) != len(batch):
                raise HistoryUnavailableError("incomplete price history batch")
            results += [(bool(success), bytes(data)) for success, data in returned]
        return results

    def _decode_round(self, result: tuple[bool, bytes], requested: int) -> _Round:
        current = _Round(*self.web3.codec.decode(_ROUND_TYPES, _payload(result)))
        if current.round_id != requested:
            raise HistoryRejectedError("price feed returned a different round")
        return current


def _payload(result: tuple[bool, bytes]) -> bytes:
    success, data = result
    if not success:
        # Every requested round exists, so a failed call is an RPC problem, not bad data.
        raise HistoryUnavailableError("price feed call failed")
    return data


def _sample_closes(
    asset: TokenizedAsset,
    rounds: Sequence[_Round],
    days: Sequence[date],
    start_ts: int,
    end_ts: int,
    block_time: int,
) -> tuple[dict[date, DailyClose], int]:
    """Each day's price is the last valid round at its cutoff, never a substituted value.

    Feeds publish on deviation or heartbeat, so a quiet day keeps its last round's price.
    """
    # Validate every fetched round before filtering on its timestamp: a corrupt
    # `updatedAt` would otherwise drop the round and let an older price stand in.
    previous: _Round | None = None
    for current in rounds:
        _validate_round(current, previous, block_time)
        previous = current
    in_window = [current for current in rounds if start_ts <= current.updated_at < end_ts]
    closes: dict[date, DailyClose] = {}
    index = -1
    for day in days:
        cutoff = _cutoff(day)
        while index + 1 < len(in_window) and in_window[index + 1].updated_at <= cutoff:
            index += 1
        if index < 0 or cutoff - in_window[index].updated_at > MAX_CLOSE_AGE_SECONDS:
            continue
        current = in_window[index]
        closes[day] = DailyClose(
            date=day,
            answer=str(current.answer),
            price=f"{Decimal(current.answer).scaleb(-asset.feed_decimals):f}",
            round_id=str(current.round_id),
            updated_at=_utc(current.updated_at),
        )
    return closes, len(in_window)


def _validate_round(current: _Round, previous: _Round | None, block_time: int) -> None:
    if (
        current.answer <= 0
        or current.started_at <= 0
        or current.updated_at < current.started_at
        or current.updated_at > block_time
        or current.answered_in_round < current.round_id
    ):
        raise HistoryRejectedError("invalid price round")
    if previous is not None:
        if current.updated_at < previous.updated_at:
            raise HistoryRejectedError("price rounds are out of order")
        move = abs(Decimal(current.answer) / Decimal(previous.answer) - 1)
        if move > MAX_ROUND_MOVE:
            raise HistoryRejectedError("price round moved implausibly; the allowlist needs review")


def _utc(timestamp: int) -> datetime:
    return datetime.fromtimestamp(timestamp, timezone.utc)


def _cutoff(day: date) -> int:
    return int(datetime.combine(day, CLOSE_CUTOFF, timezone.utc).timestamp())
