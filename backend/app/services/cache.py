import json
from datetime import datetime, timedelta
from typing import Any, Optional

from app.models.database import SessionLocal, StockCache

TTL_MINUTES = 60


def get(key: str) -> Optional[Any]:
    db = SessionLocal()
    try:
        row = db.query(StockCache).filter(StockCache.ticker == key).first()
        if row is None:
            return None
        if datetime.utcnow() > row.cached_at + timedelta(minutes=TTL_MINUTES):
            db.delete(row)
            db.commit()
            return None
        return json.loads(row.data)
    finally:
        db.close()


def set(key: str, value: Any) -> None:
    db = SessionLocal()
    try:
        row = db.query(StockCache).filter(StockCache.ticker == key).first()
        if row:
            row.data = json.dumps(value)
            row.cached_at = datetime.utcnow()
        else:
            db.add(StockCache(ticker=key, data=json.dumps(value), cached_at=datetime.utcnow()))
        db.commit()
    finally:
        db.close()


def invalidate(key: str) -> None:
    db = SessionLocal()
    try:
        db.query(StockCache).filter(StockCache.ticker == key).delete()
        db.commit()
    finally:
        db.close()
