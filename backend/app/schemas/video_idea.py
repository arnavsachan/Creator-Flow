from datetime import datetime
import json
from typing import Any, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

ContentFormatType = Literal["long_form", "shorts"]


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


# --- Generation Schemas ---

class GenerateIdeasRequest(CamelModel):
    topic: str = Field(..., min_length=2, max_length=500, description="Topic, theme, or seed keyword")
    niche: Optional[str] = Field(default=None, max_length=255, description="Channel niche or category")
    target_audience: Optional[str] = Field(default=None, max_length=255, description="Intended viewer persona")
    language: str = Field(default="English", max_length=50, description="Content language")
    platform: str = Field(default="YouTube", max_length=50, description="Target platform")
    content_format: ContentFormatType = Field(default="long_form", description="Content format: long_form or shorts")
    tone: Optional[str] = Field(default=None, max_length=100, description="Tone: e.g. Conversational, Authoritative, High Energy")
    content_goals: Optional[str] = Field(default=None, max_length=255, description="e.g. Audience Growth, High Engagement, Search Authority")
    channel_id: Optional[str] = Field(default=None, description="Optional channel ID context")
    count: int = Field(default=4, ge=1, le=10, description="Number of distinct ideas to generate")


class GeneratedIdeaItem(CamelModel):
    title: str = Field(..., description="Suggested video title")
    summary: str = Field(..., description="Short concept or summary breakdown")
    target_audience: str = Field(..., description="Target audience segment")
    hook: str = Field(..., description="Opening 5-second spoken hook line")
    primary_keyword: str = Field(..., description="Primary keyword suggestion")
    related_keywords: list[str] = Field(default_factory=list, description="AI-suggested related keywords")
    content_format: str = Field(default="long_form", description="Recommended content format")
    call_to_action: str = Field(..., description="Suggested call to action")
    angle: str = Field(..., description="Unique angle or premise")
    estimated_score: float = Field(..., ge=0, le=100, description="Estimated heuristic score (0-100)")
    score_explanation: str = Field(..., description="Explanation of what this heuristic score measures")


class GenerateIdeasResponse(CamelModel):
    topic: str
    ideas: list[GeneratedIdeaItem] = Field(default_factory=list)
    disclaimer: str = (
        "AI-generated suggestions and heuristic scores are for creative planning. "
        "They do not guarantee real-time search volume, YouTube rankings, or audience reach."
    )


class GenerateSeoRequest(CamelModel):
    title: str = Field(..., min_length=2, max_length=300, description="Video title or core concept to optimize")
    topic: Optional[str] = Field(default=None, max_length=500, description="Seed topic or context")
    summary: Optional[str] = Field(default=None, description="Short concept summary")
    target_audience: Optional[str] = Field(default=None, max_length=255, description="Target viewer persona")
    content_format: Optional[str] = Field(default="long_form", max_length=50, description="Video format")
    language: str = Field(default="English", max_length=50, description="Language")
    channel_id: Optional[str] = Field(default=None, description="Optional channel context")


class TitleVariation(CamelModel):
    title: str = Field(..., description="Alternative title phrasing")
    style: str = Field(..., description="Style archetype: e.g. curiosity, how-to, contrarian, high-impact")
    rationale: str = Field(..., description="Why this title variation attracts target viewers")


class GenerateSeoResponse(CamelModel):
    title: str
    title_variations: list[TitleVariation] = Field(default_factory=list)
    description: str = Field(..., description="SEO-optimized structured video description")
    tags: list[str] = Field(default_factory=list, description="Recommended video tags")
    hashtags: list[str] = Field(default_factory=list, description="Recommended hashtags with #")
    primary_keyword: str = Field(..., description="Primary focus keyword")
    secondary_keywords: list[str] = Field(default_factory=list, description="Secondary keyword suggestions")
    thumbnail_text_suggestions: list[str] = Field(default_factory=list, description="High-CTR short thumbnail text ideas")
    estimated_seo_score: float = Field(..., ge=0, le=100, description="Estimated heuristic SEO score")
    score_explanation: str = Field(..., description="Explanation of heuristic SEO criteria measured")
    optimization_rationale: str = Field(..., description="Why this metadata is structured for discoverability")
    disclaimer: str = (
        "Estimated heuristic score based on title clarity, keyword placement, and metadata completeness. "
        "Not a guaranteed YouTube search ranking or reach statistic."
    )


# --- Database Persistence Schemas ---

class VideoIdeaCreate(CamelModel):
    title: str = Field(..., min_length=1, max_length=255)
    summary: Optional[str] = None
    topic: str = Field(..., min_length=1, max_length=500)
    niche: Optional[str] = Field(default=None, max_length=255)
    target_audience: Optional[str] = Field(default=None, max_length=255)
    language: str = Field(default="English", max_length=50)
    platform: str = Field(default="YouTube", max_length=50)
    content_format: str = Field(default="long_form", max_length=50)
    tone: Optional[str] = Field(default=None, max_length=100)
    content_goals: Optional[str] = Field(default=None, max_length=255)
    hook: Optional[str] = None
    primary_keyword: Optional[str] = Field(default=None, max_length=255)
    related_keywords: Optional[list[str]] = None
    call_to_action: Optional[str] = None
    estimated_score: Optional[float] = None
    angle: Optional[str] = Field(default=None, max_length=255)
    is_favorite: bool = False
    status: str = Field(default="active", max_length=50)
    seo_data: Optional[dict[str, Any]] = None
    notes: Optional[str] = None
    channel_id: Optional[str] = Field(default=None, max_length=100)


class VideoIdeaUpdate(CamelModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    summary: Optional[str] = None
    topic: Optional[str] = Field(default=None, min_length=1, max_length=500)
    niche: Optional[str] = Field(default=None, max_length=255)
    target_audience: Optional[str] = Field(default=None, max_length=255)
    language: Optional[str] = Field(default=None, max_length=50)
    platform: Optional[str] = Field(default=None, max_length=50)
    content_format: Optional[str] = Field(default=None, max_length=50)
    tone: Optional[str] = Field(default=None, max_length=100)
    content_goals: Optional[str] = Field(default=None, max_length=255)
    hook: Optional[str] = None
    primary_keyword: Optional[str] = Field(default=None, max_length=255)
    related_keywords: Optional[list[str]] = None
    call_to_action: Optional[str] = None
    estimated_score: Optional[float] = None
    angle: Optional[str] = Field(default=None, max_length=255)
    is_favorite: Optional[bool] = None
    status: Optional[str] = Field(default=None, max_length=50)
    seo_data: Optional[dict[str, Any]] = None
    notes: Optional[str] = None


class VideoIdeaResponse(CamelModel):
    id: str
    user_id: str
    channel_id: Optional[str] = None
    title: str
    summary: Optional[str] = None
    topic: str
    niche: Optional[str] = None
    target_audience: Optional[str] = None
    language: str
    platform: str
    content_format: str
    tone: Optional[str] = None
    content_goals: Optional[str] = None
    hook: Optional[str] = None
    primary_keyword: Optional[str] = None
    related_keywords: list[str] = Field(default_factory=list)
    call_to_action: Optional[str] = None
    estimated_score: Optional[float] = None
    angle: Optional[str] = None
    is_favorite: bool
    status: str
    seo_data: Optional[dict[str, Any]] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm_model(cls, model: Any) -> "VideoIdeaResponse":
        # Parse JSON fields safely
        parsed_related: list[str] = []
        if model.related_keywords:
            try:
                data = json.loads(model.related_keywords)
                if isinstance(data, list):
                    parsed_related = [str(k) for k in data]
                elif isinstance(data, str):
                    parsed_related = [k.strip() for k in data.split(",") if k.strip()]
            except Exception:
                parsed_related = [k.strip() for k in model.related_keywords.split(",") if k.strip()]

        parsed_seo: Optional[dict[str, Any]] = None
        if model.seo_data:
            try:
                parsed_seo = json.loads(model.seo_data)
            except Exception:
                parsed_seo = None

        return cls(
            id=model.id,
            user_id=model.user_id,
            channel_id=model.channel_id,
            title=model.title,
            summary=model.summary,
            topic=model.topic,
            niche=model.niche,
            target_audience=model.target_audience,
            language=model.language,
            platform=model.platform,
            content_format=model.content_format,
            tone=model.tone,
            content_goals=model.content_goals,
            hook=model.hook,
            primary_keyword=model.primary_keyword,
            related_keywords=parsed_related,
            call_to_action=model.call_to_action,
            estimated_score=model.estimated_score,
            angle=model.angle,
            is_favorite=model.is_favorite,
            status=model.status,
            seo_data=parsed_seo,
            notes=model.notes,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
