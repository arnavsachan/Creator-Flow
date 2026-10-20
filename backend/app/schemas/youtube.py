from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """
    Base model allowing Python snake_case kwargs while serializing to camelCase
    for frontend JavaScript/TypeScript consistency.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class OAuthStartResponse(CamelModel):
    authorization_url: str
    state: str


class OAuthCallbackRequest(BaseModel):
    code: str
    state: str


class ConnectedChannelResponse(CamelModel):
    id: str
    channel_id: str
    title: str
    custom_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    subscriber_count: int = 0
    video_count: int = 0
    view_count: int = 0
    status: str
    connected_at: datetime
    last_synced_at: datetime


class ConnectionStatusResponse(CamelModel):
    connected: bool
    channel: Optional[ConnectedChannelResponse] = None


class DisconnectResponse(CamelModel):
    success: bool
    message: str


class OAuthErrorDetail(BaseModel):
    code: str
    message: str
    detail: Optional[str] = None


class TrafficSourceItem(CamelModel):
    source: str
    views: int
    percentage: str
    change: str


class RetentionPoint(CamelModel):
    timestamp: str
    long_form: float
    short_form: float


class AnalyticsTelemetryResponse(CamelModel):
    channel_id: str
    data_state: str
    is_live: bool
    title: str
    total_views: int
    total_subscribers: int
    total_videos: int
    traffic_sources: Optional[list[TrafficSourceItem]] = None
    retention_chart: Optional[list[RetentionPoint]] = None
    scope_limitation_notice: Optional[str] = None


class GeographicViewerItem(CamelModel):
    country: str
    share: str
    viewers: str


class AudienceTelemetryResponse(CamelModel):
    channel_id: str
    data_state: str
    is_live: bool
    title: str
    subscribers: int
    total_views: int
    uploads: int
    returning_viewers_rate: Optional[str] = None
    subscriber_conversion_rate: Optional[str] = None
    optimal_release_window: Optional[str] = None
    top_countries: Optional[list[GeographicViewerItem]] = None
    scope_limitation_notice: Optional[str] = None


class ChannelSnapshotItem(CamelModel):
    id: str
    channel_id: str
    snapshot_at: str
    subscriber_count: int
    video_count: int
    view_count: int
    sync_status: str
    error_message: Optional[str] = None


class ChannelHistoryResponse(CamelModel):
    channel_id: str
    data_state: str
    days: int
    snapshots: list[ChannelSnapshotItem]
    message: Optional[str] = None


class ChannelVideoItem(CamelModel):
    id: str
    channel_id: str
    video_id: str
    title: str
    published_at: str
    relative_published: str
    thumbnail_url: Optional[str] = None
    view_count: int
    like_count: Optional[int] = None
    comment_count: Optional[int] = None
    last_synced_at: str


class ChannelVideosResponse(CamelModel):
    channel_id: str
    data_state: str
    videos: list[ChannelVideoItem]
    message: Optional[str] = None
