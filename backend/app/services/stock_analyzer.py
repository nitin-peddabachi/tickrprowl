import yfinance as yf
import pandas as pd
import ta
from app.services import cache as _cache


def get_price_history(ticker: str, period: str = "6mo") -> list:
    valid_periods = {"1mo", "3mo", "6mo", "1y", "2y"}
    if period not in valid_periods:
        period = "6mo"

    # Always fetch at least 3mo so BB (window=20) and RSI (window=14) have
    # enough warm-up data, then trim to the requested period at the end.
    fetch_period = period if period not in {"1mo"} else "3mo"

    stock = yf.Ticker(ticker)
    hist = stock.history(period=fetch_period)
    if hist.empty:
        return []

    close = hist["Close"]

    # RSI
    rsi_series = ta.momentum.RSIIndicator(close, window=14).rsi()

    # Bollinger Bands
    bb = ta.volatility.BollingerBands(close, window=20)
    bb_upper = bb.bollinger_hband()
    bb_lower = bb.bollinger_lband()
    bb_mid = bb.bollinger_mavg()

    # Trim to requested period
    if period == "1mo":
        cutoff = hist.index[-1] - pd.DateOffset(months=1)
        hist = hist[hist.index >= cutoff]

    result = []
    for date, row in hist.iterrows():
        date_str = date.strftime("%Y-%m-%d")
        result.append({
            "date": date_str,
            "open": round(float(row["Open"]), 2),
            "high": round(float(row["High"]), 2),
            "low": round(float(row["Low"]), 2),
            "close": round(float(row["Close"]), 2),
            "volume": int(row["Volume"]),
            "rsi": round(float(rsi_series[date]), 2) if not pd.isna(rsi_series[date]) else None,
            "bb_upper": round(float(bb_upper[date]), 2) if not pd.isna(bb_upper[date]) else None,
            "bb_lower": round(float(bb_lower[date]), 2) if not pd.isna(bb_lower[date]) else None,
            "bb_mid": round(float(bb_mid[date]), 2) if not pd.isna(bb_mid[date]) else None,
        })

    return result


def get_stock_analysis(ticker: str) -> dict:
    cached = _cache.get(ticker.upper())
    if cached:
        return cached

    stock = yf.Ticker(ticker)

    # Price history (6 months for technical indicators)
    hist = stock.history(period="6mo")
    if hist.empty:
        return {"error": f"No data found for ticker {ticker}"}

    close = hist["Close"]

    # Technical indicators
    rsi = ta.momentum.RSIIndicator(close).rsi().iloc[-1]
    macd = ta.trend.MACD(close)
    macd_line = macd.macd().iloc[-1]
    signal_line = macd.macd_signal().iloc[-1]
    bb = ta.volatility.BollingerBands(close)
    bb_percent = bb.bollinger_pband().iloc[-1]  # 0 = at lower band, 1 = at upper band

    current_price = round(close.iloc[-1], 2)
    price_52w_high = round(hist["High"].max(), 2)
    price_52w_low = round(hist["Low"].min(), 2)
    pct_from_high = round((current_price - price_52w_high) / price_52w_high * 100, 2)

    # Fundamental data
    info = stock.info
    pe_ratio = info.get("trailingPE")
    forward_pe = info.get("forwardPE")
    pb_ratio = info.get("priceToBook")
    debt_to_equity = info.get("debtToEquity")
    revenue_growth = info.get("revenueGrowth")
    earnings_growth = info.get("earningsGrowth")
    profit_margin = info.get("profitMargins")
    market_cap = info.get("marketCap")
    company_name = info.get("longName", ticker)
    sector = info.get("sector", "Unknown")

    # Quarterly financials (last 4 quarters)
    try:
        income_stmt = stock.quarterly_income_stmt
        quarterly_revenue = (
            income_stmt.loc["Total Revenue"].dropna().head(4).to_dict()
            if "Total Revenue" in income_stmt.index
            else {}
        )
        quarterly_revenue = {str(k.date()): round(v / 1e9, 2) for k, v in quarterly_revenue.items()}
    except Exception:
        quarterly_revenue = {}

    # Next earnings date
    next_earnings_date = None
    try:
        cal = stock.calendar
        if isinstance(cal, dict):
            dates = cal.get("Earnings Date", [])
            if dates:
                d = dates[0]
                next_earnings_date = d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else str(d)[:10]
    except Exception:
        pass

    # Oversold score (0-100, higher = more oversold)
    oversold_score = _calculate_oversold_score(
        rsi=rsi,
        bb_percent=bb_percent,
        pct_from_high=pct_from_high,
        pe_ratio=pe_ratio,
        forward_pe=forward_pe,
        debt_to_equity=debt_to_equity,
        revenue_growth=revenue_growth,
        macd_line=macd_line,
        signal_line=signal_line,
    )

    pct_from_low = round((current_price - price_52w_low) / price_52w_low * 100, 2) if price_52w_low else 0

    signal = _get_signal(oversold_score, rsi)
    absolute_steal = _check_absolute_steal(
        rsi=rsi,
        oversold_score=oversold_score,
        pe_ratio=pe_ratio,
        revenue_growth=revenue_growth,
        debt_to_equity=debt_to_equity,
    )
    overbought = _check_overbought(
        rsi=rsi,
        bb_percent=bb_percent,
        pct_from_low=pct_from_low,
        pe_ratio=pe_ratio,
    )

    result = {
        "ticker": ticker.upper(),
        "company_name": company_name,
        "sector": sector,
        "current_price": current_price,
        "price_52w_high": price_52w_high,
        "price_52w_low": price_52w_low,
        "pct_from_52w_high": pct_from_high,
        "market_cap": market_cap,
        "technicals": {
            "rsi": round(rsi, 2),
            "macd": round(macd_line, 4),
            "macd_signal": round(signal_line, 4),
            "bb_percent": round(bb_percent, 4),
        },
        "fundamentals": {
            "pe_ratio": pe_ratio,
            "forward_pe": forward_pe,
            "pb_ratio": pb_ratio,
            "debt_to_equity": debt_to_equity,
            "revenue_growth": revenue_growth,
            "earnings_growth": earnings_growth,
            "profit_margin": profit_margin,
        },
        "quarterly_revenue_bn": quarterly_revenue,
        "oversold_score": oversold_score,
        "signal": signal,
        "next_earnings_date": next_earnings_date,
        "is_absolute_steal": absolute_steal["is_absolute_steal"],
        "steal_conditions": absolute_steal["conditions"],
        "is_overbought": overbought["is_overbought"],
        "overbought_conditions": overbought["conditions"],
    }
    _cache.set(ticker.upper(), result)
    return result


def _calculate_oversold_score(
    rsi, bb_percent, pct_from_high, pe_ratio, forward_pe,
    debt_to_equity, revenue_growth, macd_line, signal_line
) -> int:
    score = 0

    # RSI (max 40 pts) — below 30 is oversold
    if rsi < 30:
        score += 40
    elif rsi < 40:
        score += 25
    elif rsi < 50:
        score += 10

    # Bollinger Band position (max 20 pts) — near lower band = oversold
    if bb_percent < 0.1:
        score += 20
    elif bb_percent < 0.2:
        score += 10

    # Distance from 52-week high (max 20 pts)
    if pct_from_high < -40:
        score += 20
    elif pct_from_high < -25:
        score += 12
    elif pct_from_high < -15:
        score += 5

    # Fundamentals bonus — strong fundamentals = good oversold buy
    if revenue_growth and revenue_growth > 0.05:
        score += 10  # Still growing
    if pe_ratio and pe_ratio < 15:
        score += 10  # Cheap trailing valuation
    elif forward_pe and forward_pe < 15:
        score += 7   # Cheap on forward earnings (partial credit)

    # MACD bullish crossover bonus (+5 pts) — momentum turning positive
    if macd_line is not None and signal_line is not None and macd_line > signal_line:
        score += 5

    return min(score, 100)


def _check_absolute_steal(rsi, oversold_score, pe_ratio, revenue_growth, debt_to_equity) -> dict:
    # Each condition must be independently met — a quality company temporarily beaten down
    conditions = {
        "rsi_oversold": bool(rsi < 30),                                         # Technically oversold
        "strong_signal": bool(oversold_score >= 70),                            # Overall score confirms it
        "cheap_valuation": bool(pe_ratio is not None and pe_ratio < 15),        # Fundamentally cheap
        "growing_revenue": bool(revenue_growth is not None and revenue_growth > 0),  # Business still growing
        "low_leverage": bool(debt_to_equity is None or debt_to_equity < 200),   # Not overleveraged (D/E < 2x)
    }
    return {
        "is_absolute_steal": bool(all(conditions.values())),
        "conditions": conditions,
    }


def _check_overbought(rsi, bb_percent, pct_from_low, pe_ratio) -> dict:
    conditions = {
        "rsi_high": bool(rsi > 70),                          # Technically stretched
        "near_upper_band": bool(bb_percent > 0.9),           # Near upper Bollinger Band
        "far_from_low": bool(pct_from_low > 25),             # >25% above 52w low
        "high_valuation": bool(pe_ratio is not None and pe_ratio > 35),  # Expensive
    }
    return {
        "is_overbought": bool(all(conditions.values())),
        "conditions": conditions,
    }


def _get_signal(oversold_score: int, rsi: float) -> str:
    if oversold_score >= 70:
        return "Strong Buy"
    elif oversold_score >= 50:
        return "Buy"
    elif oversold_score >= 30:
        return "Watch"
    else:
        return "Neutral"
