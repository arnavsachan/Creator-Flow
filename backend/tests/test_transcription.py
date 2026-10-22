import io
import json
import logging
from pathlib import Path
import shutil
import subprocess
from unittest.mock import MagicMock, patch
import uuid

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.shorts import ShortsJob
from app.services.media import MediaValidationError
import app.services.transcription as transcription_module

TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=test_engine,
)

ffmpeg_available = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


@pytest.fixture(autouse=True)
def setup_test_db(tmp_path: Path):
    Base.metadata.create_all(bind=test_engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    storage_dir = tmp_path / "shorts_storage"
    storage_dir.mkdir(parents=True, exist_ok=True)
    models_dir = tmp_path / "models_storage"
    models_dir.mkdir(parents=True, exist_ok=True)

    import app.db.session as app_session
    app_session._engine = test_engine
    app_session._session_factory = TestingSessionLocal

    test_settings = Settings(
        ENVIRONMENT="test",
        SHORTS_STORAGE_DIR=storage_dir,
        WHISPER_MODEL_DIR=models_dir,
        SHORTS_ENABLED_ENVIRONMENTS=["development", "test"],
        SHORTS_MAX_UPLOAD_MB=10,
        SHORTS_MAX_DURATION_SECONDS=3600,
        SHORTS_MAX_CLIP_SECONDS=180,
        TRANSCRIBE_MAX_SECONDS=600,
        WHISPER_MODEL_SIZE="medium",
        WHISPER_DEVICE="auto",
        WHISPER_LANGUAGE="",
        WHISPER_INITIAL_PROMPT=(
            "Yeh ek Hinglish video hai, jisme Hindi aur English dono mix hain. "
            "Bhai, aaj hum ek important topic ke baare me baat karenge."
        ),
    )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = lambda: test_settings

    # Reset in-memory transcription lock
    transcription_module.release_transcription_lock(
        transcription_module.get_active_transcription_job_id() or ""
    )
    with transcription_module._STATE_MUTEX:
        transcription_module._ACTIVE_JOB_ID = None

    yield test_settings

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)
    with transcription_module._STATE_MUTEX:
        transcription_module._ACTIVE_JOB_ID = None


@pytest.fixture
def video_with_audio_path(tmp_path: Path) -> Path:
    if not ffmpeg_available:
        pytest.skip("FFmpeg not installed on host")

    video_file = tmp_path / "sample_audio.mp4"
    cmd = [
        "ffmpeg",
        "-y",
        "-f", "lavfi",
        "-i", "testsrc=duration=2:size=320x240:rate=30",
        "-f", "lavfi",
        "-i", "sine=frequency=1000:duration=2",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-pix_fmt", "yuv420p",
        str(video_file),
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        pytest.skip("Failed to generate test video with audio")
    return video_file


@pytest.fixture
def video_without_audio_path(tmp_path: Path) -> Path:
    if not ffmpeg_available:
        pytest.skip("FFmpeg not installed on host")

    video_file = tmp_path / "sample_no_audio.mp4"
    cmd = [
        "ffmpeg",
        "-y",
        "-f", "lavfi",
        "-i", "testsrc=duration=2:size=320x240:rate=30",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        str(video_file),
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        pytest.skip("Failed to generate test video without audio")
    return video_file


def _upload_job(client: TestClient, file_path: Path, filename: str = "video.mp4") -> dict:
    with open(file_path, "rb") as f:
        resp = client.post(
            "/api/v1/shorts/jobs",
            files={"file": (filename, f, "video/mp4")},
        )
    assert resp.status_code == 201
    return resp.json()["data"]


def test_transcribe_package_unavailable_returns_503(client: TestClient, video_with_audio_path: Path):
    job = _upload_job(client, video_with_audio_path)
    job_id = job["id"]

    with patch("app.api.routes.shorts.is_faster_whisper_available", return_value=False):
        resp = client.post(f"/api/v1/shorts/jobs/{job_id}/transcribe")
        assert resp.status_code == 503
        assert resp.json()["detail"] == "TRANSCRIPTION_UNAVAILABLE"


def test_transcribe_unknown_job_returns_404(client: TestClient):
    random_id = str(uuid.uuid4())
    resp_post = client.post(f"/api/v1/shorts/jobs/{random_id}/transcribe")
    assert resp_post.status_code == 404
    assert resp_post.json()["detail"] == "JOB_NOT_FOUND"

    resp_get = client.get(f"/api/v1/shorts/jobs/{random_id}/transcript")
    assert resp_get.status_code == 404
    assert resp_get.json()["detail"] == "JOB_NOT_FOUND"


def test_transcribe_no_audio_stream_returns_400(client: TestClient, video_without_audio_path: Path):
    job = _upload_job(client, video_without_audio_path)
    job_id = job["id"]

    with patch("app.api.routes.shorts.is_faster_whisper_available", return_value=True):
        resp = client.post(f"/api/v1/shorts/jobs/{job_id}/transcribe")
        assert resp.status_code == 400
        assert resp.json()["detail"] == "NO_AUDIO_STREAM"

    # GET returns failed with error_code NO_AUDIO_STREAM
    get_resp = client.get(f"/api/v1/shorts/jobs/{job_id}/transcript")
    assert get_resp.status_code == 200
    data = get_resp.json()["data"]
    assert data["state"] == "failed"
    assert data["errorCode"] == "NO_AUDIO_STREAM"


def test_transcribe_busy_returns_409(client: TestClient, video_with_audio_path: Path):
    job = _upload_job(client, video_with_audio_path)
    job_id = job["id"]

    with patch("app.api.routes.shorts.is_faster_whisper_available", return_value=True):
        # Acquire lock manually for another job
        transcription_module.acquire_transcription_lock("other-active-job")
        try:
            resp = client.post(f"/api/v1/shorts/jobs/{job_id}/transcribe")
            assert resp.status_code == 409
            assert resp.json()["detail"] == "TRANSCRIPTION_BUSY"
        finally:
            transcription_module.release_transcription_lock("other-active-job")


def test_transcribe_success_state_transitions(
    client: TestClient,
    video_with_audio_path: Path,
    setup_test_db: Settings,
):
    job = _upload_job(client, video_with_audio_path)
    job_id = job["id"]

    mock_segments = [
        {"start": 0.0, "end": 1.0, "text": "Namaste dosto"},
        {"start": 1.0, "end": 2.0, "text": "swagat hai aapka"},
    ]

    # Initial state should be none
    get_init = client.get(f"/api/v1/shorts/jobs/{job_id}/transcript")
    assert get_init.status_code == 200
    assert get_init.json()["data"]["state"] == "none"

    with patch("app.api.routes.shorts.is_faster_whisper_available", return_value=True), \
         patch("app.services.transcription.transcribe_audio_file") as mock_transcribe:
        mock_transcribe.return_value = (mock_segments, "hi", "medium", "cpu")

        resp = client.post(f"/api/v1/shorts/jobs/{job_id}/transcribe")
        assert resp.status_code == 202
        body = resp.json()
        assert body["data"]["state"] == "running"

    # Since TestClient executes BackgroundTasks synchronously, it should now be done
    get_done = client.get(f"/api/v1/shorts/jobs/{job_id}/transcript")
    assert get_done.status_code == 200
    data = get_done.json()["data"]
    assert data["state"] == "done"
    assert data["errorCode"] is None
    assert data["languageDetected"] == "hi"
    assert data["modelSize"] == "medium"
    assert data["deviceUsed"] == "cpu"
    assert len(data["segments"]) == 2
    assert data["segments"][0]["text"] == "Namaste dosto"
    assert data["segments"][0]["start"] == 0.0


def test_interrupted_recovery(client: TestClient, video_with_audio_path: Path, setup_test_db: Settings):
    job = _upload_job(client, video_with_audio_path)
    job_id = job["id"]

    # Write a "running" state to the sidecar file while no task is in memory
    transcription_module.write_transcript_state(setup_test_db.SHORTS_STORAGE_DIR, job_id, "running")

    # Ensure no active memory lock exists
    with transcription_module._STATE_MUTEX:
        transcription_module._ACTIVE_JOB_ID = None

    get_resp = client.get(f"/api/v1/shorts/jobs/{job_id}/transcript")
    assert get_resp.status_code == 200
    data = get_resp.json()["data"]
    assert data["state"] == "failed"
    assert data["errorCode"] == "INTERRUPTED"


def test_transcribe_receives_numpy_ndarray(setup_test_db: Settings):
    """
    model.transcribe must receive a numpy ndarray, never a str or Path.
    """
    audio_array = np.zeros(16000, dtype=np.float32)

    received_audio = []

    class FakeSegment:
        start = 0.0
        end = 1.0
        text = "Hello world"

    class FakeInfo:
        language = "en"

    mock_model = MagicMock()

    def fake_transcribe(audio, **kwargs):
        received_audio.append(audio)
        return ([FakeSegment()], FakeInfo())

    mock_model.transcribe.side_effect = fake_transcribe

    mock_whisper_cls = MagicMock(return_value=mock_model)
    fake_module = MagicMock()
    fake_module.WhisperModel = mock_whisper_cls

    with patch.dict("sys.modules", {"faster_whisper": fake_module}):
        transcription_module.transcribe_audio_file(
            audio_array=audio_array,
            settings=setup_test_db,
        )

    assert len(received_audio) == 1
    assert isinstance(received_audio[0], np.ndarray)
    assert not isinstance(received_audio[0], (str, Path))
    assert received_audio[0].dtype == np.float32


def test_cuda_error_during_transcribe_falls_back_to_cpu(setup_test_db: Settings):
    """
    A cuda error raised DURING transcribe/iteration (not at model load)
    cleanly falls back to CPU, and device_used == 'cpu'.
    """
    audio_array = np.zeros(16000, dtype=np.float32)

    class FakeSegment:
        start = 0.0
        end = 1.0
        text = "cpu recovered text"

    class FakeInfo:
        language = "hi"

    # Generator that raises during iteration on CUDA
    def cuda_failing_generator():
        raise RuntimeError("Library cublas64_12.dll is not found or cannot be loaded")
        yield  # make it a generator

    def fake_init(model_size, device, compute_type, download_root, cpu_threads):
        fake_model = MagicMock()
        if device == "cuda":
            fake_model.transcribe.return_value = (cuda_failing_generator(), FakeInfo())
        else:
            fake_model.transcribe.return_value = ([FakeSegment()], FakeInfo())
        return fake_model

    mock_whisper_cls = MagicMock(side_effect=fake_init)
    fake_module = MagicMock()
    fake_module.WhisperModel = mock_whisper_cls

    with patch.dict("sys.modules", {"faster_whisper": fake_module}):
        segments, lang, model_size, device_used = transcription_module.transcribe_audio_file(
            audio_array=audio_array,
            settings=setup_test_db,
        )

    assert device_used == "cpu"
    assert lang == "hi"
    assert len(segments) == 1
    assert segments[0]["text"] == "cpu recovered text"


def test_empty_and_non_empty_language_and_initial_prompt(setup_test_db: Settings):
    """
    Verifies task='translate' and language='hi' are explicitly passed to transcribe,
    audio_array is passed positionally first, and initial_prompt is completely excluded.
    """
    audio_array = np.zeros(16000, dtype=np.float32)

    passed_args = []
    passed_kwargs = []

    class FakeSegment:
        start = 0.0
        end = 1.0
        text = "testing translation"

    class FakeInfo:
        language = "hi"

    mock_model = MagicMock()

    def fake_transcribe(*args, **kwargs):
        passed_args.append(args)
        passed_kwargs.append(kwargs)
        return ([FakeSegment()], FakeInfo())

    mock_model.transcribe.side_effect = fake_transcribe
    mock_whisper_cls = MagicMock(return_value=mock_model)
    fake_module = MagicMock()
    fake_module.WhisperModel = mock_whisper_cls

    with patch.dict("sys.modules", {"faster_whisper": fake_module}):
        transcription_module.transcribe_audio_file(audio_array, setup_test_db)
        assert len(passed_args) == 1
        assert passed_args[0][0] is audio_array
        k = passed_kwargs[-1]
        assert k.get("language") == "hi"
        assert k.get("task") == "translate"
        assert k.get("condition_on_previous_text") is False
        assert "initial_prompt" not in k
        assert "prefix" not in k
        assert k.get("vad_filter") is True


def test_zero_segments_state_is_done(
    client: TestClient,
    video_with_audio_path: Path,
    setup_test_db: Settings,
):
    """
    Zero segments produces state 'done' with an empty list, not failed.
    """
    job = _upload_job(client, video_with_audio_path)
    job_id = job["id"]

    with patch("app.api.routes.shorts.is_faster_whisper_available", return_value=True), \
         patch("app.services.transcription.transcribe_audio_file") as mock_transcribe:
        mock_transcribe.return_value = ([], "en", "medium", "cpu")

        resp = client.post(f"/api/v1/shorts/jobs/{job_id}/transcribe")
        assert resp.status_code == 202

    get_resp = client.get(f"/api/v1/shorts/jobs/{job_id}/transcript")
    assert get_resp.status_code == 200
    data = get_resp.json()["data"]
    assert data["state"] == "done"
    assert data["errorCode"] is None
    assert data["segments"] == []


def test_temp_wav_deleted_on_success_and_failure(
    setup_test_db: Settings,
    video_with_audio_path: Path,
):
    """
    Temp wav is deleted on both success and failure.
    """
    storage_dir = setup_test_db.SHORTS_STORAGE_DIR
    job_id = str(uuid.uuid4())
    temp_wav = transcription_module.get_temp_audio_path(storage_dir, job_id)

    # 1. On success
    with patch("app.services.transcription.transcribe_audio_file", return_value=([], "hi", "medium", "cpu")):
        transcription_module.process_transcription_background(
            job_id=job_id,
            stored_video_path_str=str(video_with_audio_path),
            duration_seconds=2.0,
            settings=setup_test_db,
        )
    assert not temp_wav.exists()

    # 2. On failure
    job_id_fail = str(uuid.uuid4())
    temp_wav_fail = transcription_module.get_temp_audio_path(storage_dir, job_id_fail)
    with patch("app.services.transcription.transcribe_audio_file", side_effect=RuntimeError("transcribe crashed")):
        transcription_module.process_transcription_background(
            job_id=job_id_fail,
            stored_video_path_str=str(video_with_audio_path),
            duration_seconds=2.0,
            settings=setup_test_db,
        )
    assert not temp_wav_fail.exists()


def test_failure_logged_server_side_and_clean_api_response(
    client: TestClient,
    video_with_audio_path: Path,
    setup_test_db: Settings,
    caplog: pytest.LogCaptureFixture,
):
    """
    Failure is logged server-side with traceback (logger.exception)
    and the API error code is still PROCESSING_FAILED with no traceback in response.
    """
    job = _upload_job(client, video_with_audio_path)
    job_id = job["id"]

    with patch("app.api.routes.shorts.is_faster_whisper_available", return_value=True), \
         patch("app.services.transcription.transcribe_audio_file") as mock_transcribe, \
         caplog.at_level(logging.ERROR):
        mock_transcribe.side_effect = RuntimeError("Fatal library internal crash: 0x80004005")

        resp = client.post(f"/api/v1/shorts/jobs/{job_id}/transcribe")
        assert resp.status_code == 202

    # Check server-side logs have the exception
    assert any("Fatal library internal crash" in record.message or (record.exc_info is not None) for record in caplog.records)

    # Check client response has only clean code
    get_resp = client.get(f"/api/v1/shorts/jobs/{job_id}/transcript")
    assert get_resp.status_code == 200
    data = get_resp.json()["data"]
    assert data["state"] == "failed"
    assert data["errorCode"] == "PROCESSING_FAILED"
    # Ensure no library or traceback details in response
    assert "0x80004005" not in json.dumps(data)
    assert "Fatal" not in json.dumps(data)


def test_delete_job_removes_sidecar_files(
    client: TestClient,
    video_with_audio_path: Path,
    setup_test_db: Settings,
):
    job = _upload_job(client, video_with_audio_path)
    job_id = job["id"]

    storage_dir = setup_test_db.SHORTS_STORAGE_DIR
    transcript_file = transcription_module.get_transcript_path(storage_dir, job_id)
    state_file = transcription_module.get_state_path(storage_dir, job_id)
    temp_wav = transcription_module.get_temp_audio_path(storage_dir, job_id)

    transcript_file.write_text(json.dumps({"test": "data"}), encoding="utf-8")
    state_file.write_text(json.dumps({"state": "done"}), encoding="utf-8")
    temp_wav.write_bytes(b"WAV DATA")

    assert transcript_file.exists()
    assert state_file.exists()
    assert temp_wav.exists()

    del_resp = client.delete(f"/api/v1/shorts/jobs/{job_id}")
    assert del_resp.status_code == 200

    assert not transcript_file.exists()
    assert not state_file.exists()
    assert not temp_wav.exists()


def test_sidecar_filenames_never_contain_user_filenames(
    client: TestClient,
    video_with_audio_path: Path,
    setup_test_db: Settings,
):
    nasty_filename = "malicious..user../name_with_special$#chars.mp4"
    job = _upload_job(client, video_with_audio_path, filename=nasty_filename)
    job_id = job["id"]

    with patch("app.api.routes.shorts.is_faster_whisper_available", return_value=True), \
         patch("app.services.transcription.transcribe_audio_file") as mock_transcribe:
        mock_transcribe.return_value = (
            [{"start": 0.0, "end": 1.0, "text": "safe transcript"}],
            "en",
            "medium",
            "cpu",
        )
        resp = client.post(f"/api/v1/shorts/jobs/{job_id}/transcribe")
        assert resp.status_code == 202

    storage_dir = setup_test_db.SHORTS_STORAGE_DIR
    files_in_storage = [p.name for p in storage_dir.iterdir()]

    expected_transcript = f"{job_id}.transcript.json"
    expected_state = f"{job_id}.transcript.state.json"

    assert expected_transcript in files_in_storage
    assert expected_state in files_in_storage

    for f_name in files_in_storage:
        assert "malicious" not in f_name
        assert "special" not in f_name
        assert "user" not in f_name


def test_setup_windows_cuda_dlls_safe_execution(monkeypatch):
    """
    Verifies that setup_windows_cuda_dlls runs safely without throwing exceptions,
    and correctly handles Windows environments.
    """
    # Test on os.name == 'nt'
    monkeypatch.setattr("os.name", "nt")
    transcription_module.setup_windows_cuda_dlls()

    # Test on non-Windows
    monkeypatch.setattr("os.name", "posix")
    transcription_module.setup_windows_cuda_dlls()


def test_transcribe_speech_whisper_cuda_fallback(monkeypatch, setup_test_db):
    """
    Verifies that if configured for 'cuda' and CUDA throws at runtime,
    transcribe_speech_whisper falls back to CPU and returns successfully.
    """
    settings = setup_test_db
    settings.WHISPER_DEVICE = "cuda"

    dummy_audio = np.zeros(16000, dtype=np.float32)

    cuda_call_count = 0
    cpu_call_count = 0

    class MockSegment:
        def __init__(self, start, end, text):
            self.start = start
            self.end = end
            self.text = text

    class MockWhisperModel:
        def __init__(self, model_size, device="cpu", **kwargs):
            nonlocal cuda_call_count, cpu_call_count
            self.device = device
            if device == "cuda":
                cuda_call_count += 1
                raise RuntimeError("CUDA out of memory or missing DLL")
            else:
                cpu_call_count += 1

        def transcribe(self, audio, **kwargs):
            info = MagicMock()
            info.language = "en"
            return ([MockSegment(0.0, 1.0, "Fallback hello")], info)

    import sys
    mock_fw = MagicMock()
    mock_fw.WhisperModel = MockWhisperModel
    with patch.dict(sys.modules, {"faster_whisper": mock_fw}):
        segments, lang, model_sz, dev_used = transcription_module.transcribe_audio_file(
            audio_array=dummy_audio,
            settings=settings,
        )

    assert cuda_call_count == 1
    assert cpu_call_count == 1
    assert dev_used == "cpu"
    assert len(segments) == 1
    assert segments[0]["text"] == "Fallback hello"
