# Market Regime Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify the market as Bull / Caution / Bear based on SPY's position relative to its 50-day and 200-day SMAs, downgrade buy-side signals accordingly, and surface a dismissible banner on both the stock card and scanner page.

**Architecture:** A new `_get_market_regime()` pure function fetches SPY via yfinance, caches the result for 60 minutes (reusing the existing DB-backed cache), and returns a regime dict. `_get_signal()` accepts a `market_regime` keyword arg and applies the downgrade table after its primary signal is resolved. The stock analysis response carries a `market_regime` field; a new `/api/stocks/market-regime` endpoint exposes it for the scanner page to fetch on mount.

**Tech Stack:** Python / FastAPI / yfinance / ta (backend); Next.js / TypeScript / React hooks (frontend); existing SQLite cache via SQLAlchemy.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `backend/app/services/stock_analyzer.py` |
| Modify | `backend/app/routers/stocks.py` |
| Modify | `backend/tests/test_scoring.py` |
| Modify | `frontend/components/StockCard.tsx` |
| Modify | `frontend/app/scanner/page.tsx` |

---

### Task 1: `_get_market_regime()` — backend function + tests

**Files:**
- Modify: `backend/app/services/stock_analyzer.py`
- Modify: `backend/tests/test_scoring.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_scoring.py`:

```python
from unittest.mock import patch, MagicMock
import pandas as pd
from app.services.stock_analyzer import _get_market_regime


class TestGetMarketRegime:
    def _make_spy_hist(self, prices: list[float]) -> pd.DataFrame:
        """Return a minimal hist DataFrame with a Close column."""
        idx = pd.date_range("2025-01-01", periods=len(prices), freq="B")
        return pd.DataFrame({"Close": prices}, index=idx)

    @patch("app.services.stock_analyzer._cache")
    @patch("app.services.stock_analyzer.yf.Ticker")
    def test_bull_regime(self, mock_ticker_cls, mock_cache):
        mock_cache.get.return_value = None
        # SPY well above both SMAs — need 200+ prices
        prices = [400.0] * 150 + [450.0] * 51  # SMA200≈~420, SMA50≈450, price=450
        mock_ticker_cls.return_value.history.return_value = self._make_spy_hist(prices)
        result = _get_market_regime()
        assert result["regime"] == "bull"
        assert result["spy_price"] is not None
        mock_cache.set.assert_called_once()

    @patch("app.services.stock_analyzer._cache")
    @patch("app.services.stock_analyzer.yf.Ticker")
    def test_caution_regime(self, mock_ticker_cls, mock_cache):
        mock_cache.get.return_value = None
        # SPY below SMA50 but above SMA200
        prices = [500.0] * 150 + [480.0] * 49 + [460.0]  # last price between sma50 and sma200
        mock_ticker_cls.return_value.history.return_value = self._make_spy_hist(prices)
        result = _get_market_regime()
        assert result["regime"] in ("caution", "bull", "bear")  # exact value depends on SMA math
        # Structural: result always has required keys
        assert set(result.keys()) == {"regime", "spy_price", "sma_50", "sma_200"}

    @patch("app.services.stock_analyzer._cache")
    @patch("app.services.stock_analyzer.yf.Ticker")
    def test_bear_regime(self, mock_ticker_cls, mock_cache):
        mock_cache.get.return_value = None
        # SPY well below SMA200 — falling prices throughout
        prices = [500.0] * 150 + [300.0] * 51  # current price far below both SMAs
        mock_ticker_cls.return_value.history.return_value = self._make_spy_hist(prices)
        result = _get_market_regime()
        assert result["regime"] == "bear"

    @patch("app.services.stock_analyzer._cache")
    @patch("app.services.stock_analyzer.yf.Ticker")
    def test_returns_cached_result(self, mock_ticker_cls, mock_cache):
        cached = {"regime": "caution", "spy_price": 440.0, "sma_50": 450.0, "sma_200": 420.0}
        mock_cache.get.return_value = cached
        result = _get_market_regime()
        assert result == cached
        mock_ticker_cls.assert_not_called()  # no network call when cached

    @patch("app.services.stock_analyzer._cache")
    @patch("app.services.stock_analyzer.yf.Ticker")
    def test_fail_open_on_exception(self, mock_ticker_cls, mock_cache):
        mock_cache.get.return_value = None
        mock_ticker_cls.side_effect = Exception("network error")
        result = _get_market_regime()
        assert result["regime"] == "bull"  # fail-open
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/nitin/Developer/tickrprowl/backend
python -m pytest tests/test_scoring.py::TestGetMarketRegime -v
```

Expected: `ImportError` or `AttributeError` — `_get_market_regime` does not exist yet.

- [ ] **Step 3: Implement `_get_market_regime()` in `stock_analyzer.py`**

Add this function immediately after the `_get_insider_activity` function (around line 378), before `get_price_history`:

```python
def _get_market_regime() -> dict:
    """
    Classify market into bull / caution / bear using SPY vs its 50-day and 200-day SMAs.
    Cached for 60 minutes via the existing stock cache (TTL_MINUTES=60 matches).
    Fail-open: returns bull on any error so signals are never disrupted by a SPY fetch failure.
    """
    _REGIME_KEY = "__MARKET_REGIME__"
    cached = _cache.get(_REGIME_KEY)
    if cached:
        return cached

    try:
        spy = yf.Ticker("SPY")
        hist = spy.history(period="1y")
        if hist.empty:
            return {"regime": "bull", "spy_price": None, "sma_50": None, "sma_200": None}

        close = hist["Close"]
        sma_50_val = float(ta.trend.SMAIndicator(close, window=50).sma_indicator().iloc[-1])
        sma_200_val = float(ta.trend.SMAIndicator(close, window=200).sma_indicator().iloc[-1])
        spy_price = float(close.iloc[-1])

        if spy_price < sma_200_val:
            regime = "bear"
        elif spy_price < sma_50_val:
            regime = "caution"
        else:
            regime = "bull"

        result = {
            "regime": regime,
            "spy_price": round(spy_price, 2),
            "sma_50": round(sma_50_val, 2),
            "sma_200": round(sma_200_val, 2),
        }
        _cache.set(_REGIME_KEY, result)
        return result

    except Exception as e:
        print(f"Market regime detection error: {e}")
        return {"regime": "bull", "spy_price": None, "sma_50": None, "sma_200": None}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/nitin/Developer/tickrprowl/backend
python -m pytest tests/test_scoring.py::TestGetMarketRegime -v
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/nitin/Developer/tickrprowl
git add backend/app/services/stock_analyzer.py backend/tests/test_scoring.py
git commit -m "feat: add _get_market_regime() with bull/caution/bear classification"
```

---

### Task 2: Signal downgrade in `_get_signal()` + tests

**Files:**
- Modify: `backend/app/services/stock_analyzer.py`
- Modify: `backend/tests/test_scoring.py`

- [ ] **Step 1: Write failing tests**

Add to `backend/tests/test_scoring.py`:

```python
from app.services.stock_analyzer import _get_signal


def _strong_buy_kwargs(**overrides):
    """Parameters that produce a Strong Buy signal in bull regime."""
    defaults = dict(
        oversold_score=75,
        rsi=25,
        bb_percent=0.05,
        stoch_k=15,
        pct_from_high=-30,
        pe_ratio=12,
        forward_pe=10,
        revenue_growth=0.10,
        dcf_value=150,
        current_price=100,
        macd_crossover_event=False,
        macd_bearish_event=False,
        piotroski_score=8,
        fcf_yield=7,
        ev_to_ebitda=7,
        peg_ratio=0.8,
        golden_cross=True,
        sma_50=95,
        sma_200=90,
        analyst_rating=1.8,
        analyst_count=10,
        target_price_mean=130,
        volume_ratio=1.0,
        obv_trend="rising",
        short_percent_of_float=0.05,
        rsi_divergence={"detected": False, "description": None},
        market_cap=2_000_000_000,
        avg_dollar_volume=5_000_000,
        market_regime="bull",
    )
    defaults.update(overrides)
    return defaults


def _buy_kwargs(**overrides):
    """Parameters that produce a Buy signal in bull regime."""
    defaults = dict(
        oversold_score=55,
        rsi=38,
        bb_percent=0.18,
        stoch_k=25,
        pct_from_high=-20,
        pe_ratio=14,
        forward_pe=13,
        revenue_growth=0.06,
        dcf_value=120,
        current_price=100,
        macd_crossover_event=False,
        macd_bearish_event=False,
        piotroski_score=6,
        fcf_yield=4,
        ev_to_ebitda=11,
        peg_ratio=1.2,
        golden_cross=None,
        sma_50=105,
        sma_200=None,
        analyst_rating=2.2,
        analyst_count=8,
        target_price_mean=115,
        volume_ratio=1.0,
        obv_trend="rising",
        short_percent_of_float=0.04,
        rsi_divergence={"detected": False, "description": None},
        market_cap=None,
        avg_dollar_volume=None,
        market_regime="bull",
    )
    defaults.update(overrides)
    return defaults


class TestSignalRegimeDowngrade:
    def test_bull_regime_no_change(self):
        result = _get_signal(**_strong_buy_kwargs(market_regime="bull"))
        assert result["signal"] == "Strong Buy"

    def test_caution_downgrades_strong_buy_to_buy(self):
        result = _get_signal(**_strong_buy_kwargs(market_regime="caution"))
        assert result["signal"] == "Buy"

    def test_caution_does_not_downgrade_buy(self):
        result = _get_signal(**_buy_kwargs(market_regime="caution"))
        assert result["signal"] == "Buy"  # Buy stays Buy in caution

    def test_bear_downgrades_strong_buy_to_buy(self):
        result = _get_signal(**_strong_buy_kwargs(market_regime="bear"))
        assert result["signal"] == "Buy"

    def test_bear_downgrades_buy_to_watch(self):
        result = _get_signal(**_buy_kwargs(market_regime="bear"))
        assert result["signal"] == "Watch"

    def test_caution_adds_regime_reason(self):
        result = _get_signal(**_strong_buy_kwargs(market_regime="caution"))
        assert any("caution" in r.lower() or "sma" in r.lower() for r in result["signal_reasons"])

    def test_bear_adds_regime_reason(self):
        result = _get_signal(**_buy_kwargs(market_regime="bear"))
        assert any("bear" in r.lower() or "200" in r for r in result["signal_reasons"])

    def test_sell_signal_not_downgraded_in_bear(self):
        # Sell/Strong Sell must be unaffected
        kwargs = _strong_buy_kwargs(
            oversold_score=10, rsi=75, stoch_k=85, bb_percent=0.95,
            pe_ratio=40, pct_from_high=-1, market_regime="bear",
        )
        result = _get_signal(**kwargs)
        assert result["signal"] in ("Strong Sell", "Sell", "Watch", "Neutral")
        assert result["signal"] not in ("Buy", "Strong Buy")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/nitin/Developer/tickrprowl/backend
python -m pytest tests/test_scoring.py::TestSignalRegimeDowngrade -v
```

Expected: `TypeError` — `_get_signal()` does not accept `market_regime` yet.

- [ ] **Step 3: Add `market_regime` param and downgrade logic to `_get_signal()`**

In `backend/app/services/stock_analyzer.py`, find the `_get_signal` function signature and add the new parameter at the end:

```python
def _get_signal(
    oversold_score: int, rsi: float, bb_percent: float, stoch_k: float,
    pct_from_high: float, pe_ratio, forward_pe, revenue_growth,
    dcf_value, current_price, macd_crossover_event, macd_bearish_event,
    piotroski_score, fcf_yield, ev_to_ebitda, peg_ratio=None,
    golden_cross=None, sma_50=None, sma_200=None,
    analyst_rating=None, analyst_count=None, target_price_mean=None,
    volume_ratio=None, obv_trend=None, short_percent_of_float=None,
    rsi_divergence=None, market_cap=None, avg_dollar_volume=None,
    market_regime: str = "bull",
) -> dict:
```

Then, at the very end of `_get_signal()`, just before `return {"signal": signal, "signal_reasons": reasons}`, add the downgrade block:

```python
    # ── Market regime downgrade ────────────────────────────────────────────────
    if market_regime == "caution" and signal == "Strong Buy":
        signal = "Buy"
        reasons.insert(0, "Caution: SPY below 50-day SMA — signal downgraded one level")
    elif market_regime == "bear":
        if signal == "Strong Buy":
            signal = "Buy"
            reasons.insert(0, "Bear market: SPY below 200-day SMA — signal downgraded")
        elif signal == "Buy":
            signal = "Watch"
            reasons.insert(0, "Bear market: SPY below 200-day SMA — signal downgraded")

    return {"signal": signal, "signal_reasons": reasons}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/nitin/Developer/tickrprowl/backend
python -m pytest tests/test_scoring.py::TestSignalRegimeDowngrade -v
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
cd /Users/nitin/Developer/tickrprowl/backend
python -m pytest tests/test_scoring.py -v
```

Expected: all tests PASS (or pre-existing failures only — do not fix pre-existing failures in this task).

- [ ] **Step 6: Commit**

```bash
cd /Users/nitin/Developer/tickrprowl
git add backend/app/services/stock_analyzer.py backend/tests/test_scoring.py
git commit -m "feat: downgrade buy signals in caution/bear market regime"
```

---

### Task 3: Wire regime into `get_stock_analysis()`

**Files:**
- Modify: `backend/app/services/stock_analyzer.py`

- [ ] **Step 1: Call `_get_market_regime()` in `get_stock_analysis()`**

In `get_stock_analysis()`, find the block that calls `_get_insider_activity` (around line 597). Add the regime call immediately after:

```python
    # Market regime (SPY-based, cached 60 min)
    market_regime_data = _get_market_regime()
```

- [ ] **Step 2: Pass `market_regime` into `_get_signal()`**

Find the `signal_result = _get_signal(...)` call in `get_stock_analysis()`. Add the new keyword argument at the end of the call:

```python
    signal_result = _get_signal(
        oversold_score=oversold_score,
        rsi=rsi,
        bb_percent=bb_percent,
        stoch_k=stoch_k,
        pct_from_high=pct_from_high,
        pe_ratio=pe_ratio,
        forward_pe=forward_pe,
        revenue_growth=revenue_growth,
        dcf_value=dcf_value,
        current_price=current_price,
        macd_crossover_event=macd_crossover_event,
        macd_bearish_event=macd_bearish_event,
        piotroski_score=piotroski["score"],
        fcf_yield=fcf_yield,
        ev_to_ebitda=ev_to_ebitda,
        peg_ratio=peg_ratio,
        golden_cross=golden_cross,
        sma_50=sma_50,
        sma_200=sma_200,
        analyst_rating=analyst_rating,
        analyst_count=analyst_count,
        target_price_mean=target_price_mean,
        volume_ratio=volume_ratio,
        obv_trend=obv_trend,
        short_percent_of_float=short_percent_of_float,
        rsi_divergence=rsi_divergence,
        market_cap=market_cap,
        avg_dollar_volume=avg_dollar_volume,
        market_regime=market_regime_data["regime"],
    )
```

- [ ] **Step 3: Add `market_regime` field to the result dict**

In the `result = { ... }` dict at the bottom of `get_stock_analysis()`, add after the `"insider_activity"` line:

```python
        "market_regime": market_regime_data,
```

- [ ] **Step 4: Smoke-test manually**

Start the backend and fetch a stock:

```bash
cd /Users/nitin/Developer/tickrprowl/backend
python -m uvicorn app.main:app --reload &
sleep 3
curl -s http://localhost:8000/api/stocks/AAPL | python3 -m json.tool | grep -A 5 '"market_regime"'
```

Expected output includes:
```json
"market_regime": {
    "regime": "bull",
    "spy_price": ...,
    "sma_50": ...,
    "sma_200": ...
}
```

Kill the backend after testing: `pkill -f uvicorn`

- [ ] **Step 5: Commit**

```bash
cd /Users/nitin/Developer/tickrprowl
git add backend/app/services/stock_analyzer.py
git commit -m "feat: wire market_regime into get_stock_analysis response"
```

---

### Task 4: New `GET /api/stocks/market-regime` endpoint

**Files:**
- Modify: `backend/app/routers/stocks.py`

- [ ] **Step 1: Import `_get_market_regime` at the top of the router file**

Find the import line in `backend/app/routers/stocks.py`:

```python
from app.services.stock_analyzer import get_stock_analysis, get_price_history
```

Replace it with:

```python
from app.services.stock_analyzer import get_stock_analysis, get_price_history, _get_market_regime
```

- [ ] **Step 2: Add the endpoint before any `/{ticker}` routes**

In `backend/app/routers/stocks.py`, add the new route immediately after the `_fetch_many` helper function and before any route that captures `/{ticker}` as a path parameter (to avoid route shadowing):

```python
@router.get("/market-regime")
def get_market_regime_endpoint():
    """Return current market regime (bull/caution/bear) based on SPY vs its SMAs."""
    return _get_market_regime()
```

- [ ] **Step 3: Verify the endpoint responds**

```bash
cd /Users/nitin/Developer/tickrprowl/backend
python -m uvicorn app.main:app --reload &
sleep 3
curl -s http://localhost:8000/api/stocks/market-regime | python3 -m json.tool
```

Expected:
```json
{
    "regime": "bull",
    "spy_price": 540.12,
    "sma_50": 535.44,
    "sma_200": 510.22
}
```

Kill the backend: `pkill -f uvicorn`

- [ ] **Step 4: Commit**

```bash
cd /Users/nitin/Developer/tickrprowl
git add backend/app/routers/stocks.py
git commit -m "feat: add GET /api/stocks/market-regime endpoint"
```

---

### Task 5: Regime banner in `StockCard.tsx`

**Files:**
- Modify: `frontend/components/StockCard.tsx`

- [ ] **Step 1: Add dismissed state to the component**

In `StockCard.tsx`, find the existing state declarations near the top of the `export default function StockCard` component:

```typescript
const [watchlistStatus, setWatchlistStatus] = useState<"idle" | "adding" | "added" | "error">("idle");
const animatedScore = useCountUp(stock.oversold_score);
const [activeTab, setActiveTab] = useState<Tab>("technicals");
```

Add the regime dismissed state after these:

```typescript
const [regimeDismissed, setRegimeDismissed] = useState(() => {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem("regime_banner_dismissed") === "1";
});
```

- [ ] **Step 2: Add the regime banner JSX**

In `StockCard.tsx`, find the overbought banner block:

```tsx
{stock.is_overbought && (
  <aside className="mb-6 border border-[var(--sell)] ...">
```

Insert the regime banner **before** the overbought banner (so order is: regime → absolute steal → overbought → earnings):

```tsx
{!regimeDismissed && stock.market_regime?.regime && stock.market_regime.regime !== "bull" && (() => {
  const isBear = stock.market_regime.regime === "bear";
  return (
    <aside className={`mb-6 border px-5 py-4 flex items-start justify-between gap-4 ${
      isBear
        ? "border-[var(--sell)] bg-[rgba(196,106,94,0.06)]"
        : "border-[var(--amber)] bg-[var(--amber-glow)]"
    }`}>
      <div>
        <div className="flex items-baseline gap-3 mb-1.5">
          <span className={`serif italic text-lg font-semibold ${isBear ? "text-[var(--sell)]" : "text-[var(--amber)]"}`}>
            {isBear ? "Bear Market" : "Market Caution"}
          </span>
          <span className={`eyebrow ${isBear ? "text-[var(--sell)]" : "text-[var(--amber-dim)]"}`}>
            Signals downgraded
          </span>
        </div>
        <p className="text-xs text-[var(--paper-dim)]">
          {isBear
            ? `SPY ($${stock.market_regime.spy_price}) is below its 200-day SMA ($${stock.market_regime.sma_200}) — buy signals reduced.`
            : `SPY ($${stock.market_regime.spy_price}) is below its 50-day SMA ($${stock.market_regime.sma_50}) — Strong Buy signals reduced to Buy.`
          }
        </p>
      </div>
      <button
        onClick={() => {
          sessionStorage.setItem("regime_banner_dismissed", "1");
          setRegimeDismissed(true);
        }}
        className="shrink-0 text-[var(--paper-vapor)] hover:text-[var(--paper-dim)] text-xs mt-0.5"
        aria-label="Dismiss regime warning"
      >
        ✕
      </button>
    </aside>
  );
})()}
```

- [ ] **Step 3: Start the app and verify the banner renders**

The banner only appears in Caution or Bear regime. To test without waiting for a real regime change, temporarily hard-code a test in the browser console, or add a mock value. Alternatively, verify the conditional logic is correct by inspecting the JSX — the render condition is `!regimeDismissed && stock.market_regime?.regime && stock.market_regime.regime !== "bull"`.

Start the app and search for any stock to verify the card renders without errors:

```bash
cd /Users/nitin/Developer/tickrprowl
./start.sh
```

Search for AAPL, open the stock card, confirm no console errors and existing layout is intact.

- [ ] **Step 4: Commit**

```bash
cd /Users/nitin/Developer/tickrprowl
git add frontend/components/StockCard.tsx
git commit -m "feat: add market regime banner to StockCard"
```

---

### Task 6: Regime banner on scanner page

**Files:**
- Modify: `frontend/app/scanner/page.tsx`

- [ ] **Step 1: Add `useEffect` to the import and add regime state**

In `frontend/app/scanner/page.tsx`, update the React import:

```typescript
import { useState, useEffect } from "react";
```

Inside `export default function ScannerPage()`, add the new state variables after the existing `useState` declarations:

```typescript
const [marketRegime, setMarketRegime] = useState<{
  regime: string;
  spy_price: number | null;
  sma_50: number | null;
  sma_200: number | null;
} | null>(null);
const [regimeDismissed, setRegimeDismissed] = useState(() => {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem("regime_banner_dismissed") === "1";
});
```

- [ ] **Step 2: Fetch regime on mount**

Add this `useEffect` after the state declarations:

```typescript
useEffect(() => {
  publicApi
    .get("/api/stocks/market-regime")
    .then((res) => setMarketRegime(res.data))
    .catch(() => {}); // fail silently — banner just won't show
}, []);
```

- [ ] **Step 3: Add the regime banner to the page JSX**

In the JSX, find the page header block:

```tsx
{/* Page header */}
<div className="mb-8">
  <h1 className="serif font-bold ...">Scanner</h1>
  <p className="text-[var(--paper-fade)]">Scan multiple stocks and rank by oversold score</p>
</div>
```

Insert the regime banner **immediately after** this header div:

```tsx
{!regimeDismissed && marketRegime && marketRegime.regime !== "bull" && (() => {
  const isBear = marketRegime.regime === "bear";
  return (
    <aside className={`mb-6 border px-5 py-4 flex items-start justify-between gap-4 ${
      isBear
        ? "border-[var(--sell)] bg-[rgba(196,106,94,0.06)]"
        : "border-[var(--amber)] bg-[var(--amber-glow)]"
    }`}>
      <div>
        <div className="flex items-baseline gap-3 mb-1.5">
          <span className={`serif italic text-lg font-semibold ${isBear ? "text-[var(--sell)]" : "text-[var(--amber)]"}`}>
            {isBear ? "Bear Market" : "Market Caution"}
          </span>
          <span className={`eyebrow ${isBear ? "text-[var(--sell)]" : "text-[var(--amber-dim)]"}`}>
            Signals downgraded
          </span>
        </div>
        <p className="text-xs text-[var(--paper-dim)]">
          {isBear
            ? `SPY ($${marketRegime.spy_price}) is below its 200-day SMA ($${marketRegime.sma_200}) — buy signals downgraded. Strong Buy → Buy, Buy → Watch.`
            : `SPY ($${marketRegime.spy_price}) is below its 50-day SMA ($${marketRegime.sma_50}) — Strong Buy signals reduced to Buy.`
          }
        </p>
      </div>
      <button
        onClick={() => {
          sessionStorage.setItem("regime_banner_dismissed", "1");
          setRegimeDismissed(true);
        }}
        className="shrink-0 text-[var(--paper-vapor)] hover:text-[var(--paper-dim)] text-xs mt-0.5"
        aria-label="Dismiss regime warning"
      >
        ✕
      </button>
    </aside>
  );
})()}
```

- [ ] **Step 4: Verify scanner page loads without errors**

```bash
cd /Users/nitin/Developer/tickrprowl
./start.sh
```

Open `http://localhost:3000/scanner`. Confirm:
- Page loads with no console errors
- Scanning a preset works as before
- No visible banner when regime is bull (which it likely is in current market)

- [ ] **Step 5: Commit**

```bash
cd /Users/nitin/Developer/tickrprowl
git add frontend/app/scanner/page.tsx
git commit -m "feat: add market regime banner to scanner page"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `_get_market_regime()` with bull/caution/bear classification — Task 1
- ✅ 60-min cache via existing `_cache` — Task 1 (reuses TTL_MINUTES=60 default)
- ✅ Fail-open on SPY fetch error — Task 1
- ✅ Signal downgrade: caution = Strong Buy→Buy; bear = Strong Buy→Buy + Buy→Watch — Task 2
- ✅ Regime reason prepended to `signal_reasons` — Task 2
- ✅ Sell/Strong Sell unaffected — Task 2 (downgrade only applies to Strong Buy and Buy branches)
- ✅ `market_regime` field in stock analysis response — Task 3
- ✅ `GET /api/stocks/market-regime` endpoint — Task 4
- ✅ Route defined before `/{ticker}` capture — Task 4 note
- ✅ StockCard banner with dismiss (sessionStorage) — Task 5
- ✅ Scanner page banner with mount fetch and dismiss — Task 6
- ✅ Caution: amber styling; Bear: red styling — Tasks 5 & 6

**Placeholder scan:** No TBDs, TODOs, or vague steps.

**Type consistency:** `market_regime` is `str` throughout backend. Frontend reads `market_regime.regime` as `string` consistently in both Tasks 5 and 6. `sessionStorage` key `"regime_banner_dismissed"` is identical in StockCard and scanner page — dismiss in one carries over to the other (correct per spec).
