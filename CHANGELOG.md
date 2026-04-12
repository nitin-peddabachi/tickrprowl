# Changelog

All notable changes to Stockr are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-04-12

### Added
- Telegram push notifications for alert triggers — receive mobile alerts when RSI, price, or score thresholds are hit
- Watchlist refresh button and last-updated timestamp so you always know how fresh the data is
- Scanner now distinguishes between "never scanned" and "scanned with no results"

### Fixed
- Alert checker now isolates per-ticker failures — one bad ticker no longer aborts the entire check run
- `db.rollback()` added on alert checker exception to prevent dirty session state
- yfinance fetch, technical indicator computation, and `stock.info` each wrapped in individual try/except blocks to prevent mid-operation crashes from silently breaking analysis

## [1.0.0] - 2026-04-06

### Added
- Stock search with company name autocomplete
- Full stock analysis: RSI, MACD, Bollinger Bands, Stochastic %K/%D, SMA 50/200, golden/death cross
- Fundamentals: P/E, Forward P/E, P/B, P/S, ROE, ROA, debt/equity, revenue growth, earnings growth, profit margin, beta, dividend yield
- Advanced valuation: DCF fair value, EV/EBITDA, FCF yield
- Piotroski F-Score (9-point financial health scoring)
- Analyst consensus: rating, price targets (mean/high/low)
- Oversold score (0–100) combining all technical and fundamental signals
- Signal classification: Strong Buy / Buy / Watch / Neutral / Sell / Strong Sell with reasons
- Absolute Steal detection (all conditions met simultaneously)
- Overbought warning flag
- Earnings date warning (within 14 days)
- Interactive price chart with Bollinger Bands and RSI sub-chart (1M/3M/6M/1Y/2Y)
- Quarterly revenue bar chart
- Batch scanner with preset lists (S&P 500 sample, Tech, Value) and custom ticker input
- Watchlist with notes, target price, and live analysis
- Portfolio import from Fidelity and E*Trade (positions + ESPP)
- Alert rules: RSI below, price below, oversold score above
- 4-hour cooldown between repeat alert triggers
- Background alert check every 30 minutes via APScheduler
- 60-minute analysis cache backed by SQLite
- Docker support for one-command setup
