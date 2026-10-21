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


@patch("httpx.Client.get")
def test_execute_analytics_query_handles_service_disabled(mock_get: MagicMock):
    """
    Verify execute_analytics_query detects Google Cloud disabled API error and raises YOUTUBE_ANALYTICS_API_DISABLED.
    """
    mock_resp = MagicMock()
    mock_resp.status_code = 403
    mock_resp.json.return_value = {
        "error": {
            "code": 403,
            "message": "YouTube Analytics API has not been used in project 198142014140 before or it is disabled.",
            "status": "PERMISSION_DENIED",
            "details": [{"@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": "SERVICE_DISABLED"}],
        }
    }
    mock_get.return_value = mock_resp

    with pytest.raises(HTTPException) as exc_info:
        execute_analytics_query("ya29.test", params={"ids": "channel==MINE"})
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "YOUTUBE_ANALYTICS_API_DISABLED"


@patch("app.services.youtube_analytics.execute_analytics_query")
@patch("app.services.youtube_analytics.get_valid_access_token")
def test_google_cloud_api_disabled_in_analytics_endpoint(
    mock_token: MagicMock,
    mock_query: MagicMock,
    client: TestClient,
    auth_user: dict,
    connected_channel_with_analytics: ConnectedChannel,
):
    mock_token.return_value = "ya29.valid_token"
    mock_query.side_effect = HTTPException(
        status_code=403,
        detail="YOUTUBE_ANALYTICS_API_DISABLED",
    )

    token = auth_user["access_token"]
    ch_id = connected_channel_with_analytics.channel_id

    res = client.get(
        f"/api/v1/youtube/analytics?channel_id={ch_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["isLive"] is True
    assert body["hasAnalyticsScope"] is True
    assert body["analyticsVerified"] is False
    assert body["analyticsError"] == "SERVICE_DISABLED"
    assert body["trafficSources"] is None
    assert body["timeSeries"] is None
    assert "console.developers.google.com" in body["scopeNotice"]


@patch("app.services.youtube_analytics.execute_analytics_query")
@patch("app.services.youtube_analytics.get_valid_access_token")
def test_google_cloud_api_disabled_in_audience_endpoint(
    mock_token: MagicMock,
    mock_query: MagicMock,
    client: TestClient,
    auth_user: dict,
    connected_channel_with_analytics: ConnectedChannel,
):
    mock_token.return_value = "ya29.valid_token"
    mock_query.side_effect = HTTPException(
        status_code=403,
        detail="YOUTUBE_ANALYTICS_API_DISABLED",
    )

    token = auth_user["access_token"]
    ch_id = connected_channel_with_analytics.channel_id

    res = client.get(
        f"/api/v1/youtube/audience?channel_id={ch_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["isLive"] is True
    assert body["hasAnalyticsScope"] is True
    assert body["analyticsVerified"] is False
    assert body["analyticsError"] == "SERVICE_DISABLED"
    assert body["topCountries"] is None
    assert "console.developers.google.com" in body["scopeNotice"]


@patch("app.services.youtube_analytics.execute_analytics_query")
@patch("app.services.youtube_analytics.get_valid_access_token")
def test_analytics_verified_flag_true_on_successful_reports(
    mock_token: MagicMock,
    mock_query: MagicMock,
    client: TestClient,
    auth_user: dict,
    connected_channel_with_analytics: ConnectedChannel,
):
    mock_token.return_value = "ya29.valid_token"
    mock_query.return_value = {
        "columnHeaders": [{"name": "country"}, {"name": "views"}, {"name": "estimatedMinutesWatched"}],
        "rows": [["US", 50, 150]],
    }

    token = auth_user["access_token"]
    ch_id = connected_channel_with_analytics.channel_id

    res = client.get(
        f"/api/v1/youtube/audience?channel_id={ch_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["analyticsVerified"] is True
    assert body["analyticsError"] is None
    assert body["topCountries"] is not None
    assert body["returningViewersRate"] is None
    assert body["returningViewersState"] == "UNSUPPORTED_METRIC"
    assert "not exposed" in body["returningViewersNotice"].lower()
    assert body["subscriberConversionRate"] is not None
    assert body["optimalReleaseWindow"] is not None


def test_calculate_subscriber_conversion_logic():
    from app.services.youtube_analytics import calculate_subscriber_conversion

    # 1. Nonzero views with subscribers gained
    rate, state, notice = calculate_subscriber_conversion(views=17278, subscribers_gained=23, days=365)
    assert rate == "0.13%"
    assert state == "LIVE"
    assert "+23 subs gained" in notice
    assert "17,278" in notice
    assert "365d window" in notice

    # 2. Nonzero views with 0 subscribers gained (legitimate 0.00% measured conversion)
    rate_zero_subs, state_zero_subs, notice_zero_subs = calculate_subscriber_conversion(views=5000, subscribers_gained=0, days=28)
    assert rate_zero_subs == "0.00%"
    assert state_zero_subs == "LIVE"
    assert "+0 subs gained" in notice_zero_subs
    assert "5,000 views" in notice_zero_subs

    # 3. Zero views with zero subscribers gained: MUST return None and NO_DATA (never "0.00%")
    rate_zero, state_zero, notice_zero = calculate_subscriber_conversion(views=0, subscribers_gained=0, days=28)
    assert rate_zero is None
    assert state_zero == "NO_DATA"
    assert "0 views in 28d lookback window (conversion rate requires views)" in notice_zero

    # 4. Zero views with positive subscribers gained anomaly: MUST return None and NO_DATA
    rate_anom, state_anom, notice_anom = calculate_subscriber_conversion(views=0, subscribers_gained=5, days=28)
    assert rate_anom is None
    assert state_anom == "NO_DATA"
    assert "5 subs gained, but 0 views in 28d lookback window (conversion rate requires views)" in notice_anom

    # 5. Inconsistent / negative views: MUST return None and NO_DATA
    rate_neg, state_neg, notice_neg = calculate_subscriber_conversion(views=-10, subscribers_gained=0, days=28)
    assert rate_neg is None
    assert state_neg == "NO_DATA"
    assert "0 views in 28d lookback window" in notice_neg

    # 6. Negative subscribers gained clamped to 0
    rate_neg_subs, state_neg_subs, notice_neg_subs = calculate_subscriber_conversion(views=1000, subscribers_gained=-2, days=28)
    assert rate_neg_subs == "0.00%"
    assert state_neg_subs == "LIVE"
    assert "+0 subs gained" in notice_neg_subs


def test_calculate_optimal_release_window_heuristic(db_session: Session):
    from datetime import datetime, timezone
    from app.models.video import ChannelVideo
    from app.services.youtube_analytics import calculate_optimal_release_window

    # Scenario 1: < 20 uploads -> INSUFFICIENT_HISTORY with application heuristic label
    window, state, notice = calculate_optimal_release_window(db_session, "UC_INSUFFICIENT", total_uploads=13)
    assert window == "Insufficient Data"
    assert state == "INSUFFICIENT_HISTORY"
    assert "Application heuristic: requires ≥20 public uploads" in notice

    # Scenario 2: >= 20 uploads, but uploads on fewer than 4 weekdays (< 4 distinct weekdays)
    ch_3days = "UC_CONCENTRATED_WEEKDAYS"
    dates_3days = [
        (datetime(2026, 1, 16, 12, 0, tzinfo=timezone.utc), 1000),  # Friday
        (datetime(2026, 1, 18, 12, 0, tzinfo=timezone.utc), 500),   # Sunday
        (datetime(2026, 1, 20, 12, 0, tzinfo=timezone.utc), 200),   # Tuesday
    ]
    for i in range(21):
        d, v = dates_3days[i % 3]
        db_session.add(ChannelVideo(
            channel_id=ch_3days,
            video_id=f"vid_3d_{i}",
            title=f"Video 3D {i}",
            published_at=d,
            view_count=v,
        ))
    db_session.commit()

    window_3d, state_3d, notice_3d = calculate_optimal_release_window(db_session, ch_3days, total_uploads=21)
    assert window_3d == "Insufficient Data"
    assert state_3d == "INSUFFICIENT_HISTORY"
    assert "Application heuristic: uploads distributed across only 3 weekday(s); requires ≥4 distinct weekdays" in notice_3d

    # Scenario 3: >= 20 uploads across 4 weekdays, but all have 0 views
    ch_0views = "UC_ZERO_VIEWS_ALL"
    dates_4days = [
        datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc),  # Thursday
        datetime(2026, 1, 16, 12, 0, tzinfo=timezone.utc),  # Friday
        datetime(2026, 1, 18, 12, 0, tzinfo=timezone.utc),  # Sunday
        datetime(2026, 1, 20, 12, 0, tzinfo=timezone.utc),  # Tuesday
    ]
    for i in range(24):
        d = dates_4days[i % 4]
        db_session.add(ChannelVideo(
            channel_id=ch_0views,
            video_id=f"vid_0v_{i}",
            title=f"Video 0V {i}",
            published_at=d,
            view_count=0,
        ))
    db_session.commit()

    window_0v, state_0v, notice_0v = calculate_optimal_release_window(db_session, ch_0views, total_uploads=24)
    assert window_0v == "Insufficient Data"
    assert state_0v == "INSUFFICIENT_HISTORY"
    assert "Application heuristic: uploads have 0 recorded views" in notice_0v

    # Scenario 4: >= 20 uploads across >= 4 weekdays with nonzero views
    ch_ok = "UC_SUFFICIENT_WEEKDAYS_OK"
    dates_views_4 = [
        (datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc), 100),   # Thursday
        (datetime(2026, 1, 16, 12, 0, tzinfo=timezone.utc), 1500),  # Friday
        (datetime(2026, 1, 18, 12, 0, tzinfo=timezone.utc), 800),   # Sunday
        (datetime(2026, 1, 20, 12, 0, tzinfo=timezone.utc), 200),   # Tuesday
    ]
    for i in range(24):
        d, v = dates_views_4[i % 4]
        db_session.add(ChannelVideo(
            channel_id=ch_ok,
            video_id=f"vid_ok_{i}",
            title=f"Video OK {i}",
            published_at=d,
            view_count=v,
        ))
    db_session.commit()

    window_ok, state_ok, notice_ok = calculate_optimal_release_window(db_session, ch_ok, total_uploads=24)
    assert state_ok == "LIVE"
    assert "Fridays & Sundays" in window_ok
    assert "Application heuristic: Fridays & Sundays had highest avg views across 24 uploads" in notice_ok
    assert "experimental estimate, not an official YouTube metric" in notice_ok


@patch("app.services.youtube_analytics.execute_analytics_query")
@patch("app.services.youtube_analytics.get_valid_access_token")
def test_audience_zero_views_missing_report_rows(
    mock_token: MagicMock,
    mock_query: MagicMock,
    client: TestClient,
    auth_user: dict,
    connected_channel_with_analytics: ConnectedChannel,
):
    """
    When YouTube Analytics reports contain 0 rows (missing data / no views in window):
    - subscriberConversionRate MUST be None (never '0.00%')
    - subscriberConversionState MUST be 'NO_DATA'
    - returningViewersRate MUST be None with state UNSUPPORTED_METRIC
    """
    mock_token.return_value = "ya29.valid_token"
    # Returns empty rows for both geography and overview reports
    mock_query.return_value = {
        "columnHeaders": [{"name": "country"}, {"name": "views"}],
        "rows": [],
    }

    token = auth_user["access_token"]
    ch_id = connected_channel_with_analytics.channel_id

    res = client.get(
        f"/api/v1/youtube/audience?channel_id={ch_id}&days=28",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["isLive"] is True
    assert body["days"] == 28
    assert body["subscriberConversionRate"] is None
    assert body["subscriberConversionState"] == "NO_DATA"
    assert "0 views in 28d lookback window (conversion rate requires views)" in body["subscriberConversionNotice"]
    # Returning Viewers must remain UNSUPPORTED_METRIC without fabricated values
    assert body["returningViewersRate"] is None
    assert body["returningViewersState"] == "UNSUPPORTED_METRIC"
    assert "YouTube Studio-exclusive metric; not exposed by YouTube Analytics API" in body["returningViewersNotice"]


@patch("app.services.youtube_analytics.execute_analytics_query")
@patch("app.services.youtube_analytics.get_valid_access_token")
def test_audience_period_consistency_and_nonzero_views(
    mock_token: MagicMock,
    mock_query: MagicMock,
    client: TestClient,
    auth_user: dict,
    connected_channel_with_analytics: ConnectedChannel,
):
    """
    Verifies that numerator, denominator, percentage, and days lookback
    come from the same query period.
    """
    mock_token.return_value = "ya29.valid_token"

    def side_effect(access_token, params):
        if "insightTrafficSourceType" in params.get("dimensions", ""):
            return {"columnHeaders": [{"name": "insightTrafficSourceType"}, {"name": "views"}], "rows": []}
        elif "country" in params.get("dimensions", ""):
            return {
                "columnHeaders": [{"name": "country"}, {"name": "views"}, {"name": "estimatedMinutesWatched"}],
                "rows": [["US", 2000, 6000]],
            }
        else:
            # Overview report for 90d: 2000 views, 50 subscribers gained
            return {
                "columnHeaders": [
                    {"name": "day"},
                    {"name": "views"},
                    {"name": "estimatedMinutesWatched"},
                    {"name": "averageViewDuration"},
                    {"name": "subscribersGained"},
                    {"name": "subscribersLost"},
                ],
                "rows": [
                    ["2026-01-01", 1000, 3000, 180, 25, 2],
                    ["2026-01-02", 1000, 3000, 180, 25, 3],
                ],
            }

    mock_query.side_effect = side_effect

    token = auth_user["access_token"]
    ch_id = connected_channel_with_analytics.channel_id

    res = client.get(
        f"/api/v1/youtube/audience?channel_id={ch_id}&days=90",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["days"] == 90
    assert body["subscriberConversionRate"] == "2.50%"  # 50 / 2000 * 100 = 2.50%
    assert body["subscriberConversionState"] == "LIVE"
    assert "+50 subs gained across 2,000 views (90d window)" in body["subscriberConversionNotice"]
    assert body["returningViewersRate"] is None
    assert body["returningViewersState"] == "UNSUPPORTED_METRIC"
