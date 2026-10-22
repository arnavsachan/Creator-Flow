from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

HookArchetype = Literal["negative", "curiosity", "story"]
ContentFormat = Literal["long_form", "short"]


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


class HookVariation(CamelModel):
    archetype: HookArchetype
    hook_text: str = Field(..., description="Verbatim spoken hook lines")
    estimated_retention_score: float = Field(
        ...,
        ge=0,
        le=100,
        description="Predicted first 30-second retention probability percentage",
    )
    rationale: str = Field(..., description="Why this hook works for viewer psychology")


class GenerateHooksRequest(CamelModel):
    topic: str = Field(..., min_length=2, max_length=500, description="Core topic or video premise")
    audience_persona: Optional[str] = Field(
        default="General Creators & Tech Viewers",
        max_length=255,
        description="Target audience archetype",
    )
    tone: Optional[str] = Field(
        default="Conversational",
        max_length=100,
        description="Delivery style: Authoritative, Conversational, High Energy, Dramatic",
    )
    channel_id: Optional[str] = Field(default=None, description="Optional channel ID context")


class GenerateHooksResponse(CamelModel):
    topic: str
    hooks: list[HookVariation] = Field(default_factory=list)
    disclaimer: str = (
        "AI estimate based on structural and pacing patterns, not actual YouTube analytics measurement."
    )


class ScriptSection(CamelModel):
    timecode: str
    section_type: str
    content: str
    visual_cue: Optional[str] = None


class GenerateScriptRequest(CamelModel):
    topic: str = Field(..., min_length=2, max_length=500)
    target_duration: str = Field(default="8m 00s", description="Target video length (e.g. 60s, 5m, 8m 00s, 10m)")
    tone: str = Field(default="Conversational", max_length=100)
    audience_persona: Optional[str] = Field(default="Tech Viewers & Professionals", max_length=255)
    hook_type: HookArchetype = Field(default="curiosity")
    selected_hook: Optional[str] = Field(default=None, description="Optional custom hook override")
    format: ContentFormat = Field(default="long_form")
    channel_id: Optional[str] = Field(default=None)


class GenerateScriptResponse(CamelModel):
    title: str
    topic: str
    target_duration: str
    tone: str
    audience_persona: Optional[str] = None
    hook_type: str
    hook_text: str
    full_script: str
    estimated_retention_score: float
    sections: list[ScriptSection] = Field(default_factory=list)
    pacing_breakdown: Optional[dict[str, Any]] = None
    disclaimer: str = (
        "AI estimate based on structural and pacing patterns, not actual YouTube analytics measurement."
    )


class AuditRetentionRequest(CamelModel):
    script_text: str = Field(..., min_length=10, description="Full script or draft text to evaluate")
    target_duration: Optional[str] = Field(default=None, description="Optional target duration")
    channel_id: Optional[str] = Field(default=None)


class RetentionAuditResponse(CamelModel):
    estimated_retention_score: float
    retention_tier: str = "Top 10%"
    word_count: int
    estimated_duration_seconds: int
    formatted_duration: str
    pacing_wpm: int
    hook_detected: bool
    first_30s_analysis: str
    strengths: list[str] = Field(default_factory=list)
    drop_off_risks: list[str] = Field(default_factory=list)
    pacing_recommendations: list[str] = Field(default_factory=list)
    disclaimer: str = (
        "AI estimate based on structural and pacing patterns, not actual YouTube analytics measurement."
    )


class ScriptCreateRequest(CamelModel):
    title: str = Field(..., min_length=1, max_length=255)
    topic: str = Field(..., min_length=1, max_length=500)
    target_duration: str = Field(default="8m 00s", max_length=50)
    tone: str = Field(default="Conversational", max_length=100)
    audience_persona: Optional[str] = Field(default=None, max_length=255)
    hook_type: str = Field(default="curiosity", max_length=50)
    hook_text: Optional[str] = None
    full_script: str = Field(..., min_length=1)
    estimated_retention_score: Optional[float] = None
    pacing_breakdown: Optional[str] = None
    channel_id: Optional[str] = None


class ScriptResponse(CamelModel):
    id: str
    user_id: str
    channel_id: Optional[str] = None
    title: str
    topic: str
    target_duration: str
    tone: str
    audience_persona: Optional[str] = None
    hook_type: str
    hook_text: Optional[str] = None
    full_script: str
    estimated_retention_score: Optional[float] = None
    pacing_breakdown: Optional[str] = None
    created_at: datetime
    updated_at: datetime
