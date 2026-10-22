from dataclasses import dataclass
import json
import logging
from pathlib import Path
import subprocess
from typing import Optional

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm"}

# Single mapping of aspect keys to target output dimensions (width, height)
# None indicates original dimensions (no crop)
ASPECT_RATIOS: dict[str, Optional[tuple[int, int]]] = {
    "original": None,
    "vertical_9_16": (1080, 1920),
    "square_1_1": (1080, 1080),
    "portrait_4_5": (1080, 1350),
    "landscape_16_9": (1920, 1080),
}


class MediaValidationError(Exception):
    def __init__(self, code: str, message: str = ""):
        self.code = code
        self.message = message or code
        super().__init__(self.message)


@dataclass(frozen=True)
class MediaInfo:
    duration: float
    width: int
    height: int


def probe_media(file_path: Path, ffprobe_bin: str = "ffprobe", timeout: int = 15) -> MediaInfo:
    """
    Validates that file_path has a readable video stream and non-zero duration using ffprobe.
    Never returns raw stderr or internal paths to callers.
    """
    resolved_path = file_path.resolve()
    if not resolved_path.exists() or not resolved_path.is_file():
        raise MediaValidationError("INVALID_MEDIA")

    cmd = [
        ffprobe_bin,
        "-v", "error",
        "-show_entries", "stream=codec_type,width,height:format=duration",
        "-of", "json",
        str(resolved_path),
    ]

    try:
        proc = subprocess.run(
            cmd,
            shell=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        logger.error("ffprobe binary not found at %s", ffprobe_bin)
        raise MediaValidationError("PROCESSING_FAILED")
    except subprocess.TimeoutExpired:
        logger.warning("ffprobe timed out after %s seconds", timeout)
        raise MediaValidationError("INVALID_MEDIA")
    except Exception as exc:
        logger.error("ffprobe execution failed with exception: %s", type(exc).__name__)
        raise MediaValidationError("INVALID_MEDIA")

    if proc.returncode != 0:
        logger.warning("ffprobe failed with exit code %s", proc.returncode)
        raise MediaValidationError("INVALID_MEDIA")

    try:
        data = json.loads(proc.stdout)
    except Exception:
        logger.warning("Failed to parse ffprobe JSON output")
        raise MediaValidationError("INVALID_MEDIA")

    streams = data.get("streams", [])
    video_stream = None
    for s in streams:
        if s.get("codec_type") == "video":
            video_stream = s
            break

    if not video_stream:
        logger.warning("Uploaded file contains no video streams")
        raise MediaValidationError("INVALID_MEDIA")

    try:
        width = int(video_stream.get("width") or 0)
        height = int(video_stream.get("height") or 0)
    except (ValueError, TypeError):
        raise MediaValidationError("INVALID_MEDIA")

    if width <= 0 or height <= 0:
        logger.warning("Invalid video dimensions: %sx%s", width, height)
        raise MediaValidationError("INVALID_MEDIA")

    # Determine duration: prefer format.duration, fallback to stream duration
    duration = 0.0
    format_info = data.get("format", {})
    if format_info.get("duration"):
        try:
            duration = float(format_info["duration"])
        except (ValueError, TypeError):
            pass

    if duration <= 0 and video_stream.get("duration"):
        try:
            duration = float(video_stream["duration"])
        except (ValueError, TypeError):
            pass

    if duration <= 0:
        logger.warning("Video stream has zero or negative duration")
        raise MediaValidationError("INVALID_MEDIA")

    return MediaInfo(duration=duration, width=width, height=height)


def generate_clip(
    input_path: Path,
    output_path: Path,
    start: float,
    end: float,
    aspect: str,
    ffmpeg_bin: str = "ffmpeg",
    timeout: int = 300,
) -> None:
    """
    Trims a segment from input_path to output_path using FFmpeg subprocess.
    Uses argument list, never shell=True.
    Applies center crop and 1080x1920 scale when aspect is vertical_9_16.
    Ensures output is mp4, libx264 + aac, -movflags +faststart.
    """
    input_resolved = input_path.resolve()
    output_resolved = output_path.resolve()

    # Ensure parent output directory exists
    output_resolved.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        ffmpeg_bin,
        "-y",
        "-ss", str(start),
        "-to", str(end),
        "-i", str(input_resolved),
        "-map", "0:v:0",
        "-map", "0:a?",
    ]

    if aspect not in ASPECT_RATIOS:
        raise MediaValidationError("INVALID_ASPECT")

    target_dims = ASPECT_RATIOS[aspect]
    if target_dims is not None:
        target_w, target_h = target_dims
        cmd.extend([
            "-vf",
            f"scale={target_w}:{target_h}:force_original_aspect_ratio=increase,crop={target_w}:{target_h}:(iw-ow)/2:(ih-oh)/2",
        ])

    cmd.extend([
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-movflags", "+faststart",
        str(output_resolved),
    ])

    try:
        proc = subprocess.run(
            cmd,
            shell=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        logger.error("ffmpeg binary not found at %s", ffmpeg_bin)
        raise MediaValidationError("PROCESSING_FAILED")
    except subprocess.TimeoutExpired:
        logger.warning("ffmpeg processing timed out after %s seconds", timeout)
        raise MediaValidationError("PROCESSING_FAILED")
    except Exception as exc:
        logger.error("ffmpeg processing failed with exception: %s", type(exc).__name__)
        raise MediaValidationError("PROCESSING_FAILED")

    if proc.returncode != 0:
        logger.error("ffmpeg clip encoding failed with exit code %s", proc.returncode)
        # Never leak stderr or paths to client
        raise MediaValidationError("PROCESSING_FAILED")


def safe_resolve_storage_file(stored_path_str: str, storage_dir: Path) -> Path:
    """
    Verifies that stored_path_str resolves to an existing file strictly inside storage_dir.
    Prevents path traversal attacks.
    """
    storage_root = storage_dir.resolve()
    target_path = Path(stored_path_str).resolve()

    try:
        target_path.relative_to(storage_root)
    except ValueError:
        logger.warning("Path traversal attempt detected: %s outside %s", stored_path_str, storage_root)
        raise MediaValidationError("JOB_NOT_FOUND")

    if not target_path.exists() or not target_path.is_file():
        raise MediaValidationError("JOB_NOT_FOUND")

    return target_path


def safe_delete_storage_file(stored_path_str: Optional[str], storage_dir: Path) -> None:
    """
    Safely deletes a file strictly inside storage_dir.
    Resolves the path from stored_path_str, verifies it stays within storage_dir,
    and ignores a missing file. Never deletes anything outside storage_dir.
    """
    if not stored_path_str:
        return
    storage_root = storage_dir.resolve()
    target_path = Path(stored_path_str).resolve()
    try:
        target_path.relative_to(storage_root)
    except ValueError:
        logger.warning(
            "Prevented deletion attempt outside storage directory: %s outside %s",
            stored_path_str,
            storage_root,
        )
        return
    try:
        target_path.unlink(missing_ok=True)
    except Exception as exc:
        logger.warning("Failed to delete storage file %s: %s", target_path, type(exc).__name__)
