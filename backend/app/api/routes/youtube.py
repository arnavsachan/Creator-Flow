import logging
from typing import Optional
import urllib.parse

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_current_user_optional
from app.core.config import get_settings
from app.db.session import get_db
from app.models.channel import ConnectedChannel
from app.models.user import User
from app.schemas.youtube import (
    AnalyticsTelemetryResponse,
    AudienceTelemetryResponse,
    ChannelHistoryResponse,
    ChannelSnapshotItem,
    ChannelVideoItem,
    ChannelVideosResponse,
    ConnectedChannelResponse,
    ConnectionStatusResponse,
    DisconnectResponse,
    GeographicViewerItem,
    OAuthCallbackRequest,
    OAuthStartResponse,
    RetentionPoint,
    TrafficSourceItem,
)
from app.services.dashboard import format_relative_time
from app.services.youtube_oauth import (
    disconnect_channel,
    get_channel_snapshots,
    get_channel_videos,
    get_user_connected_channel,
    process_oauth_callback,
    start_youtube_oauth,
    sync_channel_metrics,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/youtube", tags=["YouTube OAuth"])


@router.get(
    "/oauth/start",
    response_model=OAuthStartResponse,
    summary="Start YouTube OAuth Flow",
    description="Generates an OAuth authorization URL with CSRF state token and PKCE code challenge.",
)
def oauth_start(
    redirect_uri: Optional[str] = Query(default=None, description="Custom redirect URI if different from default"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OAuthStartResponse:
    auth_url, state = start_youtube_oauth(
        db=db,
        user=current_user,
        redirect_uri=redirect_uri,
    )
    return OAuthStartResponse(
        authorization_url=auth_url,
        state=state,
    )


@router.get(
    "/oauth/callback",
    summary="Google OAuth Browser Callback",
    description="Handles Google OAuth redirect in browser, exchanges tokens, links channel, and redirects to frontend.",
)
def oauth_callback_browser(
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    settings = get_settings()
    frontend_channels_url = f"{settings.FRONTEND_URL}/channels"

    if error:
        logger.warning("OAuth authorization denied or errored: %s - %s", error, error_description)
        params = {"error": error, "message": error_description or "Access was denied by the user."}
        return RedirectResponse(
            url=f"{frontend_channels_url}?{urllib.parse.urlencode(params)}",
            status_code=status.HTTP_302_FOUND,
        )

    if not code or not state:
        params = {"error": "invalid_request", "message": "Missing authorization code or state parameter."}
        return RedirectResponse(
            url=f"{frontend_channels_url}?{urllib.parse.urlencode(params)}",
            status_code=status.HTTP_302_FOUND,
        )

    try:
        channel = process_oauth_callback(db=db, code=code, state=state)
        params = {"success": "connected", "channel_id": channel.channel_id}
        return RedirectResponse(
            url=f"{frontend_channels_url}?{urllib.parse.urlencode(params)}",
            status_code=status.HTTP_302_FOUND,
        )
    except HTTPException as exc:
        code_str = "oauth_failed"
        if exc.status_code == status.HTTP_409_CONFLICT:
            code_str = "channel_already_connected"
        elif exc.status_code == status.HTTP_404_NOT_FOUND:
            code_str = "no_channel_found"
        elif exc.status_code == status.HTTP_400_BAD_REQUEST and "expired" in str(exc.detail).lower():
            code_str = "invalid_state"

        params = {"error": code_str, "message": str(exc.detail)}
        return RedirectResponse(
            url=f"{frontend_channels_url}?{urllib.parse.urlencode(params)}",
            status_code=status.HTTP_302_FOUND,
        )
    except Exception as exc:
        logger.exception("Unexpected error during OAuth callback: %s", exc)
        params = {"error": "internal_error", "message": "An unexpected error occurred during channel connection."}
        return RedirectResponse(
            url=f"{frontend_channels_url}?{urllib.parse.urlencode(params)}",
            status_code=status.HTTP_302_FOUND,
        )


@router.post(
    "/oauth/callback",
    response_model=ConnectedChannelResponse,
    summary="Process OAuth Callback Programmatically",
    description="Processes OAuth callback payload directly via API for client-side or automated testing flows.",
)
def oauth_callback_api(
    payload: OAuthCallbackRequest,
    db: Session = Depends(get_db),
) -> ConnectedChannelResponse:
    channel = process_oauth_callback(
        db=db,
        code=payload.code,
        state=payload.state,
    )
    return ConnectedChannelResponse.model_validate(channel)


@router.get(
    "/connection-status",
    response_model=ConnectionStatusResponse,
    summary="Check YouTube Connection Status",
    description="Returns the connection status and sanitized channel metadata for the current user.",
)
def get_connection_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConnectionStatusResponse:
    channel = get_user_connected_channel(db, current_user.id)
    if not channel:
        return ConnectionStatusResponse(connected=False, channel=None)

    return ConnectionStatusResponse(
        connected=True,
        channel=ConnectedChannelResponse.model_validate(channel),
    )


@router.post(
    "/disconnect",
    response_model=DisconnectResponse,
    summary="Disconnect YouTube Channel",
    description="Revokes credentials with Google, removes stored OAuth tokens, and updates connection status.",
)
def disconnect(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DisconnectResponse:
    disconnect_channel(db=db, user=current_user)
    return DisconnectResponse(
        success=True,
        message="YouTube channel disconnected and credentials revoked successfully.",
    )


@router.post(
    "/sync",
    response_model=ConnectedChannelResponse,
    summary="Synchronize Channel Metrics",
    description="Fetches live telemetry and metrics from YouTube Data API for the connected channel.",
)
def sync_channel(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConnectedChannelResponse:
    channel = sync_channel_metrics(db=db, user=current_user)
    return ConnectedChannelResponse.model_validate(channel)


@router.get(
    "/channels",
    response_model=list[ConnectedChannelResponse],
    summary="List User Channels",
    description="Returns all channels associated with the current application user.",
)
def list_user_channels(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ConnectedChannelResponse]:
    channels = (
        db.query(ConnectedChannel)
        .filter(ConnectedChannel.user_id == current_user.id)
        .order_by(ConnectedChannel.connected_at.desc())
        .all()
    )
    return [ConnectedChannelResponse.model_validate(ch) for ch in channels]


@router.get(
    "/analytics",
    response_model=AnalyticsTelemetryResponse,
    summary="Channel Analytics Telemetry",
    description="Returns verified channel analytics or honest scope limitation disclosures.",
)
def get_channel_analytics(
    channel_id: Optional[str] = Query(default=None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> AnalyticsTelemetryResponse:
    target_id = (channel_id or "demo-channel-1").strip()

    # Tenant ownership isolation check for live channels
    if current_user and not target_id.startswith("demo-"):
        owned = (
            db.query(ConnectedChannel)
            .filter(ConnectedChannel.channel_id == target_id, ConnectedChannel.user_id == current_user.id)
            .first()
        )
        if not owned:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Channel '{target_id}' not found for authenticated user.",
            )

    # Check live connected channels
    channel = (
        db.query(ConnectedChannel)
        .filter(ConnectedChannel.channel_id == target_id)
        .first()
    )
    if channel and channel.status == "connected":
        return AnalyticsTelemetryResponse(
            channel_id=target_id,
            data_state="LIVE",
            is_live=True,
            title=channel.title,
            total_views=int(channel.view_count or 0),
            total_subscribers=int(channel.subscriber_count or 0),
            total_videos=int(channel.video_count or 0),
            traffic_sources=None,
            retention_chart=None,
            scope_limitation_notice="Discovery vectors and retention curves require YouTube Analytics Reporting API permissions (https://www.googleapis.com/auth/yt-analytics.readonly). For smaller channels or low view counts, cohort breakdowns are subject to Google's privacy thresholds and may return no data. YouTube Data API v3 provides aggregate channel-level telemetry only.",
        )

    # Demo fallback channels (only for explicitly designated demo IDs)
    if target_id in ("demo-channel-1", "demo-channel-2") or target_id.startswith("demo-"):
        demo_traffic = [
            TrafficSourceItem(source="YouTube Search", views=540200, percentage="37.8%", change="+14.2%"),
            TrafficSourceItem(source="Browse Features (Homepage)", views=412900, percentage="28.9%", change="+8.6%"),
            TrafficSourceItem(source="Suggested Videos", views=289400, percentage="20.3%", change="+22.1%"),
            TrafficSourceItem(source="External & Socials (X, Reddit)", views=114800, percentage="8.0%", change="-2.4%"),
            TrafficSourceItem(source="Direct / Channel URL", views=71600, percentage="5.0%", change="+1.1%"),
        ]
        demo_retention = [
            RetentionPoint(timestamp="0:00", long_form=100.0, short_form=100.0),
            RetentionPoint(timestamp="0:30", long_form=74.0, short_form=82.0),
            RetentionPoint(timestamp="1:00", long_form=68.0, short_form=65.0),
            RetentionPoint(timestamp="2:30", long_form=61.0, short_form=48.0),
            RetentionPoint(timestamp="5:00", long_form=55.0, short_form=35.0),
            RetentionPoint(timestamp="8:00", long_form=48.0, short_form=22.0),
            RetentionPoint(timestamp="10:00", long_form=42.0, short_form=15.0),
        ]
        return AnalyticsTelemetryResponse(
            channel_id=target_id,
            data_state="DEMO",
            is_live=False,
            title="Tech Pulse (Demo)" if target_id == "demo-channel-1" else "Gaming Frontier",
            total_views=1428900,
            total_subscribers=48200,
            total_videos=142,
            traffic_sources=demo_traffic,
            retention_chart=demo_retention,
            scope_limitation_notice=None,
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Channel '{target_id}' not found.",
    )


@router.get(
    "/audience",
    response_model=AudienceTelemetryResponse,
    summary="Channel Audience Telemetry",
    description="Returns verified channel audience telemetry or honest scope limitation disclosures.",
)
def get_channel_audience(
    channel_id: Optional[str] = Query(default=None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> AudienceTelemetryResponse:
    target_id = (channel_id or "demo-channel-1").strip()

    # Tenant ownership isolation check for live channels
    if current_user and not target_id.startswith("demo-"):
        owned = (
            db.query(ConnectedChannel)
            .filter(ConnectedChannel.channel_id == target_id, ConnectedChannel.user_id == current_user.id)
            .first()
        )
        if not owned:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Channel '{target_id}' not found for authenticated user.",
            )

    # Check live connected channels
    channel = (
        db.query(ConnectedChannel)
        .filter(ConnectedChannel.channel_id == target_id)
        .first()
    )
    if channel and channel.status == "connected":
        return AudienceTelemetryResponse(
            channel_id=target_id,
            data_state="LIVE",
            is_live=True,
            title=channel.title,
            subscribers=int(channel.subscriber_count or 0),
            total_views=int(channel.view_count or 0),
            uploads=int(channel.video_count or 0),
            returning_viewers_rate=None,
            subscriber_conversion_rate=None,
            optimal_release_window=None,
            top_countries=None,
            scope_limitation_notice="Audience demographic cohorts, viewer loyalty rates, and geographic concentration require YouTube Analytics Partner API permissions (https://www.googleapis.com/auth/yt-analytics.readonly). Territory and cohort data are subject to Google's strict privacy thresholds (requiring minimum view volume per country/cohort). Data is unavailable under the standard YouTube Data API v3 read-only scope.",
        )

    # Demo fallback channels (only for explicitly designated demo IDs)
    if target_id in ("demo-channel-1", "demo-channel-2") or target_id.startswith("demo-"):
        demo_countries = [
            GeographicViewerItem(country="United States", share="44.2%", viewers="631,500"),
            GeographicViewerItem(country="India", share="18.4%", viewers="262,900"),
            GeographicViewerItem(country="United Kingdom", share="9.1%", viewers="130,000"),
            GeographicViewerItem(country="Germany", share="6.5%", viewers="92,800"),
            GeographicViewerItem(country="Canada", share="5.8%", viewers="82,800"),
        ]
        return AudienceTelemetryResponse(
            channel_id=target_id,
            data_state="DEMO",
            is_live=False,
            title="Tech Pulse (Demo)" if target_id == "demo-channel-1" else "Gaming Frontier",
            subscribers=48200,
            total_views=1428900,
            uploads=142,
            returning_viewers_rate="68.4%",
            subscriber_conversion_rate="3.8%",
            optimal_release_window="16:00 UTC (Wednesdays & Thursdays)",
            top_countries=demo_countries,
            scope_limitation_notice=None,
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Channel '{target_id}' not found.",
    )


@router.get(
    "/history",
    response_model=ChannelHistoryResponse,
    summary="Channel Historical Telemetry Snapshots",
    description="Returns chronological snapshots for the selected channel within the requested date range.",
)
def get_channel_history_endpoint(
    channel_id: Optional[str] = Query(default=None),
    days: int = Query(default=28, ge=1, le=365),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> ChannelHistoryResponse:
    target_id = (channel_id or "demo-channel-1").strip()

    # Scoping check if user is authenticated and requesting a live channel
    if current_user and target_id.startswith("UC"):
        owned = (
            db.query(ConnectedChannel)
            .filter(ConnectedChannel.channel_id == target_id, ConnectedChannel.user_id == current_user.id)
            .first()
        )
        if not owned:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Channel '{target_id}' not found for authenticated user.",
            )

    # 1. Live connected channel in DB
    channel = (
        db.query(ConnectedChannel)
        .filter(ConnectedChannel.channel_id == target_id)
        .first()
    )
    if channel and channel.status == "connected":
        snapshots = get_channel_snapshots(db, target_id, days=days)
        items = [
            ChannelSnapshotItem(
                id=s.id,
                channel_id=s.channel_id,
                snapshot_at=s.snapshot_at.isoformat(),
                subscriber_count=s.subscriber_count,
                video_count=s.video_count,
                view_count=s.view_count,
                sync_status=s.sync_status,
                error_message=s.error_message,
            )
            for s in snapshots
        ]
        msg = None
        if len(items) == 0:
            msg = "No historical snapshots recorded yet. Sync the channel to record the initial snapshot."
        elif len(items) == 1:
            msg = "1 historical snapshot recorded. Subsequent syncs will expand the historical velocity curve."
        return ChannelHistoryResponse(
            channel_id=target_id,
            data_state="LIVE",
            days=days,
            snapshots=items,
            message=msg,
        )

    # 2. Demo channels (only demo-prefixed IDs)
    if target_id in ("demo-channel-1", "demo-channel-2") or target_id.startswith("demo-"):
        from app.services.dashboard import build_demo_chart_points
        demo_points = build_demo_chart_points()
        demo_items = [
            ChannelSnapshotItem(
                id=f"demo-snap-{idx}",
                channel_id=target_id,
                snapshot_at=f"2026-10-{idx + 1:02d}T00:00:00Z",
                subscriber_count=p.subscribers,
                video_count=120,
                view_count=p.views,
                sync_status="success",
            )
            for idx, p in enumerate(demo_points)
        ]
        return ChannelHistoryResponse(
            channel_id=target_id,
            data_state="DEMO",
            days=days,
            snapshots=demo_items,
            message="Displaying synthetic demo telemetry history.",
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Channel '{target_id}' not found.",
    )


@router.get(
    "/videos",
    response_model=ChannelVideosResponse,
    summary="Channel Recent Video Performance",
    description="Returns recent public video uploads and statistics for the selected channel.",
)
def get_channel_videos_endpoint(
    channel_id: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> ChannelVideosResponse:
    target_id = (channel_id or "demo-channel-1").strip()

    if current_user and target_id.startswith("UC"):
        owned = (
            db.query(ConnectedChannel)
            .filter(ConnectedChannel.channel_id == target_id, ConnectedChannel.user_id == current_user.id)
            .first()
        )
        if not owned:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Channel '{target_id}' not found for authenticated user.",
            )

    channel = (
        db.query(ConnectedChannel)
        .filter(ConnectedChannel.channel_id == target_id)
        .first()
    )
    if channel and channel.status == "connected":
        videos = get_channel_videos(db, target_id, limit=limit)
        items = [
            ChannelVideoItem(
                id=v.id,
                channel_id=v.channel_id,
                video_id=v.video_id,
                title=v.title,
                published_at=v.published_at.isoformat(),
                relative_published=format_relative_time(v.published_at),
                thumbnail_url=v.thumbnail_url,
                view_count=v.view_count,
                like_count=v.like_count,
                comment_count=v.comment_count,
                last_synced_at=v.last_synced_at.isoformat(),
            )
            for v in videos
        ]
        msg = None
        if len(items) == 0:
            msg = "No recent video uploads discovered yet. Click Sync Telemetry to fetch public videos."
        return ChannelVideosResponse(
            channel_id=target_id,
            data_state="LIVE",
            videos=items,
            message=msg,
        )

    if target_id in ("demo-channel-1", "demo-channel-2") or target_id.startswith("demo-"):
        from app.services.dashboard import build_demo_recent_videos
        demo_vids = build_demo_recent_videos()
        items = [
            ChannelVideoItem(
                id=dv.id,
                channel_id=target_id,
                video_id=dv.id,
                title=dv.title,
                published_at="2026-10-15T00:00:00Z",
                relative_published=dv.published,
                thumbnail_url=dv.thumbnail_url,
                view_count=dv.views,
                like_count=None,
                comment_count=None,
                last_synced_at="2026-10-20T12:00:00Z",
            )
            for dv in demo_vids
        ]
        return ChannelVideosResponse(
            channel_id=target_id,
            data_state="DEMO",
            videos=items,
            message="Displaying synthetic demo recent videos.",
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Channel '{target_id}' not found.",
    )
