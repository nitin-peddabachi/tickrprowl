"""
API tests for the /api/alerts router.

All tests use an in-memory DB and a fixed test_user (see conftest.py).
check_alerts is mocked so the manual trigger test never calls yfinance.
"""

from unittest.mock import patch
import pytest


# ── Alert CRUD ────────────────────────────────────────────────────────────────

class TestCreateAlert:
    def test_valid_rsi_alert(self, client):
        resp = client.post("/api/alerts/", json={
            "ticker": "AAPL", "alert_type": "rsi_below", "threshold": 30.0,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] is not None
        assert "AAPL" in data["message"]

    def test_valid_price_alert(self, client):
        resp = client.post("/api/alerts/", json={
            "ticker": "TSLA", "alert_type": "price_below", "threshold": 200.0,
        })
        assert resp.status_code == 200

    def test_valid_score_alert(self, client):
        resp = client.post("/api/alerts/", json={
            "ticker": "MSFT", "alert_type": "score_above", "threshold": 70.0,
        })
        assert resp.status_code == 200

    def test_invalid_alert_type_returns_400(self, client):
        resp = client.post("/api/alerts/", json={
            "ticker": "AAPL", "alert_type": "bad_type", "threshold": 30.0,
        })
        assert resp.status_code == 400
        assert "Invalid alert_type" in resp.json()["detail"]

    def test_ticker_uppercased(self, client):
        resp = client.post("/api/alerts/", json={
            "ticker": "aapl", "alert_type": "rsi_below", "threshold": 30.0,
        })
        assert resp.status_code == 200
        alerts = client.get("/api/alerts/").json()
        assert alerts[0]["ticker"] == "AAPL"


class TestGetAlerts:
    def test_empty_initially(self, client):
        resp = client.get("/api/alerts/")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_created_alert(self, client):
        client.post("/api/alerts/", json={
            "ticker": "AAPL", "alert_type": "rsi_below", "threshold": 30.0,
        })
        resp = client.get("/api/alerts/")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["ticker"] == "AAPL"
        assert data[0]["alert_type"] == "rsi_below"
        assert data[0]["threshold"] == 30.0
        assert data[0]["is_active"] is True

    def test_multiple_alerts_returned(self, client):
        for ticker in ["AAPL", "MSFT", "TSLA"]:
            client.post("/api/alerts/", json={
                "ticker": ticker, "alert_type": "price_below", "threshold": 100.0,
            })
        resp = client.get("/api/alerts/")
        assert len(resp.json()) == 3


class TestToggleAlert:
    def _create_alert(self, client):
        resp = client.post("/api/alerts/", json={
            "ticker": "AAPL", "alert_type": "rsi_below", "threshold": 30.0,
        })
        return resp.json()["id"]

    def test_toggle_deactivates(self, client):
        alert_id = self._create_alert(client)
        resp = client.patch(f"/api/alerts/{alert_id}/toggle")
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    def test_toggle_reactivates(self, client):
        alert_id = self._create_alert(client)
        client.patch(f"/api/alerts/{alert_id}/toggle")
        resp = client.patch(f"/api/alerts/{alert_id}/toggle")
        assert resp.json()["is_active"] is True

    def test_toggle_nonexistent_returns_404(self, client):
        resp = client.patch("/api/alerts/9999/toggle")
        assert resp.status_code == 404


class TestDeleteAlert:
    def test_delete_removes_alert(self, client):
        resp = client.post("/api/alerts/", json={
            "ticker": "AAPL", "alert_type": "rsi_below", "threshold": 30.0,
        })
        alert_id = resp.json()["id"]
        client.delete(f"/api/alerts/{alert_id}")
        assert client.get("/api/alerts/").json() == []

    def test_delete_nonexistent_returns_404(self, client):
        resp = client.delete("/api/alerts/9999")
        assert resp.status_code == 404


# ── Notifications ─────────────────────────────────────────────────────────────

class TestNotifications:
    def test_notifications_empty_initially(self, client):
        resp = client.get("/api/alerts/notifications")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_unread_count_zero_initially(self, client):
        resp = client.get("/api/alerts/notifications/unread-count")
        assert resp.status_code == 200
        assert resp.json()["count"] == 0

    def test_mark_all_read(self, client):
        resp = client.post("/api/alerts/notifications/mark-read")
        assert resp.status_code == 200


# ── Manual check trigger ──────────────────────────────────────────────────────

def test_check_now_runs_without_error(client):
    with patch("app.routers.alerts.check_alerts"):
        resp = client.post("/api/alerts/check-now")
    assert resp.status_code == 200
    assert "complete" in resp.json()["message"].lower()
