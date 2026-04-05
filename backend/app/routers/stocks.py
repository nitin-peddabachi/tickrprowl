from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter, HTTPException
from app.services.stock_analyzer import get_stock_analysis, get_price_history

router = APIRouter()

# Preset lists
PRESETS = {
    "sp500_sample": [
        "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B", "UNH", "JPM",
        "JNJ", "V", "PG", "MA", "HD", "CVX", "MRK", "ABBV", "PEP", "KO",
        "BAC", "PFE", "AVGO", "COST", "TMO", "DIS", "CSCO", "ACN", "MCD", "ADBE",
        "WMT", "CRM", "NFLX", "AMD", "INTC", "QCOM", "TXN", "NEE", "PM", "RTX",
    ],
    "tech": [
        "AAPL", "MSFT", "GOOGL", "NVDA", "META", "TSLA", "AMD", "INTC", "QCOM",
        "ADBE", "CRM", "AVGO", "TXN", "ORCL", "IBM", "SNOW", "PLTR", "UBER", "LYFT", "SHOP",
    ],
    "value": [
        "BRK-B", "JPM", "JNJ", "PG", "KO", "PEP", "MCD", "WMT", "CVX", "XOM",
        "BAC", "WFC", "C", "GS", "MS", "T", "VZ", "MMM", "CAT", "DE",
    ],
}


@router.get("/search")
def search_stocks(q: str):
    """Search by company name or ticker, returns matching equities."""
    import yfinance as yf
    if not q or len(q) < 2:
        return []
    results = yf.Search(q, max_results=8)
    matches = []
    for quote in results.quotes:
        if quote.get("quoteType") not in ("EQUITY", "ETF"):
            continue
        matches.append({
            "ticker": quote.get("symbol", ""),
            "name": quote.get("longname") or quote.get("shortname", ""),
            "exchange": quote.get("exchange", ""),
            "type": quote.get("quoteType", ""),
        })
    return matches


def _fetch_many(ticker_list: list) -> list:
    """Fetch analysis for a list of tickers in parallel (up to 8 workers)."""
    results = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(get_stock_analysis, ticker): ticker for ticker in ticker_list}
        for future in as_completed(futures):
            data = future.result()
            if "error" not in data:
                results.append(data)
    results.sort(key=lambda x: x["oversold_score"], reverse=True)
    return results


@router.get("/batch/scan")
def scan_stocks(tickers: str):
    """Scan comma-separated tickers, e.g. ?tickers=AAPL,MSFT,TSLA"""
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    return _fetch_many(ticker_list)


@router.get("/batch/preset/{preset_name}")
def scan_preset(preset_name: str):
    """Scan a preset list of tickers"""
    ticker_list = PRESETS.get(preset_name)
    if not ticker_list:
        raise HTTPException(status_code=404, detail=f"Preset '{preset_name}' not found. Available: {list(PRESETS.keys())}")
    return _fetch_many(ticker_list)



@router.get("/presets")
def list_presets():
    return {name: tickers for name, tickers in PRESETS.items()}


@router.get("/{ticker}/history")
def price_history(ticker: str, period: str = "6mo"):
    data = get_price_history(ticker.upper(), period)
    if not data:
        raise HTTPException(status_code=404, detail=f"No history found for {ticker}")
    return data


@router.get("/{ticker}")
def analyze_stock(ticker: str):
    result = get_stock_analysis(ticker.upper())
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result
