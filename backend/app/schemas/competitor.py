from datetime import datetime
from typing import Optional, Union
from pydantic import Field

from app.schemas.youtube import CamelModel


class CompetitorSearchResultItem(CamelModel):
    channel_id: str
    title: str
    description: Optional[str] = ""
    custom_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    subscriber_count: Optional[int] = None
    hidden_subscriber_count: bool = False
    video_count: int = 0
    view_count: int = 0
    is_tracked: bool = False


class CompetitorSearchResponse(CamelModel):
    query: str
    results: list[CompetitorSearchResultItem] = Field(default_factory=list)
    next_page_token: Optional[str] = None
    prev_page_token: Optional[str] = None
    total_results: int = 0
    data_state: str = "LIVE"
    authorization_url: Optional[str] = None
    message: Optional[str] = None


class CompetitorCreate(CamelModel):
    channel_id: str = Field(..., min_length=2, max_length=100)
    title: Optional[str] = None
    custom_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    primary_channel_id: Optional[str] = None
    notes: Optional[str] = None


class CompetitorResponse(CamelModel):
    id: str
    user_id: str
    channel_id: str
    title: str
    custom_url: Optional[str] = None
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    subscriber_count: Optional[int] = None
    hidden_subscriber_count: bool = False
    video_count: int = 0
    view_count: int = 0
    primary_channel_id: Optional[str] = None
    notes: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class CompetitorVideoItem(CamelModel):
    video_id: str
    channel_id: str
    title: str
    description: Optional[str] = ""
    published_at: str
    relative_published: str
    thumbnail_url: Optional[str] = None
    duration: Optional[str] = None
    duration_seconds: Optional[int] = None
    view_count: int = 0
    like_count: Optional[int] = None
    comment_count: Optional[int] = None
    youtube_url: str


class CompetitorUploadsResponse(CamelModel):
    competitor_id: str
    channel_id: str
    channel_title: str
    videos: list[CompetitorVideoItem] = Field(default_factory=list)
    total_results: int = 0
    next_page_token: Optional[str] = None
    message: Optional[str] = None


class ChannelMetricComparison(CamelModel):
    metric_key: str
    label: str
    user_value: Optional[Union[float, int, str]] = None
    competitor_value: Optional[Union[float, int, str]] = None
    diff_pct: Optional[float] = None
    note: Optional[str] = None


class CompetitorComparisonResponse(CamelModel):
    user_channel_id: str
    user_channel_title: str
    competitor_id: str
    competitor_channel_id: str
    competitor_title: str
    metrics: list[ChannelMetricComparison] = Field(default_factory=list)
    user_recent_videos: list[CompetitorVideoItem] = Field(default_factory=list)
    competitor_recent_videos: list[CompetitorVideoItem] = Field(default_factory=list)
    private_data_disclosure: str = (
        "Private metrics (such as impressions Click-Through Rate [CTR] and true shared-viewer audience overlap) "
        "are protected by YouTube and are only accessible by each channel owner through their private YouTube Analytics Partner API. "
        "Public comparisons are calculated strictly from public YouTube Data API v3 metadata, uploads playlists, and verifiable engagement telemetry."
    )
