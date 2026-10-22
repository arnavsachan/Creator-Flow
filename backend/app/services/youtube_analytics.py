from datetime import datetime, timedelta, timezone
import logging
import time
from typing import Any, Optional

from fastapi import HTTPException, status
import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.channel import ConnectedChannel
from app.schemas.youtube import (
    AnalyticsDayPoint,
    AnalyticsOverviewReportResponse,
    GeographicAudienceReportResponse,
    GeographicViewerItem,
    TrafficSourceItem,
    TrafficSourcesReportResponse,
)
from app.services.youtube_oauth import (
    get_valid_access_token,
    has_analytics_permission,
    start_youtube_oauth,
)

logger = logging.getLogger(__name__)

YOUTUBE_ANALYTICS_REPORTS_URL = "https://youtubeanalytics.googleapis.com/v2/reports"


def get_service_disabled_message() -> str:
    settings = get_settings()
    proj_num = settings.google_cloud_project_number
    proj_str = f" ({proj_num})" if proj_num else ""
    return (
        f"YouTube Analytics API is not enabled in your Google Cloud project{proj_str}. "
        "Please enable the API in Google Cloud Console and retry."
    )

# Friendly labels for Google insightTrafficSourceType dimensions
TRAFFIC_SOURCE_LABELS: dict[str, str] = {
    "YT_SEARCH": "YouTube Search",
    "RELATED_VIDEO": "Suggested Videos",
    "SUBSCRIBER": "Subscriptions Feed",
    "YT_CHANNEL": "Channel Pages",
    "YT_OTHER_PAGE": "Browse Features (Homepage/Trending)",
    "EXT_URL": "External & Socials",
    "SHORTS": "YouTube Shorts Feed",
    "NOTIFICATION": "Notifications & Alerts",
    "PLAYLIST": "Playlists",
    "END_SCREEN": "End Screens",
    "CARD": "Info Cards",
    "NO_LINK_OTHER": "Direct or Unknown",
    "NO_LINK_EMBEDDED": "Embedded Players",
}

# Common ISO country code to name mapping
COUNTRY_NAMES: dict[str, str] = {
    "US": "United States",
    "IN": "India",
    "GB": "United Kingdom",
    "CA": "Canada",
    "DE": "Germany",
    "AU": "Australia",
    "FR": "France",
    "BR": "Brazil",
    "JP": "Japan",
    "KR": "South Korea",
    "MX": "Mexico",
    "PH": "Philippines",
    "ID": "Indonesia",
    "IT": "Italy",
    "ES": "Spain",
    "NL": "Netherlands",
    "SE": "Sweden",
    "PL": "Poland",
    "TR": "Turkey",
    "RU": "Russia",
    "VN": "Vietnam",
    "TH": "Thailand",
    "MY": "Malaysia",
    "SG": "Singapore",
    "NZ": "New Zealand",
    "PK": "Pakistan",
    "BD": "Bangladesh",
    "EG": "Egypt",
    "ZA": "South Africa",
    "AR": "Argentina",
    "CO": "Colombia",
    "CL": "Chile",
}


def calculate_date_range(days: int = 28) -> tuple[str, str]:
    """
    Computes (startDate, endDate) formatted as YYYY-MM-DD.
    YouTube Analytics API reports daily data up to the previous completed day (UTC).
    """
    days = max(1, min(days, 365))
    end_date = datetime.now(timezone.utc).date() - timedelta(days=1)
    start_date = end_date - timedelta(days=days - 1)
    return start_date.isoformat(), end_date.isoformat()


def execute_analytics_query(
    access_token: str,
    params: dict[str, Any],
    max_retries: int = 2,
) -> dict[str, Any]:
    """
    Executes an HTTP GET query against the official YouTube Analytics API v2 reports endpoint.
    Handles transient network/upstream errors with bounded retry, but fails immediately
    on authorization or validation errors.
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }

    last_error: Optional[Exception] = None
    for attempt in range(max_retries + 1):
        try:
            with httpx.Client(timeout=15.0) as client:
                resp = client.get(
                    YOUTUBE_ANALYTICS_REPORTS_URL,
                    headers=headers,
                    params=params,
                )

                if resp.status_code == 200:
                    return resp.json()

                if resp.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN):
                    try:
                        err_json = resp.json()
                    except Exception:
                        err_json = {}
                    err_obj = err_json.get("error", {})
                    errors_list = err_obj.get("errors", [])
                    reason = errors_list[0].get("reason") if errors_list else ""
                    msg = err_obj.get("message", "YouTube Analytics API permission denied.")
                    details = err_obj.get("details", [])
                    detail_reason = details[0].get("reason") if details else ""

                    if (
                        reason in ("accessNotConfigured", "SERVICE_DISABLED")
                        or detail_reason == "SERVICE_DISABLED"
                        or "not been used in project" in msg.lower()
                        or "is disabled" in msg.lower()
                    ):
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="YOUTUBE_ANALYTICS_API_DISABLED",
                        )
                    if reason in ("insufficientPermissions", "ACCESS_TOKEN_SCOPE_INSUFFICIENT") or "scope" in msg.lower():
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="YOUTUBE_ANALYTICS_SCOPE_REQUIRED",
                        )
                    if reason in ("quotaExceeded", "rateLimitExceeded", "userRateLimitExceeded"):
                        raise HTTPException(
                            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                            detail="YouTube Analytics API quota or rate limit exceeded. Please try again later.",
                        )
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"YouTube Analytics API authorization error: {msg}",
                    )

                if resp.status_code == status.HTTP_400_BAD_REQUEST:
                    try:
                        err_json = resp.json()
                    except Exception:
                        err_json = {}
                    msg = err_json.get("error", {}).get("message", "Invalid metric or dimension combination.")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"YouTube Analytics API invalid request: {msg}",
                    )

                # Transient errors (500, 502, 503, 504)
                if resp.status_code in (500, 502, 503, 504) and attempt < max_retries:
                    time.sleep(0.5 * (attempt + 1))
                    continue

                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"YouTube Analytics API upstream error ({resp.status_code}).",
                )

        except httpx.RequestError as exc:
            last_error = exc
            if attempt < max_retries:
                time.sleep(0.5 * (attempt + 1))
                continue
            logger.error("Network error reaching YouTube Analytics API: %s", type(exc).__name__)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to reach YouTube Analytics API service.",
            ) from exc

    if last_error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="YouTube Analytics API service request failed after retries.",
        ) from last_error

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="YouTube Analytics API unexpected response.",
    )


def fetch_channel_overview_report(
    db: Session,
    channel: ConnectedChannel,
    days: int = 28,
) -> AnalyticsOverviewReportResponse:
    """
    Queries YouTube Analytics API for daily time-series performance metrics:
    - Dimensions: day
    - Metrics: views, estimatedMinutesWatched, averageViewDuration, subscribersGained, subscribersLost
    - Sort: day
    """
    start_date, end_date = calculate_date_range(days)

    if not has_analytics_permission(channel):
        auth_url, _ = start_youtube_oauth(db=db, user=channel.user, include_analytics=True)
        return AnalyticsOverviewReportResponse(
            channel_id=channel.channel_id,
            data_state="AUTHORIZATION_REQUIRED",
            is_live=True,
            has_analytics_scope=False,
            start_date=start_date,
            end_date=end_date,
            days=days,
            total_views=0,
            total_estimated_minutes_watched=0,
            average_view_duration_seconds=0,
            net_subscribers=0,
            time_series=[],
            authorization_url=auth_url,
            message="YouTube Analytics API permission (yt-analytics.readonly) required for time-series reports.",
        )

    access_token = get_valid_access_token(channel=channel, db=db)
    params = {
        "ids": "channel==MINE",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost",
        "dimensions": "day",
        "sort": "day",
    }

    try:
        report_data = execute_analytics_query(access_token=access_token, params=params)
    except HTTPException as exc:
        if exc.detail == "YOUTUBE_ANALYTICS_SCOPE_REQUIRED":
            auth_url, _ = start_youtube_oauth(db=db, user=channel.user, include_analytics=True)
            return AnalyticsOverviewReportResponse(
                channel_id=channel.channel_id,
                data_state="AUTHORIZATION_REQUIRED",
                is_live=True,
                has_analytics_scope=False,
                start_date=start_date,
                end_date=end_date,
                days=days,
                total_views=0,
                total_estimated_minutes_watched=0,
                average_view_duration_seconds=0,
                net_subscribers=0,
                time_series=[],
                authorization_url=auth_url,
                message="YouTube Analytics API permissions must be authorized.",
            )
        if exc.detail == "YOUTUBE_ANALYTICS_API_DISABLED":
            return AnalyticsOverviewReportResponse(
                channel_id=channel.channel_id,
                data_state="SERVICE_DISABLED",
                is_live=True,
                has_analytics_scope=True,
                start_date=start_date,
                end_date=end_date,
                days=days,
                total_views=0,
                total_estimated_minutes_watched=0,
                average_view_duration_seconds=0,
                net_subscribers=0,
                time_series=[],
                message=get_service_disabled_message(),
            )
        raise

    column_headers = [col.get("name") for col in report_data.get("columnHeaders", [])]
    rows = report_data.get("rows", [])

    if not rows:
        return AnalyticsOverviewReportResponse(
            channel_id=channel.channel_id,
            data_state="NO_DATA",
            is_live=True,
            has_analytics_scope=True,
            start_date=start_date,
            end_date=end_date,
            days=days,
            total_views=0,
            total_estimated_minutes_watched=0,
            average_view_duration_seconds=0,
            net_subscribers=0,
            time_series=[],
            message="No time-series analytics recorded for this channel during the requested period.",
        )

    # Map column names to indices
    col_idx = {name: i for i, name in enumerate(column_headers)}
    time_series_points: list[AnalyticsDayPoint] = []
    total_views = 0
    total_mins = 0
    total_subs_gained = 0
    total_subs_lost = 0

    for r in rows:
        d_val = str(r[col_idx["day"]]) if "day" in col_idx else ""
        v_val = int(r[col_idx["views"]]) if "views" in col_idx and r[col_idx["views"]] is not None else 0
        emw_val = int(r[col_idx["estimatedMinutesWatched"]]) if "estimatedMinutesWatched" in col_idx and r[col_idx["estimatedMinutesWatched"]] is not None else 0
        avd_val = int(r[col_idx["averageViewDuration"]]) if "averageViewDuration" in col_idx and r[col_idx["averageViewDuration"]] is not None else 0
        sg_val = int(r[col_idx["subscribersGained"]]) if "subscribersGained" in col_idx and r[col_idx["subscribersGained"]] is not None else 0
        sl_val = int(r[col_idx["subscribersLost"]]) if "subscribersLost" in col_idx and r[col_idx["subscribersLost"]] is not None else 0

        total_views += v_val
        total_mins += emw_val
        total_subs_gained += sg_val
        total_subs_lost += sl_val

        time_series_points.append(
            AnalyticsDayPoint(
                date=d_val,
                views=v_val,
                estimated_minutes_watched=emw_val,
                average_view_duration_seconds=avd_val,
                subscribers_gained=sg_val,
                subscribers_lost=sl_val,
            )
        )

    # Calculate overall average view duration
    overall_avd = int((total_mins * 60) / total_views) if total_views > 0 else 0

    return AnalyticsOverviewReportResponse(
        channel_id=channel.channel_id,
        data_state="LIVE",
        is_live=True,
        has_analytics_scope=True,
        start_date=start_date,
        end_date=end_date,
        days=days,
        total_views=total_views,
        total_estimated_minutes_watched=total_mins,
        average_view_duration_seconds=overall_avd,
        subscribers_gained=total_subs_gained,
        subscribers_lost=total_subs_lost,
        net_subscribers=total_subs_gained - total_subs_lost,
        time_series=time_series_points,
    )


def fetch_traffic_sources_report(
    db: Session,
    channel: ConnectedChannel,
    days: int = 28,
) -> TrafficSourcesReportResponse:
    """
    Queries YouTube Analytics API for inbound traffic source breakdown:
    - Dimensions: insightTrafficSourceType
    - Metrics: views, estimatedMinutesWatched
    - Sort: -views
    """
    start_date, end_date = calculate_date_range(days)

    if not has_analytics_permission(channel):
        auth_url, _ = start_youtube_oauth(db=db, user=channel.user, include_analytics=True)
        return TrafficSourcesReportResponse(
            channel_id=channel.channel_id,
            data_state="AUTHORIZATION_REQUIRED",
            is_live=True,
            has_analytics_scope=False,
            start_date=start_date,
            end_date=end_date,
            days=days,
            total_views=0,
            traffic_sources=[],
            authorization_url=auth_url,
            message="YouTube Analytics API permissions required to view traffic discovery vectors.",
        )

    access_token = get_valid_access_token(channel=channel, db=db)
    params = {
        "ids": "channel==MINE",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": "views,estimatedMinutesWatched",
        "dimensions": "insightTrafficSourceType",
        "sort": "-views",
    }

    try:
        report_data = execute_analytics_query(access_token=access_token, params=params)
    except HTTPException as exc:
        if exc.detail == "YOUTUBE_ANALYTICS_SCOPE_REQUIRED":
            auth_url, _ = start_youtube_oauth(db=db, user=channel.user, include_analytics=True)
            return TrafficSourcesReportResponse(
                channel_id=channel.channel_id,
                data_state="AUTHORIZATION_REQUIRED",
                is_live=True,
                has_analytics_scope=False,
                start_date=start_date,
                end_date=end_date,
                days=days,
                total_views=0,
                traffic_sources=[],
                authorization_url=auth_url,
                message="YouTube Analytics API permissions required to view traffic discovery vectors.",
            )
        if exc.detail == "YOUTUBE_ANALYTICS_API_DISABLED":
            return TrafficSourcesReportResponse(
                channel_id=channel.channel_id,
                data_state="SERVICE_DISABLED",
                is_live=True,
                has_analytics_scope=True,
                start_date=start_date,
                end_date=end_date,
                days=days,
                total_views=0,
                traffic_sources=[],
                message=get_service_disabled_message(),
            )
        raise

    column_headers = [col.get("name") for col in report_data.get("columnHeaders", [])]
    rows = report_data.get("rows", [])

    if not rows:
        return TrafficSourcesReportResponse(
            channel_id=channel.channel_id,
            data_state="NO_DATA",
            is_live=True,
            has_analytics_scope=True,
            start_date=start_date,
            end_date=end_date,
            days=days,
            total_views=0,
            traffic_sources=[],
            message="No traffic source reports returned for this period. Data may be below Google's privacy thresholds.",
        )

    col_idx = {name: i for i, name in enumerate(column_headers)}
    total_views = sum(
        int(r[col_idx["views"]]) for r in rows if "views" in col_idx and r[col_idx["views"]] is not None
    )

    items: list[TrafficSourceItem] = []
    for r in rows:
        raw_source = str(r[col_idx["insightTrafficSourceType"]]) if "insightTrafficSourceType" in col_idx else "OTHER"
        views = int(r[col_idx["views"]]) if "views" in col_idx and r[col_idx["views"]] is not None else 0
        pct_str = f"{(views / total_views * 100):.1f}%" if total_views > 0 else "0.0%"
        label = TRAFFIC_SOURCE_LABELS.get(raw_source, raw_source.replace("_", " ").title())

        items.append(
            TrafficSourceItem(
                source=label,
                views=views,
                percentage=pct_str,
                change="",
            )
        )

    return TrafficSourcesReportResponse(
        channel_id=channel.channel_id,
        data_state="LIVE",
        is_live=True,
        has_analytics_scope=True,
        start_date=start_date,
        end_date=end_date,
        days=days,
        total_views=total_views,
        traffic_sources=items,
    )


def fetch_geography_report(
    db: Session,
    channel: ConnectedChannel,
    days: int = 28,
) -> GeographicAudienceReportResponse:
    """
    Queries YouTube Analytics API for viewer territory distribution:
    - Dimensions: country
    - Metrics: views, estimatedMinutesWatched
    - Sort: -views
    - Max results: 10
    """
    start_date, end_date = calculate_date_range(days)

    if not has_analytics_permission(channel):
        auth_url, _ = start_youtube_oauth(db=db, user=channel.user, include_analytics=True)
        return GeographicAudienceReportResponse(
            channel_id=channel.channel_id,
            data_state="AUTHORIZATION_REQUIRED",
            is_live=True,
            has_analytics_scope=False,
            start_date=start_date,
            end_date=end_date,
            days=days,
            total_views=0,
            top_countries=[],
            authorization_url=auth_url,
            message="YouTube Analytics API permissions required to view audience geography.",
        )

    access_token = get_valid_access_token(channel=channel, db=db)
    params = {
        "ids": "channel==MINE",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": "views,estimatedMinutesWatched",
        "dimensions": "country",
        "sort": "-views",
        "maxResults": 10,
    }

    try:
        report_data = execute_analytics_query(access_token=access_token, params=params)
    except HTTPException as exc:
        if exc.detail == "YOUTUBE_ANALYTICS_SCOPE_REQUIRED":
            auth_url, _ = start_youtube_oauth(db=db, user=channel.user, include_analytics=True)
            return GeographicAudienceReportResponse(
                channel_id=channel.channel_id,
                data_state="AUTHORIZATION_REQUIRED",
                is_live=True,
                has_analytics_scope=False,
                start_date=start_date,
                end_date=end_date,
                days=days,
                total_views=0,
                top_countries=[],
                authorization_url=auth_url,
                message="YouTube Analytics API permissions required to view audience geography.",
            )
        if exc.detail == "YOUTUBE_ANALYTICS_API_DISABLED":
            return GeographicAudienceReportResponse(
                channel_id=channel.channel_id,
                data_state="SERVICE_DISABLED",
                is_live=True,
                has_analytics_scope=True,
                start_date=start_date,
                end_date=end_date,
                days=days,
                total_views=0,
                top_countries=[],
                message=get_service_disabled_message(),
            )
        raise

    column_headers = [col.get("name") for col in report_data.get("columnHeaders", [])]
    rows = report_data.get("rows", [])

    if not rows:
        return GeographicAudienceReportResponse(
            channel_id=channel.channel_id,
            data_state="NO_DATA",
            is_live=True,
            has_analytics_scope=True,
            start_date=start_date,
            end_date=end_date,
            days=days,
            total_views=0,
            top_countries=[],
            message="No country distribution returned. Viewer volume by territory may be below Google's privacy thresholds.",
        )

    col_idx = {name: i for i, name in enumerate(column_headers)}
    total_views = sum(
        int(r[col_idx["views"]]) for r in rows if "views" in col_idx and r[col_idx["views"]] is not None
    )

    items: list[GeographicViewerItem] = []
    for r in rows:
        raw_country = str(r[col_idx["country"]]) if "country" in col_idx else "ZZ"
        views = int(r[col_idx["views"]]) if "views" in col_idx and r[col_idx["views"]] is not None else 0
        pct_str = f"{(views / total_views * 100):.1f}%" if total_views > 0 else "0.0%"
        country_name = COUNTRY_NAMES.get(raw_country.upper(), raw_country.upper())

        items.append(
            GeographicViewerItem(
                country=country_name,
                share=pct_str,
                viewers=f"{views:,}",
            )
        )

    return GeographicAudienceReportResponse(
        channel_id=channel.channel_id,
        data_state="LIVE",
        is_live=True,
        has_analytics_scope=True,
        start_date=start_date,
        end_date=end_date,
        days=days,
        total_views=total_views,
        top_countries=items,
    )


RETURNING_VIEWERS_NOT_SUPPORTED_NOTICE = "YouTube Studio-exclusive metric; not exposed by YouTube Analytics API"


def calculate_subscriber_conversion(
    views: int,
    subscribers_gained: int,
    days: int,
) -> tuple[Optional[str], str, str]:
    """
    Calculates subscriber conversion rate from verified YouTube Analytics metrics.
    Formula: (subscribersGained / views) * 100

    Returns:
        (rate_str_or_none, data_state, explanation_notice)
    """
    if views <= 0:
        if subscribers_gained > 0:
            notice = f"{subscribers_gained} subs gained, but 0 views in {days}d lookback window (conversion rate requires views)"
        else:
            notice = f"0 views in {days}d lookback window (conversion rate requires views)"
        return (
            None,
            "NO_DATA",
            notice,
        )

    clamped_subs = max(0, subscribers_gained)
    rate = (clamped_subs / views) * 100
    return (
        f"{rate:.2f}%",
        "LIVE",
        f"+{clamped_subs} subs gained across {views:,} views ({days}d window)",
    )


def calculate_optimal_release_window(
    db: Session,
    channel_id: str,
    total_uploads: int,
) -> tuple[str, str, str]:
    """
    Evaluates video publication history using an application heuristic
    to estimate potential release windows based on historical weekday view velocity.

    This is an application-level heuristic and NOT an official YouTube Analytics API metric
    or requirement.

    Returns:
        (window_display_str, data_state, explanation_notice)
    """
    from collections import defaultdict
    from app.models.video import ChannelVideo

    MIN_UPLOADS_REQUIRED = 20
    MIN_WEEKDAY_COVERAGE = 4

    if total_uploads < MIN_UPLOADS_REQUIRED:
        return (
            "Insufficient Data",
            "INSUFFICIENT_HISTORY",
            f"Application heuristic: requires ≥{MIN_UPLOADS_REQUIRED} public uploads to estimate timing (channel has {total_uploads})",
        )

    videos = db.query(ChannelVideo).filter(ChannelVideo.channel_id == channel_id).all()
    if len(videos) < MIN_UPLOADS_REQUIRED:
        return (
            "Insufficient Data",
            "INSUFFICIENT_HISTORY",
            f"Application heuristic: requires ≥{MIN_UPLOADS_REQUIRED} synced video uploads to analyze publishing patterns (synced: {len(videos)})",
        )

    day_stats: dict[str, dict[str, int]] = defaultdict(lambda: {"count": 0, "total_views": 0})
    for v in videos:
        if v.published_at:
            weekday = v.published_at.strftime("%A")
            day_stats[weekday]["count"] += 1
            day_stats[weekday]["total_views"] += int(v.view_count or 0)

    if len(day_stats) < MIN_WEEKDAY_COVERAGE:
        return (
            "Insufficient Data",
            "INSUFFICIENT_HISTORY",
            f"Application heuristic: uploads distributed across only {len(day_stats)} weekday(s); requires ≥{MIN_WEEKDAY_COVERAGE} distinct weekdays to compare release timing reliably",
        )

    total_views_across_videos = sum(s["total_views"] for s in day_stats.values())
    if total_views_across_videos <= 0:
        return (
            "Insufficient Data",
            "INSUFFICIENT_HISTORY",
            "Application heuristic: uploads have 0 recorded views; cannot compare weekday performance",
        )

    ranked = sorted(
        day_stats.items(),
        key=lambda item: item[1]["total_views"] / item[1]["count"] if item[1]["count"] else 0,
        reverse=True,
    )

    best_day = ranked[0][0]
    second_day = ranked[1][0] if len(ranked) > 1 and ranked[1][1]["count"] > 0 else None

    if second_day:
        window_str = f"{best_day}s & {second_day}s"
        notice = (
            f"Application heuristic: {best_day}s & {second_day}s had highest avg views across "
            f"{len(videos)} uploads (experimental estimate, not an official YouTube metric)"
        )
    else:
        window_str = f"{best_day}s"
        notice = (
            f"Application heuristic: {best_day}s had highest avg views across "
            f"{len(videos)} uploads (experimental estimate, not an official YouTube metric)"
        )

    return (
        window_str,
        "LIVE",
        notice,
    )
