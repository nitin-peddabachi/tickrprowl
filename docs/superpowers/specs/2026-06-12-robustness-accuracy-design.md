# Robustness & Accuracy Improvements — Design Spec
_Date: 2026-06-12_

## Problem

Three distinct gaps degrade signal quality and app reliability:

1. **Market regime not integrated** — `_get_market_regime()` was implemented (commit `1990726`) but never wired into `get_stock_analysis()` or `_get_signal()`. Strong Buy signals surface during bear markets where oversold stocks statistically continue lower. The design spec and backend function are complete; only the wiring and frontend are missing.

2. **Sector-blind valuation scoring** — P/E and EV/EBITDA thresholds are hard-coded globally (cheap P/E = 15, expensive = 35). Technology stocks trade at 25–35× earnings as a baseline; financial stocks at 8–12×. The current scoring systematically over-rewards financials and penalizes software for being "expensive" at fairly-valued multiples.

3. **Data reliability** — yfinance has no retry logic. A transient connection error or rate-limit silently returns `None` for fundamental fields, corrupting the oversold score with no indication to the user. Additionally, the `StockCache` table stores `cached_at` but it is never surfaced — users cannot tell whether they are seeing live data or 59-minute-old data.

## Solution Summary

Two independently deployable PRs:

| PR | Scope | Key files |
|---|---|---|
| PR 1 — Market Regime | Wire existing function; add frontend banners | `stock_analyzer.py`, `routers/stocks.py`, `StockCard.tsx`, `scanner/page.tsx` |
| PR 2 — Score Quality | yfinance retries + freshness timestamp + sector scoring | `stock_analyzer.py`, `cache.py`, `StockCard.tsx` |

---

## PR 1 — Market Regime Integration

### Backend — `stock_analyzer.py`

**`get_stock_analysis()`**

Call `_get_market_regime()` immediately before `_get_signal()`:

```python
market_regime = _get_market_regime()
```

Pass `market_regime=market_regime` into `_get_signal()`.

Add to the returned result dict:

```python
"market_regime": market_regime,
```

**`_get_signal()`**

Add `market_regime: dict = None` as a trailing parameter (defaults to `None` for backward compatibility — treated as bull).

After the primary signal is resolved, apply the downgrade table:

```python
regime = (market_regime or {}).get("regime", "bull")
if regime == "caution":
    if signal == "Strong Buy":
        signal = "Buy"
        sma_50_val = (market_regime or {}).get("sma_50")
        reasons.insert(0, f"Caution: SPY below 50-day SMA (${sma_50_val:.2f}) — signal downgraded one level")
elif regime == "bear":
    sma_200_val = (market_regime or {}).get("sma_200")
    if signal == "Strong Buy":
        signal = "Buy"
        reasons.insert(0, f"Bear market: SPY below 200-day SMA (${sma_200_val:.2f}) — signal downgraded")
    elif signal == "Buy":
        signal = "Watch"
        reasons.insert(0, f"Bear market: SPY below 200-day SMA (${sma_200_val:.2f}) — signal downgraded")
```

Sell and Strong Sell signals are not affected.

### Backend — `routers/stocks.py`

Add new endpoint:

```python
@router.get("/market-regime")
def get_market_regime_endpoint():
    from app.services.stock_analyzer import _get_market_regime
    return _get_market_regime()
```

Used by the scanner page to fetch regime on mount without loading a full stock analysis. Returns `{ regime, spy_price, sma_50, sma_200 }`.

### Frontend — `StockCard.tsx`

Read `stock.market_regime?.regime`. If `"caution"` or `"bear"`, render a banner between any overbought/earnings banners and the score section:

- **Caution** — amber styling (`border-[var(--amber)]`, `bg-[var(--amber-glow)]`):
  > "Market Caution — SPY below 50-day SMA. Signals downgraded one level."
  > Shows: `SPY $XXX.XX / SMA 50 $XXX.XX`

- **Bear** — red styling (`border-[var(--sell)]`, `bg-[rgba(196,106,94,0.06)]`):
  > "Bear Market — SPY below 200-day SMA. Buy signals downgraded."
  > Shows: `SPY $XXX.XX / SMA 200 $XXX.XX`

Both banners are dismissible per session via `sessionStorage` key `regime_banner_dismissed`. If the field is absent (old cached response), treat as bull (no banner).

### Frontend — `app/scanner/page.tsx`

Fetch `GET /api/stocks/market-regime` on component mount. Render a full-width banner above the filter tabs when `regime !== "bull"`. Same amber/red styling as StockCard. Dismissible via same `sessionStorage` key. Fetched once on mount; does not re-fetch on each scan.

---

## PR 2 — Score Quality

### Data Reliability — `stock_analyzer.py`

Add a retry helper at module level:

```python
import time

def _yf_call(fn, retries=2, backoff=1.5):
    last_exc = None
    for attempt in range(retries + 1):
        try:
            return fn()
        except Exception as e:
            last_exc = e
            if attempt < retries:
                time.sleep(backoff ** attempt)
    raise last_exc
```

Wrap the two highest-failure-risk calls in `get_stock_analysis()`:

```python
hist = _yf_call(lambda: stock.history(period="1y"))
# ...
info = _yf_call(lambda: stock.info)
```

The existing per-field `try/except` blocks remain — retries handle transient network failures; field guards handle missing data.

### Data Freshness — `cache.py`

Change `cache.get()` to return a `(data, cached_at)` tuple:

```python
def get(key: str) -> tuple[Optional[Any], Optional[datetime]]:
    ...
    return json.loads(row.data), row.cached_at
    # returns (None, None) on miss
```

Update all call sites:
- `get_stock_analysis()`: `cached, cached_at = _cache.get(ticker.upper())`; if cache hit, inject `"cached_at": cached_at.isoformat()` into the response before returning.
- `_get_market_regime()`: `cached, _ = _cache.get(_REGIME_KEY)` (discards timestamp — regime doesn't need it).

For fresh fetches (cache miss), `cached_at` is set to `null` in the response. The field is always present so the frontend never hits a missing-key error.

### Data Freshness — `StockCard.tsx`

Below the company name / price header, render when `stock.cached_at` is present and the age is > 2 minutes:

```
As of 14 min ago
```

Styled with `text-[var(--paper-fade)] text-xs`. Nothing shown under 2 minutes (effectively live). No action required from the user — purely informational.

### Sector-Relative Scoring — `stock_analyzer.py`

Add a sector P/E multiplier table at module level:

```python
_SECTOR_PE_MULT: dict[str, float] = {
    "Technology":             2.2,
    "Communication Services": 1.8,
    "Consumer Cyclical":      1.4,
    "Healthcare":             1.5,
    "Industrials":            1.2,
    "Consumer Defensive":     1.1,
    "Basic Materials":        1.0,
    "Real Estate":            1.3,
    "Energy":                 0.9,
    "Financial Services":     0.7,
    "Utilities":              0.8,
}
```

The multiplier is applied to base thresholds:
- **Cheap P/E** = `15 × mult` (e.g., 33 for tech, 10.5 for financials)
- **Expensive P/E** = `35 × mult` (e.g., 77 for tech, 24.5 for financials)
- **Cheap EV/EBITDA** = `8 × mult`, **moderate** = `12 × mult`

Unknown or missing sector → multiplier `1.0` (no change from current behavior).

**`_calculate_oversold_score()`**

Add `sector: str = "Unknown"` parameter. At the top of the function:

```python
_mult = _SECTOR_PE_MULT.get(sector, 1.0)
cheap_pe = 15 * _mult
```

Replace `pe_ratio < 15` with `pe_ratio < cheap_pe` in the valuation bucket. Replace `ev_to_ebitda < 8` / `< 12` with `ev_to_ebitda < 8 * _mult` / `< 12 * _mult`.

**`_get_signal()`**

Add `sector: str = "Unknown"` parameter. Same multiplier lookup. Replace `pe_ratio > 35` overbought flag with `pe_ratio > 35 * _mult`. Replace cheap P/E reason thresholds (`< 15`) with `< cheap_pe`.

**`_check_absolute_steal()`**

Add `sector: str = "Unknown"` parameter. Replace `pe_ratio < 15` gate with `pe_ratio < 15 * _SECTOR_PE_MULT.get(sector, 1.0)`.

**`get_stock_analysis()`**

Pass `sector=sector` (already fetched) into all three functions above.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| SPY fetch fails in `_get_market_regime()` | Returns `{ regime: "bull" }` — fail-open, no signal disruption (already implemented) |
| `stock.history()` fails after all retries | Existing `"Failed to fetch data"` error response fires as before |
| `stock.info` fails after all retries | Existing `info = {}` fallback fires; all `info.get()` calls return `None` |
| `cached_at` absent in old cached responses | Frontend null-check: no freshness line shown |
| Unknown sector | Multiplier defaults to `1.0`; no change from current scoring |
| `market_regime` absent in old cached responses | Frontend treats as `"bull"`; no banner shown |

## Testing

**`test_scoring.py`**
- Parametrized: P/E 30 tech stock earns valuation points; P/E 30 utility does not.
- Parametrized: P/E 10 financial earns cheap valuation points; P/E 10 utility also earns them (both below their sector threshold).
- `market_regime={"regime": "bear"}` downgrades `"Strong Buy"` → `"Buy"`.
- `market_regime={"regime": "bear"}` downgrades `"Buy"` → `"Watch"`.
- `market_regime={"regime": "caution"}` downgrades `"Strong Buy"` → `"Buy"` but leaves `"Buy"` unchanged.

**`test_stocks_api.py`**
- `GET /api/stocks/market-regime` returns keys `regime`, `spy_price`, `sma_50`, `sma_200`.

**`cache.py` (unit test or inline)**
- `cache.get()` returns `(data, cached_at)` tuple.
- `get_stock_analysis()` response includes `cached_at` as ISO string when served from cache; field absent on fresh fetch.

## Non-Goals

- No historical regime charting or tracking.
- No user setting to disable signal downgrading.
- Sector multipliers are not user-configurable.
- No intraday SPY updates — 1-hour regime cache TTL is sufficient for daily use.
- No changes to alert thresholds (alert rules use raw RSI/price/score values, not the signal string).
- Watchlist page requires no changes — reads regime from individual stock analysis responses.
