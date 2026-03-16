from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.models.database import get_db, Alert, Notification
from app.services.alert_checker import check_alerts

router = APIRouter()

VALID_TYPES = {"rsi_below", "price_below", "score_above"}


class AlertCreate(BaseModel):
    ticker: str
    alert_type: str
    threshold: float


@router.get("/")
def get_alerts(db: Session = Depends(get_db)):
    alerts = db.query(Alert).order_by(Alert.created_at.desc()).all()
    return [
        {
            "id": a.id,
            "ticker": a.ticker,
            "alert_type": a.alert_type,
            "threshold": a.threshold,
            "is_active": a.is_active,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "last_triggered": a.last_triggered.isoformat() if a.last_triggered else None,
        }
        for a in alerts
    ]


@router.post("/")
def create_alert(payload: AlertCreate, db: Session = Depends(get_db)):
    if payload.alert_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid alert_type. Must be one of: {VALID_TYPES}")

    alert = Alert(
        ticker=payload.ticker.upper(),
        alert_type=payload.alert_type,
        threshold=payload.threshold,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return {"message": f"Alert created for {alert.ticker}", "id": alert.id}


@router.patch("/{alert_id}/toggle")
def toggle_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_active = not alert.is_active
    db.commit()
    return {"message": f"Alert {'activated' if alert.is_active else 'paused'}", "is_active": alert.is_active}


@router.delete("/{alert_id}")
def delete_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    db.delete(alert)
    db.commit()
    return {"message": "Alert deleted"}


# --- Notifications ---

@router.get("/notifications")
def get_notifications(db: Session = Depends(get_db)):
    notifications = db.query(Notification).order_by(Notification.triggered_at.desc()).limit(50).all()
    return [
        {
            "id": n.id,
            "ticker": n.ticker,
            "alert_type": n.alert_type,
            "threshold": n.threshold,
            "current_value": n.current_value,
            "message": n.message,
            "is_read": n.is_read,
            "triggered_at": n.triggered_at.isoformat() if n.triggered_at else None,
        }
        for n in notifications
    ]


@router.get("/notifications/unread-count")
def unread_count(db: Session = Depends(get_db)):
    count = db.query(Notification).filter(Notification.is_read == False).count()
    return {"count": count}


@router.post("/notifications/mark-read")
def mark_all_read(db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.is_read == False).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read"}


@router.post("/check-now")
def run_check_now():
    """Manually trigger an alert check — useful for testing."""
    check_alerts()
    return {"message": "Alert check complete"}
