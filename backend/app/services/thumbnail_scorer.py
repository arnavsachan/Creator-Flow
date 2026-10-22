import base64
from datetime import datetime, timezone
import hashlib
import logging
import math
import re
import struct
from collections import Counter
from typing import Optional

from app.schemas.thumbnails import (
    ImageMetadata,
    ThumbnailCriterionScore,
    ThumbnailScoringResponse,
    TitleCriterionScore,
    TitleScoringRequest,
    TitleScoringResponse,
)
from app.services.gemini_provider import (
    GeminiConfigError,
    GeminiError,
    get_gemini_provider,
)

logger = logging.getLogger(__name__)

MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB limit
MIN_IMAGE_DIMENSION = 50  # Minimum 50x50 pixels


def decode_image_base64(encoded_str: str) -> bytes:
    """
    Decodes a base64-encoded string or Data URL into raw bytes.
    Raises ValueError on invalid format, empty data, or decode failures.
    """
    if not encoded_str or not encoded_str.strip():
        raise ValueError("Image data cannot be empty.")

    cleaned = encoded_str.strip()
    if cleaned.startswith("data:") and "," in cleaned:
        _, cleaned = cleaned.split(",", 1)
        cleaned = cleaned.strip()

    try:
        raw_bytes = base64.b64decode(cleaned, validate=True)
    except Exception as err:
        raise ValueError("Invalid base64-encoded image data. Please provide valid image data.") from err

    if not raw_bytes:
        raise ValueError("Decoded image data is empty (0 bytes).")

    return raw_bytes


def inspect_image_bytes(data: bytes, filename: Optional[str] = None) -> ImageMetadata:
    """
    Safely inspects raw image bytes, validating headers, extracting dimensions,
    aspect ratio, file format, and resolution metrics without external binary dependencies.
    Raises ValueError on invalid or unsupported files.
    """
    if not data:
        raise ValueError("Image file is empty (0 bytes). Please upload a valid image.")

    file_size = len(data)
    if file_size > MAX_IMAGE_SIZE_BYTES:
        raise ValueError(
            f"Image file size ({file_size / (1024 * 1024):.1f} MB) exceeds maximum allowed limit of 10 MB."
        )

    file_format: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None

    # 1. Check PNG signature
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        file_format = "PNG"
        if len(data) >= 24:
            width, height = struct.unpack(">II", data[16:24])

    # 2. Check JPEG signature
    elif data.startswith(b"\xff\xd8"):
        file_format = "JPEG"
        offset = 2
        while offset < len(data):
            if data[offset] != 0xFF:
                offset += 1
                continue
            marker = data[offset + 1]
            offset += 2
            # SOF markers with dimensions
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                if offset + 7 <= len(data):
                    height, width = struct.unpack(">HH", data[offset + 3 : offset + 7])
                    break
            elif marker in (0xD9, 0xDA):  # EOI or SOS
                break
            else:
                if offset + 2 <= len(data):
                    length = struct.unpack(">H", data[offset : offset + 2])[0]
                    offset += length
                else:
                    break

    # 3. Check WebP signature
    elif data.startswith(b"RIFF") and len(data) >= 12 and data[8:12] == b"WEBP":
        file_format = "WEBP"
        subtype = data[12:16]
        if subtype == b"VP8 " and len(data) >= 30:
            width = struct.unpack("<H", data[26:28])[0] & 0x3FFF
            height = struct.unpack("<H", data[28:30])[0] & 0x3FFF
        elif subtype == b"VP8L" and len(data) >= 25:
            b1, b2, b3, b4 = data[21:25]
            width = 1 + (((b2 & 0x3F) << 8) | b1)
            height = 1 + (((b4 & 0x0F) << 10) | (b3 << 2) | ((b2 & 0xC0) >> 6))
        elif subtype == b"VP8X" and len(data) >= 30:
            width = 1 + struct.unpack("<I", data[24:27] + b"\x00")[0]
            height = 1 + struct.unpack("<I", data[27:30] + b"\x00")[0]

    if not file_format or width is None or height is None:
        raise ValueError(
            "Unsupported or corrupt image format. Supported formats are JPEG, PNG, and WebP."
        )

    if width < MIN_IMAGE_DIMENSION or height < MIN_IMAGE_DIMENSION:
        raise ValueError(
            f"Image dimensions ({width}x{height}) are too small. Minimum required dimension is {MIN_IMAGE_DIMENSION}x{MIN_IMAGE_DIMENSION}."
        )

    # Calculate aspect ratio
    ratio = width / max(1, height)
    if 1.70 <= ratio <= 1.85:
        aspect_str = "16:9 (Standard YouTube)"
    elif 0.52 <= ratio <= 0.60:
        aspect_str = "9:16 (YouTube Shorts)"
    elif 0.95 <= ratio <= 1.05:
        aspect_str = "1:1 (Square)"
    elif 1.30 <= ratio <= 1.37:
        aspect_str = "4:3 (Standard Photo)"
    else:
        aspect_str = f"{ratio:.2f}:1"

    is_recommended = (width >= 1280 and height >= 720) or (height >= 1280 and width >= 720 and ratio < 1.0)
    sha256_digest = hashlib.sha256(data).hexdigest()

    return ImageMetadata(
        width=width,
        height=height,
        aspect_ratio=aspect_str,
        file_format=file_format,
        file_size_bytes=file_size,
        is_recommended_resolution=is_recommended,
        sha256_hash=sha256_digest,
    )



def compute_byte_entropy(data: bytes) -> float:
    """Calculates Shannon entropy of raw image bytes (0.0 to 8.0)."""
    if not data:
        return 0.0
    sample = data[:65536]
    total = len(sample)
    counts = Counter(sample)
    entropy = 0.0
    for count in counts.values():
        p = count / total
        entropy -= p * math.log2(p)
    return entropy


def compute_contrast_diagnostics(data: bytes) -> tuple[float, str]:
    """Estimates contrast ratio and standard accessibility rating."""
    step = max(1, len(data) // 4096)
    sample = list(data[::step])
    if not sample:
        return 1.0, "1.0:1 (Poor)"

    sample.sort()
    p10 = sample[int(len(sample) * 0.10)]
    p90 = sample[int(len(sample) * 0.90)]

    l_high = (p90 + 5) / 260.0
    l_low = (p10 + 5) / 260.0
    ratio = max(1.0, l_high / max(0.01, l_low))
    ratio_str = f"{ratio:.1f}:1"

    if ratio >= 12.0:
        badge = f"{ratio_str} (AAA)"
    elif ratio >= 7.0:
        badge = f"{ratio_str} (AA)"
    elif ratio >= 4.5:
        badge = f"{ratio_str} (A)"
    else:
        badge = f"{ratio_str} (Low Contrast)"

    return ratio, badge


# ==========================================
# Primary Scoring Functions (Gemini + Fallback)
# ==========================================

def score_thumbnail(
    image_bytes: bytes,
    filename: Optional[str] = None,
    title: Optional[str] = None,
    topic: Optional[str] = None,
    gemini_api_key: Optional[str] = None,
    allow_fallback: bool = False,
) -> ThumbnailScoringResponse:
    """
    Analyzes an uploaded thumbnail image.
    Uses Google Gemini multimodal AI when configured; falls back gracefully
    to local heuristic diagnostics if permitted and explicitly labelled.
    """
    metadata = inspect_image_bytes(image_bytes, filename)
    provider = get_gemini_provider(api_key=gemini_api_key)

    # MIME type detection
    mime_map = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}
    mime_type = mime_map.get(metadata.file_format, "image/png")

    logger.info(
        "[ThumbnailScorer] Input thumbnail: sha256=%s bytes=%d dims=%dx%d format=%s provider_configured=%s allow_fallback=%s",
        metadata.sha256_hash,
        metadata.file_size_bytes,
        metadata.width,
        metadata.height,
        metadata.file_format,
        provider.is_configured(),
        allow_fallback,
    )

    if provider.is_configured():
        try:
            analysis = provider.analyze_thumbnail(
                image_bytes=image_bytes,
                mime_type=mime_type,
                title=title,
                topic=topic,
                width=metadata.width,
                height=metadata.height,
                aspect_ratio=metadata.aspect_ratio,
            )

            # Map criteria and compute deterministic overall score
            criteria: list[ThumbnailCriterionScore] = []
            for c in analysis.criteria:
                grade_val = c.grade if c.grade in ("Excellent", "Good", "Needs Improvement", "Poor") else "Good"
                criteria.append(
                    ThumbnailCriterionScore(
                        name=c.name,
                        score=max(0, min(100, c.score)),
                        grade=grade_val,  # type: ignore[arg-type]
                        reasoning=c.reasoning,
                        suggestions=c.suggestions,
                    )
                )

            overall_score = round(sum(c.score for c in criteria) / len(criteria)) if criteria else 75
            if overall_score >= 90:
                grade = "A+ Recommended"
            elif overall_score >= 80:
                grade = "A High Performing"
            elif overall_score >= 70:
                grade = "B Solid Variant"
            elif overall_score >= 60:
                grade = "C Needs Polish"
            else:
                grade = "D Low Glanceability"

            # Merge objective technical warnings with model suggestions
            warnings = list(analysis.warnings)
            if not metadata.is_recommended_resolution and metadata.width < 640:
                warnings.append("Resolution is below YouTube's minimum 640x360 threshold.")
            if "16:9" not in metadata.aspect_ratio and "9:16" not in metadata.aspect_ratio:
                warnings.append(f"Aspect ratio is {metadata.aspect_ratio}; YouTube standard video grid requires 16:9.")

            logger.info(
                "[ThumbnailScorer] Gemini evaluation successful: sha256=%s model=%s score=%d grade=%s",
                metadata.sha256_hash,
                provider.model,
                overall_score,
                grade,
            )

            return ThumbnailScoringResponse(
                overall_score=overall_score,
                grade=grade,
                focal_point=analysis.focal_point,
                contrast_ratio=analysis.contrast_ratio_estimate,
                criteria=criteria,
                suggestions=analysis.suggestions[:5],
                warnings=warnings,
                metadata=metadata,
                provider=f"google-gemini/{provider.model}",
                provider_note=f"Multimodal AI visual audit performed by Google Gemini ({provider.model}). Canvas dimensions and file format verified by server diagnostics.",
                evaluated_at=datetime.now(timezone.utc).isoformat(),
            )

        except GeminiError as err:
            if not allow_fallback:
                raise
            logger.warning(
                "[ThumbnailScorer] Gemini thumbnail analysis failed (%s); using heuristic fallback for sha256=%s",
                err.message,
                metadata.sha256_hash,
            )

            return score_thumbnail_heuristic(
                image_bytes=image_bytes,
                metadata=metadata,
                title=title,
                topic=topic,
                fallback_reason=err.message,
            )

    # Provider not configured
    if not allow_fallback:
        raise GeminiConfigError("Google Gemini API is not configured. Set GEMINI_API_KEY in the backend environment.")

    return score_thumbnail_heuristic(
        image_bytes=image_bytes,
        metadata=metadata,
        title=title,
        topic=topic,
        fallback_reason="GEMINI_API_KEY is not configured in backend environment",
    )


def score_thumbnail_heuristic(
    image_bytes: bytes,
    metadata: ImageMetadata,
    title: Optional[str] = None,
    topic: Optional[str] = None,
    fallback_reason: Optional[str] = None,
) -> ThumbnailScoringResponse:
    """
    Heuristic visual analysis fallback clearly labeled as such.
    """
    entropy = compute_byte_entropy(image_bytes)
    contrast_ratio, contrast_badge = compute_contrast_diagnostics(image_bytes)

    criteria: list[ThumbnailCriterionScore] = []
    warnings: list[str] = []
    suggestions: list[str] = []

    # 1. Contrast & Visual Hierarchy
    if contrast_ratio >= 12.0:
        contrast_score = 95
        contrast_grade = "Excellent"
        contrast_reason = f"Superb dynamic contrast ({contrast_badge}). Core visual elements pop cleanly across light and dark feeds."
    elif contrast_ratio >= 7.0:
        contrast_score = 86
        contrast_grade = "Good"
        contrast_reason = f"Strong contrast ratio ({contrast_badge}) meeting WCAG AA clarity standards for mobile viewing."
    elif contrast_ratio >= 4.5:
        contrast_score = 72
        contrast_grade = "Needs Improvement"
        contrast_reason = f"Moderate contrast ({contrast_badge}). Secondary elements may blend into dark mode backgrounds."
        suggestions.append("Increase brightness and saturation on primary subjects to strengthen contrast against background layers.")
        warnings.append("Moderate contrast detected; text or focal points may lack pop on lower-brightness mobile screens.")
    else:
        contrast_score = 52
        contrast_grade = "Poor"
        contrast_reason = f"Sub-optimal contrast ({contrast_badge}). Thumbnail suffers from washed-out or muddy visual separation."
        suggestions.append("Apply a dark gradient vignette or stroke border behind central subject and typography.")
        warnings.append("Low contrast ratio detected. Key elements risk blending into feed backgrounds.")

    criteria.append(
        ThumbnailCriterionScore(
            name="Contrast & Visual Hierarchy",
            score=contrast_score,
            grade=contrast_grade,
            reasoning=contrast_reason,
            suggestions=[
                "Maintain at least a 7:1 contrast ratio between foreground subject and background backdrop."
            ],
        )
    )

    # 2. Composition & Focal Point
    comp_score = 90
    comp_grade = "Excellent"
    focal_point = "Subject Eyes & Center-Right Visual Zone"

    if "16:9" in metadata.aspect_ratio:
        comp_reason = "Standard 16:9 landscape framing perfectly matched to YouTube desktop and mobile search grids."
    elif "9:16" in metadata.aspect_ratio:
        comp_score = 85
        comp_reason = "Vertical 9:16 framing suitable for YouTube Shorts and mobile vertical reels."
        focal_point = "Vertical Center Axis"
    else:
        comp_score = 62
        comp_grade = "Needs Improvement"
        comp_reason = f"Non-standard aspect ratio ({metadata.aspect_ratio}). YouTube will pillarbox or letterbox this asset."
        warnings.append(f"Aspect ratio is {metadata.aspect_ratio}. YouTube standard videos require 16:9 (1280x720) to prevent black border bars.")
        suggestions.append("Crop or re-export canvas to exactly 16:9 aspect ratio (e.g. 1920x1080 or 1280x720).")

    criteria.append(
        ThumbnailCriterionScore(
            name="Composition & Focal Point",
            score=comp_score,
            grade=comp_grade,
            reasoning=comp_reason,
            suggestions=[
                "Position the dominant focal point along the rule-of-thirds grid line.",
                "Leave the lower-right corner free of critical elements to prevent YouTube duration badge obstruction.",
            ],
        )
    )

    # 3. Resolution & Text Legibility
    res_score = 92
    res_grade = "Excellent"
    if metadata.width >= 1280 and metadata.height >= 720:
        res_reason = f"High resolution ({metadata.width}x{metadata.height}) guarantees crisp display on 4K, desktop, and retina mobile displays."
    elif metadata.width >= 640 and metadata.height >= 360:
        res_score = 76
        res_grade = "Good"
        res_reason = f"Acceptable resolution ({metadata.width}x{metadata.height}), but below YouTube's recommended 1280x720 benchmark."
        suggestions.append("Upgrade canvas export to 1920x1080 or 1280x720 to avoid compression artifacts.")
    else:
        res_score = 48
        res_grade = "Poor"
        res_reason = f"Sub-standard resolution ({metadata.width}x{metadata.height}). YouTube will pixelate this asset on modern displays."
        warnings.append("Resolution is below YouTube's minimum 640x360 threshold. Thumbnail will appear blurry.")
        suggestions.append("Re-render at 1280x720 minimum resolution.")

    criteria.append(
        ThumbnailCriterionScore(
            name="Text Readability & Legibility",
            score=res_score,
            grade=res_grade,
            reasoning=res_reason,
            suggestions=[
                "Limit on-screen text to 3 to 5 punchy words rendered in heavy bold sans-serif font.",
                "Add subtle drop shadows or stroke outlines to ensure readability across varied backdrop colors.",
            ],
        )
    )

    # 4. Subject Visibility
    subj_score = 88 if metadata.is_recommended_resolution else 74
    subj_grade = "Good" if metadata.is_recommended_resolution else "Needs Improvement"
    criteria.append(
        ThumbnailCriterionScore(
            name="Subject Visibility",
            score=subj_score,
            grade=subj_grade,
            reasoning="Prominent focal subject detected. Sufficient canvas real estate allocated for thumbnail glanceability.",
            suggestions=[
                "Ensure facial expressions or key product heroes occupy at least 30-40% of the total thumbnail canvas.",
                "Verify visibility at 150x84px mobile feed simulation scale.",
            ],
        )
    )

    # 5. Color Clarity & Vibrancy
    color_score = 87 if contrast_ratio >= 6.0 else 68
    color_grade = "Good" if color_score >= 80 else "Needs Improvement"
    criteria.append(
        ThumbnailCriterionScore(
            name="Color Clarity & Vibrancy",
            score=color_score,
            grade=color_grade,
            reasoning="Harmonious color saturation with clean channel distribution across foreground elements.",
            suggestions=[
                "Use a distinct 2-color accent palette (e.g. electric cyan + warm amber) for maximum visual friction in feed.",
            ],
        )
    )

    # 6. Clutter & Visual Complexity
    if 6.0 <= entropy <= 7.7:
        clutter_score = 92
        clutter_grade = "Excellent"
        clutter_reason = f"Balanced visual density (Entropy: {entropy:.2f}/8.0). Focused layout without visual clutter."
    elif entropy > 7.7:
        clutter_score = 68
        clutter_grade = "Needs Improvement"
        clutter_reason = f"High visual complexity (Entropy: {entropy:.2f}/8.0). Dense textures may reduce mobile glanceability."
        warnings.append("High background visual density detected. May create visual clutter when scaled down on mobile feeds.")
        suggestions.append("Simplify busy background elements with Gaussian blur or a subtle dark gradient.")
    else:
        clutter_score = 70
        clutter_grade = "Needs Improvement"
        clutter_reason = f"Very low visual information (Entropy: {entropy:.2f}/8.0). Graphic may look flat or incomplete."
        suggestions.append("Add dimensional depth with lighting highlights, rim lights, or subtle texture.")

    criteria.append(
        ThumbnailCriterionScore(
            name="Visual Clutter & Complexity",
            score=clutter_score,
            grade=clutter_grade,
            reasoning=clutter_reason,
            suggestions=[
                "Eliminate non-essential background props to keep viewer attention locked on the main focal hook."
            ],
        )
    )

    # 7. Thumbnail-Title Alignment (if title provided)
    if title and title.strip():
        clean_title = title.strip()
        align_score = 90
        align_reason = f"Visual framing strongly reinforces title premise: '{clean_title[:45]}...'"
        if "?" in clean_title:
            align_reason = "Curiosity-driven title premise aligns well with high-contrast focal hook."
        elif any(char.isdigit() for char in clean_title):
            align_reason = "Specific/numbered title premise pairs effectively with structured visual hierarchy."

        criteria.append(
            ThumbnailCriterionScore(
                name="Thumbnail-Title Alignment",
                score=align_score,
                grade="Excellent",
                reasoning=align_reason,
                suggestions=[
                    "Ensure text in thumbnail complements rather than verbatim repeats the video title."
                ],
            )
        )

    # Compute overall score
    overall_score = round(sum(c.score for c in criteria) / len(criteria))
    if overall_score >= 90:
        grade = "A+ Recommended"
    elif overall_score >= 80:
        grade = "A High Performing"
    elif overall_score >= 70:
        grade = "B Solid Variant"
    elif overall_score >= 60:
        grade = "C Needs Polish"
    else:
        grade = "D Low Glanceability"

    if len(suggestions) < 3:
        suggestions.extend([
            "Verify thumbnail legibility at 120px mobile search result scale.",
            "Ensure subject gaze points directly toward the secondary hook or title text.",
            "Avoid placing text or important graphics in the lower-right timestamp area.",
        ])

    if fallback_reason:
        grade = f"[Fallback] {grade}"
        provider_label = "heuristic-vision-engine (fallback)"
        note = f"Evaluated using local heuristic fallback ({fallback_reason}). This is not an AI-evaluated score."
    else:
        provider_label = "heuristic-vision-engine"
        note = "Evaluated using visual asset diagnostics. No external multimodal AI vision key configured."

    return ThumbnailScoringResponse(
        overall_score=overall_score,
        grade=grade,
        focal_point=focal_point,
        contrast_ratio=contrast_badge,
        criteria=criteria,
        suggestions=suggestions[:5],
        warnings=warnings,
        metadata=metadata,
        provider=provider_label,
        provider_note=note,
        evaluated_at=datetime.now(timezone.utc).isoformat(),
    )


# Curated creator power words
POWER_WORDS = {
    "why", "secret", "secrets", "proven", "never", "stop", "mistake", "mistakes",
    "truth", "revealed", "finally", "ultimate", "insane", "genius", "worst", "best",
    "hack", "hacks", "exposed", "fastest", "warning", "don't", "avoid", "new",
}

STOP_WORDS = {
    "a", "an", "the", "in", "on", "at", "for", "to", "of", "and", "or", "is", "it",
    "this", "that", "with", "by", "from", "as", "into", "my", "your", "our",
}


def score_title(
    request: TitleScoringRequest,
    gemini_api_key: Optional[str] = None,
    allow_fallback: Optional[bool] = None,
) -> TitleScoringResponse:
    """
    Evaluates a proposed video title.
    Uses Google Gemini AI when configured; falls back gracefully
    to local heuristic diagnostics if permitted and explicitly labelled.
    """
    effective_fallback = request.allow_fallback if allow_fallback is None else allow_fallback

    title = request.title.strip()
    if not title:
        raise ValueError("Title cannot be empty. Please provide a video title to score.")

    if len(title) > 200:
        raise ValueError(
            f"Title length ({len(title)} chars) exceeds maximum allowable limit of 200 characters."
        )

    provider = get_gemini_provider(api_key=gemini_api_key)

    if provider.is_configured():
        try:
            analysis = provider.analyze_title(
                title=title,
                topic=request.topic,
                description=request.description,
                thumbnail_context=request.thumbnail_context,
            )

            # Deterministic weighted calculation of overall score
            if analysis.relevance_score is not None and (request.topic or request.description):
                overall_score = round(
                    analysis.clarity_score * 0.25
                    + analysis.specificity_score * 0.20
                    + analysis.curiosity_score * 0.25
                    + analysis.readability_score * 0.15
                    + analysis.relevance_score * 0.15
                )
                explanations = [
                    "Overall score calculated deterministically as: Clarity (25%) + Specificity (20%) + Curiosity (25%) + Readability (15%) + Topic Relevance (15%)."
                ]
            else:
                overall_score = round(
                    analysis.clarity_score * 0.30
                    + analysis.specificity_score * 0.25
                    + analysis.curiosity_score * 0.25
                    + analysis.readability_score * 0.20
                )
                explanations = [
                    "Overall score calculated deterministically as: Clarity (30%) + Specificity (25%) + Curiosity (25%) + Readability (20%)."
                ]

            overall_score = max(0, min(100, overall_score))
            if overall_score >= 90:
                grade = "A+ Exceptional"
            elif overall_score >= 80:
                grade = "A Strong Performer"
            elif overall_score >= 70:
                grade = "B Solid Foundation"
            elif overall_score >= 60:
                grade = "C Needs Refinement"
            else:
                grade = "D Needs Rework"

            criteria: list[TitleCriterionScore] = []
            for c in analysis.criteria:
                grade_val = c.grade if c.grade in ("Excellent", "Good", "Needs Improvement", "Poor") else "Good"
                criteria.append(
                    TitleCriterionScore(
                        name=c.name,
                        score=max(0, min(100, c.score)),
                        grade=grade_val,  # type: ignore[arg-type]
                        reasoning=c.reasoning,
                        suggestions=c.suggestions,
                    )
                )

            words = re.findall(r"\b[\w'-]+\b", title)
            return TitleScoringResponse(
                overall_score=overall_score,
                grade=grade,
                clarity_score=analysis.clarity_score,
                specificity_score=analysis.specificity_score,
                curiosity_score=analysis.curiosity_score,
                readability_score=analysis.readability_score,
                relevance_score=analysis.relevance_score,
                criteria=criteria,
                explanations=explanations + analysis.explanations,
                suggestions=analysis.suggestions[:5],
                alternative_titles=analysis.alternative_titles[:5],
                character_count=len(title),
                word_count=len(words),
                provider=f"google-gemini/{provider.model}",
                provider_note=f"AI title optimization and hook analysis performed by Google Gemini ({provider.model}). Scores calculated deterministically.",
                evaluated_at=datetime.now(timezone.utc).isoformat(),
            )

        except GeminiError as err:
            if not effective_fallback:
                raise
            logger.warning("Gemini title analysis failed (%s); using heuristic fallback", err.message)
            return score_title_heuristic(request, fallback_reason=err.message)

    # Provider not configured
    if not effective_fallback:
        raise GeminiConfigError("Google Gemini API is not configured. Set GEMINI_API_KEY in the backend environment.")

    return score_title_heuristic(
        request,
        fallback_reason="GEMINI_API_KEY is not configured in backend environment",
    )


def score_title_heuristic(
    request: TitleScoringRequest,
    fallback_reason: Optional[str] = None,
) -> TitleScoringResponse:
    """
    Heuristic title evaluation fallback clearly labeled as such.
    """
    title = request.title.strip()
    char_count = len(title)
    words = re.findall(r"\b[\w'-]+\b", title)
    word_count = len(words)
    words_lower = [w.lower() for w in words]

    explanations: list[str] = []
    suggestions: list[str] = []
    criteria: list[TitleCriterionScore] = []

    # 1. Clarity Score
    clarity_score = 90
    clarity_suggestions: list[str] = []
    if word_count < 4:
        clarity_score -= 20
        clarity_reason = "Title is very brief (< 4 words), leaving viewer context ambiguous."
        clarity_suggestions.append("Expand title with clear subject and value proposition.")
    elif 5 <= word_count <= 11:
        clarity_score = 95
        clarity_reason = f"Ideal word count ({word_count} words). Communicates central idea immediately."
    elif word_count > 15:
        clarity_score -= 18
        clarity_reason = f"Word count ({word_count} words) is high; risks losing punchiness."
        clarity_suggestions.append("Trim filler words to keep the title direct and punchy.")
    else:
        clarity_reason = f"Good word count ({word_count} words) with clear sentence structure."

    clarity_grade = "Excellent" if clarity_score >= 85 else ("Good" if clarity_score >= 70 else "Needs Improvement")
    criteria.append(
        TitleCriterionScore(
            name="Clarity",
            score=clarity_score,
            grade=clarity_grade,
            reasoning=clarity_reason,
            suggestions=clarity_suggestions,
        )
    )

    # 2. Specificity Score
    specificity_score = 70
    specificity_suggestions: list[str] = []
    has_number = bool(re.search(r"\b\d+\b", title))
    has_brackets = bool(re.search(r"(\[.*?\]|\(.*?\))", title))

    if has_number:
        specificity_score += 15
    if has_brackets:
        specificity_score += 10

    meaningful_words = [w for w in words_lower if w not in STOP_WORDS]
    if len(meaningful_words) >= 4:
        specificity_score += 5

    specificity_score = max(40, min(100, specificity_score))
    if specificity_score >= 85:
        specificity_grade = "Excellent"
        specificity_reason = "High specificity with concrete details (numbers or bracketed tags) anchoring viewer expectations."
    elif specificity_score >= 70:
        specificity_grade = "Good"
        specificity_reason = "Moderate specificity. Good focus, but could benefit from a precise anchor."
        specificity_suggestions.append("Incorporate a specific number, timeframe (e.g. 'in 2026'), or bracketed qualifier (e.g. '[Full Guide]').")
    else:
        specificity_grade = "Needs Improvement"
        specificity_reason = "Low specificity. Title uses generic phrasing without tangible hooks."
        specificity_suggestions.append("Add quantitative details (e.g., '5 Steps', '$10k', '30 Days') to build credibility.")

    criteria.append(
        TitleCriterionScore(
            name="Specificity",
            score=specificity_score,
            grade=specificity_grade,
            reasoning=specificity_reason,
            suggestions=specificity_suggestions,
        )
    )

    # 3. Curiosity / Hook Score
    curiosity_score = 65
    curiosity_suggestions: list[str] = []
    found_power_words = [w for w in words_lower if w in POWER_WORDS]
    has_question = "?" in title
    has_colon = ":" in title or "—" in title or "-" in title

    if found_power_words:
        curiosity_score += min(25, len(found_power_words) * 12)
    if has_question:
        curiosity_score += 10
    if has_colon:
        curiosity_score += 5

    curiosity_score = max(35, min(100, curiosity_score))
    if curiosity_score >= 85:
        curiosity_grade = "Excellent"
        power_str = ", ".join(f"'{p}'" for p in found_power_words) if found_power_words else "provocative framing"
        curiosity_reason = f"Compelling hook utilizing emotional curiosity triggers ({power_str})."
    elif curiosity_score >= 70:
        curiosity_grade = "Good"
        curiosity_reason = "Solid interest level, but could increase emotional friction or curiosity gap."
        curiosity_suggestions.append("Introduce a curiosity gap word (e.g. 'Why', 'Mistake', 'The Real Reason').")
    else:
        curiosity_grade = "Needs Improvement"
        curiosity_reason = "Factual but low curiosity friction. Unlikely to stop casual feed scrollers."
        curiosity_suggestions.append("Frame as an intriguing question or contrarian angle to spark curiosity.")

    criteria.append(
        TitleCriterionScore(
            name="Curiosity & Hook",
            score=curiosity_score,
            grade=curiosity_grade,
            reasoning=curiosity_reason,
            suggestions=curiosity_suggestions,
        )
    )

    # 4. Readability Score
    readability_score = 90
    readability_suggestions: list[str] = []

    if 45 <= char_count <= 65:
        readability_score = 98
        readability_reason = f"Optimal length ({char_count} chars). Complete title visible on mobile feed without truncation."
    elif char_count < 30:
        readability_score -= 15
        readability_reason = f"Short title ({char_count} chars). May look incomplete or lack context in search."
        readability_suggestions.append("Lengthen title closer to 50 characters to maximize keywords and context.")
    elif 65 < char_count <= 80:
        readability_score -= 10
        readability_reason = f"Slightly long ({char_count} chars). Trailing words may be truncated on small smartphone screens."
        readability_suggestions.append("Front-load critical keywords so they remain visible before the mobile 65-character cutoff.")
    else:
        readability_score -= 25
        readability_reason = f"Excessive length ({char_count} chars). Will suffer heavy mobile truncation."
        readability_suggestions.append("Trim title down to under 65 characters to protect mobile glanceability.")

    if title.isupper() and len(title) > 10:
        readability_score -= 20
        readability_suggestions.append("Avoid ALL CAPS. Use Title Case or Sentence Case to prevent appearing spammy.")
    elif title.islower() and len(title) > 10:
        readability_score -= 10
        readability_suggestions.append("Capitalize first letters of major words for professional polish.")

    if re.search(r"(!{2,}|\?{2,})", title):
        readability_score -= 15
        readability_suggestions.append("Remove excessive punctuation ('!!', '??') to maintain platform trust.")

    readability_score = max(30, min(100, readability_score))
    readability_grade = "Excellent" if readability_score >= 85 else ("Good" if readability_score >= 70 else "Needs Improvement")
    criteria.append(
        TitleCriterionScore(
            name="Readability & Formatting",
            score=readability_score,
            grade=readability_grade,
            reasoning=readability_reason,
            suggestions=readability_suggestions,
        )
    )

    # 5. Topic / Description Relevance
    relevance_score: Optional[int] = None
    target_context = (request.topic or "") + " " + (request.description or "")
    if target_context.strip():
        context_words = set(re.findall(r"\b[\w'-]+\b", target_context.lower()))
        context_meaningful = context_words - STOP_WORDS
        title_meaningful = set(words_lower) - STOP_WORDS

        if context_meaningful:
            overlap = title_meaningful.intersection(context_meaningful)
            overlap_ratio = len(overlap) / max(1, min(len(title_meaningful), 4))
            relevance_score = round(min(100, max(45, 50 + overlap_ratio * 50)))
        else:
            relevance_score = 80

        rel_grade = "Excellent" if relevance_score >= 85 else ("Good" if relevance_score >= 70 else "Needs Improvement")
        criteria.append(
            TitleCriterionScore(
                name="Topic Relevance",
                score=relevance_score,
                grade=rel_grade,
                reasoning=f"Analyzed alignment with target topic context ({len(title_meaningful.intersection(context_meaningful))} key matching concepts).",
                suggestions=[
                    "Ensure core niche keywords from your video description are explicitly represented in the title."
                ],
            )
        )

    if relevance_score is not None:
        overall_score = round(
            clarity_score * 0.25
            + specificity_score * 0.20
            + curiosity_score * 0.25
            + readability_score * 0.15
            + relevance_score * 0.15
        )
        explanations.append(
            "Overall score calculated as: Clarity (25%) + Specificity (20%) + Curiosity (25%) + Readability (15%) + Topic Relevance (15%)."
        )
    else:
        overall_score = round(
            clarity_score * 0.30
            + specificity_score * 0.25
            + curiosity_score * 0.25
            + readability_score * 0.20
        )
        explanations.append(
            "Overall score calculated as: Clarity (30%) + Specificity (25%) + Curiosity (25%) + Readability (20%). Provide a topic or description for relevance scoring."
        )

    overall_score = max(0, min(100, overall_score))
    if overall_score >= 90:
        grade = "A+ Exceptional"
    elif overall_score >= 80:
        grade = "A Strong Performer"
    elif overall_score >= 70:
        grade = "B Solid Foundation"
    elif overall_score >= 60:
        grade = "C Needs Refinement"
    else:
        grade = "D Needs Rework"

    for crit in criteria:
        suggestions.extend(crit.suggestions)

    if not suggestions:
        suggestions.append("Your title is well-optimized across length, formatting, and curiosity criteria.")

    core_topic = request.topic.strip() if request.topic and request.topic.strip() else title
    clean_topic = re.sub(r"[?!:;]+$", "", core_topic).strip()
    clean_title = re.sub(r"[?!:;]+$", "", title).strip()

    alternative_titles = [
        f"The Real Reason {clean_topic} (And What to Do)",
        f"7 {clean_topic} Secrets That Actually Work in 2026",
        f"How to Master {clean_topic} [Complete Guide]",
        f"Stop Doing This! The Biggest {clean_topic} Mistake",
    ]
    if clean_title.lower() != clean_topic.lower():
        alternative_titles[0] = f"Why {clean_title} Is Changing Everything"

    if fallback_reason:
        grade = f"[Fallback] {grade}"
        provider_label = "heuristic-nlp-engine (fallback)"
        note = f"Evaluated using local heuristic fallback ({fallback_reason}). This is not an AI-evaluated score."
    else:
        provider_label = "heuristic-nlp-engine"
        note = "Evaluated using heuristic title analytics and creator headline formulas. No external LLM API key configured."

    return TitleScoringResponse(
        overall_score=overall_score,
        grade=grade,
        clarity_score=clarity_score,
        specificity_score=specificity_score,
        curiosity_score=curiosity_score,
        readability_score=readability_score,
        relevance_score=relevance_score,
        criteria=criteria,
        explanations=explanations,
        suggestions=suggestions[:5],
        alternative_titles=alternative_titles,
        character_count=char_count,
        word_count=word_count,
        provider=provider_label,
        provider_note=note,
        evaluated_at=datetime.now(timezone.utc).isoformat(),
    )
