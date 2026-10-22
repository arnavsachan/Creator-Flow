from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.models.channel import ConnectedChannel
from app.models.content_plan import ContentPlan
from app.models.user import User
from app.models.video import ChannelVideo


def create_test_user(db: Session, email: str = "creator@test.com") -> tuple[User, str]:
    user = User(
        email=email,
        hashed_password="mock_hashed_password",
        full_name="Creator User",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(data={"sub": user.id})
    return user, token


def test_content_plan_requires_authentication(client: TestClient):
    """Endpoints require valid authentication."""
    res = client.post("/api/v1/content-plans", json={"title": "Test Plan", "scheduled_at": datetime.now(timezone.utc).isoformat()})
    assert res.status_code == 401

    res_get = client.get("/api/v1/content-plans")
    assert res_get.status_code == 401


def test_create_content_plan_success(client: TestClient, db_session: Session):
    """POST /content-plans creates a plan successfully."""
    user, token = create_test_user(db_session, "user1@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    sched_time = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    payload = {
        "title": "Scaling SQLite to 10k QPS",
        "description": "Benchmark write-ahead logging and connection pools",
        "content_type": "Long-form",
        "platform": "youtube",
        "stage": "Scripting",
        "scheduled_at": sched_time,
        "notes": "Record B-roll of htop and metrics dashboard",
        "channel_id": "UC_TEST_1",
    }

    res = client.post("/api/v1/content-plans", json=payload, headers=headers)
    assert res.status_code == 201
    body = res.json()

    assert body["title"] == "Scaling SQLite to 10k QPS"
    assert body["stage"] == "Scripting"
    assert body["contentType"] == "Long-form" if "contentType" in body else body["content_type"] == "Long-form"
    assert body["userId"] == user.id if "userId" in body else body["user_id"] == user.id
    assert "id" in body


def test_create_content_plan_validation(client: TestClient, db_session: Session):
    """POST /content-plans validates required fields and length."""
    user, token = create_test_user(db_session, "user_val@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Empty title
    res = client.post(
        "/api/v1/content-plans",
        json={"title": "", "scheduled_at": datetime.now(timezone.utc).isoformat()},
        headers=headers,
    )
    assert res.status_code == 422


def test_list_content_plans_and_filtering(client: TestClient, db_session: Session):
    """GET /content-plans lists plans with channel and stage filters."""
    user, token = create_test_user(db_session, "filter_user@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    now = datetime.now(timezone.utc)
    # Create 3 plans
    p1 = ContentPlan(
        user_id=user.id,
        channel_id="UC_CHAN_A",
        title="Video A Idea",
        stage="Idea",
        scheduled_at=now + timedelta(days=1),
    )
    p2 = ContentPlan(
        user_id=user.id,
        channel_id="UC_CHAN_A",
        title="Video A Scripting",
        stage="Scripting",
        scheduled_at=now + timedelta(days=2),
    )
    p3 = ContentPlan(
        user_id=user.id,
        channel_id="UC_CHAN_B",
        title="Video B Ready",
        stage="Ready",
        scheduled_at=now + timedelta(days=4),
    )
    db_session.add_all([p1, p2, p3])
    db_session.commit()

    # List all
    res = client.get("/api/v1/content-plans", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) == 3

    # Filter by stage
    res_stage = client.get("/api/v1/content-plans?stage=Scripting", headers=headers)
    assert res_stage.status_code == 200
    data_stage = res_stage.json()
    assert len(data_stage) == 1
    assert data_stage[0]["title"] == "Video A Scripting"

    # Filter by channel
    res_chan = client.get("/api/v1/content-plans?channel_id=UC_CHAN_B", headers=headers)
    assert res_chan.status_code == 200
    data_chan = res_chan.json()
    assert len(data_chan) == 1
    assert data_chan[0]["title"] == "Video B Ready"


def test_update_and_delete_content_plan(client: TestClient, db_session: Session):
    """PATCH and DELETE /content-plans/{id}."""
    user, token = create_test_user(db_session, "crud_user@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    plan = ContentPlan(
        user_id=user.id,
        title="Initial Draft Title",
        stage="Idea",
        scheduled_at=datetime.now(timezone.utc) + timedelta(days=5),
    )
    db_session.add(plan)
    db_session.commit()

    # PATCH
    patch_res = client.patch(
        f"/api/v1/content-plans/{plan.id}",
        json={"title": "Updated Final Title", "stage": "Ready", "video_id": "yt_vid_999"},
        headers=headers,
    )
    assert patch_res.status_code == 200
    body = patch_res.json()
    assert body["title"] == "Updated Final Title"
    assert body["stage"] == "Ready"
    assert body.get("video_id") == "yt_vid_999" or body.get("videoId") == "yt_vid_999"

    # DELETE
    del_res = client.delete(f"/api/v1/content-plans/{plan.id}", headers=headers)
    assert del_res.status_code == 200

    # Verify 404 after delete
    get_res = client.get(f"/api/v1/content-plans/{plan.id}", headers=headers)
    assert get_res.status_code == 404


def test_multi_user_isolation(client: TestClient, db_session: Session):
    """Users cannot view, edit, or delete plans belonging to other users."""
    user_a, token_a = create_test_user(db_session, "user_a@test.com")
    user_b, token_b = create_test_user(db_session, "user_b@test.com")

    plan_a = ContentPlan(
        user_id=user_a.id,
        title="Secret Video for User A",
        stage="Idea",
        scheduled_at=datetime.now(timezone.utc) + timedelta(days=2),
    )
    db_session.add(plan_a)
    db_session.commit()

    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User B cannot get User A's plan
    res_get = client.get(f"/api/v1/content-plans/{plan_a.id}", headers=headers_b)
    assert res_get.status_code == 404

    # User B cannot update User A's plan
    res_patch = client.patch(f"/api/v1/content-plans/{plan_a.id}", json={"title": "Hacked"}, headers=headers_b)
    assert res_patch.status_code == 404

    # User B cannot delete User A's plan
    res_del = client.delete(f"/api/v1/content-plans/{plan_a.id}", headers=headers_b)
    assert res_del.status_code == 404


def test_calendar_view_combines_planned_and_published_videos(client: TestClient, db_session: Session):
    """GET /content-plans/calendar merges planned items with verified published videos."""
    user, token = create_test_user(db_session, "cal_user@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Setup connected channel for user
    channel = ConnectedChannel(
        user_id=user.id,
        channel_id="UC_CAL_LIVE",
        title="Live Tech Channel",
        status="connected",
        subscriber_count=1000,
        video_count=1,
        view_count=5000,
    )
    db_session.add(channel)
    db_session.commit()

    now = datetime.now(timezone.utc)

    # 1 Planned Item
    plan = ContentPlan(
        user_id=user.id,
        channel_id="UC_CAL_LIVE",
        title="Upcoming Agent Architecture Video",
        stage="Scripting",
        scheduled_at=now + timedelta(days=3),
    )
    # 1 Confirmed Published Video
    pub_vid = ChannelVideo(
        channel_id="UC_CAL_LIVE",
        video_id="vid_published_001",
        title="Released Production Video #1",
        published_at=now - timedelta(days=1),
        duration="12:30",
        duration_seconds=750,
        view_count=4200,
        like_count=350,
    )
    db_session.add_all([plan, pub_vid])
    db_session.commit()

    res = client.get("/api/v1/content-plans/calendar?channel_id=UC_CAL_LIVE", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["total_planned"] == 1
    assert data["total_published"] == 1
    items = data["items"]
    assert len(items) == 2

    # Check that published and planned items are cleanly distinguished
    types = {item["item_type"] for item in items}
    assert types == {"planned", "published"}

    published_item = next(it for it in items if it["item_type"] == "published")
    assert published_item["title"] == "Released Production Video #1"
    assert published_item["is_live_verified"] is True
    assert published_item["stage"] == "Published"

    planned_item = next(it for it in items if it["item_type"] == "planned")
    assert planned_item["title"] == "Upcoming Agent Architecture Video"
    assert planned_item["is_live_verified"] is False
    assert planned_item["stage"] == "Scripting"
