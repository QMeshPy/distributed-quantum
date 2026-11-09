"""Read-only wallet holdings → priced portfolio → VaR/CVaR (issue #19).

Uses registry EVM adapters for balances. Never prompts for signatures or approvals.
Unpriceable tokens are returned explicitly and excluded from risk weights.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from requests import Session
from web3 import Web3

from quantum_backend_v2.api.models.wallet_portfolio import (
    HoldingSource,
    PricedHolding,
    UnpriceableHolding,
    WalletPortfolioAnalysisResponse,
    WalletPortfolioRiskSummary,
)
from quantum_backend_v2.application.risk_engine import compute_equity_risk
from quantum_backend_v2.chains.adapter import EvmRpcAdapter, UnsupportedOperationError
from quantum_backend_v2.chains.models import ChainRegistry, ChainSpec, DisabledNetworkError
from quantum_backend_v2.chains.prices import (
    EvmPriceAdapter,
    PriceRejectedError,
    PriceUnavailableError,
)
from quantum_backend_v2.chains.rpc import RpcConfigurationError, resolve_rpc_url

_ZERO = Decimal("0")
_ONE = Decimal("1")


@dataclass(frozen=True)
class _RawHolding:
    network: str
    chain: ChainSpec
    symbol: str
    kind: str  # native | stablecoin
    token_address: str | None
    balance: Decimal
    decimals: int
    observed_at: datetime


def _web3(rpc_url: str) -> Web3:
    session = Session()
    return Web3(
        Web3.HTTPProvider(
            rpc_url,
            session=session,
            request_kwargs={"timeout": 15},
            exception_retry_configuration=None,
        )
    )


def _close_web3(web3: Web3) -> None:
    provider = web3.provider
    session = getattr(provider, "session", None) or getattr(
        provider, "_request_session", None
    )
    if session is not None and hasattr(session, "close"):
        session.close()


def _enabled_balance_chains(
    registry: ChainRegistry, networks: list[str]
) -> list[tuple[str, ChainSpec]]:
    """Resolve requested networks, keeping one entry per chain_id."""
    if networks:
        selected: list[tuple[str, ChainSpec]] = []
        seen: set[str] = set()
        for name in networks:
            chain = registry.resolve(name)
            if chain.chain_id in seen:
                continue
            seen.add(chain.chain_id)
            selected.append((name, chain))
        return selected
    out: list[tuple[str, ChainSpec]] = []
    for chain in registry.chains:
        if (
            chain.enabled
            and chain.family == "evm"
            and "get_balance" in chain.capabilities
        ):
            alias = chain.aliases[0] if chain.aliases else chain.chain_id
            out.append((alias, chain))
    return out


def fetch_raw_holdings(
    *,
    registry: ChainRegistry,
    address: str,
    networks: list[str],
    env: Mapping[str, str] | None = None,
) -> list[_RawHolding]:
    """Pull native + stablecoin balances for each requested EVM network."""
    environ = os.environ if env is None else env
    now = datetime.now(timezone.utc)
    holdings: list[_RawHolding] = []
    for network, chain in _enabled_balance_chains(registry, networks):
        if chain.family != "evm":
            continue
        if "get_balance" not in chain.capabilities:
            raise UnsupportedOperationError(
                f"{network} does not support get_balance"
            )
        if not chain.enabled:
            raise DisabledNetworkError(f"{network} is disabled")
        rpc_url = resolve_rpc_url(chain, environ)
        web3 = _web3(rpc_url)
        try:
            balance = EvmRpcAdapter(chain, web3).get_balance(address)
        finally:
            _close_web3(web3)

        holdings.append(
            _RawHolding(
                network=network,
                chain=chain,
                symbol=chain.native_token.symbol,
                kind="native",
                token_address=None,
                balance=balance.native,
                decimals=chain.native_token.decimals,
                observed_at=now,
            )
        )
        if chain.stablecoin is not None and balance.stablecoin is not None:
            holdings.append(
                _RawHolding(
                    network=network,
                    chain=chain,
                    symbol=chain.stablecoin.symbol,
                    kind="stablecoin",
                    token_address=chain.stablecoin.address,
                    balance=balance.stablecoin,
                    decimals=chain.stablecoin.decimals,
                    observed_at=now,
                )
            )
    return holdings


def _eth_market_reference() -> Decimal | None:
    """Single independent ETH/USD spot used to validate Chainlink observations.

    Without this reference we refuse to price ETH rather than probing alternate
    references that would weaken the feed deviation check.
    """
    try:
        import yfinance as yf  # type: ignore[import]

        hist = yf.Ticker("ETH-USD").history(period="5d")
        if not hist.empty:
            spot = Decimal(str(float(hist["Close"].iloc[-1])))
            if spot > 0:
                return spot
    except Exception:
        return None
    return None


def _price_native_usd(
    registry: ChainRegistry,
    env: Mapping[str, str],
) -> tuple[Decimal, HoldingSource] | None:
    """Price native ETH via a registry chain that exposes eth-usd.

    Uses one market reference. If the feed fails validation against that
    reference, ETH stays unpriceable (no reference ladder retries).
    """
    reference = _eth_market_reference()
    if reference is None:
        return None
    for chain in registry.chains:
        if (
            not chain.enabled
            or chain.family != "evm"
            or "get_price" not in chain.capabilities
            or "eth-usd" not in chain.price_feeds
        ):
            continue
        try:
            rpc_url = resolve_rpc_url(chain, env)
        except RpcConfigurationError:
            continue
        web3 = _web3(rpc_url)
        try:
            try:
                observation = EvmPriceAdapter(chain, web3).get_price(
                    "eth-usd", reference
                )
            except (PriceRejectedError, PriceUnavailableError):
                continue
            alias = chain.aliases[0] if chain.aliases else chain.chain_id
            return Decimal(observation.value), HoldingSource(
                kind="chainlink",
                detail=(
                    f"{alias}:eth-usd "
                    f"(validated vs market reference {format(reference, 'f')} USD)"
                ),
                observed_at=observation.observed_at,
            )
        finally:
            _close_web3(web3)
    return None


def price_holdings(
    *,
    registry: ChainRegistry,
    raw: list[_RawHolding],
    env: Mapping[str, str] | None = None,
) -> tuple[list[PricedHolding], list[UnpriceableHolding], list[HoldingSource]]:
    environ = os.environ if env is None else env
    priced: list[PricedHolding] = []
    unpriceable: list[UnpriceableHolding] = []
    sources: list[HoldingSource] = []
    eth_price: Decimal | None = None
    eth_source: HoldingSource | None = None
    eth_attempted = False

    for item in raw:
        if item.balance <= _ZERO:
            continue
        if item.kind == "stablecoin":
            price = _ONE
            source = HoldingSource(
                kind="stablecoin-peg",
                detail=f"assumed 1.00 USD peg for {item.symbol}",
                observed_at=item.observed_at,
            )
            sources.append(source)
            value = item.balance * price
            priced.append(
                PricedHolding(
                    network=item.network,
                    chain_id=item.chain.chain_id,
                    symbol=item.symbol,
                    kind="stablecoin",
                    token_address=item.token_address,
                    balance=format(item.balance, "f"),
                    decimals=item.decimals,
                    price_usd=format(price, "f"),
                    value_usd=format(value, "f"),
                    weight=0.0,
                    source=source,
                )
            )
            continue

        if not eth_attempted:
            eth_attempted = True
            priced_native = _price_native_usd(registry, environ)
            if priced_native is not None:
                eth_price, eth_source = priced_native
                sources.append(eth_source)
        if eth_price is None or eth_source is None:
            unpriceable.append(
                UnpriceableHolding(
                    network=item.network,
                    chain_id=item.chain.chain_id,
                    symbol=item.symbol,
                    kind="native",
                    token_address=None,
                    balance=format(item.balance, "f"),
                    decimals=item.decimals,
                    reason=(
                        "eth-usd Chainlink observation failed validation against a "
                        "single independent market reference, or no reference / feed "
                        "was available"
                    ),
                    observed_at=item.observed_at,
                )
            )
            continue
        value = item.balance * eth_price
        priced.append(
            PricedHolding(
                network=item.network,
                chain_id=item.chain.chain_id,
                symbol=item.symbol,
                kind="native",
                token_address=None,
                balance=format(item.balance, "f"),
                decimals=item.decimals,
                price_usd=format(eth_price, "f"),
                value_usd=format(value, "f"),
                weight=0.0,
                source=eth_source,
            )
        )

    total = sum((Decimal(h.value_usd) for h in priced), _ZERO)
    if total > _ZERO:
        priced = [
            h.model_copy(update={"weight": float(Decimal(h.value_usd) / total)})
            for h in priced
        ]
    return priced, unpriceable, sources


def _fetch_eth_return_series(
    lookback_days: int,
) -> tuple[Any, HoldingSource]:
    """Return ETH log-returns plus an explicit history or simulation source."""
    import numpy as np

    now = datetime.now(timezone.utc)
    try:
        import yfinance as yf  # type: ignore[import]
        import pandas as pd

        period = f"{max(lookback_days // 252 + 1, 2)}y"
        raw = yf.download(
            ["ETH-USD"], period=period, auto_adjust=True, progress=False
        )["Close"]
        if isinstance(raw, pd.Series):
            raw = raw.to_frame(name="ETH-USD")
        raw = raw.ffill().dropna()
        log_ret = np.log(raw / raw.shift(1)).dropna().values
        if log_ret.size == 0:
            raise RuntimeError("empty ETH-USD history")
        series = log_ret[-lookback_days:] if len(log_ret) > lookback_days else log_ret
        source = HoldingSource(
            kind="eth-usd-history",
            detail="yfinance ETH-USD daily log-returns",
            observed_at=now,
        )
        return series, source
    except Exception:
        rng = np.random.default_rng(42)
        series = rng.normal(-0.0001, 0.02, size=(lookback_days, 1))
        source = HoldingSource(
            kind="synthetic-simulation",
            detail=(
                "ETH-USD market history unavailable; risk uses simulated returns "
                "(not live market history)"
            ),
            observed_at=now,
        )
        return series, source


def _historical_returns_for_holdings(
    priced: list[PricedHolding], lookback_days: int
) -> tuple[list[list[float]], HoldingSource]:
    """Build return matrix: ETH-like series for native, near-zero for stablecoins."""
    import numpy as np

    n = len(priced)
    if n == 0:
        empty = HoldingSource(
            kind="none",
            detail="no priced holdings",
            observed_at=datetime.now(timezone.utc),
        )
        return [], empty
    eth_series, history_source = _fetch_eth_return_series(lookback_days)
    t = eth_series.shape[0]
    matrix = np.zeros((t, n), dtype=float)
    rng = np.random.default_rng(7)
    for i, holding in enumerate(priced):
        if holding.kind == "native":
            matrix[:, i] = eth_series[:, 0]
        else:
            # Stablecoin: tiny noise so covariance stays well-conditioned.
            matrix[:, i] = rng.normal(0.0, 1e-5, size=t)
    return matrix.tolist(), history_source


def run_portfolio_risk(
    priced: list[PricedHolding],
    *,
    lookback_days: int,
    num_uncertainty_qubits: int,
    epsilon: float,
    alpha: float,
) -> tuple[WalletPortfolioRiskSummary, dict[str, Any], list[HoldingSource]]:
    if not priced:
        empty = WalletPortfolioRiskSummary(
            portfolio_value_usd=0.0,
            classical_var_95=0.0,
            classical_var_99=0.0,
            classical_cvar_99=0.0,
            confidence_note="No priceable holdings to analyze.",
        )
        return empty, {}, []

    holdings_payload = [
        {
            "ticker": f"{h.symbol}-{h.network}",
            "weight": h.weight,
            "quantity": float(h.balance),
            "current_value": float(h.value_usd),
        }
        for h in priced
    ]
    historical, history_source = _historical_returns_for_holdings(priced, lookback_days)
    result = compute_equity_risk(
        {
            "job_id": "wallet-portfolio",
            "holdings": holdings_payload,
            "lookback_days": lookback_days,
            "num_uncertainty_qubits": num_uncertainty_qubits,
            "epsilon": epsilon,
            "alpha": alpha,
            "historical_returns": historical,
        }
    )
    portfolio_value = float(sum(Decimal(h.value_usd) for h in priced))
    var_map = {row["confidence_level"]: row for row in result["var_results"]}

    def _usd(fraction: float) -> float:
        return round(fraction * portfolio_value, 6)

    if history_source.kind == "synthetic-simulation":
        history_note = (
            "Return history is a synthetic simulation because ETH-USD market data "
            "was unavailable; treat VaR/CVaR as illustrative only."
        )
    else:
        history_note = "Native assets use ETH-USD market history for returns."

    summary = WalletPortfolioRiskSummary(
        portfolio_value_usd=round(portfolio_value, 6),
        classical_var_95=_usd(float(var_map[0.95]["classical_mc_var"])),
        classical_var_99=_usd(float(var_map[0.99]["classical_mc_var"])),
        classical_cvar_99=_usd(float(result["classical_mc_cvar_99"])),
        quantum_var_95=_usd(float(var_map[0.95]["quantum_var"])),
        quantum_var_99=_usd(float(var_map[0.99]["quantum_var"])),
        quantum_cvar_99=_usd(float(result["quantum_cvar_99"])),
        confidence_note=(
            "VaR/CVaR are loss fractions applied to marked portfolio USD value. "
            f"{history_note} Stablecoins use a 1.00 USD peg assumption."
        ),
    )
    return summary, result, [history_source]


async def analyze_wallet_portfolio(
    *,
    registry: ChainRegistry,
    address: str,
    networks: list[str],
    lookback_days: int = 252,
    num_uncertainty_qubits: int = 4,
    epsilon: float = 0.05,
    alpha: float = 0.05,
    env: Mapping[str, str] | None = None,
) -> WalletPortfolioAnalysisResponse:
    environ = os.environ if env is None else env
    checksum = Web3.to_checksum_address(address)

    def _work() -> WalletPortfolioAnalysisResponse:
        raw = fetch_raw_holdings(
            registry=registry, address=checksum, networks=networks, env=environ
        )
        priced, unpriceable, sources = price_holdings(
            registry=registry, raw=raw, env=environ
        )
        notes: list[str] = [
            "Read-only analysis: no wallet prompts, approvals, or transactions.",
            "ENS names should be resolved to an address before calling this API.",
        ]
        if unpriceable:
            notes.append(
                f"{len(unpriceable)} holding(s) could not be priced and were excluded "
                "from VaR weights (listed under unpriceable_holdings)."
            )
        risk: WalletPortfolioRiskSummary | None = None
        risk_job: dict[str, Any] | None = None
        if priced:
            risk, risk_job, history_sources = run_portfolio_risk(
                priced,
                lookback_days=lookback_days,
                num_uncertainty_qubits=num_uncertainty_qubits,
                epsilon=epsilon,
                alpha=alpha,
            )
            sources.extend(history_sources)
            if any(s.kind == "synthetic-simulation" for s in history_sources):
                notes.append(
                    "Risk metrics used simulated returns because live ETH-USD history "
                    "was unavailable."
                )
        else:
            notes.append("No priceable holdings found; risk metrics omitted.")

        analyzed_networks = sorted(
            {h.network for h in priced} | {h.network for h in unpriceable}
        )
        return WalletPortfolioAnalysisResponse(
            address=checksum,
            analyzed_at=datetime.now(timezone.utc),
            networks=analyzed_networks,
            priced_holdings=priced,
            unpriceable_holdings=unpriceable,
            risk=risk,
            risk_job=risk_job,
            data_sources=sources,
            notes=notes,
        )

    return await asyncio.to_thread(_work)
