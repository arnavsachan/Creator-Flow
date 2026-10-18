import pytest
from fastapi.testclient import TestClient

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


@pytest.fixture
def client():
    """
    FastAPI TestClient fixture.
    """
    return TestClient(app)
