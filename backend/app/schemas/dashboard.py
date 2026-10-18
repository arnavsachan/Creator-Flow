from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

DataState = Literal["DEMO", "LIVE", "STALE", "UNAVAILABLE"]


class CamelModel(BaseModel):
    """
    Base model enforcing camelCase serialization for frontend JSON contract
    while allowing Pythonic snake_case internal field names and kwargs.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class KpiMetric(CamelModel):
    title: str
    value: float | int
    formatted_value: str
    change: float | int
    formatted_change: str
    trend: Literal["up", "down", "neutral"] = "neutral"
    change_period: str = "vs previous 28d"
    sparkline_points: list[float | int] = Field(default_factory=list)


class DashboardKpis(CamelModel):
    total_views: KpiMetric
    net_subscribers: KpiMetric
    watch_time_hours: KpiMetric
    estimated_partner_revenue: Optional[KpiMetric] = None


class VelocityChartPoint(CamelModel):
    date: str
    views: int
    watch_time: int
    subscribers: int


class ActionableInsight(CamelModel):
    id: str
    type: str
    title: str
    badge_label: str
    description: str
    action_text: str
    action_url: str


class RecentVideoItem(CamelModel):
    id: str
    title: str
    published: str
    views: int
    formatted_views: str
    avd: str
    ctr: str
    raw_ctr: Optional[float] = None
    ctr_status: Literal["high", "normal", "low"]
    thumbnail_url: Optional[str] = None


class PipelineItem(CamelModel):
    id: Optional[str] = None
    title: str
    format: Literal["Long-form", "Short"]
    stage: Literal["Idea", "Scripting", "Editing", "Ready"]
    scheduled_date: str


class DashboardOverviewData(CamelModel):
    channel_id: str
    kpis: DashboardKpis
    velocity_chart: list[VelocityChartPoint] = Field(default_factory=list)
    actionable_insights: list[ActionableInsight] = Field(default_factory=list)
    recent_videos: list[RecentVideoItem] = Field(default_factory=list)
    content_pipeline: list[PipelineItem] = Field(default_factory=list)


class DashboardOverviewResponse(BaseModel):
    """
    Standard data-state envelope matching frontend EnvelopeResponse<T>.
    Top-level fields preserve exact snake_case property keys (data_state,
    last_synced_at) while child payload conforms to camelCase.
    """

    model_config = ConfigDict(populate_by_name=True)

    data_state: DataState = Field(default="DEMO", serialization_alias="data_state")
    last_synced_at: Optional[str] = Field(default=None, serialization_alias="last_synced_at")
    message: Optional[str] = None
    data: Optional[DashboardOverviewData] = None


class ErrorDetail(BaseModel):
    detail: str
