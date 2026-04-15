"""
Shared fixtures for TickrProwl backend tests.

- Uses an in-memory SQLite database so tests never touch the real DB.
- Overrides the `get_current_user` dependency to return a fixed "test_user".
- Provides a FastAPI TestClient wired to both overrides.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models.database import Base, get_db
from app.dependencies.auth import get_current_user

TEST_USER = "test_user"


@pytest.fixture(scope="function")
def db_engine():
    # StaticPool forces all connections to share one in-memory DB so that
    # create_all() and the test session see the same tables.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db_session(db_engine):
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    session = TestingSession()
    yield session
    session.close()


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    def override_get_current_user():
        return TEST_USER

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    # APScheduler is started at module import time. Each TestClient teardown
    # calls scheduler.shutdown() via the @on_event("shutdown") handler. After
    # the first call the scheduler is stopped, and subsequent calls raise
    # SchedulerNotRunningError. Suppress it so test teardown stays clean.
    import app.main as _main
    _main.scheduler.shutdown = lambda wait=True: None

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
