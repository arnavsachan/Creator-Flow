from fastapi.testclient import TestClient

from app.main import app


def test_dashboard_overview_status_and_schema(client: TestClient):
    """
    GET /api/v1/dashboard/overview returns 200 with structured demo overview data.
    """
    response = client.get("/api/v1/dashboard/overview")
    assert response.status_code == 200

    payload = response.json()
    assert payload["data_state"] == "DEMO"
    assert "data" in payload

    data = payload["data"]
    assert data["channel_id"] == "demo-channel-1"

    # Verify KPI metrics
    metrics = data["metrics"]
    for key in ["totalViews", "netSubscribers", "watchTime", "estimatedRevenue"]:
        assert key in metrics
        metric = metrics[key]
        assert "title" in metric
        assert "value" in metric
        assert metric["trend"] in ["up", "down", "neutral"]
        assert isinstance(metric["sparklinePoints"], list)

    # Verify chart data
    assert isinstance(data["chart_data"], list)
    assert len(data["chart_data"]) > 0
    first_pt = data["chart_data"][0]
    assert "date" in first_pt
    assert "views" in first_pt
    assert "watchTime" in first_pt
    assert "subscribers" in first_pt

    # Verify actionable insights
    assert isinstance(data["insights"], list)
    assert len(data["insights"]) > 0
    assert "action_href" in data["insights"][0]

    # Verify recent videos
    assert isinstance(data["recent_videos"], list)
    assert len(data["recent_videos"]) > 0
    assert data["recent_videos"][0]["ctrStatus"] in ["high", "normal", "low"]

    # Verify pipeline items
    assert isinstance(data["pipeline_items"], list)
    assert len(data["pipeline_items"]) > 0
    assert data["pipeline_items"][0]["format"] in ["Long-form", "Short"]
    assert "scheduledDate" in data["pipeline_items"][0]


def test_dashboard_overview_custom_channel(client: TestClient):
    """
    Query parameter channel_id is properly reflected in the response envelope.
    """
    response = client.get("/api/v1/dashboard/overview?channel_id=creator-channel-99")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["channel_id"] == "creator-channel-99"


def test_dashboard_overview_cors_preflight(client: TestClient):
    """
    CORS preflight (OPTIONS) for /api/v1/dashboard/overview from allowed origin succeeds.
    """
    response = client.options(
        "/api/v1/dashboard/overview",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
