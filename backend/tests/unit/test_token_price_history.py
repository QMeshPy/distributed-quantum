"""History reader tests against real Robinhood Chain rounds recorded at one block."""

import random
from datetime import date, datetime, time, timedelta, timezone

import pytest
from robinhood_chain import BLOCK, FULL_RANGE, SOURCE, RecordedChain, read

from quantum_backend_v2.application.financial_portfolio import (
    PortfolioOptimizationConfig,
    build_portfolio_optimization_artifacts,
)
from quantum_backend_v2.chains.market_data import UnsupportedAssetError
from quantum_backend_v2.chains.price_history import (
    HistoryRejectedError,
    HistoryUnavailableError,
    InsufficientHistoryError,
)


def test_reads_aligned_daily_history_from_recorded_rounds():
    provider = RecordedChain()
    history = read(provider)

    assert history.chain_id == "eip155:4663"
    assert history.block_number == BLOCK["number"]
    assert history.block_hash == BLOCK["hash"]
    assert history.price_unit == "token_usd"
    spy, qqq = history.assets
    assert (spy.symbol, spy.feed_address, spy.feed_description) == (
        "SPY",
        "0x319724394D3A0e3669269846abE664Cd621f9f6A",
        "RHSPY / USD",
    )
    assert spy.token_address == "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C"
    assert len(spy.closes) == len(qqq.closes) == 89
    assert [close.date for close in spy.closes] == [close.date for close in qqq.closes]
    # Launch rounds were about 1e8x the real price and must never become data.
    first, last = spy.closes[0], spy.closes[-1]
    assert (first.date, first.price) == (date(2026, 6, 23), "736.83695000")
    # The block was read at 19:15 UTC on 2026-10-28, before that day's 21:00 cutoff.
    assert (last.date, last.price, last.answer) == (
        date(2026, 10, 27),
        "769.61492403",
        "76961492403",
    )
    assert last.round_id == str((1 << 64) | 185)
    assert last.updated_at == datetime(2026, 10, 27, 12, 23, 48, tzinfo=timezone.utc)
    assert qqq.closes[-1].price == "720.64366710"
    dates = {close.date for close in spy.closes}
    # Market holidays: neither feed published, so no zero-return day is added.
    assert date(2026, 7, 3) not in dates and date(2026, 9, 7) not in dates
    # A quiet trading day keeps SPY's last price from the previous evening.
    quiet = next(close for close in spy.closes if close.date == date(2026, 8, 27))
    assert quiet.updated_at == datetime(2026, 8, 26, 21, 15, 23, tzinfo=timezone.utc)


def reference_closes(dates):
    """Independent, deliberately naive implementation of the sampling rule."""
    first_valid = {"SPY": 8, "QQQ": 14}
    feeds = {
        symbol: [r for r in RecordedChain().rounds(symbol) if r[0] >= first_valid[symbol]]
        for symbol in first_valid
    }
    start, end = dates
    closes = {symbol: {} for symbol in feeds}
    active = set()
    day = start
    while day <= end:
        cutoff = datetime.combine(day, time(21), timezone.utc).timestamp()
        if cutoff > BLOCK["timestamp"]:
            break
        for symbol, rounds in feeds.items():
            if any(datetime.fromtimestamp(r[3], timezone.utc).date() == day for r in rounds):
                active.add(day)
            before = [r for r in rounds if r[3] <= cutoff]
            if day.weekday() < 5 and before and cutoff - before[-1][3] <= 36 * 3600:
                closes[symbol][day] = before[-1]
        day += timedelta(days=1)
    aligned = sorted(active & set(closes["SPY"]) & set(closes["QQQ"]))
    return aligned, closes


@pytest.mark.parametrize(
    "dates",
    [FULL_RANGE, (date(2026, 7, 1), date(2026, 9, 30)), (date(2026, 7, 20), date(2026, 10, 20))],
)
def test_sampling_matches_an_independent_reference(dates):
    assert_matches_reference(dates)


def test_random_windows_match_the_reference():
    generator = random.Random(18)
    checked = 0
    while checked < 25:
        start = date(2026, 6, 1) + timedelta(days=generator.randrange(60))
        end = start + timedelta(days=generator.randrange(85, 150))
        if end > date(2026, 10, 27):
            continue
        assert_matches_reference((start, end))
        checked += 1


def assert_matches_reference(dates):
    aligned, expected = reference_closes(dates)
    if len(aligned) < 60:
        with pytest.raises(InsufficientHistoryError):
            read(RecordedChain(), dates=dates)
        return
    history = read(RecordedChain(), dates=dates)
    for asset in history.assets:
        assert [close.date for close in asset.closes] == aligned
        for close in asset.closes:
            aggregator_round, answer, _, updated, _ = expected[asset.symbol][close.date]
            assert close.round_id == str((1 << 64) | aggregator_round)
            assert close.answer == answer
            assert close.price == f"{int(answer) / 10**8:.8f}"
            assert close.updated_at.timestamp() == updated


def test_wide_csv_feeds_the_existing_optimizer_unchanged():
    history = read(RecordedChain())
    csv_bytes = history.to_wide_csv()
    lines = csv_bytes.decode().splitlines()
    assert lines[0] == "date,SPY,QQQ"
    assert lines[1] == "2026-06-23,736.83695000,715.04500000"
    assert len(lines) == 90

    artifacts = build_portfolio_optimization_artifacts(
        csv_bytes=csv_bytes,
        job_id="fin-test",
        filename="robinhood-chainlink.csv",
        config=PortfolioOptimizationConfig(
            value_mode="prices", date_column="date", max_assets_considered=2
        ),
    )
    benchmark = artifacts.payload["benchmark"]
    for method in ("classical", "quantum"):
        assert set(benchmark[method]["selected_assets"]) <= {"SPY", "QQQ"}


def test_reads_only_with_pinned_multicall_eth_calls_in_few_batches():
    provider = RecordedChain()
    read(provider)
    # No signing, sending or account methods; the provider asserts every eth_call target.
    assert set(provider.methods) <= {"eth_chainId", "eth_getBlockByNumber", "eth_call"}
    assert provider.methods.count("eth_call") <= 4
    assert max(provider.batches) <= 1000


@pytest.mark.parametrize(
    ("dates", "message"),
    [
        # Too few weekdays is rejected before any RPC call.
        ((date(2026, 9, 1), date(2026, 10, 1)), "at least 60 weekdays"),
        # Enough weekdays, but only mis-scaled launch rounds exist before 2026-06-23.
        ((date(2026, 4, 1), date(2026, 7, 10)), "at least 60 aligned daily prices"),
    ],
)
def test_too_little_aligned_history_is_rejected(dates, message):
    provider = RecordedChain()
    with pytest.raises(InsufficientHistoryError, match=message):
        read(provider, dates=dates)
    if "weekdays" in message:
        assert provider.methods == []


@pytest.mark.parametrize(
    ("symbols", "error"),
    [
        (["SPY", "DOGE"], UnsupportedAssetError),
        (["SPY", "spy"], UnsupportedAssetError),
        (["SPY"], HistoryRejectedError),
        (["SPY", "SPY"], HistoryRejectedError),
        ([], HistoryRejectedError),
    ],
)
def test_unsupported_selections_fail_without_echoing_input(symbols, error):
    with pytest.raises(error) as caught:
        read(RecordedChain(), symbols=symbols)
    assert "DOGE" not in str(caught.value) and "spy" not in str(caught.value)


@pytest.mark.parametrize(
    "dates",
    [
        (date(2026, 10, 28), date(2026, 6, 1)),
        (date(2025, 6, 1), date(2026, 10, 28)),
        (date(2026, 6, 1), date(2026, 10, 29)),
    ],
)
def test_invalid_date_ranges_are_rejected(dates):
    with pytest.raises(HistoryRejectedError):
        read(RecordedChain(), dates=dates)


def corrupt(field, value, index=100):
    def apply(provider):
        provider.rounds("SPY")[index][field] = value

    return apply


def reorder(provider):
    rounds = provider.rounds("SPY")
    rounds[100][2] = rounds[100][3] = rounds[99][3] - 1


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (corrupt(1, "0"), "invalid price round"),
        (corrupt(1, "-1"), "invalid price round"),
        # The launch defect: one round at about 1e8x the real price.
        (corrupt(1, "7429406277700000000"), "moved implausibly"),
        (corrupt(2, 0), "invalid price round"),
        (corrupt(4, 99), "invalid price round"),
        (reorder, "out of order"),
    ],
)
def test_invalid_rounds_inside_the_window_reject_the_history(mutate, message):
    provider = RecordedChain()
    mutate(provider)
    with pytest.raises(HistoryRejectedError, match=message):
        read(provider)


def spy_round(number):
    rounds = RecordedChain().rounds("SPY")
    return next(i for i, item in enumerate(rounds) if int(item[0]) & (2**64 - 1) == number)


@pytest.mark.parametrize("updated_at", [0, BLOCK["timestamp"] + 1])
def test_a_corrupt_timestamp_cannot_drop_a_round_from_the_window(updated_at):
    # Round 184 is SPY's October 26 close. Filtering on its timestamp before validating
    # it would quietly substitute round 183's older price for that day.
    provider = RecordedChain()
    corrupt(3, updated_at, index=spy_round(184))(provider)
    with pytest.raises(HistoryRejectedError, match="invalid price round"):
        read(provider)


def test_a_missing_round_is_never_skipped():
    provider = RecordedChain()
    feed = next(f for f in provider.feeds.values() if f["symbol"] == "SPY")
    feed["rounds"][100][0] = 10_000  # The node answers a different round than requested.
    with pytest.raises(HistoryRejectedError, match="different round"):
        read(provider)


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda p: setattr(p, "chain_id", 46630), "different chain"),
        (lambda p: setattr(p, "reorg", True), "block changed"),
        (lambda p: setattr(p, "timestamp", BLOCK["timestamp"] + 8 * 86400), "stopped updating"),
    ],
)
def test_unreliable_reads_are_unavailable(mutate, message):
    provider = RecordedChain()
    mutate(provider)
    with pytest.raises(HistoryUnavailableError, match=message):
        read(provider, dates=(date(2026, 6, 1), date(2026, 10, 20)))


def test_holiday_weekend_silence_is_not_a_stopped_feed():
    # A Friday holiday leaves about 104h without rounds (Thursday evening to Monday).
    provider = RecordedChain()
    provider.timestamp = BLOCK["timestamp"] + 5 * 86400
    history = read(provider, dates=(date(2026, 6, 1), date(2026, 10, 20)))
    assert history.assets[0].closes[-1].date == date(2026, 10, 20)


def test_a_failed_batch_call_is_unavailable_not_rejected():
    provider = RecordedChain()
    feed = next(f for f in provider.feeds.values() if f["symbol"] == "SPY")
    del feed["rounds"][150:]  # Rounds the node can no longer answer.
    feed["rounds"].append([999, "77294062777", 1793190217, 1793190229, 999])
    with pytest.raises(HistoryUnavailableError, match="call failed"):
        read(provider)


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("description", "SPY / USD", "reviewed allowlist"),
        ("decimals", 18, "reviewed allowlist"),
        ("phase_id", 2, "phase changed"),
    ],
)
def test_feeds_that_drift_from_the_allowlist_are_unavailable(field, value, message):
    provider = RecordedChain()
    feed = next(f for f in provider.feeds.values() if f["symbol"] == "QQQ")
    feed[field] = value
    with pytest.raises(HistoryUnavailableError, match=message):
        read(provider)


def test_rpc_errors_never_expose_the_endpoint():
    provider = RecordedChain()
    provider.error = RuntimeError("https://user:TOP_SECRET@rpc.example/key")
    with pytest.raises(HistoryUnavailableError) as caught:
        read(provider)
    assert "TOP_SECRET" not in str(caught.value)
    assert caught.value.__cause__ is None


def test_a_feed_silent_on_trading_days_gets_no_carried_price():
    # A halted asset must not reuse an old price while other feeds keep trading.
    from quantum_backend_v2.chains import price_history

    asset = SOURCE.asset("SPY")
    silent = (
        datetime(2026, 8, 10, tzinfo=timezone.utc).timestamp(),
        datetime(2026, 8, 12, 21, tzinfo=timezone.utc).timestamp(),
    )
    rounds = [
        price_history._Round(
            (1 << 64) | aggregator_round, int(answer), started, updated, (1 << 64) | answered
        )
        for aggregator_round, answer, started, updated, answered in RecordedChain().rounds("SPY")
        if aggregator_round >= asset.first_valid_round and not silent[0] <= updated <= silent[1]
    ]
    days = price_history.sampling_dates(date(2026, 8, 3), date(2026, 8, 14))
    closes, _ = price_history._sample_closes(
        asset, rounds, days, 0, int(silent[1]) + 3 * 86400, BLOCK["timestamp"]
    )
    assert date(2026, 8, 7) in closes and date(2026, 8, 13) in closes
    assert not {date(2026, 8, 10), date(2026, 8, 11), date(2026, 8, 12)} & set(closes)
