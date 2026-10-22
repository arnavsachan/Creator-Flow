from datetime import datetime, timedelta, timezone
import logging
import re
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.channel import ConnectedChannel
from app.models.competitor import Competitor
from app.models.user import User
from app.schemas.competitor import (
    ChannelMetricComparison,
    CompetitorComparisonResponse,
    CompetitorCreate,
    CompetitorResponse,
    CompetitorSearchResponse,
    CompetitorSearchResultItem,
    CompetitorUploadsResponse,
    CompetitorVideoItem,
)
from app.services.dashboard import format_relative_time
from app.services.youtube_data import (
    YOUTUBE_CHANNELS_URL,
    YOUTUBE_DATA_API_DISABLED,
    YOUTUBE_DATA_SCOPE_REQUIRED,
    YOUTUBE_PLAYLIST_ITEMS_URL,
    YOUTUBE_TOKEN_EXPIRED,
    YOUTUBE_VIDEOS_URL,
    execute_youtube_data_query,
    parse_iso8601_duration,
)
from app.services.youtube_oauth import (
    get_user_connected_channel,
    has_youtube_data_permission,
    refresh_access_token,
    start_youtube_oauth,
)

logger = logging.getLogger(__name__)

YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"


def normalize_thumbnail_url(raw_url: Optional[str]) -> Optional[str]:
    """Normalize a thumbnail/avatar URL to a secure, absolute https URL."""
    if not raw_url:
        return None
    url = str(raw_url).strip()
    if not url:
        return None
    if url.startswith("//"):
        return f"https:{url}"
    if url.startswith("http://"):
        return f"https://{url[7:]}"
    return url


def extract_best_thumbnail_url(
    thumbnails: Optional[dict[str, Any]],
    fallback_url: Optional[str] = None,
    preferred_order: tuple[str, ...] = ("high", "medium", "default", "standard", "maxres"),
) -> Optional[str]:
    """
    Extract the best available thumbnail URL from a YouTube API thumbnails dict
    with a deterministic fallback chain (high -> medium -> default -> standard -> maxres)
    and secure https normalization.
    """
    if isinstance(thumbnails, dict):
        for res in preferred_order:
            val = thumbnails.get(res)
            candidate: Optional[str] = None
            if isinstance(val, dict):
                candidate = val.get("url")
            elif isinstance(val, str):
                candidate = val

            norm = normalize_thumbnail_url(candidate)
            if norm:
                return norm

        # If resolution keys differ from standard set, inspect any available item
        for key, val in thumbnails.items():
            if key not in preferred_order:
                candidate = val.get("url") if isinstance(val, dict) else (val if isinstance(val, str) else None)
                norm = normalize_thumbnail_url(candidate)
                if norm:
                    return norm

    return normalize_thumbnail_url(fallback_url)


# Canonical Demo Competitors for development/demo environment
DEMO_COMPETITORS_DATA = [
    {
        "channel_id": "UC_DEMO_TECH_LEAD",
        "title": "Tech Lead Pro",
        "custom_url": "@TechLeadPro",
        "description": "System architecture, high-scale backend design patterns, and engineering management.",
        "thumbnail_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80",
        "subscriber_count": 420000,
        "video_count": 340,
        "view_count": 45200000,
    },
    {
        "channel_id": "UC_DEMO_BYTE_ARCH",
        "title": "ByteByte Architecture",
        "custom_url": "@ByteByteArch",
        "description": "Visual guides to distributed systems, sharding, caching, and enterprise microservices.",
        "thumbnail_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80",
        "subscriber_count": 890000,
        "video_count": 280,
        "view_count": 92100000,
    },
    {
        "channel_id": "UC_DEMO_CLOUD_ZERO",
        "title": "Cloud Engineer Zero",
        "custom_url": "@CloudEngineerZero",
        "description": "Cloud infrastructure benchmarks, Kubernetes vs serverless teardowns, and DevOps realities.",
        "thumbnail_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80",
        "subscriber_count": 185000,
        "video_count": 195,
        "view_count": 18400000,
    },
]

DEMO_COMPETITOR_VIDEOS = {
    "UC_DEMO_TECH_LEAD": [
        {
            "video_id": "demo_comp_v1",
            "title": "How We Scaled to 10M Requests with Go and Redis",
            "description": "A deep dive into cache invalidation, connection pooling, and concurrency.",
            "published_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
            "duration": "16:45",
            "duration_seconds": 1005,
            "view_count": 84200,
            "like_count": 4210,
            "comment_count": 340,
        },
        {
            "video_id": "demo_comp_v2",
            "title": "Why Microservices Break at Scale (And How to Fix It)",
            "description": "Distributed tracing, retry storms, and gRPC communication best practices.",
            "published_at": (datetime.now(timezone.utc) - timedelta(days=8)).isoformat(),
            "duration": "21:10",
            "duration_seconds": 1270,
            "view_count": 142000,
            "like_count": 7890,
            "comment_count": 520,
        },
        {
            "video_id": "demo_comp_v3",
            "title": "PostgreSQL vs DynamoDB: Choosing the Right Production Store",
            "description": "Evaluating ACID transactions, global tables, and latency guarantees.",
            "published_at": (datetime.now(timezone.utc) - timedelta(days=16)).isoformat(),
            "duration": "14:30",
            "duration_seconds": 870,
            "view_count": 67500,
            "like_count": 3100,
            "comment_count": 215,
        },
    ],
    "UC_DEMO_BYTE_ARCH": [
        {
            "video_id": "demo_comp_b1",
            "title": "Database Sharding Visualized in 12 Minutes",
            "description": "Consistent hashing, range-based partitioning, and cross-shard queries explained.",
            "published_at": (datetime.now(timezone.utc) - timedelta(days=3)).isoformat(),
            "duration": "12:15",
            "duration_seconds": 735,
            "view_count": 195000,
            "like_count": 12400,
            "comment_count": 890,
        },
        {
            "video_id": "demo_comp_b2",
            "title": "How Kafka Actually Works Under the Hood",
            "description": "Commit logs, zero-copy reads, partition leaders, and consumer groups.",
            "published_at": (datetime.now(timezone.utc) - timedelta(days=11)).isoformat(),
            "duration": "18:20",
            "duration_seconds": 1100,
            "view_count": 284000,
            "like_count": 18200,
            "comment_count": 1120,
        },
    ],
    "UC_DEMO_CLOUD_ZERO": [
        {
            "video_id": "demo_comp_c1",
            "title": "Kubernetes is Overkill for 99% of Startups",
            "description": "Why container orchestration adds complexity before you find product-market fit.",
            "published_at": (datetime.now(timezone.utc) - timedelta(days=5)).isoformat(),
            "duration": "13:50",
            "duration_seconds": 830,
            "view_count": 112000,
            "like_count": 6800,
            "comment_count": 470,
        },
    ],
}


def resolve_user_youtube_token(
    db: Session,
    user: User,
    preferred_channel_id: Optional[str] = None,
) -> tuple[Optional[str], Optional[ConnectedChannel]]:
    """
    Resolves an active Google access token from the user's connected YouTube channel.
    If preferred_channel_id is specified, verifies ownership of that channel first.
    """
    channel: Optional[ConnectedChannel] = None
    if preferred_channel_id and not preferred_channel_id.startswith("demo-"):
        channel = (
            db.query(ConnectedChannel)
            .filter(
                ConnectedChannel.channel_id == preferred_channel_id,
                ConnectedChannel.user_id == user.id,
                ConnectedChannel.status == "connected",
            )
            .first()
        )

    if not channel:
        channel = get_user_connected_channel(db, user.id)

    if not channel or channel.status != "connected":
        return None, None

    if not has_youtube_data_permission(channel):
        return None, channel

    try:
        token = refresh_access_token(db, channel)
        return token, channel
    except Exception as exc:
        logger.warning("Failed refreshing access token for channel %s: %s", channel.channel_id, exc)
        return None, channel


def clean_channel_query(raw_query: str) -> tuple[str, str]:
    """
    Inspects search input and extracts clean handle, channel ID, or search keyword.
    Returns (query_type, cleaned_value) where query_type is 'id', 'handle', or 'keyword'.
    """
    q = raw_query.strip()
    # Check for direct URL formats
    # e.g., https://www.youtube.com/@handle or https://youtube.com/@handle
    handle_match = re.search(r"youtube\.com/@([a-zA-Z0-9_\-\.]+)", q)
    if handle_match:
        return "handle", handle_match.group(1)

    # e.g., https://www.youtube.com/channel/UC...
    id_match = re.search(r"youtube\.com/channel/(UC[a-zA-Z0-9_\-]{22})", q)
    if id_match:
        return "id", id_match.group(1)

    # Handle prefixed with @ (e.g. @mkbhd)
    if q.startswith("@"):
        return "handle", q[1:].strip()

    # Raw channel ID matching YouTube 24-character UC pattern
    if re.match(r"^UC[a-zA-Z0-9_\-]{22}$", q):
        return "id", q

    return "keyword", q


def fetch_channel_public_details_by_id(
    access_token: str,
    channel_ids: list[str],
) -> dict[str, dict[str, Any]]:
    """
    Batches channels.list query for up to 50 channel IDs to retrieve live snippet and statistics.
    """
    if not channel_ids:
        return {}

    id_param = ",".join(channel_ids[:50])
    params = {
        "part": "snippet,statistics,contentDetails",
        "id": id_param,
    }
    data = execute_youtube_data_query(access_token, YOUTUBE_CHANNELS_URL, params)
    result_map: dict[str, dict[str, Any]] = {}
    for item in data.get("items", []):
        cid = item.get("id")
        if cid:
            result_map[cid] = item
    return result_map


def search_youtube_channels(
    db: Session,
    user: User,
    query: str,
    page_token: Optional[str] = None,
    max_results: int = 10,
    preferred_channel_id: Optional[str] = None,
) -> CompetitorSearchResponse:
    """
    Searches public YouTube channels using YouTube Data API v3.
    Supports handle resolution, channel ID resolution, and name/keyword search.
    Enriches search results with public subscribers, total views, and video counts.
    Honors quota limits and respects hidden subscriber settings.
    """
    query = (query or "").strip()
    if not query:
        return CompetitorSearchResponse(query="", results=[], total_results=0)

    # Check which channels are already tracked by the authenticated user
    existing_tracked_ids = {
        c.channel_id
        for c in db.query(Competitor.channel_id).filter(Competitor.user_id == user.id).all()
    }

    access_token, channel = resolve_user_youtube_token(db, user, preferred_channel_id)

    # If no connected channel or access token exists, check demo mode or require authorization
    if not access_token:
        # Check if query matches demo channels
        matched_demo: list[CompetitorSearchResultItem] = []
        q_lower = query.lower()
        for d in DEMO_COMPETITORS_DATA:
            if (
                q_lower in d["title"].lower()
                or q_lower in d["custom_url"].lower()
                or q_lower in d["channel_id"].lower()
            ):
                matched_demo.append(
                    CompetitorSearchResultItem(
                        channel_id=d["channel_id"],
                        title=d["title"],
                        custom_url=d["custom_url"],
                        description=d["description"],
                        thumbnail_url=d["thumbnail_url"],
                        subscriber_count=d["subscriber_count"],
                        hidden_subscriber_count=False,
                        video_count=d["video_count"],
                        view_count=d["view_count"],
                        is_tracked=d["channel_id"] in existing_tracked_ids,
                    )
                )

        if matched_demo or query.lower().startswith("demo") or (channel and channel.channel_id.startswith("demo-")):
            return CompetitorSearchResponse(
                query=query,
                results=matched_demo if matched_demo else [
                    CompetitorSearchResultItem(
                        channel_id=d["channel_id"],
                        title=d["title"],
                        custom_url=d["custom_url"],
                        description=d["description"],
                        thumbnail_url=d["thumbnail_url"],
                        subscriber_count=d["subscriber_count"],
                        hidden_subscriber_count=False,
                        video_count=d["video_count"],
                        view_count=d["view_count"],
                        is_tracked=d["channel_id"] in existing_tracked_ids,
                    )
                    for d in DEMO_COMPETITORS_DATA
                ],
                total_results=len(matched_demo) if matched_demo else len(DEMO_COMPETITORS_DATA),
                data_state="DEMO",
                message="Displaying sample competitor channels (Connect YouTube account for live channel search).",
            )

        auth_url, _ = start_youtube_oauth(db, user)
        return CompetitorSearchResponse(
            query=query,
            results=[],
            total_results=0,
            data_state="AUTHORIZATION_REQUIRED",
            authorization_url=auth_url,
            message="Connecting a YouTube channel with read permissions is required to search live YouTube channels.",
        )

    # Resolve query type
    q_type, clean_val = clean_channel_query(query)

    # Case A: Direct Channel ID or Handle lookup (Uses channels.list directly - only 1 quota unit!)
    if q_type in ("id", "handle"):
        params: dict[str, Any] = {
            "part": "snippet,statistics,contentDetails",
        }
        if q_type == "id":
            params["id"] = clean_val
        else:
            params["forHandle"] = clean_val

        try:
            data = execute_youtube_data_query(access_token, YOUTUBE_CHANNELS_URL, params)
            items = data.get("items", [])
            results: list[CompetitorSearchResultItem] = []
            for it in items:
                cid = it.get("id")
                snip = it.get("snippet", {})
                stats = it.get("statistics", {})

                subs_hidden = bool(stats.get("hiddenSubscriberCount", False))
                subs_count = None
                if not subs_hidden and "subscriberCount" in stats:
                    try:
                        subs_count = int(stats["subscriberCount"])
                    except (ValueError, TypeError):
                        pass

                views_count = int(stats.get("viewCount", 0) or 0)
                vids_count = int(stats.get("videoCount", 0) or 0)

                thumbs = snip.get("thumbnails", {})
                thumb_url = extract_best_thumbnail_url(thumbs)

                results.append(
                    CompetitorSearchResultItem(
                        channel_id=cid,
                        title=snip.get("title", clean_val),
                        description=snip.get("description", ""),
                        custom_url=snip.get("customUrl"),
                        thumbnail_url=thumb_url,
                        subscriber_count=subs_count,
                        hidden_subscriber_count=subs_hidden,
                        video_count=vids_count,
                        view_count=views_count,
                        is_tracked=cid in existing_tracked_ids,
                    )
                )

            if results:
                return CompetitorSearchResponse(
                    query=query,
                    results=results,
                    total_results=len(results),
                    data_state="LIVE",
                    message="Direct channel resolution successful.",
                )
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("Direct channel lookup failed for %s (%s): %s", q_type, clean_val, exc)

    # Case B: General Name / Keyword Search via search.list (100 units)
    search_params: dict[str, Any] = {
        "part": "snippet",
        "type": "channel",
        "q": clean_val,
        "maxResults": min(max(max_results, 1), 25),
    }
    if page_token:
        search_params["pageToken"] = page_token

    search_data = execute_youtube_data_query(access_token, YOUTUBE_SEARCH_URL, search_params)
    search_items = search_data.get("items", [])
    next_token = search_data.get("nextPageToken")
    prev_token = search_data.get("prevPageToken")
    total_results = search_data.get("pageInfo", {}).get("totalResults", len(search_items))

    if not search_items:
        return CompetitorSearchResponse(
            query=query,
            results=[],
            total_results=0,
            data_state="LIVE",
            message=f"No public channels found matching '{query}'.",
        )

    # Extract channel IDs to fetch live statistics
    channel_ids: list[str] = []
    for it in search_items:
        cid = it.get("snippet", {}).get("channelId") or it.get("id", {}).get("channelId")
        if cid and cid not in channel_ids:
            channel_ids.append(cid)

    # Batch fetch channel statistics
    stats_map = fetch_channel_public_details_by_id(access_token, channel_ids)

    results: list[CompetitorSearchResultItem] = []
    for it in search_items:
        cid = it.get("snippet", {}).get("channelId") or it.get("id", {}).get("channelId")
        if not cid:
            continue

        detail = stats_map.get(cid, {})
        snip = detail.get("snippet", {}) or it.get("snippet", {})
        stats = detail.get("statistics", {})

        title = snip.get("title") or it.get("snippet", {}).get("title", "Untitled Channel")
        desc = snip.get("description", "")
        custom_url = snip.get("customUrl")

        thumbs = snip.get("thumbnails") or it.get("snippet", {}).get("thumbnails")
        thumb_url = extract_best_thumbnail_url(thumbs)

        subs_hidden = bool(stats.get("hiddenSubscriberCount", False))
        subs_count = None
        if not subs_hidden and "subscriberCount" in stats:
            try:
                subs_count = int(stats["subscriberCount"])
            except (ValueError, TypeError):
                pass

        views_count = int(stats.get("viewCount", 0) or 0)
        vids_count = int(stats.get("videoCount", 0) or 0)

        results.append(
            CompetitorSearchResultItem(
                channel_id=cid,
                title=title,
                description=desc,
                custom_url=custom_url,
                thumbnail_url=thumb_url,
                subscriber_count=subs_count,
                hidden_subscriber_count=subs_hidden,
                video_count=vids_count,
                view_count=views_count,
                is_tracked=cid in existing_tracked_ids,
            )
        )

    return CompetitorSearchResponse(
        query=query,
        results=results,
        next_page_token=next_token,
        prev_page_token=prev_token,
        total_results=total_results,
        data_state="LIVE",
        message=f"Found {len(results)} channels matching '{query}'.",
    )


def create_competitor(
    db: Session,
    user: User,
    comp_in: CompetitorCreate,
) -> Competitor:
    """
    Saves a competitor channel to the user's tracked list with duplicate prevention.
    Enforces user ownership and validates YouTube channel ID.
    Fetches verified public channel metrics if credentials permit.
    """
    clean_id = comp_in.channel_id.strip()
    if not clean_id or len(clean_id) < 5:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid YouTube channel ID provided.",
        )

    # Prevent duplicate tracking for the same user and channel
    existing = (
        db.query(Competitor)
        .filter(Competitor.user_id == user.id, Competitor.channel_id == clean_id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Channel '{clean_id}' is already tracked in your competitor list.",
        )

    title = comp_in.title or clean_id
    custom_url = comp_in.custom_url
    description = None
    thumb_url = normalize_thumbnail_url(comp_in.thumbnail_url)
    subscriber_count: Optional[int] = None
    hidden_subs = False
    video_count = 0
    view_count = 0

    # Check demo fallback matches
    for d in DEMO_COMPETITORS_DATA:
        if d["channel_id"] == clean_id:
            title = comp_in.title or d["title"]
            custom_url = custom_url or d["custom_url"]
            description = d["description"]
            thumb_url = thumb_url or normalize_thumbnail_url(d["thumbnail_url"])
            subscriber_count = d["subscriber_count"]
            video_count = d["video_count"]
            view_count = d["view_count"]
            break

    # If live credentials available, fetch verified metadata
    access_token, _ = resolve_user_youtube_token(db, user, comp_in.primary_channel_id)
    if access_token and not clean_id.startswith("UC_DEMO_"):
        try:
            details_map = fetch_channel_public_details_by_id(access_token, [clean_id])
            if clean_id in details_map:
                ch = details_map[clean_id]
                snip = ch.get("snippet", {})
                stats = ch.get("statistics", {})

                title = snip.get("title", title)
                custom_url = snip.get("customUrl", custom_url)
                description = snip.get("description")
                thumbs = snip.get("thumbnails", {})
                thumb_url = extract_best_thumbnail_url(thumbs, fallback_url=thumb_url)

                hidden_subs = bool(stats.get("hiddenSubscriberCount", False))
                if not hidden_subs and "subscriberCount" in stats:
                    try:
                        subscriber_count = int(stats["subscriberCount"])
                    except (ValueError, TypeError):
                        pass

                video_count = int(stats.get("videoCount", 0) or 0)
                view_count = int(stats.get("viewCount", 0) or 0)
        except Exception as exc:
            logger.info("Could not fetch live metadata for channel %s during add: %s", clean_id, exc)

    competitor = Competitor(
        user_id=user.id,
        channel_id=clean_id,
        title=title,
        custom_url=custom_url,
        description=description,
        thumbnail_url=thumb_url,
        subscriber_count=subscriber_count,
        hidden_subscriber_count=hidden_subs,
        video_count=video_count,
        view_count=view_count,
        primary_channel_id=comp_in.primary_channel_id,
        notes=comp_in.notes,
        last_synced_at=datetime.now(timezone.utc),
    )
    db.add(competitor)
    db.commit()
    db.refresh(competitor)
    return competitor


def list_competitors(
    db: Session,
    user: User,
    primary_channel_id: Optional[str] = None,
) -> list[Competitor]:
    """
    Retrieves all tracked competitors for the authenticated user.
    Strictly isolated by user_id.
    """
    query = db.query(Competitor).filter(Competitor.user_id == user.id)
    if primary_channel_id:
        query = query.filter(
            (Competitor.primary_channel_id == primary_channel_id)
            | (Competitor.primary_channel_id.is_(None))
        )
    return query.order_by(Competitor.created_at.desc()).all()


def get_competitor_by_id(
    db: Session,
    user: User,
    competitor_id: str,
) -> Competitor:
    """
    Retrieves a single competitor with tenant ownership verification.
    """
    comp = (
        db.query(Competitor)
        .filter(Competitor.id == competitor_id, Competitor.user_id == user.id)
        .first()
    )
    if not comp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tracked competitor with ID '{competitor_id}' not found.",
        )
    return comp


def delete_competitor(
    db: Session,
    user: User,
    competitor_id: str,
) -> bool:
    """
    Deletes a tracked competitor with tenant ownership verification.
    """
    comp = get_competitor_by_id(db, user, competitor_id)
    db.delete(comp)
    db.commit()
    return True


def get_competitor_uploads(
    db: Session,
    user: User,
    competitor_id: str,
    max_results: int = 12,
) -> CompetitorUploadsResponse:
    """
    Fetches the latest public uploads for a tracked competitor channel using the uploads playlist approach.
    Parses ISO 8601 durations and maps public views, likes, and comments.
    """
    comp = get_competitor_by_id(db, user, competitor_id)
    cid = comp.channel_id

    # Check demo fallback
    if cid in DEMO_COMPETITOR_VIDEOS:
        demo_vids = DEMO_COMPETITOR_VIDEOS[cid]
        items: list[CompetitorVideoItem] = []
        for dv in demo_vids:
            dt = datetime.fromisoformat(dv["published_at"])
            items.append(
                CompetitorVideoItem(
                    video_id=dv["video_id"],
                    channel_id=cid,
                    title=dv["title"],
                    description=dv["description"],
                    published_at=dv["published_at"],
                    relative_published=format_relative_time(dt),
                    thumbnail_url=f"https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=480&q=80",
                    duration=dv["duration"],
                    duration_seconds=dv["duration_seconds"],
                    view_count=dv["view_count"],
                    like_count=dv["like_count"],
                    comment_count=dv["comment_count"],
                    youtube_url=f"https://www.youtube.com/watch?v={dv['video_id']}",
                )
            )
        return CompetitorUploadsResponse(
            competitor_id=comp.id,
            channel_id=cid,
            channel_title=comp.title,
            videos=items,
            total_results=len(items),
            message="Displaying sample competitor uploads.",
        )

    access_token, _ = resolve_user_youtube_token(db, user, comp.primary_channel_id)
    if not access_token:
        return CompetitorUploadsResponse(
            competitor_id=comp.id,
            channel_id=cid,
            channel_title=comp.title,
            videos=[],
            total_results=0,
            message="Connect YouTube channel to fetch live competitor uploads.",
        )

    # Uploads playlist ID: standard YouTube rule replaces 'UC' prefix with 'UU'
    uploads_playlist_id = "UU" + cid[2:] if cid.startswith("UC") else None
    if not uploads_playlist_id:
        # Query channels.list for relatedPlaylists.uploads
        try:
            ch_data = execute_youtube_data_query(
                access_token,
                YOUTUBE_CHANNELS_URL,
                {"part": "contentDetails", "id": cid},
            )
            items = ch_data.get("items", [])
            if items:
                uploads_playlist_id = items[0].get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads")
        except Exception:
            pass

    if not uploads_playlist_id:
        uploads_playlist_id = "UU" + cid[2:] if cid.startswith("UC") else None

    if not uploads_playlist_id:
        return CompetitorUploadsResponse(
            competitor_id=comp.id,
            channel_id=cid,
            channel_title=comp.title,
            videos=[],
            total_results=0,
            message="Could not resolve uploads playlist for this channel.",
        )

    # Query playlistItems
    p_params = {
        "part": "snippet,contentDetails",
        "playlistId": uploads_playlist_id,
        "maxResults": min(max(max_results, 1), 50),
    }
    p_data = execute_youtube_data_query(access_token, YOUTUBE_PLAYLIST_ITEMS_URL, p_params)
    p_items = p_data.get("items", [])
    next_token = p_data.get("nextPageToken")
    total_results = p_data.get("pageInfo", {}).get("totalResults", len(p_items))

    if not p_items:
        return CompetitorUploadsResponse(
            competitor_id=comp.id,
            channel_id=cid,
            channel_title=comp.title,
            videos=[],
            total_results=0,
            message="No public uploads found for this competitor.",
        )

    video_ids: list[str] = []
    video_snippets: dict[str, dict] = {}
    for it in p_items:
        vid = it.get("contentDetails", {}).get("videoId") or it.get("snippet", {}).get("resourceId", {}).get("videoId")
        snip = it.get("snippet", {})
        if vid and snip.get("title") not in ("Private video", "Deleted video"):
            video_ids.append(vid)
            video_snippets[vid] = snip

    if not video_ids:
        return CompetitorUploadsResponse(
            competitor_id=comp.id,
            channel_id=cid,
            channel_title=comp.title,
            videos=[],
            total_results=total_results,
            message="All video items in this slice were private or deleted.",
        )

    # Batch query videos.list for duration & statistics
    v_params = {
        "part": "snippet,contentDetails,statistics",
        "id": ",".join(video_ids),
    }
    v_data = execute_youtube_data_query(access_token, YOUTUBE_VIDEOS_URL, v_params)

    now = datetime.now(timezone.utc)
    competitor_videos: list[CompetitorVideoItem] = []

    for v_item in v_data.get("items", []):
        vid_id = v_item.get("id")
        if not vid_id:
            continue

        v_snip = v_item.get("snippet", {})
        v_stats = v_item.get("statistics", {})
        v_cd = v_item.get("contentDetails", {})

        title = v_snip.get("title") or video_snippets.get(vid_id, {}).get("title", "Untitled")
        description = v_snip.get("description", "")
        pub_raw = v_snip.get("publishedAt") or video_snippets.get(vid_id, {}).get("publishedAt")

        try:
            pub_dt = datetime.fromisoformat(pub_raw.replace("Z", "+00:00")) if pub_raw else now
        except Exception:
            pub_dt = now

        thumbs = v_snip.get("thumbnails") or video_snippets.get(vid_id, {}).get("thumbnails")
        thumb_url = extract_best_thumbnail_url(thumbs)

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

        competitor_videos.append(
            CompetitorVideoItem(
                video_id=vid_id,
                channel_id=cid,
                title=title,
                description=description,
                published_at=pub_dt.isoformat(),
                relative_published=format_relative_time(pub_dt),
                thumbnail_url=thumb_url,
                duration=dur_formatted,
                duration_seconds=dur_secs,
                view_count=views,
                like_count=likes,
                comment_count=comments,
                youtube_url=f"https://www.youtube.com/watch?v={vid_id}",
            )
        )

    return CompetitorUploadsResponse(
        competitor_id=comp.id,
        channel_id=cid,
        channel_title=comp.title,
        videos=competitor_videos,
        total_results=total_results,
        next_page_token=next_token,
        message=f"Retrieved {len(competitor_videos)} public competitor uploads.",
    )


def compare_channel_with_competitor(
    db: Session,
    user: User,
    competitor_id: str,
    user_channel_id: Optional[str] = None,
) -> CompetitorComparisonResponse:
    """
    Performs side-by-side comparison between the user's selected channel and a tracked competitor.
    Compares public subscriber counts, lifetime views, video counts, average views, and upload frequency.
    Strictly abstains from fabricating private CTR or shared audience overlap.
    """
    competitor = get_competitor_by_id(db, user, competitor_id)

    # Resolve user channel
    user_channel: Optional[ConnectedChannel] = None
    if user_channel_id and not user_channel_id.startswith("demo-"):
        user_channel = (
            db.query(ConnectedChannel)
            .filter(
                ConnectedChannel.channel_id == user_channel_id,
                ConnectedChannel.user_id == user.id,
            )
            .first()
        )
    if not user_channel:
        user_channel = get_user_connected_channel(db, user.id)

    user_title = user_channel.title if user_channel else "My Connected Channel"
    user_cid = user_channel.channel_id if user_channel else (user_channel_id or "my-channel")

    u_subs = user_channel.subscriber_count if user_channel else 48200
    u_views = user_channel.view_count if user_channel else 1428900
    u_vids = user_channel.video_count if user_channel else 128

    c_subs = competitor.subscriber_count
    c_views = competitor.view_count
    c_vids = competitor.video_count

    # Calculate average views per video
    u_avg_views = round(u_views / max(u_vids, 1)) if u_views else 0
    c_avg_views = round(c_views / max(c_vids, 1)) if c_views and c_vids else 0

    metrics: list[ChannelMetricComparison] = []

    # 1. Subscribers
    subs_diff = None
    if u_subs is not None and c_subs is not None and c_subs > 0:
        subs_diff = round(((u_subs - c_subs) / c_subs) * 100, 1)

    metrics.append(
        ChannelMetricComparison(
            metric_key="subscribers",
            label="Public Subscribers",
            user_value=u_subs,
            competitor_value=c_subs if not competitor.hidden_subscriber_count else "Hidden by Creator",
            diff_pct=subs_diff,
            note="Public subscriber count from YouTube Data API v3",
        )
    )

    # 2. Lifetime Views
    views_diff = None
    if u_views and c_views and c_views > 0:
        views_diff = round(((u_views - c_views) / c_views) * 100, 1)

    metrics.append(
        ChannelMetricComparison(
            metric_key="lifetime_views",
            label="Lifetime Channel Views",
            user_value=u_views,
            competitor_value=c_views,
            diff_pct=views_diff,
            note="Total cumulative views across all public uploads",
        )
    )

    # 3. Public Video Count
    vids_diff = None
    if u_vids and c_vids and c_vids > 0:
        vids_diff = round(((u_vids - c_vids) / c_vids) * 100, 1)

    metrics.append(
        ChannelMetricComparison(
            metric_key="video_count",
            label="Public Video Count",
            user_value=u_vids,
            competitor_value=c_vids,
            diff_pct=vids_diff,
            note="Total public video uploads in channel library",
        )
    )

    # 4. Average Views per Video (Lifetime)
    avg_diff = None
    if u_avg_views and c_avg_views and c_avg_views > 0:
        avg_diff = round(((u_avg_views - c_avg_views) / c_avg_views) * 100, 1)

    metrics.append(
        ChannelMetricComparison(
            metric_key="avg_views_per_video",
            label="Avg. Views per Upload",
            user_value=u_avg_views,
            competitor_value=c_avg_views,
            diff_pct=avg_diff,
            note="Cumulative views divided by total uploaded videos",
        )
    )

    # Fetch latest competitor uploads
    comp_uploads_res = get_competitor_uploads(db, user, competitor.id, max_results=5)
    competitor_recent_vids = comp_uploads_res.videos

    # Get user recent videos if available
    user_recent_vids: list[CompetitorVideoItem] = []
    if user_channel and user_channel.status == "connected":
        from app.services.youtube_oauth import get_channel_videos
        cvs = get_channel_videos(db, user_channel.channel_id, limit=5)
        for cv in cvs:
            user_recent_vids.append(
                CompetitorVideoItem(
                    video_id=cv.video_id,
                    channel_id=cv.channel_id,
                    title=cv.title,
                    description=cv.description or "",
                    published_at=cv.published_at.isoformat(),
                    relative_published=format_relative_time(cv.published_at),
                    thumbnail_url=cv.thumbnail_url,
                    duration=cv.duration,
                    duration_seconds=cv.duration_seconds,
                    view_count=cv.view_count,
                    like_count=cv.like_count,
                    comment_count=cv.comment_count,
                    youtube_url=f"https://www.youtube.com/watch?v={cv.video_id}",
                )
            )

    return CompetitorComparisonResponse(
        user_channel_id=user_cid,
        user_channel_title=user_title,
        competitor_id=competitor.id,
        competitor_channel_id=competitor.channel_id,
        competitor_title=competitor.title,
        metrics=metrics,
        user_recent_videos=user_recent_vids,
        competitor_recent_videos=competitor_recent_vids,
    )
