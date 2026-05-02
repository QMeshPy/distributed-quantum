# Benchmark Data Directory

Total size: **358 MB** (500+ stocks, up to 63 years history)

## 📁 Structure

```
benchmark-data/                                    358 MB
│
├── 📊 Results (3 JSON files)                      65 KB
│   ├── ticker_benchmark_results.json             Tier 1: N=4
│   ├── large_scale_benchmark_results.json        Tier 2: N=4,6,8
│   └── 1gb_benchmark_results.json                Tier 3: N=5,8,10,15
│
├── 📈 Datasets (3 directories)                    358 MB
│   ├── damodaran/                                1.7 MB (15 files)
│   │   ├── histretSP.xls                         97 years (1928-2025)
│   │   ├── indname.xlsx                          48,156 company tickers
│   │   └── Industry data                         90+ industries
│   │
│   ├── tickers/                                  54.7 MB (54 files)
│   │   ├── Technology                            15 tickers
│   │   ├── Financial                             8 tickers
│   │   ├── Healthcare                            9 tickers
│   │   ├── Consumer                              9 tickers
│   │   └── Industrial/Energy                     9 tickers
│   │
│   └── massive/                                  301.6 MB
│       ├── sp500_max/                            19 MB
│       ├── sp500/                                193 MB
│       ├── batches/                              37 MB (by sector)
│       ├── dense/                                14 MB (hourly)
│       └── comprehensive/                        0.2 MB
│
└── 📝 Metadata
    └── download_manifest.json                    Download timestamps
```

## 🎯 Usage

### Access Results

```python
import json

# Tier 1 results (quick test)
with open('benchmark-data/ticker_benchmark_results.json') as f:
    tier1 = json.load(f)

# Tier 2 results (standard scaling)
with open('benchmark-data/large_scale_benchmark_results.json') as f:
    tier2 = json.load(f)

# Tier 3 results (extended scaling)
with open('benchmark-data/1gb_benchmark_results.json') as f:
    tier3 = json.load(f)
```

### Access Datasets

```python
import pandas as pd

# Individual ticker data
aapl = pd.read_csv('benchmark-data/tickers/AAPL_max.csv')

# S&P 500 data
sp500 = pd.read_csv('benchmark-data/massive/sp500/sp500_full_5y.csv')

# Damodaran industry data
import openpyxl
industry_data = pd.read_excel('benchmark-data/damodaran/betaGlobal.xls')
```

## 📊 Data Sources

1. **Damodaran (NYU Stern)**
   - URL: https://pages.stern.nyu.edu/~adamodar/
   - Academic-grade financial data
   - 97 years of market history

2. **Yahoo Finance**
   - Individual stock prices (daily)
   - S&P 500 constituents
   - Up to 63 years per ticker

## 🔍 Key Stats

- **Total tickers**: 500+
- **Date range**: 1928-2026 (98 years span)
- **Trading days**: 100,000+ combined
- **Sectors**: 7 major (Tech, Finance, Healthcare, Consumer, Industrial, Energy, Materials)
- **Geographic**: Primarily US stocks

## ⚠️ Notes

- Dataset is sufficient for portfolios up to N=20 assets
- All data is publicly available and reproducible
- See `../BENCHMARKS.md` for complete benchmark results
