"""
API tests for the /api/watchlist router.

get_stock_analysis is mocked so tests never call yfinance.
"""

from unittest.mock import patch
import pytest


MOCK_ANALYSIS = {
    "ticker": "AAPL",
    "company_name": "Apple Inc.",
    "sector": "Technology",
    "current_price": 150.0,
    "oversold_score": 45,
    "signal": "Watch",
}


# ── GET /api/watchlist/ ───────────────────────────────────────────────────────

class TestGetWatchlist:
    def test_empty_initially(self, client):
        resp = client.get("/api/watchlist/")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_added_items(self, client):
        with patch("app.routers.watchlist.get_stock_analysis", return_value=MOCK_ANALYSIS):
            client.post("/api/watchlist/", json={"ticker": "AAPL"})
            resp = client.get("/api/watchlist/")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["ticker"] == "AAPL"


# ── POST /api/watchlist/ ──────────────────────────────────────────────────────

class TestAddToWatchlist:
    def test_add_new_ticker(self, client):
        with patch("app.routers.watchlist.get_stock_analysis", return_value=MOCK_ANALYSIS):
            resp = client.post("/api/watchlist/", json={"ticker": "AAPL"})
        assert resp.status_code == 200
        assert "AAPL" in resp.json()["message"]

    def test_ticker_uppercased(self, client):
        with patch("app.routers.watchlist.get_stock_analysis", return_value=MOCK_ANALYSIS):
            resp = client.post("/api/watchlist/", json={"ticker": "aapl"})
        assert resp.status_code == 200
        data = client.get("/api/watchlist/").json()
        # The DB stores the uppercased ticker
        assert data[0]["ticker"] == "AAPL"

    def test_duplicate_returns_400(self, client):
        with patch("app.routers.watchlist.get_stock_analysis", return_value=MOCK_ANALYSIS):
            client.post("/api/watchlist/", json={"ticker": "AAPL"})
            resp = client.post("/api/watchlist/", json={"ticker": "AAPL"})
        assert resp.status_code == 400
        assert "already in" in resp.json()["detail"]

    def test_metadata_stored(self, client):
        with patch("app.routers.watchlist.get_stock_analysis", return_value=MOCK_ANALYSIS):
            client.post("/api/watchlist/", json={
                "ticker": "AAPL",
                "notes": "Long-term hold",
                "target_price": 200.0,
            })
            resp = client.get("/api/watchlist/")

        item = resp.json()[0]
        assert item["notes"] == "Long-term hold"
        assert item["target_price"] == 200.0

    def test_company_name_from_analysis_when_not_provided(self, client):
        with patch("app.routers.watchlist.get_stock_analysis", return_value=MOCK_ANALYSIS):
            client.post("/api/watchlist/", json={"ticker": "AAPL"})
            data = client.get("/api/watchlist/").json()

        assert data[0]["company_name"] == "Apple Inc."

    def test_company_name_override(self, client):
        with patch("app.routers.watchlist.get_stock_analysis", return_value=MOCK_ANALYSIS):
            client.post("/api/watchlist/", json={
                "ticker": "AAPL", "company_name": "My Apple",
            })
            data = client.get("/api/watchlist/").json()

        assert data[0]["company_name"] == "My Apple"


# ── PATCH /api/watchlist/{ticker} ────────────────────────────────────────────

class TestUpdateWatchlistItem:
    def _add(self, client):
        with patch("app.routers.watchlist.get_stock_analysis", return_value=MOCK_ANALYSIS):
            client.post("/api/watchlist/", json={"ticker": "AAPL"})

    def test_update_notes(self, client):
        self._add(client)
        resp = client.patch("/api/watchlist/AAPL", json={"ticker": "AAPL", "notes": "Updated note"})
        assert resp.status_code == 200

        with patch("app.routers.watchlist.get_stock_analysis", return_value=MOCK_ANALYSIS):
            data = client.get("/api/watchlist/").json()
        assert data[0]["notes"] == "Updated note"

    def test_update_target_price(self, client):
        self._add(client)
        resp = client.patch("/api/watchlist/AAPL", json={"ticker": "AAPL", "target_price": 175.0})
        assert resp.status_code == 200

        with patch("app.routers.watchlist.get_stock_analysis", return_value=MOCK_ANALYSIS):
            data = client.get("/api/watchlist/").json()
        assert data[0]["target_price"] == 175.0

    def test_update_nonexistent_returns_404(self, client):
        resp = client.patch("/api/watchlist/FAKE", json={"ticker": "FAKE", "notes": "x"})
        assert resp.status_code == 404


# ── DELETE /api/watchlist/{ticker} ───────────────────────────────────────────

class TestRemoveFromWatchlist:
    def test_remove_existing(self, client):
        with patch("app.routers.watchlist.get_stock_analysis", return_value=MOCK_ANALYSIS):
            client.post("/api/watchlist/", json={"ticker": "AAPL"})
        resp = client.delete("/api/watchlist/AAPL")
        assert resp.status_code == 200
        assert client.get("/api/watchlist/").json() == []

    def test_remove_nonexistent_returns_404(self, client):
        resp = client.delete("/api/watchlist/FAKE")
        assert resp.status_code == 404

    def test_remove_case_insensitive(self, client):
        with patch("app.routers.watchlist.get_stock_analysis", return_value=MOCK_ANALYSIS):
            client.post("/api/watchlist/", json={"ticker": "AAPL"})
        resp = client.delete("/api/watchlist/aapl")
        assert resp.status_code == 200
