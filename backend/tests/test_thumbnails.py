import base64
import struct
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.thumbnails import router as thumbnails_router
from app.services.thumbnail_scorer import (
    MAX_IMAGE_SIZE_BYTES,
    decode_image_base64,
    inspect_image_bytes,
    score_thumbnail,
    score_title,
)
from app.schemas.thumbnails import TitleScoringRequest


@pytest.fixture
def thumbnail_client() -> TestClient:
    """Isolated test client for thumbnails router mounted at /api/v1."""
    test_app = FastAPI()
    test_app.include_router(thumbnails_router, prefix="/api/v1")
    return TestClient(test_app)


def make_test_png(width: int = 1280, height: int = 720) -> bytes:
    """Generates minimal valid PNG byte buffer with given dimensions."""
    header = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + struct.pack(">II", width, height) + b"\x08\x06\x00\x00\x00\x00\x00\x00\x00"
    idat = b"\x00\x00\x00\x04IDAT\x78\x9c\x01\x00\x00\xff\xff\x00\x00\x00\x01\x0b\xa0\x01\x19"
    iend = b"\x00\x00\x00\x00IEND\xaeB`\x82"
    return header + idat + iend


def make_test_jpeg(width: int = 1280, height: int = 720) -> bytes:
    """Generates minimal valid JPEG byte buffer with SOF0 header."""
    soi = b"\xff\xd8"
    app0 = b"\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    sof0 = b"\xff\xc0\x00\x11\x08" + struct.pack(">HH", height, width) + b"\x03\x01\x11\x00\x02\x11\x01\x03\x11\x01"
    eoi = b"\xff\xd9"
    return soi + app0 + sof0 + eoi


def make_test_webp(width: int = 1920, height: int = 1080) -> bytes:
    """Generates minimal valid WebP VP8X byte buffer."""
    w_bytes = struct.pack("<I", width - 1)[:3]
    h_bytes = struct.pack("<I", height - 1)[:3]
    riff_header = b"RIFF\x24\x00\x00\x00WEBPVP8X\x0a\x00\x00\x00\x00\x00\x00\x00" + w_bytes + h_bytes
    return riff_header


# ==========================================
# Unit Tests — Image Inspection & Scoring
# ==========================================

def test_inspect_valid_png_metadata():
    png_data = make_test_png(1280, 720)
    meta = inspect_image_bytes(png_data, "test.png")
    assert meta.file_format == "PNG"
    assert meta.width == 1280
    assert meta.height == 720
    assert "16:9" in meta.aspect_ratio
    assert meta.is_recommended_resolution is True


def test_inspect_valid_jpeg_metadata():
    jpeg_data = make_test_jpeg(1920, 1080)
    meta = inspect_image_bytes(jpeg_data, "hero.jpg")
    assert meta.file_format == "JPEG"
    assert meta.width == 1920
    assert meta.height == 1080
    assert meta.is_recommended_resolution is True


def test_inspect_valid_webp_metadata():
    webp_data = make_test_webp(1080, 1920)
    meta = inspect_image_bytes(webp_data, "shorts.webp")
    assert meta.file_format == "WEBP"
    assert meta.width == 1080
    assert meta.height == 1920
    assert "9:16" in meta.aspect_ratio


def test_decode_image_base64_with_data_url():
    png_data = make_test_png(100, 100)
    b64_str = base64.b64encode(png_data).decode("ascii")
    data_url = f"data:image/png;base64,{b64_str}"
    decoded = decode_image_base64(data_url)
    assert decoded == png_data


def test_inspect_empty_bytes_raises_error():
    with pytest.raises(ValueError, match="empty"):
        inspect_image_bytes(b"")


def test_inspect_oversized_bytes_raises_error():
    oversized = b"\x00" * (MAX_IMAGE_SIZE_BYTES + 1024)
    with pytest.raises(ValueError, match="exceeds maximum allowed limit"):
        inspect_image_bytes(oversized)


def test_inspect_invalid_format_raises_error():
    corrupt = b"This is just plain text, not an image header."
    with pytest.raises(ValueError, match="Unsupported or corrupt image format"):
        inspect_image_bytes(corrupt)


def test_inspect_too_small_dimension_raises_error():
    small_png = make_test_png(30, 30)
    with pytest.raises(ValueError, match="too small"):
        inspect_image_bytes(small_png)


# ==========================================
# Unit Tests — Title Scoring
# ==========================================

def test_score_title_valid():
    req = TitleScoringRequest(
        title="7 Proven YouTube Automation Secrets in 2026",
        topic="YouTube Creator Growth",
    )
    result = score_title(req)
    assert 0 <= result.overall_score <= 100
    assert result.clarity_score > 0
    assert result.specificity_score > 0
    assert result.curiosity_score > 0
    assert result.readability_score > 0
    assert result.relevance_score is not None
    assert len(result.alternative_titles) >= 3
    assert result.provider == "heuristic-nlp-engine"


def test_score_title_empty_raises_error():
    req = TitleScoringRequest(title="   ")
    with pytest.raises(ValueError, match="empty"):
        score_title(req)


def test_score_title_without_topic():
    req = TitleScoringRequest(title="Why Most Creators Fail in Their First 90 Days")
    result = score_title(req)
    assert result.relevance_score is None
    assert 0 <= result.overall_score <= 100
    assert len(result.explanations) > 0


# ==========================================
# Integration Tests — API Endpoints
# ==========================================

def test_api_score_png_thumbnail(thumbnail_client: TestClient):
    png_data = make_test_png(1280, 720)
    b64_str = base64.b64encode(png_data).decode("ascii")
    payload = {
        "imageBase64": f"data:image/png;base64,{b64_str}",
        "filename": "thumbnail.png",
    }
    response = thumbnail_client.post("/api/v1/thumbnails/score", json=payload)

    assert response.status_code == 200
    data = response.json()

    # CamelCase serialization checks
    assert "overallScore" in data
    assert "contrastRatio" in data
    assert "focalPoint" in data
    assert "criteria" in data
    assert "suggestions" in data
    assert "metadata" in data
    assert "provider" in data
    assert data["provider"] == "heuristic-vision-engine"
    assert 0 <= data["overallScore"] <= 100

    # Criteria breakdown
    criteria = data["criteria"]
    assert len(criteria) >= 6
    criterion_names = [c["name"] for c in criteria]
    assert "Contrast & Visual Hierarchy" in criterion_names
    assert "Composition & Focal Point" in criterion_names
    assert "Text Readability & Legibility" in criterion_names
    assert "Subject Visibility" in criterion_names


def test_api_score_thumbnail_with_title_alignment(thumbnail_client: TestClient):
    jpeg_data = make_test_jpeg(1920, 1080)
    b64_str = base64.b64encode(jpeg_data).decode("ascii")
    payload = {
        "imageBase64": b64_str,
        "filename": "variant_a.jpg",
        "title": "Why You Are Coding Python Wrong in 2026?",
        "topic": "Python Programming",
    }
    response = thumbnail_client.post("/api/v1/thumbnails/score", json=payload)

    assert response.status_code == 200
    data = response.json()
    criterion_names = [c["name"] for c in data["criteria"]]
    assert "Thumbnail-Title Alignment" in criterion_names


def test_api_score_corrupt_image_returns_400(thumbnail_client: TestClient):
    payload = {
        "imageBase64": base64.b64encode(b"not an image").decode("ascii"),
        "filename": "bad.png",
    }
    response = thumbnail_client.post("/api/v1/thumbnails/score", json=payload)
    assert response.status_code == 400
    body = response.json()
    assert "detail" in body
    assert "Unsupported or corrupt" in body["detail"]


def test_api_score_invalid_base64_returns_400(thumbnail_client: TestClient):
    payload = {
        "imageBase64": "!!!not_valid_base64!!!",
        "filename": "bad.png",
    }
    response = thumbnail_client.post("/api/v1/thumbnails/score", json=payload)
    assert response.status_code == 400
    assert "base64" in response.json()["detail"].lower()


def test_api_score_title_valid(thumbnail_client: TestClient):
    payload = {
        "title": "Stop Using React in 2026! [Honest Review]",
        "topic": "Frontend Web Development",
        "description": "Comprehensive comparison between modern frameworks.",
    }
    response = thumbnail_client.post("/api/v1/thumbnails/score-title", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert "overallScore" in data
    assert "clarityScore" in data
    assert "specificityScore" in data
    assert "curiosityScore" in data
    assert "readabilityScore" in data
    assert "relevanceScore" in data
    assert "alternativeTitles" in data
    assert len(data["alternativeTitles"]) >= 3
    assert data["characterCount"] == len(payload["title"])


def test_api_score_title_empty_returns_422_or_400(thumbnail_client: TestClient):
    payload = {"title": ""}
    response = thumbnail_client.post("/api/v1/thumbnails/score-title", json=payload)
    assert response.status_code in (400, 422)


def test_api_thumbnails_mounted_in_main_app(client: TestClient):
    """Verify that the thumbnails router is mounted and accessible via the main FastAPI application."""
    payload = {"title": "7 Proven YouTube Automation Secrets in 2026"}
    response = client.post("/api/v1/thumbnails/score-title", json=payload)
    assert response.status_code == 200
    assert response.json()["overallScore"] > 0
