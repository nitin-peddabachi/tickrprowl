# TickrProwl

A personal stock analysis app to identify and invest in oversold stocks by analyzing financial statements and technical indicators across multiple quarters.

## Stack

- **Frontend**: Next.js 16 + TypeScript + Tailwind CSS + Recharts — runs on `http://localhost:3000`
- **Backend**: FastAPI (Python 3.9) + yfinance + pandas + ta — runs on `http://localhost:8000`
- **Database**: SQLite (file: `backend/tickrprowl.db`) via SQLAlchemy
- **Data source**: Yahoo Finance via yfinance 1.2.0+

## Project Structure

```
tickrprowl/
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI app, CORS, scheduler registration
│   │   ├── routers/
│   │   │   ├── stocks.py         # Stock search, analysis, batch scanner, price history
│   │   │   ├── watchlist.py      # Watchlist CRUD
│   │   │   └── alerts.py         # Alert rules + notifications
│   │   ├── services/
│   │   │   ├── stock_analyzer.py # Core analysis logic (RSI, BB, fundamentals, oversold score)
│   │   │   └── alert_checker.py  # Background alert check job
│   │   └── models/
│   │       └── database.py       # SQLAlchemy models: WatchlistItem, Alert, Notification
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── page.tsx              # Search page
│   │   ├── scanner/page.tsx      # Batch scanner page
│   │   ├── watchlist/page.tsx    # Watchlist page
│   │   └── alerts/page.tsx       # Alerts page
│   └── components/
│       ├── Navbar.tsx            # Nav with unread alert badge
│       ├── SearchBar.tsx         # Search with company name autocomplete
│       ├── StockCard.tsx         # Full stock analysis card
│       ├── PriceChart.tsx        # Price + BB bands + RSI chart
│       ├── ScannerTable.tsx      # Sortable/filterable scanner results
│       ├── WatchlistCard.tsx     # Watchlist item with notes + target price
│       └── ScannerTable.tsx      # Batch scanner results table
├── start.sh                      # Start both servers + open browser
├── stop.sh                       # Stop both servers
└── CLAUDE.md
```

## Commands

```bash
# Start the app (opens browser automatically)
./start.sh

# Stop the app
./stop.sh

# Backend only
cd backend && python3 -m uvicorn app.main:app --reload

# Frontend only
cd frontend && npm run dev

# Install backend dependencies
cd backend && pip3 install -r requirements.txt

# Install frontend dependencies
cd frontend && npm install
```

## Key API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/stocks/search?q=Apple` | Search by company name or ticker |
| GET | `/api/stocks/{ticker}` | Full stock analysis |
| GET | `/api/stocks/{ticker}/history?period=6mo` | Price history + BB + RSI |
| GET | `/api/stocks/batch/scan?tickers=AAPL,MSFT` | Scan multiple tickers |
| GET | `/api/stocks/batch/preset/{name}` | Scan preset list (sp500_sample, tech, value) |
| GET | `/api/watchlist/` | Get watchlist with live analysis |
| POST | `/api/watchlist/` | Add stock to watchlist |
| DELETE | `/api/watchlist/{ticker}` | Remove from watchlist |
| GET | `/api/alerts/` | List alert rules |
| POST | `/api/alerts/` | Create alert rule |
| POST | `/api/alerts/check-now` | Trigger manual alert check |
| GET | `/api/alerts/notifications` | Get triggered notifications |

## Oversold Score (0–100)

Calculated in `stock_analyzer.py`:
- RSI < 30 → +40pts, < 40 → +25pts, < 50 → +10pts
- Bollinger Band % < 0.1 → +20pts, < 0.2 → +10pts
- % from 52w high < -40% → +20pts, < -25% → +12pts, < -15% → +5pts
- Revenue growth > 5% → +10pts bonus
- P/E < 15 → +10pts bonus

Signals: 70+ = Strong Buy, 50+ = Buy, 30+ = Watch, else Neutral

## Alert Types

- `rsi_below` — triggers when RSI ≤ threshold
- `price_below` — triggers when price ≤ threshold
- `score_above` — triggers when oversold score ≥ threshold
- 4-hour cooldown between re-triggers
- Background check runs every 30 minutes via APScheduler

## GitHub

- Repo: `github.com/nitin-peddabachi/tickrprowl`
- Branch: `main`
- Auto-deploys: not configured (runs locally only)

## Conventions

- **Specs and plans** (`docs/superpowers/`) are local-only — never commit them to git. They are gitignored.
