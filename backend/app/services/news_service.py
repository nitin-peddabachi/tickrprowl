import logging
import time
from datetime import datetime, timezone

import feedparser
import yfinance as yf
from transformers import pipeline

logger = logging.getLogger(__name__)

_finbert = None


def _get_finbert():
    global _finbert
    if _finbert is None:
        _finbert = pipeline(
            "text-classification",
            model="ProsusAI/finbert",
            top_k=None,
        )
    return _finbert


def _age_label(published_at: str) -> str:
    try:
        dt = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
        diff = datetime.now(timezone.utc) - dt
        s = diff.total_seconds()
        if s < 3600:
            return f"{int(s / 60)}m ago"
        if s < 86400:
            return f"{int(s / 3600)}h ago"
        return f"{int(s / 86400)}d ago"
    except Exception:
        return ""


def _fetch_yf_news(ticker: str) -> list[dict]:
    try:
        raw = yf.Ticker(ticker).news or []
        articles = []
        for item in raw:
            content = item.get("content", {})
            headline = content.get("title") or item.get("title", "")
            url = content.get("canonicalUrl", {}).get("url") or item.get("link", "")
            provider = content.get("provider", {}).get("displayName", "") or item.get("publisher", "")
            pub_date = content.get("pubDate") or ""
            if pub_date:
                try:
                    ts = datetime.strptime(pub_date, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                    pub_iso = ts.isoformat()
                except Exception:
                    pub_iso = pub_date
            else:
                pub_iso = ""
            if headline and url:
                articles.append({
                    "headline": headline,
                    "url": url,
                    "source": provider,
                    "published_at": pub_iso,
                })
        return articles
    except Exception as e:
        logger.warning("yfinance news fetch failed for %s: %s", ticker, e)
        return []


def _fetch_rss_news(ticker: str) -> list[dict]:
    try:
        url = (
            f"https://news.google.com/rss/search"
            f"?q={ticker}+stock&hl=en-US&gl=US&ceid=US:en"
        )
        feed = feedparser.parse(url, request_headers={"User-Agent": "Mozilla/5.0"})
        articles = []
        for entry in feed.entries[:20]:
            headline = entry.get("title", "")
            link = entry.get("link", "")
            source = ""
            if hasattr(entry, "source") and isinstance(entry.source, dict):
                source = entry.source.get("title", "")
            pub_parsed = entry.get("published_parsed")
            if pub_parsed:
                dt = datetime(*pub_parsed[:6], tzinfo=timezone.utc)
                pub_iso = dt.isoformat()
            else:
                pub_iso = ""
            if headline and link:
                articles.append({
                    "headline": headline,
                    "url": link,
                    "source": source,
                    "published_at": pub_iso,
                })
        return articles
    except Exception as e:
        logger.warning("Google News RSS fetch failed for %s: %s", ticker, e)
        return []


def _deduplicate(articles: list[dict]) -> list[dict]:
    seen: set[str] = set()
    result = []
    for a in articles:
        key = a["url"].split("?")[0].rstrip("/")
        if key and key not in seen:
            seen.add(key)
            result.append(a)
    return result


def _score_articles(articles: list[dict]) -> list[dict]:
    finbert = _get_finbert()
    scored = []
    for article in articles:
        headline = article["headline"]
        if not headline:
            continue
        try:
            raw_results = finbert(headline[:512])
            # With top_k=None and a single string input, pipeline returns [[{...}, ...]]
            results = raw_results[0] if raw_results and isinstance(raw_results[0], list) else raw_results
            # results is a list of dicts: [{"label": "positive", "score": 0.91}, ...]
            best = max(results, key=lambda x: x["score"])
            label = best["label"].lower()   # "positive" | "negative" | "neutral"
            confidence = best["score"]
            # Apply confidence threshold
            if confidence < 0.60:
                label = "neutral"
            scored.append({
                **article,
                "sentiment": label,
                "confidence": round(confidence, 4),
                "age_label": _age_label(article.get("published_at", "")),
            })
        except Exception as e:
            logger.warning("FinBERT inference failed for headline '%s': %s", headline[:60], e)
    return scored


def _compute_score(articles: list[dict]) -> tuple[int, str]:
    """Return (sentiment_score 0-100, label)."""
    score_map = {"positive": 1.0, "neutral": 0.5, "negative": 0.0}
    weighted_sum = sum(score_map.get(a["sentiment"], 0.5) * a["confidence"] for a in articles)
    total_weight = sum(a["confidence"] for a in articles)
    if total_weight == 0:
        return 50, "Neutral"
    raw = weighted_sum / total_weight
    score = int(round(raw * 100))
    if score >= 67:
        label = "Bullish"
    elif score >= 34:
        label = "Neutral"
    else:
        label = "Bearish"
    return score, label


def fetch_news(ticker: str) -> dict:
    """Fetch, deduplicate, score, and return structured news + sentiment for a ticker."""
    yf_articles = _fetch_yf_news(ticker)
    rss_articles = _fetch_rss_news(ticker)
    combined = _deduplicate(yf_articles + rss_articles)

    if len(combined) < 3:
        return {
            "sentiment_score": None,
            "label": None,
            "article_count": len(combined),
            "counts": {"bullish": 0, "bearish": 0, "neutral": 0},
            "sources": [],
            "articles": combined,
        }

    scored = _score_articles(combined)
    sentiment_score, label = _compute_score(scored)
    counts = {
        "bullish": sum(1 for a in scored if a["sentiment"] == "positive"),
        "bearish": sum(1 for a in scored if a["sentiment"] == "negative"),
        "neutral": sum(1 for a in scored if a["sentiment"] == "neutral"),
    }
    sources = sorted({a["source"] for a in scored if a["source"]})

    return {
        "sentiment_score": sentiment_score,
        "label": label,
        "article_count": len(scored),
        "counts": counts,
        "sources": sources,
        "articles": scored,
    }
