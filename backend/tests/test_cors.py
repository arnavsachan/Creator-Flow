from fastapi.testclient import TestClient

from app.main import app


def test_cors_preflight_allowed_origin():
    """
    CORS preflight (OPTIONS) from an allowed origin succeeds with allow-origin headers.
    """
    client = TestClient(app)
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_preflight_disallowed_origin():
    """
    CORS preflight (OPTIONS) from a disallowed origin does not receive an allow-origin header.
    """
    client = TestClient(app)
    response = client.options(
        "/health",
        headers={
            "Origin": "http://untrusted-origin.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.headers.get("access-control-allow-origin") is None
