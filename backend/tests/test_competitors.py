from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
import httpx

from app.core.security import create_access_token, encrypt_token
from app.models.channel import ConnectedChannel
from app.models.competitor import Competitor
from app.models.user import User


@pytest.fixture
def test_user_a(db_session):
    user = User(id="user_comp_a", email="user_a@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def test_user_b(db_session):
    user = User(id="user_comp_b", email="user_b@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def auth_headers_a(test_user_a):
    token = create_access_token(data={"sub": test_user_a.id})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_b(test_user_b):
    token = create_access_token(data={"sub": test_user_b.id})
    return {"Authorization": f"Bearer {token}"}


def test_competitor_crud_flow(client: TestClient, db_session, test_user_a, auth_headers_a):
    """Test full CRUD lifecycle for competitor tracking."""
    # 1. Create competitor
    payload = {
        "channelId": "UC_TEST_COMP_1",
        "title": "System Design Hub",
        "customUrl": "@SystemDesignHub",
        "notes": "Direct peer in distributed systems space",
    }
    res_create = client.post("/api/v1/competitors", json=payload, headers=auth_headers_a)
    assert res_create.status_code == 201
    created_data = res_create.json()
    assert created_data["channelId"] == "UC_TEST_COMP_1"
    assert created_data["title"] == "System Design Hub"
    assert created_data["customUrl"] == "@SystemDesignHub"
    assert created_data["notes"] == "Direct peer in distributed systems space"
    comp_id = created_data["id"]

    # 2. List competitors
    res_list = client.get("/api/v1/competitors", headers=auth_headers_a)
    assert res_list.status_code == 200
    competitors = res_list.json()
    assert len(competitors) == 1
    assert competitors[0]["id"] == comp_id

    # 3. Get single competitor
    res_get = client.get(f"/api/v1/competitors/{comp_id}", headers=auth_headers_a)
    assert res_get.status_code == 200
    assert res_get.json()["id"] == comp_id

    # 4. Delete competitor
    res_del = client.delete(f"/api/v1/competitors/{comp_id}", headers=auth_headers_a)
    assert res_del.status_code == 204

    # 5. Verify deleted
    res_get_deleted = client.get(f"/api/v1/competitors/{comp_id}", headers=auth_headers_a)
    assert res_get_deleted.status_code == 404


def test_duplicate_competitor_prevention(client: TestClient, db_session, test_user_a, auth_headers_a):
    """Attempting to add the same channel ID twice for the same user returns 409 Conflict."""
    payload = {
        "channelId": "UC_TEST_DUPLICATE",
        "title": "Tech Engineering Pro",
    }
    res1 = client.post("/api/v1/competitors", json=payload, headers=auth_headers_a)
    assert res1.status_code == 201

    res2 = client.post("/api/v1/competitors", json=payload, headers=auth_headers_a)
    assert res2.status_code == 409
    assert "already tracked" in res2.json()["detail"].lower()


def test_channel_id_validation(client: TestClient, test_user_a, auth_headers_a):
    """Empty or too short channel IDs return 422 Unprocessable Content."""
    res = client.post("/api/v1/competitors", json={"channelId": " "}, headers=auth_headers_a)
    assert res.status_code in (422, 400)


def test_tenant_isolation(client: TestClient, db_session, test_user_a, test_user_b, auth_headers_a, auth_headers_b):
    """User B cannot access or delete User A's tracked competitor."""
    comp_a = Competitor(
        id="comp_record_a",
        user_id=test_user_a.id,
        channel_id="UC_ISOLATED_A",
        title="Isolated Channel A",
        subscriber_count=50000,
        video_count=100,
        view_count=1000000,
    )
    db_session.add(comp_a)
    db_session.commit()

    # User B lists competitors - should be empty
    res_list_b = client.get("/api/v1/competitors", headers=auth_headers_b)
    assert res_list_b.status_code == 200
    assert len(res_list_b.json()) == 0

    # User B tries to get User A's competitor directly
    res_get_b = client.get(f"/api/v1/competitors/{comp_a.id}", headers=auth_headers_b)
    assert res_get_b.status_code == 404

    # User B tries to delete User A's competitor
    res_del_b = client.delete(f"/api/v1/competitors/{comp_a.id}", headers=auth_headers_b)
    assert res_del_b.status_code == 404

    # Verify User A's competitor still exists
    res_get_a = client.get(f"/api/v1/competitors/{comp_a.id}", headers=auth_headers_a)
    assert res_get_a.status_code == 200


def test_competitor_search_demo_fallback(client: TestClient, test_user_a, auth_headers_a):
    """Search for demo channels returns demo competitor results with dataState='DEMO'."""
    res = client.get("/api/v1/competitors/search?q=Tech", headers=auth_headers_a)
    assert res.status_code == 200
    data = res.json()
    assert data["dataState"] == "DEMO"
    assert len(data["results"]) >= 1
    item = data["results"][0]
    assert item["channelId"] is not None
    assert item["title"] is not None
    assert item["subscriberCount"] is not None


def test_competitor_search_live_api_flow(client: TestClient, db_session, test_user_a, auth_headers_a, monkeypatch):
    """Live search queries search.list, batches channels.list, and maps statistics correctly."""
    # Connect channel for user
    channel = ConnectedChannel(
        id="chan_search_user",
        user_id=test_user_a.id,
        platform="youtube",
        channel_id="UC_SEARCH_LIVE_USER",
        title="User Channel",
        status="connected",
        scope="openid https://www.googleapis.com/auth/youtube.readonly",
        encrypted_access_token=encrypt_token("mock_token"),
        encrypted_refresh_token=encrypt_token("mock_refresh"),
        token_expires_at=datetime.now(timezone.utc).replace(year=2099),
    )
    db_session.add(channel)
    db_session.commit()

    original_get = httpx.Client.get

    def mock_get(self, url, headers=None, params=None, *args, **kwargs):
        if "googleapis.com" not in str(url):
            return original_get(self, url, headers=headers, params=params, *args, **kwargs)
        if "search" in str(url):
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "id": {"kind": "youtube#channel", "channelId": "UC_FOUND_1"},
                            "snippet": {
                                "title": "Dev Ops Masters",
                                "description": "Cloud architecture tutorials",
                                "thumbnails": {"default": {"url": "https://img.youtube.com/thumb1.jpg"}},
                            },
                        }
                    ],
                    "nextPageToken": "SEARCH_PAGE_2",
                    "pageInfo": {"totalResults": 25},
                },
                request=httpx.Request("GET", str(url)),
            )
        elif "channels" in str(url):
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "id": "UC_FOUND_1",
                            "snippet": {
                                "title": "Dev Ops Masters",
                                "description": "Cloud architecture tutorials",
                                "customUrl": "@DevOpsMasters",
                                "thumbnails": {"medium": {"url": "https://img.youtube.com/thumb_med.jpg"}},
                            },
                            "statistics": {
                                "subscriberCount": "125000",
                                "hiddenSubscriberCount": False,
                                "videoCount": "85",
                                "viewCount": "9800000",
                            },
                        }
                    ]
                },
                request=httpx.Request("GET", str(url)),
            )
        return httpx.Response(404, request=httpx.Request("GET", str(url)))

    monkeypatch.setattr(httpx.Client, "get", mock_get)

    res = client.get("/api/v1/competitors/search?q=DevOps", headers=auth_headers_a)
    assert res.status_code == 200
    data = res.json()
    assert data["dataState"] == "LIVE"
    assert len(data["results"]) == 1
    found = data["results"][0]
    assert found["channelId"] == "UC_FOUND_1"
    assert found["title"] == "Dev Ops Masters"
    assert found["customUrl"] == "@DevOpsMasters"
    assert found["subscriberCount"] == 125000
    assert found["videoCount"] == 85
    assert found["viewCount"] == 9800000


def test_competitor_uploads_live_flow(client: TestClient, db_session, test_user_a, auth_headers_a, monkeypatch):
    """Latest competitor uploads parses ISO 8601 durations and maps statistics."""
    channel = ConnectedChannel(
        id="chan_uploads_user",
        user_id=test_user_a.id,
        platform="youtube",
        channel_id="UC_USER_CHAN",
        title="User Channel",
        status="connected",
        scope="openid https://www.googleapis.com/auth/youtube.readonly",
        encrypted_access_token=encrypt_token("mock_token"),
        encrypted_refresh_token=encrypt_token("mock_refresh"),
        token_expires_at=datetime.now(timezone.utc).replace(year=2099),
    )
    db_session.add(channel)

    competitor = Competitor(
        id="comp_up_1",
        user_id=test_user_a.id,
        channel_id="UC_COMP_LIVE_UPLOADS",
        title="Scale Engineering",
        subscriber_count=250000,
        video_count=120,
        view_count=15000000,
    )
    db_session.add(competitor)
    db_session.commit()

    original_get = httpx.Client.get

    def mock_get(self, url, headers=None, params=None, *args, **kwargs):
        if "googleapis.com" not in str(url):
            return original_get(self, url, headers=headers, params=params, *args, **kwargs)
        if "playlistItems" in str(url):
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "contentDetails": {"videoId": "vid_comp_1"},
                            "snippet": {
                                "title": "Scaling PostgreSQL to 1 Billion Rows",
                                "description": "Database partitioning strategies",
                                "publishedAt": "2026-10-18T10:00:00Z",
                                "thumbnails": {"high": {"url": "https://img.youtube.com/thumb_high.jpg"}},
                            },
                        }
                    ],
                    "pageInfo": {"totalResults": 45},
                },
                request=httpx.Request("GET", str(url)),
            )
        elif "videos" in str(url):
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "id": "vid_comp_1",
                            "snippet": {
                                "title": "Scaling PostgreSQL to 1 Billion Rows",
                                "description": "Database partitioning strategies",
                                "publishedAt": "2026-10-18T10:00:00Z",
                                "thumbnails": {"high": {"url": "https://img.youtube.com/thumb_high.jpg"}},
                            },
                            "contentDetails": {"duration": "PT14M35S"},
                            "statistics": {
                                "viewCount": "42100",
                                "likeCount": "2890",
                                "commentCount": "194",
                            },
                        }
                    ]
                },
                request=httpx.Request("GET", str(url)),
            )
        return httpx.Response(404, request=httpx.Request("GET", str(url)))

    monkeypatch.setattr(httpx.Client, "get", mock_get)

    res = client.get(f"/api/v1/competitors/{competitor.id}/uploads", headers=auth_headers_a)
    assert res.status_code == 200
    data = res.json()
    assert len(data["videos"]) == 1
    v = data["videos"][0]
    assert v["videoId"] == "vid_comp_1"
    assert v["title"] == "Scaling PostgreSQL to 1 Billion Rows"
    assert v["duration"] == "14:35"
    assert v["durationSeconds"] == 875
    assert v["viewCount"] == 42100
    assert v["likeCount"] == 2890
    assert v["commentCount"] == 194


def test_channel_comparison_honest_metrics(client: TestClient, db_session, test_user_a, auth_headers_a):
    """Comparison computes public metrics without fabricating private CTR or audience overlap."""
    competitor = Competitor(
        id="comp_cmp_1",
        user_id=test_user_a.id,
        channel_id="UC_DEMO_TECH_LEAD",
        title="Tech Lead Pro",
        subscriber_count=420000,
        video_count=340,
        view_count=45200000,
    )
    db_session.add(competitor)

    user_channel = ConnectedChannel(
        id="chan_cmp_user",
        user_id=test_user_a.id,
        platform="youtube",
        channel_id="UC_USER_MY_CHAN",
        title="My Studio Channel",
        subscriber_count=50000,
        video_count=100,
        view_count=1200000,
        status="connected",
    )
    db_session.add(user_channel)
    db_session.commit()

    res = client.get(f"/api/v1/competitors/{competitor.id}/compare?channel_id=UC_USER_MY_CHAN", headers=auth_headers_a)
    assert res.status_code == 200
    data = res.json()

    assert data["userChannelTitle"] == "My Studio Channel"
    assert data["competitorTitle"] == "Tech Lead Pro"

    # Verify metrics list
    metric_keys = [m["metricKey"] for m in data["metrics"]]
    assert "subscribers" in metric_keys
    assert "lifetime_views" in metric_keys
    assert "video_count" in metric_keys
    assert "avg_views_per_video" in metric_keys

    # Verify strict disclosure on private CTR and audience overlap
    assert "click-through rate" in data["privateDataDisclosure"].lower()
    assert "audience overlap" in data["privateDataDisclosure"].lower()

    # Ensure no fabricated CTR or fake audience overlap percentage is claimed
    for m in data["metrics"]:
        assert m["metricKey"] not in ("ctr", "audience_overlap", "viewer_overlap")


def test_thumbnail_resolution_fallback_and_normalization():
    """Verify deterministic fallback chain and https normalization for competitor profile pictures."""
    from app.services.competitor import extract_best_thumbnail_url, normalize_thumbnail_url

    # 1. Normalization tests
    assert normalize_thumbnail_url(None) is None
    assert normalize_thumbnail_url("") is None
    assert normalize_thumbnail_url("   ") is None
    assert normalize_thumbnail_url("//yt3.ggpht.com/avatar=s88-c-k-c0x00ffffff-no-rj") == (
        "https://yt3.ggpht.com/avatar=s88-c-k-c0x00ffffff-no-rj"
    )
    assert normalize_thumbnail_url("http://yt3.ggpht.com/avatar=s88-c-k-c0x00ffffff-no-rj") == (
        "https://yt3.ggpht.com/avatar=s88-c-k-c0x00ffffff-no-rj"
    )
    assert normalize_thumbnail_url("https://yt3.ggpht.com/avatar=s88-c-k-c0x00ffffff-no-rj") == (
        "https://yt3.ggpht.com/avatar=s88-c-k-c0x00ffffff-no-rj"
    )

    # 2. Preference for 'high' resolution
    full_thumbs = {
        "default": {"url": "https://yt3.ggpht.com/default.jpg", "width": 88, "height": 88},
        "medium": {"url": "https://yt3.ggpht.com/medium.jpg", "width": 240, "height": 240},
        "high": {"url": "https://yt3.ggpht.com/high.jpg", "width": 800, "height": 800},
    }
    assert extract_best_thumbnail_url(full_thumbs) == "https://yt3.ggpht.com/high.jpg"

    # 3. Fallback to 'medium' if 'high' is missing
    no_high = {
        "default": {"url": "https://yt3.ggpht.com/default.jpg"},
        "medium": {"url": "https://yt3.ggpht.com/medium.jpg"},
    }
    assert extract_best_thumbnail_url(no_high) == "https://yt3.ggpht.com/medium.jpg"

    # 4. Fallback to 'default' if 'high' and 'medium' are missing
    only_default = {
        "default": {"url": "https://yt3.ggpht.com/default.jpg"},
    }
    assert extract_best_thumbnail_url(only_default) == "https://yt3.ggpht.com/default.jpg"

    # 5. Protocol-relative URL normalized to https
    proto_relative = {
        "high": {"url": "//yt3.ggpht.com/high_proto.jpg"},
    }
    assert extract_best_thumbnail_url(proto_relative) == "https://yt3.ggpht.com/high_proto.jpg"

    # 6. Fallback URL used when thumbnails dict is empty or missing
    assert extract_best_thumbnail_url({}, fallback_url="https://example.com/fallback.jpg") == (
        "https://example.com/fallback.jpg"
    )
    assert extract_best_thumbnail_url(None, fallback_url="//example.com/fallback.jpg") == (
        "https://example.com/fallback.jpg"
    )
    assert extract_best_thumbnail_url(None) is None
