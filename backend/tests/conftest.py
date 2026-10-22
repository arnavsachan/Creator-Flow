import httpx
import pytest
from fastapi.testclient import TestClient

# Ensure TestClient retains its own methods so that monkeypatching or mocking
# httpx.Client (e.g. for external Google/Gemini/YouTube APIs) does not hijack TestClient itself.
if issubclass(TestClient, httpx.Client):
    for _m in ["get", "post", "put", "patch", "delete", "options", "head", "request"]:
        setattr(TestClient, _m, getattr(httpx.Client, _m))

from app.core.config import get_settings
from app.db.session import check_database, reset_engine
from app.main import app


@pytest.fixture(autouse=True)
def clean_environment(monkeypatch):
    """
    Ensure each test runs with isolated settings cache and engine state.
    """
    get_settings.cache_clear()
    reset_engine()
    yield
    get_settings.cache_clear()
    reset_engine()
    app.dependency_overrides.clear()


from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db


@pytest.fixture
def db_session():
    """
    Provides an isolated in-memory SQLite database session for unit tests.
    """
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=test_engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = TestSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client(db_session: Session):
    """
    FastAPI TestClient fixture with get_db dependency overridden by isolated db_session.
    """
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
