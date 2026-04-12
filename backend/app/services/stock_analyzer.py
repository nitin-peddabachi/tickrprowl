import yfinance as yf
import pandas as pd
import ta
import numpy as np
from app.services import cache as _cache


def calculate_dcf_value(stock: yf.Ticker, growth_rate: float = None, discount_rate: float = 0.10, terminal_growth: float = 0.025, projection_years: int = 5) -> float:
    try:
        cashflow = stock.cashflow
        if cashflow.empty:
            return None

        if "Free Cash Flow" in cashflow.index:
            fcf_series = cashflow.loc["Free Cash Flow"].dropna()
        else:
            if "Operating Cash Flow" in cashflow.index and "Capital Expenditures" in cashflow.index:
                cfo = cashflow.loc["Operating Cash Flow"]
                capex = cashflow.loc["Capital Expenditures"]
                fcf_series = cfo - capex
                fcf_series = fcf_series.dropna()
            else:
                return None

        if len(fcf_series) < 2:
            return None

        last_fcf = fcf_series.iloc[0]

        if growth_rate is None:
            if len(fcf_series) >= 3:
                # CAGR over available years (more stable than single-year)
                years = len(fcf_series) - 1
                oldest = fcf_series.iloc[-1]
                if oldest > 0 and last_fcf > 0:
                    growth_rate = (last_fcf / oldest) ** (1 / years) - 1
                else:
                    growth_rate = 0.05
            elif len(fcf_series) == 2:
                if fcf_series.iloc[1] != 0:
                    growth_rate = (fcf_series.iloc[0] / fcf_series.iloc[1]) - 1
                else:
                    growth_rate = 0.05
            else:
                growth_rate = 0.05
        # Clamp growth rate regardless of source — external values (e.g. revenueGrowth) can be extreme
        growth_rate = min(max(growth_rate, 0.01), 0.15)

        future_fcf = []
        for year in range(1, projection_years + 1):
            fcf = last_fcf * (1 + growth_rate) ** year
            future_fcf.append(fcf)

        pv_fcf = 0
        for year, fcf in enumerate(future_fcf, 1):
            pv_fcf += fcf / (1 + discount_rate) ** year

        terminal_fcf = future_fcf[-1] * (1 + terminal_growth)
        terminal_value = terminal_fcf / (discount_rate - terminal_growth)
        pv_terminal = terminal_value / (1 + discount_rate) ** projection_years

        total_value = pv_fcf + pv_terminal

        info = stock.info
        shares_outstanding = info.get("sharesOutstanding")
        if shares_outstanding:
            dcf_per_share = total_value / shares_outstanding
            return round(dcf_per_share, 2)

    except Exception as e:
        print(f"DCF calculation error: {e}")
        return None

    return None


def _calculate_piotroski_fscore(stock: yf.Ticker) -> dict:
    """
    9-point binary scoring system for financial health.
    Score 7-9 = strong, 4-6 = moderate, 0-3 = weak (potential value trap).
    """
    try:
        income = stock.financials
        balance = stock.balance_sheet
        cashflow = stock.cashflow

        if income.empty or balance.empty or cashflow.empty:
            return {"score": None, "components": {}, "interpretation": None}

        score = 0
        c = {}

        def val(df, key, pos=0):
            if key in df.index and len(df.columns) > pos:
                v = df.loc[key].iloc[pos]
                return float(v) if pd.notna(v) else None
            return None

        # ── Profitability ──────────────────────────────────────────────────

        net_income = val(income, "Net Income")
        total_assets = val(balance, "Total Assets")
        roa = (net_income / total_assets) if (net_income is not None and total_assets) else None
        c["roa_positive"] = bool(roa > 0) if roa is not None else None
        if c["roa_positive"]: score += 1

        cfo = val(cashflow, "Operating Cash Flow")
        c["cfo_positive"] = bool(cfo > 0) if cfo is not None else None
        if c["cfo_positive"]: score += 1

        net_income_prev = val(income, "Net Income", 1)
        total_assets_prev = val(balance, "Total Assets", 1)
        roa_prev = (net_income_prev / total_assets_prev) if (net_income_prev is not None and total_assets_prev) else None
        c["roa_increasing"] = bool(roa > roa_prev) if (roa is not None and roa_prev is not None) else None
        if c["roa_increasing"]: score += 1

        if cfo is not None and total_assets and roa is not None:
            c["accruals"] = bool((cfo / total_assets) > roa)
            if c["accruals"]: score += 1
        else:
            c["accruals"] = None

        # ── Leverage / Liquidity ───────────────────────────────────────────

        ltd = val(balance, "Long Term Debt") or 0.0
        ltd_prev = val(balance, "Long Term Debt", 1) or 0.0
        ta_prev = val(balance, "Total Assets", 1)
        if total_assets and ta_prev:
            c["leverage_decreasing"] = bool((ltd / total_assets) < (ltd_prev / ta_prev))
            if c["leverage_decreasing"]: score += 1
        else:
            c["leverage_decreasing"] = None

        curr_assets = val(balance, "Current Assets")
        curr_liab = val(balance, "Current Liabilities")
        curr_assets_prev = val(balance, "Current Assets", 1)
        curr_liab_prev = val(balance, "Current Liabilities", 1)
        if curr_assets and curr_liab and curr_assets_prev and curr_liab_prev:
            c["liquidity_increasing"] = bool(
                (curr_assets / curr_liab) > (curr_assets_prev / curr_liab_prev)
            )
            if c["liquidity_increasing"]: score += 1
        else:
            c["liquidity_increasing"] = None

        shares = val(balance, "Ordinary Shares Number")
        shares_prev = val(balance, "Ordinary Shares Number", 1)
        if shares and shares_prev:
            c["no_dilution"] = bool(shares <= shares_prev * 1.02)
            if c["no_dilution"]: score += 1
        else:
            c["no_dilution"] = None

        # ── Operating Efficiency ───────────────────────────────────────────

        gross_profit = val(income, "Gross Profit")
        revenue = val(income, "Total Revenue")
        gross_profit_prev = val(income, "Gross Profit", 1)
        revenue_prev = val(income, "Total Revenue", 1)
        if gross_profit and revenue and gross_profit_prev and revenue_prev:
            c["gross_margin_increasing"] = bool(
                (gross_profit / revenue) > (gross_profit_prev / revenue_prev)
            )
            if c["gross_margin_increasing"]: score += 1
        else:
            c["gross_margin_increasing"] = None

        if revenue and total_assets and revenue_prev and ta_prev:
            c["asset_turnover_increasing"] = bool(
                (revenue / total_assets) > (revenue_prev / ta_prev)
            )
            if c["asset_turnover_increasing"]: score += 1
        else:
            c["asset_turnover_increasing"] = None

        interpretation = "Strong" if score >= 7 else "Moderate" if score >= 4 else "Weak"
        return {"score": score, "components": c, "interpretation": interpretation}

    except Exception as e:
        print(f"Piotroski F-Score error: {e}")
        return {"score": None, "components": {}, "interpretation": None}


def _calculate_fcf_yield(stock: yf.Ticker, market_cap) -> float:
    """FCF / Market Cap as a percentage. >5% = good, >8% = strong."""
    try:
        if not market_cap or market_cap <= 0:
            return None
        cashflow = stock.cashflow
        if "Free Cash Flow" in cashflow.index:
            fcf = float(cashflow.loc["Free Cash Flow"].iloc[0])
        elif "Operating Cash Flow" in cashflow.index and "Capital Expenditures" in cashflow.index:
            fcf = float(cashflow.loc["Operating Cash Flow"].iloc[0]) + float(cashflow.loc["Capital Expenditures"].iloc[0])
        else:
            return None
        if pd.isna(fcf):
            return None
        return round(fcf / market_cap * 100, 2)
    except Exception as e:
        print(f"FCF yield error: {e}")
        return None


def get_price_history(ticker: str, period: str = "6mo") -> list:
    valid_periods = {"1mo", "3mo", "6mo", "1y", "2y"}
    if period not in valid_periods:
        period = "6mo"

    fetch_period = period if period not in {"1mo"} else "3mo"

    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period=fetch_period)
    except Exception as e:
        print(f"Failed to fetch price history for {ticker}: {e}")
        return []

    if hist.empty:
        return []

    try:
        close = hist["Close"]

        rsi_series = ta.momentum.RSIIndicator(close, window=14).rsi()

        bb = ta.volatility.BollingerBands(close, window=20)
        bb_upper = bb.bollinger_hband()
        bb_lower = bb.bollinger_lband()
        bb_mid = bb.bollinger_mavg()

        stoch = ta.momentum.StochasticOscillator(hist["High"], hist["Low"], close, window=14, smooth_window=3)
        stoch_k = stoch.stoch()
        stoch_d = stoch.stoch_signal()
    except Exception as e:
        print(f"Failed to compute indicators for history {ticker}: {e}")
        return []

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
            "stoch_k": round(float(stoch_k[date]), 2) if not pd.isna(stoch_k[date]) else None,
            "stoch_d": round(float(stoch_d[date]), 2) if not pd.isna(stoch_d[date]) else None,
        })

    return result


def get_stock_analysis(ticker: str) -> dict:
    cached = _cache.get(ticker.upper())
    if cached:
        return cached

    try:
        stock = yf.Ticker(ticker)

        # Fetch 1 year to support SMA 200 (needs ~200 trading days)
        hist = stock.history(period="1y")
    except Exception as e:
        return {"error": f"Failed to fetch data for {ticker}: {e}"}

    if hist.empty:
        return {"error": f"No data found for ticker {ticker}"}

    close = hist["Close"]

    # Technical indicators
    try:
        rsi = ta.momentum.RSIIndicator(close).rsi().iloc[-1]
        macd = ta.trend.MACD(close)
        macd_line = macd.macd().iloc[-1]
        signal_line = macd.macd_signal().iloc[-1]
        bb = ta.volatility.BollingerBands(close)
        bb_percent = bb.bollinger_pband().iloc[-1]

        stoch = ta.momentum.StochasticOscillator(hist["High"], hist["Low"], close, window=14, smooth_window=3)
        stoch_k = stoch.stoch().iloc[-1]
        stoch_d = stoch.stoch_signal().iloc[-1]

        # Moving averages
        sma_50_series = ta.trend.SMAIndicator(close, window=50).sma_indicator()
        sma_200_series = ta.trend.SMAIndicator(close, window=200).sma_indicator()
        sma_50 = float(sma_50_series.iloc[-1]) if not pd.isna(sma_50_series.iloc[-1]) else None
        sma_200 = float(sma_200_series.iloc[-1]) if not pd.isna(sma_200_series.iloc[-1]) else None
        golden_cross = bool(sma_50 > sma_200) if (sma_50 is not None and sma_200 is not None) else None
    except Exception as e:
        return {"error": f"Failed to compute technical indicators for {ticker}: {e}"}

    current_price = round(close.iloc[-1], 2)

    # Fundamental data
    try:
        info = stock.info
    except Exception as e:
        print(f"Failed to fetch info for {ticker}: {e}")
        info = {}

    # True 52-week high/low from Yahoo Finance (not derived from our fetch window)
    price_52w_high = info.get("fiftyTwoWeekHigh") or round(hist["High"].max(), 2)
    price_52w_low = info.get("fiftyTwoWeekLow") or round(hist["Low"].min(), 2)
    pct_from_high = round((current_price - price_52w_high) / price_52w_high * 100, 2) if price_52w_high else 0

    price_change_pct = info.get("regularMarketChangePercent")
    price_change = info.get("regularMarketChange")

    pe_ratio = info.get("trailingPE")
    forward_pe = info.get("forwardPE")
    pb_ratio = info.get("priceToBook")
    ps_ratio = info.get("priceToSalesTrailingTwelveMonths")
    debt_to_equity = info.get("debtToEquity")
    revenue_growth = info.get("revenueGrowth")
    earnings_growth = info.get("earningsGrowth")
    profit_margin = info.get("profitMargins")
    market_cap = info.get("marketCap")
    ev_to_ebitda = info.get("enterpriseToEbitda")
    roe = info.get("returnOnEquity")
    roa = info.get("returnOnAssets")
    dividend_yield = info.get("dividendYield")
    beta = info.get("beta")
    company_name = info.get("longName", ticker)
    sector = info.get("sector", "Unknown")

    # Analyst consensus
    analyst_rating = info.get("recommendationMean")       # 1.0 (Strong Buy) → 5.0 (Strong Sell)
    analyst_recommendation = info.get("recommendationKey") # e.g. "buy", "hold", "sell"
    analyst_count = info.get("numberOfAnalystOpinions")
    target_price_mean = info.get("targetMeanPrice")
    target_price_high = info.get("targetHighPrice")
    target_price_low = info.get("targetLowPrice")

    # DCF Valuation
    dcf_value = calculate_dcf_value(stock, growth_rate=revenue_growth)

    # FCF Yield
    fcf_yield = _calculate_fcf_yield(stock, market_cap)

    # Piotroski F-Score
    piotroski = _calculate_piotroski_fscore(stock)

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
        current_price=current_price,
        dcf_value=dcf_value,
        stoch_k=stoch_k,
        ev_to_ebitda=ev_to_ebitda,
        fcf_yield=fcf_yield,
        piotroski_score=piotroski["score"],
        sma_50=sma_50,
        sma_200=sma_200,
    )

    pct_from_low = round((current_price - price_52w_low) / price_52w_low * 100, 2) if price_52w_low else 0

    signal_result = _get_signal(
        oversold_score=oversold_score,
        rsi=rsi,
        bb_percent=bb_percent,
        stoch_k=stoch_k,
        pct_from_high=pct_from_high,
        pe_ratio=pe_ratio,
        forward_pe=forward_pe,
        revenue_growth=revenue_growth,
        dcf_value=dcf_value,
        current_price=current_price,
        macd_line=macd_line,
        signal_line=signal_line,
        piotroski_score=piotroski["score"],
        fcf_yield=fcf_yield,
        ev_to_ebitda=ev_to_ebitda,
        golden_cross=golden_cross,
        sma_50=sma_50,
        sma_200=sma_200,
        analyst_rating=analyst_rating,
        analyst_count=analyst_count,
        target_price_mean=target_price_mean,
    )
    signal = signal_result["signal"]
    signal_reasons = signal_result["signal_reasons"]

    absolute_steal = _check_absolute_steal(
        rsi=rsi,
        oversold_score=oversold_score,
        pe_ratio=pe_ratio,
        revenue_growth=revenue_growth,
        debt_to_equity=debt_to_equity,
        current_price=current_price,
        dcf_value=dcf_value,
        piotroski_score=piotroski["score"],
    )
    overbought = _check_overbought(
        rsi=rsi,
        bb_percent=bb_percent,
        pct_from_low=pct_from_low,
        pe_ratio=pe_ratio,
        stoch_k=stoch_k,
    )

    result = {
        "ticker": ticker.upper(),
        "company_name": company_name,
        "sector": sector,
        "current_price": current_price,
        "price_change_pct": round(price_change_pct, 2) if price_change_pct is not None else None,
        "price_change": round(price_change, 2) if price_change is not None else None,
        "price_52w_high": price_52w_high,
        "price_52w_low": price_52w_low,
        "pct_from_52w_high": pct_from_high,
        "market_cap": market_cap,
        "technicals": {
            "rsi": round(rsi, 2),
            "macd": round(macd_line, 4),
            "macd_signal": round(signal_line, 4),
            "bb_percent": round(bb_percent, 4),
            "stoch_k": round(stoch_k, 2),
            "stoch_d": round(stoch_d, 2),
            "sma_50": round(sma_50, 2) if sma_50 is not None else None,
            "sma_200": round(sma_200, 2) if sma_200 is not None else None,
            "golden_cross": golden_cross,
        },
        "fundamentals": {
            "pe_ratio": pe_ratio,
            "forward_pe": forward_pe,
            "pb_ratio": pb_ratio,
            "ps_ratio": ps_ratio,
            "debt_to_equity": debt_to_equity,
            "revenue_growth": revenue_growth,
            "earnings_growth": earnings_growth,
            "profit_margin": profit_margin,
            "roe": roe,
            "roa": roa,
            "dividend_yield": dividend_yield,
            "beta": beta,
            "dcf_value": dcf_value,
            "ev_to_ebitda": ev_to_ebitda,
            "fcf_yield": fcf_yield,
        },
        "analyst": {
            "rating": analyst_rating,
            "recommendation": analyst_recommendation,
            "count": analyst_count,
            "target_mean": target_price_mean,
            "target_high": target_price_high,
            "target_low": target_price_low,
        },
        "piotroski": piotroski,
        "quarterly_revenue_bn": quarterly_revenue,
        "oversold_score": oversold_score,
        "signal": signal,
        "signal_reasons": signal_reasons,
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
    debt_to_equity, revenue_growth, macd_line, signal_line,
    current_price, dcf_value, stoch_k, ev_to_ebitda, fcf_yield,
    piotroski_score, sma_50=None, sma_200=None,
) -> int:
    score = 0

    # RSI (max 40 pts) — below 30 is oversold
    if rsi < 30:
        score += 40
    elif rsi < 40:
        score += 25
    elif rsi < 50:
        score += 10

    # Stochastic %K (max 15 pts) — below 20 is oversold
    if stoch_k < 20:
        score += 15
    elif stoch_k < 30:
        score += 8

    # Dual confirmation bonus: both RSI and Stochastic oversold (+10 pts)
    if rsi < 30 and stoch_k < 20:
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

    # SMA signals — price below moving average = bearish pressure / more oversold
    if sma_50 is not None and current_price < sma_50:
        score += 5
    if sma_200 is not None and current_price < sma_200:
        score += 5

    # Fundamentals bonus — strong fundamentals = good oversold buy
    if revenue_growth and revenue_growth > 0.05:
        score += 10
    if pe_ratio and pe_ratio < 15:
        score += 10
    elif forward_pe and forward_pe < 15:
        score += 7

    # EV/EBITDA (max 10 pts)
    if ev_to_ebitda is not None and ev_to_ebitda > 0:
        if ev_to_ebitda < 8:
            score += 10
        elif ev_to_ebitda < 12:
            score += 5

    # FCF Yield (max 10 pts)
    if fcf_yield is not None:
        if fcf_yield > 8:
            score += 10
        elif fcf_yield > 5:
            score += 5

    # DCF undervaluation bonus (max 20 pts)
    if dcf_value and current_price < dcf_value:
        undervaluation_pct = (dcf_value - current_price) / dcf_value
        if undervaluation_pct > 0.5:
            score += 20
        elif undervaluation_pct > 0.3:
            score += 15
        elif undervaluation_pct > 0.2:
            score += 10
        elif undervaluation_pct > 0.1:
            score += 5

    # MACD bullish crossover bonus (+5 pts)
    if macd_line is not None and signal_line is not None and macd_line > signal_line:
        score += 5

    # Piotroski F-Score adjustment
    if piotroski_score is not None:
        if piotroski_score >= 7:
            score += 10
        elif piotroski_score <= 2:
            score -= 15

    return min(max(score, 0), 100)


def _check_absolute_steal(rsi, oversold_score, pe_ratio, revenue_growth, debt_to_equity, current_price, dcf_value, piotroski_score) -> dict:
    conditions = {
        "rsi_oversold": bool(rsi < 30),
        "strong_signal": bool(oversold_score >= 70),
        "cheap_valuation": bool(pe_ratio is not None and pe_ratio < 15),
        "growing_revenue": bool(revenue_growth is not None and revenue_growth > 0),
        "low_leverage": bool(debt_to_equity is None or debt_to_equity < 200),
        "dcf_undervalued": bool(dcf_value is not None and current_price < dcf_value * 0.8),
        "financially_healthy": bool(piotroski_score is not None and piotroski_score >= 7),
    }
    return {
        "is_absolute_steal": bool(all(conditions.values())),
        "conditions": conditions,
    }


def _check_overbought(rsi, bb_percent, pct_from_low, pe_ratio, stoch_k) -> dict:
    conditions = {
        "rsi_high": bool(rsi > 70),
        "stoch_overbought": bool(stoch_k > 80),
        "near_upper_band": bool(bb_percent > 0.9),
        "far_from_low": bool(pct_from_low > 25),
        "high_valuation": bool(pe_ratio is not None and pe_ratio > 35),
    }
    return {
        "is_overbought": bool(all(conditions.values())),
        "conditions": conditions,
    }


def _get_signal(
    oversold_score: int, rsi: float, bb_percent: float, stoch_k: float,
    pct_from_high: float, pe_ratio, forward_pe, revenue_growth,
    dcf_value, current_price, macd_line, signal_line,
    piotroski_score, fcf_yield, ev_to_ebitda,
    golden_cross=None, sma_50=None, sma_200=None,
    analyst_rating=None, analyst_count=None, target_price_mean=None,
) -> dict:
    reasons = []

    overbought_flags = [
        rsi > 70,
        stoch_k > 80,
        bb_percent > 0.9,
        pe_ratio is not None and pe_ratio > 35,
        pct_from_high is not None and pct_from_high > -5,
    ]
    overbought_count = sum(overbought_flags)
    all_overbought = all(overbought_flags)

    if all_overbought:
        signal = "Strong Sell"
        reasons.append(f"RSI at {rsi:.1f} — deeply overbought territory")
        reasons.append(f"Stochastic %K at {stoch_k:.1f} — momentum stretched to extremes")
        if bb_percent > 0.9:
            reasons.append("Price pressing the upper Bollinger Band")
        if pe_ratio and pe_ratio > 35:
            reasons.append(f"P/E of {pe_ratio:.1f} — historically expensive valuation")
        if macd_line is not None and signal_line is not None and macd_line < signal_line:
            reasons.append("MACD bearish crossover — momentum weakening")
        if analyst_rating is not None and analyst_rating >= 3.5 and analyst_count:
            reasons.append(f"Analyst consensus bearish ({analyst_count} analysts)")

    elif overbought_count >= 3 and oversold_score < 25:
        signal = "Sell"
        if rsi > 65:
            reasons.append(f"RSI at {rsi:.1f} — elevated, approaching overbought")
        if stoch_k > 70:
            reasons.append(f"Stochastic %K at {stoch_k:.1f} — momentum stretched")
        if bb_percent > 0.8:
            reasons.append("Price near upper Bollinger Band — limited upside room")
        if pe_ratio and pe_ratio > 25:
            reasons.append(f"P/E of {pe_ratio:.1f} — premium valuation")
        if pct_from_high is not None and pct_from_high > -5:
            reasons.append("Trading near 52-week highs — limited margin of safety")
        if target_price_mean and current_price > target_price_mean:
            upside = (target_price_mean - current_price) / current_price * 100
            reasons.append(f"Trading {abs(upside):.0f}% above analyst mean target (${target_price_mean:.2f})")

    elif oversold_score >= 70:
        signal = "Strong Buy"
        if rsi < 30:
            reasons.append(f"RSI at {rsi:.1f} — deeply oversold")
        if stoch_k < 20:
            reasons.append(f"Stochastic %K at {stoch_k:.1f} — oversold momentum confirmed")
        if bb_percent < 0.1:
            reasons.append("Price at lower Bollinger Band — technical floor")
        if pct_from_high is not None and pct_from_high < -25:
            reasons.append(f"{pct_from_high:.1f}% below 52-week high — significant pullback")
        if sma_50 is not None and current_price < sma_50:
            reasons.append(f"Price below 50-day SMA (${sma_50:.2f}) — potential mean reversion")
        if sma_200 is not None and current_price < sma_200:
            reasons.append(f"Price below 200-day SMA (${sma_200:.2f}) — deep value territory")
        if dcf_value and current_price < dcf_value:
            upside = (dcf_value - current_price) / dcf_value * 100
            reasons.append(f"Trading {upside:.0f}% below DCF fair value (${dcf_value:.2f})")
        if pe_ratio and pe_ratio < 15:
            reasons.append(f"Low P/E of {pe_ratio:.1f} — cheap on earnings")
        elif forward_pe and forward_pe < 15:
            reasons.append(f"Forward P/E of {forward_pe:.1f} — attractive on future earnings")
        if revenue_growth and revenue_growth > 0.05:
            reasons.append(f"Revenue growing at {revenue_growth * 100:.1f}% — fundamentals intact")
        if piotroski_score is not None and piotroski_score >= 7:
            reasons.append(f"Piotroski F-Score {piotroski_score}/9 — financially healthy company")
        if fcf_yield and fcf_yield > 5:
            reasons.append(f"FCF Yield of {fcf_yield:.1f}% — strong free cash generation")
        if macd_line is not None and signal_line is not None and macd_line > signal_line:
            reasons.append("MACD bullish crossover — momentum turning positive")
        if analyst_rating is not None and analyst_rating <= 2.0 and analyst_count:
            reasons.append(f"{analyst_count} analysts rate this Buy or better (consensus: {analyst_rating:.1f}/5)")
        if target_price_mean and current_price < target_price_mean:
            upside = (target_price_mean - current_price) / current_price * 100
            reasons.append(f"Analyst mean target ${target_price_mean:.2f} — {upside:.0f}% upside")

    elif oversold_score >= 50:
        signal = "Buy"
        if rsi < 40:
            reasons.append(f"RSI at {rsi:.1f} — moderately oversold")
        elif rsi < 50:
            reasons.append(f"RSI at {rsi:.1f} — below midpoint, mild oversold")
        if bb_percent < 0.2:
            reasons.append("Price near lower Bollinger Band")
        if pct_from_high is not None and pct_from_high < -15:
            reasons.append(f"{pct_from_high:.1f}% below 52-week high")
        if sma_50 is not None and current_price < sma_50:
            reasons.append(f"Price below 50-day SMA (${sma_50:.2f})")
        if dcf_value and current_price < dcf_value:
            upside = (dcf_value - current_price) / dcf_value * 100
            reasons.append(f"Trading {upside:.0f}% below DCF fair value")
        if pe_ratio and pe_ratio < 15:
            reasons.append(f"P/E of {pe_ratio:.1f} — cheap valuation")
        if revenue_growth and revenue_growth > 0:
            reasons.append(f"Revenue growing at {revenue_growth * 100:.1f}%")
        if ev_to_ebitda is not None and 0 < ev_to_ebitda < 12:
            reasons.append(f"EV/EBITDA of {ev_to_ebitda:.1f} — reasonable enterprise value")
        if analyst_rating is not None and analyst_rating <= 2.5 and analyst_count:
            reasons.append(f"Analyst consensus leans bullish ({analyst_count} analysts, {analyst_rating:.1f}/5)")

    elif oversold_score >= 30:
        signal = "Watch"
        if rsi < 50:
            reasons.append(f"RSI at {rsi:.1f} — mild oversold signal, not yet compelling")
        if pct_from_high is not None and pct_from_high < -10:
            reasons.append(f"{pct_from_high:.1f}% below 52-week high — pullback in progress")
        if bb_percent < 0.3:
            reasons.append("Price in lower third of Bollinger Bands")
        if revenue_growth and revenue_growth > 0:
            reasons.append(f"Revenue growing at {revenue_growth * 100:.1f}% — fundamentals supportive")
        if golden_cross is False and sma_50 is not None and sma_200 is not None:
            reasons.append(f"Death cross in effect (SMA 50 ${sma_50:.2f} < SMA 200 ${sma_200:.2f}) — wait for trend reversal")
        reasons.append("Insufficient technical confluence for a Buy signal yet")

    else:
        signal = "Neutral"
        if rsi >= 50:
            reasons.append(f"RSI at {rsi:.1f} — no oversold signal")
        if bb_percent >= 0.4:
            reasons.append("Price mid-range within Bollinger Bands")
        if pct_from_high is not None and pct_from_high > -10:
            reasons.append("Trading near 52-week highs — limited margin of safety")
        if golden_cross is True and sma_50 is not None and sma_200 is not None:
            reasons.append(f"Golden cross active (SMA 50 ${sma_50:.2f} > SMA 200 ${sma_200:.2f}) — uptrend intact")
        reasons.append("No compelling entry or exit signal at current levels")

    return {"signal": signal, "signal_reasons": reasons}
