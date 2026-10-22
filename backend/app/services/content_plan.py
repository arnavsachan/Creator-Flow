from datetime import datetime, timezone
import logging
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.channel import ConnectedChannel
from app.models.content_plan import ContentPlan
from app.models.user import User
from app.models.video import ChannelVideo
from app.schemas.content_plan import (
    ContentCalendarItem,
    ContentCalendarResponse,
    ContentPlanCreate,
    ContentPlanUpdate,
)

logger = logging.getLogger(__name__)


def create_content_plan(
    db: Session,
    user: User,
    plan_in: ContentPlanCreate,
) -> ContentPlan:
    """
    Creates a new planned content item associated with the authenticated user.
    """
    # Normalize scheduled_at to UTC
    sched_at = plan_in.scheduled_at
    if sched_at.tzinfo is None:
        sched_at = sched_at.replace(tzinfo=timezone.utc)

    plan = ContentPlan(
        user_id=user.id,
        channel_id=plan_in.channel_id,
        title=plan_in.title.strip(),
        description=plan_in.description.strip() if plan_in.description else None,
        content_type=plan_in.content_type,
        platform=plan_in.platform,
        stage=plan_in.stage,
        scheduled_at=sched_at,
        notes=plan_in.notes.strip() if plan_in.notes else None,
        video_id=plan_in.video_id.strip() if plan_in.video_id else None,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def get_content_plans(
    db: Session,
    user: User,
    channel_id: Optional[str] = None,
    stage: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> list[ContentPlan]:
    """
    Retrieves all planned content items belonging to the authenticated user,
    with optional filtering by channel_id, production stage, and scheduled date range.
    """
    query = db.query(ContentPlan).filter(ContentPlan.user_id == user.id)

    if channel_id:
        query = query.filter(
            (ContentPlan.channel_id == channel_id) | (ContentPlan.channel_id.is_(None))
        )
    if stage:
        query = query.filter(ContentPlan.stage == stage)
    if start_date:
        if start_date.tzinfo is None:
            start_date = start_date.replace(tzinfo=timezone.utc)
        query = query.filter(ContentPlan.scheduled_at >= start_date)
    if end_date:
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
        query = query.filter(ContentPlan.scheduled_at <= end_date)

    return query.order_by(ContentPlan.scheduled_at.asc()).all()


def get_content_plan_by_id(
    db: Session,
    user: User,
    plan_id: str,
) -> ContentPlan:
    """
    Retrieves a single ContentPlan by ID, verifying tenant user ownership.
    """
    plan = (
        db.query(ContentPlan)
        .filter(ContentPlan.id == plan_id, ContentPlan.user_id == user.id)
        .first()
    )
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Content plan '{plan_id}' not found.",
        )
    return plan


def update_content_plan(
    db: Session,
    user: User,
    plan_id: str,
    plan_in: ContentPlanUpdate,
) -> ContentPlan:
    """
    Updates an existing ContentPlan item.
    """
    plan = get_content_plan_by_id(db, user, plan_id)

    update_data = plan_in.model_dump(exclude_unset=True)
    if "scheduled_at" in update_data and update_data["scheduled_at"] is not None:
        sched = update_data["scheduled_at"]
        if sched.tzinfo is None:
            update_data["scheduled_at"] = sched.replace(tzinfo=timezone.utc)

    for field, val in update_data.items():
        if isinstance(val, str):
            val = val.strip()
        setattr(plan, field, val)

    db.commit()
    db.refresh(plan)
    return plan


def delete_content_plan(
    db: Session,
    user: User,
    plan_id: str,
) -> bool:
    """
    Deletes a ContentPlan item.
    """
    plan = get_content_plan_by_id(db, user, plan_id)
    db.delete(plan)
    db.commit()
    return True


def get_calendar_view(
    db: Session,
    user: User,
    channel_id: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    include_published: bool = True,
) -> ContentCalendarResponse:
    """
    Builds a unified calendar view combining planned content and confirmed
    published YouTube channel videos within the specified date range.
    """
    # 1. Fetch planned items
    plans = get_content_plans(
        db=db,
        user=user,
        channel_id=channel_id,
        start_date=start_date,
        end_date=end_date,
    )

    items: list[ContentCalendarItem] = []
    stage_counts: dict[str, int] = {
        "Idea": 0,
        "Scripting": 0,
        "Editing": 0,
        "Ready": 0,
        "Published": 0,
    }

    # Track video IDs of planned items to avoid duplicate display
    planned_video_ids: set[str] = set()

    for p in plans:
        stg = p.stage if p.stage in stage_counts else "Idea"
        stage_counts[stg] = stage_counts.get(stg, 0) + 1
        if p.video_id:
            planned_video_ids.add(p.video_id)

        items.append(
            ContentCalendarItem(
                id=p.id,
                item_type="planned",
                title=p.title,
                description=p.description,
                content_type=p.content_type,
                platform=p.platform,
                stage=p.stage,
                date=p.scheduled_at,
                video_id=p.video_id,
                notes=p.notes,
                channel_id=p.channel_id,
                is_live_verified=False,
            )
        )

    # 2. Fetch confirmed published videos if requested
    total_published = 0
    if include_published:
        # Determine target channel
        target_ch_id = channel_id
        if not target_ch_id:
            # Fall back to user's connected channel if available
            conn = (
                db.query(ConnectedChannel)
                .filter(ConnectedChannel.user_id == user.id, ConnectedChannel.status == "connected")
                .first()
            )
            if conn:
                target_ch_id = conn.channel_id

        if target_ch_id and not target_ch_id.startswith("demo-"):
            v_query = db.query(ChannelVideo).filter(ChannelVideo.channel_id == target_ch_id)
            if start_date:
                if start_date.tzinfo is None:
                    start_date = start_date.replace(tzinfo=timezone.utc)
                v_query = v_query.filter(ChannelVideo.published_at >= start_date)
            if end_date:
                if end_date.tzinfo is None:
                    end_date = end_date.replace(tzinfo=timezone.utc)
                v_query = v_query.filter(ChannelVideo.published_at <= end_date)

            pub_videos = v_query.order_by(ChannelVideo.published_at.desc()).all()
            for v in pub_videos:
                total_published += 1
                # If this video is already explicitly linked to a planned item, update stage count
                if v.video_id in planned_video_ids:
                    continue

                stage_counts["Published"] = stage_counts.get("Published", 0) + 1
                items.append(
                    ContentCalendarItem(
                        id=f"pub_{v.video_id}",
                        item_type="published",
                        title=v.title,
                        description=v.description,
                        content_type="Short" if (v.duration_seconds and v.duration_seconds <= 60) or "#shorts" in v.title.lower() else "Long-form",
                        platform="youtube",
                        stage="Published",
                        date=v.published_at,
                        video_id=v.video_id,
                        thumbnail_url=v.thumbnail_url,
                        duration=v.duration,
                        view_count=v.view_count,
                        like_count=v.like_count,
                        channel_id=v.channel_id,
                        is_live_verified=True,
                    )
                )

    # Sort all calendar items chronologically
    items.sort(key=lambda x: x.date)

    return ContentCalendarResponse(
        items=items,
        total_planned=len(plans),
        total_published=total_published,
        stage_counts=stage_counts,
        channel_id=channel_id,
    )
