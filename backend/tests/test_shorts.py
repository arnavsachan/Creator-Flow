import io
from pathlib import Path
import shutil
import subprocess
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import BACKEND_DIR, Settings, get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.shorts import ShortsClip, ShortsJob
from app.services.media import probe_media
from app.services.shorts import _ACTIVE_TASKS

# In-memory SQLite engine for shorts testing
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
    """
    Creates an isolated in-memory SQLite schema and temporary storage directory for each test.
    """
    Base.metadata.create_all(bind=test_engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    storage_dir = tmp_path / "shorts_storage"
    storage_dir.mkdir(parents=True, exist_ok=True)

    import app.db.session as app_session
    app_session._engine = test_engine
    app_session._session_factory = TestingSessionLocal

    test_settings = Settings(
        ENVIRONMENT="test",
        SHORTS_STORAGE_DIR=storage_dir,
        SHORTS_ENABLED_ENVIRONMENTS=["development", "test"],
        SHORTS_MAX_UPLOAD_MB=10,
        SHORTS_MAX_DURATION_SECONDS=3600,
        SHORTS_MAX_CLIP_SECONDS=180,
    )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = lambda: test_settings

    _ACTIVE_TASKS.clear()

    yield test_settings

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)
    _ACTIVE_TASKS.clear()


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client



@pytest.fixture
def sample_video_path(tmp_path: Path) -> Path:
    """
    Generates a minimal 2-second valid MP4 video using ffmpeg testsrc.
    Skips if ffmpeg is not available on system.
    """
    if not ffmpeg_available:
        pytest.skip("FFmpeg not installed on host")

    video_file = tmp_path / "sample_2s.mp4"
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
        pytest.skip("Failed to generate synthetic test video")

    return video_file


def test_upload_valid_small_video(client: TestClient, sample_video_path: Path):
    """
    Upload a valid 2s MP4 video, verify 201 response and standard envelope structure.
    """
    with open(sample_video_path, "rb") as f:
        files = {"file": ("test_clip.mp4", f, "video/mp4")}
        response = client.post("/api/v1/shorts/jobs", files=files)

    assert response.status_code == 201
    body = response.json()
    assert body["data_state"] == "LIVE"
    assert "data" in body
    data = body["data"]
    assert data["status"] == "uploaded"
    assert data["originalFilename"] == "test_clip.mp4"
    assert data["durationSeconds"] > 1.5
    assert data["width"] == 320
    assert data["height"] == 240
    assert "id" in data


def test_upload_unsupported_extension(client: TestClient):
    """
    Upload a file with unsupported extension (e.g. .txt or .avi).
    """
    files = {"file": ("notes.txt", io.BytesIO(b"Hello world"), "text/plain")}
    response = client.post("/api/v1/shorts/jobs", files=files)

    assert response.status_code == 400
    body = response.json()
    assert body["detail"] == "UNSUPPORTED_FORMAT"


def test_upload_fake_mp4_not_a_video(client: TestClient):
    """
    Upload a fake .mp4 file that contains plain text rather than valid video data.
    """
    files = {"file": ("corrupted.mp4", io.BytesIO(b"Not an mp4 video header"), "video/mp4")}
    response = client.post("/api/v1/shorts/jobs", files=files)

    assert response.status_code == 400
    body = response.json()
    assert body["detail"] == "INVALID_MEDIA"


def test_upload_too_large(client: TestClient, setup_test_db: Settings):
    """
    Enforce max upload size limit while streaming.
    """
    # Temporarily set upload limit to 1MB
    setup_test_db.SHORTS_MAX_UPLOAD_MB = 1

    # 1.5MB of data
    oversized = b"0" * int(1.5 * 1024 * 1024)
    files = {"file": ("huge.mp4", io.BytesIO(oversized), "video/mp4")}
    response = client.post("/api/v1/shorts/jobs", files=files)

    assert response.status_code == 400
    body = response.json()
    assert body["detail"] == "FILE_TOO_LARGE"


def test_upload_filename_sanitization_no_path_traversal(client: TestClient, sample_video_path: Path):
    """
    Upload with filename containing path traversal '../../evil.mp4'.
    Verifies that the stored path does not use user paths.
    """
    with open(sample_video_path, "rb") as f:
        files = {"file": ("../../evil.mp4", f, "video/mp4")}
        response = client.post("/api/v1/shorts/jobs", files=files)

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["originalFilename"] == "evil.mp4"
    assert ".." not in data["originalFilename"]


def test_clip_valid_range_and_download(client: TestClient, sample_video_path: Path):
    """
    Create a valid clip for an uploaded video, verify background processing, status polling and download.
    """
    with open(sample_video_path, "rb") as f:
        upload_res = client.post("/api/v1/shorts/jobs", files={"file": ("sample.mp4", f, "video/mp4")})
    assert upload_res.status_code == 201
    job_id = upload_res.json()["data"]["id"]

    clip_payload = {
        "start_seconds": 0.0,
        "end_seconds": 1.0,
        "aspect": "original",
    }
    clip_res = client.post(f"/api/v1/shorts/jobs/{job_id}/clips", json=clip_payload)
    assert clip_res.status_code == 202
    clip_id = clip_res.json()["data"]["id"]

    # In TestClient, BackgroundTasks run synchronously before response returns
    status_res = client.get(f"/api/v1/shorts/jobs/{job_id}/clips/{clip_id}")
    assert status_res.status_code == 200
    assert status_res.json()["data"]["status"] == "done"

    # Download clip
    dl_res = client.get(f"/api/v1/shorts/jobs/{job_id}/clips/{clip_id}/download")
    assert dl_res.status_code == 200
    assert len(dl_res.content) > 0


def test_clip_vertical_9_16_dimensions(client: TestClient, sample_video_path: Path):
    """
    Verify that aspect 'vertical_9_16' produces 1080x1920 video via ffprobe.
    """
    if not ffmpeg_available:
        pytest.skip("FFmpeg not installed on host")

    with open(sample_video_path, "rb") as f:
        upload_res = client.post("/api/v1/shorts/jobs", files={"file": ("sample.mp4", f, "video/mp4")})
    job_id = upload_res.json()["data"]["id"]

    clip_payload = {
        "start_seconds": 0.0,
        "end_seconds": 1.0,
        "aspect": "vertical_9_16",
    }
    clip_res = client.post(f"/api/v1/shorts/jobs/{job_id}/clips", json=clip_payload)
    assert clip_res.status_code == 202
    clip_id = clip_res.json()["data"]["id"]

    db = TestingSessionLocal()
    clip = db.get(ShortsClip, clip_id)
    assert clip is not None
    assert clip.status == "done"
    assert clip.output_path is not None

    media_info = probe_media(Path(clip.output_path))
    db.close()

    assert media_info.width == 1080
    assert media_info.height == 1920


def test_clip_invalid_range_start_ge_end(client: TestClient, sample_video_path: Path):
    """
    Clip creation fails with INVALID_RANGE when start >= end.
    """
    with open(sample_video_path, "rb") as f:
        upload_res = client.post("/api/v1/shorts/jobs", files={"file": ("sample.mp4", f, "video/mp4")})
    job_id = upload_res.json()["data"]["id"]

    clip_payload = {"start_seconds": 1.5, "end_seconds": 1.0, "aspect": "original"}
    clip_res = client.post(f"/api/v1/shorts/jobs/{job_id}/clips", json=clip_payload)
    assert clip_res.status_code == 400
    assert clip_res.json()["detail"] == "INVALID_RANGE"


def test_clip_invalid_range_end_gt_duration(client: TestClient, sample_video_path: Path):
    """
    Clip creation fails with INVALID_RANGE when end > video duration.
    """
    with open(sample_video_path, "rb") as f:
        upload_res = client.post("/api/v1/shorts/jobs", files={"file": ("sample.mp4", f, "video/mp4")})
    job_id = upload_res.json()["data"]["id"]

    clip_payload = {"start_seconds": 0.0, "end_seconds": 10.0, "aspect": "original"}
    clip_res = client.post(f"/api/v1/shorts/jobs/{job_id}/clips", json=clip_payload)
    assert clip_res.status_code == 400
    assert clip_res.json()["detail"] == "INVALID_RANGE"


def test_clip_invalid_range_exceeds_max_clip_seconds(client: TestClient, sample_video_path: Path):
    """
    Clip creation fails with INVALID_RANGE when length exceeds SHORTS_MAX_CLIP_SECONDS.
    """
    with open(sample_video_path, "rb") as f:
        upload_res = client.post("/api/v1/shorts/jobs", files={"file": ("sample.mp4", f, "video/mp4")})
    job_id = upload_res.json()["data"]["id"]

    clip_payload = {"start_seconds": 0.0, "end_seconds": 181.0, "aspect": "original"}
    clip_res = client.post(f"/api/v1/shorts/jobs/{job_id}/clips", json=clip_payload)
    assert clip_res.status_code == 400
    assert clip_res.json()["detail"] == "INVALID_RANGE"


def test_download_wrong_clip_or_job_returns_404(client: TestClient):
    """
    Downloading non-existent clip or clip from another job returns 404 CLIP_NOT_FOUND.
    """
    fake_job_id = str(uuid.uuid4())
    fake_clip_id = str(uuid.uuid4())
    res = client.get(f"/api/v1/shorts/jobs/{fake_job_id}/clips/{fake_clip_id}/download")
    assert res.status_code == 404
    assert res.json()["detail"] == "CLIP_NOT_FOUND"


def test_preview_source_and_delete_job(client: TestClient, sample_video_path: Path):
    """
    GET source returns the video preview, and DELETE job removes database record and files.
    """
    with open(sample_video_path, "rb") as f:
        upload_res = client.post("/api/v1/shorts/jobs", files={"file": ("sample.mp4", f, "video/mp4")})
    job_id = upload_res.json()["data"]["id"]

    # Preview source
    src_res = client.get(f"/api/v1/shorts/jobs/{job_id}/source")
    assert src_res.status_code == 200

    # Delete job
    del_res = client.delete(f"/api/v1/shorts/jobs/{job_id}")
    assert del_res.status_code == 200

    # Confirm 404 on subsequent get
    get_res = client.get(f"/api/v1/shorts/jobs/{job_id}")
    assert get_res.status_code == 404


def test_feature_gate_returns_503_in_disabled_environment(client: TestClient, setup_test_db: Settings):
    """
    Feature gate: shorts routes return 503 error unless ENVIRONMENT is in the enabled list.
    """
    setup_test_db.ENVIRONMENT = "production"
    setup_test_db.SHORTS_ENABLED_ENVIRONMENTS = ["development", "test"]

    res = client.get("/api/v1/shorts/jobs")
    assert res.status_code == 503
    assert res.json()["detail"] == "FEATURE_DISABLED"


def test_interrupted_processing_marked_failed_on_read(client: TestClient):
    """
    On server restart, jobs left in processing must be marked failed (error_code INTERRUPTED) on next read.
    """
    db = TestingSessionLocal()
    job = ShortsJob(
        id=str(uuid.uuid4()),
        original_filename="test.mp4",
        stored_path="dummy.mp4",
        size_bytes=1000,
        duration_seconds=10.0,
        width=1920,
        height=1080,
        status="uploaded",
    )
    db.add(job)
    db.commit()

    clip = ShortsClip(
        id=str(uuid.uuid4()),
        job_id=job.id,
        start_seconds=1.0,
        end_seconds=3.0,
        aspect="original",
        status="processing",  # Left in processing across restart
    )
    db.add(clip)
    db.commit()
    clip_id = clip.id
    job_id = job.id
    db.close()

    # Read clip: active tasks is empty (simulating server restart)
    res = client.get(f"/api/v1/shorts/jobs/{job_id}/clips/{clip_id}")
    assert res.status_code == 200
    clip_data = res.json()["data"]
    assert clip_data["status"] == "failed"
    assert clip_data["errorCode"] == "INTERRUPTED"


def test_shorts_storage_dir_empty_string(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SHORTS_STORAGE_DIR", "")
    settings = Settings()
    default_expected = (BACKEND_DIR / "storage" / "shorts").resolve()
    assert settings.SHORTS_STORAGE_DIR == default_expected
    assert settings.SHORTS_STORAGE_DIR.is_relative_to(BACKEND_DIR)


def test_shorts_storage_dir_whitespace(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SHORTS_STORAGE_DIR", "   \t\n  ")
    settings = Settings()
    default_expected = (BACKEND_DIR / "storage" / "shorts").resolve()
    assert settings.SHORTS_STORAGE_DIR == default_expected
    assert settings.SHORTS_STORAGE_DIR.is_relative_to(BACKEND_DIR)


def test_shorts_storage_dir_unset(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("SHORTS_STORAGE_DIR", raising=False)
    settings = Settings()
    default_expected = (BACKEND_DIR / "storage" / "shorts").resolve()
    assert settings.SHORTS_STORAGE_DIR == default_expected
    assert settings.SHORTS_STORAGE_DIR.is_relative_to(BACKEND_DIR)


def test_shorts_storage_dir_relative_path(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SHORTS_STORAGE_DIR", "custom_storage/shorts")
    settings = Settings()
    expected = (BACKEND_DIR / "custom_storage" / "shorts").resolve()
    assert settings.SHORTS_STORAGE_DIR == expected
    assert settings.SHORTS_STORAGE_DIR.is_relative_to(BACKEND_DIR)


def test_shorts_storage_dir_absolute_path(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    abs_path = (tmp_path / "explicit_abs_storage").resolve()
    monkeypatch.setenv("SHORTS_STORAGE_DIR", str(abs_path))
    settings = Settings()
    assert settings.SHORTS_STORAGE_DIR == abs_path


@pytest.mark.parametrize(
    "aspect_key,expected_width,expected_height",
    [
        ("original", 320, 240),
        ("vertical_9_16", 1080, 1920),
        ("square_1_1", 1080, 1080),
        ("portrait_4_5", 1080, 1350),
        ("landscape_16_9", 1920, 1080),
    ],
)
def test_all_five_aspect_ratios_produce_expected_dimensions(
    client: TestClient,
    sample_video_path: Path,
    aspect_key: str,
    expected_width: int,
    expected_height: int,
):
    """
    Verify that each of the 5 aspect ratios produces the expected dimensions via ffprobe.
    """
    if not ffmpeg_available:
        pytest.skip("FFmpeg not installed on host")

    with open(sample_video_path, "rb") as f:
        upload_res = client.post("/api/v1/shorts/jobs", files={"file": ("sample.mp4", f, "video/mp4")})
    job_id = upload_res.json()["data"]["id"]

    clip_payload = {
        "start_seconds": 0.0,
        "end_seconds": 1.0,
        "aspect": aspect_key,
    }
    clip_res = client.post(f"/api/v1/shorts/jobs/{job_id}/clips", json=clip_payload)
    assert clip_res.status_code == 202
    clip_id = clip_res.json()["data"]["id"]

    db = TestingSessionLocal()
    clip = db.get(ShortsClip, clip_id)
    assert clip is not None
    assert clip.status == "done"
    assert clip.output_path is not None

    media_info = probe_media(Path(clip.output_path))
    db.close()

    assert media_info.width == expected_width
    assert media_info.height == expected_height


def test_invalid_aspect_rejected_with_invalid_aspect_code(client: TestClient, sample_video_path: Path):
    """
    Creating a clip with unknown aspect value returns 400 with INVALID_ASPECT error code.
    """
    with open(sample_video_path, "rb") as f:
        upload_res = client.post("/api/v1/shorts/jobs", files={"file": ("sample.mp4", f, "video/mp4")})
    job_id = upload_res.json()["data"]["id"]

    clip_payload = {
        "start_seconds": 0.0,
        "end_seconds": 1.0,
        "aspect": "cinematic_21_9_unsupported",
    }
    clip_res = client.post(f"/api/v1/shorts/jobs/{job_id}/clips", json=clip_payload)
    assert clip_res.status_code == 400
    assert clip_res.json()["detail"] == "INVALID_ASPECT"


def test_delete_clip_removes_row_and_file(client: TestClient, sample_video_path: Path):
    """
    DELETE /jobs/{job_id}/clips/{clip_id} removes database row and disk file.
    """
    with open(sample_video_path, "rb") as f:
        upload_res = client.post("/api/v1/shorts/jobs", files={"file": ("sample.mp4", f, "video/mp4")})
    job_id = upload_res.json()["data"]["id"]

    clip_payload = {"start_seconds": 0.0, "end_seconds": 1.0, "aspect": "original"}
    clip_res = client.post(f"/api/v1/shorts/jobs/{job_id}/clips", json=clip_payload)
    assert clip_res.status_code == 202
    clip_id = clip_res.json()["data"]["id"]

    db = TestingSessionLocal()
    clip = db.get(ShortsClip, clip_id)
    assert clip is not None
    assert clip.output_path is not None
    output_path = Path(clip.output_path)
    assert output_path.exists()
    db.close()

    # Delete clip
    del_res = client.delete(f"/api/v1/shorts/jobs/{job_id}/clips/{clip_id}")
    assert del_res.status_code == 200
    assert del_res.json()["message"] == "Clip deleted successfully."

    # Verify DB row is removed
    db = TestingSessionLocal()
    assert db.get(ShortsClip, clip_id) is None
    db.close()

    # Verify output file is removed
    assert not output_path.exists()


def test_delete_clip_wrong_job_returns_404(client: TestClient, sample_video_path: Path):
    """
    Deleting a clip with another job's ID returns 404 CLIP_NOT_FOUND.
    """
    with open(sample_video_path, "rb") as f:
        upload_res = client.post("/api/v1/shorts/jobs", files={"file": ("sample.mp4", f, "video/mp4")})
    job1_id = upload_res.json()["data"]["id"]

    clip_payload = {"start_seconds": 0.0, "end_seconds": 1.0, "aspect": "original"}
    clip_res = client.post(f"/api/v1/shorts/jobs/{job1_id}/clips", json=clip_payload)
    clip_id = clip_res.json()["data"]["id"]

    wrong_job_id = str(uuid.uuid4())
    del_res = client.delete(f"/api/v1/shorts/jobs/{wrong_job_id}/clips/{clip_id}")
    assert del_res.status_code == 404
    assert del_res.json()["detail"] == "CLIP_NOT_FOUND"


def test_delete_missing_clip_returns_404(client: TestClient, sample_video_path: Path):
    """
    Deleting non-existent clip returns 404 CLIP_NOT_FOUND.
    """
    with open(sample_video_path, "rb") as f:
        upload_res = client.post("/api/v1/shorts/jobs", files={"file": ("sample.mp4", f, "video/mp4")})
    job_id = upload_res.json()["data"]["id"]

    missing_clip_id = str(uuid.uuid4())
    del_res = client.delete(f"/api/v1/shorts/jobs/{job_id}/clips/{missing_clip_id}")
    assert del_res.status_code == 404
    assert del_res.json()["detail"] == "CLIP_NOT_FOUND"


def test_delete_processing_or_queued_clip_returns_409_clip_busy(client: TestClient):
    """
    Deleting clip while queued or processing returns 409 CLIP_BUSY.
    """
    db = TestingSessionLocal()
    job = ShortsJob(
        id=str(uuid.uuid4()),
        original_filename="busy_test.mp4",
        stored_path="dummy.mp4",
        size_bytes=1000,
        duration_seconds=10.0,
        width=1920,
        height=1080,
        status="uploaded",
    )
    db.add(job)
    db.commit()

    clip = ShortsClip(
        id=str(uuid.uuid4()),
        job_id=job.id,
        start_seconds=1.0,
        end_seconds=3.0,
        aspect="original",
        status="processing",
    )
    db.add(clip)
    db.commit()

    # Mark active in memory
    _ACTIVE_TASKS.add(clip.id)
    clip_id = clip.id
    job_id = job.id
    db.close()

    del_res = client.delete(f"/api/v1/shorts/jobs/{job_id}/clips/{clip_id}")
    assert del_res.status_code == 409
    assert del_res.json()["detail"] == "CLIP_BUSY"

    _ACTIVE_TASKS.discard(clip_id)


def test_deleting_clip_twice_returns_404_the_second_time(client: TestClient, sample_video_path: Path):
    """
    Deleting a clip twice returns 200 on first call and 404 on second call.
    """
    with open(sample_video_path, "rb") as f:
        upload_res = client.post("/api/v1/shorts/jobs", files={"file": ("sample.mp4", f, "video/mp4")})
    job_id = upload_res.json()["data"]["id"]

    clip_payload = {"start_seconds": 0.0, "end_seconds": 1.0, "aspect": "original"}
    clip_res = client.post(f"/api/v1/shorts/jobs/{job_id}/clips", json=clip_payload)
    clip_id = clip_res.json()["data"]["id"]

    del_res1 = client.delete(f"/api/v1/shorts/jobs/{job_id}/clips/{clip_id}")
    assert del_res1.status_code == 200

    del_res2 = client.delete(f"/api/v1/shorts/jobs/{job_id}/clips/{clip_id}")
    assert del_res2.status_code == 404
    assert del_res2.json()["detail"] == "CLIP_NOT_FOUND"


def test_delete_clip_path_traversal_impossible(client: TestClient, tmp_path: Path):
    """
    If a clip record somehow has an output_path outside storage directory,
    delete_clip safely prevents outside deletion and still deletes DB row.
    """
    outside_file = tmp_path / "sensitive_outside_file.txt"
    outside_file.write_text("critical data")

    db = TestingSessionLocal()
    job = ShortsJob(
        id=str(uuid.uuid4()),
        original_filename="traversal_test.mp4",
        stored_path="dummy.mp4",
        size_bytes=1000,
        duration_seconds=10.0,
        width=1920,
        height=1080,
        status="uploaded",
    )
    db.add(job)
    db.commit()

    clip = ShortsClip(
        id=str(uuid.uuid4()),
        job_id=job.id,
        start_seconds=1.0,
        end_seconds=3.0,
        aspect="original",
        status="done",
        output_path=str(outside_file),
    )
    db.add(clip)
    db.commit()
    clip_id = clip.id
    job_id = job.id
    db.close()

    del_res = client.delete(f"/api/v1/shorts/jobs/{job_id}/clips/{clip_id}")
    assert del_res.status_code == 200

    # Outside file MUST NOT be deleted
    assert outside_file.exists()
    assert outside_file.read_text() == "critical data"
