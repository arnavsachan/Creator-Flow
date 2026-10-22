import logging
import re
import time
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.core.config import get_settings

logger = logging.getLogger(__name__)


# ==========================================
# Custom Gemini Exceptions (Never leak secrets)
# ==========================================

class GeminiError(Exception):
    """Base exception for all Gemini provider operations."""
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class GeminiConfigError(GeminiError):
    """Raised when GEMINI_API_KEY is missing or invalid."""
    def __init__(self, message: str = "Google Gemini API key is not configured."):
        super().__init__(message, status_code=503)


class GeminiAuthError(GeminiError):
    """Raised when authentication with Google Gemini fails (401/403)."""
    def __init__(self, message: str = "Authentication with Google Gemini API failed."):
        super().__init__(message, status_code=502)


class GeminiRateLimitError(GeminiError):
    """Raised when Google Gemini API per-minute/per-day rate limit is reached (429)."""
    def __init__(
        self,
        message: str = "Google Gemini API rate limit reached. Please wait a moment before trying again.",
        retry_after: Optional[int] = None,
    ):
        super().__init__(message, status_code=429)
        self.retry_after = retry_after


class GeminiQuotaExceededError(GeminiRateLimitError):
    """Raised when Google Gemini API account/project quota is exhausted (429)."""
    def __init__(
        self,
        message: str = "Google Gemini API quota has been exhausted for this project. Check your plan and billing details at Google AI Studio.",
    ):
        super().__init__(message=message, retry_after=None)



class GeminiModelNotFoundError(GeminiError):
    """Raised when requested Google Gemini model is not found or unsupported (404)."""
    def __init__(self, message: str = "Requested Google Gemini model is not found or unsupported."):
        super().__init__(message, status_code=502)


class GeminiTimeoutError(GeminiError):
    """Raised when Google Gemini API request times out."""
    def __init__(self, message: str = "Google Gemini API request timed out."):
        super().__init__(message, status_code=504)


class GeminiServiceUnavailableError(GeminiError):
    """Raised when Google Gemini service is experiencing high demand or temporarily unavailable (503)."""
    def __init__(self, message: str = "Google Gemini API is temporarily experiencing high demand or unavailable (503). Please retry in a moment."):
        super().__init__(message, status_code=503)


class GeminiResponseError(GeminiError):
    """Raised when Google Gemini returns malformed or invalid structured output."""
    def __init__(self, message: str = "Google Gemini returned an unparseable response."):
        super().__init__(message, status_code=502)


class GeminiServiceError(GeminiError):
    """Raised on upstream Google Gemini service failures (500/502)."""
    def __init__(self, message: str = "Google Gemini service error encountered."):
        super().__init__(message, status_code=502)


# ==========================================
# Pydantic Output Schemas for Structured JSON
# ==========================================

class GeminiCriterionResult(BaseModel):
    name: str = Field(description="Name of the evaluated visual criterion")
    score: int = Field(ge=0, le=100, description="Criterion score between 0 and 100")
    grade: str = Field(description="Grade: Excellent, Good, Needs Improvement, or Poor")
    reasoning: str = Field(description="Concise analytical reasoning based on visual evidence")
    suggestions: list[str] = Field(default_factory=list, description="Specific actionable recommendations")


class GeminiThumbnailAnalysis(BaseModel):
    focal_point: str = Field(description="Dominant visual focal point detected in image")
    contrast_ratio_estimate: str = Field(description="Estimated contrast assessment (e.g. 14.2:1 (AAA), 8.5:1 (AA), or 4.0:1 (Low))")
    criteria: list[GeminiCriterionResult] = Field(description="Individual visual criterion assessments")
    warnings: list[str] = Field(default_factory=list, description="Critical warnings like illegible text, low contrast, or clutter")
    suggestions: list[str] = Field(default_factory=list, description="Top actionable recommendations")


class GeminiTitleCriterionResult(BaseModel):
    name: str = Field(description="Name of title criterion: Clarity, Specificity, Curiosity & Hook, Readability & Formatting, or Topic Relevance")
    score: int = Field(ge=0, le=100, description="Criterion score between 0 and 100")
    grade: str = Field(description="Grade: Excellent, Good, Needs Improvement, or Poor")
    reasoning: str = Field(description="Concise editorial assessment")
    suggestions: list[str] = Field(default_factory=list, description="Specific actionable recommendations")


class GeminiTitleAnalysis(BaseModel):
    clarity_score: int = Field(ge=0, le=100, description="Clarity score (0-100)")
    specificity_score: int = Field(ge=0, le=100, description="Specificity score (0-100)")
    curiosity_score: int = Field(ge=0, le=100, description="Curiosity & hook score (0-100)")
    readability_score: int = Field(ge=0, le=100, description="Readability & formatting score (0-100)")
    relevance_score: Optional[int] = Field(default=None, ge=0, le=100, description="Topic relevance score (0-100)")
    criteria: list[GeminiTitleCriterionResult] = Field(default_factory=list)
    explanations: list[str] = Field(default_factory=list, description="Explanations for score calculations")
    suggestions: list[str] = Field(default_factory=list, description="Actionable title optimization recommendations")
    alternative_titles: list[str] = Field(default_factory=list, description="3-5 creative, high-CTR alternative titles")


# ==========================================
# Gemini Provider Implementation
# ==========================================

_DEFAULT_KEY = object()


class GeminiProvider:
    """
    Dedicated integration with Google Gemini official SDK (google-genai)
    supporting multimodal thumbnail visual evaluation and title scoring.
    """

    def __init__(
        self,
        api_key: Any = _DEFAULT_KEY,
        model: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        title_timeout_seconds: Optional[float] = None,
    ):
        settings = get_settings()
        if api_key is _DEFAULT_KEY:
            self.api_key: Optional[str] = settings.GEMINI_API_KEY
        else:
            self.api_key = api_key
        self.model: str = model or settings.GEMINI_MODEL or "gemini-3.8-flash"
        self.timeout_seconds: float = timeout_seconds or getattr(settings, "GEMINI_TIMEOUT_SECONDS", 25.0)
        self.title_timeout_seconds: float = title_timeout_seconds or getattr(settings, "GEMINI_TITLE_TIMEOUT_SECONDS", 15.0)

    def is_configured(self) -> bool:
        """Returns True if a non-empty API key is available."""
        return bool(self.api_key and self.api_key.strip())

    def _get_client(self) -> Any:
        """Initializes and returns official google-genai Client."""
        if not self.is_configured():
            raise GeminiConfigError("Google Gemini API key is not configured. Please set GEMINI_API_KEY.")
        try:
            from google import genai
            return genai.Client(api_key=self.api_key)
        except Exception as err:
            logger.error("Failed to initialize Google GenAI Client: %s", str(err))
            raise GeminiServiceError("Failed to initialize Google GenAI client.") from err

    def analyze_thumbnail(
        self,
        image_bytes: bytes,
        mime_type: str = "image/png",
        title: Optional[str] = None,
        topic: Optional[str] = None,
        width: int = 0,
        height: int = 0,
        aspect_ratio: str = "",
    ) -> GeminiThumbnailAnalysis:
        """
        Submits thumbnail image to Google Gemini multimodal vision model
        with structured JSON output matching GeminiThumbnailAnalysis.
        """
        client = self._get_client()
        from google.genai import types

        prompt = (
            "You are an expert YouTube creative director and visual CTR auditor.\n"
            "Analyze this video thumbnail variant in depth for mobile and desktop click-through performance.\n\n"
            f"Context:\n"
            f"- Paired Video Title: {title or 'Not provided'}\n"
            f"- Target Topic/Niche: {topic or 'Not provided'}\n"
            f"- Verified Dimensions: {width}x{height} ({aspect_ratio})\n\n"
            "Evaluate across these criteria:\n"
            "1. Contrast & Visual Hierarchy: Foreground subject/text separation from background.\n"
            "2. Composition & Focal Point: Eye path, rule-of-thirds, glanceability at small mobile viewport sizes.\n"
            "3. Text Readability & Legibility: Font clarity, stroke/outline contrast, 3-5 word limit.\n"
            "4. Subject Visibility: Prominence of focal hero/subject/face.\n"
            "5. Color Clarity & Vibrancy: Distinct accents, visual friction in light and dark YouTube feeds.\n"
            "6. Visual Clutter & Complexity: Background noise vs clean focal retention.\n"
            "7. Thumbnail-Title Alignment: Thematic synergy between visual framing and title premise.\n\n"
            "Provide accurate scores (0-100), concise reasoning based on visual evidence, and actionable suggestions."
        )

        image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=GeminiThumbnailAnalysis,
            temperature=0.2,
            http_options=types.HttpOptions(
                timeout=int(self.timeout_seconds * 1000),
                retry_options=types.HttpRetryOptions(attempts=2, initial_delay=1.0, http_status_codes=[503]),
            ),
        )

        t0 = time.perf_counter()
        try:
            response = client.models.generate_content(
                model=self.model,
                contents=[prompt, image_part],
                config=config,
            )
            return self._parse_thumbnail_response(response)
        except GeminiError:
            raise
        except Exception as err:
            elapsed = time.perf_counter() - t0
            self._handle_api_exception(err, elapsed_seconds=elapsed, timeout_budget=self.timeout_seconds)

    def analyze_title(
        self,
        title: str,
        topic: Optional[str] = None,
        description: Optional[str] = None,
        thumbnail_context: Optional[str] = None,
    ) -> GeminiTitleAnalysis:
        """
        Submits proposed video title to Google Gemini model for
        curiosity, clarity, specificity, readability, and topic relevance analysis.
        """
        client = self._get_client()
        from google.genai import types

        prompt = (
            "You are an expert YouTube title strategist and audience psychology specialist.\n"
            "Evaluate the proposed YouTube video title for click-through rate (CTR) engagement, viewer curiosity, clarity, and mobile feed glanceability.\n\n"
            f"Context:\n"
            f"- Proposed Title: \"{title}\"\n"
            f"- Target Topic/Niche: {topic or 'Not provided'}\n"
            f"- Video Synopsis/Description: {description or 'Not provided'}\n"
            f"- Paired Thumbnail Context: {thumbnail_context or 'Not provided'}\n\n"
            "Evaluate across these dimensions:\n"
            "1. Clarity: Instant comprehensibility, clear subject, absence of confusing jargon.\n"
            "2. Specificity: Concrete anchors, numbers, bracketed qualifiers, or tangible value promises.\n"
            "3. Curiosity & Hook: Emotional friction, curiosity gap, intrigue triggers, or provocative framing.\n"
            "4. Readability & Formatting: Length (ideal 45-65 chars for mobile feed visibility without truncation), casing balance, punctuation hygiene.\n"
            "5. Topic Relevance: Semantic alignment with the provided topic and synopsis.\n\n"
            "Provide 3 to 5 high-performing alternative headline formulas (Curiosity Hook, Numbered Listicle, How-To/Outcome, Contrarian Hook) tailored to this video concept."
        )

        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=GeminiTitleAnalysis,
            temperature=0.3,
            http_options=types.HttpOptions(
                timeout=int(self.title_timeout_seconds * 1000),
                retry_options=types.HttpRetryOptions(attempts=2, initial_delay=1.0, http_status_codes=[503]),
            ),
        )

        t0 = time.perf_counter()
        try:
            response = client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=config,
            )
            return self._parse_title_response(response)
        except GeminiError:
            raise
        except Exception as err:
            elapsed = time.perf_counter() - t0
            self._handle_api_exception(err, elapsed_seconds=elapsed, timeout_budget=self.title_timeout_seconds)

    def _parse_thumbnail_response(self, response: Any) -> GeminiThumbnailAnalysis:
        """Safely parses and validates Gemini thumbnail response."""
        if hasattr(response, "parsed") and isinstance(response.parsed, GeminiThumbnailAnalysis):
            return response.parsed

        text = getattr(response, "text", None)
        if not text:
            raise GeminiResponseError("Gemini response contained no content or text.")

        try:
            return GeminiThumbnailAnalysis.model_validate_json(text)
        except Exception as err:
            logger.error("Failed to parse Gemini thumbnail response JSON: %s", str(err))
            raise GeminiResponseError("Malformed structured output returned by Gemini.") from err

    def _parse_title_response(self, response: Any) -> GeminiTitleAnalysis:
        """Safely parses and validates Gemini title response."""
        if hasattr(response, "parsed") and isinstance(response.parsed, GeminiTitleAnalysis):
            return response.parsed

        text = getattr(response, "text", None)
        if not text:
            raise GeminiResponseError("Gemini response contained no content or text.")

        try:
            return GeminiTitleAnalysis.model_validate_json(text)
        except Exception as err:
            logger.error("Failed to parse Gemini title response JSON: %s", str(err))
            raise GeminiResponseError("Malformed structured output returned by Gemini.") from err

    def _handle_api_exception(
        self,
        err: Exception,
        elapsed_seconds: float = 0.0,
        request_id: Optional[str] = None,
        timeout_budget: Optional[float] = None,
    ) -> None:
        """Categorizes and sanitizes exceptions from the google-genai SDK."""
        status_code = getattr(err, "code", None)
        grpc_status = getattr(err, "status", None)
        message = getattr(err, "message", str(err))
        err_str = f"{status_code or ''} {grpc_status or ''} {message}".lower()

        # Extract Retry-After if provided by Google API
        retry_after: Optional[int] = None
        response_obj = getattr(err, "response", None)
        if response_obj and hasattr(response_obj, "headers") and response_obj.headers:
            ra = response_obj.headers.get("retry-after")
            if ra:
                try:
                    retry_after = int(ra)
                except ValueError:
                    pass
        if retry_after is None:
            match = re.search(r"retry\s+after\s+(\d+)\s*s", message, re.IGNORECASE)
            if match:
                try:
                    retry_after = int(match.group(1))
                except ValueError:
                    pass

        # Diagnostic sanitized log (never log raw image bytes or API key)
        logger.warning(
            "[GeminiProvider] Failure diagnosed: req_id=%s exc_type=%s http_status=%s grpc_status=%s model_id=%s elapsed=%.2fs retry_after=%s",
            request_id or "N/A",
            type(err).__name__,
            status_code or "N/A",
            grpc_status or "N/A",
            self.model,
            elapsed_seconds,
            retry_after or "none",
        )

        # 1. Authentication / Permission errors (401 / 403)
        if (
            status_code in (401, 403)
            or "unauthenticated" in err_str
            or "api_key_invalid" in err_str
            or "invalid api key" in err_str
            or "permission_denied" in err_str
        ):
            if status_code == 403 or "permission_denied" in err_str:
                raise GeminiAuthError(
                    "Permission denied for Google Gemini API key. Verify that Gemini API is enabled for this project."
                ) from err
            raise GeminiAuthError(
                "Invalid or unauthorized Google Gemini API key. Please check your GEMINI_API_KEY."
            ) from err

        # 2. Model Not Found / Unsupported (404)
        if status_code == 404 or "not_found" in err_str or "is not found for api version" in err_str:
            raise GeminiModelNotFoundError(
                f"Requested Google Gemini model '{self.model}' is not found or unsupported."
            ) from err

        # 3. Rate Limit vs. Quota Exhaustion (429 / RESOURCE_EXHAUSTED)
        if status_code == 429 or "resource_exhausted" in err_str or "quota" in err_str:
            is_quota_exhausted = (
                "quota" in err_str
                or "exceeded your current quota" in err_str
                or "free_tier" in err_str
                or "billing" in err_str
                or "per day" in err_str
                or "generaterequests per day" in err_str
            )
            if is_quota_exhausted:
                raise GeminiQuotaExceededError(
                    "Google Gemini API quota has been exhausted for this project. Check your plan and billing details at Google AI Studio."
                ) from err
            rate_limit_msg = (
                f"Google Gemini API rate limit reached. Please wait {retry_after}s before trying again."
                if retry_after
                else "Google Gemini API rate limit reached. Please wait a moment before trying again."
            )
            raise GeminiRateLimitError(rate_limit_msg, retry_after=retry_after) from err

        # 4. Service Unavailable / High Demand (503)
        if status_code == 503 or "unavailable" in err_str or "high demand" in err_str:
            raise GeminiServiceUnavailableError(
                "Google Gemini API is temporarily experiencing high demand or unavailable (503). Please retry in a moment."
            ) from err

        # 5. Gateway Timeout / Upstream Deadline (504)
        if (
            status_code == 504
            or "deadline_exceeded" in err_str
            or "timeout" in err_str
            or "timed out" in err_str
        ):
            budget = timeout_budget or self.timeout_seconds
            raise GeminiTimeoutError(
                f"Google Gemini API request timed out after {budget:.0f}s. The AI model is taking longer than expected."
            ) from err

        # 6. General Upstream Service Error
        logger.error("Google Gemini unhandled API error: %s (status=%s)", type(err).__name__, status_code)
        raise GeminiServiceError("Google Gemini service error encountered.") from err



# Singleton accessor
_provider_instance: Optional[GeminiProvider] = None


def get_gemini_provider(
    api_key: Optional[str] = None,
    model: Optional[str] = None,
) -> GeminiProvider:
    """Returns GeminiProvider instance."""
    if api_key or model:
        return GeminiProvider(api_key=api_key, model=model)
    global _provider_instance
    if _provider_instance is None:
        _provider_instance = GeminiProvider()
    return _provider_instance
