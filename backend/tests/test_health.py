import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db.session import check_database
from app.main import app


def test_routes_registered():
    """
    Verify expected health and docs routes exist, and no duplicate /api/v1/health exists.
    """
    openapi_paths = list(app.openapi()["paths"].keys())
    assert "/health" in openapi_paths
    assert "/health/ready" in openapi_paths
    assert "/api/v1/health" not in openapi_paths
    assert "/api/v1/health/ready" not in openapi_paths
    assert app.docs_url == "/docs"


def test_health_endpoint(client: TestClient):
    """
    GET /health returns 200 with service and environment info, without touching the database.
    """
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    settings = get_settings()
    assert data["status"] == "ok"
    assert data["service"] == settings.APP_NAME
    assert data["environment"] == settings.ENVIRONMENT


def test_readiness_endpoint_db_up(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    """
    GET /health/ready returns 200 when database connectivity succeeds.
    """
    monkeypatch.setattr("app.api.routes.health.check_database", lambda: True)

    response = client.get("/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready", "database": "up"}


def test_readiness_endpoint_db_down(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    """
    GET /health/ready returns 503 when database connectivity fails,
    and body contains no secrets, exceptions, or hostnames.
    """
    monkeypatch.setattr("app.api.routes.health.check_database", lambda: False)

    response = client.get("/health/ready")
    assert response.status_code == 503
    data = response.json()
    assert data == {"status": "not_ready", "database": "down"}
    assert "error" not in data
    assert "exception" not in data
    assert "password" not in str(data).lower()


@pytest.mark.integration
def test_real_database_connectivity(client: TestClient):
    """
    Real database integration check. Skipped (not failed) if database is unreachable.
    """
    if not check_database():
        pytest.skip("PostgreSQL database is currently unreachable or not configured in .env.")

    response = client.get("/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready", "database": "up"}
