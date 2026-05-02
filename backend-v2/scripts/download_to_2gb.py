#!/usr/bin/env python3
"""Download additional data to reach 2GB target.

Strategy: Download more US stocks in batches with max history.
Avoids Wikipedia scraping and international ticker issues.
"""

import time
from pathlib import Path
import yfinance as yf
import pandas as pd
from datetime import datetime

def project_root():
    return Path(__file__).resolve().parents[2]

def check_size():
    """Calculate current benchmark-data size in GB."""
    root = project_root() / "benchmark-data"
    if not root.exists():
        return 0.0
    total = sum(f.stat().st_size for f in root.rglob("*") if f.is_file())
    return total / (1024**3)

def download_batch(tickers, name, period='max'):
    """Download a batch of tickers and save as CSV."""
    output_dir = project_root() / "benchmark-data" / "massive" / "batches"
    output_dir.mkdir(parents=True, exist_ok=True)

    output_file = output_dir / f"{name}.csv"

    if output_file.exists():
        size_mb = output_file.stat().st_size / (1024*1024)
        print(f"  ✓ {name}: {size_mb:.1f} MB (exists)")
        return True

    print(f"\n📥 {name} ({len(tickers)} stocks, {period})...")

    all_data = pd.DataFrame()
    successful = 0

    # Download in smaller chunks to avoid rate limiting
    chunk_size = 10
    for i in range(0, len(tickers), chunk_size):
        chunk = tickers[i:i+chunk_size]
        print(f"  Downloading {i+1}-{min(i+chunk_size, len(tickers))}...", end=' ', flush=True)

        try:
            data = yf.download(chunk, period=period, threads=True, progress=False, group_by='ticker')

            if not data.empty:
                for ticker in chunk:
                    try:
                        if len(chunk) == 1 and 'Close' in data.columns:
                            all_data[ticker] = data['Close']
                            successful += 1
                        elif ticker in data.columns:
                            if hasattr(data[ticker], 'columns') and 'Close' in data[ticker].columns:
                                all_data[ticker] = data[ticker]['Close']
                                successful += 1
                    except Exception as e:
                        pass

                print(f"✓ ({successful}/{len(tickers)})")
            else:
                print("✗")

            time.sleep(2)  # Rate limiting

        except Exception as e:
            print(f"✗ ({e})")

    if all_data.empty:
        print(f"  ❌ No data for {name}")
        return False

    # Clean and save
    all_data = all_data.dropna(axis=1, how='all').dropna(axis=0, how='all')
    all_data.to_csv(output_file)

    size_mb = output_file.stat().st_size / (1024*1024)
    print(f"  ✅ Saved: {all_data.shape[0]} days × {all_data.shape[1]} stocks ({size_mb:.1f} MB)")

    return True

def main():
    print("="*90)
    print("DOWNLOAD TO 2GB TARGET - ROBUST VERSION")
    print("="*90)

    start_size = check_size()
    print(f"\n📊 Starting size: {start_size:.3f} GB")
    print(f"📊 Target: 2.0 GB")
    print(f"📊 Need: {(2.0 - start_size)*1024:.0f} MB more\n")

    if start_size >= 2.0:
        print("✅ Already at target!")
        return

    # Large list of valid US tickers (manually curated, no Wikipedia needed)
    # S&P 500 stocks by sector

    tech_stocks = [
        "AAPL", "MSFT", "NVDA", "AVGO", "ORCL", "CSCO", "ADBE", "CRM", "INTC", "AMD",
        "QCOM", "TXN", "NOW", "INTU", "SNPS", "CDNS", "PANW", "ANET", "FTNT", "KLAC",
        "LRCX", "AMAT", "MCHP", "ADI", "MRVL", "ON", "NXPI", "ANSS", "MPWR", "SWKS"
    ]

    mega_cap = [
        "GOOG", "GOOGL", "AMZN", "META", "TSLA", "BRK-B", "LLY", "V", "UNH", "XOM",
        "JPM", "WMT", "MA", "JNJ", "PG", "HD", "CVX", "ABBV", "MRK", "KO",
        "BAC", "PEP", "COST", "TMO", "NFLX", "MCD", "ABT", "ACN", "CSCO", "DHR"
    ]

    finance_stocks = [
        "JPM", "BAC", "WFC", "C", "GS", "MS", "SCHW", "BLK", "SPGI", "CME",
        "ICE", "AXP", "COF", "USB", "PNC", "TFC", "BK", "STT", "FITB", "KEY",
        "MTB", "CFG", "HBAN", "RF", "AIG", "MET", "PRU", "ALL", "TRV", "PGR"
    ]

    healthcare_stocks = [
        "UNH", "LLY", "JNJ", "ABBV", "MRK", "TMO", "ABT", "DHR", "PFE", "BMY",
        "AMGN", "GILD", "CVS", "CI", "ELV", "HUM", "ISRG", "VRTX", "REGN", "ZTS",
        "BSX", "SYK", "MDT", "BDX", "EW", "IDXX", "RMD", "DXCM", "ALGN", "HOLX"
    ]

    consumer_stocks = [
        "WMT", "HD", "COST", "MCD", "NKE", "SBUX", "TGT", "LOW", "TJX", "DG",
        "DLTR", "CMG", "YUM", "ORLY", "AZO", "BBY", "ROST", "ULTA", "DPZ", "POOL",
        "MAR", "HLT", "BKNG", "ABNB", "LVS", "WYNN", "MGM", "NCLH", "RCL", "CCL"
    ]

    industrial_stocks = [
        "BA", "CAT", "HON", "UNP", "UPS", "RTX", "LMT", "GE", "MMM", "DE",
        "GD", "NOC", "EMR", "ETN", "ITW", "PH", "CMI", "CARR", "OTIS", "ROK",
        "DOV", "FTV", "FAST", "PCAR", "IR", "SWK", "TT", "ROP", "HUBB", "AME"
    ]

    energy_stocks = [
        "XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "OXY", "PXD",
        "HAL", "BKR", "HES", "FANG", "DVN", "MRO", "APA", "CTRA", "OVV", "MTDR",
        "EQT", "AR", "PR", "SM", "RRC", "CHRD", "VNOM", "NOV", "FTI", "HP"
    ]

    # Download in batches
    batches = [
        (tech_stocks, "tech_30_max", "Technology"),
        (mega_cap, "mega_cap_30_max", "Mega Cap"),
        (finance_stocks, "finance_30_max", "Financial"),
        (healthcare_stocks, "healthcare_30_max", "Healthcare"),
        (consumer_stocks, "consumer_30_max", "Consumer"),
        (industrial_stocks, "industrial_30_max", "Industrial"),
        (energy_stocks, "energy_30_max", "Energy"),
    ]

    print("="*90)
    print("DOWNLOADING SECTOR-BASED BATCHES")
    print("="*90)

    for tickers, name, sector in batches:
        print(f"\n{sector} Sector:")
        download_batch(tickers, name, period='max')

        current = check_size()
        progress = (current / 2.0) * 100
        print(f"\n📊 Current: {current:.3f} GB ({progress:.1f}% of target)")

        if current >= 2.0:
            print("🎉 REACHED 2GB TARGET!")
            break

        # Brief pause between sectors
        time.sleep(3)

    # Final summary
    final_size = check_size()
    print("\n" + "="*90)
    print("DOWNLOAD COMPLETE")
    print("="*90)
    print(f"\n📊 Final size: {final_size:.3f} GB ({final_size*1024:.0f} MB)")

    if final_size >= 2.0:
        print("🎉 SUCCESS! Reached 2GB target!")
    elif final_size >= 1.0:
        print(f"✅ Good progress! Reached 1GB+ ({(final_size/2.0)*100:.1f}% of target)")
    else:
        print(f"📊 Reached {(final_size/2.0)*100:.1f}% of 2GB target")

    # Detailed breakdown
    print("\n📊 Dataset Breakdown:")
    root = project_root() / "benchmark-data"
    for subdir in ['damodaran', 'tickers', 'massive']:
        dir_path = root / subdir
        if dir_path.exists():
            size = sum(f.stat().st_size for f in dir_path.rglob('*') if f.is_file())
            size_mb = size / (1024*1024)
            files = len(list(dir_path.rglob('*.csv'))) + len(list(dir_path.rglob('*.xls*')))
            print(f"  {subdir:15s}: {size_mb:>8.1f} MB ({files} files)")

    print(f"\n✅ Ready for comprehensive benchmarking!")
    print(f"   Total: {final_size:.2f} GB")

if __name__ == "__main__":
    main()
