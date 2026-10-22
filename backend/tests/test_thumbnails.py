import base64
import struct
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.thumbnails import router as thumbnails_router
from app.schemas.thumbnails import TitleScoringRequest
from app.services.gemini_provider import (
    GeminiAuthError,
    GeminiConfigError,
    GeminiCriterionResult,
    GeminiModelNotFoundError,
    GeminiProvider,
    GeminiQuotaExceededError,
    GeminiRateLimitError,
    GeminiResponseError,
    GeminiServiceUnavailableError,
    GeminiThumbnailAnalysis,
    GeminiTimeoutError,
    GeminiTitleAnalysis,
    GeminiTitleCriterionResult,
)
from app.services.thumbnail_scorer import (
    MAX_IMAGE_SIZE_BYTES,
    decode_image_base64,
    inspect_image_bytes,
    score_thumbnail,
    score_title,
)


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


def make_mock_gemini_thumbnail_analysis() -> GeminiThumbnailAnalysis:
    """Creates synthetic valid Gemini thumbnail analysis response."""
    return GeminiThumbnailAnalysis(
        focal_point="Subject Eyes & Terminal Canvas (Gemini AI Vision)",
        contrast_ratio_estimate="15.4:1 (AAA)",
        criteria=[
            GeminiCriterionResult(
                name="Contrast & Visual Hierarchy",
                score=94,
                grade="Excellent",
                reasoning="Exceptional separation between subject and terminal backdrop.",
                suggestions=["Maintain high contrast around typography."],
            ),
            GeminiCriterionResult(
                name="Composition & Focal Point",
                score=91,
                grade="Excellent",
                reasoning="Clear rule-of-thirds balance.",
                suggestions=[],
            ),
            GeminiCriterionResult(
                name="Text Readability & Legibility",
                score=88,
                grade="Good",
                reasoning="Bold sans-serif text readable at 120px scale.",
                suggestions=["Add slight shadow."],
            ),
            GeminiCriterionResult(
                name="Subject Visibility",
                score=90,
                grade="Excellent",
                reasoning="Hero face occupies ~35% of total canvas.",
                suggestions=[],
            ),
            GeminiCriterionResult(
                name="Color Clarity & Vibrancy",
                score=89,
                grade="Good",
                reasoning="Pleasing cyan and amber accents.",
                suggestions=[],
            ),
            GeminiCriterionResult(
                name="Visual Clutter & Complexity",
                score=92,
                grade="Excellent",
                reasoning="Uncluttered minimal background.",
                suggestions=[],
            ),
        ],
        warnings=[],
        suggestions=["Verify glanceability in mobile dark feed."],
    )


def make_mock_gemini_title_analysis() -> GeminiTitleAnalysis:
    """Creates synthetic valid Gemini title analysis response."""
    return GeminiTitleAnalysis(
        clarity_score=94,
        specificity_score=88,
        curiosity_score=92,
        readability_score=96,
        relevance_score=85,
        criteria=[
            GeminiTitleCriterionResult(
                name="Clarity",
                score=94,
                grade="Excellent",
                reasoning="Instant comprehension of core premise.",
                suggestions=[],
            ),
            GeminiTitleCriterionResult(
                name="Specificity",
                score=88,
                grade="Excellent",
                reasoning="Specific 2026 timeframe and tangible hook.",
                suggestions=[],
            ),
            GeminiTitleCriterionResult(
                name="Curiosity & Hook",
                score=92,
                grade="Excellent",
                reasoning="Strong intrigue gap triggers viewer clicks.",
                suggestions=[],
            ),
            GeminiTitleCriterionResult(
                name="Readability & Formatting",
                score=96,
                grade="Excellent",
                reasoning="Optimal length without mobile truncation.",
                suggestions=[],
            ),
            GeminiTitleCriterionResult(
                name="Topic Relevance",
                score=85,
                grade="Good",
                reasoning="Solid alignment with software development niche.",
                suggestions=[],
            ),
        ],
        explanations=["Analyzed by Google Gemini audience model."],
        suggestions=["Add bracketed tag like [2026 Guide] for further boost."],
        alternative_titles=[
            "Why Python in 2026 Is Completely Different",
            "7 Python Breakthroughs That Actually Matter",
            "How to Master Modern Python [Step-by-Step]",
        ],
    )


# ==========================================
# Unit Tests — Image Inspection & Base64
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
# Unit Tests — Gemini Provider Integration
# ==========================================

def test_gemini_provider_unconfigured_raises_config_error():
    provider = GeminiProvider(api_key=None)
    assert provider.is_configured() is False
    with pytest.raises(GeminiConfigError):
        provider.analyze_thumbnail(b"123", "image/png")
    with pytest.raises(GeminiConfigError):
        provider.analyze_title("Test Title")


def test_gemini_provider_successful_thumbnail_mock():
    provider = GeminiProvider(api_key="mock_key", model="gemini-2.5-flash")
    mock_analysis = make_mock_gemini_thumbnail_analysis()

    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.parsed = mock_analysis
        mock_client.models.generate_content.return_value = mock_response
        mock_get_client.return_value = mock_client

        result = provider.analyze_thumbnail(
            image_bytes=make_test_png(1280, 720),
            mime_type="image/png",
            title="AI In 2026",
            topic="Tech",
        )
        assert result.focal_point == mock_analysis.focal_point
        assert result.contrast_ratio_estimate == "15.4:1 (AAA)"
        assert len(result.criteria) == 6


def test_gemini_provider_successful_title_mock():
    provider = GeminiProvider(api_key="mock_key", model="gemini-2.5-flash")
    mock_title_analysis = make_mock_gemini_title_analysis()

    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.parsed = mock_title_analysis
        mock_client.models.generate_content.return_value = mock_response
        mock_get_client.return_value = mock_client

        result = provider.analyze_title(
            title="Why Python in 2026 Is Completely Different",
            topic="Software Engineering",
        )
        assert result.clarity_score == 94
        assert result.specificity_score == 88
        assert len(result.alternative_titles) == 3


def test_gemini_provider_timeout_raises_timeout_error():
    provider = GeminiProvider(api_key="mock_key")
    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = TimeoutError("Request timed out")
        mock_get_client.return_value = mock_client

        with pytest.raises(GeminiTimeoutError):
            provider.analyze_title("Test Title")

        with pytest.raises(GeminiTimeoutError):
            provider.analyze_thumbnail(b"123", "image/png")


def test_gemini_provider_auth_failure_raises_auth_error():
    provider = GeminiProvider(api_key="bad_key")
    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = Exception("401 API_KEY_INVALID")
        mock_get_client.return_value = mock_client

        with pytest.raises(GeminiAuthError):
            provider.analyze_title("Test Title")


def test_gemini_provider_rate_limit_raises_rate_limit_error():
    provider = GeminiProvider(api_key="mock_key")
    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = Exception("429 RESOURCE_EXHAUSTED quota exceeded")
        mock_get_client.return_value = mock_client

        with pytest.raises(GeminiRateLimitError):
            provider.analyze_title("Test Title")


def test_gemini_provider_503_raises_service_unavailable_error():
    provider = GeminiProvider(api_key="mock_key")
    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = Exception("503 UNAVAILABLE: This model is currently experiencing high demand.")
        mock_get_client.return_value = mock_client

        with pytest.raises(GeminiServiceUnavailableError):
            provider.analyze_title("Test Title")

        with pytest.raises(GeminiServiceUnavailableError):
            provider.analyze_thumbnail(b"123", "image/png")


def test_gemini_provider_malformed_output_raises_response_error():
    provider = GeminiProvider(api_key="mock_key")
    with patch.object(provider, "_get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.parsed = None
        mock_response.text = "{ malformed json"
        mock_client.models.generate_content.return_value = mock_response
        mock_get_client.return_value = mock_client

        with pytest.raises(GeminiResponseError):
            provider.analyze_title("Test Title")


# ==========================================
# Service Tests — Gemini Primary + Explicit Fallback
# ==========================================

def test_score_thumbnail_with_gemini_success():
    png_data = make_test_png(1280, 720)
    mock_analysis = make_mock_gemini_thumbnail_analysis()

    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.model = "gemini-2.5-flash"
        mock_prov.analyze_thumbnail.return_value = mock_analysis
        mock_get_prov.return_value = mock_prov

        response = score_thumbnail(
            image_bytes=png_data,
            filename="variant_a.png",
            title="Python In 2026",
            gemini_api_key="mock_key",
        )

        assert response.provider == "google-gemini/gemini-2.5-flash"
        assert "Google Gemini" in response.provider_note
        assert 0 <= response.overall_score <= 100
        assert response.focal_point == mock_analysis.focal_point
        assert len(response.criteria) == 6


def test_score_thumbnail_fallback_when_unconfigured():
    png_data = make_test_png(1280, 720)
    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = False
        mock_get_prov.return_value = mock_prov

        response = score_thumbnail(
            image_bytes=png_data,
            filename="fallback.png",
            allow_fallback=True,
        )

        assert "heuristic-vision-engine" in response.provider
        assert "(fallback)" in response.provider
        assert "GEMINI_API_KEY is not configured" in response.provider_note
        assert 0 <= response.overall_score <= 100


def test_score_thumbnail_no_fallback_when_unconfigured_raises():
    png_data = make_test_png(1280, 720)
    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = False
        mock_get_prov.return_value = mock_prov

        with pytest.raises(GeminiConfigError):
            score_thumbnail(
                image_bytes=png_data,
                filename="no_fallback.png",
                allow_fallback=False,
            )


def test_score_thumbnail_fallback_on_gemini_timeout():
    png_data = make_test_png(1280, 720)
    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.analyze_thumbnail.side_effect = GeminiTimeoutError("Request timed out")
        mock_get_prov.return_value = mock_prov

        response = score_thumbnail(
            image_bytes=png_data,
            filename="timeout.png",
            allow_fallback=True,
        )

        assert "(fallback)" in response.provider
        assert "timed out" in response.provider_note.lower()
        assert response.overall_score > 0


def test_score_title_with_gemini_success():
    req = TitleScoringRequest(
        title="Why Python in 2026 Is Completely Different",
        topic="Software Engineering",
    )
    mock_title_analysis = make_mock_gemini_title_analysis()

    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.model = "gemini-2.5-flash"
        mock_prov.analyze_title.return_value = mock_title_analysis
        mock_get_prov.return_value = mock_prov

        response = score_title(req, gemini_api_key="mock_key")

        assert response.provider == "google-gemini/gemini-2.5-flash"
        assert response.clarity_score == 94
        assert response.specificity_score == 88
        assert response.relevance_score == 85
        assert len(response.alternative_titles) == 3
        # Deterministic weighted calculation: 94*0.25 + 88*0.20 + 92*0.25 + 96*0.15 + 85*0.15 = 23.5 + 17.6 + 23.0 + 14.4 + 12.75 = 91.25 -> 91
        assert response.overall_score == 91


def test_score_title_fallback_when_unconfigured():
    req = TitleScoringRequest(title="Why Most Creators Fail in Their First 90 Days", allow_fallback=True)
    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = False
        mock_get_prov.return_value = mock_prov

        response = score_title(req)
        assert "heuristic-nlp-engine" in response.provider
        assert "(fallback)" in response.provider
        assert 0 <= response.overall_score <= 100


def test_score_title_no_fallback_when_unconfigured_raises():
    req = TitleScoringRequest(title="Why Most Creators Fail in Their First 90 Days", allow_fallback=False)
    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = False
        mock_get_prov.return_value = mock_prov

        with pytest.raises(GeminiConfigError):
            score_title(req)


# ==========================================
# Integration Tests — API Endpoints
# ==========================================

def test_api_score_png_thumbnail_gemini(thumbnail_client: TestClient):
    png_data = make_test_png(1280, 720)
    b64_str = base64.b64encode(png_data).decode("ascii")
    payload = {
        "imageBase64": f"data:image/png;base64,{b64_str}",
        "filename": "thumbnail.png",
    }

    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.model = "gemini-2.5-flash"
        mock_prov.analyze_thumbnail.return_value = make_mock_gemini_thumbnail_analysis()
        mock_get_prov.return_value = mock_prov

        response = thumbnail_client.post(
            "/api/v1/thumbnails/score",
            json=payload,
            headers={"X-Gemini-API-Key": "test-key"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["provider"] == "google-gemini/gemini-2.5-flash"
        assert "overallScore" in data
        assert "contrastRatio" in data
        assert "focalPoint" in data
        assert len(data["criteria"]) == 6


def test_api_score_title_gemini(thumbnail_client: TestClient):
    payload = {
        "title": "Why Python in 2026 Is Completely Different",
        "topic": "Software Engineering",
    }

    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.model = "gemini-2.5-flash"
        mock_prov.analyze_title.return_value = make_mock_gemini_title_analysis()
        mock_get_prov.return_value = mock_prov

        response = thumbnail_client.post(
            "/api/v1/thumbnails/score-title",
            json=payload,
            headers={"X-Gemini-API-Key": "test-key"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["provider"] == "google-gemini/gemini-2.5-flash"
        assert data["clarityScore"] == 94
        assert len(data["alternativeTitles"]) == 3


def test_api_score_thumbnail_missing_key_no_fallback_returns_503(thumbnail_client: TestClient):
    png_data = make_test_png(1280, 720)
    b64_str = base64.b64encode(png_data).decode("ascii")
    payload = {
        "imageBase64": b64_str,
        "filename": "thumbnail.png",
        "allowFallback": False,
    }

    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = False
        mock_get_prov.return_value = mock_prov

        response = thumbnail_client.post("/api/v1/thumbnails/score", json=payload)
        assert response.status_code == 503
        assert "not configured" in response.json()["detail"].lower()


def test_api_score_thumbnail_rate_limit_no_fallback_returns_429(thumbnail_client: TestClient):
    png_data = make_test_png(1280, 720)
    b64_str = base64.b64encode(png_data).decode("ascii")
    payload = {
        "imageBase64": b64_str,
        "filename": "thumbnail.png",
        "allowFallback": False,
    }

    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.analyze_thumbnail.side_effect = GeminiRateLimitError("Rate limit exceeded")
        mock_get_prov.return_value = mock_prov

        response = thumbnail_client.post("/api/v1/thumbnails/score", json=payload)
        assert response.status_code == 429
        assert "rate limit" in response.json()["detail"].lower()


def test_api_score_thumbnail_timeout_no_fallback_returns_504(thumbnail_client: TestClient):
    png_data = make_test_png(1280, 720)
    b64_str = base64.b64encode(png_data).decode("ascii")
    payload = {
        "imageBase64": b64_str,
        "filename": "thumbnail.png",
        "allowFallback": False,
    }

    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.analyze_thumbnail.side_effect = GeminiTimeoutError("Request timed out")
        mock_get_prov.return_value = mock_prov

        response = thumbnail_client.post("/api/v1/thumbnails/score", json=payload)
        assert response.status_code == 504
        assert "timed out" in response.json()["detail"].lower()


def test_api_score_thumbnail_auth_error_no_fallback_returns_502(thumbnail_client: TestClient):
    png_data = make_test_png(1280, 720)
    b64_str = base64.b64encode(png_data).decode("ascii")
    payload = {
        "imageBase64": b64_str,
        "filename": "thumbnail.png",
        "allowFallback": False,
    }

    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.analyze_thumbnail.side_effect = GeminiAuthError("Authentication with Google Gemini API failed.")
        mock_get_prov.return_value = mock_prov

        response = thumbnail_client.post("/api/v1/thumbnails/score", json=payload)
        assert response.status_code == 502
        assert "authentication" in response.json()["detail"].lower()


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


def test_api_score_title_empty_returns_422_or_400(thumbnail_client: TestClient):
    payload = {"title": ""}
    response = thumbnail_client.post("/api/v1/thumbnails/score-title", json=payload)
    assert response.status_code in (400, 422)


def test_api_thumbnails_mounted_in_main_app(client: TestClient):
    """Verify that the thumbnails router is mounted and accessible via the main FastAPI application."""
    payload = {"title": "7 Proven YouTube Automation Secrets in 2026"}
    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.analyze_title.return_value = make_mock_gemini_title_analysis()
        mock_get_prov.return_value = mock_prov

        response = client.post("/api/v1/thumbnails/score-title", json=payload)
        assert response.status_code == 200
        assert response.json()["overallScore"] > 0


def test_api_score_thumbnail_service_unavailable_returns_503(thumbnail_client: TestClient):
    png_data = make_test_png(1280, 720)
    b64_str = base64.b64encode(png_data).decode("ascii")
    payload = {
        "imageBase64": b64_str,
        "filename": "thumbnail.png",
    }

    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.analyze_thumbnail.side_effect = GeminiServiceUnavailableError(
            "Google Gemini API is temporarily experiencing high demand or unavailable (503)."
        )
        mock_get_prov.return_value = mock_prov

        response = thumbnail_client.post("/api/v1/thumbnails/score", json=payload)
        assert response.status_code == 503
        assert "high demand" in response.json()["detail"].lower()
        assert "x-request-id" in response.headers


def test_api_score_thumbnail_quota_exceeded_returns_429(thumbnail_client: TestClient):
    png_data = make_test_png(1280, 720)
    b64_str = base64.b64encode(png_data).decode("ascii")
    payload = {"imageBase64": b64_str, "filename": "thumb.png"}

    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.analyze_thumbnail.side_effect = GeminiQuotaExceededError()
        mock_get_prov.return_value = mock_prov

        response = thumbnail_client.post("/api/v1/thumbnails/score", json=payload)
        assert response.status_code == 429
        assert "quota has been exhausted" in response.json()["detail"].lower()
        assert "x-request-id" in response.headers


def test_api_score_thumbnail_rate_limit_with_retry_after(thumbnail_client: TestClient):
    png_data = make_test_png(1280, 720)
    b64_str = base64.b64encode(png_data).decode("ascii")
    payload = {"imageBase64": b64_str, "filename": "thumb.png"}

    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.analyze_thumbnail.side_effect = GeminiRateLimitError(
            "Google Gemini API rate limit reached. Please wait 45s before trying again.",
            retry_after=45,
        )
        mock_get_prov.return_value = mock_prov

        response = thumbnail_client.post("/api/v1/thumbnails/score", json=payload)
        assert response.status_code == 429
        assert response.headers.get("retry-after") == "45"
        assert "x-request-id" in response.headers


def test_api_score_thumbnail_timeout_returns_504(thumbnail_client: TestClient):
    png_data = make_test_png(1280, 720)
    b64_str = base64.b64encode(png_data).decode("ascii")
    payload = {"imageBase64": b64_str, "filename": "thumb.png"}

    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.analyze_thumbnail.side_effect = GeminiTimeoutError(
            "Google Gemini API request timed out after 25s. The AI model is taking longer than expected."
        )
        mock_get_prov.return_value = mock_prov

        response = thumbnail_client.post("/api/v1/thumbnails/score", json=payload)
        assert response.status_code == 504
        assert "timed out after 25s" in response.json()["detail"]
        assert "x-request-id" in response.headers


def test_api_score_thumbnail_auth_error_returns_502(thumbnail_client: TestClient):
    png_data = make_test_png(1280, 720)
    b64_str = base64.b64encode(png_data).decode("ascii")
    payload = {"imageBase64": b64_str, "filename": "thumb.png"}

    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.analyze_thumbnail.side_effect = GeminiAuthError(
            "Invalid or unauthorized Google Gemini API key."
        )
        mock_get_prov.return_value = mock_prov

        response = thumbnail_client.post("/api/v1/thumbnails/score", json=payload)
        assert response.status_code == 502
        assert "unauthorized" in response.json()["detail"].lower()
        assert "x-request-id" in response.headers


def test_api_score_thumbnail_model_not_found_returns_502(thumbnail_client: TestClient):
    png_data = make_test_png(1280, 720)
    b64_str = base64.b64encode(png_data).decode("ascii")
    payload = {"imageBase64": b64_str, "filename": "thumb.png"}

    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.analyze_thumbnail.side_effect = GeminiModelNotFoundError(
            "Requested Google Gemini model 'gemini-nonexistent' is not found or unsupported."
        )
        mock_get_prov.return_value = mock_prov

        response = thumbnail_client.post("/api/v1/thumbnails/score", json=payload)
        assert response.status_code == 502
        assert "not found" in response.json()["detail"].lower()
        assert "x-request-id" in response.headers


def test_api_score_thumbnail_no_fallback_by_default_on_timeout(thumbnail_client: TestClient):
    """When allowFallback is omitted / False, timeout raises 504 rather than silently masking with fallback."""
    png_data = make_test_png(1280, 720)
    b64_str = base64.b64encode(png_data).decode("ascii")
    payload = {"imageBase64": b64_str, "filename": "thumb.png"}  # allowFallback omitted

    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.analyze_thumbnail.side_effect = GeminiTimeoutError("Google Gemini API request timed out after 25s.")
        mock_get_prov.return_value = mock_prov

        response = thumbnail_client.post("/api/v1/thumbnails/score", json=payload)
        assert response.status_code == 504


def test_api_score_thumbnail_fallback_when_explicitly_requested(thumbnail_client: TestClient):
    """When allowFallback is True, timeout gracefully returns heuristic score with [Fallback] grade."""
    png_data = make_test_png(1280, 720)
    b64_str = base64.b64encode(png_data).decode("ascii")
    payload = {"imageBase64": b64_str, "filename": "thumb.png", "allowFallback": True}

    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.analyze_thumbnail.side_effect = GeminiTimeoutError("Google Gemini API request timed out after 25s.")
        mock_get_prov.return_value = mock_prov

        response = thumbnail_client.post("/api/v1/thumbnails/score", json=payload)
        assert response.status_code == 200
        body = response.json()
        assert "[Fallback]" in body["grade"]
        assert "fallback" in body["provider"]


def test_api_score_thumbnail_distinct_images_distinct_sha256(thumbnail_client: TestClient):
    """Confirm two different uploaded images yield different SHA-256 hashes and metadata."""
    img1_bytes = make_test_png(1280, 720)
    img2_bytes = make_test_png(1920, 1080)

    b64_1 = base64.b64encode(img1_bytes).decode("ascii")
    b64_2 = base64.b64encode(img2_bytes).decode("ascii")

    with patch("app.services.thumbnail_scorer.get_gemini_provider") as mock_get_prov:
        mock_prov = MagicMock()
        mock_prov.is_configured.return_value = True
        mock_prov.analyze_thumbnail.return_value = make_mock_gemini_thumbnail_analysis()
        mock_prov.model = "gemini-3.8-flash"
        mock_get_prov.return_value = mock_prov

        res1 = thumbnail_client.post("/api/v1/thumbnails/score", json={"imageBase64": b64_1})
        res2 = thumbnail_client.post("/api/v1/thumbnails/score", json={"imageBase64": b64_2})

        assert res1.status_code == 200
        assert res2.status_code == 200

        data1 = res1.json()
        data2 = res2.json()

        hash1 = data1["metadata"]["sha256Hash"]
        hash2 = data2["metadata"]["sha256Hash"]

        assert hash1 is not None
        assert hash2 is not None
        assert hash1 != hash2, "Distinct images must produce distinct SHA-256 hashes"
        assert data1["metadata"]["width"] == 1280
        assert data2["metadata"]["width"] == 1920