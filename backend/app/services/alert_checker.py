import os
from datetime import datetime, timedelta

import httpx
from dotenv import load_dotenv

from app.models.database import SessionLocal, Alert, Notification, ScoreHistory, WatchlistItem
from app.services.stock_analyzer import get_stock_analysis

load_dotenv()

TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")


def send_telegram(message: str) -> None:
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        return
    try:
        httpx.post(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            json={"chat_id": TELEGRAM_CHAT_ID, "text": message},
            timeout=5,
        )
    except Exception as e:
        print(f"Telegram send failed: {e}")

ALERT_TYPE_LABELS = {
    "rsi_below": "RSI Below",
    "price_below": "Price Below",
    "score_above": "Oversold Score Above",
    "near_52w_low": "Near 52-Week Low",
    "rsi_divergence": "Bullish RSI Divergence",
    "absolute_steal": "Absolute Steal",
}


def record_watchlist_scores():
    """Daily job: record oversold score snapshots for every watchlisted stock."""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Recording watchlist score snapshots...")
    db = SessionLocal()
    try:
        tickers = [row.ticker for row in db.query(WatchlistItem.ticker).all()]
        if not tickers:
            print("  No watchlist items — skipping.")
            return

        for ticker in tickers:
            try:
                result = get_stock_analysis(ticker)
                if "error" in result:
                    continue
                row = ScoreHistory(
                    ticker=ticker,
                    score=result["oversold_score"],
                    signal=result["signal"],
                    rsi=round(result["technicals"]["rsi"], 2),
                    price=result["current_price"],
                )
                db.add(row)
                print(f"  {ticker}: score={result['oversold_score']} ({result['signal']})")
            except Exception as e:
                print(f"  Failed to record score for {ticker}: {e}")

        db.commit()
    except Exception as e:
        print(f"Score snapshot error: {e}")
        db.rollback()
    finally:
        db.close()


def _was_notified_recently(db, ticker: str, alert_type: str, user_id: str = "", hours: int = 4) -> bool:
    """Return True if a notification of this type was already sent for this ticker/user within the cooldown window."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    return (
        db.query(Notification)
        .filter(
            Notification.ticker == ticker,
            Notification.user_id == user_id,
            Notification.alert_type == alert_type,
            Notification.triggered_at >= cutoff,
        )
        .first()
        is not None
    )


def check_watchlist_auto_alerts():
    """
    Automatically fire Telegram alerts for watchlist stocks that hit high-value signals,
    without requiring the user to set up an explicit alert rule:
      - Oversold score >= 70 (Strong Buy)
      - Bullish RSI divergence detected
      - Absolute steal (all criteria met)
    """
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Running watchlist auto-alert scan...")
    db = SessionLocal()
    try:
        watchlist_items = db.query(WatchlistItem).all()
        if not watchlist_items:
            return

        for item in watchlist_items:
            ticker = item.ticker
            try:
                analysis = get_stock_analysis(ticker)
                if "error" in analysis:
                    continue
            except Exception as e:
                print(f"  Failed to fetch {ticker}: {e}")
                continue

            score = analysis["oversold_score"]
            rsi = analysis["technicals"]["rsi"]
            price = analysis["current_price"]

            # --- Score >= 70 (Strong Buy) ---
            if score >= 70 and not _was_notified_recently(db, ticker, "score_above", item.user_id):
                msg = (
                    f"⚡ Watchlist Alert: {ticker}\n"
                    f"Oversold score hit {score} (Strong Buy)\n"
                    f"Price: ${price:.2f}  RSI: {rsi:.1f}"
                )
                send_telegram(f"🔔 TickrProwl Alert\n{msg}")
                db.add(Notification(
                    ticker=ticker, user_id=item.user_id,
                    alert_type="score_above", threshold=70,
                    current_value=score, message=msg,
                ))
                print(f"  AUTO ALERT (score): {ticker} score={score}")

            # --- Bullish RSI divergence ---
            divergence = analysis.get("rsi_divergence", {})
            if divergence.get("detected") and not _was_notified_recently(db, ticker, "rsi_divergence", item.user_id):
                msg = (
                    f"📈 Watchlist Alert: {ticker} — Bullish RSI Divergence\n"
                    f"{divergence.get('description', '')}\n"
                    f"Price: ${price:.2f}  Score: {score}"
                )
                send_telegram(f"🔔 TickrProwl Alert\n{msg}")
                db.add(Notification(
                    ticker=ticker, user_id=item.user_id,
                    alert_type="rsi_divergence", threshold=0,
                    current_value=rsi, message=msg,
                ))
                print(f"  AUTO ALERT (divergence): {ticker}")

            # --- Absolute steal ---
            if analysis.get("is_absolute_steal") and not _was_notified_recently(db, ticker, "absolute_steal", item.user_id):
                conditions_met = sum(1 for v in analysis.get("steal_conditions", {}).values() if v)
                msg = (
                    f"🚨 Watchlist Alert: {ticker} — ABSOLUTE STEAL\n"
                    f"All {conditions_met}/7 criteria met\n"
                    f"Price: ${price:.2f}  Score: {score}  RSI: {rsi:.1f}"
                )
                send_telegram(f"🔔 TickrProwl Alert\n{msg}")
                db.add(Notification(
                    ticker=ticker, user_id=item.user_id,
                    alert_type="absolute_steal", threshold=0,
                    current_value=score, message=msg,
                ))
                print(f"  AUTO ALERT (steal): {ticker}")

        db.commit()
    except Exception as e:
        print(f"Watchlist auto-alert error: {e}")
        db.rollback()
    finally:
        db.close()


def check_alerts(user_id: str = None):
    scope = f"user={user_id}" if user_id else "all users"
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Running alert check ({scope})...")
    db = SessionLocal()
    try:
        query = db.query(Alert).filter(Alert.is_active == True)
        if user_id:
            query = query.filter(Alert.user_id == user_id)
        alerts = query.all()
        if not alerts:
            return

        # Group by ticker to avoid duplicate API calls
        tickers = list(set(a.ticker for a in alerts))
        analyses = {}
        for ticker in tickers:
            try:
                result = get_stock_analysis(ticker)
                if "error" not in result:
                    analyses[ticker] = result
            except Exception as e:
                print(f"  Failed to fetch {ticker}: {e}")

        now = datetime.utcnow()
        cooldown = timedelta(hours=4)  # Don't re-trigger same alert within 4 hours

        for alert in alerts:
            analysis = analyses.get(alert.ticker)
            if analysis is None:
                print(f"  Skipping alert {alert.id} ({alert.ticker}): analysis unavailable")
                continue

            # Skip if triggered recently
            if alert.last_triggered and (now - alert.last_triggered) < cooldown:
                continue

            current_value = None
            triggered = False
            message = ""

            if alert.alert_type == "rsi_below":
                current_value = analysis["technicals"]["rsi"]
                if current_value <= alert.threshold:
                    triggered = True
                    message = f"{alert.ticker} RSI is {current_value:.1f} — below your alert threshold of {alert.threshold}"

            elif alert.alert_type == "price_below":
                current_value = analysis["current_price"]
                if current_value <= alert.threshold:
                    triggered = True
                    message = f"{alert.ticker} price is ${current_value:.2f} — below your alert of ${alert.threshold:.2f}"

            elif alert.alert_type == "score_above":
                current_value = analysis["oversold_score"]
                if current_value >= alert.threshold:
                    triggered = True
                    message = f"{alert.ticker} oversold score is {current_value} — above your alert threshold of {alert.threshold}"

            elif alert.alert_type == "near_52w_low":
                # threshold = how close (%) to 52w low to trigger, e.g. 5 = within 5%
                price_52w_low = analysis.get("price_52w_low")
                current_price = analysis["current_price"]
                if price_52w_low and price_52w_low > 0:
                    pct_from_low = (current_price - price_52w_low) / price_52w_low * 100
                    current_value = round(pct_from_low, 2)
                    if pct_from_low <= alert.threshold:
                        triggered = True
                        message = (
                            f"{alert.ticker} is ${current_price:.2f} — only {pct_from_low:.1f}% above "
                            f"its 52-week low of ${price_52w_low:.2f}"
                        )

            elif alert.alert_type == "rsi_divergence":
                divergence = analysis.get("rsi_divergence", {})
                if divergence.get("detected"):
                    current_value = analysis["technicals"]["rsi"]
                    triggered = True
                    message = (
                        f"{alert.ticker} — Bullish RSI Divergence detected\n"
                        f"{divergence.get('description', '')}"
                    )

            elif alert.alert_type == "absolute_steal":
                if analysis.get("is_absolute_steal"):
                    current_value = analysis["oversold_score"]
                    triggered = True
                    conditions_met = sum(1 for v in analysis.get("steal_conditions", {}).values() if v)
                    message = (
                        f"{alert.ticker} meets ALL absolute steal criteria "
                        f"({conditions_met}/7 conditions) — score {current_value}, "
                        f"RSI {analysis['technicals']['rsi']:.1f}"
                    )

            if triggered and current_value is not None:
                notification = Notification(
                    ticker=alert.ticker,
                    user_id=alert.user_id,
                    alert_type=alert.alert_type,
                    threshold=alert.threshold,
                    current_value=current_value,
                    message=message,
                )
                db.add(notification)
                alert.last_triggered = now
                print(f"  ALERT: {message}")
                send_telegram(f"🔔 TickrProwl Alert\n{message}")

        db.commit()
    except Exception as e:
        print(f"Alert check error: {e}")
        db.rollback()
    finally:
        db.close()
