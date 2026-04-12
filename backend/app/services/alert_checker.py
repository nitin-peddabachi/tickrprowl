from datetime import datetime, timedelta
from app.models.database import SessionLocal, Alert, Notification
from app.services.stock_analyzer import get_stock_analysis

ALERT_TYPE_LABELS = {
    "rsi_below": "RSI Below",
    "price_below": "Price Below",
    "score_above": "Oversold Score Above",
}


def check_alerts():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Running alert check...")
    db = SessionLocal()
    try:
        alerts = db.query(Alert).filter(Alert.is_active == True).all()
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
            if not analysis:
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

            if triggered and current_value is not None:
                notification = Notification(
                    ticker=alert.ticker,
                    alert_type=alert.alert_type,
                    threshold=alert.threshold,
                    current_value=current_value,
                    message=message,
                )
                db.add(notification)
                alert.last_triggered = now
                print(f"  ALERT: {message}")

        db.commit()
    except Exception as e:
        print(f"Alert check error: {e}")
        db.rollback()
    finally:
        db.close()
