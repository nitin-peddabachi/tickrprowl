# Stockr

A personal stock analysis app to identify oversold stocks using technical indicators (RSI, Bollinger Bands) and fundamentals. Supports portfolio tracking via Fidelity and E*Trade CSV imports.

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — that's it.

## Setup

```bash
git clone https://github.com/nitin-peddabachi/stockr
cd stockr
docker compose up --build
```

Then open **http://localhost:3000** in your browser.

The first build takes ~2 minutes. Subsequent starts are fast:

```bash
docker compose up
```

To stop:

```bash
docker compose down
```

## Features

- **Search** — look up any stock by ticker or company name for a full analysis
- **Scanner** — scan a batch of tickers or preset lists (S&P 500 sample, Tech, Value) for oversold signals
- **Watchlist** — track stocks with notes and target prices
- **Portfolio** — import your positions and overlay live analysis
- **Alerts** — set RSI, price, or score alerts that check every 30 minutes

## Importing your portfolio

Go to the **Portfolio** tab and click **Import CSV**.

| Broker | How to export |
|---|---|
| Fidelity | Accounts → Portfolio → Positions → Download CSV |
| E*Trade (positions) | My Portfolio → Holdings → Download → Positions CSV |
| E*Trade (ESPP) | Stock Plan → Holdings → By Benefit Type → Export |

Re-importing replaces only that broker's data — your other accounts are untouched.

## Oversold Score (0–100)

| Score | Signal |
|---|---|
| 70+ | Strong Buy |
| 50+ | Buy |
| 30+ | Watch |
| <30 | Neutral |

Factors: RSI, Bollinger Band position, % from 52-week high, revenue growth, P/E ratio.

## Data

Your data is stored in a Docker volume on your machine. It persists across restarts and is not shared anywhere.

To reset everything:

```bash
docker compose down -v
```
