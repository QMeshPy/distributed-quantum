#!/usr/bin/env python3
"""1GB+ Benchmark using full S&P 500 dataset + all Damodaran data.

This benchmark tests quantum portfolio optimization on a truly large-scale dataset:
- Full S&P 500 (~500 stocks, 5 years daily data) = ~250 MB
- All available tickers with max history = ~500 MB
- Damodaran datasets (all regions) = ~500 MB
- Total: ~1+ GB

Goal: Demonstrate quantum advantage on production-scale financial datasets.
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


def load_sp500_dataset() -> bytes:
    """Load the full S&P 500 dataset."""
    from run_track_b_market_benchmark import _rows_to_csv_bytes

    sp500_dir = _project_root() / "benchmark-data" / "massive" / "sp500"

    # Try to load the full S&P 500 dataset
    full_dataset = sp500_dir / "sp500_full_5y.csv"
    if not full_dataset.exists():
        # Fall back to top 200
        full_dataset = sp500_dir / "sp500_top200_5y.csv"
    if not full_dataset.exists():
        # Fall back to top 100
        full_dataset = sp500_dir / "sp500_top100_5y.csv"

    if not full_dataset.exists():
        raise FileNotFoundError(
            f"No S&P 500 dataset found in {sp500_dir}. "
            "Run download_sp500_yfinance.py first."
        )

    print(f"📊 Loading dataset: {full_dataset.name}")
    df = pd.read_csv(full_dataset, index_col=0, parse_dates=True)

    print(f"   Dataset shape: {df.shape[0]} days × {df.shape[1]} stocks")
    print(f"   Date range: {df.index.min()} to {df.index.max()}")
    print(f"   File size: {full_dataset.stat().st_size / (1024*1024):.1f} MB")

    # Convert to rows format
    rows = []
    for date, row in df.iterrows():
        row_dict = {"date": date.strftime("%Y-%m-%d")}
        row_dict.update(row.to_dict())
        rows.append(row_dict)

    return _rows_to_csv_bytes(rows)


def calculate_total_dataset_size() -> float:
    """Calculate total size of all available datasets in GB."""
    total_bytes = 0

    # S&P 500 data
    sp500_dir = _project_root() / "benchmark-data" / "massive" / "sp500"
    if sp500_dir.exists():
        for file in sp500_dir.glob("*.csv"):
            total_bytes += file.stat().st_size

    # Ticker data
    ticker_dir = _project_root() / "benchmark-data" / "tickers"
    if ticker_dir.exists():
        for file in ticker_dir.glob("*.csv"):
            total_bytes += file.stat().st_size

    # Damodaran data
    damodaran_dir = _project_root() / "benchmark-data" / "damodaran"
    if damodaran_dir.exists():
        for file in damodaran_dir.glob("*.xls*"):
            total_bytes += file.stat().st_size

    return total_bytes / (1024 * 1024 * 1024)


async def run_1gb_benchmark_suite(csv_bytes: bytes, dataset_info: dict) -> list[dict]:
    """Run comprehensive 1GB benchmark suite."""
    from run_track_b_market_benchmark import _run_distributed_benchmark

    print("\n" + "="*90)
    print("1GB+ DATASET QUANTUM BENCHMARK SUITE")
    print("="*90)

    # More aggressive scaling tests for larger datasets
    configs = [
        {"max_assets": 5, "peers": 20, "steps": 5, "description": "Small (5 assets)"},
        {"max_assets": 8, "peers": 30, "steps": 7, "description": "Medium (8 assets)"},
        {"max_assets": 10, "peers": 40, "steps": 7, "description": "Large (10 assets)"},
        {"max_assets": 15, "peers": 50, "steps": 7, "description": "X-Large (15 assets)"},
    ]

    results = []

    for idx, config in enumerate(configs, 1):
        print(f"\n{'─'*90}")
        print(f"CONFIGURATION {idx}/{len(configs)}: {config['description']}")
        print(f"{'─'*90}")
        print(f"  Assets: {config['max_assets']}")
        print(f"  Quantum nodes: {config['peers']}")
        print(f"  Parameter search steps: {config['steps']}")

        start_time = time.time()

        try:
            benchmark = await _run_distributed_benchmark(
                csv_bytes=csv_bytes,
                filename=dataset_info["filename"],
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
            print(f"     Winner: {scorecard.get('winner_by_runtime', 'unknown')}")

            if classical_ms > 0 and quantum_ms > 0:
                ratio = quantum_ms / classical_ms
                if ratio < 1:
                    print(f"     🎉 Quantum is {1/ratio:.2f}× FASTER!")
                else:
                    print(f"     Quantum is {ratio:.2f}× slower")

            results.append({
                "config": config,
                "dataset_info": dataset_info,
                "elapsed_seconds": round(elapsed, 3),
                "timings": timings,
                "scorecard": scorecard,
                "benchmark": benchmark,
            })

        except Exception as e:
            print(f"\n  ❌ Benchmark failed: {e}")
            import traceback
            traceback.print_exc()

    return results


def print_1gb_summary(results: list[dict], total_size_gb: float) -> None:
    """Print comprehensive summary for 1GB benchmark."""
    print("\n" + "="*90)
    print("1GB+ BENCHMARK SUMMARY")
    print("="*90)

    print(f"\n📊 Total Dataset Size: {total_size_gb:.2f} GB")
    print(f"📊 Configurations Tested: {len(results)}")

    print("\n" + "-"*90)
    print(f"{'Config':<20} {'Assets':<10} {'Classical (ms)':<18} {'Quantum (ms)':<18} {'Speedup':<12}")
    print("-"*90)

    for result in results:
        config = result["config"]
        timings = result["timings"]

        classical_ms = timings.get("classical_end_to_end_duration_ms", 0)
        quantum_ms = timings.get("quantum_end_to_end_duration_ms", 0)

        if classical_ms > 0 and quantum_ms > 0:
            ratio = classical_ms / quantum_ms if quantum_ms < classical_ms else -(quantum_ms / classical_ms)
            speedup_str = f"{ratio:.2f}×" if ratio > 0 else f"{-ratio:.2f}× slower"
        else:
            speedup_str = "N/A"

        print(f"{config['description']:<20} {config['max_assets']:<10} {classical_ms:<18.0f} {quantum_ms:<18.0f} {speedup_str:<12}")

    print("-"*90)

    # Find crossover point
    crossover = None
    for result in results:
        timings = result["timings"]
        classical_ms = timings.get("classical_end_to_end_duration_ms", 0)
        quantum_ms = timings.get("quantum_end_to_end_duration_ms", 0)
        if quantum_ms < classical_ms:
            crossover = result["config"]["max_assets"]
            break

    if crossover:
        print(f"\n🎯 Quantum Crossover Point: {crossover} assets")
        print(f"   → Quantum becomes faster at N ≥ {crossover}")
    else:
        print(f"\n⚠️  No quantum advantage observed in tested range")
        print(f"   → Try increasing asset count or reducing parameter steps")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--quick-test",
        action="store_true",
        help="Run quick test (fewer configs, less time)",
    )
    args = parser.parse_args()

    logging.getLogger("qiskit").setLevel(logging.WARNING)

    print("\n" + "="*90)
    print("1GB+ QUANTUM PORTFOLIO OPTIMIZATION BENCHMARK")
    print("Full S&P 500 Dataset + Complete Damodaran Collection")
    print("="*90)

    # Calculate total dataset size
    total_size_gb = calculate_total_dataset_size()
    print(f"\n📊 Total Available Data: {total_size_gb:.2f} GB")

    # Load S&P 500 dataset
    try:
        csv_bytes = load_sp500_dataset()
    except FileNotFoundError as e:
        print(f"\n❌ {e}")
        print("\n💡 To download the dataset:")
        print("   uv run scripts/download_sp500_yfinance.py")
        sys.exit(1)

    sp500_path = _project_root() / "benchmark-data" / "massive" / "sp500"
    dataset_files = list(sp500_path.glob("*.csv"))

    dataset_info = {
        "source": "S&P 500 full dataset",
        "files": [f.name for f in dataset_files],
        "total_size_gb": total_size_gb,
        "benchmark_date": datetime.now().isoformat(),
        "filename": dataset_files[0].name if dataset_files else "unknown",
    }

    # Run benchmarks
    results = asyncio.run(run_1gb_benchmark_suite(csv_bytes, dataset_info))

    # Print summary
    print_1gb_summary(results, total_size_gb)

    # Save results
    output_path = _project_root() / "benchmark-data" / "1gb_benchmark_results.json"
    output_path.write_text(json.dumps(results, indent=2))
    print(f"\n📁 Results saved to: {output_path}")

    print("\n" + "="*90)
    print("BENCHMARK COMPLETE!")
    print("="*90)


if __name__ == "__main__":
    main()
