import os
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.routers import stocks
from app.routers import watchlist
from app.routers import alerts
from app.routers import portfolio
from app.models.database import init_db
from app.services.alert_checker import check_alerts, check_watchlist_auto_alerts

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="TickrProwl API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

app.include_router(stocks.router, prefix="/api/stocks", tags=["stocks"])
app.include_router(watchlist.router, prefix="/api/watchlist", tags=["watchlist"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["alerts"])
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["portfolio"])

# Background scheduler — checks alerts every 30 minutes
# Note: score_snapshot job is disabled until the app is deployed
scheduler = BackgroundScheduler()
scheduler.add_job(check_alerts, "interval", minutes=30, id="alert_check")
scheduler.add_job(check_watchlist_auto_alerts, "interval", minutes=30, id="watchlist_auto_alerts")
scheduler.start()


@app.on_event("shutdown")
def shutdown_scheduler():
    scheduler.shutdown()


@app.get("/")
def root():
    return {"message": "TickrProwl API is running"}
