import json
import logging
from pathlib import Path
import shutil
import subprocess
from unittest.mock import MagicMock, patch
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.shorts import ShortsClip, ShortsJob
from app.services.media import MediaValidationError
import app.services.highlights as highlights_module
from app.services.transcription import write_transcript_state, get_transcript_path

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
        AI_PROVIDER="gemini",
        GEMINI_API_KEY="test-secret-gemini-key-12345",
        AI_MODEL="gemini-2.5-flash",
        AI_REQUEST_TIMEOUT_SECONDS=60,
        HIGHLIGHT_MIN_SECONDS=15,
        HIGHLIGHT_MAX_SECONDS=60,
        HIGHLIGHT_MAX_SUGGESTIONS=5,
    )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = lambda: test_settings

    # Reset in-memory lock
    with highlights_module._STATE_MUTEX:
        highlights_module._ACTIVE_HIGHLIGHT_JOB_ID = None

    yield test_settings

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)
    with highlights_module._STATE_MUTEX:
        highlights_module._ACTIVE_HIGHLIGHT_JOB_ID = None


def _create_dummy_job_in_db(job_id: str, duration: float = 120.0) -> ShortsJob:
    db = TestingSessionLocal()
    job = ShortsJob(
        id=job_id,
        owner_id=None,
        original_filename="secret_user_presentation.mp4",
        stored_path=f"/fake/storage/path/{job_id}.mp4",
        size_bytes=1024 * 1024,
        duration_seconds=duration,
        width=1920,
        height=1080,
        status="uploaded",
        error_code=None,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    db.close()
    return job


def _write_dummy_transcript(storage_dir: Path, job_id: str, segments: list[dict], duration_covered: float = 120.0):
    write_transcript_state(storage_dir, job_id, "done")
    t_path = get_transcript_path(storage_dir, job_id)
    data = {
        "job_id": job_id,
        "segments": segments,
        "language_detected": "hi",
        "duration_covered_seconds": duration_covered,
        "truncated": False,
        "model_size": "medium",
        "device_used": "cpu",
    }
    with open(t_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def test_ai_not_configured_when_key_or_model_empty(tmp_path: Path):
    client = TestClient(app)
    job_id = str(uuid.uuid4())
    _create_dummy_job_in_db(job_id)

    # Key empty
    empty_key_settings = Settings(
        ENVIRONMENT="test",
        SHORTS_STORAGE_DIR=tmp_path / "shorts_storage",
        AI_PROVIDER="gemini",
        GEMINI_API_KEY="",
        AI_MODEL="gemini-2.5-flash",
    )
    app.dependency_overrides[get_settings] = lambda: empty_key_settings

    resp = client.post(f"/api/v1/shorts/jobs/{job_id}/highlights")
    assert resp.status_code == 503
    assert resp.json()["detail"] == "AI_NOT_CONFIGURED"

    # Model empty
    empty_model_settings = Settings(
        ENVIRONMENT="test",
        SHORTS_STORAGE_DIR=tmp_path / "shorts_storage",
        AI_PROVIDER="gemini",
        GEMINI_API_KEY="valid-key",
        AI_MODEL="",
    )
    app.dependency_overrides[get_settings] = lambda: empty_model_settings

    resp = client.post(f"/api/v1/shorts/jobs/{job_id}/highlights")
    assert resp.status_code == 503
    assert resp.json()["detail"] == "AI_NOT_CONFIGURED"


def test_transcript_required_when_no_transcript_or_zero_segments(setup_test_db):
    settings = setup_test_db
    client = TestClient(app)
    job_id = str(uuid.uuid4())
    _create_dummy_job_in_db(job_id)

    # Case 1: No transcript exists at all
    resp = client.post(f"/api/v1/shorts/jobs/{job_id}/highlights")
    assert resp.status_code == 409
    assert resp.json()["detail"] == "TRANSCRIPT_REQUIRED"

    # Case 2: Transcript state is 'done' but segments list is empty
    storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()
    _write_dummy_transcript(storage_dir, job_id, segments=[])

    resp = client.post(f"/api/v1/shorts/jobs/{job_id}/highlights")
    assert resp.status_code == 409
    assert resp.json()["detail"] == "TRANSCRIPT_REQUIRED"


def test_valid_gemini_json_accepted_and_privacy_checked(setup_test_db):
    settings = setup_test_db
    client = TestClient(app)
    job_id = str(uuid.uuid4())
    job = _create_dummy_job_in_db(job_id, duration=120.0)
    storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()

    segments = [
        {"start": 0.0, "end": 10.0, "text": "Namaste dosto, aaj hum naye AI tool ke baare me baat karenge."},
        {"start": 10.0, "end": 25.0, "text": "Yeh tool videos ko automatically short clips me convert karta hai."},
        {"start": 25.0, "end": 45.0, "text": "Iska workflow bohot fast aur reliable hai."},
        {"start": 45.0, "end": 70.0, "text": "Aap easily 9:16 vertical clips render kar sakte ho bina kisi issue ke."},
    ]
    _write_dummy_transcript(storage_dir, job_id, segments, duration_covered=70.0)

    gemini_response_payload = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": json.dumps([
                                {
                                    "start": 0.0,
                                    "end": 25.0,
                                    "title": "AI Video Tool Introduction",
                                    "reason": "Clear intro to the new tool features.",
                                },
                                {
                                    "start": 25.0,
                                    "end": 70.0,
                                    "title": "Fast Workflow & 9:16 Export",
                                    "reason": "Explains speed and vertical export workflow.",
                                },
                            ])
                        }
                    ],
                    "role": "model",
                },
                "finishReason": "STOP",
            }
        ]
    }

    recorded_requests = []

    def mock_post(url, headers=None, json=None, timeout=None):
        recorded_requests.append({"url": url, "headers": headers, "json": json})
        resp = httpx.Response(200, json=gemini_response_payload, request=httpx.Request("POST", url))
        return resp

    with patch("httpx.Client.post", side_effect=mock_post):
        # Trigger highlights via API
        resp = client.post(f"/api/v1/shorts/jobs/{job_id}/highlights")
        assert resp.status_code == 202
        assert resp.json()["data"]["state"] == "running"

        # Check privacy: Request body must contain transcript text, but NEVER the job ID or user filename
        assert len(recorded_requests) == 1
        req_sent = recorded_requests[0]
        prompt_sent = req_sent["json"]["contents"][0]["parts"][0]["text"]

        assert "Namaste dosto" in prompt_sent
        assert job_id not in prompt_sent
        assert job.original_filename not in prompt_sent
        assert job.stored_path not in prompt_sent

        # Check API key sent in x-goog-api-key header and NOT in URL
        assert req_sent["headers"]["x-goog-api-key"] == settings.GEMINI_API_KEY
        assert settings.GEMINI_API_KEY not in req_sent["url"]

        # Poll GET endpoint
        get_resp = client.get(f"/api/v1/shorts/jobs/{job_id}/highlights")
        assert get_resp.status_code == 200
        data = get_resp.json()["data"]
        assert data["state"] == "done"
        assert len(data["suggestions"]) == 2
        assert data["suggestions"][0]["title"] == "AI Video Tool Introduction"
        assert data["suggestions"][0]["start"] == 0.0
        assert data["suggestions"][0]["end"] == 25.0
        assert data["modelUsed"] == "gemini-2.5-flash"


def test_code_fenced_json_parsed(setup_test_db):
    settings = setup_test_db
    client = TestClient(app)
    job_id = str(uuid.uuid4())
    _create_dummy_job_in_db(job_id, duration=60.0)
    storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()

    segments = [
        {"start": 0.0, "end": 20.0, "text": "First section text."},
        {"start": 20.0, "end": 40.0, "text": "Second section text."},
    ]
    _write_dummy_transcript(storage_dir, job_id, segments, duration_covered=40.0)

    # Gemini wraps response in ```json ... ``` code fence
    fenced_text = "```json\n" + json.dumps([
        {
            "start": 0.0,
            "end": 20.0,
            "title": "Fenced Highlight",
            "reason": "Great point made here.",
        }
    ]) + "\n```"

    gemini_payload = {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": fenced_text}],
                }
            }
        ]
    }

    with patch("httpx.Client.post", return_value=httpx.Response(200, json=gemini_payload, request=httpx.Request("POST", "https://api.test"))):
        resp = client.post(f"/api/v1/shorts/jobs/{job_id}/highlights")
        assert resp.status_code == 202

        get_resp = client.get(f"/api/v1/shorts/jobs/{job_id}/highlights")
        assert get_resp.status_code == 200
        data = get_resp.json()["data"]
        assert data["state"] == "done"
        assert len(data["suggestions"]) == 1
        assert data["suggestions"][0]["title"] == "Fenced Highlight"


def test_sanitization_out_of_range_overlapping_injected_dropped(setup_test_db):
    settings = setup_test_db
    client = TestClient(app)
    job_id = str(uuid.uuid4())
    _create_dummy_job_in_db(job_id, duration=100.0)
    storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()

    segments = [
        {"start": 0.0, "end": 20.0, "text": "Seg 1"},
        {"start": 20.0, "end": 40.0, "text": "Seg 2"},
        {"start": 40.0, "end": 60.0, "text": "Seg 3"},
        {"start": 60.0, "end": 80.0, "text": "Seg 4"},
    ]
    _write_dummy_transcript(storage_dir, job_id, segments, duration_covered=80.0)

    # Return candidates with:
    # 1. Non-numeric start -> should drop
    # 2. Too short (< 15s) -> should drop
    # 3. Valid moment 1 (0 to 20s) -> should keep
    # 4. Overlapping moment (10 to 30s) -> should drop
    # 5. Out of range (> 80s) -> should drop
    # 6. Injected control characters and long title -> should sanitize/truncate
    # 7. Valid moment 2 (40 to 60s) -> should keep
    gemini_output = [
        {"start": "not-a-number", "end": 20.0, "title": "Bad Number", "reason": "Reason"},
        {"start": 0.0, "end": 5.0, "title": "Too Short", "reason": "Reason"},
        {"start": 0.0, "end": 20.0, "title": "Valid Moment 1", "reason": "Reason 1"},
        {"start": 10.0, "end": 30.0, "title": "Overlapping", "reason": "Overlaps with 0-20"},
        {"start": 90.0, "end": 120.0, "title": "Out of Range", "reason": "Exceeds duration"},
        {
            "start": 40.0,
            "end": 60.0,
            "title": "Control \x00 Characters \r\n and extremely long title exceeding seventy characters limit for testing",
            "reason": "Valid reason.",
        },
    ]

    gemini_payload = {
        "candidates": [
            {"content": {"parts": [{"text": json.dumps(gemini_output)}]}}
        ]
    }

    with patch("httpx.Client.post", return_value=httpx.Response(200, json=gemini_payload, request=httpx.Request("POST", "https://api.test"))):
        resp = client.post(f"/api/v1/shorts/jobs/{job_id}/highlights")
        assert resp.status_code == 202

        get_resp = client.get(f"/api/v1/shorts/jobs/{job_id}/highlights")
        assert get_resp.status_code == 200
        data = get_resp.json()["data"]
        assert data["state"] == "done"
        assert len(data["suggestions"]) == 2

        # Verify title 1
        assert data["suggestions"][0]["title"] == "Valid Moment 1"
        assert data["suggestions"][0]["start"] == 0.0
        assert data["suggestions"][0]["end"] == 20.0

        # Verify title 2 (truncated and control characters stripped)
        title2 = data["suggestions"][1]["title"]
        assert len(title2) <= 70
        assert "\x00" not in title2
        assert "\r" not in title2
        assert "\n" not in title2


def test_retry_on_invalid_output_then_ai_bad_response(setup_test_db):
    settings = setup_test_db
    client = TestClient(app)
    job_id = str(uuid.uuid4())
    _create_dummy_job_in_db(job_id, duration=60.0)
    storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()

    segments = [{"start": 0.0, "end": 30.0, "text": "Sample speech."}]
    _write_dummy_transcript(storage_dir, job_id, segments, duration_covered=30.0)

    # Return garbage invalid JSON
    garbage_payload = {
        "candidates": [
            {"content": {"parts": [{"text": "I cannot parse this video transcript, sorry."}]}}
        ]
    }

    call_count = 0

    def mock_post(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, json=garbage_payload, request=httpx.Request("POST", "https://api.test"))

    with patch("httpx.Client.post", side_effect=mock_post):
        resp = client.post(f"/api/v1/shorts/jobs/{job_id}/highlights")
        assert resp.status_code == 202

        # Exactly 2 calls (1 initial + 1 retry)
        assert call_count == 2

        get_resp = client.get(f"/api/v1/shorts/jobs/{job_id}/highlights")
        assert get_resp.status_code == 200
        data = get_resp.json()["data"]
        assert data["state"] == "failed"
        assert data["errorCode"] == "AI_BAD_RESPONSE"


def test_provider_error_mappings(setup_test_db):
    settings = setup_test_db
    client = TestClient(app)
    storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()

    segments = [{"start": 0.0, "end": 30.0, "text": "Speech."}]

    cases = [
        (401, "AI_AUTH_FAILED"),
        (403, "AI_AUTH_FAILED"),
        (429, "AI_RATE_LIMITED"),
        (500, "AI_UNAVAILABLE"),
        (503, "AI_UNAVAILABLE"),
    ]

    for status_code, expected_code in cases:
        job_id = str(uuid.uuid4())
        _create_dummy_job_in_db(job_id, duration=60.0)
        _write_dummy_transcript(storage_dir, job_id, segments, duration_covered=30.0)

        with patch("httpx.Client.post", return_value=httpx.Response(status_code, text="Internal error", request=httpx.Request("POST", "https://api.test"))):
            client.post(f"/api/v1/shorts/jobs/{job_id}/highlights")
            get_resp = client.get(f"/api/v1/shorts/jobs/{job_id}/highlights")
            assert get_resp.json()["data"]["state"] == "failed"
            assert get_resp.json()["data"]["errorCode"] == expected_code

    # Timeout case
    job_id = str(uuid.uuid4())
    _create_dummy_job_in_db(job_id, duration=60.0)
    _write_dummy_transcript(storage_dir, job_id, segments, duration_covered=30.0)

    with patch("httpx.Client.post", side_effect=httpx.TimeoutException("Read timed out")):
        client.post(f"/api/v1/shorts/jobs/{job_id}/highlights")
        get_resp = client.get(f"/api/v1/shorts/jobs/{job_id}/highlights")
        assert get_resp.json()["data"]["state"] == "failed"
        assert get_resp.json()["data"]["errorCode"] == "AI_TIMEOUT"


def test_api_key_never_appears_in_responses_or_logs(setup_test_db, caplog):
    settings = setup_test_db
    client = TestClient(app)
    job_id = str(uuid.uuid4())
    _create_dummy_job_in_db(job_id, duration=60.0)
    storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()
    segments = [{"start": 0.0, "end": 30.0, "text": "Speech."}]
    _write_dummy_transcript(storage_dir, job_id, segments, duration_covered=30.0)

    caplog.set_level(logging.DEBUG)

    with patch("httpx.Client.post", side_effect=httpx.ConnectError("Connection failed")):
        resp = client.post(f"/api/v1/shorts/jobs/{job_id}/highlights")
        get_resp = client.get(f"/api/v1/shorts/jobs/{job_id}/highlights")

        # Response check
        assert settings.GEMINI_API_KEY not in resp.text
        assert settings.GEMINI_API_KEY not in get_resp.text

        # Caplog check
        for record in caplog.records:
            assert settings.GEMINI_API_KEY not in record.getMessage()


def test_highlights_busy_concurrency(setup_test_db):
    settings = setup_test_db
    client = TestClient(app)
    job_id1 = str(uuid.uuid4())
    job_id2 = str(uuid.uuid4())
    _create_dummy_job_in_db(job_id1)
    _create_dummy_job_in_db(job_id2)
    storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()
    _write_dummy_transcript(storage_dir, job_id2, [{"start": 0.0, "end": 20.0, "text": "Speech text."}])

    # Simulate job1 currently holding the highlights lock
    assert highlights_module.acquire_highlights_lock(job_id1) is True

    # Job2 tries to start highlights -> should return 409 HIGHLIGHTS_BUSY
    resp = client.post(f"/api/v1/shorts/jobs/{job_id2}/highlights")
    assert resp.status_code == 409
    assert resp.json()["detail"] == "HIGHLIGHTS_BUSY"

    highlights_module.release_highlights_lock(job_id1)


def test_generate_clips_sequentially_from_highlight_suggestions(setup_test_db):
    settings = setup_test_db
    client = TestClient(app)
    job_id = str(uuid.uuid4())
    _create_dummy_job_in_db(job_id, duration=100.0)
    storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()

    # Pre-populate saved highlights JSON
    sug_id1 = str(uuid.uuid4())
    sug_id2 = str(uuid.uuid4())
    highlights_file = highlights_module.get_highlights_path(storage_dir, job_id)
    highlights_data = {
        "job_id": job_id,
        "suggestions": [
            {
                "id": sug_id1,
                "start": 0.0,
                "end": 20.0,
                "title": "Highlight 1",
                "reason": "Reason 1",
                "status": "suggested",
            },
            {
                "id": sug_id2,
                "start": 30.0,
                "end": 55.0,
                "title": "Highlight 2",
                "reason": "Reason 2",
                "status": "suggested",
            },
        ],
        "model_used": "gemini-2.5-flash",
        "transcript_truncated": False,
    }
    with open(highlights_file, "w", encoding="utf-8") as f:
        json.dump(highlights_data, f)
    highlights_module.write_highlights_state(storage_dir, job_id, "done")

    # Case 1: Unknown suggestion id returns 404 SUGGESTION_NOT_FOUND
    fake_sug_id = str(uuid.uuid4())
    resp = client.post(
        f"/api/v1/shorts/jobs/{job_id}/highlights/generate",
        json={"suggestionIds": [fake_sug_id], "aspect": "vertical_9_16"},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "SUGGESTION_NOT_FOUND"

    # Case 2: Valid generation of 2 clips
    rendered_clips_order = []

    def mock_generate_clip(input_path, output_path, start, end, aspect, ffmpeg_bin):
        rendered_clips_order.append((start, end, aspect))
        output_path.touch()

        with patch("app.services.shorts.generate_clip", side_effect=mock_generate_clip):
            resp = client.post(
                f"/api/v1/shorts/jobs/{job_id}/highlights/generate",
                json={"suggestionIds": [sug_id1, sug_id2], "aspect": "vertical_9_16"},
            )
        assert resp.status_code == 202, resp.json()
        created = resp.json()["data"]
        assert len(created) == 2
        assert created[0]["startSeconds"] == 0.0
        assert created[0]["endSeconds"] == 20.0
        assert created[0]["aspect"] == "vertical_9_16"
        assert created[1]["startSeconds"] == 30.0
        assert created[1]["endSeconds"] == 55.0

        # Verify sequential execution in single background task
        assert len(rendered_clips_order) == 2
        assert rendered_clips_order[0] == (0.0, 20.0, "vertical_9_16")
        assert rendered_clips_order[1] == (30.0, 55.0, "vertical_9_16")


def test_delete_job_removes_highlight_files(setup_test_db):
    settings = setup_test_db
    client = TestClient(app)
    job_id = str(uuid.uuid4())
    _create_dummy_job_in_db(job_id)
    storage_dir = Path(settings.SHORTS_STORAGE_DIR).resolve()

    # Create dummy highlight sidecars
    h_file = highlights_module.get_highlights_path(storage_dir, job_id)
    h_file.write_text("{}", encoding="utf-8")
    highlights_module.write_highlights_state(storage_dir, job_id, "done")
    state_file = highlights_module.get_highlights_state_path(storage_dir, job_id)

    assert h_file.exists()
    assert state_file.exists()

    resp = client.delete(f"/api/v1/shorts/jobs/{job_id}")
    assert resp.status_code == 200

    assert not h_file.exists()
    assert not state_file.exists()
