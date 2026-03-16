from fastapi import APIRouter, HTTPException
from app.services.stock_analyzer import get_stock_analysis

router = APIRouter()


@router.get("/{ticker}")
def analyze_stock(ticker: str):
    result = get_stock_analysis(ticker.upper())
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/batch/scan")
def scan_stocks(tickers: str):
    """Scan multiple tickers, e.g. ?tickers=AAPL,MSFT,TSLA"""
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    results = []
    for ticker in ticker_list:
        data = get_stock_analysis(ticker)
        if "error" not in data:
            results.append(data)
    results.sort(key=lambda x: x["oversold_score"], reverse=True)
    return results
