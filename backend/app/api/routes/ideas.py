from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.video_idea import (
    GenerateIdeasRequest,
    GenerateIdeasResponse,
    GenerateSeoRequest,
    GenerateSeoResponse,
    VideoIdeaCreate,
    VideoIdeaResponse,
    VideoIdeaUpdate,
)
from app.services.video_ideas import (
    create_saved_idea,
    delete_saved_idea,
    generate_ideas_ai,
    generate_seo_ai,
    get_saved_idea_by_id,
    list_saved_ideas,
    update_saved_idea,
)

router = APIRouter(prefix="/ideas", tags=["Video Ideas & SEO"])


@router.post(
    "/generate",
    response_model=GenerateIdeasResponse,
    summary="Generate Video Ideas",
    description="Uses Gemini AI to generate multiple high-appeal video concepts with angles, hooks, and keyword suggestions.",
)
def generate_ideas_endpoint(
    request: GenerateIdeasRequest,
    current_user: User = Depends(get_current_user),
) -> GenerateIdeasResponse:
    return generate_ideas_ai(request=request)


@router.post(
    "/generate-seo",
    response_model=GenerateSeoResponse,
    summary="Generate Video SEO Kit",
    description="Uses Gemini AI to generate title variations, an SEO-friendly structured description, tags, hashtags, keywords, and thumbnail text.",
)
def generate_seo_endpoint(
    request: GenerateSeoRequest,
    current_user: User = Depends(get_current_user),
) -> GenerateSeoResponse:
    return generate_seo_ai(request=request)


@router.post(
    "",
    response_model=VideoIdeaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Save Video Idea",
    description="Persists a video idea for the authenticated creator with tenant isolation.",
)
def create_idea_endpoint(
    idea_in: VideoIdeaCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> VideoIdeaResponse:
    idea = create_saved_idea(db=db, user=current_user, idea_in=idea_in)
    return VideoIdeaResponse.from_orm_model(idea)


@router.get(
    "",
    response_model=list[VideoIdeaResponse],
    summary="List Saved Video Ideas",
    description="Retrieves all saved video ideas belonging to the authenticated user.",
)
def list_ideas_endpoint(
    channel_id: Optional[str] = Query(default=None, description="Optional channel ID filter"),
    is_favorite: Optional[bool] = Query(default=None, description="Filter by favorite status"),
    search: Optional[str] = Query(default=None, description="Search term for title or topic"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[VideoIdeaResponse]:
    ideas = list_saved_ideas(
        db=db,
        user=current_user,
        channel_id=channel_id,
        is_favorite=is_favorite,
        search=search,
    )
    return [VideoIdeaResponse.from_orm_model(item) for item in ideas]


@router.get(
    "/{idea_id}",
    response_model=VideoIdeaResponse,
    summary="Get Saved Video Idea",
    description="Retrieves an individual saved idea with tenant ownership validation.",
)
def get_idea_endpoint(
    idea_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> VideoIdeaResponse:
    idea = get_saved_idea_by_id(db=db, user=current_user, idea_id=idea_id)
    return VideoIdeaResponse.from_orm_model(idea)


@router.patch(
    "/{idea_id}",
    response_model=VideoIdeaResponse,
    summary="Update Saved Video Idea",
    description="Updates editable fields or favorite/status of an idea with tenant isolation.",
)
def update_idea_endpoint(
    idea_id: str,
    idea_in: VideoIdeaUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> VideoIdeaResponse:
    idea = update_saved_idea(db=db, user=current_user, idea_id=idea_id, idea_in=idea_in)
    return VideoIdeaResponse.from_orm_model(idea)


@router.delete(
    "/{idea_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Saved Video Idea",
    description="Deletes a saved video idea belonging to the authenticated user.",
)
def delete_idea_endpoint(
    idea_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    delete_saved_idea(db=db, user=current_user, idea_id=idea_id)
