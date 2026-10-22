import hashlib
import logging
import time
from typing import Optional
import uuid

from fastapi import APIRouter, Header, HTTPException, Response, status

from app.schemas.dashboard import ErrorDetail
from app.schemas.thumbnails import (
    ThumbnailScoringRequest,
    ThumbnailScoringResponse,
    TitleScoringRequest,
    TitleScoringResponse,
)
from app.services.gemini_provider import (
    GeminiAuthError,
    GeminiConfigError,
    GeminiError,
    GeminiModelNotFoundError,
    GeminiQuotaExceededError,
    GeminiRateLimitError,
    GeminiServiceUnavailableError,
    GeminiTimeoutError,
)
from app.services.thumbnail_scorer import (
    decode_image_base64,
    score_thumbnail,
    score_title,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/thumbnails", tags=["Thumbnails"])


@router.post(
    "/score",
    response_model=ThumbnailScoringResponse,
    response_model_exclude_none=False,
    responses={
        200: {
            "description": "Thumbnail evaluated successfully by Google Gemini or explicit diagnostic fallback.",
            "model": ThumbnailScoringResponse,
        },
        400: {
            "description": "Invalid image format, bad base64, excessive size, or corrupt image data.",
            "model": ErrorDetail,
        },
        422: {
            "description": "Validation error in request schema payload.",
        },
        429: {
            "description": "Google Gemini API rate limit or quota exceeded.",
            "model": ErrorDetail,
        },
        502: {
            "description": "Google Gemini API upstream service or authentication failure.",
            "model": ErrorDetail,
        },
        503: {
            "description": "Google Gemini API key is missing or service unconfigured.",
            "model": ErrorDetail,
        },
        504: {
            "description": "Google Gemini API request timed out.",
            "model": ErrorDetail,
        },
    },
    summary="Score Thumbnail Variant with Gemini AI",
    description="Uploads and analyzes a base64-encoded thumbnail variant using Google Gemini multimodal AI across contrast, composition, text readability, visual clutter, and title alignment.",
)
def score_thumbnail_endpoint(
    payload: ThumbnailScoringRequest,
    response: Response,
    x_gemini_api_key: Optional[str] = Header(
        default=None,
        alias="X-Gemini-API-Key",
        description="Optional override API key for Google Gemini",
    ),
) -> ThumbnailScoringResponse:
    req_id = uuid.uuid4().hex[:8]
    response.headers["X-Request-ID"] = req_id
    t0 = time.perf_counter()
    raw_bytes = b""
    img_hash = "unknown"
    try:
        raw_bytes = decode_image_base64(payload.image_base64)
        img_hash = hashlib.sha256(raw_bytes).hexdigest()
        scoring_res = score_thumbnail(
            image_bytes=raw_bytes,
            filename=payload.filename,
            title=payload.title,
            topic=payload.topic,
            gemini_api_key=x_gemini_api_key,
            allow_fallback=payload.allow_fallback,
        )
        elapsed = time.perf_counter() - t0
        is_fallback = "fallback" in scoring_res.provider
        logger.info(
            "[ThumbnailScoring] req_id=%s sha256=%s byte_length=%d dims=%dx%d model_id=%s elapsed_sec=%.2f provider_outcome=%s",
            req_id,
            img_hash,
            len(raw_bytes),
            scoring_res.metadata.width,
            scoring_res.metadata.height,
            scoring_res.provider,
            elapsed,
            "fallback" if is_fallback else "success",
        )
        return scoring_res
    except ValueError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[ThumbnailScoring] req_id=%s sha256=%s byte_length=%d elapsed_sec=%.2f provider_outcome=bad_request err=%s",
            req_id,
            img_hash,
            len(raw_bytes),
            elapsed,
            str(err),
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err),
            headers={"X-Request-ID": req_id},
        ) from err
    except GeminiConfigError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[ThumbnailScoring] req_id=%s sha256=%s byte_length=%d elapsed_sec=%.2f provider_outcome=unconfigured",
            req_id,
            img_hash,
            len(raw_bytes),
            elapsed,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=err.message,
            headers={"X-Request-ID": req_id},
        ) from err
    except GeminiServiceUnavailableError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[ThumbnailScoring] req_id=%s sha256=%s byte_length=%d elapsed_sec=%.2f provider_outcome=unavailable err=%s",
            req_id,
            img_hash,
            len(raw_bytes),
            elapsed,
            err.message,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=err.message,
            headers={"X-Request-ID": req_id},
        ) from err
    except GeminiAuthError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[ThumbnailScoring] req_id=%s sha256=%s byte_length=%d elapsed_sec=%.2f provider_outcome=auth_error err=%s",
            req_id,
            img_hash,
            len(raw_bytes),
            elapsed,
            err.message,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=err.message,
            headers={"X-Request-ID": req_id},
        ) from err
    except GeminiModelNotFoundError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[ThumbnailScoring] req_id=%s sha256=%s byte_length=%d elapsed_sec=%.2f provider_outcome=model_not_found err=%s",
            req_id,
            img_hash,
            len(raw_bytes),
            elapsed,
            err.message,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=err.message,
            headers={"X-Request-ID": req_id},
        ) from err
    except GeminiQuotaExceededError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[ThumbnailScoring] req_id=%s sha256=%s byte_length=%d elapsed_sec=%.2f provider_outcome=quota_exceeded err=%s",
            req_id,
            img_hash,
            len(raw_bytes),
            elapsed,
            err.message,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=err.message,
            headers={"X-Request-ID": req_id},
        ) from err
    except GeminiRateLimitError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[ThumbnailScoring] req_id=%s sha256=%s byte_length=%d elapsed_sec=%.2f provider_outcome=rate_limit err=%s",
            req_id,
            img_hash,
            len(raw_bytes),
            elapsed,
            err.message,
        )
        resp_headers = {"X-Request-ID": req_id}
        if err.retry_after:
            resp_headers["Retry-After"] = str(err.retry_after)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=err.message,
            headers=resp_headers,
        ) from err
    except GeminiTimeoutError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[ThumbnailScoring] req_id=%s sha256=%s byte_length=%d elapsed_sec=%.2f provider_outcome=timeout err=%s",
            req_id,
            img_hash,
            len(raw_bytes),
            elapsed,
            err.message,
        )
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=err.message,
            headers={"X-Request-ID": req_id},
        ) from err
    except GeminiError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[ThumbnailScoring] req_id=%s sha256=%s byte_length=%d elapsed_sec=%.2f provider_outcome=service_error err=%s",
            req_id,
            img_hash,
            len(raw_bytes),
            elapsed,
            err.message,
        )
        raise HTTPException(
            status_code=err.status_code,
            detail=err.message,
            headers={"X-Request-ID": req_id},
        ) from err
    except Exception as err:
        elapsed = time.perf_counter() - t0
        logger.exception(
            "[ThumbnailScoring] req_id=%s sha256=%s byte_length=%d elapsed_sec=%.2f provider_outcome=unexpected_error",
            req_id,
            img_hash,
            len(raw_bytes),
            elapsed,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected server error occurred while processing the thumbnail.",
            headers={"X-Request-ID": req_id},
        ) from err


@router.post(
    "/score-title",
    response_model=TitleScoringResponse,
    response_model_exclude_none=False,
    responses={
        200: {
            "description": "Title evaluated successfully by Google Gemini or explicit diagnostic fallback.",
            "model": TitleScoringResponse,
        },
        400: {
            "description": "Invalid or empty title input.",
            "model": ErrorDetail,
        },
        422: {
            "description": "Validation error in request schema payload.",
        },
        429: {
            "description": "Google Gemini API rate limit or quota exceeded.",
            "model": ErrorDetail,
        },
        502: {
            "description": "Google Gemini API upstream service, model unsupported, or authentication failure.",
            "model": ErrorDetail,
        },
        503: {
            "description": "Google Gemini API key is missing or service unconfigured.",
            "model": ErrorDetail,
        },
        504: {
            "description": "Google Gemini API request timed out.",
            "model": ErrorDetail,
        },
    },
    summary="Score Video Title with Gemini AI",
    description="Evaluates a proposed YouTube video title using Google Gemini AI across clarity, specificity, curiosity hook, readability, and topic relevance.",
)
def score_title_endpoint(
    payload: TitleScoringRequest,
    response: Response,
    x_gemini_api_key: Optional[str] = Header(
        default=None,
        alias="X-Gemini-API-Key",
        description="Optional override API key for Google Gemini",
    ),
) -> TitleScoringResponse:
    req_id = uuid.uuid4().hex[:8]
    response.headers["X-Request-ID"] = req_id
    t0 = time.perf_counter()
    try:
        title_res = score_title(
            request=payload,
            gemini_api_key=x_gemini_api_key,
            allow_fallback=payload.allow_fallback,
        )
        elapsed = time.perf_counter() - t0
        is_fallback = "fallback" in title_res.provider
        logger.info(
            "[TitleScoring] req_id=%s title_len=%d model_id=%s elapsed_sec=%.2f provider_outcome=%s",
            req_id,
            len(payload.title),
            title_res.provider,
            elapsed,
            "fallback" if is_fallback else "success",
        )
        return title_res
    except ValueError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[TitleScoring] req_id=%s title_len=%d elapsed_sec=%.2f provider_outcome=bad_request err=%s",
            req_id,
            len(payload.title),
            elapsed,
            str(err),
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err),
            headers={"X-Request-ID": req_id},
        ) from err
    except GeminiConfigError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[TitleScoring] req_id=%s title_len=%d elapsed_sec=%.2f provider_outcome=unconfigured",
            req_id,
            len(payload.title),
            elapsed,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=err.message,
            headers={"X-Request-ID": req_id},
        ) from err
    except GeminiServiceUnavailableError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[TitleScoring] req_id=%s title_len=%d elapsed_sec=%.2f provider_outcome=unavailable err=%s",
            req_id,
            len(payload.title),
            elapsed,
            err.message,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=err.message,
            headers={"X-Request-ID": req_id},
        ) from err
    except GeminiAuthError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[TitleScoring] req_id=%s title_len=%d elapsed_sec=%.2f provider_outcome=auth_error err=%s",
            req_id,
            len(payload.title),
            elapsed,
            err.message,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=err.message,
            headers={"X-Request-ID": req_id},
        ) from err
    except GeminiModelNotFoundError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[TitleScoring] req_id=%s title_len=%d elapsed_sec=%.2f provider_outcome=model_not_found err=%s",
            req_id,
            len(payload.title),
            elapsed,
            err.message,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=err.message,
            headers={"X-Request-ID": req_id},
        ) from err
    except GeminiQuotaExceededError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[TitleScoring] req_id=%s title_len=%d elapsed_sec=%.2f provider_outcome=quota_exceeded err=%s",
            req_id,
            len(payload.title),
            elapsed,
            err.message,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=err.message,
            headers={"X-Request-ID": req_id},
        ) from err
    except GeminiRateLimitError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[TitleScoring] req_id=%s title_len=%d elapsed_sec=%.2f provider_outcome=rate_limit err=%s",
            req_id,
            len(payload.title),
            elapsed,
            err.message,
        )
        resp_headers = {"X-Request-ID": req_id}
        if err.retry_after:
            resp_headers["Retry-After"] = str(err.retry_after)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=err.message,
            headers=resp_headers,
        ) from err
    except GeminiTimeoutError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[TitleScoring] req_id=%s title_len=%d elapsed_sec=%.2f provider_outcome=timeout err=%s",
            req_id,
            len(payload.title),
            elapsed,
            err.message,
        )
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=err.message,
            headers={"X-Request-ID": req_id},
        ) from err
    except GeminiError as err:
        elapsed = time.perf_counter() - t0
        logger.warning(
            "[TitleScoring] req_id=%s title_len=%d elapsed_sec=%.2f provider_outcome=service_error err=%s",
            req_id,
            len(payload.title),
            elapsed,
            err.message,
        )
        raise HTTPException(
            status_code=err.status_code,
            detail=err.message,
            headers={"X-Request-ID": req_id},
        ) from err
    except Exception as err:
        elapsed = time.perf_counter() - t0
        logger.exception(
            "[TitleScoring] req_id=%s title_len=%d elapsed_sec=%.2f provider_outcome=unexpected_error",
            req_id,
            len(payload.title),
            elapsed,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected server error occurred while processing the title.",
            headers={"X-Request-ID": req_id},
        ) from err
