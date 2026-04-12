# Stockr

A personal stock analysis app to identify oversold stocks using technical indicators (RSI, Bollinger Bands, Stochastic), fundamentals (DCF, Piotroski F-Score, FCF Yield), and analyst consensus. Supports portfolio tracking via Fidelity and E*Trade CSV imports.

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
- **Watchlist** — track stocks with notes and target prices; refresh live data on demand
- **Portfolio** — import your positions and overlay live analysis
- **Alerts** — set RSI, price, or score alert rules that check every 30 minutes with Telegram push notifications

## Telegram Alerts

Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `backend/.env` to receive push notifications when alerts trigger.

## Importing your portfolio

Go to the **Portfolio** tab and click **Import CSV**.

| Broker | How to export |
|---|---|
| Fidelity | Accounts → Portfolio → Positions → Download CSV |
| E*Trade (positions) | My Portfolio → Holdings → Download → Positions CSV |
| E*Trade (ESPP) | Export holdings from your Stock Plan account |

Re-importing replaces only that broker's data — your other accounts are untouched.

## Oversold Score (0–100)

| Score | Signal |
|---|---|
| 70+ | Strong Buy |
| 50+ | Buy |
| 30+ | Watch |
| <30 | Neutral |

Factors: RSI, Stochastic %K, Bollinger Band position, % from 52-week high, SMA 50/200, MACD, revenue growth, P/E, EV/EBITDA, FCF yield, DCF valuation, Piotroski F-Score, analyst consensus.

## Data

Your data is stored in a Docker volume on your machine. It persists across restarts and is not shared anywhere.

Stock analysis is cached for 60 minutes to reduce API calls and speed up repeated lookups.

To reset everything:

```bash
docker compose down -v
```
