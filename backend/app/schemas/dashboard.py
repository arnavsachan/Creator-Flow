from typing import Literal, Optional
from pydantic import BaseModel, Field


class KpiMetric(BaseModel):
    title: str
    value: str
    change: Optional[str] = None
    trend: Literal["up", "down", "neutral"] = "neutral"
    changePeriod: str = "vs previous 28d"
    sparklinePoints: list[float] = Field(default_factory=list)


class DashboardMetrics(BaseModel):
    totalViews: KpiMetric
    netSubscribers: KpiMetric
    watchTime: KpiMetric
    estimatedRevenue: KpiMetric


class PerformanceChartPoint(BaseModel):
    date: str
    views: int
    watchTime: int
    subscribers: int


class ActionableInsight(BaseModel):
    id: str
    type: str
    title: str
    badge: str
    description: str
    action_label: str
    action_href: str


class RecentVideoItem(BaseModel):
    id: str
    title: str
    published: str
    views: str
    avd: str
    ctr: str
    ctrStatus: Literal["high", "normal", "low"]


class PipelineItem(BaseModel):
    title: str
    format: Literal["Long-form", "Short"]
    stage: Literal["Idea", "Scripting", "Editing", "Ready"]
    scheduledDate: str


class DashboardOverviewData(BaseModel):
    channel_id: str
    metrics: DashboardMetrics
    chart_data: list[PerformanceChartPoint]
    insights: list[ActionableInsight]
    recent_videos: list[RecentVideoItem]
    pipeline_items: list[PipelineItem]


class DashboardOverviewResponse(BaseModel):
    data: DashboardOverviewData
    data_state: Literal["DEMO", "LIVE", "STALE", "UNAVAILABLE"] = "DEMO"
    last_synced_at: Optional[str] = None
    message: Optional[str] = None
