from datetime import datetime, timezone
import logging
from pathlib import Path
from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
import json
from app.db.session import get_db
from app.schemas.shorts import (
    BatchClipResponse,
    CreateClipRequest,
    GenerateHighlightsRequest,
    HighlightsData,
    HighlightsResponse,
    ShortsClipResponse,
    ShortsDeleteResponse,
    ShortsJobListResponse,
    ShortsJobResponse,
    TranscriptData,
    TranscriptResponse,
)
from app.services.highlights import (
    acquire_highlights_lock,
    get_highlights_data,
    process_highlights_background,
    write_highlights_state,
)
from app.services.media import MediaValidationError, safe_resolve_storage_file
from app.services.transcription import (
    acquire_transcription_lock,
    get_transcript_data,
    get_transcript_path,
    has_audio_stream,
    is_faster_whisper_available,
    process_transcription_background,
    read_transcript_state,
    write_transcript_state,
)
from app.services.shorts import (
    clip_to_data,
    create_clip,
    create_highlight_clips,
    delete_clip,
    delete_job,
    get_clip,
    get_job,
    job_to_data,
    list_jobs,
    upload_video_job,
)

logger = logging.getLogger(__name__)


def verify_shorts_enabled(settings: Annotated[Settings, Depends(get_settings)]) -> None:
    enabled = settings.SHORTS_ENABLED_ENVIRONMENTS
    if isinstance(enabled, str):
        allowed = [e.strip() for e in enabled.split(",") if e.strip()]
    else:
        allowed = list(enabled)

    if settings.ENVIRONMENT not in allowed:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="FEATURE_DISABLED",
        )


def _handle_media_error(err: MediaValidationError) -> HTTPException:
    status_map = {
        "FEATURE_DISABLED": status.HTTP_503_SERVICE_UNAVAILABLE,
        "JOB_NOT_FOUND": status.HTTP_404_NOT_FOUND,
        "CLIP_NOT_FOUND": status.HTTP_404_NOT_FOUND,
        "CLIP_BUSY": status.HTTP_409_CONFLICT,
        "FILE_NOT_FOUND": status.HTTP_404_NOT_FOUND,
        "FORBIDDEN_PATH": status.HTTP_404_NOT_FOUND,
        "PROCESSING_FAILED": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "FILE_TOO_LARGE": status.HTTP_400_BAD_REQUEST,
        "UNSUPPORTED_FORMAT": status.HTTP_400_BAD_REQUEST,
        "INVALID_MEDIA": status.HTTP_400_BAD_REQUEST,
        "INVALID_ASPECT": status.HTTP_400_BAD_REQUEST,
        "DURATION_EXCEEDED": status.HTTP_400_BAD_REQUEST,
        "INVALID_RANGE": status.HTTP_400_BAD_REQUEST,
        "TRANSCRIPTION_BUSY": status.HTTP_409_CONFLICT,
        "TRANSCRIPTION_UNAVAILABLE": status.HTTP_503_SERVICE_UNAVAILABLE,
        "NO_AUDIO_STREAM": status.HTTP_400_BAD_REQUEST,
        "MODEL_DOWNLOAD_FAILED": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "AI_NOT_CONFIGURED": status.HTTP_503_SERVICE_UNAVAILABLE,
        "AI_AUTH_FAILED": status.HTTP_502_BAD_GATEWAY,
        "AI_RATE_LIMITED": status.HTTP_429_TOO_MANY_REQUESTS,
        "AI_TIMEOUT": status.HTTP_504_GATEWAY_TIMEOUT,
        "AI_UNAVAILABLE": status.HTTP_502_BAD_GATEWAY,
        "AI_BAD_RESPONSE": status.HTTP_502_BAD_GATEWAY,
        "TRANSCRIPT_REQUIRED": status.HTTP_409_CONFLICT,
        "HIGHLIGHTS_BUSY": status.HTTP_409_CONFLICT,
        "SUGGESTION_NOT_FOUND": status.HTTP_404_NOT_FOUND,
    }
    http_status = status_map.get(err.code, status.HTTP_400_BAD_REQUEST)
    return HTTPException(status_code=http_status, detail=err.code)


router = APIRouter(
    prefix="/shorts",
    tags=["Shorts Clipper"],
    dependencies=[Depends(verify_shorts_enabled)],
)


@router.post(
    "/jobs",
    response_model=ShortsJobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload Video and Create Shorts Job",
)
async def upload_job_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ShortsJobResponse:
    try:
        job = await upload_video_job(file=file, db=db, settings=settings)
        return ShortsJobResponse(
            data_state="LIVE",
            last_synced_at=datetime.now(timezone.utc).isoformat(),
            message="Video uploaded successfully.",
            data=job_to_data(job),
        )
    except MediaValidationError as err:
        raise _handle_media_error(err) from err


@router.get(
    "/jobs",
    response_model=ShortsJobListResponse,
    summary="List All Shorts Jobs",
)
def list_jobs_endpoint(
    db: Session = Depends(get_db),
) -> ShortsJobListResponse:
    jobs = list_jobs(db=db)
    return ShortsJobListResponse(
        data_state="LIVE",
        last_synced_at=datetime.now(timezone.utc).isoformat(),
        message=f"Retrieved {len(jobs)} video jobs.",
        data=[job_to_data(j) for j in jobs],
    )


@router.get(
    "/jobs/{id}",
    response_model=ShortsJobResponse,
    summary="Get Shorts Job by ID",
)
def get_job_endpoint(
    id: str,
    db: Session = Depends(get_db),
) -> ShortsJobResponse:
    try:
        job = get_job(job_id=id, db=db)
        return ShortsJobResponse(
            data_state="LIVE",
            last_synced_at=datetime.now(timezone.utc).isoformat(),
            data=job_to_data(job),
        )
    except MediaValidationError as err:
        raise _handle_media_error(err) from err


@router.post(
    "/jobs/{id}/clips",
    response_model=ShortsClipResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Queue a Manual Trim Clip Generation",
)
def create_clip_endpoint(
    id: str,
    req: CreateClipRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ShortsClipResponse:
    try:
        clip = create_clip(
            job_id=id,
            req=req,
            db=db,
            settings=settings,
            background_tasks=background_tasks,
        )
        return ShortsClipResponse(
            data_state="LIVE",
            last_synced_at=datetime.now(timezone.utc).isoformat(),
            message="Clip generation queued.",
            data=clip_to_data(clip),
        )
    except MediaValidationError as err:
        raise _handle_media_error(err) from err


@router.get(
    "/jobs/{id}/clips/{clip_id}",
    response_model=ShortsClipResponse,
    summary="Get Clip Status by ID",
)
def get_clip_endpoint(
    id: str,
    clip_id: str,
    db: Session = Depends(get_db),
) -> ShortsClipResponse:
    try:
        clip = get_clip(job_id=id, clip_id=clip_id, db=db)
        return ShortsClipResponse(
            data_state="LIVE",
            last_synced_at=datetime.now(timezone.utc).isoformat(),
            data=clip_to_data(clip),
        )
    except MediaValidationError as err:
        raise _handle_media_error(err) from err


@router.get(
    "/jobs/{id}/source",
    summary="Preview Source Video with HTTP Range Support",
)
def preview_source_endpoint(
    id: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    try:
        job = get_job(job_id=id, db=db)
        file_path = safe_resolve_storage_file(job.stored_path, settings.SHORTS_STORAGE_DIR)
        return FileResponse(
            path=file_path,
            media_type="video/mp4",
            filename=job.original_filename,
        )
    except MediaValidationError as err:
        raise _handle_media_error(err) from err


@router.get(
    "/jobs/{id}/clips/{clip_id}/download",
    summary="Download Generated Clip",
)
def download_clip_endpoint(
    id: str,
    clip_id: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    try:
        clip = get_clip(job_id=id, clip_id=clip_id, db=db)
        if clip.status != "done" or not clip.output_path:
            raise MediaValidationError("CLIP_NOT_FOUND")

        file_path = safe_resolve_storage_file(clip.output_path, settings.SHORTS_STORAGE_DIR)
        return FileResponse(
            path=file_path,
            media_type="video/mp4",
            filename=f"clip_{clip.id[:8]}.mp4",
        )
    except MediaValidationError as err:
        raise _handle_media_error(err) from err


@router.delete(
    "/jobs/{id}",
    response_model=ShortsDeleteResponse,
    summary="Delete Shorts Job and Storage Files",
)
def delete_job_endpoint(
    id: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ShortsDeleteResponse:
    try:
        delete_job(job_id=id, db=db, storage_dir=settings.SHORTS_STORAGE_DIR)
        return ShortsDeleteResponse(
            data_state="LIVE",
            last_synced_at=datetime.now(timezone.utc).isoformat(),
            message="Job deleted successfully.",
        )
    except MediaValidationError as err:
        raise _handle_media_error(err) from err


@router.delete(
    "/jobs/{id}/clips/{clip_id}",
    response_model=ShortsDeleteResponse,
    summary="Delete a Single Generated Clip",
)
def delete_clip_endpoint(
    id: str,
    clip_id: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ShortsDeleteResponse:
    try:
        delete_clip(job_id=id, clip_id=clip_id, db=db, storage_dir=settings.SHORTS_STORAGE_DIR)
        return ShortsDeleteResponse(
            data_state="LIVE",
            last_synced_at=datetime.now(timezone.utc).isoformat(),
            message="Clip deleted successfully.",
        )
    except MediaValidationError as err:
        raise _handle_media_error(err) from err


@router.post(
    "/jobs/{id}/transcribe",
    response_model=TranscriptResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start Local Speech Transcription for Job",
)
def transcribe_job_endpoint(
    id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TranscriptResponse:
    try:
        job = get_job(job_id=id, db=db)
        if not is_faster_whisper_available():
            raise MediaValidationError("TRANSCRIPTION_UNAVAILABLE")

        storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()
        video_path = safe_resolve_storage_file(job.stored_path, storage_dir)

        if not has_audio_stream(video_path, ffprobe_bin=settings.FFPROBE_BIN):
            write_transcript_state(storage_dir, id, "failed", "NO_AUDIO_STREAM")
            raise MediaValidationError("NO_AUDIO_STREAM")

        if not acquire_transcription_lock(id):
            raise MediaValidationError("TRANSCRIPTION_BUSY")

        write_transcript_state(storage_dir, id, "running")

        background_tasks.add_task(
            process_transcription_background,
            job_id=id,
            stored_video_path_str=job.stored_path,
            duration_seconds=job.duration_seconds,
            settings=settings,
        )

        return TranscriptResponse(
            data_state="LIVE",
            last_synced_at=datetime.now(timezone.utc).isoformat(),
            message="Transcription started.",
            data=TranscriptData(job_id=id, state="running"),
        )
    except MediaValidationError as err:
        raise _handle_media_error(err) from err


@router.get(
    "/jobs/{id}/transcript",
    response_model=TranscriptResponse,
    summary="Get Speech Transcription for Job",
)
def get_transcript_endpoint(
    id: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TranscriptResponse:
    try:
        get_job(job_id=id, db=db)
        storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()
        data = get_transcript_data(job_id=id, storage_dir=storage_dir)

        return TranscriptResponse(
            data_state="LIVE",
            last_synced_at=datetime.now(timezone.utc).isoformat(),
            data=data,
        )
    except MediaValidationError as err:
        raise _handle_media_error(err) from err


@router.post(
    "/jobs/{id}/highlights",
    response_model=HighlightsResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start AI Highlight Analysis for Job",
)
def start_highlights_endpoint(
    id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> HighlightsResponse:
    try:
        job = get_job(job_id=id, db=db)

        # Check AI configuration (never echo or expose key)
        api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""
        model = settings.AI_MODEL.strip() if settings.AI_MODEL else ""
        if not api_key or not model or settings.AI_PROVIDER != "gemini":
            raise MediaValidationError("AI_NOT_CONFIGURED")

        # Check completed transcript exists with segments
        storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()
        transcript_state, _ = read_transcript_state(storage_dir, id)
        if transcript_state != "done":
            raise MediaValidationError("TRANSCRIPT_REQUIRED")

        transcript_path = get_transcript_path(storage_dir, id)
        if not transcript_path.exists():
            raise MediaValidationError("TRANSCRIPT_REQUIRED")

        try:
            with open(transcript_path, "r", encoding="utf-8") as f:
                t_json = json.load(f)
            if not t_json.get("segments"):
                raise MediaValidationError("TRANSCRIPT_REQUIRED")
        except Exception:
            raise MediaValidationError("TRANSCRIPT_REQUIRED")

        if not acquire_highlights_lock(id):
            raise MediaValidationError("HIGHLIGHTS_BUSY")

        write_highlights_state(storage_dir, id, "running")

        background_tasks.add_task(
            process_highlights_background,
            job_id=id,
            settings=settings,
        )

        return HighlightsResponse(
            data_state="LIVE",
            last_synced_at=datetime.now(timezone.utc).isoformat(),
            message="Highlights analysis started.",
            data=HighlightsData(job_id=id, state="running"),
        )
    except MediaValidationError as err:
        raise _handle_media_error(err) from err


@router.get(
    "/jobs/{id}/highlights",
    response_model=HighlightsResponse,
    summary="Get AI Highlight Suggestions for Job",
)
def get_highlights_endpoint(
    id: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> HighlightsResponse:
    try:
        get_job(job_id=id, db=db)
        storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()
        data = get_highlights_data(job_id=id, storage_dir=storage_dir)

        return HighlightsResponse(
            data_state="LIVE",
            last_synced_at=datetime.now(timezone.utc).isoformat(),
            data=data,
        )
    except MediaValidationError as err:
        raise _handle_media_error(err) from err


@router.post(
    "/jobs/{id}/highlights/generate",
    response_model=BatchClipResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Generate Clips from Selected Highlight Suggestions Sequentially",
)
def generate_highlights_endpoint(
    id: str,
    req: GenerateHighlightsRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> BatchClipResponse:
    try:
        clips = create_highlight_clips(
            job_id=id,
            suggestion_ids=req.suggestion_ids,
            aspect=req.aspect,
            db=db,
            settings=settings,
            background_tasks=background_tasks,
        )
        return BatchClipResponse(
            data_state="LIVE",
            last_synced_at=datetime.now(timezone.utc).isoformat(),
            message=f"Queued {len(clips)} clip(s) for rendering.",
            data=[clip_to_data(c) for c in clips],
        )
    except MediaValidationError as err:
        raise _handle_media_error(err) from err



