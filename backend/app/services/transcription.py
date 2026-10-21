from datetime import datetime, timezone
import importlib.util
import json
import logging
from pathlib import Path
import subprocess
import threading
from typing import Optional

from app.core.config import Settings
from app.schemas.shorts import TranscriptData, TranscriptSegment
from app.services.media import (
    MediaValidationError,
    safe_delete_storage_file,
    safe_resolve_storage_file,
)

logger = logging.getLogger(__name__)

# Process-wide locks and state
_TRANSCRIPTION_LOCK = threading.Lock()
_ACTIVE_JOB_ID: Optional[str] = None
_STATE_MUTEX = threading.Lock()


def is_faster_whisper_available() -> bool:
    """
    Checks lazily if faster_whisper is importable without importing heavy modules.
    """
    try:
        return importlib.util.find_spec("faster_whisper") is not None
    except Exception:
        return False


def is_transcription_busy() -> bool:
    with _STATE_MUTEX:
        return _ACTIVE_JOB_ID is not None


def acquire_transcription_lock(job_id: str) -> bool:
    with _STATE_MUTEX:
        global _ACTIVE_JOB_ID
        if _ACTIVE_JOB_ID is not None:
            return False
        _ACTIVE_JOB_ID = job_id
        return True


def release_transcription_lock(job_id: str) -> None:
    with _STATE_MUTEX:
        global _ACTIVE_JOB_ID
        if _ACTIVE_JOB_ID == job_id:
            _ACTIVE_JOB_ID = None


def get_active_transcription_job_id() -> Optional[str]:
    with _STATE_MUTEX:
        return _ACTIVE_JOB_ID


def get_transcript_path(storage_dir: Path, job_id: str) -> Path:
    safe_id = Path(job_id).name
    return (storage_dir / f"{safe_id}.transcript.json").resolve()


def get_state_path(storage_dir: Path, job_id: str) -> Path:
    safe_id = Path(job_id).name
    return (storage_dir / f"{safe_id}.transcript.state.json").resolve()


def get_temp_audio_path(storage_dir: Path, job_id: str) -> Path:
    safe_id = Path(job_id).name
    return (storage_dir / f"{safe_id}.temp.wav").resolve()


def write_transcript_state(
    storage_dir: Path,
    job_id: str,
    state: str,
    error_code: Optional[str] = None,
) -> None:
    state_file = get_state_path(storage_dir, job_id)
    data = {
        "state": state,
        "error_code": error_code,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    tmp_file = state_file.with_suffix(".tmp")
    try:
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        tmp_file.replace(state_file)
    except Exception as exc:
        logger.error("Failed to write transcript state: %s", type(exc).__name__)
        tmp_file.unlink(missing_ok=True)


def read_transcript_state(storage_dir: Path, job_id: str) -> tuple[str, Optional[str]]:
    """
    Returns (state, error_code). If state is 'running' but the job is not actively
    being processed in this server process, marks it failed with error_code INTERRUPTED.
    """
    state_file = get_state_path(storage_dir, job_id)
    if not state_file.exists():
        return ("none", None)
    try:
        with open(state_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        state = data.get("state", "none")
        error_code = data.get("error_code")
        if state == "running":
            if get_active_transcription_job_id() != job_id:
                write_transcript_state(storage_dir, job_id, "failed", "INTERRUPTED")
                return ("failed", "INTERRUPTED")
        return (state, error_code)
    except Exception as exc:
        logger.error("Failed to read transcript state: %s", type(exc).__name__)
        return ("none", None)


def has_audio_stream(file_path: Path, ffprobe_bin: str = "ffprobe", timeout: int = 15) -> bool:
    """
    Checks if a media file contains at least one audio stream using ffprobe.
    """
    resolved_path = file_path.resolve()
    if not resolved_path.exists() or not resolved_path.is_file():
        return False

    cmd = [
        ffprobe_bin,
        "-v", "error",
        "-show_entries", "stream=codec_type",
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
        if proc.returncode != 0:
            return False
        data = json.loads(proc.stdout)
        streams = data.get("streams", [])
        return any(s.get("codec_type") == "audio" for s in streams)
    except Exception as exc:
        logger.warning("ffprobe audio stream check failed: %s", type(exc).__name__)
        return False


def extract_audio(
    input_path: Path,
    output_wav_path: Path,
    max_seconds: int,
    ffmpeg_bin: str = "ffmpeg",
    ffprobe_bin: str = "ffprobe",
    timeout: int = 300,
) -> None:
    """
    Extracts up to max_seconds of 16 kHz mono WAV audio using ffmpeg.
    Raises MediaValidationError with NO_AUDIO_STREAM or PROCESSING_FAILED.
    """
    if not has_audio_stream(input_path, ffprobe_bin=ffprobe_bin):
        raise MediaValidationError("NO_AUDIO_STREAM")

    output_wav_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg_bin,
        "-y",
        "-ss", "0",
        "-t", str(max_seconds),
        "-i", str(input_path.resolve()),
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        str(output_wav_path.resolve()),
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
        logger.error("ffmpeg binary not found at %s", ffmpeg_bin)
        raise MediaValidationError("PROCESSING_FAILED")
    except subprocess.TimeoutExpired:
        logger.error("ffmpeg audio extraction timed out after %s seconds", timeout)
        raise MediaValidationError("PROCESSING_FAILED")
    except Exception as exc:
        logger.error("ffmpeg audio extraction failed: %s", type(exc).__name__)
        raise MediaValidationError("PROCESSING_FAILED")

    if proc.returncode != 0:
        logger.error("ffmpeg audio extraction failed with exit code %s", proc.returncode)
        raise MediaValidationError("PROCESSING_FAILED")


def _check_and_raise_download_error(exc: Exception) -> None:
    msg = str(exc).lower()
    name = type(exc).__name__.lower()
    download_keywords = ("connection", "download", "huggingface", "http", "not found", "offline", "timeout", "socket")
    if any(k in msg or k in name for k in download_keywords):
        raise MediaValidationError("MODEL_DOWNLOAD_FAILED")
    raise MediaValidationError("PROCESSING_FAILED")


def transcribe_audio_file(
    audio_path: Path,
    settings: Settings,
) -> tuple[list[dict], str, str, str]:
    """
    Performs speech transcription using faster-whisper.
    Lazy imports the library. Automatically falls back to CPU if CUDA fails.
    Returns (segments, language_detected, model_size, device_used).
    """
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise MediaValidationError("TRANSCRIPTION_UNAVAILABLE")

    model_size = settings.WHISPER_MODEL_SIZE
    model_dir = settings.WHISPER_MODEL_DIR
    model_dir.mkdir(parents=True, exist_ok=True)
    threads = settings.WHISPER_CPU_THREADS

    configured_device = settings.WHISPER_DEVICE
    configured_compute = settings.WHISPER_COMPUTE_TYPE

    model = None
    device_used = "cpu"

    if configured_device == "auto":
        # Step 1: Attempt CUDA
        cuda_compute = "float16" if configured_compute == "auto" else configured_compute
        try:
            logger.info("Attempting Whisper initialization on CUDA (model=%s, compute=%s)", model_size, cuda_compute)
            model = WhisperModel(
                model_size,
                device="cuda",
                compute_type=cuda_compute,
                download_root=str(model_dir),
                cpu_threads=threads,
            )
            device_used = "cuda"
        except Exception as exc:
            logger.warning("CUDA initialization failed (%s: %s). Falling back to CPU.", type(exc).__name__, exc)
            model = None

        # Step 2: Fallback to CPU if CUDA failed
        if model is None:
            cpu_compute = "int8" if configured_compute == "auto" else configured_compute
            logger.info("Initializing Whisper model on CPU (model=%s, compute=%s)", model_size, cpu_compute)
            try:
                model = WhisperModel(
                    model_size,
                    device="cpu",
                    compute_type=cpu_compute,
                    download_root=str(model_dir),
                    cpu_threads=threads,
                )
                device_used = "cpu"
            except Exception as exc:
                logger.error("Whisper CPU initialization failed: %s", type(exc).__name__)
                _check_and_raise_download_error(exc)
    elif configured_device == "cuda":
        cuda_compute = "float16" if configured_compute == "auto" else configured_compute
        try:
            model = WhisperModel(
                model_size,
                device="cuda",
                compute_type=cuda_compute,
                download_root=str(model_dir),
                cpu_threads=threads,
            )
            device_used = "cuda"
        except Exception as exc:
            logger.error("Whisper CUDA initialization failed: %s", type(exc).__name__)
            _check_and_raise_download_error(exc)
    else:
        cpu_compute = "int8" if configured_compute == "auto" else configured_compute
        try:
            model = WhisperModel(
                model_size,
                device="cpu",
                compute_type=cpu_compute,
                download_root=str(model_dir),
                cpu_threads=threads,
            )
            device_used = "cpu"
        except Exception as exc:
            logger.error("Whisper CPU initialization failed: %s", type(exc).__name__)
            _check_and_raise_download_error(exc)

    # Perform transcription
    try:
        segments_gen, info = model.transcribe(
            str(audio_path.resolve()),
            language=settings.WHISPER_LANGUAGE or None,
            beam_size=5,
        )
        segments = []
        for s in segments_gen:
            segments.append({
                "start": round(s.start, 2),
                "end": round(s.end, 2),
                "text": s.text.strip(),
            })
        lang = info.language if info and getattr(info, "language", None) else (settings.WHISPER_LANGUAGE or "unknown")
        return segments, lang, model_size, device_used
    except Exception as exc:
        # If running on auto and CUDA crashed during transcription, retry on CPU
        if configured_device == "auto" and device_used == "cuda":
            logger.warning("CUDA execution error (%s: %s). Retrying transcription on CPU.", type(exc).__name__, exc)
            cpu_compute = "int8" if configured_compute == "auto" else configured_compute
            try:
                cpu_model = WhisperModel(
                    model_size,
                    device="cpu",
                    compute_type=cpu_compute,
                    download_root=str(model_dir),
                    cpu_threads=threads,
                )
                segments_gen, info = cpu_model.transcribe(
                    str(audio_path.resolve()),
                    language=settings.WHISPER_LANGUAGE or None,
                    beam_size=5,
                )
                segments = []
                for s in segments_gen:
                    segments.append({
                        "start": round(s.start, 2),
                        "end": round(s.end, 2),
                        "text": s.text.strip(),
                    })
                lang = info.language if info and getattr(info, "language", None) else (settings.WHISPER_LANGUAGE or "unknown")
                return segments, lang, model_size, "cpu"
            except Exception as cpu_exc:
                logger.error("CPU fallback transcription failed: %s", type(cpu_exc).__name__)
                _check_and_raise_download_error(cpu_exc)

        logger.error("Transcription execution failed: %s", type(exc).__name__)
        _check_and_raise_download_error(exc)


def process_transcription_background(
    job_id: str,
    stored_video_path_str: str,
    duration_seconds: float,
    settings: Settings,
) -> None:
    """
    Background worker function for speech transcription.
    Runs under the process-wide lock. Writes sidecar files and cleans up temp audio.
    """
    storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()
    temp_wav = get_temp_audio_path(storage_dir, job_id)
    write_transcript_state(storage_dir, job_id, "running")

    try:
        with _TRANSCRIPTION_LOCK:
            video_path = safe_resolve_storage_file(stored_video_path_str, storage_dir)
            extract_audio(
                input_path=video_path,
                output_wav_path=temp_wav,
                max_seconds=settings.TRANSCRIBE_MAX_SECONDS,
                ffmpeg_bin=settings.FFMPEG_BIN,
                ffprobe_bin=settings.FFPROBE_BIN,
            )

            segments, lang, model_size, device_used = transcribe_audio_file(
                audio_path=temp_wav,
                settings=settings,
            )

            truncated = duration_seconds > settings.TRANSCRIBE_MAX_SECONDS
            duration_covered = min(duration_seconds, float(settings.TRANSCRIBE_MAX_SECONDS))

            transcript_data = {
                "job_id": job_id,
                "segments": segments,
                "language_detected": lang,
                "duration_covered_seconds": duration_covered,
                "truncated": truncated,
                "model_size": model_size,
                "device_used": device_used,
            }

            transcript_file = get_transcript_path(storage_dir, job_id)
            tmp_json = transcript_file.with_suffix(".tmp")
            with open(tmp_json, "w", encoding="utf-8") as f:
                json.dump(transcript_data, f, indent=2, ensure_ascii=False)
            tmp_json.replace(transcript_file)

            write_transcript_state(storage_dir, job_id, "done")
    except MediaValidationError as err:
        logger.error("Transcription failed with error code: %s", err.code)
        write_transcript_state(storage_dir, job_id, "failed", err.code)
    except Exception as exc:
        logger.error("Transcription failed unexpectedly: %s", type(exc).__name__)
        write_transcript_state(storage_dir, job_id, "failed", "PROCESSING_FAILED")
    finally:
        temp_wav.unlink(missing_ok=True)
        release_transcription_lock(job_id)


def get_transcript_data(job_id: str, storage_dir: Path) -> TranscriptData:
    """
    Reads the current transcript data or state for a job.
    """
    state, error_code = read_transcript_state(storage_dir, job_id)
    if state == "done":
        transcript_file = get_transcript_path(storage_dir, job_id)
        if transcript_file.exists():
            try:
                with open(transcript_file, "r", encoding="utf-8") as f:
                    content = json.load(f)
                return TranscriptData(
                    job_id=job_id,
                    state="done",
                    error_code=None,
                    segments=[
                        TranscriptSegment(start=s["start"], end=s["end"], text=s["text"])
                        for s in content.get("segments", [])
                    ],
                    language_detected=content.get("language_detected"),
                    duration_covered_seconds=content.get("duration_covered_seconds"),
                    truncated=content.get("truncated", False),
                    model_size=content.get("model_size"),
                    device_used=content.get("device_used"),
                )
            except Exception as exc:
                logger.error("Failed to read completed transcript file: %s", type(exc).__name__)
                return TranscriptData(job_id=job_id, state="failed", error_code="PROCESSING_FAILED")

    return TranscriptData(
        job_id=job_id,
        state=state,
        error_code=error_code,
        segments=[],
        truncated=False,
    )


def delete_transcript_files(job_id: str, storage_dir: Path) -> None:
    """
    Safely deletes transcript sidecar files and temporary audio strictly within storage_dir.
    """
    safe_delete_storage_file(str(get_transcript_path(storage_dir, job_id)), storage_dir)
    safe_delete_storage_file(str(get_state_path(storage_dir, job_id)), storage_dir)
    safe_delete_storage_file(str(get_temp_audio_path(storage_dir, job_id)), storage_dir)
