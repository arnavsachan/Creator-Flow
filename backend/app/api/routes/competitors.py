from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.competitor import (
    CompetitorComparisonResponse,
    CompetitorCreate,
    CompetitorResponse,
    CompetitorSearchResponse,
    CompetitorUploadsResponse,
)
from app.services.competitor import (
    compare_channel_with_competitor,
    create_competitor,
    delete_competitor,
    get_competitor_by_id,
    get_competitor_uploads,
    list_competitors,
    search_youtube_channels,
)

router = APIRouter(prefix="/competitors", tags=["Competitor Intelligence"])


@router.get(
    "/search",
    response_model=CompetitorSearchResponse,
    summary="Search Public YouTube Channels",
    description="Searches YouTube Data API v3 for public channels by name, handle (@handle), URL, or channel ID.",
)
def search_competitors_endpoint(
    q: str = Query(..., min_length=1, description="Channel search term, @handle, or URL"),
    page_token: Optional[str] = Query(default=None, description="Pagination token"),
    max_results: int = Query(default=10, ge=1, le=25, description="Number of results to return"),
    channel_id: Optional[str] = Query(default=None, description="User's preferred channel ID for OAuth token resolution"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CompetitorSearchResponse:
    return search_youtube_channels(
        db=db,
        user=current_user,
        query=q,
        page_token=page_token,
        max_results=max_results,
        preferred_channel_id=channel_id,
    )


@router.post(
    "",
    response_model=CompetitorResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Save Competitor Channel",
    description="Adds a public YouTube channel to the user's tracked competitors list with duplicate prevention.",
)
def create_competitor_endpoint(
    comp_in: CompetitorCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CompetitorResponse:
    competitor = create_competitor(db=db, user=current_user, comp_in=comp_in)
    return CompetitorResponse.model_validate(competitor)


@router.get(
    "",
    response_model=list[CompetitorResponse],
    summary="List Tracked Competitors",
    description="Retrieves the authenticated user's tracked competitor channels, isolated by tenant.",
)
def list_competitors_endpoint(
    channel_id: Optional[str] = Query(default=None, description="Filter by primary connected channel"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CompetitorResponse]:
    competitors = list_competitors(db=db, user=current_user, primary_channel_id=channel_id)
    return [CompetitorResponse.model_validate(c) for c in competitors]


@router.get(
    "/{competitor_id}",
    response_model=CompetitorResponse,
    summary="Get Competitor Details",
    description="Retrieves details for a single tracked competitor by record ID.",
)
def get_competitor_endpoint(
    competitor_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CompetitorResponse:
    comp = get_competitor_by_id(db=db, user=current_user, competitor_id=competitor_id)
    return CompetitorResponse.model_validate(comp)


@router.delete(
    "/{competitor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove Tracked Competitor",
    description="Removes a channel from the user's tracked competitor list.",
)
def delete_competitor_endpoint(
    competitor_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    delete_competitor(db=db, user=current_user, competitor_id=competitor_id)


@router.get(
    "/{competitor_id}/uploads",
    response_model=CompetitorUploadsResponse,
    summary="Get Competitor Latest Uploads",
    description="Fetches recent public uploads, parsed durations, and statistics for a tracked competitor.",
)
def get_competitor_uploads_endpoint(
    competitor_id: str,
    max_results: int = Query(default=12, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CompetitorUploadsResponse:
    return get_competitor_uploads(
        db=db,
        user=current_user,
        competitor_id=competitor_id,
        max_results=max_results,
    )


@router.get(
    "/{competitor_id}/compare",
    response_model=CompetitorComparisonResponse,
    summary="Compare Connected Channel with Competitor",
    description="Generates side-by-side public metric comparison while preserving privacy for restricted YouTube metrics.",
)
def compare_competitor_endpoint(
    competitor_id: str,
    channel_id: Optional[str] = Query(default=None, description="User channel ID to compare against"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CompetitorComparisonResponse:
    return compare_channel_with_competitor(
        db=db,
        user=current_user,
        competitor_id=competitor_id,
        user_channel_id=channel_id,
    )
