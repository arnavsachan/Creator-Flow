from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

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
)
def get_dashboard_overview_endpoint(
    channel_id: Optional[str] = Query(
        default=None,
        description="Unique identifier for the creator channel. Defaults to 'demo-channel-1'.",
    ),
) -> DashboardOverviewResponse:
    try:
        return get_dashboard_overview(channel_id=channel_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err
