from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.content_plan import (
    ContentCalendarResponse,
    ContentPlanCreate,
    ContentPlanResponse,
    ContentPlanUpdate,
)
from app.services.content_plan import (
    create_content_plan,
    delete_content_plan,
    get_calendar_view,
    get_content_plan_by_id,
    get_content_plans,
    update_content_plan,
)

router = APIRouter(prefix="/content-plans", tags=["Content Planner & Calendar"])


@router.post(
    "",
    response_model=ContentPlanResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Planned Content Item",
    description="Creates a new planned video or content item in the production pipeline.",
)
def create_plan_endpoint(
    plan_in: ContentPlanCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ContentPlanResponse:
    plan = create_content_plan(db=db, user=current_user, plan_in=plan_in)
    return ContentPlanResponse.model_validate(plan)


@router.get(
    "",
    response_model=list[ContentPlanResponse],
    summary="List Planned Content Items",
    description="Retrieves planned content items for the current user, filterable by channel, stage, and scheduled date range.",
)
def list_plans_endpoint(
    channel_id: Optional[str] = Query(default=None, description="Optional channel ID filter"),
    stage: Optional[str] = Query(default=None, description="Filter by stage: Idea, Scripting, Editing, Ready, Published"),
    start_date: Optional[datetime] = Query(default=None, description="Filter items scheduled after this date"),
    end_date: Optional[datetime] = Query(default=None, description="Filter items scheduled before this date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ContentPlanResponse]:
    plans = get_content_plans(
        db=db,
        user=current_user,
        channel_id=channel_id,
        stage=stage,
        start_date=start_date,
        end_date=end_date,
    )
    return [ContentPlanResponse.model_validate(p) for p in plans]


@router.get(
    "/calendar",
    response_model=ContentCalendarResponse,
    summary="Get Calendar Aggregation View",
    description="Provides unified calendar data combining user planned items and confirmed published YouTube videos.",
)
def get_calendar_endpoint(
    channel_id: Optional[str] = Query(default=None, description="Channel ID to query"),
    start_date: Optional[datetime] = Query(default=None, description="Range start date"),
    end_date: Optional[datetime] = Query(default=None, description="Range end date"),
    include_published: bool = Query(default=True, description="Whether to include confirmed published YouTube videos"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ContentCalendarResponse:
    return get_calendar_view(
        db=db,
        user=current_user,
        channel_id=channel_id,
        start_date=start_date,
        end_date=end_date,
        include_published=include_published,
    )


@router.get(
    "/{plan_id}",
    response_model=ContentPlanResponse,
    summary="Get Content Plan Details",
    description="Retrieves details of a single planned content item by ID.",
)
def get_plan_endpoint(
    plan_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ContentPlanResponse:
    plan = get_content_plan_by_id(db=db, user=current_user, plan_id=plan_id)
    return ContentPlanResponse.model_validate(plan)


@router.patch(
    "/{plan_id}",
    response_model=ContentPlanResponse,
    summary="Update Content Plan",
    description="Updates title, stage, scheduled date, notes, or linked YouTube video ID.",
)
def update_plan_endpoint(
    plan_id: str,
    plan_in: ContentPlanUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ContentPlanResponse:
    plan = update_content_plan(db=db, user=current_user, plan_id=plan_id, plan_in=plan_in)
    return ContentPlanResponse.model_validate(plan)


@router.delete(
    "/{plan_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete Content Plan",
    description="Deletes a planned content item from the calendar.",
)
def delete_plan_endpoint(
    plan_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str | bool]:
    delete_content_plan(db=db, user=current_user, plan_id=plan_id)
    return {"success": True, "message": f"Content plan '{plan_id}' deleted successfully."}
