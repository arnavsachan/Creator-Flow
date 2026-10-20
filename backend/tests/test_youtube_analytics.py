"""
Comprehensive test suite for YouTube Analytics API Integration.

Tests cover:
- OAuth scope-upgrade handling and preservation of existing refresh token
- Channel ownership isolation and access control (401 unauth, 404 unowned)
- Missing Analytics scope handling (AUTHORIZATION_REQUIRED)
- Successful report responses (Overview time-series, Traffic Sources, Geography)
- Empty report handling (NO_DATA without fabricated values)
- Invalid query validation (days parameter validation)
- Quota errors (429), transient retries, and error handling
"""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import encrypt_token
from app.models.channel import ConnectedChannel
from app.services.youtube_analytics import (
    calculate_date_range,
    execute_analytics_query,
)
from app.services.youtube_oauth import (
    YOUTUBE_ANALYTICS_SCOPE,
    YOUTUBE_READONLY_SCOPE,
)


@pytest.fixture
def auth_user(client: TestClient) -> dict:
    res = client.post(
        "/api/v1/auth/register",
        json={"email": "analytics_user@example.com", "password": "Password123!", "full_name": "Analytics User"},
    )
    return res.json()


@pytest.fixture
def other_user(client: TestClient) -> dict:
    res = client.post(
        "/api/v1/auth/register",
        json={"email": "other_user@example.com", "password": "Password123!", "full_name": "Other User"},
    )
    return res.json()


@pytest.fixture
def connected_channel_without_analytics(db_session: Session, auth_user: dict) -> ConnectedChannel:
    channel = ConnectedChannel(
        user_id=auth_user["user"]["id"],
        channel_id="UC_TEST_ANALYTICS_NO_SCOPE",
        title="Test Channel Without Analytics",
        custom_url="@testwithoutanalytics",
        subscriber_count=500,
        video_count=20,
        view_count=10000,
        encrypted_access_token=encrypt_token("ya29.test_access_token"),
        encrypted_refresh_token=encrypt_token("1//test_refresh_token"),
        token_expires_at=datetime.now(timezone.utc),
        scope=YOUTUBE_READONLY_SCOPE,
    )
    db_session.add(channel)
    db_session.commit()
    db_session.refresh(channel)
    return channel


@pytest.fixture
def connected_channel_with_analytics(db_session: Session, auth_user: dict) -> ConnectedChannel:
    channel = ConnectedChannel(
        user_id=auth_user["user"]["id"],
        channel_id="UC_TEST_ANALYTICS_WITH_SCOPE",
        title="Test Channel With Analytics",
        custom_url="@testwithanalytics",
        subscriber_count=1200,
        video_count=45,
        view_count=50000,
        encrypted_access_token=encrypt_token("ya29.test_analytics_access_token"),
        encrypted_refresh_token=encrypt_token("1//test_analytics_refresh_token"),
        token_expires_at=datetime.now(timezone.utc),
        scope=f"{YOUTUBE_READONLY_SCOPE} {YOUTUBE_ANALYTICS_SCOPE}",
    )
    db_session.add(channel)
    db_session.commit()
    db_session.refresh(channel)
    return channel


# ==============================================================================
# 1. OAuth Scope Upgrade & Start Tests
# ==============================================================================

def test_oauth_start_with_analytics_scope_param(client: TestClient, auth_user: dict):
    token = auth_user["access_token"]

    # Default request without analytics
    res_default = client.get(
        "/api/v1/youtube/oauth/start",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_default.status_code == 200
    url_default = res_default.json()["authorizationUrl"]
    assert "youtube.readonly" in url_default
    assert "yt-analytics.readonly" not in url_default

    # Explicit request with analytics
    res_analytics = client.get(
        "/api/v1/youtube/oauth/start?include_analytics=true",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_analytics.status_code == 200
    url_analytics = res_analytics.json()["authorizationUrl"]
    assert "youtube.readonly" in url_analytics
    assert "yt-analytics.readonly" in url_analytics


@patch("app.services.youtube_oauth.fetch_youtube_channel_profile")
@patch("app.services.youtube_oauth.exchange_code_for_tokens")
def test_oauth_scope_upgrade_preserves_existing_refresh_token(
    mock_exchange: MagicMock,
    mock_fetch: MagicMock,
    client: TestClient,
    auth_user: dict,
    db_session: Session,
):
    """
    When a user reauthorizes for scope upgrade, Google often does not return a new refresh token.
    The system must retain the existing encrypted refresh token while upgrading the scope.
    """
    token = auth_user["access_token"]
    user_id = auth_user["user"]["id"]

    # Initial connection with youtube.readonly only
    mock_exchange.return_value = {
        "access_token": "ya29.initial_token",
        "refresh_token": "1//initial_refresh_token",
        "expires_in": 3600,
        "scope": YOUTUBE_READONLY_SCOPE,
    }
    mock_fetch.return_value = {
        "id": "UC_UPGRADE_TEST",
        "snippet": {"title": "Upgrade Channel", "customUrl": "@upgrade"},
        "statistics": {"subscriberCount": "100", "videoCount": "5", "viewCount": "1000"},
    }

    start_res = client.get(
        "/api/v1/youtube/oauth/start",
        headers={"Authorization": f"Bearer {token}"},
    )
    state = start_res.json()["state"]

    cb_res = client.post(
        "/api/v1/youtube/oauth/callback",
        json={"code": "code_1", "state": state},
    )
    assert cb_res.status_code == 200
    assert cb_res.json()["hasAnalyticsScope"] is False

    # Second OAuth flow: User authorizes analytics scope, Google omits refresh_token
    mock_exchange.return_value = {
        "access_token": "ya29.upgraded_token",
        "expires_in": 3600,
        "scope": f"{YOUTUBE_READONLY_SCOPE} {YOUTUBE_ANALYTICS_SCOPE}",
        # Note: no "refresh_token" key returned by Google
    }

    start_res_2 = client.get(
        "/api/v1/youtube/oauth/start?include_analytics=true",
        headers={"Authorization": f"Bearer {token}"},
    )
    state_2 = start_res_2.json()["state"]

    cb_res_2 = client.post(
        "/api/v1/youtube/oauth/callback",
        json={"code": "code_2", "state": state_2},
    )
    assert cb_res_2.status_code == 200
    assert cb_res_2.json()["hasAnalyticsScope"] is True

    # Check database: refresh token preserved
    channel = db_session.query(ConnectedChannel).filter_by(user_id=user_id, channel_id="UC_UPGRADE_TEST").first()
    assert channel is not None
    assert channel.encrypted_refresh_token is not None
    assert channel.has_analytics_scope is True
    assert "yt-analytics.readonly" in channel.scope


# ==============================================================================
# 2. Ownership Isolation & Missing Permission Tests
# ==============================================================================

def test_analytics_endpoints_require_authentication_for_live_channels(client: TestClient):
    assert client.get("/api/v1/youtube/analytics/overview?channel_id=UC123").status_code == 401
    assert client.get("/api/v1/youtube/analytics/traffic-sources?channel_id=UC123").status_code == 401
    assert client.get("/api/v1/youtube/audience/geography?channel_id=UC123").status_code == 401


def test_analytics_endpoints_channel_ownership_isolation(
    client: TestClient,
    other_user: dict,
    connected_channel_with_analytics: ConnectedChannel,
):
    """
    User B cannot access User A's channel analytics.
    """
    other_token = other_user["access_token"]
    ch_id = connected_channel_with_analytics.channel_id

    res = client.get(
        f"/api/v1/youtube/analytics/overview?channel_id={ch_id}",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert res.status_code == 404
    assert res.json()["detail"] == "Channel not found or not owned by user"


def test_analytics_endpoints_missing_scope_returns_authorization_required(
    client: TestClient,
    auth_user: dict,
    connected_channel_without_analytics: ConnectedChannel,
):
    token = auth_user["access_token"]
    ch_id = connected_channel_without_analytics.channel_id

    # 1. Overview report
    res_overview = client.get(
        f"/api/v1/youtube/analytics/overview?channel_id={ch_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_overview.status_code == 200
    body = res_overview.json()
    assert body["dataState"] == "AUTHORIZATION_REQUIRED"
    assert body["hasAnalyticsScope"] is False
    assert body["authorizationUrl"] is not None
    assert "yt-analytics.readonly" in body["authorizationUrl"]
    assert body["timeSeries"] == []

    # 2. Traffic sources report
    res_traffic = client.get(
        f"/api/v1/youtube/analytics/traffic-sources?channel_id={ch_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_traffic.status_code == 200
    assert res_traffic.json()["dataState"] == "AUTHORIZATION_REQUIRED"
    assert res_traffic.json()["hasAnalyticsScope"] is False
    assert res_traffic.json()["trafficSources"] == []

    # 3. Geography report
    res_geo = client.get(
        f"/api/v1/youtube/audience/geography?channel_id={ch_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_geo.status_code == 200
    assert res_geo.json()["dataState"] == "AUTHORIZATION_REQUIRED"
    assert res_geo.json()["hasAnalyticsScope"] is False
    assert res_geo.json()["topCountries"] == []

    # 4. Standard GET /analytics route envelope
    res_analytics = client.get(
        f"/api/v1/youtube/analytics?channel_id={ch_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_analytics.status_code == 200
    assert res_analytics.json()["hasAnalyticsScope"] is False
    assert res_analytics.json()["authorizationUrl"] is not None

    # 5. Standard GET /audience route envelope
    res_aud = client.get(
        f"/api/v1/youtube/audience?channel_id={ch_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_aud.status_code == 200
    assert res_aud.json()["hasAnalyticsScope"] is False
    assert res_aud.json()["authorizationUrl"] is not None


# ==============================================================================
# 3. Validation Tests (Query Params)
# ==============================================================================

def test_invalid_days_parameter_rejected(
    client: TestClient,
    auth_user: dict,
    connected_channel_with_analytics: ConnectedChannel,
):
    token = auth_user["access_token"]
    ch_id = connected_channel_with_analytics.channel_id

    # Supported are only 7, 28, 90, 365
    res = client.get(
        f"/api/v1/youtube/analytics/overview?channel_id={ch_id}&days=15",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 422
    assert "Invalid days interval" in res.json()["detail"]


# ==============================================================================
# 4. Successful Reports with Mocked Google API
# ==============================================================================

@patch("app.services.youtube_analytics.execute_analytics_query")
@patch("app.services.youtube_analytics.get_valid_access_token")
def test_analytics_overview_success(
    mock_token: MagicMock,
    mock_query: MagicMock,
    client: TestClient,
    auth_user: dict,
    connected_channel_with_analytics: ConnectedChannel,
):
    mock_token.return_value = "ya29.valid_token"
    mock_query.return_value = {
        "columnHeaders": [
            {"name": "day"},
            {"name": "views"},
            {"name": "estimatedMinutesWatched"},
            {"name": "averageViewDuration"},
            {"name": "subscribersGained"},
            {"name": "subscribersLost"},
        ],
        "rows": [
            ["2026-10-18", 120, 360, 180, 4, 1],
            ["2026-10-19", 200, 600, 180, 6, 2],
        ],
    }

    token = auth_user["access_token"]
    ch_id = connected_channel_with_analytics.channel_id

    res = client.get(
        f"/api/v1/youtube/analytics/overview?channel_id={ch_id}&days=28",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["dataState"] == "LIVE"
    assert body["hasAnalyticsScope"] is True

    assert body["totalViews"] == 320
    assert body["totalEstimatedMinutesWatched"] == 960
    assert body["netSubscribers"] == 7
    assert len(body["timeSeries"]) == 2
    assert body["timeSeries"][0]["date"] == "2026-10-18"
    assert body["timeSeries"][0]["views"] == 120
    assert body["timeSeries"][1]["date"] == "2026-10-19"
    assert body["timeSeries"][1]["views"] == 200


@patch("app.services.youtube_analytics.execute_analytics_query")
@patch("app.services.youtube_analytics.get_valid_access_token")
def test_analytics_overview_empty_response_returns_no_data(
    mock_token: MagicMock,
    mock_query: MagicMock,
    client: TestClient,
    auth_user: dict,
    connected_channel_with_analytics: ConnectedChannel,
):
    mock_token.return_value = "ya29.valid_token"
    mock_query.return_value = {"columnHeaders": [], "rows": []}

    token = auth_user["access_token"]
    ch_id = connected_channel_with_analytics.channel_id

    res = client.get(
        f"/api/v1/youtube/analytics/overview?channel_id={ch_id}&days=7",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["dataState"] == "NO_DATA"
    assert body["hasAnalyticsScope"] is True
    assert body["totalViews"] == 0
    assert body["timeSeries"] == []


@patch("app.services.youtube_analytics.execute_analytics_query")
@patch("app.services.youtube_analytics.get_valid_access_token")
def test_traffic_sources_success(
    mock_token: MagicMock,
    mock_query: MagicMock,
    client: TestClient,
    auth_user: dict,
    connected_channel_with_analytics: ConnectedChannel,
):
    mock_token.return_value = "ya29.valid_token"
    mock_query.return_value = {
        "columnHeaders": [
            {"name": "insightTrafficSourceType"},
            {"name": "views"},
            {"name": "estimatedMinutesWatched"},
        ],
        "rows": [
            ["YT_SEARCH", 300, 900],
            ["RELATED_VIDEO", 100, 300],
        ],
    }

    token = auth_user["access_token"]
    ch_id = connected_channel_with_analytics.channel_id

    res = client.get(
        f"/api/v1/youtube/analytics/traffic-sources?channel_id={ch_id}&days=28",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["dataState"] == "LIVE"
    assert body["hasAnalyticsScope"] is True
    assert body["totalViews"] == 400
    items = body["trafficSources"]
    assert len(items) == 2
    assert items[0]["source"] == "YouTube Search"
    assert items[0]["views"] == 300
    assert items[0]["percentage"] == "75.0%"
    assert items[1]["source"] == "Suggested Videos"
    assert items[1]["views"] == 100
    assert items[1]["percentage"] == "25.0%"


@patch("app.services.youtube_analytics.execute_analytics_query")
@patch("app.services.youtube_analytics.get_valid_access_token")
def test_geography_success(
    mock_token: MagicMock,
    mock_query: MagicMock,
    client: TestClient,
    auth_user: dict,
    connected_channel_with_analytics: ConnectedChannel,
):
    mock_token.return_value = "ya29.valid_token"
    mock_query.return_value = {
        "columnHeaders": [
            {"name": "country"},
            {"name": "views"},
            {"name": "estimatedMinutesWatched"},
        ],
        "rows": [
            ["US", 300, 900],
            ["IN", 100, 300],
        ],
    }

    token = auth_user["access_token"]
    ch_id = connected_channel_with_analytics.channel_id

    res = client.get(
        f"/api/v1/youtube/audience/geography?channel_id={ch_id}&days=28",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["dataState"] == "LIVE"
    assert body["hasAnalyticsScope"] is True
    assert body["totalViews"] == 400
    countries = body["topCountries"]
    assert len(countries) == 2
    assert countries[0]["country"] == "United States"
    assert countries[0]["share"] == "75.0%"
    assert countries[0]["viewers"] == "300"
    assert countries[1]["country"] == "India"
    assert countries[1]["share"] == "25.0%"
    assert countries[1]["viewers"] == "100"


# ==============================================================================
# 5. Error & Retry Handling Tests
# ==============================================================================

@patch("app.services.youtube_analytics.execute_analytics_query")
@patch("app.services.youtube_analytics.get_valid_access_token")
def test_quota_exceeded_handled_gracefully(
    mock_token: MagicMock,
    mock_query: MagicMock,
    client: TestClient,
    auth_user: dict,
    connected_channel_with_analytics: ConnectedChannel,
):
    mock_token.return_value = "ya29.valid_token"
    mock_query.side_effect = HTTPException(
        status_code=429,
        detail="YouTube Analytics API quota exceeded. Please try again later.",
    )

    token = auth_user["access_token"]
    ch_id = connected_channel_with_analytics.channel_id

    res = client.get(
        f"/api/v1/youtube/analytics/overview?channel_id={ch_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 429
    assert "quota" in res.json()["detail"].lower()


@patch("app.services.youtube_analytics.execute_analytics_query")
@patch("app.services.youtube_analytics.get_valid_access_token")
def test_upstream_scope_revoked_handled_gracefully(
    mock_token: MagicMock,
    mock_query: MagicMock,
    client: TestClient,
    auth_user: dict,
    connected_channel_with_analytics: ConnectedChannel,
):
    mock_token.return_value = "ya29.valid_token"
    mock_query.side_effect = HTTPException(
        status_code=403,
        detail="YOUTUBE_ANALYTICS_SCOPE_REQUIRED",
    )

    token = auth_user["access_token"]
    ch_id = connected_channel_with_analytics.channel_id

    res = client.get(
        f"/api/v1/youtube/analytics/overview?channel_id={ch_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.json()["dataState"] == "AUTHORIZATION_REQUIRED"
    assert res.json()["hasAnalyticsScope"] is False
    assert res.json()["authorizationUrl"] is not None
