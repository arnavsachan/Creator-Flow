from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session


from app.api.deps import get_current_user_optional
from app.db.session import get_db
from app.models.channel import ConnectedChannel
from app.models.user import User
from app.schemas.dashboard import DashboardOverviewResponse, ErrorDetail
from app.services.dashboard import get_dashboard_overview

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get(
    "/overview",
    response_model=DashboardOverviewResponse,
    response_model_exclude_none=False,
    responses={
        200: {
            "description": "Dashboard overview telemetry returned in standard data-state envelope",
            "model": DashboardOverviewResponse,
        },
        404: {
            "description": "Channel not found or unsupported",
            "model": ErrorDetail,
        },
    },
    summary="Get Dashboard Overview Metrics",
    description="Returns aggregated channel metrics, performance chart data, and active workflow summaries for the dashboard.",
)
def get_dashboard_overview_endpoint(
    channel_id: Optional[str] = Query(
        default=None,
        description="Unique identifier for the creator channel. Defaults to 'demo-channel-1'.",
    ),
    days: int = Query(
        default=28,
        ge=1,
        le=365,
        description="Lookback window in days for historical velocity chart telemetry.",
    ),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> DashboardOverviewResponse:
    # If user is authenticated and channel_id is not a demo channel, verify channel ownership
    target_id = (channel_id or "demo-channel-1").strip()
    if current_user and target_id.startswith("UC"):
        owned = (
            db.query(ConnectedChannel)
            .filter(
                ConnectedChannel.channel_id == target_id,
                ConnectedChannel.user_id == current_user.id,
            )
            .first()
        )
        if not owned:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Channel '{target_id}' not found for authenticated user.",
            )

    try:
        return get_dashboard_overview(channel_id=channel_id, db=db, days=days)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err
