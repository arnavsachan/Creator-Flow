from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Query, status

from app.schemas.dashboard import (
    ActionableInsight,
    DashboardMetrics,
    DashboardOverviewData,
    DashboardOverviewResponse,
    KpiMetric,
    PerformanceChartPoint,
    PipelineItem,
    RecentVideoItem,
)

router = APIRouter(tags=["Dashboard"])


@router.get(
    "/overview",
    response_model=DashboardOverviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Dashboard Overview Metrics",
    description="Returns aggregated channel metrics, performance chart data, and active workflow summaries for the dashboard.",
)
def get_dashboard_overview(
    channel_id: Optional[str] = Query(
        default="demo-channel-1",
        description="Target YouTube channel identifier",
    ),
) -> DashboardOverviewResponse:
    """
    Phase 1.5 API Integration Endpoint.
    Returns structured sample/demo telemetry data for the Creator-Flow dashboard.
    Preserves clean schema boundary for database-backed telemetry in subsequent phases.
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    metrics = DashboardMetrics(
        totalViews=KpiMetric(
            title="Total Views",
            value="1,428,900",
            change="+18.4%",
            trend="up",
            changePeriod="vs previous 28d",
            sparklinePoints=[28, 32, 30, 42, 45, 50, 48, 62, 70, 68, 82],
        ),
        netSubscribers=KpiMetric(
            title="Net Subscribers",
            value="+4,820",
            change="+12.6%",
            trend="up",
            changePeriod="vs previous 28d",
            sparklinePoints=[10, 14, 12, 19, 22, 25, 29, 31, 38, 42, 48],
        ),
        watchTime=KpiMetric(
            title="Watch Time (hrs)",
            value="48,250",
            change="+24.1%",
            trend="up",
            changePeriod="vs previous 28d",
            sparklinePoints=[35, 38, 42, 40, 52, 58, 62, 60, 72, 79, 85],
        ),
        estimatedRevenue=KpiMetric(
            title="Est. Partner Revenue",
            value="$3,842.10",
            change="-2.1%",
            trend="down",
            changePeriod="RPM $3.42",
            sparklinePoints=[45, 48, 50, 47, 44, 46, 42, 40, 43, 41, 39],
        ),
    )

    chart_data = [
        PerformanceChartPoint(date="Oct 01", views=34200, watchTime=1820, subscribers=120),
        PerformanceChartPoint(date="Oct 04", views=42100, watchTime=2190, subscribers=195),
        PerformanceChartPoint(date="Oct 07", views=38900, watchTime=1980, subscribers=160),
        PerformanceChartPoint(date="Oct 10", views=56400, watchTime=3120, subscribers=310),
        PerformanceChartPoint(date="Oct 13", views=68900, watchTime=3840, subscribers=420),
        PerformanceChartPoint(date="Oct 16", views=61200, watchTime=3410, subscribers=380),
        PerformanceChartPoint(date="Oct 19", views=78500, watchTime=4620, subscribers=560),
        PerformanceChartPoint(date="Oct 22", views=92400, watchTime=5410, subscribers=690),
        PerformanceChartPoint(date="Oct 25", views=88100, watchTime=5120, subscribers=610),
        PerformanceChartPoint(date="Oct 28", views=104200, watchTime=6240, subscribers=780),
    ]

    insights = [
        ActionableInsight(
            id="insight-1",
            type="retention",
            title="High Retention Outlier",
            badge="+38% Hook",
            description="'AI Agents Fail in Prod' held 72% at 0:30 vs 44% baseline.",
            action_label="Clip into High-CTR Short",
            action_href="/shorts-generator",
        ),
        ActionableInsight(
            id="insight-2",
            type="ctr",
            title="Thumbnail CTR Decay",
            badge="-2.4% CTR",
            description="Impressions up 220% on 'Vector Search' but CTR dropped to 4.8%.",
            action_label="Audit Thumbnail Contrast",
            action_href="/thumbnail-analyzer",
        ),
        ActionableInsight(
            id="insight-3",
            type="keyword",
            title="Unexploited Keyword Gap",
            badge="High Demand",
            description="Competitors gaining search share on 'Local LLM Agent RAG'.",
            action_label="Generate Hook in Script Studio",
            action_href="/script-generator",
        ),
    ]

    recent_videos = [
        RecentVideoItem(
            id="vid-1",
            title="Why 90% of AI Agents Fail in Production (System Architecture)",
            published="3 days ago",
            views="142,850",
            avd="8:42 (62%)",
            ctr="8.4%",
            ctrStatus="high",
        ),
        RecentVideoItem(
            id="vid-2",
            title="We Built an Autonomous YouTube Studio in 48 Hours",
            published="1 week ago",
            views="98,420",
            avd="7:15 (54%)",
            ctr="6.9%",
            ctrStatus="high",
        ),
        RecentVideoItem(
            id="vid-3",
            title="Stop Using Basic Prompting: Vector Graph Search Explained",
            published="2 weeks ago",
            views="76,190",
            avd="5:30 (41%)",
            ctr="4.8%",
            ctrStatus="normal",
        ),
        RecentVideoItem(
            id="vid-4",
            title="Python vs Rust for Real-time Video Ingestion Pipelines",
            published="3 weeks ago",
            views="64,300",
            avd="6:50 (49%)",
            ctr="5.2%",
            ctrStatus="normal",
        ),
        RecentVideoItem(
            id="vid-5",
            title="The Clean Monorepo Architecture Blueprint for 2026",
            published="1 month ago",
            views="112,040",
            avd="9:12 (68%)",
            ctr="7.8%",
            ctrStatus="high",
        ),
    ]

    pipeline_items = [
        PipelineItem(
            title="Building a Multi-Agent YouTube Production Engine",
            format="Long-form",
            stage="Scripting",
            scheduledDate="Tomorrow, 14:00",
        ),
        PipelineItem(
            title="3 Mistakes Ruining Your Video Retention Hook",
            format="Short",
            stage="Ready",
            scheduledDate="Oct 20, 18:30",
        ),
        PipelineItem(
            title="Creator Economy Monetization Math Breakdown",
            format="Long-form",
            stage="Editing",
            scheduledDate="Oct 22, 16:00",
        ),
        PipelineItem(
            title="FastAPI vs Node for YouTube Data Webhooks",
            format="Long-form",
            stage="Idea",
            scheduledDate="Oct 26",
        ),
    ]

    overview_data = DashboardOverviewData(
        channel_id=channel_id or "demo-channel-1",
        metrics=metrics,
        chart_data=chart_data,
        insights=insights,
        recent_videos=recent_videos,
        pipeline_items=pipeline_items,
    )

    return DashboardOverviewResponse(
        data=overview_data,
        data_state="DEMO",
        last_synced_at=now_iso,
        message="Demo summary metrics for Phase 1.5 frontend integration",
    )
