"""
API tests for the /api/stocks router.

get_stock_analysis and get_price_history are mocked so tests never hit yfinance.
"""

from unittest.mock import patch, MagicMock
import pytest


MOCK_ANALYSIS = {
    "ticker": "AAPL",
    "company_name": "Apple Inc.",
    "sector": "Technology",
    "current_price": 150.0,
    "price_change_pct": 1.5,
    "price_change": 2.25,
    "price_52w_high": 200.0,
    "price_52w_low": 120.0,
    "pct_from_52w_high": -25.0,
    "market_cap": 2_400_000_000_000,
    "technicals": {
        "rsi": 35.0,
        "macd": 0.5,
        "macd_signal": 0.3,
        "bb_percent": 0.15,
        "stoch_k": 22.0,
        "stoch_d": 24.0,
        "sma_50": 155.0,
        "sma_200": 160.0,
        "golden_cross": False,
        "volume_ratio": 1.2,
        "obv_trend": "rising",
    },
    "fundamentals": {
        "pe_ratio": 28.0,
        "forward_pe": 25.0,
        "pb_ratio": 40.0,
        "ps_ratio": 7.0,
        "debt_to_equity": 150.0,
        "revenue_growth": 0.08,
        "earnings_growth": 0.12,
        "profit_margin": 0.25,
        "roe": 1.5,
        "roa": 0.28,
        "dividend_yield": 0.006,
        "beta": 1.2,
        "short_percent_of_float": 0.7,
        "dcf_value": 180.0,
        "ev_to_ebitda": 22.0,
        "fcf_yield": 3.5,
        "peg_ratio": 2.3,
    },
    "analyst": {"rating": 1.8, "recommendation": "buy", "count": 42,
                 "target_mean": 195.0, "target_high": 220.0, "target_low": 170.0},
    "piotroski": {"score": 6, "components": {}, "interpretation": "Moderate"},
    "quarterly_revenue_bn": {},
    "oversold_score": 45,
    "signal": "Watch",
    "signal_reasons": ["RSI declining"],
    "next_earnings_date": "2025-01-30",
    "is_absolute_steal": False,
    "steal_conditions": {},
    "is_overbought": False,
    "overbought_conditions": {},
    "insider_activity": {"transactions": [], "buy_count": 0, "sell_count": 0,
                         "net_shares": 0, "signal": "neutral"},
}


# ── Search ─────────────────────────────────────────────────────────────────────

class TestSearch:
    def test_short_query_returns_empty(self, client):
        resp = client.get("/api/stocks/search?q=A")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_empty_query_returns_empty(self, client):
        resp = client.get("/api/stocks/search?q=")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_valid_query_calls_yfinance(self, client):
        mock_result = MagicMock()
        mock_result.quotes = [
            {"symbol": "AAPL", "longname": "Apple Inc.", "exchange": "NASDAQ",
             "quoteType": "EQUITY"},
            {"symbol": "AAPL.BA", "longname": None, "shortname": "Apple BA",
             "exchange": "BCBA", "quoteType": "EQUITY"},
        ]
        with patch("yfinance.Search", return_value=mock_result):
            resp = client.get("/api/stocks/search?q=Apple")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["ticker"] == "AAPL"
        assert data[0]["name"] == "Apple Inc."

    def test_non_equity_results_excluded(self, client):
        mock_result = MagicMock()
        mock_result.quotes = [
            {"symbol": "AAPL", "longname": "Apple Inc.", "exchange": "NASDAQ", "quoteType": "EQUITY"},
            {"symbol": "AAPL-FUND", "longname": "Apple Fund", "exchange": "X", "quoteType": "MUTUALFUND"},
        ]
        with patch("yfinance.Search", return_value=mock_result):
            resp = client.get("/api/stocks/search?q=Apple")
        data = resp.json()
        assert all(r["type"] in ("EQUITY", "ETF") for r in data)


# ── Preset list ────────────────────────────────────────────────────────────────

def test_list_presets(client):
    resp = client.get("/api/stocks/presets")
    assert resp.status_code == 200
    data = resp.json()
    assert set(data.keys()) == {"sp500_sample", "tech", "value"}
    assert "AAPL" in data["tech"]


# ── Batch scan ────────────────────────────────────────────────────────────────

class TestBatchScan:
    def test_too_many_tickers_returns_400(self, client):
        tickers = ",".join([f"T{i}" for i in range(51)])
        resp = client.get(f"/api/stocks/batch/scan?tickers={tickers}")
        assert resp.status_code == 400
        assert "50" in resp.json()["detail"]

    def test_valid_tickers_returned(self, client):
        with patch("app.routers.stocks.get_stock_analysis", return_value=MOCK_ANALYSIS):
            resp = client.get("/api/stocks/batch/scan?tickers=AAPL,MSFT")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_error_tickers_excluded(self, client):
        def side_effect(ticker):
            if ticker == "FAKE":
                return {"error": "Not found"}
            return MOCK_ANALYSIS

        with patch("app.routers.stocks.get_stock_analysis", side_effect=side_effect):
            resp = client.get("/api/stocks/batch/scan?tickers=AAPL,FAKE")
        data = resp.json()
        assert all("error" not in r for r in data)


# ── Preset scan ───────────────────────────────────────────────────────────────

class TestPresetScan:
    def test_invalid_preset_returns_404(self, client):
        resp = client.get("/api/stocks/batch/preset/nonexistent")
        assert resp.status_code == 404

    def test_valid_preset_returns_list(self, client):
        with patch("app.routers.stocks.get_stock_analysis", return_value=MOCK_ANALYSIS):
            resp = client.get("/api/stocks/batch/preset/tech")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ── Single stock analysis ─────────────────────────────────────────────────────

class TestAnalyzeStock:
    def test_valid_ticker_returns_analysis(self, client):
        with patch("app.routers.stocks.get_stock_analysis", return_value=MOCK_ANALYSIS):
            resp = client.get("/api/stocks/AAPL")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ticker"] == "AAPL"
        assert "oversold_score" in data

    def test_unknown_ticker_returns_404(self, client):
        with patch("app.routers.stocks.get_stock_analysis",
                   return_value={"error": "No data found for ticker FAKE"}):
            resp = client.get("/api/stocks/FAKE")
        assert resp.status_code == 404

    def test_ticker_uppercased(self, client):
        captured = {}

        def capture(ticker):
            captured["ticker"] = ticker
            return MOCK_ANALYSIS

        with patch("app.routers.stocks.get_stock_analysis", side_effect=capture):
            client.get("/api/stocks/aapl")

        assert captured["ticker"] == "AAPL"


# ── Price history ─────────────────────────────────────────────────────────────

class TestPriceHistory:
    def test_returns_history(self, client):
        mock_data = [{"date": "2024-01-01", "close": 150.0, "rsi": 45.0}]
        with patch("app.routers.stocks.get_price_history", return_value=mock_data):
            resp = client.get("/api/stocks/AAPL/history?period=6mo")
        assert resp.status_code == 200
        assert resp.json() == mock_data

    def test_empty_history_returns_404(self, client):
        with patch("app.routers.stocks.get_price_history", return_value=[]):
            resp = client.get("/api/stocks/FAKE/history")
        assert resp.status_code == 404


# ── Score history ─────────────────────────────────────────────────────────────

def test_score_history_returns_empty_for_new_ticker(client):
    resp = client.get("/api/stocks/AAPL/score-history?days=30")
    assert resp.status_code == 200
    assert resp.json() == []
