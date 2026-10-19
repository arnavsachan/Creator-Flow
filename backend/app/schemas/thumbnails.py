from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """
    Base model enforcing camelCase serialization for frontend JSON contract
    while allowing Pythonic snake_case internal field names.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class ImageMetadata(CamelModel):
    width: int
    height: int
    aspect_ratio: str
    file_format: str
    file_size_bytes: int
    is_recommended_resolution: bool


class ThumbnailCriterionScore(CamelModel):
    name: str
    score: int = Field(..., ge=0, le=100)
    grade: Literal["Excellent", "Good", "Needs Improvement", "Poor"]
    reasoning: str
    suggestions: list[str] = Field(default_factory=list)


class ThumbnailScoringRequest(CamelModel):
    image_base64: str = Field(..., min_length=10, description="Base64-encoded image string or data URL (e.g. data:image/png;base64,...)")
    filename: Optional[str] = Field(default=None, description="Original filename of the thumbnail")
    title: Optional[str] = Field(default=None, max_length=200, description="Optional proposed video title for alignment audit")
    topic: Optional[str] = Field(default=None, max_length=500, description="Optional video topic or niche context")


class ThumbnailScoringResponse(CamelModel):
    overall_score: int = Field(..., ge=0, le=100)
    grade: str
    focal_point: str
    contrast_ratio: str
    criteria: list[ThumbnailCriterionScore] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    metadata: ImageMetadata
    provider: str
    provider_note: str
    evaluated_at: str


class TitleCriterionScore(CamelModel):
    name: str
    score: int = Field(..., ge=0, le=100)
    grade: Literal["Excellent", "Good", "Needs Improvement", "Poor"]
    reasoning: str
    suggestions: list[str] = Field(default_factory=list)


class TitleScoringRequest(CamelModel):
    title: str = Field(..., min_length=1, max_length=200, description="Video title to evaluate")
    topic: Optional[str] = Field(default=None, max_length=500, description="Target topic or video niche")
    description: Optional[str] = Field(default=None, max_length=1000, description="Optional video synopsis or summary")
    thumbnail_context: Optional[str] = Field(default=None, max_length=500, description="Description of paired thumbnail elements")


class TitleScoringResponse(CamelModel):
    overall_score: int = Field(..., ge=0, le=100)
    grade: str
    clarity_score: int = Field(..., ge=0, le=100)
    specificity_score: int = Field(..., ge=0, le=100)
    curiosity_score: int = Field(..., ge=0, le=100)
    readability_score: int = Field(..., ge=0, le=100)
    relevance_score: Optional[int] = Field(default=None, ge=0, le=100)
    criteria: list[TitleCriterionScore] = Field(default_factory=list)
    explanations: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    alternative_titles: list[str] = Field(default_factory=list)
    character_count: int
    word_count: int
    provider: str
    provider_note: str
    evaluated_at: str
