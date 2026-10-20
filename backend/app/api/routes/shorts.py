from datetime import datetime, timezone
import logging
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
from app.db.session import get_db
from app.schemas.shorts import (
    CreateClipRequest,
    ShortsClipResponse,
    ShortsDeleteResponse,
    ShortsJobListResponse,
    ShortsJobResponse,
)
from app.services.media import MediaValidationError, safe_resolve_storage_file
from app.services.shorts import (
    clip_to_data,
    create_clip,
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
        "FILE_NOT_FOUND": status.HTTP_404_NOT_FOUND,
        "FORBIDDEN_PATH": status.HTTP_404_NOT_FOUND,
        "PROCESSING_FAILED": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "FILE_TOO_LARGE": status.HTTP_400_BAD_REQUEST,
        "UNSUPPORTED_FORMAT": status.HTTP_400_BAD_REQUEST,
        "INVALID_MEDIA": status.HTTP_400_BAD_REQUEST,
        "DURATION_EXCEEDED": status.HTTP_400_BAD_REQUEST,
        "INVALID_RANGE": status.HTTP_400_BAD_REQUEST,
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
