from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import stocks
from app.routers import watchlist
from app.models.database import init_db

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


@app.get("/")
def root():
    return {"message": "Stockr API is running"}
