#!/usr/bin/env python3
"""Benchmark quantum vs classical by individual ticker and ticker combinations.

This script tests portfolio optimization performance for:
1. Individual tickers (single-asset baseline)
2. Sector-based combinations (e.g., Tech: AAPL+GOOG+MSFT+NVDA)
3. Industry diversification (e.g., Tech+Finance+Energy+Healthcare)
4. Full portfolio (all 8 tickers)

Results are organized by ticker to understand which assets contribute most
to quantum advantage.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_ticker_data(ticker: str) -> pd.DataFrame | None:
    """Load data for a specific ticker."""
    ticker_dir = _project_root() / "benchmark-data" / "tickers"
    ticker_file = ticker_dir / f"{ticker}_max.csv"

    if not ticker_file.exists():
        return None

    df = pd.read_csv(ticker_file, index_col=0, parse_dates=True)
    return df


def create_portfolio_csv(tickers: list[str], max_days: int = None) -> bytes:
    """Create combined CSV for multiple tickers."""
    from run_track_b_market_benchmark import _rows_to_csv_bytes

    combined_data = None

    for ticker in tickers:
        df = load_ticker_data(ticker)
        if df is None:
            print(f"  ⚠️  Ticker {ticker} not found, skipping")
            continue

        if 'Close' in df.columns:
            prices = df[['Close']].rename(columns={'Close': ticker})
        else:
            print(f"  ⚠️  No Close price for {ticker}, skipping")
            continue

        if combined_data is None:
            combined_data = prices
        else:
            combined_data = combined_data.join(prices, how='outer')

    if combined_data is None or combined_data.empty:
        raise ValueError(f"No data available for tickers: {tickers}")

    # Drop rows with missing data
    combined_data = combined_data.dropna()

    # Limit to recent data if specified
    if max_days and len(combined_data) > max_days:
        combined_data = combined_data.tail(max_days)

    print(f"  ✓ Combined: {combined_data.shape[0]} days × {combined_data.shape[1]} tickers")

    # Convert to CSV format
    rows = []
    for date, row in combined_data.iterrows():
        # Handle both datetime and string indices
        if hasattr(date, 'strftime'):
            date_str = date.strftime("%Y-%m-%d")
        else:
            date_str = str(date)

        row_dict = {"date": date_str}
        row_dict.update(row.to_dict())
        rows.append(row_dict)

    return _rows_to_csv_bytes(rows)


async def run_ticker_benchmark(
    tickers: list[str],
    portfolio_name: str,
    config: dict,
) -> dict:
    """Run benchmark for a specific ticker combination."""
    from run_track_b_market_benchmark import _run_distributed_benchmark

    print(f"\n{'─'*90}")
    print(f"PORTFOLIO: {portfolio_name}")
    print(f"{'─'*90}")
    print(f"  Tickers: {', '.join(tickers)}")
    print(f"  Assets to optimize: {config['max_assets']}")
    print(f"  Quantum nodes: {config['peers']}")

    try:
        # Create portfolio data
        csv_bytes = create_portfolio_csv(tickers, max_days=1000)  # Use recent 1000 days

        start_time = time.time()

        benchmark = await _run_distributed_benchmark(
            csv_bytes=csv_bytes,
            filename=f"{portfolio_name}.csv",
            peer_count=config["peers"],
            max_assets_considered=config["max_assets"],
            parameter_search_steps=config["steps"],
            budget=None,
        )

        elapsed = time.time() - start_time
        timings = benchmark.get("timings", {})
        scorecard = benchmark.get("comparison_report", {}).get("scorecard", {})

        classical_ms = timings.get("classical_end_to_end_duration_ms", 0)
        quantum_ms = timings.get("quantum_end_to_end_duration_ms", 0)

        print(f"\n  ✅ Completed in {elapsed:.2f}s")
        print(f"     Classical: {classical_ms:.0f}ms")
        print(f"     Quantum: {quantum_ms:.0f}ms")

        if classical_ms > 0 and quantum_ms > 0:
            ratio = quantum_ms / classical_ms
            if ratio < 1:
                speedup = 1 / ratio
                print(f"     🎉 Quantum is {speedup:.2f}× FASTER!")
            else:
                print(f"     Quantum is {ratio:.2f}× slower")

        return {
            "portfolio_name": portfolio_name,
            "tickers": tickers,
            "config": config,
            "elapsed_seconds": round(elapsed, 3),
            "timings": timings,
            "scorecard": scorecard,
            "benchmark": benchmark,
        }

    except Exception as e:
        print(f"\n  ❌ Benchmark failed: {e}")
        import traceback
        traceback.print_exc()
        return {
            "portfolio_name": portfolio_name,
            "tickers": tickers,
            "config": config,
            "error": str(e),
        }


def print_ticker_summary(results: list[dict]) -> None:
    """Print summary organized by ticker/portfolio."""
    print("\n" + "="*90)
    print("TICKER-BASED BENCHMARK SUMMARY")
    print("="*90)

    # Group by portfolio type
    portfolios = {}
    for result in results:
        portfolio_type = result.get("portfolio_name", "Unknown")
        if portfolio_type not in portfolios:
            portfolios[portfolio_type] = []
        portfolios[portfolio_type].append(result)

    # Print by category
    categories = [
        ("Tech Stocks", ["Tech_4", "Tech_All"]),
        ("Diversified", ["Diversified_4", "Diversified_6", "Full_8"]),
        ("Sector Combinations", ["Tech_Finance", "Tech_Energy", "Tech_Healthcare"]),
    ]

    for category_name, portfolio_names in categories:
        category_results = []
        for pname in portfolio_names:
            if pname in portfolios:
                category_results.extend(portfolios[pname])

        if not category_results:
            continue

        print(f"\n## {category_name}")
        print("-"*90)
        print(f"{'Portfolio':<20} {'Tickers':<30} {'Classical':<12} {'Quantum':<12} {'Winner':<12}")
        print("-"*90)

        for result in category_results:
            if "error" in result:
                continue

            portfolio = result["portfolio_name"]
            tickers = "+".join(result["tickers"])
            if len(tickers) > 28:
                tickers = tickers[:25] + "..."

            timings = result["timings"]
            classical_ms = timings.get("classical_end_to_end_duration_ms", 0)
            quantum_ms = timings.get("quantum_end_to_end_duration_ms", 0)

            if classical_ms > 0 and quantum_ms > 0:
                if quantum_ms < classical_ms:
                    winner = f"🏆 Q {classical_ms/quantum_ms:.1f}×"
                else:
                    winner = f"C {quantum_ms/classical_ms:.1f}×"
            else:
                winner = "N/A"

            print(f"{portfolio:<20} {tickers:<30} {classical_ms:<12.0f} {quantum_ms:<12.0f} {winner:<12}")

    print("-"*90)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Quick test (fewer portfolios)",
    )
    parser.add_argument(
        "--sector",
        choices=["tech", "finance", "energy", "healthcare", "all"],
        default="all",
        help="Test specific sector only",
    )
    args = parser.parse_args()

    logging.getLogger("qiskit").setLevel(logging.WARNING)

    print("\n" + "="*90)
    print("TICKER-BASED QUANTUM PORTFOLIO OPTIMIZATION BENCHMARK")
    print("="*90)

    # Define portfolios to test
    portfolios = []

    # Tech stocks
    if args.sector in ["tech", "all"]:
        portfolios.extend([
            {
                "name": "Tech_4",
                "tickers": ["AAPL", "GOOG", "MSFT", "NVDA"],
                "config": {"max_assets": 4, "peers": 20, "steps": 5},
            },
        ])

    # Diversified portfolios
    if args.sector == "all":
        portfolios.extend([
            {
                "name": "Diversified_4",
                "tickers": ["AAPL", "JPM", "XOM", "JNJ"],
                "config": {"max_assets": 4, "peers": 20, "steps": 5},
            },
            {
                "name": "Diversified_6",
                "tickers": ["AAPL", "GOOG", "JPM", "XOM", "JNJ", "NVDA"],
                "config": {"max_assets": 6, "peers": 30, "steps": 7},
            },
            {
                "name": "Full_8",
                "tickers": ["AAPL", "GOOG", "MSFT", "NVDA", "TSLA", "JPM", "XOM", "JNJ"],
                "config": {"max_assets": 8, "peers": 40, "steps": 7},
            },
        ])

    # Sector combinations
    if not args.quick and args.sector == "all":
        portfolios.extend([
            {
                "name": "Tech_Finance",
                "tickers": ["AAPL", "MSFT", "JPM"],
                "config": {"max_assets": 3, "peers": 15, "steps": 5},
            },
            {
                "name": "Tech_Energy",
                "tickers": ["NVDA", "TSLA", "XOM"],
                "config": {"max_assets": 3, "peers": 15, "steps": 5},
            },
            {
                "name": "Tech_Healthcare",
                "tickers": ["GOOG", "MSFT", "JNJ"],
                "config": {"max_assets": 3, "peers": 15, "steps": 5},
            },
        ])

    print(f"\n📊 Testing {len(portfolios)} portfolio configurations")

    # Run benchmarks
    results = []
    for portfolio in portfolios:
        result = asyncio.run(
            run_ticker_benchmark(
                tickers=portfolio["tickers"],
                portfolio_name=portfolio["name"],
                config=portfolio["config"],
            )
        )
        results.append(result)

    # Print summary
    print_ticker_summary(results)

    # Save results
    output_path = _project_root() / "benchmark-data" / "ticker_benchmark_results.json"
    output_path.write_text(json.dumps(results, indent=2))
    print(f"\n📁 Results saved to: {output_path}")

    print("\n" + "="*90)
    print("BENCHMARK COMPLETE!")
    print("="*90)


if __name__ == "__main__":
    main()
