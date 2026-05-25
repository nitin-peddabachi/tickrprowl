# Market Regime Filter — Design Spec
_Date: 2026-05-24_

## Problem

Tickrprowl's oversold signals (Strong Buy, Buy) are computed independently of broad market conditions. In a bear market, RSI < 30 stocks are statistically more likely to continue falling than to reverse. Surfacing Strong Buy during a market-wide downtrend produces a category of false positives that no per-stock signal can correct.

## Solution

Classify the market into one of three regimes based on SPY's position relative to its 50-day and 200-day SMAs. Downgrade buy-side signals in Caution and Bear regimes and surface a visible banner on both the stock card and scanner page.

## Regime Classification

| Condition | Regime | Signal Effect |
|---|---|---|
| SPY > SMA 50 > SMA 200 | Bull | No change |
| SPY < SMA 50, SPY > SMA 200 | Caution | Strong Buy → Buy |
| SPY < SMA 200 | Bear | Strong Buy → Buy, Buy → Watch |

Sell and Strong Sell signals are not affected. Strong Sell and Sell already represent bearish conclusions — downgrading them further is meaningless.

## Architecture

### Backend — `stock_analyzer.py`

**`_get_market_regime() -> dict`**
- Fetches SPY via `yf.Ticker("SPY").history(period="1y")`
- Computes SMA 50 and SMA 200 from the close series using `ta.trend.SMAIndicator`
- Returns `{ regime, spy_price, sma_50, sma_200 }` where `regime` is `"bull" | "caution" | "bear"`
- Result cached under key `"MARKET_REGIME"` with a 1-hour TTL (uses the existing in-memory cache with a special long-lived key)
- On fetch failure, returns `{ regime: "bull", ... }` — fail-open so a SPY outage doesn't break all signals

**Signal downgrade in `_get_signal()`**
- `market_regime` param added (default `"bull"` for backward compat)
- After the primary signal is resolved, apply downgrade table above
- Prepend a regime reason to `signal_reasons`:
  - Caution: `"Caution: SPY below 50-day SMA ($X) — signals downgraded one level"`
  - Bear: `"Bear market: SPY below 200-day SMA ($X) — signals downgraded"`

**`get_stock_analysis()`**
- Calls `_get_market_regime()` before computing the signal
- Passes `regime` into `_get_signal()`
- Adds `market_regime` field to the returned dict: `{ regime, spy_price, sma_50, sma_200 }`

**New endpoint `GET /api/stocks/market-regime`** in `routers/stocks.py`
- Calls `_get_market_regime()` and returns the result
- Used by the scanner page to fetch regime on mount without loading a full stock analysis

### Frontend

**`StockCard.tsx`**
- Reads `stock.market_regime.regime`
- If `caution` or `bear`, renders a banner between the overbought/earnings banners and the score section
- Caution: amber styling (`border-[var(--amber)]`, `bg-[var(--amber-glow)]`), text: `"Market Caution — SPY below 50-day SMA. Signals downgraded one level."`
- Bear: red styling (`border-[var(--sell)]`, `bg-[rgba(196,106,94,0.06)]`), text: `"Bear Market — SPY below 200-day SMA. Buy signals downgraded."`
- Banner shows SPY price vs. SMA values inline
- Dismissible per session via `sessionStorage` flag `regime_banner_dismissed`

**Scanner page (`app/scanner/page.tsx`)**
- On mount, fetches `GET /api/stocks/market-regime`
- Renders a full-width regime banner above the filter tabs when regime ≠ `"bull"`
- Same styling and dismissible behavior as StockCard banner
- Banner persists across scans within the session (fetched once on mount, not per scan)

## Error Handling

- SPY fetch failure → `_get_market_regime()` returns `{ regime: "bull" }` (fail-open, no signal disruption)
- Missing `market_regime` field in old cached stock responses → frontend treats as `"bull"` (null-safe check)

## Non-Goals

- No historical regime tracking or charting
- No user setting to disable signal downgrading
- Watchlist page requires no changes (reads regime from individual stock analysis responses)
- No intraday SPY updates — 1-hour cache TTL is sufficient for a daily-use tool
