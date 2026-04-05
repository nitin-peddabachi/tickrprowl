import os
from sqlalchemy import create_engine, Column, String, Float, DateTime, Boolean, Integer, Text, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./stockr.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class WatchlistItem(Base):
    __tablename__ = "watchlist"

    ticker = Column(String, primary_key=True, index=True)
    company_name = Column(String, nullable=True)
    sector = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    target_price = Column(Float, nullable=True)
    added_at = Column(DateTime, default=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String, index=True, nullable=False)
    alert_type = Column(String, nullable=False)  # rsi_below | price_below | score_above
    threshold = Column(Float, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_triggered = Column(DateTime, nullable=True)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String, nullable=False)
    alert_type = Column(String, nullable=False)
    threshold = Column(Float, nullable=False)
    current_value = Column(Float, nullable=False)
    message = Column(String, nullable=False)
    is_read = Column(Boolean, default=False)
    triggered_at = Column(DateTime, default=datetime.utcnow)


class PortfolioPosition(Base):
    __tablename__ = "portfolio"

    id = Column(Integer, primary_key=True, autoincrement=True)
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


def init_db():
    Base.metadata.create_all(bind=engine)
    # Migrate: add broker column to existing installs
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE portfolio ADD COLUMN broker VARCHAR DEFAULT 'fidelity'"))
            conn.commit()
        except Exception:
            pass  # Column already exists


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
