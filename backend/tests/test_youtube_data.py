from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
import httpx

from app.core.security import create_access_token, encrypt_token
from app.models.channel import ConnectedChannel
from app.models.user import User
from app.models.video import ChannelVideo
from app.services.youtube_data import parse_iso8601_duration
from app.services.youtube_oauth import sync_channel_videos_from_youtube


def test_parse_iso8601_duration():
    """Verify ISO 8601 duration parsing handles varied formats and invalid input safely."""
    assert parse_iso8601_duration("PT4M13S") == (253, "4:13")
    assert parse_iso8601_duration("PT1H2M30S") == (3750, "1:02:30")
    assert parse_iso8601_duration("PT45S") == (45, "0:45")
    assert parse_iso8601_duration("PT1H") == (3600, "1:00:00")
    assert parse_iso8601_duration("PT5M") == (300, "5:00")
    assert parse_iso8601_duration("P1DT2H3M4S") == (93784, "26:03:04")
    assert parse_iso8601_duration("") == (None, None)
    assert parse_iso8601_duration(None) == (None, None)
    assert parse_iso8601_duration("invalid_string") == (None, None)
    assert parse_iso8601_duration("12:34") == (None, None)


def test_get_channel_details_demo(client: TestClient):
    """GET /youtube/channel/details returns verified demo metadata for demo channels."""
    res1 = client.get("/api/v1/youtube/channel/details?channel_id=demo-channel-1")
    assert res1.status_code == 200
    d1 = res1.json()
    assert d1["channelId"] == "demo-channel-1"
    assert d1["dataState"] == "DEMO"
    assert d1["isLive"] is False
    assert d1["title"] == "Tech Pulse"
    assert d1["customUrl"] == "@TechPulseOfficial"
    assert d1["subscriberCount"] == 48200
    assert d1["videoCount"] == 128
    assert d1["viewCount"] == 1428900
    assert len(d1["topicCategories"]) >= 1
    assert d1["bannerImageUrl"] is not None

    res2 = client.get("/api/v1/youtube/channel/details?channel_id=demo-channel-2")
    assert res2.status_code == 200
    d2 = res2.json()
    assert d2["title"] == "Growth Lab"


def test_get_channel_details_live_success(client: TestClient, db_session, monkeypatch):
    """GET /youtube/channel/details returns rich channel details and updates database."""
    user = User(id="user_live_details", email="details@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    channel = ConnectedChannel(
        id="chan_live_details",
        user_id="user_live_details",
        platform="youtube",
        channel_id="UC_LIVE_DETAILS_1",
        title="Initial Title",
        subscriber_count=1000,
        video_count=10,
        view_count=50000,
        status="connected",
        scope="openid https://www.googleapis.com/auth/youtube.readonly",
        encrypted_access_token=encrypt_token("mock_access_token"),
        encrypted_refresh_token=encrypt_token("mock_refresh_token"),
        token_expires_at=datetime.now(timezone.utc).replace(year=2099),
    )
    db_session.add(channel)
    db_session.commit()

    token = create_access_token(data={"sub": user.id})
    auth_headers = {"Authorization": f"Bearer {token}"}

    def mock_get(self, url, headers=None, params=None):
        if "channels" in url and params.get("id") == "UC_LIVE_DETAILS_1":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "id": "UC_LIVE_DETAILS_1",
                            "snippet": {
                                "title": "Updated Live Channel",
                                "description": "Official verified tech engineering channel.",
                                "customUrl": "@LiveChannelTech",
                                "publishedAt": "2023-05-10T12:00:00Z",
                                "country": "US",
                                "defaultLanguage": "en",
                                "thumbnails": {
                                    "default": {"url": "https://img.youtube.com/thumb_def.jpg"},
                                    "medium": {"url": "https://img.youtube.com/thumb_med.jpg"},
                                    "high": {"url": "https://img.youtube.com/thumb_high.jpg"},
                                },
                            },
                            "statistics": {
                                "subscriberCount": "95400",
                                "hiddenSubscriberCount": False,
                                "videoCount": "84",
                                "viewCount": "3420000",
                            },
                            "contentDetails": {
                                "relatedPlaylists": {"uploads": "UU_LIVE_DETAILS_1"}
                            },
                            "brandingSettings": {
                                "image": {"bannerExternalUrl": "https://img.youtube.com/banner.jpg"},
                                "channel": {"keywords": "fastapi python ai"},
                            },
                            "topicDetails": {
                                "topicCategories": ["https://en.wikipedia.org/wiki/Technology"]
                            },
                            "status": {"privacyStatus": "public"},
                        }
                    ]
                },
                request=httpx.Request("GET", url),
            )
        return httpx.Response(404, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.Client, "get", mock_get)

    res = client.get(
        "/api/v1/youtube/channel/details?channel_id=UC_LIVE_DETAILS_1",
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["channelId"] == "UC_LIVE_DETAILS_1"
    assert data["dataState"] == "LIVE"
    assert data["isLive"] is True
    assert data["title"] == "Updated Live Channel"
    assert data["customUrl"] == "@LiveChannelTech"
    assert data["description"] == "Official verified tech engineering channel."
    assert data["subscriberCount"] == 95400
    assert data["videoCount"] == 84
    assert data["viewCount"] == 3420000
    assert data["uploadsPlaylistId"] == "UU_LIVE_DETAILS_1"
    assert data["bannerImageUrl"] == "https://img.youtube.com/banner.jpg"
    assert data["keywords"] == "fastapi python ai"
    assert "https://en.wikipedia.org/wiki/Technology" in data["topicCategories"]
    assert data["thumbnails"]["high"] == "https://img.youtube.com/thumb_high.jpg"

    # Verify DB was updated
    db_session.refresh(channel)
    assert channel.title == "Updated Live Channel"
    assert channel.subscriber_count == 95400
    assert channel.video_count == 84
    assert channel.view_count == 3420000


def test_get_channel_details_service_disabled(client: TestClient, db_session, monkeypatch):
    """GET /youtube/channel/details returns SERVICE_DISABLED state when API is disabled in GCP."""
    user = User(id="user_serv_dis", email="dis@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    channel = ConnectedChannel(
        id="chan_serv_dis",
        user_id="user_serv_dis",
        platform="youtube",
        channel_id="UC_SERVICE_DIS",
        title="Disabled Channel",
        status="connected",
        scope="openid https://www.googleapis.com/auth/youtube.readonly",
        encrypted_access_token=encrypt_token("mock_token"),
        encrypted_refresh_token=encrypt_token("mock_refresh"),
        token_expires_at=datetime.now(timezone.utc).replace(year=2099),
    )
    db_session.add(channel)
    db_session.commit()

    token = create_access_token(data={"sub": user.id})
    auth_headers = {"Authorization": f"Bearer {token}"}

    def mock_get(self, url, headers=None, params=None):
        return httpx.Response(
            403,
            json={
                "error": {
                    "code": 403,
                    "message": "YouTube Data API v3 has not been used in project 123456 before or it is disabled.",
                    "errors": [{"reason": "accessNotConfigured"}],
                }
            },
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(httpx.Client, "get", mock_get)

    res = client.get("/api/v1/youtube/channel/details?channel_id=UC_SERVICE_DIS", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["dataState"] == "SERVICE_DISABLED"
    assert "not enabled" in data["message"].lower()


def test_get_channel_details_authorization_required_missing_scope(client: TestClient, db_session):
    """GET /youtube/channel/details returns AUTHORIZATION_REQUIRED when youtube.readonly is absent."""
    user = User(id="user_no_scope", email="noscope@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    channel = ConnectedChannel(
        id="chan_no_scope",
        user_id="user_no_scope",
        platform="youtube",
        channel_id="UC_NO_SCOPE",
        title="No Scope Channel",
        status="connected",
        scope="openid email profile",  # Missing youtube.readonly
        encrypted_access_token=encrypt_token("mock_token"),
        encrypted_refresh_token=encrypt_token("mock_refresh"),
        token_expires_at=datetime.now(timezone.utc).replace(year=2099),
    )
    db_session.add(channel)
    db_session.commit()

    token = create_access_token(data={"sub": user.id})
    auth_headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/v1/youtube/channel/details?channel_id=UC_NO_SCOPE", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["dataState"] == "AUTHORIZATION_REQUIRED"
    assert data["hasDataScope"] is False
    assert data["authorizationUrl"] is not None
    assert "accounts.google.com" in data["authorizationUrl"]


def test_get_channel_details_quota_exceeded(client: TestClient, db_session, monkeypatch):
    """GET /youtube/channel/details returns 429 when quota is exceeded."""
    user = User(id="user_quota", email="quota@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    channel = ConnectedChannel(
        id="chan_quota",
        user_id="user_quota",
        platform="youtube",
        channel_id="UC_QUOTA",
        title="Quota Channel",
        status="connected",
        scope="openid https://www.googleapis.com/auth/youtube.readonly",
        encrypted_access_token=encrypt_token("mock_token"),
        encrypted_refresh_token=encrypt_token("mock_refresh"),
        token_expires_at=datetime.now(timezone.utc).replace(year=2099),
    )
    db_session.add(channel)
    db_session.commit()

    token = create_access_token(data={"sub": user.id})
    auth_headers = {"Authorization": f"Bearer {token}"}

    def mock_get(self, url, headers=None, params=None):
        return httpx.Response(
            403,
            json={
                "error": {
                    "code": 403,
                    "message": "Quota exceeded for quota metric.",
                    "errors": [{"reason": "quotaExceeded"}],
                }
            },
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(httpx.Client, "get", mock_get)

    res = client.get("/api/v1/youtube/channel/details?channel_id=UC_QUOTA", headers=auth_headers)
    assert res.status_code == 429
    assert "quota or rate limit exceeded" in res.json()["detail"].lower()


def test_get_channel_details_channel_ownership_isolation(client: TestClient, db_session):
    """GET /youtube/channel/details enforces tenant ownership isolation."""
    user_a = User(id="user_details_a", email="a@example.com", is_active=True)
    user_b = User(id="user_details_b", email="b@example.com", is_active=True)
    db_session.add_all([user_a, user_b])
    db_session.commit()

    channel_a = ConnectedChannel(
        id="chan_details_a",
        user_id="user_details_a",
        platform="youtube",
        channel_id="UC_TENANT_A",
        title="Channel A",
        status="connected",
    )
    db_session.add(channel_a)
    db_session.commit()

    # User B requests Channel A's details
    token_b = create_access_token(data={"sub": user_b.id})
    res = client.get(
        "/api/v1/youtube/channel/details?channel_id=UC_TENANT_A",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res.status_code == 404


def test_get_content_library_demo(client: TestClient):
    """GET /youtube/content-library supports demo videos, search filtering, and sorting."""
    # 1. Base demo library
    res = client.get("/api/v1/youtube/content-library?channel_id=demo-channel-1")
    assert res.status_code == 200
    data = res.json()
    assert data["channelId"] == "demo-channel-1"
    assert data["dataState"] == "DEMO"
    assert data["isLive"] is False
    assert len(data["videos"]) == 5
    v0 = data["videos"][0]
    assert v0["duration"] is not None
    assert v0["durationSeconds"] is not None
    assert v0["viewCount"] > 0
    assert v0["likeCount"] is not None
    assert len(v0["tags"]) > 0

    # 2. Search query filter
    res_q = client.get("/api/v1/youtube/content-library?channel_id=demo-channel-1&q=Autonomous")
    assert res_q.status_code == 200
    data_q = res_q.json()
    assert len(data_q["videos"]) == 1
    assert "Autonomous" in data_q["videos"][0]["title"]

    # 3. Sort by views
    res_views = client.get("/api/v1/youtube/content-library?channel_id=demo-channel-1&order=views")
    assert res_views.status_code == 200
    v_views = res_views.json()["videos"]
    for i in range(len(v_views) - 1):
        assert v_views[i]["viewCount"] >= v_views[i + 1]["viewCount"]

    # 4. Sort by title
    res_title = client.get("/api/v1/youtube/content-library?channel_id=demo-channel-1&order=title")
    assert res_title.status_code == 200
    v_title = res_title.json()["videos"]
    for i in range(len(v_title) - 1):
        assert v_title[i]["title"].lower() <= v_title[i + 1]["title"].lower()

    # 5. Invalid order parameter returns 422
    res_inv = client.get("/api/v1/youtube/content-library?channel_id=demo-channel-1&order=invalid_order")
    assert res_inv.status_code == 422


def test_get_content_library_live_uploads_playlist_flow(client: TestClient, db_session, monkeypatch):
    """GET /youtube/content-library executes uploads playlist + videos.list pipeline."""
    user = User(id="user_lib_live", email="lib@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    channel = ConnectedChannel(
        id="chan_lib_live",
        user_id="user_lib_live",
        platform="youtube",
        channel_id="UC_LIB_LIVE_1",
        title="Creator Live Studio",
        status="connected",
        scope="openid https://www.googleapis.com/auth/youtube.readonly",
        encrypted_access_token=encrypt_token("mock_token"),
        encrypted_refresh_token=encrypt_token("mock_refresh"),
        token_expires_at=datetime.now(timezone.utc).replace(year=2099),
    )
    db_session.add(channel)
    db_session.commit()

    token = create_access_token(data={"sub": user.id})
    auth_headers = {"Authorization": f"Bearer {token}"}

    def mock_get(self, url, headers=None, params=None):
        if "playlistItems" in url:
            assert params.get("playlistId") == "UU_LIB_LIVE_1"
            return httpx.Response(
                200,
                json={
                    "nextPageToken": "NEXT_PAGE_TOKEN_ABC",
                    "prevPageToken": None,
                    "pageInfo": {"totalResults": 38, "resultsPerPage": 2},
                    "items": [
                        {
                            "contentDetails": {"videoId": "vid_live_1"},
                            "snippet": {
                                "title": "Building In Public Ep 1",
                                "publishedAt": "2026-10-18T10:00:00Z",
                                "thumbnails": {"high": {"url": "https://img.youtube.com/vi/vid_live_1/hq.jpg"}},
                            },
                        },
                        {
                            "contentDetails": {"videoId": "vid_live_2"},
                            "snippet": {
                                "title": "Deleted video",
                                "publishedAt": "2026-10-17T10:00:00Z",
                            },
                        },
                        {
                            "contentDetails": {"videoId": "vid_live_3"},
                            "snippet": {
                                "title": "Production Deployment Guide",
                                "publishedAt": "2026-10-16T10:00:00Z",
                                "thumbnails": {"high": {"url": "https://img.youtube.com/vi/vid_live_3/hq.jpg"}},
                            },
                        },
                    ],
                },
                request=httpx.Request("GET", url),
            )
        elif "videos" in url:
            assert "vid_live_1" in params.get("id")
            assert "vid_live_3" in params.get("id")
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "id": "vid_live_1",
                            "snippet": {
                                "title": "Building In Public Ep 1",
                                "description": "Episode 1 of building software in public.",
                                "publishedAt": "2026-10-18T10:00:00Z",
                                "tags": ["BuildInPublic", "Startup"],
                                "thumbnails": {"high": {"url": "https://img.youtube.com/vi/vid_live_1/hq.jpg"}},
                            },
                            "contentDetails": {
                                "duration": "PT12M34S",
                                "definition": "hd",
                                "caption": "true",
                            },
                            "statistics": {
                                "viewCount": "15400",
                                "likeCount": "1200",
                                "commentCount": "89",
                            },
                            "status": {"privacyStatus": "public"},
                        },
                        {
                            "id": "vid_live_3",
                            "snippet": {
                                "title": "Production Deployment Guide",
                                "description": "How to deploy reliable containerized services.",
                                "publishedAt": "2026-10-16T10:00:00Z",
                                "tags": ["Docker", "Deploy"],
                                "thumbnails": {"high": {"url": "https://img.youtube.com/vi/vid_live_3/hq.jpg"}},
                            },
                            "contentDetails": {
                                "duration": "PT24M10S",
                                "definition": "hd",
                                "caption": "false",
                            },
                            "statistics": {
                                "viewCount": "28900",
                                "likeCount": "2150",
                                "commentCount": "142",
                            },
                            "status": {"privacyStatus": "public"},
                        },
                    ]
                },
                request=httpx.Request("GET", url),
            )
        return httpx.Response(404, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.Client, "get", mock_get)

    res = client.get(
        "/api/v1/youtube/content-library?channel_id=UC_LIB_LIVE_1&max_results=10&order=views",
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["channelId"] == "UC_LIB_LIVE_1"
    assert data["dataState"] == "LIVE"
    assert data["nextPageToken"] == "NEXT_PAGE_TOKEN_ABC"
    assert data["totalResults"] == 38
    assert len(data["videos"]) == 2  # Deleted video was skipped

    # Sorted by views DESC
    v0 = data["videos"][0]
    v1 = data["videos"][1]
    assert v0["videoId"] == "vid_live_3"
    assert v0["viewCount"] == 28900
    assert v0["duration"] == "24:10"
    assert v0["durationSeconds"] == 1450
    assert v0["durationIso"] == "PT24M10S"
    assert v0["hasCaption"] is False

    assert v1["videoId"] == "vid_live_1"
    assert v1["viewCount"] == 15400
    assert v1["duration"] == "12:34"
    assert v1["durationSeconds"] == 754
    assert v1["durationIso"] == "PT12M34S"
    assert v1["hasCaption"] is True


def test_get_content_library_service_disabled(client: TestClient, db_session, monkeypatch):
    """GET /youtube/content-library handles disabled YouTube Data API gracefully."""
    user = User(id="user_lib_dis", email="libdis@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    channel = ConnectedChannel(
        id="chan_lib_dis",
        user_id="user_lib_dis",
        platform="youtube",
        channel_id="UC_LIB_DIS",
        title="Disabled Lib Channel",
        status="connected",
        scope="openid https://www.googleapis.com/auth/youtube.readonly",
        encrypted_access_token=encrypt_token("mock_token"),
        encrypted_refresh_token=encrypt_token("mock_refresh"),
        token_expires_at=datetime.now(timezone.utc).replace(year=2099),
    )
    db_session.add(channel)
    db_session.commit()

    token = create_access_token(data={"sub": user.id})
    auth_headers = {"Authorization": f"Bearer {token}"}

    def mock_get(self, url, headers=None, params=None):
        return httpx.Response(
            403,
            json={
                "error": {
                    "code": 403,
                    "message": "YouTube Data API v3 has not been used in project or is disabled.",
                    "errors": [{"reason": "SERVICE_DISABLED"}],
                }
            },
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(httpx.Client, "get", mock_get)

    res = client.get("/api/v1/youtube/content-library?channel_id=UC_LIB_DIS", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["dataState"] == "SERVICE_DISABLED"
    assert "not enabled" in data["message"].lower()


def test_get_content_library_timeout_handling(client: TestClient, db_session, monkeypatch):
    """GET /youtube/content-library handles upstream gateway timeouts."""
    user = User(id="user_lib_time", email="time@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    channel = ConnectedChannel(
        id="chan_lib_time",
        user_id="user_lib_time",
        platform="youtube",
        channel_id="UC_LIB_TIME",
        title="Timeout Channel",
        status="connected",
        scope="openid https://www.googleapis.com/auth/youtube.readonly",
        encrypted_access_token=encrypt_token("mock_token"),
        encrypted_refresh_token=encrypt_token("mock_refresh"),
        token_expires_at=datetime.now(timezone.utc).replace(year=2099),
    )
    db_session.add(channel)
    db_session.commit()

    token = create_access_token(data={"sub": user.id})
    auth_headers = {"Authorization": f"Bearer {token}"}

    def mock_timeout(self, url, headers=None, params=None):
        raise httpx.TimeoutException("Upstream timed out")

    monkeypatch.setattr(httpx.Client, "get", mock_timeout)

    res = client.get("/api/v1/youtube/content-library?channel_id=UC_LIB_TIME", headers=auth_headers)
    assert res.status_code == 504
    assert "timed out" in res.json()["detail"].lower()


def test_existing_videos_endpoint_returns_duration(client: TestClient, db_session):
    """GET /youtube/videos preserves existing behavior and exposes duration fields."""
    user = User(id="user_vid_dur", email="dur@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    channel = ConnectedChannel(
        id="chan_vid_dur",
        user_id="user_vid_dur",
        platform="youtube",
        channel_id="UC_VID_DUR",
        title="Duration Channel",
        status="connected",
    )
    db_session.add(channel)

    video = ChannelVideo(
        id="cv_dur_1",
        channel_id="UC_VID_DUR",
        video_id="vid_dur_1",
        title="Duration Testing Video",
        published_at=datetime.now(timezone.utc),
        duration="15:30",
        duration_seconds=930,
        description="Testing duration field",
        view_count=5000,
    )
    db_session.add(video)
    db_session.commit()

    res = client.get("/api/v1/youtube/videos?channel_id=UC_VID_DUR")
    assert res.status_code == 200
    data = res.json()
    assert len(data["videos"]) == 1
    v = data["videos"][0]
    assert v["duration"] == "15:30"
    assert v["durationSeconds"] == 930
    assert v["description"] == "Testing duration field"


def test_sync_channel_videos_persists_duration(db_session, monkeypatch):
    """sync_channel_videos_from_youtube parses and stores duration and description into ChannelVideo."""
    user = User(id="user_sync_dur", email="syncdur@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    channel = ConnectedChannel(
        id="chan_sync_dur",
        user_id="user_sync_dur",
        platform="youtube",
        channel_id="UC_SYNC_DUR",
        title="Sync Duration Channel",
        status="connected",
    )
    db_session.add(channel)
    db_session.commit()

    def mock_get(self, url, headers=None, params=None):
        if "channels" in url:
            return httpx.Response(
                200,
                json={"items": [{"contentDetails": {"relatedPlaylists": {"uploads": "UU_SYNC_DUR"}}}]},
                request=httpx.Request("GET", url),
            )
        elif "playlistItems" in url:
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "contentDetails": {"videoId": "vid_sync_1"},
                            "snippet": {"title": "Synced Video 1", "publishedAt": "2026-10-18T10:00:00Z"},
                        }
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
                            "id": "vid_sync_1",
                            "snippet": {
                                "title": "Synced Video 1",
                                "description": "Full description of synced video.",
                                "publishedAt": "2026-10-18T10:00:00Z",
                            },
                            "contentDetails": {"duration": "PT8M45S"},
                            "statistics": {"viewCount": "1200", "likeCount": "95", "commentCount": "12"},
                        }
                    ]
                },
                request=httpx.Request("GET", url),
            )
        return httpx.Response(404, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.Client, "get", mock_get)

    vids = sync_channel_videos_from_youtube(db=db_session, access_token="mock_token", channel=channel)
    assert len(vids) == 1
    stored = db_session.query(ChannelVideo).filter(ChannelVideo.video_id == "vid_sync_1").first()
    assert stored is not None
    assert stored.duration == "8:45"
    assert stored.duration_seconds == 525
    assert stored.description == "Full description of synced video."
