from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import decrypt_token
from app.models.channel import ConnectedChannel
from app.models.oauth import OAuthState
from app.models.user import User


@pytest.fixture
def auth_user_a(client: TestClient) -> dict:
    res = client.post(
        "/api/v1/auth/register",
        json={"email": "usera@example.com", "password": "Password123!", "full_name": "User A"},
    )
    return res.json()


@pytest.fixture
def auth_user_b(client: TestClient) -> dict:
    res = client.post(
        "/api/v1/auth/register",
        json={"email": "userb@example.com", "password": "Password123!", "full_name": "User B"},
    )
    return res.json()


def test_oauth_start_requires_authentication(client: TestClient):
    response = client.get("/api/v1/youtube/oauth/start")
    assert response.status_code == 401


def test_oauth_start_generates_valid_url_and_persists_state(
    client: TestClient,
    auth_user_a: dict,
    db_session: Session,
):
    token = auth_user_a["access_token"]
    response = client.get(
        "/api/v1/youtube/oauth/start",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "authorizationUrl" in data or "authorization_url" in data
    assert "state" in data

    auth_url = data.get("authorizationUrl") or data.get("authorization_url")
    state = data["state"]

    assert "accounts.google.com" in auth_url
    assert "code_challenge=" in auth_url
    assert "code_challenge_method=S256" in auth_url
    assert f"state={state}" in auth_url
    assert "youtube.readonly" in auth_url

    # Check state record in database
    db_state = db_session.query(OAuthState).filter(OAuthState.state == state).first()
    assert db_state is not None
    assert db_state.user_id == auth_user_a["user"]["id"]
    assert len(db_state.code_verifier) > 30


def test_oauth_callback_invalid_state(client: TestClient):
    res = client.post(
        "/api/v1/youtube/oauth/callback",
        json={"code": "dummy_code", "state": "non_existent_state_token"},
    )
    assert res.status_code == 400
    assert "invalid or expired" in res.json()["detail"].lower()


def test_oauth_callback_expired_state(
    client: TestClient,
    auth_user_a: dict,
    db_session: Session,
):
    # Insert an expired state
    expired_state = OAuthState(
        state="expired_state_123",
        user_id=auth_user_a["user"]["id"],
        code_verifier="test_verifier",
        redirect_uri="http://localhost:8000/api/v1/youtube/oauth/callback",
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    db_session.add(expired_state)
    db_session.commit()

    res = client.post(
        "/api/v1/youtube/oauth/callback",
        json={"code": "dummy_code", "state": "expired_state_123"},
    )
    assert res.status_code == 400
    assert "expired" in res.json()["detail"].lower()


def test_oauth_callback_browser_denial(client: TestClient):
    res = client.get(
        "/api/v1/youtube/oauth/callback?error=access_denied&error_description=User+denied+consent",
        follow_redirects=False,
    )
    assert res.status_code == 302
    redirect_location = res.headers["location"]
    assert "error=access_denied" in redirect_location
    assert "channels" in redirect_location


@patch("app.services.youtube_oauth.fetch_youtube_channel_profile")
@patch("app.services.youtube_oauth.exchange_code_for_tokens")
def test_successful_oauth_callback_and_encryption(
    mock_exchange: MagicMock,
    mock_fetch_channel: MagicMock,
    client: TestClient,
    auth_user_a: dict,
    db_session: Session,
):
    # Setup mocks
    mock_exchange.return_value = {
        "access_token": "ya29.test_google_access_token_123",
        "refresh_token": "1//test_google_refresh_token_456",
        "expires_in": 3600,
        "scope": "openid email https://www.googleapis.com/auth/youtube.readonly",
    }
    mock_fetch_channel.return_value = {
        "id": "UC_TEST_CHANNEL_789",
        "snippet": {
            "title": "Tech Pulse Labs",
            "customUrl": "@TechPulseLabs",
            "thumbnails": {"medium": {"url": "https://yt3.ggpht.com/test_thumb.jpg"}},
        },
        "statistics": {
            "subscriberCount": "154200",
            "videoCount": "320",
            "viewCount": "4520000",
        },
    }

    # Start OAuth flow to generate real state
    start_res = client.get(
        "/api/v1/youtube/oauth/start",
        headers={"Authorization": f"Bearer {auth_user_a['access_token']}"},
    )
    state = start_res.json()["state"]

    # Call callback
    cb_res = client.post(
        "/api/v1/youtube/oauth/callback",
        json={"code": "valid_google_auth_code", "state": state},
    )
    assert cb_res.status_code == 200
    data = cb_res.json()

    # Verify response fields
    assert data["channelId"] == "UC_TEST_CHANNEL_789"
    assert data["title"] == "Tech Pulse Labs"
    assert data["customUrl"] == "@TechPulseLabs"
    assert data["subscriberCount"] == 154200
    assert data["videoCount"] == 320
    assert data["viewCount"] == 4520000
    assert data["status"] == "connected"

    # CRITICAL SECURITY CHECK: Tokens and keys must never be exposed to frontend
    assert "access_token" not in str(data).lower()
    assert "refresh_token" not in str(data).lower()
    assert "token_encryption_key" not in str(data).lower()

    # Verify at-rest encryption in database
    channel_in_db = (
        db_session.query(ConnectedChannel)
        .filter(ConnectedChannel.channel_id == "UC_TEST_CHANNEL_789")
        .first()
    )
    assert channel_in_db is not None
    assert channel_in_db.encrypted_refresh_token is not None
    # Must NOT be stored in plaintext
    assert channel_in_db.encrypted_refresh_token != "1//test_google_refresh_token_456"
    assert channel_in_db.encrypted_access_token != "ya29.test_google_access_token_123"

    # Decrypting must restore original tokens
    decrypted_refresh = decrypt_token(channel_in_db.encrypted_refresh_token)
    assert decrypted_refresh == "1//test_google_refresh_token_456"

    # State must be consumed and deleted from DB
    assert db_session.query(OAuthState).filter(OAuthState.state == state).first() is None


@patch("app.services.youtube_oauth.fetch_youtube_channel_profile")
@patch("app.services.youtube_oauth.exchange_code_for_tokens")
def test_channel_already_connected_to_another_user_rule(
    mock_exchange: MagicMock,
    mock_fetch_channel: MagicMock,
    client: TestClient,
    auth_user_a: dict,
    auth_user_b: dict,
):
    mock_exchange.return_value = {
        "access_token": "ya29.access_token_shared",
        "refresh_token": "1//refresh_token_shared",
        "expires_in": 3600,
    }
    mock_fetch_channel.return_value = {
        "id": "UC_EXCLUSIVE_CHANNEL_1",
        "snippet": {"title": "Exclusive Channel"},
        "statistics": {"subscriberCount": "1000"},
    }

    # 1. User A connects the channel
    start_a = client.get(
        "/api/v1/youtube/oauth/start",
        headers={"Authorization": f"Bearer {auth_user_a['access_token']}"},
    )
    state_a = start_a.json()["state"]
    cb_a = client.post(
        "/api/v1/youtube/oauth/callback",
        json={"code": "code_a", "state": state_a},
    )
    assert cb_a.status_code == 200

    # 2. User B attempts to connect the exact same external YouTube channel
    start_b = client.get(
        "/api/v1/youtube/oauth/start",
        headers={"Authorization": f"Bearer {auth_user_b['access_token']}"},
    )
    state_b = start_b.json()["state"]
    cb_b = client.post(
        "/api/v1/youtube/oauth/callback",
        json={"code": "code_b", "state": state_b},
    )

    # Must return CHANNEL_ALREADY_CONNECTED with 409 Conflict
    assert cb_b.status_code == 409
    assert cb_b.json()["detail"] == "CHANNEL_ALREADY_CONNECTED"

    # Verify User B connection status is false
    status_b = client.get(
        "/api/v1/youtube/connection-status",
        headers={"Authorization": f"Bearer {auth_user_b['access_token']}"},
    )
    assert status_b.status_code == 200
    assert status_b.json()["connected"] is False
    assert status_b.json()["channel"] is None

    # Verify User A remains connected
    status_a = client.get(
        "/api/v1/youtube/connection-status",
        headers={"Authorization": f"Bearer {auth_user_a['access_token']}"},
    )
    assert status_a.status_code == 200
    assert status_a.json()["connected"] is True
    assert status_a.json()["channel"]["channelId"] == "UC_EXCLUSIVE_CHANNEL_1"


@patch("app.services.youtube_oauth.httpx.Client.post")
@patch("app.services.youtube_oauth.fetch_youtube_channel_profile")
@patch("app.services.youtube_oauth.exchange_code_for_tokens")
def test_disconnect_channel_wipes_credentials_and_preserves_metrics(
    mock_exchange: MagicMock,
    mock_fetch_channel: MagicMock,
    mock_httpx_post: MagicMock,
    client: TestClient,
    auth_user_a: dict,
    db_session: Session,
):
    mock_exchange.return_value = {
        "access_token": "ya29.token_to_disconnect",
        "refresh_token": "1//refresh_to_disconnect",
        "expires_in": 3600,
    }
    mock_fetch_channel.return_value = {
        "id": "UC_DISCONNECT_TEST",
        "snippet": {"title": "Disconnect Me"},
        "statistics": {"subscriberCount": "99999", "videoCount": "88", "viewCount": "777777"},
    }

    # Connect channel
    start_res = client.get(
        "/api/v1/youtube/oauth/start",
        headers={"Authorization": f"Bearer {auth_user_a['access_token']}"},
    )
    state = start_res.json()["state"]
    client.post(
        "/api/v1/youtube/oauth/callback",
        json={"code": "code_disconnect", "state": state},
    )

    # Disconnect channel
    disc_res = client.post(
        "/api/v1/youtube/disconnect",
        headers={"Authorization": f"Bearer {auth_user_a['access_token']}"},
    )
    assert disc_res.status_code == 200
    assert disc_res.json()["success"] is True

    # Status endpoint returns connected: false
    status_res = client.get(
        "/api/v1/youtube/connection-status",
        headers={"Authorization": f"Bearer {auth_user_a['access_token']}"},
    )
    assert status_res.status_code == 200
    assert status_res.json()["connected"] is False

    # Check database: credentials wiped, permitted metrics preserved
    channel_in_db = (
        db_session.query(ConnectedChannel)
        .filter(ConnectedChannel.channel_id == "UC_DISCONNECT_TEST")
        .first()
    )
    assert channel_in_db is not None
    assert channel_in_db.status == "disconnected"
    assert channel_in_db.encrypted_refresh_token is None
    assert channel_in_db.encrypted_access_token is None
    assert channel_in_db.token_expires_at is None
    # Metrics retained
    assert channel_in_db.subscriber_count == 99999
    assert channel_in_db.video_count == 88
    assert channel_in_db.view_count == 777777
    assert channel_in_db.title == "Disconnect Me"


@patch("app.services.youtube_oauth.fetch_youtube_channel_profile")
@patch("app.services.youtube_oauth.exchange_code_for_tokens")
def test_sync_metrics_endpoint(
    mock_exchange: MagicMock,
    mock_fetch_channel: MagicMock,
    client: TestClient,
    auth_user_a: dict,
):
    mock_exchange.return_value = {
        "access_token": "ya29.sync_token",
        "refresh_token": "1//sync_refresh",
        "expires_in": 3600,
    }
    mock_fetch_channel.return_value = {
        "id": "UC_SYNC_TEST",
        "snippet": {"title": "Initial Title"},
        "statistics": {"subscriberCount": "100", "videoCount": "10", "viewCount": "1000"},
    }

    # Connect
    start_res = client.get(
        "/api/v1/youtube/oauth/start",
        headers={"Authorization": f"Bearer {auth_user_a['access_token']}"},
    )
    client.post(
        "/api/v1/youtube/oauth/callback",
        json={"code": "code_sync", "state": start_res.json()["state"]},
    )

    # Next call to fetch channel profile has updated numbers
    mock_fetch_channel.return_value = {
        "id": "UC_SYNC_TEST",
        "snippet": {"title": "Updated Title"},
        "statistics": {"subscriberCount": "250", "videoCount": "12", "viewCount": "2500"},
    }

    sync_res = client.post(
        "/api/v1/youtube/sync",
        headers={"Authorization": f"Bearer {auth_user_a['access_token']}"},
    )
    assert sync_res.status_code == 200
    sync_data = sync_res.json()
    assert sync_data["title"] == "Updated Title"
    assert sync_data["subscriberCount"] == 250
    assert sync_data["videoCount"] == 12
    assert sync_data["viewCount"] == 2500


def test_channel_analytics_live_and_demo(client: TestClient, db_session):
    from app.models.channel import ConnectedChannel
    from app.models.user import User

    user = User(id="user_analytics_test", email="analytics@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    live_ch = ConnectedChannel(
        id="chan_analytics_1",
        user_id="user_analytics_test",
        platform="youtube",
        channel_id="UC_ANALYTICS_LIVE",
        title="Analytics Lab",
        subscriber_count=500,
        video_count=25,
        view_count=50000,
        status="connected",
    )
    db_session.add(live_ch)
    db_session.commit()

    # 1. Live channel analytics
    live_res = client.get("/api/v1/youtube/analytics?channel_id=UC_ANALYTICS_LIVE")
    assert live_res.status_code == 200
    live_data = live_res.json()
    assert live_data["dataState"] == "LIVE"
    assert live_data["isLive"] is True
    assert live_data["totalViews"] == 50000
    assert live_data["totalSubscribers"] == 500
    assert live_data["totalVideos"] == 25
    assert live_data["trafficSources"] is None
    assert "YouTube Analytics Reporting API permissions" in live_data["scopeLimitationNotice"]

    # 2. Demo channel analytics
    demo_res = client.get("/api/v1/youtube/analytics?channel_id=demo-channel-1")
    assert demo_res.status_code == 200
    demo_data = demo_res.json()
    assert demo_data["dataState"] == "DEMO"
    assert demo_data["isLive"] is False
    assert len(demo_data["trafficSources"]) > 0
    assert demo_data["scopeLimitationNotice"] is None


def test_channel_audience_live_and_demo(client: TestClient, db_session):
    from app.models.channel import ConnectedChannel
    from app.models.user import User

    user = User(id="user_audience_test", email="audience@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    live_ch = ConnectedChannel(
        id="chan_audience_1",
        user_id="user_audience_test",
        platform="youtube",
        channel_id="UC_AUDIENCE_LIVE",
        title="Audience Lab",
        subscriber_count=800,
        video_count=40,
        view_count=80000,
        status="connected",
    )
    db_session.add(live_ch)
    db_session.commit()

    # 1. Live channel audience
    live_res = client.get("/api/v1/youtube/audience?channel_id=UC_AUDIENCE_LIVE")
    assert live_res.status_code == 200
    live_data = live_res.json()
    assert live_data["dataState"] == "LIVE"
    assert live_data["isLive"] is True
    assert live_data["subscribers"] == 800
    assert live_data["topCountries"] is None
    assert "YouTube Analytics Partner API permissions" in live_data["scopeLimitationNotice"]

    # 2. Demo channel audience
    demo_res = client.get("/api/v1/youtube/audience?channel_id=demo-channel-1")
    assert demo_res.status_code == 200
    demo_data = demo_res.json()
    assert demo_data["dataState"] == "DEMO"
    assert demo_data["isLive"] is False
    assert len(demo_data["topCountries"]) > 0
    assert demo_data["returningViewersRate"] == "68.4%"


def test_channel_snapshot_deduplication_and_history(client: TestClient, db_session):
    from app.models.channel import ConnectedChannel
    from app.models.snapshot import ChannelSnapshot
    from app.models.user import User
    from app.services.youtube_oauth import record_channel_snapshot

    user = User(id="user_snap_test", email="snap@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    ch = ConnectedChannel(
        id="chan_snap_1",
        user_id="user_snap_test",
        platform="youtube",
        channel_id="UC_SNAP_TEST",
        title="Snapshot Channel",
        subscriber_count=100,
        video_count=10,
        view_count=1000,
        status="connected",
    )
    db_session.add(ch)
    db_session.commit()

    # 1. Create first snapshot
    snap1 = record_channel_snapshot(
        db=db_session,
        channel_id="UC_SNAP_TEST",
        subscriber_count=100,
        video_count=10,
        view_count=1000,
    )
    assert snap1 is not None

    # 2. Repeated request with identical metrics within cooldown window -> deduplication
    snap2 = record_channel_snapshot(
        db=db_session,
        channel_id="UC_SNAP_TEST",
        subscriber_count=100,
        video_count=10,
        view_count=1000,
        cooldown_minutes=15,
    )
    assert snap2.id == snap1.id
    count = db_session.query(ChannelSnapshot).filter(ChannelSnapshot.channel_id == "UC_SNAP_TEST").count()
    assert count == 1

    # 3. Request with updated metrics -> creates new snapshot
    snap3 = record_channel_snapshot(
        db=db_session,
        channel_id="UC_SNAP_TEST",
        subscriber_count=105,
        video_count=11,
        view_count=1200,
    )
    assert snap3.id != snap1.id
    count = db_session.query(ChannelSnapshot).filter(ChannelSnapshot.channel_id == "UC_SNAP_TEST").count()
    assert count == 2

    # 4. Test GET /history endpoint
    res = client.get("/api/v1/youtube/history?channel_id=UC_SNAP_TEST&days=28")
    assert res.status_code == 200
    data = res.json()
    assert data["dataState"] == "LIVE"
    assert len(data["snapshots"]) == 2
    assert data["snapshots"][0]["subscriberCount"] == 100
    assert data["snapshots"][1]["subscriberCount"] == 105


def test_channel_recent_videos_discovery_and_persistence(client: TestClient, db_session, monkeypatch):
    import httpx
    from app.models.channel import ConnectedChannel
    from app.models.user import User
    from app.services.youtube_oauth import sync_channel_videos_from_youtube

    user = User(id="user_vid_test", email="vid@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    ch = ConnectedChannel(
        id="chan_vid_1",
        user_id="user_vid_test",
        platform="youtube",
        channel_id="UC_VID_TEST",
        title="Video Channel",
        subscriber_count=200,
        video_count=5,
        view_count=20000,
        status="connected",
    )
    db_session.add(ch)
    db_session.commit()

    # Mock YouTube API calls for playlist discovery and video statistics
    def mock_get(self, url, headers=None, params=None):
        if "channels" in url:
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "contentDetails": {
                                "relatedPlaylists": {"uploads": "UU_VID_TEST"}
                            }
                        }
                    ]
                },
                request=httpx.Request("GET", url),
            )
        elif "playlistItems" in url:
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "contentDetails": {"videoId": "vid_abc_1"},
                            "snippet": {
                                "title": "Building AI In Public",
                                "publishedAt": "2026-10-18T10:00:00Z",
                                "thumbnails": {"high": {"url": "https://img.youtube.com/vi/vid_abc_1/hqdefault.jpg"}},
                            },
                        },
                        {
                            "contentDetails": {"videoId": "vid_abc_2"},
                            "snippet": {
                                "title": "Deleted video",
                                "publishedAt": "2026-10-17T10:00:00Z",
                            },
                        },
                        {
                            "contentDetails": {"videoId": "vid_abc_3"},
                            "snippet": {
                                "title": "Deploying Full Stack Fast",
                                "publishedAt": "2026-10-16T10:00:00Z",
                                "thumbnails": {"high": {"url": "https://img.youtube.com/vi/vid_abc_3/hqdefault.jpg"}},
                            },
                        },
                    ]
                },
                request=httpx.Request("GET", url),
            )
        elif "videos" in url:
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "id": "vid_abc_1",
                            "snippet": {"title": "Building AI In Public", "publishedAt": "2026-10-18T10:00:00Z"},
                            "statistics": {"viewCount": "4520", "likeCount": "320", "commentCount": "42"},
                        },
                        {
                            "id": "vid_abc_3",
                            "snippet": {"title": "Deploying Full Stack Fast", "publishedAt": "2026-10-16T10:00:00Z"},
                            "statistics": {"viewCount": "8900", "likeCount": "510", "commentCount": "67"},
                        },
                    ]
                },
                request=httpx.Request("GET", url),
            )
        return httpx.Response(404, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.Client, "get", mock_get)

    videos = sync_channel_videos_from_youtube(
        db=db_session,
        access_token="mock_access_token",
        channel=ch,
    )
    # The deleted video was skipped; 2 valid videos persisted
    assert len(videos) == 2
    assert videos[0].view_count in (4520, 8900)

    # Test GET /videos endpoint
    res = client.get("/api/v1/youtube/videos?channel_id=UC_VID_TEST")
    assert res.status_code == 200
    data = res.json()
    assert data["dataState"] == "LIVE"
    assert len(data["videos"]) == 2
    titles = [v["title"] for v in data["videos"]]
    assert "Building AI In Public" in titles
    assert "Deploying Full Stack Fast" in titles
    assert data["videos"][0]["relativePublished"] != ""


def test_channel_ownership_isolation_on_history_and_videos(client: TestClient, db_session):
    from app.core.security import create_access_token
    from app.models.channel import ConnectedChannel
    from app.models.user import User

    user_a = User(id="user_owner_a", email="a@example.com", is_active=True)
    user_b = User(id="user_owner_b", email="b@example.com", is_active=True)
    db_session.add_all([user_a, user_b])
    db_session.commit()

    ch_b = ConnectedChannel(
        id="chan_owner_b",
        user_id="user_owner_b",
        platform="youtube",
        channel_id="UC_USER_B_CHAN",
        title="Channel B",
        subscriber_count=90,
        video_count=2,
        view_count=900,
        status="connected",
    )
    db_session.add(ch_b)
    db_session.commit()

    token_a = create_access_token({"sub": "user_owner_a"})
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # User A attempting to query User B's channel history -> 404 Not Found
    res = client.get("/api/v1/youtube/history?channel_id=UC_USER_B_CHAN", headers=headers_a)
    assert res.status_code == 404
    assert "not found for authenticated user" in res.json()["detail"]

    # User A attempting to query User B's channel videos -> 404 Not Found
    res_vid = client.get("/api/v1/youtube/videos?channel_id=UC_USER_B_CHAN", headers=headers_a)
    assert res_vid.status_code == 404
    assert "not found for authenticated user" in res_vid.json()["detail"]


def test_failed_sync_does_not_update_last_synced_time(client: TestClient, db_session, monkeypatch):
    import httpx
    from fastapi import HTTPException
    from app.core.security import create_access_token, encrypt_token
    from app.models.channel import ConnectedChannel
    from app.models.snapshot import ChannelSnapshot
    from app.models.user import User
    import app.services.youtube_oauth as yt_service

    user = User(id="user_sync_fail", email="syncfail@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    initial_sync_time = datetime(2026, 10, 19, 12, 0, 0, tzinfo=timezone.utc)
    ch = ConnectedChannel(
        id="chan_sync_fail_1",
        user_id="user_sync_fail",
        platform="youtube",
        channel_id="UC_SYNC_FAIL",
        title="Sync Fail Channel",
        subscriber_count=43,
        video_count=13,
        view_count=11704,
        encrypted_access_token=encrypt_token("dummy_access"),
        encrypted_refresh_token=encrypt_token("dummy_refresh"),
        token_expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        status="connected",
        last_synced_at=initial_sync_time,
    )
    db_session.add(ch)
    db_session.commit()

    # Mock fetch_youtube_channel_profile to fail with HTTP 503
    def mock_fetch_fail(access_token: str):
        raise HTTPException(status_code=503, detail="Unable to reach YouTube Data API.")

    monkeypatch.setattr(yt_service, "fetch_youtube_channel_profile", mock_fetch_fail)

    token = create_access_token({"sub": "user_sync_fail"})
    headers = {"Authorization": f"Bearer {token}"}

    res = client.post("/api/v1/youtube/sync", headers=headers)
    assert res.status_code == 503
    assert "Unable to reach YouTube Data API" in res.json()["detail"]

    # Verify channel's last_synced_at was NOT modified
    db_session.refresh(ch)
    ch_tz = ch.last_synced_at if ch.last_synced_at.tzinfo else ch.last_synced_at.replace(tzinfo=timezone.utc)
    assert ch_tz == initial_sync_time

    # Verify a failed snapshot was recorded to document the failure
    failed_snap = (
        db_session.query(ChannelSnapshot)
        .filter(ChannelSnapshot.channel_id == "UC_SYNC_FAIL", ChannelSnapshot.sync_status == "failed")
        .first()
    )
    assert failed_snap is not None
    assert "Unable to reach YouTube Data API" in (failed_snap.error_message or "")


def test_consistent_metrics_across_all_four_pages(client: TestClient, db_session):
    from app.core.security import create_access_token
    from app.models.channel import ConnectedChannel
    from app.models.snapshot import ChannelSnapshot
    from app.models.user import User

    user = User(id="user_consistent", email="consistent@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    ch = ConnectedChannel(
        id="chan_consistent",
        user_id="user_consistent",
        platform="youtube",
        channel_id="UC_CONSISTENT_CHAN",
        title="chillespada",
        subscriber_count=43,
        video_count=13,
        view_count=11704,
        status="connected",
        last_synced_at=datetime.now(timezone.utc),
    )
    db_session.add(ch)
    db_session.commit()

    token = create_access_token({"sub": "user_consistent"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Overview
    res_ov = client.get("/api/v1/dashboard/overview?channel_id=UC_CONSISTENT_CHAN&days=28", headers=headers)
    assert res_ov.status_code == 200
    ov_data = res_ov.json()["data"]
    assert ov_data["kpis"]["totalViews"]["value"] == 11704
    assert ov_data["kpis"]["netSubscribers"]["value"] == 43

    # 2. Analytics
    res_an = client.get("/api/v1/youtube/analytics?channel_id=UC_CONSISTENT_CHAN", headers=headers)
    assert res_an.status_code == 200
    an_data = res_an.json()
    assert an_data["totalViews"] == 11704
    assert an_data["totalSubscribers"] == 43
    assert an_data["totalVideos"] == 13

    # 3. Audience
    res_au = client.get("/api/v1/youtube/audience?channel_id=UC_CONSISTENT_CHAN", headers=headers)
    assert res_au.status_code == 200
    au_data = res_au.json()
    assert au_data["totalViews"] == 11704
    assert au_data["subscribers"] == 43
    assert au_data["uploads"] == 13

    # 4. Channels (Connection Status)
    res_cs = client.get("/api/v1/youtube/connection-status", headers=headers)
    assert res_cs.status_code == 200
    cs_channel = res_cs.json()["channel"]
    assert cs_channel["viewCount"] == 11704
    assert cs_channel["subscriberCount"] == 43
    assert cs_channel["videoCount"] == 13


def test_disconnect_persists_and_clears_credentials(client: TestClient, db_session):
    from app.core.security import create_access_token, encrypt_token
    from app.models.channel import ConnectedChannel
    from app.models.user import User

    user = User(id="user_disconn", email="disconn@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    ch = ConnectedChannel(
        id="chan_disconn",
        user_id="user_disconn",
        platform="youtube",
        channel_id="UC_DISCONN_CHAN",
        title="Disconnect Test Channel",
        subscriber_count=50,
        video_count=5,
        view_count=5000,
        encrypted_access_token=encrypt_token("access_123"),
        encrypted_refresh_token=encrypt_token("refresh_123"),
        status="connected",
    )
    db_session.add(ch)
    db_session.commit()

    token = create_access_token({"sub": "user_disconn"})
    headers = {"Authorization": f"Bearer {token}"}

    # Verify connected initially
    res_init = client.get("/api/v1/youtube/connection-status", headers=headers)
    assert res_init.json()["connected"] is True

    # Call disconnect
    res_disc = client.post("/api/v1/youtube/disconnect", headers=headers)
    assert res_disc.status_code == 200
    assert res_disc.json()["success"] is True

    # Subsequent connection-status check must return connected=False
    res_after = client.get("/api/v1/youtube/connection-status", headers=headers)
    assert res_after.json()["connected"] is False
    assert res_after.json()["channel"] is None

    # Stored tokens must be completely wiped from database
    db_session.refresh(ch)
    assert ch.status == "disconnected"
    assert ch.encrypted_access_token is None
    assert ch.encrypted_refresh_token is None


def test_expired_token_handling_marks_channel_expired_and_returns_401(client: TestClient, db_session, monkeypatch):
    import httpx
    from app.core.security import create_access_token, encrypt_token
    from app.models.channel import ConnectedChannel
    from app.models.user import User

    user = User(id="user_expired", email="expired@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    # Access token already expired in the past, refresh token present
    ch = ConnectedChannel(
        id="chan_expired",
        user_id="user_expired",
        platform="youtube",
        channel_id="UC_EXPIRED_CHAN",
        title="Expired Token Channel",
        subscriber_count=50,
        video_count=5,
        view_count=5000,
        encrypted_access_token=encrypt_token("old_access"),
        encrypted_refresh_token=encrypt_token("bad_refresh"),
        token_expires_at=datetime.now(timezone.utc) - timedelta(hours=2),
        status="connected",
    )
    db_session.add(ch)
    db_session.commit()

    # Mock Google token refresh to return HTTP 400 (invalid_grant)
    def mock_post(self, url, data=None, **kwargs):
        if "oauth2.googleapis.com/token" in url:
            return httpx.Response(400, json={"error": "invalid_grant", "error_description": "Token has been expired or revoked."})
        return httpx.Response(404)

    monkeypatch.setattr(httpx.Client, "post", mock_post)

    token = create_access_token({"sub": "user_expired"})
    headers = {"Authorization": f"Bearer {token}"}

    res = client.post("/api/v1/youtube/sync", headers=headers)
    assert res.status_code == 401
    assert "re-authentication required" in res.json()["detail"].lower()

    # Channel status must transition to "expired"
    db_session.refresh(ch)
    assert ch.status == "expired"


def test_demo_data_isolation_never_serves_demo_to_unconnected_live_id(client: TestClient):
    # Neither unknown live channel IDs nor legacy uc-live-001 should return demo data
    for target_id in ("UC_UNKNOWN_CHANNEL_XYZ", "uc-live-001"):
        # Overview
        res_ov = client.get(f"/api/v1/dashboard/overview?channel_id={target_id}")
        assert res_ov.status_code == 404

        # Analytics
        res_an = client.get(f"/api/v1/youtube/analytics?channel_id={target_id}")
        assert res_an.status_code == 404

        # Audience
        res_au = client.get(f"/api/v1/youtube/audience?channel_id={target_id}")
        assert res_au.status_code == 404

        # History
        res_hi = client.get(f"/api/v1/youtube/history?channel_id={target_id}")
        assert res_hi.status_code == 404

        # Videos
        res_vi = client.get(f"/api/v1/youtube/videos?channel_id={target_id}")
        assert res_vi.status_code == 404


def test_analytics_and_audience_scope_limitation_disclosure(client: TestClient, db_session):
    from app.models.channel import ConnectedChannel
    from app.models.user import User

    user = User(id="user_scope_test", email="scope@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    ch = ConnectedChannel(
        id="chan_scope",
        user_id="user_scope_test",
        platform="youtube",
        channel_id="UC_SCOPE_TEST",
        title="Scope Disclosure Channel",
        subscriber_count=100,
        video_count=10,
        view_count=10000,
        status="connected",
    )
    db_session.add(ch)
    db_session.commit()

    # Live analytics returns null for discovery/retention and includes disclosure notice
    res_an = client.get("/api/v1/youtube/analytics?channel_id=UC_SCOPE_TEST")
    assert res_an.status_code == 200
    an_data = res_an.json()
    assert an_data["isLive"] is True
    assert an_data["trafficSources"] is None
    assert an_data["retentionChart"] is None
    assert "YouTube Analytics Reporting API permissions" in an_data["scopeLimitationNotice"]

    # Live audience returns null for loyalty/demographics and includes disclosure notice
    res_au = client.get("/api/v1/youtube/audience?channel_id=UC_SCOPE_TEST")
    assert res_au.status_code == 200
    au_data = res_au.json()
    assert au_data["isLive"] is True
    assert au_data["topCountries"] is None
    assert au_data["returningViewersRate"] is None
    assert "YouTube Analytics Partner API permissions" in au_data["scopeLimitationNotice"]
