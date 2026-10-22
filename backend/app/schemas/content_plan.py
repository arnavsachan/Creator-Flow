from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

ContentType = Literal["Long-form", "Short", "Community Post", "Livestream", "Reel"]
ContentStage = Literal["Idea", "Scripting", "Editing", "Ready", "Published"]
PlatformType = Literal["youtube", "shorts", "twitter", "linkedin", "tiktok", "instagram"]


class ContentPlanBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Title of the planned video or post")
    description: Optional[str] = Field(default=None, description="Detailed outline or script notes")
    content_type: str = Field(default="Long-form", description="Type of content (Long-form, Short, etc.)")
    platform: str = Field(default="youtube", description="Target distribution platform")
    stage: str = Field(default="Idea", description="Current production pipeline stage")
    scheduled_at: datetime = Field(..., description="Target release date and time (ISO 8601)")
    notes: Optional[str] = Field(default=None, description="Internal creator production notes")
    channel_id: Optional[str] = Field(default=None, description="Associated YouTube or social channel ID")
    video_id: Optional[str] = Field(default=None, description="Optional YouTube video ID if already linked/published")


class ContentPlanCreate(ContentPlanBase):
    pass


class ContentPlanUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    content_type: Optional[str] = None
    platform: Optional[str] = None
    stage: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    notes: Optional[str] = None
    channel_id: Optional[str] = None
    video_id: Optional[str] = None


class ContentPlanResponse(ContentPlanBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime


class ContentCalendarItem(BaseModel):
    """
    Unified representation of either planned items or confirmed published YouTube videos
    for calendar month/week visualization.
    """
    id: str
    item_type: Literal["planned", "published"] = Field(..., description="Whether this is a user plan or verified published video")
    title: str
    description: Optional[str] = None
    content_type: str = "Long-form"
    platform: str = "youtube"
    stage: str = "Idea"
    date: datetime = Field(..., description="Scheduled date for planned items, or publishedAt for live videos")
    video_id: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration: Optional[str] = None
    view_count: Optional[int] = None
    like_count: Optional[int] = None
    notes: Optional[str] = None
    channel_id: Optional[str] = None
    is_live_verified: bool = False


class ContentCalendarResponse(BaseModel):
    items: list[ContentCalendarItem] = Field(default_factory=list)
    total_planned: int = 0
    total_published: int = 0
    stage_counts: dict[str, int] = Field(default_factory=dict)
    channel_id: Optional[str] = None
