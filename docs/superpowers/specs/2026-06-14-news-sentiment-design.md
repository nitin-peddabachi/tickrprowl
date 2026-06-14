# News + Sentiment Layer — Design Spec

**Date:** 2026-06-14  
**Status:** Approved  
**Scope:** Add FinBERT-powered news sentiment to StockCard (inline overview) and Scanner (sentiment column)

---

## Problem

Tickrprowl surfaces strong technical and fundamental signals but has no awareness of news context. A stock can have an oversold score of 74 (Strong Buy) while simultaneously sitting under a material negative catalyst — a guidance cut, regulatory action, or earnings miss — that makes the entry timing wrong. There is no way to catch this without leaving the app.

---

## Goals

- Surface recent news headlines and a FinBERT sentiment score inline on every stock analysis view
- Make sentiment a visible scanner column so discovery workflows can filter for fear (bearish sentiment + high oversold score = maximum opportunity)
- Cover three use cases: explain price action, spot early opportunities, confirm before buying

---

## Non-Goals

- Reddit / social sentiment (excluded — noise outweighs signal for a personal tool)
- Real-time news streaming (30-min cache is sufficient)
- Full article body fetching or summarization
- A dedicated News page

---

## Architecture

### Data Sources (free, no API key)

| Source | Method | Articles per ticker |
|--------|--------|-------------------|
| yfinance `ticker.news` | Already fetched in `stock_analyzer.py` | 5–10 |
| Google News RSS | `https://news.google.com/rss/search?q={ticker}+stock&hl=en-US&gl=US&ceid=US:en` | 10–20 |

Articles are deduplicated by URL after merging both sources.

### Sentiment Model

**FinBERT** (`ProsusAI/finbert` via HuggingFace `transformers`). Fine-tuned on financial text (10-Ks, earnings calls, financial news). Accuracy ~85–90% on financial headlines vs. ~65–70% for general-purpose VADER.

- Loads once at backend startup, stays in memory
- ~400MB model download on first run
- ~0.5s inference per headline (acceptable for on-demand fetch)
- Headlines below 60% confidence are labeled Neutral regardless of positive/negative score

### Sentiment Score (0–100)

Computed from the weighted average of per-article compound scores:

```
positive  → 1.0
neutral   → 0.5  
negative  → 0.0
```

Score = weighted average × 100, where weight = FinBERT confidence. Clamped to 0–100.

Labels: 67+ = Bullish, 34–66 = Neutral, <34 = Bearish.

**Minimum article threshold:** Fewer than 3 articles → suppress sentiment score, show "Limited news coverage" instead of a potentially misleading score.

---

## New Files

### `backend/app/services/news_service.py`

Responsibilities:
- Fetch yfinance news via lightweight `yf.Ticker(ticker).news` call (independent of the main analysis)
- Fetch Google News RSS per ticker
- Deduplicate by URL
- Run FinBERT on each headline
- Return structured response

```python
# Return shape
{
  "sentiment_score": 68,          # 0–100
  "label": "Bullish",             # Bullish | Neutral | Bearish
  "article_count": 14,
  "counts": {"bullish": 9, "bearish": 3, "neutral": 2},
  "sources": ["Reuters", "AP", "Bloomberg"],
  "articles": [
    {
      "headline": "...",
      "source": "Reuters",
      "url": "...",
      "published_at": "2026-06-14T10:00:00Z",
      "age_label": "2h ago",
      "sentiment": "positive",    # positive | negative | neutral
      "confidence": 0.91
    }
  ]
}
```

---

## API Changes

### New endpoint

```
GET /api/stocks/{ticker}/news
```

- Calls `news_service.fetch_news(ticker)`
- Cache TTL: 30 minutes (same `CacheService` as existing analysis)
- On Google News RSS failure: falls back to yfinance-only, logs error, does not surface error to client
- Response: news service return shape above

### Batch scanner

`GET /api/stocks/batch/scan` adds `news_sentiment` field to each ticker result:

```json
{
  "ticker": "AAPL",
  "score": 74,
  "news_sentiment": {"score": 68, "label": "Bullish", "article_count": 14}
}
```

Fetched in parallel with analysis via the existing `ThreadPoolExecutor`. Per-ticker news failures are isolated — one bad fetch does not abort the scan.

---

## Frontend Changes

### `StockCard.tsx` / `StockModal.tsx`

After the main analysis loads, fire a secondary `fetch('/api/stocks/{ticker}/news')`. While loading, show a skeleton in the sentiment cell.

**Score grid** (existing Oversold Score + Piotroski cells → add Sentiment cell between them):

```
┌─────────────────┬──────────────────┬─────────────────┐
│  Oversold Score │  News Sentiment  │  Piotroski      │
│      74         │       68         │    7/9          │
│   Strong Buy    │    Bullish       │   Healthy       │
└─────────────────┴──────────────────┴─────────────────┘
```

**Mini news section** below the score grid (always visible on Overview):
- Header: "Recent Headlines"
- Top 4 articles: `▲/▼/–` arrow + headline text + age
- Footer: article counts (9 bullish · 3 bearish · 2 neutral) + "See all 14 →" link
- "See all" expands an inline list of all articles with source, age, and sentiment badge

**Minimum coverage case:** When `article_count < 3`, replace the Sentiment score cell with "No recent news" in muted text.

### `ScannerTable.tsx`

Add a **Sentiment** column after Signal:
- Pill badge: `Bullish 68` / `Neutral 51` / `Bearish 31`
- Column is sortable (ascending/descending by sentiment score)
- "Limited" shown when article count < 3

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Google News RSS times out | Fall back to yfinance news only, log warning |
| FinBERT inference error on one headline | Skip that headline, continue with rest |
| Fewer than 3 articles total | Suppress score, show "Limited news coverage" |
| `/api/stocks/{ticker}/news` fails | Frontend shows nothing in sentiment cell (silent failure, not a blocker for the main analysis) |
| Scanner per-ticker news failure | Skip news for that ticker, `news_sentiment: null` in response |

---

## New Dependencies

| Package | Purpose | Install |
|---------|---------|---------|
| `transformers` | FinBERT model loading and inference | `pip install transformers` |
| `torch` | Required by transformers | `pip install torch` |
| `feedparser` | Google News RSS parsing | `pip install feedparser` |

Add to `backend/requirements.txt`.

---

## Testing Plan

1. **FinBERT accuracy spot-check** — run 10 known headlines through the scorer before wiring to UI. Confirm expected labels: "Apple beats earnings" → Bullish, "Revenue miss, guidance cut" → Bearish, "Analyst maintains neutral rating" → Neutral.
2. **Deduplication check** — verify AAPL and TSLA don't return duplicate articles from the two sources.
3. **Fallback behavior** — break the RSS URL, confirm StockCard loads with yfinance-only articles and no crash.
4. **Scanner concurrency** — run a 20-ticker scan, confirm ThreadPoolExecutor handles news + analysis in parallel without timeout.
5. **Minimum coverage** — use a thinly covered ticker, confirm "Limited news coverage" displays instead of a score.
