"""
Unit tests for the alert_checker service.

The DB is isolated via conftest fixtures. get_stock_analysis and send_telegram
are both mocked so no network calls are made.
"""

from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
import pytest

from app.models.database import Alert, Notification
from app.services.alert_checker import check_alerts


def _make_analysis(rsi=50.0, price=100.0, score=40):
    return {
        "technicals": {"rsi": rsi},
        "current_price": price,
        "oversold_score": score,
    }


def _add_alert(db_session, ticker, alert_type, threshold, is_active=True, last_triggered=None):
    alert = Alert(
        ticker=ticker,
        user_id="test_user",
        alert_type=alert_type,
        threshold=threshold,
        is_active=is_active,
        last_triggered=last_triggered,
    )
    db_session.add(alert)
    db_session.commit()
    return alert


# ── rsi_below ─────────────────────────────────────────────────────────────────

class TestRsiBelow:
    def test_triggers_when_rsi_at_threshold(self, db_session):
        _add_alert(db_session, "AAPL", "rsi_below", 30.0)
        analysis = _make_analysis(rsi=30.0)

        with patch("app.services.alert_checker.SessionLocal", return_value=db_session), \
             patch("app.services.alert_checker.get_stock_analysis", return_value=analysis), \
             patch("app.services.alert_checker.send_telegram"):
            check_alerts()

        notifications = db_session.query(Notification).all()
        assert len(notifications) == 1
        assert notifications[0].alert_type == "rsi_below"
        assert notifications[0].current_value == 30.0

    def test_triggers_when_rsi_below_threshold(self, db_session):
        _add_alert(db_session, "AAPL", "rsi_below", 30.0)
        analysis = _make_analysis(rsi=25.0)

        with patch("app.services.alert_checker.SessionLocal", return_value=db_session), \
             patch("app.services.alert_checker.get_stock_analysis", return_value=analysis), \
             patch("app.services.alert_checker.send_telegram"):
            check_alerts()

        assert db_session.query(Notification).count() == 1

    def test_no_trigger_when_rsi_above_threshold(self, db_session):
        _add_alert(db_session, "AAPL", "rsi_below", 30.0)
        analysis = _make_analysis(rsi=35.0)

        with patch("app.services.alert_checker.SessionLocal", return_value=db_session), \
             patch("app.services.alert_checker.get_stock_analysis", return_value=analysis), \
             patch("app.services.alert_checker.send_telegram"):
            check_alerts()

        assert db_session.query(Notification).count() == 0


# ── price_below ───────────────────────────────────────────────────────────────

class TestPriceBelow:
    def test_triggers_when_price_at_threshold(self, db_session):
        _add_alert(db_session, "TSLA", "price_below", 200.0)
        analysis = _make_analysis(price=200.0)

        with patch("app.services.alert_checker.SessionLocal", return_value=db_session), \
             patch("app.services.alert_checker.get_stock_analysis", return_value=analysis), \
             patch("app.services.alert_checker.send_telegram"):
            check_alerts()

        assert db_session.query(Notification).count() == 1

    def test_no_trigger_when_price_above_threshold(self, db_session):
        _add_alert(db_session, "TSLA", "price_below", 200.0)
        analysis = _make_analysis(price=210.0)

        with patch("app.services.alert_checker.SessionLocal", return_value=db_session), \
             patch("app.services.alert_checker.get_stock_analysis", return_value=analysis), \
             patch("app.services.alert_checker.send_telegram"):
            check_alerts()

        assert db_session.query(Notification).count() == 0


# ── score_above ───────────────────────────────────────────────────────────────

class TestScoreAbove:
    def test_triggers_when_score_at_threshold(self, db_session):
        _add_alert(db_session, "MSFT", "score_above", 70.0)
        analysis = _make_analysis(score=70)

        with patch("app.services.alert_checker.SessionLocal", return_value=db_session), \
             patch("app.services.alert_checker.get_stock_analysis", return_value=analysis), \
             patch("app.services.alert_checker.send_telegram"):
            check_alerts()

        assert db_session.query(Notification).count() == 1

    def test_no_trigger_when_score_below_threshold(self, db_session):
        _add_alert(db_session, "MSFT", "score_above", 70.0)
        analysis = _make_analysis(score=65)

        with patch("app.services.alert_checker.SessionLocal", return_value=db_session), \
             patch("app.services.alert_checker.get_stock_analysis", return_value=analysis), \
             patch("app.services.alert_checker.send_telegram"):
            check_alerts()

        assert db_session.query(Notification).count() == 0


# ── Cooldown ──────────────────────────────────────────────────────────────────

class TestCooldown:
    def test_no_retrigger_within_4_hours(self, db_session):
        recent = datetime.utcnow() - timedelta(hours=2)
        _add_alert(db_session, "AAPL", "rsi_below", 30.0, last_triggered=recent)
        analysis = _make_analysis(rsi=20.0)

        with patch("app.services.alert_checker.SessionLocal", return_value=db_session), \
             patch("app.services.alert_checker.get_stock_analysis", return_value=analysis), \
             patch("app.services.alert_checker.send_telegram"):
            check_alerts()

        assert db_session.query(Notification).count() == 0

    def test_retrigger_after_cooldown_expires(self, db_session):
        old = datetime.utcnow() - timedelta(hours=5)
        _add_alert(db_session, "AAPL", "rsi_below", 30.0, last_triggered=old)
        analysis = _make_analysis(rsi=20.0)

        with patch("app.services.alert_checker.SessionLocal", return_value=db_session), \
             patch("app.services.alert_checker.get_stock_analysis", return_value=analysis), \
             patch("app.services.alert_checker.send_telegram"):
            check_alerts()

        assert db_session.query(Notification).count() == 1

    def test_never_triggered_not_blocked(self, db_session):
        _add_alert(db_session, "AAPL", "rsi_below", 30.0, last_triggered=None)
        analysis = _make_analysis(rsi=20.0)

        with patch("app.services.alert_checker.SessionLocal", return_value=db_session), \
             patch("app.services.alert_checker.get_stock_analysis", return_value=analysis), \
             patch("app.services.alert_checker.send_telegram"):
            check_alerts()

        assert db_session.query(Notification).count() == 1


# ── Inactive alerts ────────────────────────────────────────────────────────────

def test_inactive_alert_not_triggered(db_session):
    _add_alert(db_session, "AAPL", "rsi_below", 30.0, is_active=False)
    analysis = _make_analysis(rsi=20.0)

    with patch("app.services.alert_checker.SessionLocal", return_value=db_session), \
         patch("app.services.alert_checker.get_stock_analysis", return_value=analysis), \
         patch("app.services.alert_checker.send_telegram"):
        check_alerts()

    assert db_session.query(Notification).count() == 0


# ── Failed yfinance fetch ─────────────────────────────────────────────────────

def test_failed_fetch_skips_alert_gracefully(db_session):
    _add_alert(db_session, "AAPL", "rsi_below", 30.0)

    with patch("app.services.alert_checker.SessionLocal", return_value=db_session), \
         patch("app.services.alert_checker.get_stock_analysis", side_effect=Exception("network error")), \
         patch("app.services.alert_checker.send_telegram"):
        check_alerts()  # should not raise

    assert db_session.query(Notification).count() == 0


# ── Deduplication — single API call per ticker ────────────────────────────────

def test_multiple_alerts_same_ticker_single_api_call(db_session):
    _add_alert(db_session, "AAPL", "rsi_below", 30.0)
    _add_alert(db_session, "AAPL", "price_below", 100.0)
    analysis = _make_analysis(rsi=20.0, price=90.0)

    call_count = {"n": 0}

    def counting_analysis(ticker):
        call_count["n"] += 1
        return analysis

    with patch("app.services.alert_checker.SessionLocal", return_value=db_session), \
         patch("app.services.alert_checker.get_stock_analysis", side_effect=counting_analysis), \
         patch("app.services.alert_checker.send_telegram"):
        check_alerts()

    assert call_count["n"] == 1
    assert db_session.query(Notification).count() == 2


# ── Notification fields ───────────────────────────────────────────────────────

def test_notification_message_contains_ticker(db_session):
    _add_alert(db_session, "AAPL", "rsi_below", 30.0)
    analysis = _make_analysis(rsi=25.0)

    with patch("app.services.alert_checker.SessionLocal", return_value=db_session), \
         patch("app.services.alert_checker.get_stock_analysis", return_value=analysis), \
         patch("app.services.alert_checker.send_telegram"):
        check_alerts()

    notif = db_session.query(Notification).first()
    assert "AAPL" in notif.message
    assert notif.ticker == "AAPL"
    assert notif.threshold == 30.0
    assert notif.is_read is False
