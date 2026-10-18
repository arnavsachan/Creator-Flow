from datetime import date, datetime, timedelta, timezone
from typing import Optional

from app.schemas.dashboard import (
    ActionableInsight,
    DashboardKpis,
    DashboardOverviewData,
    DashboardOverviewResponse,
    KpiMetric,
    PipelineItem,
    RecentVideoItem,
    VelocityChartPoint,
)

DEFAULT_CHANNEL_ID = "demo-channel-1"
SUPPORTED_CHANNEL_IDS = {
    DEFAULT_CHANNEL_ID,
    "demo-channel-2",
    "uc-live-001",
}


def build_demo_chart_points(base_date: Optional[date] = None) -> list[VelocityChartPoint]:
    """
    Build 10 time-series points spanning the past 27 days up to base_date (today).
    Guarantees all points are strictly in the past or present, never in the future.
    """
    if base_date is None:
        base_date = datetime.now(timezone.utc).date()

    day_offsets = [27, 24, 21, 18, 15, 12, 9, 6, 3, 0]
    raw_series = [
        (34200, 1820, 120),
        (42100, 2190, 195),
        (38900, 1980, 160),
        (56400, 3120, 310),
        (68900, 3840, 420),
        (61200, 3410, 380),
        (78500, 4620, 560),
        (92400, 5410, 690),
        (88100, 5120, 610),
        (104200, 6240, 780),
    ]

    points: list[VelocityChartPoint] = []
    for offset, (views, watch_time, subscribers) in zip(day_offsets, raw_series):
        point_date = base_date - timedelta(days=offset)
        points.append(
            VelocityChartPoint(
                date=point_date.strftime("%b %d"),
                views=views,
                watch_time=watch_time,
                subscribers=subscribers,
            )
        )
    return points


def build_demo_kpis() -> DashboardKpis:
    return DashboardKpis(
        total_views=KpiMetric(
            title="Total Views",
            value=1428900,
            formatted_value="1,428,900",
            change=18.4,
            formatted_change="+18.4%",
            trend="up",
            change_period="vs previous 28d",
            sparkline_points=[28, 32, 30, 42, 45, 50, 48, 62, 70, 68, 82],
        ),
        net_subscribers=KpiMetric(
            title="Net Subscribers",
            value=4820,
            formatted_value="+4,820",
            change=12.6,
            formatted_change="+12.6%",
            trend="up",
            change_period="vs previous 28d",
            sparkline_points=[10, 14, 12, 19, 22, 25, 29, 31, 38, 42, 48],
        ),
        watch_time_hours=KpiMetric(
            title="Watch Time (hrs)",
            value=48250,
            formatted_value="48,250",
            change=24.1,
            formatted_change="+24.1%",
            trend="up",
            change_period="vs previous 28d",
            sparkline_points=[35, 38, 42, 40, 52, 58, 62, 60, 72, 79, 85],
        ),
        estimated_partner_revenue=KpiMetric(
            title="Est. Partner Revenue",
            value=3842.10,
            formatted_value="$3,842.10",
            change=-2.1,
            formatted_change="-2.1%",
            trend="down",
            change_period="RPM $3.42",
            sparkline_points=[45, 48, 50, 47, 44, 46, 42, 40, 43, 41, 39],
        ),
    )


def build_demo_insights() -> list[ActionableInsight]:
    return [
        ActionableInsight(
            id="ins-1",
            type="retention_outlier",
            title="High Retention Outlier",
            badge_label="+38% Hook",
            description="'Why 90% of AI Agents Fail' held 72% at 0:30 vs 44% baseline.",
            action_text="Clip into High-CTR Short",
            action_url="/shorts-generator",
        ),
        ActionableInsight(
            id="ins-2",
            type="ctr_decay",
            title="Thumbnail CTR Decay",
            badge_label="-2.4% CTR",
            description="Impressions up 220% on 'Vector Graph Search' but CTR dropped to 4.8%.",
            action_text="Audit Thumbnail Contrast",
            action_url="/thumbnail-analyzer",
        ),
        ActionableInsight(
            id="ins-3",
            type="keyword_gap",
            title="Unexploited Keyword Gap",
            badge_label="High Demand",
            description="Competitors gaining search share on 'Local LLM Agent RAG'.",
            action_text="Generate Hook in Script Studio",
            action_url="/script-generator",
        ),
    ]


def build_demo_recent_videos() -> list[RecentVideoItem]:
    return [
        RecentVideoItem(
            id="vid-1",
            title="Why 90% of AI Agents Fail in Production (System Architecture)",
            published="3 days ago",
            views=142850,
            formatted_views="142,850",
            avd="8:42 (62%)",
            ctr="8.4%",
            raw_ctr=8.4,
            ctr_status="high",
            thumbnail_url=None,
        ),
        RecentVideoItem(
            id="vid-2",
            title="We Built an Autonomous YouTube Studio in 48 Hours",
            published="1 week ago",
            views=98420,
            formatted_views="98,420",
            avd="7:15 (54%)",
            ctr="6.9%",
            raw_ctr=6.9,
            ctr_status="high",
            thumbnail_url=None,
        ),
        RecentVideoItem(
            id="vid-3",
            title="Stop Using Basic Prompting: Vector Graph Search Explained",
            published="2 weeks ago",
            views=76190,
            formatted_views="76,190",
            avd="5:30 (41%)",
            ctr="4.8%",
            raw_ctr=4.8,
            ctr_status="normal",
            thumbnail_url=None,
        ),
        RecentVideoItem(
            id="vid-4",
            title="Python vs Rust for Real-time Video Ingestion Pipelines",
            published="3 weeks ago",
            views=64300,
            formatted_views="64,300",
            avd="6:50 (49%)",
            ctr="5.2%",
            raw_ctr=5.2,
            ctr_status="normal",
            thumbnail_url=None,
        ),
        RecentVideoItem(
            id="vid-5",
            title="The Clean Monorepo Architecture Blueprint for 2026",
            published="1 month ago",
            views=112040,
            formatted_views="112,040",
            avd="9:12 (68%)",
            ctr="7.8%",
            raw_ctr=7.8,
            ctr_status="high",
            thumbnail_url=None,
        ),
    ]


def build_demo_pipeline_items() -> list[PipelineItem]:
    return [
        PipelineItem(
            id="pipe-1",
            title="Building a Multi-Agent YouTube Production Engine",
            format="Long-form",
            stage="Scripting",
            scheduled_date="Tomorrow, 14:00",
        ),
        PipelineItem(
            id="pipe-2",
            title="3 Mistakes Ruining Your Video Retention Hook",
            format="Short",
            stage="Ready",
            scheduled_date="In 2 days, 18:30",
        ),
        PipelineItem(
            id="pipe-3",
            title="Creator Economy Monetization Math Breakdown",
            format="Long-form",
            stage="Editing",
            scheduled_date="In 4 days, 16:00",
        ),
        PipelineItem(
            id="pipe-4",
            title="FastAPI vs Node for YouTube Data Webhooks",
            format="Long-form",
            stage="Idea",
            scheduled_date="In 8 days",
        ),
    ]


def build_empty_dashboard_data(channel_id: str) -> DashboardOverviewData:
    """
    Constructs empty-state data where partner revenue is nullable (None)
    and list arrays are empty, satisfying Requirement 9.
    """
    return DashboardOverviewData(
        channel_id=channel_id,
        kpis=DashboardKpis(
            total_views=KpiMetric(
                title="Total Views",
                value=0,
                formatted_value="0",
                change=0.0,
                formatted_change="0.0%",
                trend="neutral",
                change_period="vs previous 28d",
                sparkline_points=[],
            ),
            net_subscribers=KpiMetric(
                title="Net Subscribers",
                value=0,
                formatted_value="+0",
                change=0.0,
                formatted_change="0.0%",
                trend="neutral",
                change_period="vs previous 28d",
                sparkline_points=[],
            ),
            watch_time_hours=KpiMetric(
                title="Watch Time (hrs)",
                value=0,
                formatted_value="0",
                change=0.0,
                formatted_change="0.0%",
                trend="neutral",
                change_period="vs previous 28d",
                sparkline_points=[],
            ),
            estimated_partner_revenue=None,
        ),
        velocity_chart=[],
        actionable_insights=[],
        recent_videos=[],
        content_pipeline=[],
    )


def get_dashboard_overview(channel_id: Optional[str] = None) -> DashboardOverviewResponse:
    """
    Returns dashboard overview data in the standard data-state envelope.
    Supports registered channels ('demo-channel-1', 'demo-channel-2', 'uc-live-001').
    Raises ValueError for unknown channel IDs.
    """
    target_channel = (channel_id or DEFAULT_CHANNEL_ID).strip()

    if target_channel not in SUPPORTED_CHANNEL_IDS:
        raise ValueError(
            f"Channel '{target_channel}' not found. Supported channels: {sorted(list(SUPPORTED_CHANNEL_IDS))}."
        )

    overview_data = DashboardOverviewData(
        channel_id=target_channel,
        kpis=build_demo_kpis(),
        velocity_chart=build_demo_chart_points(),
        actionable_insights=build_demo_insights(),
        recent_videos=build_demo_recent_videos(),
        content_pipeline=build_demo_pipeline_items(),
    )

    return DashboardOverviewResponse(
        data_state="DEMO",
        last_synced_at=datetime.now(timezone.utc).isoformat(),
        message=f"Displaying synthetic demo telemetry for channel '{target_channel}'.",
        data=overview_data,
    )
