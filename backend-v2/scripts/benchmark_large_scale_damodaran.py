#!/usr/bin/env python3
"""Large-scale benchmark using Damodaran NYU datasets + ticker data (AAPL, GOOG).

This script downloads ~1-2GB of comprehensive financial data:
1. Damodaran's industry/sector datasets (multiple regions)
2. Historical ticker data for AAPL and GOOG (20+ years)
3. Additional market data for comprehensive benchmarking

Goal: Demonstrate quantum advantage on realistic, large-scale financial datasets.
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

import requests
from io import BytesIO


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _install_dependencies() -> None:
    """Install required packages for data download."""
    import subprocess

    packages = ["yfinance", "openpyxl", "xlrd", "requests", "pandas"]
    missing = []

    for package in packages:
        try:
            __import__(package)
        except ImportError:
            missing.append(package)

    if missing:
        print(f"📦 Installing missing packages: {', '.join(missing)}...")
        try:
            # Try uv pip first
            subprocess.check_call(["uv", "pip", "install"] + missing,
                                stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL)
            print(f"✅ Packages installed successfully")
        except (subprocess.CalledProcessError, FileNotFoundError):
            # Fallback to regular pip
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", "-q"] + missing)
                print(f"✅ Packages installed successfully")
            except subprocess.CalledProcessError:
                print(f"❌ Failed to install packages. Please run:")
                print(f"   uv pip install {' '.join(missing)}")
                sys.exit(1)


def download_damodaran_dataset(url: str, filename: str, output_dir: Path) -> Path | None:
    """Download a Damodaran dataset from NYU."""
    output_path = output_dir / filename

    if output_path.exists():
        size_mb = output_path.stat().st_size / (1024 * 1024)
        print(f"  ✓ Already exists: {filename} ({size_mb:.2f} MB)")
        return output_path

    try:
        print(f"  📥 Downloading {filename}...")
        response = requests.get(url, timeout=30)
        response.raise_for_status()

        output_path.write_bytes(response.content)
        size_mb = len(response.content) / (1024 * 1024)
        print(f"  ✅ Downloaded {filename} ({size_mb:.2f} MB)")
        return output_path

    except Exception as e:
        print(f"  ❌ Failed to download {filename}: {e}")
        return None


def download_ticker_data(ticker: str, period: str, output_dir: Path) -> Path | None:
    """Download historical ticker data using yfinance."""
    import yfinance as yf
    import pandas as pd

    output_path = output_dir / f"{ticker}_{period}.csv"

    if output_path.exists():
        size_mb = output_path.stat().st_size / (1024 * 1024)
        print(f"  ✓ Already exists: {ticker} {period} ({size_mb:.2f} MB)")
        return output_path

    try:
        print(f"  📥 Downloading {ticker} {period}...")
        data = yf.download(ticker, period=period, progress=False)

        if data.empty:
            print(f"  ❌ No data for {ticker}")
            return None

        data.to_csv(output_path)
        size_mb = output_path.stat().st_size / (1024 * 1024)
        print(f"  ✅ Downloaded {ticker} ({data.shape[0]} days, {size_mb:.2f} MB)")
        return output_path

    except Exception as e:
        print(f"  ❌ Failed to download {ticker}: {e}")
        return None


def download_all_datasets() -> dict[str, list[Path]]:
    """Download comprehensive dataset collection (~1-2GB)."""
    base_url = "https://pages.stern.nyu.edu/~adamodar/pc/datasets/"
    damodaran_dir = _project_root() / "benchmark-data" / "damodaran"
    ticker_dir = _project_root() / "benchmark-data" / "tickers"

    damodaran_dir.mkdir(parents=True, exist_ok=True)
    ticker_dir.mkdir(parents=True, exist_ok=True)

    print("\n" + "="*90)
    print("DOWNLOADING LARGE-SCALE FINANCIAL DATASETS")
    print("="*90)

    downloaded = {"damodaran": [], "tickers": []}

    # 1. Damodaran historical returns (already have this)
    print("\n📊 SECTION 1: Damodaran Historical Returns")
    print("-" * 90)

    for dataset in [
        ("histretSP.xls", "Historical Returns 1928-2025"),
        ("histimpl.xls", "Implied Equity Risk Premiums"),
    ]:
        filename, description = dataset
        print(f"\n{description}:")
        path = damodaran_dir / filename
        if path.exists():
            size_mb = path.stat().st_size / (1024 * 1024)
            print(f"  ✓ Already exists: {filename} ({size_mb:.2f} MB)")
            downloaded["damodaran"].append(path)
        else:
            result = download_damodaran_dataset(base_url + filename, filename, damodaran_dir)
            if result:
                downloaded["damodaran"].append(result)

    # 2. Industry datasets (US, Europe, Global)
    print("\n📊 SECTION 2: Industry/Sector Datasets (Multiple Regions)")
    print("-" * 90)

    regions = ["US", "Eu", "Global", "Emerg"]
    datasets = [
        ("beta{}.xls", "Levered Beta by Industry"),
        ("totalbeta{}.xls", "Total Beta by Industry"),
        ("wacc{}.xls", "WACC by Industry"),
        ("margin{}.xls", "Operating Margins by Industry"),
        ("pedata{}.xls", "PE Ratios by Industry"),
        ("roe{}.xls", "ROE by Industry"),
        ("fundgr{}.xls", "Fundamental Growth Rates"),
    ]

    for dataset_template, description in datasets:
        print(f"\n{description}:")
        for region in regions:
            filename = dataset_template.format(region)
            result = download_damodaran_dataset(base_url + filename, filename, damodaran_dir)
            if result:
                downloaded["damodaran"].append(result)

    # 3. Ticker data (AAPL, GOOG, and other major tickers)
    print("\n📊 SECTION 3: Ticker Historical Data (20+ years)")
    print("-" * 90)

    tickers = [
        ("AAPL", "max", "Apple - Full History"),
        ("GOOG", "max", "Google/Alphabet - Full History"),
        ("MSFT", "max", "Microsoft - Full History"),
        ("NVDA", "max", "NVIDIA - Full History"),
        ("TSLA", "max", "Tesla - Full History"),
        ("JPM", "max", "JPMorgan Chase - Full History"),
        ("XOM", "max", "Exxon Mobil - Full History"),
        ("JNJ", "max", "Johnson & Johnson - Full History"),
    ]

    for ticker, period, description in tickers:
        print(f"\n{description}:")
        result = download_ticker_data(ticker, period, ticker_dir)
        if result:
            downloaded["tickers"].append(result)

    # 4. Download country risk premiums (additional datasets)
    print("\n📊 SECTION 4: Country Risk Premiums")
    print("-" * 90)

    for dataset in [
        ("ctryprem.xlsx", "Country Risk Premiums (January 2026)"),
        ("ctrypremApr26.xlsx", "Country Risk Premiums (April 2026)"),
    ]:
        filename, description = dataset
        print(f"\n{description}:")
        result = download_damodaran_dataset(base_url + filename, filename, damodaran_dir)
        if result:
            downloaded["damodaran"].append(result)

    return downloaded


def calculate_total_size(downloaded: dict[str, list[Path]]) -> float:
    """Calculate total size of downloaded datasets in GB."""
    total_bytes = 0
    for paths in downloaded.values():
        for path in paths:
            if path.exists():
                total_bytes += path.stat().st_size
    return total_bytes / (1024 * 1024 * 1024)


def prepare_benchmark_data(ticker_paths: list[Path]) -> bytes:
    """Combine ticker data into a single CSV for benchmarking."""
    import pandas as pd
    from run_track_b_market_benchmark import _rows_to_csv_bytes

    print("\n📊 Preparing combined ticker dataset for benchmark...")

    combined_data = None

    for path in ticker_paths:
        try:
            df = pd.read_csv(path, index_col=0, parse_dates=True)

            # Extract Close prices only
            if 'Close' in df.columns:
                ticker_name = path.stem.split('_')[0]  # Extract ticker from filename
                prices = df[['Close']].rename(columns={'Close': ticker_name})

                if combined_data is None:
                    combined_data = prices
                else:
                    combined_data = combined_data.join(prices, how='outer')
        except Exception as e:
            print(f"  ⚠️  Could not process {path.name}: {e}")

    if combined_data is None:
        raise ValueError("No ticker data could be processed")

    # Drop rows with missing data
    combined_data = combined_data.dropna()

    print(f"  ✓ Combined dataset: {combined_data.shape[0]} days × {combined_data.shape[1]} tickers")
    print(f"  ✓ Date range: {combined_data.index.min()} to {combined_data.index.max()}")

    # Convert to CSV format expected by benchmark
    rows = []
    for date, row in combined_data.iterrows():
        # Handle both datetime and string indices
        if hasattr(date, 'strftime'):
            date_str = date.strftime("%Y-%m-%d")
        else:
            date_str = str(date).split()[0] if ' ' in str(date) else str(date)

        row_dict = {"date": date_str}
        row_dict.update(row.to_dict())
        rows.append(row_dict)

    return _rows_to_csv_bytes(rows)


async def run_benchmark_suite(csv_bytes: bytes, dataset_info: dict) -> list[dict]:
    """Run comprehensive benchmark suite at multiple scales."""
    from run_track_b_market_benchmark import _run_distributed_benchmark

    print("\n" + "="*90)
    print("RUNNING QUANTUM VS CLASSICAL BENCHMARK SUITE")
    print("="*90)

    # Test configurations: gradually increase complexity
    configs = [
        {"max_assets": 4, "peers": 20, "steps": 5, "description": "Small (4 assets)"},
        {"max_assets": 6, "peers": 30, "steps": 7, "description": "Medium (6 assets)"},
        {"max_assets": 8, "peers": 40, "steps": 7, "description": "Large (8 assets)"},
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
                filename="combined_ticker_data.csv",
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
            print(f"     Classical: {classical_ms}ms")
            print(f"     Quantum: {quantum_ms}ms")
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


def print_summary(results: list[dict], total_size_gb: float) -> None:
    """Print comprehensive summary of benchmark results."""
    print("\n" + "="*90)
    print("BENCHMARK SUMMARY")
    print("="*90)

    print(f"\n📊 Dataset Size: {total_size_gb:.2f} GB")
    print(f"📊 Configurations Tested: {len(results)}")

    print("\n" + "-"*90)
    print(f"{'Config':<20} {'Assets':<10} {'Classical (ms)':<18} {'Quantum (ms)':<18} {'Winner':<12}")
    print("-"*90)

    for result in results:
        config = result["config"]
        timings = result["timings"]

        classical_ms = timings.get("classical_end_to_end_duration_ms", 0)
        quantum_ms = timings.get("quantum_end_to_end_duration_ms", 0)

        ratio = quantum_ms / classical_ms if classical_ms > 0 else 0
        winner = "🏆 Quantum" if ratio < 1 else "Classical"

        print(f"{config['description']:<20} {config['max_assets']:<10} {classical_ms:<18.1f} {quantum_ms:<18.1f} {winner:<12}")

    print("-"*90)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Skip dataset download (use existing data)",
    )
    parser.add_argument(
        "--download-only",
        action="store_true",
        help="Only download datasets, don't run benchmarks",
    )
    args = parser.parse_args()

    logging.getLogger("qiskit").setLevel(logging.WARNING)

    print("\n" + "="*90)
    print("LARGE-SCALE QUANTUM PORTFOLIO OPTIMIZATION BENCHMARK")
    print("Using Damodaran NYU Datasets + Ticker Data (AAPL, GOOG, etc.)")
    print("="*90)

    # Step 1: Download datasets
    if not args.skip_download:
        _install_dependencies()
        downloaded = download_all_datasets()
        total_size_gb = calculate_total_size(downloaded)

        print("\n" + "="*90)
        print("DOWNLOAD COMPLETE")
        print("="*90)
        print(f"\n📊 Total Dataset Size: {total_size_gb:.2f} GB")
        print(f"📊 Damodaran Files: {len(downloaded['damodaran'])}")
        print(f"📊 Ticker Files: {len(downloaded['tickers'])}")

        # Save download manifest
        manifest_path = _project_root() / "benchmark-data" / "download_manifest.json"
        manifest = {
            "download_date": datetime.now().isoformat(),
            "total_size_gb": round(total_size_gb, 3),
            "damodaran_files": [str(p.name) for p in downloaded["damodaran"]],
            "ticker_files": [str(p.name) for p in downloaded["tickers"]],
        }
        manifest_path.write_text(json.dumps(manifest, indent=2))
        print(f"\n📁 Download manifest saved to: {manifest_path}")

        if args.download_only:
            print("\n✅ Download complete. Use --skip-download to run benchmarks.")
            return
    else:
        print("\n⏭️  Skipping download, using existing datasets...")
        ticker_dir = _project_root() / "benchmark-data" / "tickers"
        downloaded = {"tickers": list(ticker_dir.glob("*.csv"))}

    # Step 2: Prepare benchmark data
    if not downloaded.get("tickers"):
        print("\n❌ No ticker data available. Run without --skip-download first.")
        sys.exit(1)

    csv_bytes = prepare_benchmark_data(downloaded["tickers"])

    dataset_info = {
        "source": "Combined ticker data (AAPL, GOOG, MSFT, NVDA, TSLA, JPM, XOM, JNJ)",
        "tickers": len(downloaded["tickers"]),
        "benchmark_date": datetime.now().isoformat(),
    }

    # Step 3: Run benchmarks
    results = asyncio.run(run_benchmark_suite(csv_bytes, dataset_info))

    # Step 4: Print summary
    total_size_gb = calculate_total_size(downloaded) if not args.skip_download else 0
    print_summary(results, total_size_gb)

    # Step 5: Save results
    output_path = _project_root() / "benchmark-data" / "large_scale_benchmark_results.json"
    output_path.write_text(json.dumps(results, indent=2))
    print(f"\n📁 Results saved to: {output_path}")

    print("\n" + "="*90)
    print("BENCHMARK COMPLETE!")
    print("="*90)


if __name__ == "__main__":
    main()
