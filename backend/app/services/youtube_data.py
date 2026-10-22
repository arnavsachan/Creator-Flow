from datetime import datetime, timezone
import logging
import re
import time
from typing import Any, Optional

from fastapi import HTTPException, status
import httpx
from sqlalchemy.orm import Session

from app.models.channel import ConnectedChannel
from app.schemas.youtube import (
    ChannelDetailsResponse,
    ContentLibraryResponse,
    ContentVideoItem,
)
from app.services.dashboard import format_relative_time
from app.services.youtube_oauth import (
    has_youtube_data_permission,
    refresh_access_token,
    start_youtube_oauth,
)

logger = logging.getLogger(__name__)

YOUTUBE_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels"
YOUTUBE_PLAYLIST_ITEMS_URL = "https://www.googleapis.com/youtube/v3/playlistItems"
YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"

# Canonical Error Codes for YouTube Data API v3
YOUTUBE_DATA_API_DISABLED = "YOUTUBE_DATA_API_DISABLED"
YOUTUBE_DATA_SCOPE_REQUIRED = "YOUTUBE_DATA_SCOPE_REQUIRED"
YOUTUBE_TOKEN_EXPIRED = "YOUTUBE_TOKEN_EXPIRED"


def parse_iso8601_duration(duration_str: Optional[str]) -> tuple[Optional[int], Optional[str]]:
    """
    Parses an ISO 8601 duration string (e.g., 'PT4M13S', 'PT1H2M30S', 'PT45S', 'P1DT2H')
    into total duration in seconds and a formatted human-readable string ('4:13', '1:02:30').
    Returns (None, None) if duration_str is empty or None.
    """
    if not duration_str or not isinstance(duration_str, str):
        return None, None

    pattern = r"^P(?:(?P<days>\d+)D)?(?:T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?)?$"
    match = re.match(pattern, duration_str.strip())
    if not match:
        return None, None

    days = int(match.group("days") or 0)
    hours = int(match.group("hours") or 0) + (days * 24)
    minutes = int(match.group("minutes") or 0)
    seconds = int(match.group("seconds") or 0)

    total_seconds = (hours * 3600) + (minutes * 60) + seconds

    if hours > 0:
        formatted = f"{hours}:{minutes:02d}:{seconds:02d}"
    else:
        formatted = f"{minutes}:{seconds:02d}"

    return total_seconds, formatted


def execute_youtube_data_query(
    access_token: str,
    url: str,
    params: dict[str, Any],
    max_retries: int = 2,
) -> dict[str, Any]:
    """
    Executes an HTTP GET query against the official YouTube Data API v3 endpoint.
    Handles quota limits, service enablement errors, scopes, and transient upstream timeouts.
    Never exposes or logs access tokens or secrets.
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }

    last_exc: Optional[Exception] = None
    for attempt in range(max_retries + 1):
        try:
            with httpx.Client(timeout=15.0) as client:
                resp = client.get(url, headers=headers, params=params)

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
                    msg = err_obj.get("message", "YouTube Data API permission denied.")
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
                            detail=YOUTUBE_DATA_API_DISABLED,
                        )
                    if (
                        reason in ("insufficientPermissions", "ACCESS_TOKEN_SCOPE_INSUFFICIENT")
                        or "scope" in msg.lower()
                    ):
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail=YOUTUBE_DATA_SCOPE_REQUIRED,
                        )
                    if reason in ("quotaExceeded", "rateLimitExceeded", "userRateLimitExceeded"):
                        raise HTTPException(
                            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                            detail="YouTube Data API quota or rate limit exceeded. Please try again later.",
                        )
                    if resp.status_code == status.HTTP_401_UNAUTHORIZED:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail=YOUTUBE_TOKEN_EXPIRED,
                        )

                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"YouTube Data API authorization error: {msg}",
                    )

                if resp.status_code == status.HTTP_400_BAD_REQUEST:
                    try:
                        err_json = resp.json()
                    except Exception:
                        err_json = {}
                    msg = err_json.get("error", {}).get("message", "Invalid request parameters.")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"YouTube Data API invalid request: {msg}",
                    )

                if resp.status_code == status.HTTP_404_NOT_FOUND:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Requested YouTube resource not found.",
                    )

                # Transient errors (500, 502, 503, 504)
                if resp.status_code in (500, 502, 503, 504) and attempt < max_retries:
                    time.sleep(0.5 * (attempt + 1))
                    continue

                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"YouTube Data API upstream error ({resp.status_code}).",
                )

        except httpx.TimeoutException as exc:
            last_exc = exc
            if attempt < max_retries:
                time.sleep(0.5 * (attempt + 1))
                continue
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Upstream YouTube Data API request timed out.",
            ) from exc
        except httpx.RequestError as exc:
            last_exc = exc
            if attempt < max_retries:
                time.sleep(0.5 * (attempt + 1))
                continue
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to reach YouTube Data API.",
            ) from exc

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Unable to reach YouTube Data API after retries.",
    )


def fetch_channel_details(
    db: Session,
    channel: ConnectedChannel,
) -> ChannelDetailsResponse:
    """
    Fetches rich channel metadata and settings from YouTube Data API v3 channels.list endpoint.
    Includes snippet, contentDetails, statistics, brandingSettings, topicDetails, and status.
    Syncs verified values to the ConnectedChannel record in the database.
    """
    access_token = refresh_access_token(db, channel)
    params = {
        "part": "snippet,contentDetails,statistics,brandingSettings,topicDetails,status",
        "id": channel.channel_id,
    }

    data = execute_youtube_data_query(access_token, YOUTUBE_CHANNELS_URL, params)
    items = data.get("items", [])
    if not items:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No YouTube channel data found for ID '{channel.channel_id}'.",
        )

    ch_data = items[0]
    snippet = ch_data.get("snippet", {})
    stats = ch_data.get("statistics", {})
    content_details = ch_data.get("contentDetails", {})
    branding = ch_data.get("brandingSettings", {})
    topic_details = ch_data.get("topicDetails", {})
    ch_status = ch_data.get("status", {})

    title = snippet.get("title", channel.title)
    description = snippet.get("description", "")
    custom_url = snippet.get("customUrl", channel.custom_url)
    pub_at = snippet.get("publishedAt")
    country = snippet.get("country")
    default_lang = snippet.get("defaultLanguage")

    raw_thumbs = snippet.get("thumbnails", {})
    thumbnail_dict: dict[str, str] = {}
    for size in ("default", "medium", "high", "standard", "maxres"):
        if size in raw_thumbs and "url" in raw_thumbs[size]:
            thumbnail_dict[size] = raw_thumbs[size]["url"]

    thumbnail_url = (
        thumbnail_dict.get("high")
        or thumbnail_dict.get("medium")
        or thumbnail_dict.get("default")
        or channel.thumbnail_url
    )

    try:
        subscriber_count = int(stats.get("subscriberCount", channel.subscriber_count) or 0)
    except (ValueError, TypeError):
        subscriber_count = channel.subscriber_count

    hidden_subs = bool(stats.get("hiddenSubscriberCount", False))

    try:
        video_count = int(stats.get("videoCount", channel.video_count) or 0)
    except (ValueError, TypeError):
        video_count = channel.video_count

    try:
        view_count = int(stats.get("viewCount", channel.view_count) or 0)
    except (ValueError, TypeError):
        view_count = channel.view_count

    uploads_playlist_id = (
        content_details.get("relatedPlaylists", {}).get("uploads")
        or ("UU" + channel.channel_id[2:] if channel.channel_id.startswith("UC") else None)
    )

    banner_url = branding.get("image", {}).get("bannerExternalUrl")
    keywords = branding.get("channel", {}).get("keywords")
    topic_categories = topic_details.get("topicCategories", [])
    privacy_status = ch_status.get("privacyStatus", "public")

    # Update database record with fresh verified metrics
    channel.title = title
    channel.custom_url = custom_url
    channel.thumbnail_url = thumbnail_url
    channel.subscriber_count = subscriber_count
    channel.video_count = video_count
    channel.view_count = view_count
    channel.last_synced_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(channel)

    return ChannelDetailsResponse(
        channel_id=channel.channel_id,
        data_state="LIVE",
        is_live=True,
        title=title,
        description=description,
        custom_url=custom_url,
        published_at=pub_at,
        thumbnail_url=thumbnail_url,
        thumbnails=thumbnail_dict if thumbnail_dict else None,
        banner_image_url=banner_url,
        country=country,
        default_language=default_lang,
        subscriber_count=subscriber_count,
        hidden_subscriber_count=hidden_subs,
        video_count=video_count,
        view_count=view_count,
        topic_categories=topic_categories,
        keywords=keywords,
        uploads_playlist_id=uploads_playlist_id,
        privacy_status=privacy_status,
        has_data_scope=True,
        message="Live connected channel metadata retrieved from YouTube Data API v3.",
    )


def fetch_channel_content_library(
    db: Session,
    channel: ConnectedChannel,
    page_token: Optional[str] = None,
    max_results: int = 20,
    q: Optional[str] = None,
    order: Optional[str] = "date",
) -> ContentLibraryResponse:
    """
    Fetches uploaded videos using the efficient uploads-playlist approach from YouTube Data API v3:
    1. Resolves the channel's uploads playlist ID.
    2. Retrieves playlistItems page (snippets + video IDs) supporting pagination.
    3. Batches videos.list with snippet, contentDetails, and statistics.
    4. Parses video metadata, thumbnails, publish dates, ISO 8601 duration, and public statistics.
    5. Supports client-side filtering and sorting for future Content Library UI.
    """
    access_token = refresh_access_token(db, channel)

    # 1. Resolve uploads playlist ID
    uploads_playlist_id = None
    if channel.channel_id.startswith("UC"):
        uploads_playlist_id = "UU" + channel.channel_id[2:]
    else:
        try:
            ch_data = execute_youtube_data_query(
                access_token,
                YOUTUBE_CHANNELS_URL,
                {"part": "contentDetails", "id": channel.channel_id},
            )
            items = ch_data.get("items", [])
            if items:
                uploads_playlist_id = (
                    items[0]
                    .get("contentDetails", {})
                    .get("relatedPlaylists", {})
                    .get("uploads")
                )
        except Exception:
            pass

    if not uploads_playlist_id:
        uploads_playlist_id = "UU" + channel.channel_id[2:] if channel.channel_id.startswith("UC") else None

    if not uploads_playlist_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Could not resolve uploads playlist for channel '{channel.channel_id}'.",
        )

    # 2. Fetch playlist items (videos in playlist)
    p_params: dict[str, Any] = {
        "part": "snippet,contentDetails",
        "playlistId": uploads_playlist_id,
        "maxResults": min(max(max_results, 1), 50),
    }
    if page_token:
        p_params["pageToken"] = page_token

    playlist_data = execute_youtube_data_query(access_token, YOUTUBE_PLAYLIST_ITEMS_URL, p_params)
    items = playlist_data.get("items", [])
    next_page_token = playlist_data.get("nextPageToken")
    prev_page_token = playlist_data.get("prevPageToken")
    total_results = playlist_data.get("pageInfo", {}).get("totalResults", len(items))

    if not items:
        return ContentLibraryResponse(
            channel_id=channel.channel_id,
            data_state="LIVE",
            is_live=True,
            videos=[],
            next_page_token=None,
            prev_page_token=None,
            total_results=0,
            results_per_page=max_results,
            q=q,
            order=order,
            message="No public videos found in uploads playlist.",
        )

    # 3. Collect video IDs and playlist-level snippets
    video_id_list: list[str] = []
    playlist_snippets: dict[str, dict] = {}
    for it in items:
        v_id = (
            it.get("contentDetails", {}).get("videoId")
            or it.get("snippet", {}).get("resourceId", {}).get("videoId")
        )
        snip = it.get("snippet", {})
        title = snip.get("title", "")
        if not v_id or title in ("Private video", "Deleted video"):
            continue
        video_id_list.append(v_id)
        playlist_snippets[v_id] = snip

    if not video_id_list:
        return ContentLibraryResponse(
            channel_id=channel.channel_id,
            data_state="LIVE",
            is_live=True,
            videos=[],
            next_page_token=next_page_token,
            prev_page_token=prev_page_token,
            total_results=total_results,
            results_per_page=max_results,
            q=q,
            order=order,
            message="All video items in this slice were private or deleted.",
        )

    # 4. Batch query video metadata, contentDetails (duration), and statistics
    v_params = {
        "part": "snippet,contentDetails,statistics,status",
        "id": ",".join(video_id_list),
    }
    videos_data = execute_youtube_data_query(access_token, YOUTUBE_VIDEOS_URL, v_params)

    # 5. Assemble video items
    now = datetime.now(timezone.utc)
    content_videos: list[ContentVideoItem] = []

    for v_item in videos_data.get("items", []):
        vid_id = v_item.get("id")
        if not vid_id:
            continue

        v_snip = v_item.get("snippet", {})
        v_stats = v_item.get("statistics", {})
        v_cd = v_item.get("contentDetails", {})
        v_status = v_item.get("status", {})

        title = v_snip.get("title") or playlist_snippets.get(vid_id, {}).get("title", "Untitled")
        description = v_snip.get("description", "")
        ch_title = v_snip.get("channelTitle") or channel.title
        pub_raw = v_snip.get("publishedAt") or playlist_snippets.get(vid_id, {}).get("publishedAt")

        try:
            pub_dt = (
                datetime.fromisoformat(pub_raw.replace("Z", "+00:00"))
                if pub_raw
                else now
            )
        except Exception:
            pub_dt = now

        relative_pub = format_relative_time(pub_dt)

        raw_thumbs = v_snip.get("thumbnails", {}) or playlist_snippets.get(vid_id, {}).get("thumbnails", {})
        thumbs_dict: dict[str, str] = {}
        for s in ("default", "medium", "high", "standard", "maxres"):
            if s in raw_thumbs and "url" in raw_thumbs[s]:
                thumbs_dict[s] = raw_thumbs[s]["url"]

        thumb_url = (
            thumbs_dict.get("high")
            or thumbs_dict.get("medium")
            or thumbs_dict.get("default")
        )

        duration_iso = v_cd.get("duration")
        dur_secs, dur_formatted = parse_iso8601_duration(duration_iso)

        try:
            views = int(v_stats.get("viewCount", 0) or 0)
        except (ValueError, TypeError):
            views = 0

        likes = None
        if "likeCount" in v_stats:
            try:
                likes = int(v_stats["likeCount"])
            except (ValueError, TypeError):
                pass

        comments = None
        if "commentCount" in v_stats:
            try:
                comments = int(v_stats["commentCount"])
            except (ValueError, TypeError):
                pass

        tags = v_snip.get("tags", [])
        privacy_status = v_status.get("privacyStatus", "public")
        definition = v_cd.get("definition", "hd")
        has_caption = v_cd.get("caption") == "true"

        content_videos.append(
            ContentVideoItem(
                video_id=vid_id,
                channel_id=channel.channel_id,
                channel_title=ch_title,
                title=title,
                description=description,
                published_at=pub_dt.isoformat(),
                relative_published=relative_pub,
                thumbnail_url=thumb_url,
                thumbnails=thumbs_dict if thumbs_dict else None,
                duration=dur_formatted,
                duration_iso=duration_iso,
                duration_seconds=dur_secs,
                view_count=views,
                like_count=likes,
                comment_count=comments,
                tags=tags,
                privacy_status=privacy_status,
                definition=definition,
                has_caption=has_caption,
            )
        )

    # 6. Apply search filter if query is provided
    if q and q.strip():
        search_term = q.strip().lower()
        content_videos = [
            v
            for v in content_videos
            if search_term in v.title.lower()
            or (v.description and search_term in v.description.lower())
            or any(search_term in t.lower() for t in v.tags)
        ]

    # 7. Apply ordering
    if order == "views":
        content_videos.sort(key=lambda x: x.view_count, reverse=True)
    elif order == "likes":
        content_videos.sort(key=lambda x: (x.like_count or 0), reverse=True)
    elif order == "title":
        content_videos.sort(key=lambda x: x.title.lower())
    elif order == "date":
        content_videos.sort(key=lambda x: x.published_at, reverse=True)

    return ContentLibraryResponse(
        channel_id=channel.channel_id,
        data_state="LIVE",
        is_live=True,
        videos=content_videos,
        next_page_token=next_page_token,
        prev_page_token=prev_page_token,
        total_results=total_results,
        results_per_page=max_results,
        q=q,
        order=order,
        message=f"Retrieved {len(content_videos)} videos from uploads playlist.",
    )


# ---------------------------------------------------------------------------
# Demo Fallbacks for Preview / Testing Without Live Credentials
# ---------------------------------------------------------------------------

DEMO_CHANNEL_METADATA = {
    "demo-channel-1": {
        "title": "Tech Pulse",
        "description": "Deep dives into system design, autonomous AI agents, and production engineering for modern developers.",
        "custom_url": "@TechPulseOfficial",
        "subscribers": 48200,
        "views": 1428900,
        "videos": 128,
        "country": "US",
        "banner": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80",
        "keywords": "AI engineering system design cloud python fastapi",
        "topics": [
            "https://en.wikipedia.org/wiki/Technology",
            "https://en.wikipedia.org/wiki/Computer_science",
        ],
    },
    "demo-channel-2": {
        "title": "Growth Lab",
        "description": "Creator economy analytics, monetization case studies, and content strategy experiments.",
        "custom_url": "@GrowthLabPro",
        "subscribers": 84100,
        "views": 2890000,
        "videos": 210,
        "country": "US",
        "banner": "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=1200&q=80",
        "keywords": "creator economy monetization youtube growth",
        "topics": [
            "https://en.wikipedia.org/wiki/Marketing",
            "https://en.wikipedia.org/wiki/Business",
        ],
    },
}

DEMO_VIDEOS_RAW = [
    {
        "id": "demo_vid_01",
        "title": "We Built an Autonomous YouTube Studio in 48 Hours",
        "description": "Can multi-agent coding workflows run a full YouTube production loop? Here's our complete open-source pipeline.",
        "published": "2026-10-18T14:00:00Z",
        "duration": "14:28",
        "duration_iso": "PT14M28S",
        "duration_seconds": 868,
        "views": 184500,
        "likes": 9820,
        "comments": 642,
        "tags": ["AI Agents", "FastAPI", "FullStack", "Automation"],
        "thumb": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=640&q=80",
    },
    {
        "id": "demo_vid_02",
        "title": "Building a Multi-Agent YouTube Production Engine",
        "description": "Architecting worker queues, telemetry pipelines, and LLM script generation with FastAPI and React.",
        "published": "2026-10-14T10:00:00Z",
        "duration": "18:42",
        "duration_iso": "PT18M42S",
        "duration_seconds": 1122,
        "views": 142300,
        "likes": 7410,
        "comments": 489,
        "tags": ["Multi-Agent", "System Design", "Python", "React"],
        "thumb": "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=640&q=80",
    },
    {
        "id": "demo_vid_03",
        "title": "FastAPI vs Node for YouTube Data Webhooks",
        "description": "High-throughput asynchronous event processing and token encryption benchmarked side-by-side.",
        "published": "2026-10-10T16:30:00Z",
        "duration": "11:15",
        "duration_iso": "PT11M15S",
        "duration_seconds": 675,
        "views": 98400,
        "likes": 5120,
        "comments": 318,
        "tags": ["FastAPI", "Node.js", "Webhooks", "Performance"],
        "thumb": "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=640&q=80",
    },
    {
        "id": "demo_vid_04",
        "title": "How to Pass YouTube Studio Verification in 2026",
        "description": "Step-by-step audit guide for Google OAuth scopes, verification questionnaires, and security review.",
        "published": "2026-10-05T12:00:00Z",
        "duration": "09:35",
        "duration_iso": "PT9M35S",
        "duration_seconds": 575,
        "views": 76200,
        "likes": 4190,
        "comments": 254,
        "tags": ["OAuth", "Google Cloud", "Security", "YouTube API"],
        "thumb": "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=640&q=80",
    },
    {
        "id": "demo_vid_05",
        "title": "PostgreSQL vs SQLite for Creator Telemetry",
        "description": "Evaluating timeseries aggregations, JSONB storage, and connection pooling for creator dashboards.",
        "published": "2026-09-28T09:15:00Z",
        "duration": "13:50",
        "duration_iso": "PT13M50S",
        "duration_seconds": 830,
        "views": 62100,
        "likes": 3240,
        "comments": 195,
        "tags": ["PostgreSQL", "Database", "Telemetry", "Backend"],
        "thumb": "https://images.unsplash.com/photo-1544383835-bda2bc66a55d?auto=format&fit=crop&w=640&q=80",
    },
]


def build_demo_channel_details(channel_id: str) -> ChannelDetailsResponse:
    target = channel_id if channel_id in DEMO_CHANNEL_METADATA else "demo-channel-1"
    info = DEMO_CHANNEL_METADATA[target]

    return ChannelDetailsResponse(
        channel_id=target,
        data_state="DEMO",
        is_live=False,
        title=info["title"],
        description=info["description"],
        custom_url=info["custom_url"],
        published_at="2024-01-15T00:00:00Z",
        thumbnail_url="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80",
        thumbnails={
            "default": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=88&q=80",
            "medium": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80",
            "high": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80",
        },
        banner_image_url=info["banner"],
        country=info["country"],
        default_language="en",
        subscriber_count=info["subscribers"],
        hidden_subscriber_count=False,
        video_count=info["videos"],
        view_count=info["views"],
        topic_categories=info["topics"],
        keywords=info["keywords"],
        uploads_playlist_id=f"UU{target.replace('-', '_').upper()}",
        privacy_status="public",
        has_data_scope=True,
        message="Displaying synthetic demo channel details.",
    )


def build_demo_content_library(
    channel_id: str,
    page_token: Optional[str] = None,
    max_results: int = 20,
    q: Optional[str] = None,
    order: Optional[str] = "date",
) -> ContentLibraryResponse:
    target = channel_id if channel_id in DEMO_CHANNEL_METADATA else "demo-channel-1"
    ch_info = DEMO_CHANNEL_METADATA[target]

    videos: list[ContentVideoItem] = []
    for raw in DEMO_VIDEOS_RAW:
        dt = datetime.fromisoformat(raw["published"])
        videos.append(
            ContentVideoItem(
                video_id=raw["id"],
                channel_id=target,
                channel_title=ch_info["title"],
                title=raw["title"],
                description=raw["description"],
                published_at=raw["published"],
                relative_published=format_relative_time(dt),
                thumbnail_url=raw["thumb"],
                thumbnails={"high": raw["thumb"]},
                duration=raw["duration"],
                duration_iso=raw["duration_iso"],
                duration_seconds=raw["duration_seconds"],
                view_count=raw["views"],
                like_count=raw["likes"],
                comment_count=raw["comments"],
                tags=raw["tags"],
                privacy_status="public",
                definition="hd",
                has_caption=True,
            )
        )

    # Search filter
    if q and q.strip():
        term = q.strip().lower()
        videos = [
            v
            for v in videos
            if term in v.title.lower()
            or (v.description and term in v.description.lower())
            or any(term in t.lower() for t in v.tags)
        ]

    # Ordering
    if order == "views":
        videos.sort(key=lambda x: x.view_count, reverse=True)
    elif order == "likes":
        videos.sort(key=lambda x: (x.like_count or 0), reverse=True)
    elif order == "title":
        videos.sort(key=lambda x: x.title.lower())
    elif order == "date":
        videos.sort(key=lambda x: x.published_at, reverse=True)

    return ContentLibraryResponse(
        channel_id=target,
        data_state="DEMO",
        is_live=False,
        videos=videos[:max_results],
        next_page_token=None,
        prev_page_token=None,
        total_results=len(videos),
        results_per_page=max_results,
        q=q,
        order=order,
        message="Displaying synthetic demo content library.",
    )
