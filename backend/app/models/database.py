import os
from sqlalchemy import create_engine, Column, String, Float, DateTime, Boolean, Integer, Text, UniqueConstraint, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tickrprowl.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class WatchlistItem(Base):
    __tablename__ = "watchlist"
    __table_args__ = (UniqueConstraint("ticker", "user_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, default="", index=True)
    company_name = Column(String, nullable=True)
    sector = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    target_price = Column(Float, nullable=True)
    added_at = Column(DateTime, default=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String, index=True, nullable=False)
    user_id = Column(String, nullable=False, default="", index=True)
    alert_type = Column(String, nullable=False)  # rsi_below | price_below | score_above
    threshold = Column(Float, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_triggered = Column(DateTime, nullable=True)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String, nullable=False)
    user_id = Column(String, nullable=False, default="", index=True)
    alert_type = Column(String, nullable=False)
    threshold = Column(Float, nullable=False)
    current_value = Column(Float, nullable=False)
    message = Column(String, nullable=False)
    is_read = Column(Boolean, default=False)
    triggered_at = Column(DateTime, default=datetime.utcnow)


class PortfolioPosition(Base):
    __tablename__ = "portfolio"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, default="", index=True)
    account_number = Column(String, nullable=False)
    account_name = Column(String, nullable=False)
    ticker = Column(String, nullable=False, index=True)
    company_name = Column(String, nullable=True)
    shares = Column(Float, nullable=False)
    avg_cost = Column(Float, nullable=True)
    cost_basis_total = Column(Float, nullable=True)
    last_price = Column(Float, nullable=True)
    current_value = Column(Float, nullable=True)
    total_gl_dollar = Column(Float, nullable=True)
    total_gl_pct = Column(Float, nullable=True)
    broker = Column(String, nullable=True, default="fidelity")
    imported_at = Column(DateTime, default=datetime.utcnow)


class StockCache(Base):
    __tablename__ = "stock_cache"

    ticker = Column(String, primary_key=True, index=True)
    data = Column(Text, nullable=False)       # JSON blob
    cached_at = Column(DateTime, nullable=False)


class ScoreHistory(Base):
    __tablename__ = "score_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String, nullable=False, index=True)
    score = Column(Integer, nullable=False)
    signal = Column(String, nullable=True)
    rsi = Column(Float, nullable=True)
    price = Column(Float, nullable=True)
    recorded_at = Column(DateTime, default=datetime.utcnow)


def init_db():
    with engine.connect() as conn:
        # --- Migrate watchlist: old schema had ticker as sole PK, no user_id ---
        result = conn.execute(text("PRAGMA table_info(watchlist)"))
        watchlist_cols = [row[1] for row in result]
        if len(watchlist_cols) > 0 and "user_id" not in watchlist_cols:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS watchlist_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticker VARCHAR NOT NULL,
                    user_id VARCHAR NOT NULL DEFAULT '',
                    company_name VARCHAR,
                    sector VARCHAR,
                    notes VARCHAR,
                    target_price FLOAT,
                    added_at DATETIME,
                    UNIQUE(ticker, user_id)
                )
            """))
            conn.execute(text("""
                INSERT INTO watchlist_new (ticker, user_id, company_name, sector, notes, target_price, added_at)
                SELECT ticker, '', company_name, sector, notes, target_price, added_at FROM watchlist
            """))
            conn.execute(text("DROP TABLE watchlist"))
            conn.execute(text("ALTER TABLE watchlist_new RENAME TO watchlist"))
            conn.commit()

        # --- Add user_id to alerts ---
        try:
            conn.execute(text("ALTER TABLE alerts ADD COLUMN user_id VARCHAR DEFAULT ''"))
            conn.commit()
        except Exception:
            pass

        # --- Add user_id to notifications ---
        try:
            conn.execute(text("ALTER TABLE notifications ADD COLUMN user_id VARCHAR DEFAULT ''"))
            conn.commit()
        except Exception:
            pass

        # --- Add user_id to portfolio ---
        try:
            conn.execute(text("ALTER TABLE portfolio ADD COLUMN user_id VARCHAR DEFAULT ''"))
            conn.commit()
        except Exception:
            pass

        # --- Add broker column to existing portfolio installs ---
        try:
            conn.execute(text("ALTER TABLE portfolio ADD COLUMN broker VARCHAR DEFAULT 'fidelity'"))
            conn.commit()
        except Exception:
            pass

    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
