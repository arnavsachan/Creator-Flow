from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.dashboard import CamelModel, DataState


class CreateClipRequest(BaseModel):
    start_seconds: float = Field(..., ge=0, description="Start timestamp of clip in seconds")
    end_seconds: float = Field(..., gt=0, description="End timestamp of clip in seconds")
    aspect: str = Field(
        default="original",
        description="Aspect ratio for output clip",
    )


class ShortsClipData(CamelModel):
    id: str
    job_id: str
    start_seconds: float
    end_seconds: float
    aspect: str
    status: str
    error_code: Optional[str] = None
    created_at: str
    finished_at: Optional[str] = None


class ShortsJobData(CamelModel):
    id: str
    owner_id: Optional[str] = None
    original_filename: str
    size_bytes: int
    duration_seconds: float
    width: int
    height: int
    status: str
    error_code: Optional[str] = None
    created_at: str
    clips: list[ShortsClipData] = Field(default_factory=list)


class ShortsJobResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    data_state: DataState = Field(default="LIVE", serialization_alias="data_state")
    last_synced_at: Optional[str] = Field(default=None, serialization_alias="last_synced_at")
    message: Optional[str] = None
    data: Optional[ShortsJobData] = None


class ShortsJobListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    data_state: DataState = Field(default="LIVE", serialization_alias="data_state")
    last_synced_at: Optional[str] = Field(default=None, serialization_alias="last_synced_at")
    message: Optional[str] = None
    data: list[ShortsJobData] = Field(default_factory=list)


class ShortsClipResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    data_state: DataState = Field(default="LIVE", serialization_alias="data_state")
    last_synced_at: Optional[str] = Field(default=None, serialization_alias="last_synced_at")
    message: Optional[str] = None
    data: Optional[ShortsClipData] = None


class ShortsDeleteResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    data_state: DataState = Field(default="LIVE", serialization_alias="data_state")
    last_synced_at: Optional[str] = Field(default=None, serialization_alias="last_synced_at")
    message: str = "Job deleted successfully."
    data: Optional[dict] = None


class TranscriptSegment(CamelModel):
    start: float
    end: float
    text: str


class TranscriptData(CamelModel):
    job_id: str
    state: str = "none"
    error_code: Optional[str] = None
    segments: list[TranscriptSegment] = Field(default_factory=list)
    language_detected: Optional[str] = None
    duration_covered_seconds: Optional[float] = None
    truncated: bool = False
    model_size: Optional[str] = None
    device_used: Optional[str] = None


class TranscriptResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    data_state: DataState = Field(default="LIVE", serialization_alias="data_state")
    last_synced_at: Optional[str] = Field(default=None, serialization_alias="last_synced_at")
    message: Optional[str] = None
    data: Optional[TranscriptData] = None


class HighlightSuggestion(CamelModel):
    id: str
    start: float
    end: float
    title: str
    reason: str
    status: str = "suggested"


class HighlightsData(CamelModel):
    job_id: str
    state: str = "none"
    error_code: Optional[str] = None
    suggestions: list[HighlightSuggestion] = Field(default_factory=list)
    model_used: Optional[str] = None
    transcript_truncated: bool = False


class HighlightsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    data_state: DataState = Field(default="LIVE", serialization_alias="data_state")
    last_synced_at: Optional[str] = Field(default=None, serialization_alias="last_synced_at")
    message: Optional[str] = None
    data: Optional[HighlightsData] = None


class GenerateHighlightsRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    suggestion_ids: list[str] = Field(..., alias="suggestionIds")
    aspect: str = Field(default="vertical_9_16")


class BatchClipResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    data_state: DataState = Field(default="LIVE", serialization_alias="data_state")
    last_synced_at: Optional[str] = Field(default=None, serialization_alias="last_synced_at")
    message: Optional[str] = None
    data: list[ShortsClipData] = Field(default_factory=list)


