from datetime import datetime, timezone
import importlib.util
import json
import logging
import os
from pathlib import Path
import subprocess
import threading
from typing import Any, Optional
import wave

from app.core.config import Settings
from app.schemas.shorts import TranscriptData, TranscriptSegment
from app.services.media import (
    MediaValidationError,
    safe_delete_storage_file,
    safe_resolve_storage_file,
)

logger = logging.getLogger(__name__)


def setup_windows_cuda_dlls() -> None:
    """
    On Windows (os.name == 'nt'), locates site-packages/nvidia/*/bin directories
    and registers them via os.add_dll_directory(...) and prepends them to os.environ["PATH"]
    so that CTranslate2 and faster-whisper can find CUDA, cuBLAS, and cuDNN DLLs.
    Guarded so it never crashes if directories do not exist.
    """
    if os.name != "nt":
        return

    try:
        import site
        import sys

        candidate_roots: list[Path] = []
        if hasattr(site, "getsitepackages"):
            try:
                for sp in site.getsitepackages():
                    candidate_roots.append(Path(sp))
            except Exception:
                pass
        for p in sys.path:
            if "site-packages" in p:
                candidate_roots.append(Path(p))
        if sys.prefix:
            candidate_roots.append(Path(sys.prefix) / "Lib" / "site-packages")

        added_paths: set[str] = set()
        for root in candidate_roots:
            nvidia_dir = root / "nvidia"
            if not nvidia_dir.is_dir():
                continue
            for bin_dir in nvidia_dir.glob("*/bin"):
                if bin_dir.is_dir():
                    bin_dir_str = str(bin_dir.resolve())
                    if bin_dir_str not in added_paths:
                        added_paths.add(bin_dir_str)
                        if hasattr(os, "add_dll_directory"):
                            try:
                                os.add_dll_directory(bin_dir_str)
                            except OSError:
                                pass
                            except Exception:
                                pass
                        cur_path = os.environ.get("PATH", "")
                        if bin_dir_str not in cur_path:
                            os.environ["PATH"] = bin_dir_str + os.pathsep + cur_path
        if added_paths:
            logger.info("Registered Windows CUDA DLL directories: %s", list(added_paths))
    except Exception as exc:
        logger.warning("Failed to register Windows CUDA DLL directories: %s", exc)


# Initialize Windows CUDA DLL search paths at module load
setup_windows_cuda_dlls()

# Process-wide locks and state
_TRANSCRIPTION_LOCK = threading.Lock()
_ACTIVE_JOB_ID: Optional[str] = None
_STATE_MUTEX = threading.Lock()


def is_faster_whisper_available() -> bool:
    """
    Checks lazily if faster_whisper and numpy are importable without importing heavy modules.
    """
    try:
        return (
            importlib.util.find_spec("faster_whisper") is not None
            and importlib.util.find_spec("numpy") is not None
        )
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


def load_audio_wav_to_numpy(wav_path: Path) -> Any:
    """
    Reads a 16 kHz mono 16-bit PCM WAV file using Python's standard 'wave' module
    and converts it to a 1D float32 numpy array normalized to [-1.0, 1.0].
    Raises TRANSCRIPTION_UNAVAILABLE if numpy is missing.
    """
    try:
        import numpy as np
    except ImportError:
        raise MediaValidationError("TRANSCRIPTION_UNAVAILABLE")

    try:
        with wave.open(str(wav_path.resolve()), "rb") as wf:
            n_frames = wf.getnframes()
            frames = wf.readframes(n_frames)
        audio_int16 = np.frombuffer(frames, dtype=np.int16)
        return audio_int16.astype(np.float32) / 32768.0
    except Exception as exc:
        logger.exception("Failed to read WAV audio file with wave library: %s", exc)
        raise MediaValidationError("PROCESSING_FAILED")


def _check_and_raise_download_error(exc: Exception) -> None:
    msg = str(exc).lower()
    name = type(exc).__name__.lower()
    download_keywords = ("connection", "download", "huggingface", "http", "not found", "offline", "timeout", "socket")
    if any(k in msg or k in name for k in download_keywords):
        raise MediaValidationError("MODEL_DOWNLOAD_FAILED")
    raise MediaValidationError("PROCESSING_FAILED")


def transcribe_audio_file(
    audio_array: Any,
    settings: Settings,
) -> tuple[list[dict], str, str, str]:
    """
    Performs speech transcription using faster-whisper.
    Lazy imports the library. Passes audio_array (float32 numpy array) to model.transcribe.
    Never passes a path or file object.
    Automatically falls back to CPU if CUDA fails during model loading or during transcribe/iteration.
    Returns (segments, language_detected, model_size, device_used).
    """
    setup_windows_cuda_dlls()
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise MediaValidationError("TRANSCRIPTION_UNAVAILABLE")

    try:
        import numpy as np
    except ImportError:
        raise MediaValidationError("TRANSCRIPTION_UNAVAILABLE")

    if not isinstance(audio_array, np.ndarray):
        raise TypeError(f"audio_array must be a numpy ndarray, got {type(audio_array).__name__}")

    model_size = settings.WHISPER_MODEL_SIZE
    model_dir = settings.WHISPER_MODEL_DIR
    model_dir.mkdir(parents=True, exist_ok=True)
    threads = settings.WHISPER_CPU_THREADS

    configured_device = settings.WHISPER_DEVICE
    configured_compute = settings.WHISPER_COMPUTE_TYPE

    # Build kwargs for model.transcribe
    transcribe_kwargs: dict[str, Any] = {
        "beam_size": 5,
    }

    model = None
    device_used = "cpu"
    raw_segments: list[Any] = []
    info = None

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
            segments_gen, info = model.transcribe(
                audio_array,
                task="translate",
                language="hi",
                condition_on_previous_text=False,
                vad_filter=True,
                **transcribe_kwargs,
            )
            # Materialize the lazy generator INSIDE the CUDA try block to catch inference errors
            raw_segments = list(segments_gen)
            device_used = "cuda"
        except Exception as cuda_exc:
            logger.warning(
                "CUDA transcription failed (%s: %s). Falling back to CPU.",
                type(cuda_exc).__name__,
                cuda_exc,
                exc_info=True,
            )
            model = None

        # Step 2: Fallback to CPU if CUDA failed during init, transcribe, or iteration
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
                segments_gen, info = model.transcribe(
                    audio_array,
                    task="translate",
                    language="hi",
                    condition_on_previous_text=False,
                    vad_filter=True,
                    **transcribe_kwargs,
                )
                raw_segments = list(segments_gen)
                device_used = "cpu"
            except Exception as cpu_exc:
                logger.exception("Whisper CPU transcription failed")
                _check_and_raise_download_error(cpu_exc)

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
            segments_gen, info = model.transcribe(
                audio_array,
                task="translate",
                language="hi",
                condition_on_previous_text=False,
                vad_filter=True,
                **transcribe_kwargs,
            )
            raw_segments = list(segments_gen)
            device_used = "cuda"
        except Exception as exc:
            logger.warning(
                "CUDA transcription failed (%s: %s). Falling back to CPU.",
                type(exc).__name__,
                exc,
                exc_info=True,
            )
            cpu_compute = "int8" if configured_compute == "auto" else configured_compute
            try:
                model = WhisperModel(
                    model_size,
                    device="cpu",
                    compute_type=cpu_compute,
                    download_root=str(model_dir),
                    cpu_threads=threads,
                )
                segments_gen, info = model.transcribe(
                    audio_array,
                    task="translate",
                    language="hi",
                    condition_on_previous_text=False,
                    vad_filter=True,
                    **transcribe_kwargs,
                )
                raw_segments = list(segments_gen)
                device_used = "cpu"
            except Exception as cpu_exc:
                logger.exception("Whisper CPU fallback transcription failed")
                _check_and_raise_download_error(cpu_exc)

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
            segments_gen, info = model.transcribe(
                audio_array,
                task="translate",
                language="hi",
                condition_on_previous_text=False,
                vad_filter=True,
                **transcribe_kwargs,
            )
            raw_segments = list(segments_gen)
            device_used = "cpu"
        except Exception as exc:
            logger.exception("Whisper CPU transcription failed")
            _check_and_raise_download_error(exc)

    segments = []
    for s in raw_segments:
        text = getattr(s, "text", "") or ""
        segments.append({
            "start": round(getattr(s, "start", 0.0), 2),
            "end": round(getattr(s, "end", 0.0), 2),
            "text": text.strip(),
        })

    detected_lang = info.language if info and getattr(info, "language", None) else "unknown"
    return segments, detected_lang, model_size, device_used


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

            # Read 16 kHz mono WAV into float32 numpy array
            audio_array = load_audio_wav_to_numpy(temp_wav)

            segments, lang, model_size, device_used = transcribe_audio_file(
                audio_array=audio_array,
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
        logger.exception("Transcription failed with error code: %s", err.code)
        write_transcript_state(storage_dir, job_id, "failed", err.code)
    except Exception as exc:
        logger.exception("Transcription failed unexpectedly: %s", type(exc).__name__)
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
