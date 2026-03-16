from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from app.routers import stocks
from app.routers import watchlist
from app.routers import alerts
from app.routers import portfolio
from app.models.database import init_db
from app.services.alert_checker import check_alerts

app = FastAPI(title="Stockr API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
scheduler = BackgroundScheduler()
scheduler.add_job(check_alerts, "interval", minutes=30, id="alert_check")
scheduler.start()


@app.on_event("shutdown")
def shutdown_scheduler():
    scheduler.shutdown()


@app.get("/")
def root():
    return {"message": "Stockr API is running"}
