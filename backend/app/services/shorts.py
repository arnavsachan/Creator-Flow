from datetime import datetime, timezone
import json
import logging
from pathlib import Path
from typing import Optional
import uuid

from fastapi import BackgroundTasks, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.session import get_session_factory
from app.models.shorts import ShortsClip, ShortsJob
from app.schemas.shorts import (
    CreateClipRequest,
    HighlightSuggestionPayload,
    ShortsClipData,
    ShortsJobData,
)
from app.services.media import (
    ALLOWED_EXTENSIONS,
    ASPECT_RATIOS,
    MediaValidationError,
    generate_clip,
    probe_media,
    safe_delete_storage_file,
    safe_resolve_storage_file,
)
from app.services.highlights import delete_highlight_files, get_highlights_path
from app.services.transcription import delete_transcript_files

logger = logging.getLogger(__name__)

# In-memory tracking of actively processing background tasks
# Used to detect clips interrupted across server restart
_ACTIVE_TASKS: set[str] = set()


def clip_to_data(clip: ShortsClip) -> ShortsClipData:
    return ShortsClipData(
        id=clip.id,
        job_id=clip.job_id,
        start_seconds=clip.start_seconds,
        end_seconds=clip.end_seconds,
        aspect=clip.aspect,
        status=clip.status,
        error_code=clip.error_code,
        created_at=clip.created_at.isoformat() if clip.created_at else "",
        finished_at=clip.finished_at.isoformat() if clip.finished_at else None,
    )


def job_to_data(job: ShortsJob) -> ShortsJobData:
    return ShortsJobData(
        id=job.id,
        owner_id=job.owner_id,
        original_filename=job.original_filename,
        size_bytes=job.size_bytes,
        duration_seconds=job.duration_seconds,
        width=job.width,
        height=job.height,
        status=job.status,
        error_code=job.error_code,
        created_at=job.created_at.isoformat() if job.created_at else "",
        clips=[clip_to_data(c) for c in (job.clips or [])],
    )


def _check_interrupted_clip(clip: ShortsClip, db: Session) -> bool:
    """
    If a clip is marked 'processing' in the database but its task is not active in memory,
    it was interrupted by a server restart. Mark it failed with error_code INTERRUPTED.
    """
    if clip.status == "processing" and clip.id not in _ACTIVE_TASKS:
        clip.status = "failed"
        clip.error_code = "INTERRUPTED"
        clip.finished_at = datetime.now(timezone.utc)
        return True
    return False


async def upload_video_job(
    file: UploadFile,
    db: Session,
    settings: Settings,
) -> ShortsJob:
    """
    Streams the uploaded video to disk in 1MB chunks, validating extension and enforcing
    max size while streaming. Uses ffprobe to validate media integrity and duration.
    On any failure, deletes the stored file and raises a MediaValidationError with stable code.
    """
    original_name = file.filename or ""
    # Strip any directory path components from user filename
    sanitized_name = Path(original_name).name
    ext = Path(sanitized_name).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise MediaValidationError("UNSUPPORTED_FORMAT")

    storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()
    storage_dir.mkdir(parents=True, exist_ok=True)

    job_id = str(uuid.uuid4())
    stored_path = (storage_dir / f"{job_id}{ext}").resolve()

    total_bytes = 0
    max_bytes = settings.SHORTS_MAX_UPLOAD_MB * 1024 * 1024

    try:
        with open(stored_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > max_bytes:
                    f.close()
                    stored_path.unlink(missing_ok=True)
                    raise MediaValidationError("FILE_TOO_LARGE")
                f.write(chunk)
    except MediaValidationError:
        raise
    except Exception as exc:
        stored_path.unlink(missing_ok=True)
        logger.error("Failed to stream upload to disk: %s", type(exc).__name__)
        raise MediaValidationError("INVALID_MEDIA")

    if total_bytes == 0:
        stored_path.unlink(missing_ok=True)
        raise MediaValidationError("INVALID_MEDIA")

    # Validate with ffprobe
    try:
        media_info = probe_media(stored_path, ffprobe_bin=settings.FFPROBE_BIN)
    except MediaValidationError:
        stored_path.unlink(missing_ok=True)
        raise
    except Exception as exc:
        stored_path.unlink(missing_ok=True)
        logger.error("Media probe error: %s", type(exc).__name__)
        raise MediaValidationError("INVALID_MEDIA")

    if media_info.duration > settings.SHORTS_MAX_DURATION_SECONDS:
        stored_path.unlink(missing_ok=True)
        raise MediaValidationError("DURATION_EXCEEDED")

    job = ShortsJob(
        id=job_id,
        owner_id=None,
        original_filename=sanitized_name,
        stored_path=str(stored_path),
        size_bytes=total_bytes,
        duration_seconds=media_info.duration,
        width=media_info.width,
        height=media_info.height,
        status="uploaded",
        error_code=None,
        created_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def list_jobs(db: Session) -> list[ShortsJob]:
    stmt = select(ShortsJob).order_by(ShortsJob.created_at.desc())
    jobs = list(db.scalars(stmt).all())

    modified = False
    for job in jobs:
        for clip in job.clips or []:
            if _check_interrupted_clip(clip, db):
                modified = True

    if modified:
        db.commit()

    return jobs


def get_job(job_id: str, db: Session) -> ShortsJob:
    job = db.get(ShortsJob, job_id)
    if not job:
        raise MediaValidationError("JOB_NOT_FOUND")

    modified = False
    for clip in job.clips or []:
        if _check_interrupted_clip(clip, db):
            modified = True

    if modified:
        db.commit()
        db.refresh(job)

    return job


def process_clip_task(clip_id: str, job_id: str, settings: Settings) -> None:
    """
    Background task executing ffmpeg trimming. Never leaks internal paths or raw stderr.
    """
    _ACTIVE_TASKS.add(clip_id)
    session_factory = get_session_factory()
    db = session_factory()

    try:
        clip = db.get(ShortsClip, clip_id)
        job = db.get(ShortsJob, job_id)
        if not clip or not job:
            return

        clip.status = "processing"
        db.commit()

        input_path = Path(job.stored_path)
        output_path = Path(clip.output_path) if clip.output_path else None

        if not output_path:
            raise MediaValidationError("PROCESSING_FAILED")

        generate_clip(
            input_path=input_path,
            output_path=output_path,
            start=clip.start_seconds,
            end=clip.end_seconds,
            aspect=clip.aspect,
            ffmpeg_bin=settings.FFMPEG_BIN,
        )

        # Verify clip still exists in DB (was not deleted while ffmpeg was running)
        clip = db.get(ShortsClip, clip_id)
        if not clip:
            if output_path:
                output_path.unlink(missing_ok=True)
            return

        clip.status = "done"
        clip.finished_at = datetime.now(timezone.utc)
        clip.error_code = None
        db.commit()
    except Exception as exc:
        logger.error("FFmpeg background clipping failed: %s", type(exc).__name__)
        try:
            clip = db.get(ShortsClip, clip_id)
            if clip:
                clip.status = "failed"
                clip.error_code = "PROCESSING_FAILED"
                clip.finished_at = datetime.now(timezone.utc)
                if clip.output_path:
                    Path(clip.output_path).unlink(missing_ok=True)
                db.commit()
        except Exception:
            pass
    finally:
        _ACTIVE_TASKS.discard(clip_id)
        db.close()


def process_sequential_clips_task(clip_ids: list[str], job_id: str, settings: Settings) -> None:
    """
    Renders multiple clips sequentially one after another in a single background worker task.
    """
    for cid in clip_ids:
        process_clip_task(clip_id=cid, job_id=job_id, settings=settings)


def create_clip(
    job_id: str,
    req: CreateClipRequest,
    db: Session,
    settings: Settings,
    background_tasks: BackgroundTasks,
) -> ShortsClip:
    job = db.get(ShortsJob, job_id)
    if not job:
        raise MediaValidationError("JOB_NOT_FOUND")

    # Validate aspect ratio
    if req.aspect not in ASPECT_RATIOS:
        raise MediaValidationError("INVALID_ASPECT")

    # Validate clip range
    if req.start_seconds < 0 or req.start_seconds >= req.end_seconds or req.end_seconds > job.duration_seconds:
        raise MediaValidationError("INVALID_RANGE")

    clip_len = req.end_seconds - req.start_seconds
    if clip_len > settings.SHORTS_MAX_CLIP_SECONDS:
        raise MediaValidationError("INVALID_RANGE")

    clip_id = str(uuid.uuid4())
    storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()
    storage_dir.mkdir(parents=True, exist_ok=True)
    output_path = (storage_dir / f"clip_{clip_id}.mp4").resolve()

    clip = ShortsClip(
        id=clip_id,
        job_id=job.id,
        start_seconds=req.start_seconds,
        end_seconds=req.end_seconds,
        aspect=req.aspect,
        status="queued",
        error_code=None,
        output_path=str(output_path),
        created_at=datetime.now(timezone.utc),
    )
    db.add(clip)
    db.commit()
    db.refresh(clip)

    background_tasks.add_task(process_clip_task, clip_id=clip_id, job_id=job.id, settings=settings)
    return clip


def create_highlight_clips(
    job_id: str,
    suggestion_ids: list[str],
    aspect: str,
    db: Session,
    settings: Settings,
    background_tasks: BackgroundTasks,
    suggestions: Optional[list[HighlightSuggestionPayload]] = None,
) -> list[ShortsClip]:
    job = db.get(ShortsJob, job_id)
    if not job:
        raise MediaValidationError("JOB_NOT_FOUND")

    if aspect not in ASPECT_RATIOS:
        raise MediaValidationError("INVALID_ASPECT")

    storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()
    highlights_file = get_highlights_path(storage_dir, job_id)

    # 1. Load any saved suggestions from disk if present
    saved_suggestions: dict[str, dict] = {}
    if highlights_file.exists():
        try:
            with open(highlights_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            saved_suggestions = {s["id"]: s for s in data.get("suggestions", []) if "id" in s}
        except Exception:
            saved_suggestions = {}

    # 2. If client supplied validated suggestions in request, merge/supplement saved_suggestions
    if suggestions:
        for idx, sug in enumerate(suggestions):
            s_id = sug.id or f"sug_{idx}_{uuid.uuid4().hex[:6]}"
            item_dict = {
                "id": s_id,
                "start": float(sug.start),
                "end": float(sug.end),
                "title": sug.title or "Highlight",
                "reason": sug.reason or "",
                "status": sug.status or "suggested",
            }
            saved_suggestions[s_id] = item_dict
            if sug.id:
                saved_suggestions[sug.id] = item_dict

    # 3. Determine which IDs to process
    if suggestion_ids:
        ids_to_process = suggestion_ids[: settings.HIGHLIGHT_MAX_SUGGESTIONS]
    elif suggestions:
        ids_to_process = [s.id for s in suggestions if s.id][: settings.HIGHLIGHT_MAX_SUGGESTIONS]
        if not ids_to_process:
            ids_to_process = list(saved_suggestions.keys())[: settings.HIGHLIGHT_MAX_SUGGESTIONS]
    else:
        return []

    # 4. Validate that all requested suggestion IDs exist in saved_suggestions
    for sid in ids_to_process:
        if sid not in saved_suggestions:
            raise MediaValidationError("SUGGESTION_NOT_FOUND")

    # 5. Persist the updated/recovered suggestions to highlights_file so future queries or status checks find them
    try:
        storage_dir.mkdir(parents=True, exist_ok=True)
        persisted_data = {
            "job_id": job_id,
            "suggestions": list(saved_suggestions.values()),
            "model_used": settings.AI_MODEL,
            "transcript_truncated": False,
        }
        with open(highlights_file, "w", encoding="utf-8") as f:
            json.dump(persisted_data, f, indent=2, ensure_ascii=False)
    except Exception:
        pass

    storage_dir.mkdir(parents=True, exist_ok=True)
    created_clips: list[ShortsClip] = []

    for sid in ids_to_process:
        sug = saved_suggestions[sid]
        start_sec = float(sug["start"])
        end_sec = float(sug["end"])

        # Validate range
        if start_sec < 0 or start_sec >= end_sec or end_sec > job.duration_seconds:
            raise MediaValidationError("INVALID_RANGE")

        clip_len = end_sec - start_sec
        if clip_len > settings.SHORTS_MAX_CLIP_SECONDS:
            raise MediaValidationError("INVALID_RANGE")

        clip_id = str(uuid.uuid4())
        output_path = (storage_dir / f"clip_{clip_id}.mp4").resolve()

        clip = ShortsClip(
            id=clip_id,
            job_id=job.id,
            start_seconds=start_sec,
            end_seconds=end_sec,
            aspect=aspect,
            status="queued",
            error_code=None,
            output_path=str(output_path),
            created_at=datetime.now(timezone.utc),
        )
        db.add(clip)
        created_clips.append(clip)

    db.commit()
    for c in created_clips:
        db.refresh(c)

    # Queue sequential rendering in a single background worker task
    clip_ids = [c.id for c in created_clips]
    background_tasks.add_task(
        process_sequential_clips_task,
        clip_ids=clip_ids,
        job_id=job.id,
        settings=settings,
    )

    return created_clips


def get_clip(job_id: str, clip_id: str, db: Session) -> ShortsClip:
    stmt = select(ShortsClip).where(ShortsClip.id == clip_id, ShortsClip.job_id == job_id)
    clip = db.scalar(stmt)
    if not clip:
        raise MediaValidationError("CLIP_NOT_FOUND")

    if _check_interrupted_clip(clip, db):
        db.commit()
        db.refresh(clip)

    return clip


def delete_clip(job_id: str, clip_id: str, db: Session, storage_dir: Path) -> None:
    """
    Deletes a single clip DB row and its storage file.
    - 404 CLIP_NOT_FOUND if clip does not exist OR belongs to another job.
    - 409 CLIP_BUSY if clip is queued or processing.
    - Resolves path from DB record only, verifies it stays within storage_dir,
      and ignores a missing file. Never deletes anything outside storage.
    """
    stmt = select(ShortsClip).where(ShortsClip.id == clip_id, ShortsClip.job_id == job_id)
    clip = db.scalar(stmt)
    if not clip:
        raise MediaValidationError("CLIP_NOT_FOUND")

    # If clip is marked processing but task died across server restart, mark it failed first
    _check_interrupted_clip(clip, db)

    if clip.status in ("queued", "processing") or clip.id in _ACTIVE_TASKS:
        raise MediaValidationError("CLIP_BUSY")

    if clip.output_path:
        safe_delete_storage_file(clip.output_path, storage_dir)

    db.delete(clip)
    db.commit()


def delete_job(job_id: str, db: Session, storage_dir: Path) -> None:
    """
    Removes database rows and all associated storage files.
    Missing files must not crash.
    """
    job = db.get(ShortsJob, job_id)
    if not job:
        raise MediaValidationError("JOB_NOT_FOUND")

    # Delete clip files
    for clip in job.clips or []:
        if clip.output_path:
            safe_delete_storage_file(clip.output_path, storage_dir)

    # Delete source video file
    if job.stored_path:
        safe_delete_storage_file(job.stored_path, storage_dir)

    # Delete transcript sidecar files and temporary audio
    delete_transcript_files(job_id, storage_dir)

    # Delete highlight sidecar files
    delete_highlight_files(job_id, storage_dir)

    db.delete(job)
    db.commit()


