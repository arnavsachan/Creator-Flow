from datetime import date, datetime

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.dashboard import (
    DashboardOverviewResponse,
)
from app.services.dashboard import (
    DEFAULT_CHANNEL_ID,
    SUPPORTED_CHANNEL_IDS,
    build_empty_dashboard_data,
)


def test_dashboard_overview_default_channel(client: TestClient):
    """
    GET /api/v1/dashboard/overview without channel_id returns 200 DEMO data for demo-channel-1.
    """
    response = client.get("/api/v1/dashboard/overview")
    assert response.status_code == 200
    body = response.json()

    # Standard envelope assertions
    assert "data_state" in body
    assert "last_synced_at" in body
    assert "message" in body
    assert "data" in body
    assert body["data_state"] == "DEMO"
    assert body["data"]["channelId"] == DEFAULT_CHANNEL_ID


def test_dashboard_overview_explicit_supported_channels(client: TestClient):
    """
    GET /api/v1/dashboard/overview?channel_id=<channel> returns 200 for all UI-supported channels.
    """
    for ch_id in SUPPORTED_CHANNEL_IDS:
        response = client.get(f"/api/v1/dashboard/overview?channel_id={ch_id}")
        assert response.status_code == 200
        body = response.json()
        assert body["data_state"] == "DEMO"
        assert body["data"]["channelId"] == ch_id


def test_dashboard_overview_unknown_channel_404(client: TestClient):
    """
    GET /api/v1/dashboard/overview?channel_id=unknown-xyz returns 404 with documented error detail.
    """
    response = client.get("/api/v1/dashboard/overview?channel_id=unknown-xyz")
    assert response.status_code == 404
    body = response.json()
    assert "detail" in body
    assert "unknown-xyz" in body["detail"]


def test_dashboard_camelcase_serialization(client: TestClient):
    """
    Verify that the JSON response payload adheres strictly to camelCase field names
    matching the frontend TypeScript expectations.
    """
    response = client.get("/api/v1/dashboard/overview")
    assert response.status_code == 200
    data = response.json()["data"]

    # Root data fields
    assert "channelId" in data
    assert "velocityChart" in data
    assert "actionableInsights" in data
    assert "recentVideos" in data
    assert "contentPipeline" in data

    # KPIs camelCase
    kpis = data["kpis"]
    assert "totalViews" in kpis
    assert "netSubscribers" in kpis
    assert "watchTimeHours" in kpis
    assert "estimatedPartnerRevenue" in kpis

    view_kpi = kpis["totalViews"]
    assert "formattedValue" in view_kpi
    assert "formattedChange" in view_kpi
    assert "changePeriod" in view_kpi
    assert "sparklinePoints" in view_kpi

    # Velocity chart camelCase
    chart_point = data["velocityChart"][0]
    assert "watchTime" in chart_point
    assert "views" in chart_point
    assert "subscribers" in chart_point
    assert "date" in chart_point

    # Actionable insight camelCase
    insight = data["actionableInsights"][0]
    assert "badgeLabel" in insight
    assert "actionText" in insight
    assert "actionUrl" in insight

    # Recent videos camelCase
    video = data["recentVideos"][0]
    assert "formattedViews" in video
    assert "ctrStatus" in video
    assert "rawCtr" in video
    assert "thumbnailUrl" in video

    # Content pipeline camelCase
    pipeline = data["contentPipeline"][0]
    assert "scheduledDate" in pipeline


def test_dashboard_raw_numeric_metrics(client: TestClient):
    """
    Metrics must remain raw numbers for mathematical calculations.
    """
    response = client.get("/api/v1/dashboard/overview")
    data = response.json()["data"]

    # KPI values must be numeric
    assert isinstance(data["kpis"]["totalViews"]["value"], (int, float))
    assert data["kpis"]["totalViews"]["value"] == 1428900
    assert isinstance(data["kpis"]["totalViews"]["change"], (int, float))
    assert data["kpis"]["totalViews"]["change"] == 18.4

    # Recent video raw views must be integer
    first_vid = data["recentVideos"][0]
    assert isinstance(first_vid["views"], int)
    assert first_vid["views"] == 142850
    assert isinstance(first_vid["rawCtr"], (int, float))
    assert first_vid["rawCtr"] == 8.4

    # Velocity chart values must be integers
    first_chart = data["velocityChart"][0]
    assert isinstance(first_chart["views"], int)
    assert isinstance(first_chart["watchTime"], int)
    assert isinstance(first_chart["subscribers"], int)


def test_relative_chart_dates_no_future_dates(client: TestClient):
    """
    Verify that velocity chart dates are generated relatively and never point to the future.
    """
    response = client.get("/api/v1/dashboard/overview")
    chart = response.json()["data"]["velocityChart"]

    assert len(chart) == 10
    current_year = date.today().year

    parsed_dates = []
    for pt in chart:
        dt = datetime.strptime(f"{pt['date']} {current_year}", "%b %d %Y").date()
        parsed_dates.append(dt)

    # Dates must be sorted chronologically ascending
    assert parsed_dates == sorted(parsed_dates)

    # Last point must be <= today
    assert parsed_dates[-1] <= date.today()


def test_nullable_partner_revenue_in_empty_state():
    """
    Empty state schema properly allows null estimatedPartnerRevenue.
    """
    empty_data = build_empty_dashboard_data(channel_id="demo-channel-1")
    resp = DashboardOverviewResponse(
        data_state="DEMO",
        last_synced_at=None,
        message="Empty state",
        data=empty_data,
    )
    dumped = resp.model_dump(by_alias=True)

    assert dumped["data_state"] == "DEMO"
    assert dumped["data"]["kpis"]["estimatedPartnerRevenue"] is None
    assert dumped["data"]["velocityChart"] == []
    assert dumped["data"]["recentVideos"] == []


def test_existing_health_and_docs_unbroken(client: TestClient):
    """
    Verify that root /health, /health/ready, and openapi docs remain fully functional.
    """
    health_res = client.get("/health")
    assert health_res.status_code == 200
    assert health_res.json()["status"] == "ok"

    openapi_paths = list(app.openapi()["paths"].keys())
    assert "/health" in openapi_paths
    assert "/health/ready" in openapi_paths
    assert "/api/v1/dashboard/overview" in openapi_paths


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


def test_dashboard_overview_live_connected_channel(client: TestClient, db_session):
    """
    GET /api/v1/dashboard/overview?channel_id=<live_channel> returns 200 LIVE data
    with exact persisted database metrics for the connected channel.
    """
    from app.models.channel import ConnectedChannel
    from app.models.user import User

    # Create user and live channel in database
    user = User(id="user_live_test", email="live@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    live_ch = ConnectedChannel(
        id="chan_live_123",
        user_id="user_live_test",
        platform="youtube",
        channel_id="UC_LIVE_TEST_CH",
        title="Live Tech Lab",
        subscriber_count=43,
        video_count=13,
        view_count=11704,
        status="connected",
    )
    db_session.add(live_ch)
    db_session.commit()

    response = client.get("/api/v1/dashboard/overview?channel_id=UC_LIVE_TEST_CH")
    assert response.status_code == 200
    body = response.json()

    assert body["data_state"] == "LIVE"
    assert "Live Tech Lab" in body["message"]
    data = body["data"]
    assert data["channelId"] == "UC_LIVE_TEST_CH"
    assert data["kpis"]["totalViews"]["value"] == 11704
    assert data["kpis"]["totalViews"]["formattedValue"] == "11,704"
    assert data["kpis"]["totalViews"]["change"] is None
    assert data["kpis"]["totalViews"]["formattedChange"] is None
    assert data["kpis"]["totalViews"]["changePeriod"] == "Initial baseline snapshot"
    assert data["kpis"]["netSubscribers"]["value"] == 43
    assert data["kpis"]["netSubscribers"]["formattedValue"] == "43"
    assert data["kpis"]["netSubscribers"]["change"] is None
    assert data["kpis"]["netSubscribers"]["changePeriod"] == "Initial baseline snapshot"
    assert data["kpis"]["watchTimeHours"]["value"] == 13
    assert data["kpis"]["estimatedPartnerRevenue"] is None
    assert len(data["velocityChart"]) == 1
    assert data["velocityChart"][0]["views"] == 11704


def test_dashboard_overview_live_channel_with_snapshots_and_videos(client: TestClient, db_session):
    """
    GET /api/v1/dashboard/overview?channel_id=<live_channel>&days=28 returns
    populated velocity chart points and recent video uploads.
    """
    from datetime import datetime, timezone, timedelta
    from app.models.channel import ConnectedChannel
    from app.models.snapshot import ChannelSnapshot
    from app.models.video import ChannelVideo
    from app.models.user import User

    user = User(id="user_overview_sv", email="sv@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    live_ch = ConnectedChannel(
        id="chan_overview_sv",
        user_id="user_overview_sv",
        platform="youtube",
        channel_id="UC_OVERVIEW_SV",
        title="SV Studio",
        subscriber_count=50,
        video_count=3,
        view_count=12000,
        status="connected",
    )
    db_session.add(live_ch)

    now = datetime.now(timezone.utc)
    s1 = ChannelSnapshot(
        channel_id="UC_OVERVIEW_SV",
        snapshot_at=now - timedelta(days=10),
        subscriber_count=40,
        video_count=2,
        view_count=10000,
        sync_status="success",
    )
    s2 = ChannelSnapshot(
        channel_id="UC_OVERVIEW_SV",
        snapshot_at=now,
        subscriber_count=50,
        video_count=3,
        view_count=12000,
        sync_status="success",
    )
    v1 = ChannelVideo(
        channel_id="UC_OVERVIEW_SV",
        video_id="vid_sv_1",
        title="Autonomous AI Studio",
        published_at=now - timedelta(days=2),
        thumbnail_url="https://example.com/thumb1.jpg",
        view_count=6000,
        like_count=300,
        comment_count=40,
        last_synced_at=now,
    )
    db_session.add_all([s1, s2, v1])
    db_session.commit()

    response = client.get("/api/v1/dashboard/overview?channel_id=UC_OVERVIEW_SV&days=28")
    assert response.status_code == 200
    data = response.json()["data"]

    # Velocity chart has both snapshots
    assert len(data["velocityChart"]) == 2
    assert data["velocityChart"][0]["views"] == 10000
    assert data["velocityChart"][1]["views"] == 12000
    assert data["velocityChart"][1]["subscribers"] == 50

    # Recent videos has v1
    assert len(data["recentVideos"]) == 1
    assert data["recentVideos"][0]["id"] == "vid_sv_1"
    assert data["recentVideos"][0]["title"] == "Autonomous AI Studio"
    assert data["recentVideos"][0]["views"] == 6000
    assert data["recentVideos"][0]["formattedViews"] == "6,000"
    assert data["recentVideos"][0]["avd"] == "—"
    assert data["recentVideos"][0]["ctr"] == "—"


def test_dashboard_overview_live_snapshot_trajectory_and_failed_snapshot_filtering(client: TestClient, db_session):
    """
    Verifies that:
    1. Single baseline snapshot yields 1 chart point and 'Initial baseline snapshot' change period.
    2. Failed snapshots are excluded from the growth velocity trajectory.
    3. Adding a subsequent successful snapshot expands the chart to multiple points and computes velocity trends.
    """
    from datetime import datetime, timezone, timedelta
    from app.models.channel import ConnectedChannel
    from app.models.snapshot import ChannelSnapshot
    from app.models.user import User
    from app.services.youtube_oauth import record_channel_snapshot

    user = User(id="user_snap_filt", email="snapfilt@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    live_ch = ConnectedChannel(
        id="chan_snap_filt",
        user_id="user_snap_filt",
        platform="youtube",
        channel_id="UC_SNAP_FILT",
        title="Snapshot Filtering Studio",
        subscriber_count=100,
        video_count=10,
        view_count=5000,
        status="connected",
        last_synced_at=datetime.now(timezone.utc),
    )
    db_session.add(live_ch)
    db_session.commit()

    # 1. First snapshot (baseline)
    s1 = record_channel_snapshot(
        db=db_session,
        channel_id="UC_SNAP_FILT",
        subscriber_count=100,
        video_count=10,
        view_count=5000,
        sync_status="success",
    )
    # Also add a failed snapshot to test filtering
    s_failed = record_channel_snapshot(
        db=db_session,
        channel_id="UC_SNAP_FILT",
        subscriber_count=100,
        video_count=10,
        view_count=5000,
        sync_status="failed",
        error_message="API quota exceeded",
        cooldown_minutes=0,
    )

    res1 = client.get("/api/v1/dashboard/overview?channel_id=UC_SNAP_FILT&days=28")
    assert res1.status_code == 200
    data1 = res1.json()["data"]
    # Failed snapshot was filtered out, only 1 valid baseline point
    assert len(data1["velocityChart"]) == 1
    assert data1["kpis"]["totalViews"]["changePeriod"] == "Initial baseline snapshot"

    # 2. Subsequent successful sync snapshot outside cooldown
    now = datetime.now(timezone.utc)
    s2 = ChannelSnapshot(
        channel_id="UC_SNAP_FILT",
        snapshot_at=now + timedelta(minutes=20),
        subscriber_count=110,
        video_count=11,
        view_count=6000,
        sync_status="success",
    )
    db_session.add(s2)
    db_session.commit()

    res2 = client.get("/api/v1/dashboard/overview?channel_id=UC_SNAP_FILT&days=28")
    assert res2.status_code == 200
    data2 = res2.json()["data"]
    # Now 2 points in growth velocity trajectory
    assert len(data2["velocityChart"]) == 2
    assert data2["velocityChart"][0]["views"] == 5000
    assert data2["velocityChart"][1]["views"] == 6000
    assert data2["kpis"]["totalViews"]["change"] == 20.0
    assert data2["kpis"]["totalViews"]["trend"] == "up"
    # When multiple snapshots occur on the same day, time is included to prevent misleading identical axis labels
    assert data2["velocityChart"][0]["date"] != data2["velocityChart"][1]["date"]
    assert ":" in data2["velocityChart"][0]["date"]


def test_dashboard_overview_date_range_filtering_and_demo_scaling(client: TestClient, db_session):
    """
    Verifies that:
    1. Demo channel scales velocity chart points and KPI change periods for 7d, 28d, 90d, 365d.
    2. Live channel strictly filters snapshots according to the requested days parameter.
    """
    from datetime import datetime, timezone, timedelta
    from app.models.channel import ConnectedChannel
    from app.models.snapshot import ChannelSnapshot
    from app.models.user import User

    # 1. Demo channel with various ranges
    res_7d = client.get("/api/v1/dashboard/overview?channel_id=demo-channel-1&days=7")
    assert res_7d.status_code == 200
    data_7d = res_7d.json()["data"]
    assert data_7d["kpis"]["totalViews"]["changePeriod"] == "vs previous 7d"
    assert len(data_7d["velocityChart"]) == 10

    res_90d = client.get("/api/v1/dashboard/overview?channel_id=demo-channel-1&days=90")
    assert res_90d.status_code == 200
    data_90d = res_90d.json()["data"]
    assert data_90d["kpis"]["totalViews"]["changePeriod"] == "vs previous 90d"
    # Oldest point in 90d should have a date different from 7d
    assert data_90d["velocityChart"][0]["date"] != data_7d["velocityChart"][0]["date"]

    # 2. Live channel with historical snapshots across different ranges
    user = User(id="user_range_test", email="range@example.com", is_active=True)
    db_session.add(user)
    db_session.commit()

    live_ch = ConnectedChannel(
        id="chan_range_test",
        user_id="user_range_test",
        platform="youtube",
        channel_id="UC_RANGE_TEST",
        title="Range Testing Channel",
        subscriber_count=200,
        video_count=20,
        view_count=8000,
        status="connected",
    )
    db_session.add(live_ch)

    now = datetime.now(timezone.utc)
    # Old snapshot: 50 days ago
    s_old = ChannelSnapshot(
        channel_id="UC_RANGE_TEST",
        snapshot_at=now - timedelta(days=50),
        subscriber_count=150,
        video_count=15,
        view_count=6000,
        sync_status="success",
    )
    # Mid snapshot: 15 days ago
    s_mid = ChannelSnapshot(
        channel_id="UC_RANGE_TEST",
        snapshot_at=now - timedelta(days=15),
        subscriber_count=180,
        video_count=18,
        view_count=7000,
        sync_status="success",
    )
    # Recent snapshot: 2 days ago
    s_recent = ChannelSnapshot(
        channel_id="UC_RANGE_TEST",
        snapshot_at=now - timedelta(days=2),
        subscriber_count=200,
        video_count=20,
        view_count=8000,
        sync_status="success",
    )
    db_session.add_all([s_old, s_mid, s_recent])
    db_session.commit()

    # 7d lookback -> only s_recent (1 point -> baseline changePeriod)
    r7 = client.get("/api/v1/dashboard/overview?channel_id=UC_RANGE_TEST&days=7")
    assert r7.status_code == 200
    d7 = r7.json()["data"]
    assert len(d7["velocityChart"]) == 1
    assert d7["velocityChart"][0]["views"] == 8000

    # 28d lookback -> s_mid and s_recent (2 points)
    r28 = client.get("/api/v1/dashboard/overview?channel_id=UC_RANGE_TEST&days=28")
    assert r28.status_code == 200
    d28 = r28.json()["data"]
    assert len(d28["velocityChart"]) == 2
    assert d28["velocityChart"][0]["views"] == 7000
    assert d28["velocityChart"][1]["views"] == 8000
    assert d28["kpis"]["totalViews"]["changePeriod"] == "vs previous 28d"

    # 90d lookback -> s_old, s_mid, s_recent (3 points)
    r90 = client.get("/api/v1/dashboard/overview?channel_id=UC_RANGE_TEST&days=90")
    assert r90.status_code == 200
    d90 = r90.json()["data"]
    assert len(d90["velocityChart"]) == 3
    assert d90["velocityChart"][0]["views"] == 6000
    assert d90["velocityChart"][1]["views"] == 7000
    assert d90["velocityChart"][2]["views"] == 8000
    assert d90["kpis"]["totalViews"]["changePeriod"] == "vs previous 90d"
