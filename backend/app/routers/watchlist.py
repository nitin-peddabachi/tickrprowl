from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.models.database import get_db, WatchlistItem
from app.services.stock_analyzer import get_stock_analysis

router = APIRouter()


class WatchlistAdd(BaseModel):
    ticker: str
    company_name: Optional[str] = None
    sector: Optional[str] = None
    notes: Optional[str] = None
    target_price: Optional[float] = None


@router.get("/")
def get_watchlist(db: Session = Depends(get_db)):
    items = db.query(WatchlistItem).all()
    results = []
    for item in items:
        analysis = get_stock_analysis(item.ticker)
        results.append({
            "ticker": item.ticker,
            "company_name": item.company_name,
            "sector": item.sector,
            "notes": item.notes,
            "target_price": item.target_price,
            "added_at": item.added_at.isoformat() if item.added_at else None,
            "analysis": analysis if "error" not in analysis else None,
        })
    return results


@router.post("/")
def add_to_watchlist(payload: WatchlistAdd, db: Session = Depends(get_db)):
    ticker = payload.ticker.upper()
    existing = db.query(WatchlistItem).filter(WatchlistItem.ticker == ticker).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"{ticker} is already in your watchlist")

    # Auto-fill company name and sector if not provided
    company_name = payload.company_name
    sector = payload.sector
    if not company_name or not sector:
        analysis = get_stock_analysis(ticker)
        if "error" not in analysis:
            company_name = company_name or analysis.get("company_name")
            sector = sector or analysis.get("sector")

    item = WatchlistItem(
        ticker=ticker,
        company_name=company_name,
        sector=sector,
        notes=payload.notes,
        target_price=payload.target_price,
    )
    db.add(item)
    db.commit()
    return {"message": f"{ticker} added to watchlist"}


@router.patch("/{ticker}")
def update_watchlist_item(ticker: str, payload: WatchlistAdd, db: Session = Depends(get_db)):
    item = db.query(WatchlistItem).filter(WatchlistItem.ticker == ticker.upper()).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"{ticker} not in watchlist")
    if payload.notes is not None:
        item.notes = payload.notes
    if payload.target_price is not None:
        item.target_price = payload.target_price
    db.commit()
    return {"message": f"{ticker} updated"}


@router.delete("/{ticker}")
def remove_from_watchlist(ticker: str, db: Session = Depends(get_db)):
    item = db.query(WatchlistItem).filter(WatchlistItem.ticker == ticker.upper()).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"{ticker} not in watchlist")
    db.delete(item)
    db.commit()
    return {"message": f"{ticker} removed from watchlist"}
