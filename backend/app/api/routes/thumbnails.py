from fastapi import APIRouter, HTTPException, status

from app.schemas.dashboard import ErrorDetail
from app.schemas.thumbnails import (
    ThumbnailScoringRequest,
    ThumbnailScoringResponse,
    TitleScoringRequest,
    TitleScoringResponse,
)
from app.services.thumbnail_scorer import (
    decode_image_base64,
    score_thumbnail,
    score_title,
)

router = APIRouter(prefix="/thumbnails", tags=["Thumbnails"])


@router.post(
    "/score",
    response_model=ThumbnailScoringResponse,
    response_model_exclude_none=False,
    responses={
        200: {
            "description": "Thumbnail evaluated successfully with structured scoring criteria and diagnostics.",
            "model": ThumbnailScoringResponse,
        },
        400: {
            "description": "Invalid image format, bad base64, excessive size, or corrupt image data.",
            "model": ErrorDetail,
        },
        422: {
            "description": "Validation error in request schema payload.",
        },
        500: {
            "description": "Internal server error occurred during visual analysis.",
            "model": ErrorDetail,
        },
    },
    summary="Score Thumbnail Variant",
    description="Uploads and analyzes a base64-encoded thumbnail variant across contrast, composition, text readability, visual clutter, and optional title alignment.",
)
def score_thumbnail_endpoint(
    payload: ThumbnailScoringRequest,
) -> ThumbnailScoringResponse:
    try:
        raw_bytes = decode_image_base64(payload.image_base64)
        return score_thumbnail(
            image_bytes=raw_bytes,
            filename=payload.filename,
            title=payload.title,
            topic=payload.topic,
        )
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        ) from err
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while analyzing the thumbnail image.",
        ) from err


@router.post(
    "/score-title",
    response_model=TitleScoringResponse,
    response_model_exclude_none=False,
    responses={
        200: {
            "description": "Title evaluated successfully with breakdown across clarity, specificity, curiosity, and readability.",
            "model": TitleScoringResponse,
        },
        400: {
            "description": "Invalid or empty title input.",
            "model": ErrorDetail,
        },
        422: {
            "description": "Validation error in request schema payload.",
        },
        500: {
            "description": "Internal server error occurred during title analysis.",
            "model": ErrorDetail,
        },
    },
    summary="Score Video Title",
    description="Evaluates a proposed YouTube video title against CTR curiosity hooks, clarity, specificity, mobile readability, and topic relevance.",
)
def score_title_endpoint(
    payload: TitleScoringRequest,
) -> TitleScoringResponse:
    try:
        return score_title(request=payload)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        ) from err
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while evaluating the title.",
        ) from err
