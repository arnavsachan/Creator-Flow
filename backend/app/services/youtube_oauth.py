from datetime import datetime, timedelta, timezone
import logging
from typing import Optional
import urllib.parse

from fastapi import HTTPException, status
import httpx
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.security import (
    decrypt_token,
    encrypt_token,
    generate_oauth_state,
    generate_pkce_pair,
)
from app.models.channel import ConnectedChannel
from app.models.oauth import OAuthState
from app.models.snapshot import ChannelSnapshot
from app.models.user import User
from app.models.video import ChannelVideo

logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
YOUTUBE_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels"
YOUTUBE_PLAYLIST_ITEMS_URL = "https://www.googleapis.com/youtube/v3/playlistItems"
YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"

# Minimum required scopes: Google identity + YouTube read-only
REQUIRED_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/youtube.readonly",
]

YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly"
YOUTUBE_ANALYTICS_SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly"


def validate_google_oauth_credentials(settings: Optional[Settings] = None) -> None:
    """
    Validates that Google OAuth Client ID and Secret are configured and not placeholders.
    Fails with a clear backend configuration error (HTTP 503) if required credentials are absent,
    rather than redirecting to Google with an invalid client.
    """
    current_settings = settings or get_settings()
    cid = (current_settings.GOOGLE_CLIENT_ID or "").strip()
    sec = (current_settings.GOOGLE_CLIENT_SECRET or "").strip()

    is_placeholder_id = (
        not cid
        or any(ph in cid.lower() for ph in ["your-google-client-id", "placeholder", "replace-with", "example"])
        or not cid.endswith(".apps.googleusercontent.com")
        or "-" not in cid
    )
    is_placeholder_sec = (
        not sec
        or any(ph in sec.lower() for ph in ["your-google-client-secret", "placeholder", "replace-with", "example"])
        or len(sec) < 10
    )

    if is_placeholder_id or is_placeholder_sec:
        missing = []
        if is_placeholder_id:
            missing.append("GOOGLE_CLIENT_ID (must be a valid Google Cloud Web application client ending with .apps.googleusercontent.com)")
        if is_placeholder_sec:
            missing.append("GOOGLE_CLIENT_SECRET (must be a valid Google Cloud client secret)")
        detail_msg = (
            f"Google OAuth credentials are not properly configured on the backend. "
            f"Missing or invalid: {'; '.join(missing)}. "
            "Please configure valid GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env with your Google Cloud Web application client."
        )
        logger.error(detail_msg)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail_msg,
        )


def has_analytics_permission(channel: Optional[ConnectedChannel]) -> bool:
    """
    Checks whether the given connected channel has been granted YouTube Analytics API permissions
    by inspecting the actual scope string recorded from Google OAuth.
    """
    if not channel or not channel.scope:
        return False
    scopes = set(channel.scope.split())
    return (
        YOUTUBE_ANALYTICS_SCOPE in scopes
        or "yt-analytics.readonly" in channel.scope
        or "https://www.googleapis.com/auth/yt-analytics.monetary.readonly" in scopes
    )


def start_youtube_oauth(
    db: Session,
    user: User,
    redirect_uri: Optional[str] = None,
    include_analytics: bool = False,
) -> tuple[str, str]:
    """
    Initiates Google OAuth 2.0 flow for YouTube channel connection.
    Validates backend credentials, generates state and PKCE verifier/challenge,
    persists state in DB, and returns (authorization_url, state).
    If include_analytics is True, adds the yt-analytics.readonly scope.
    """
    settings = get_settings()
    validate_google_oauth_credentials(settings)

    actual_redirect_uri = (redirect_uri or settings.GOOGLE_REDIRECT_URI or "").strip()
    if not actual_redirect_uri or not (actual_redirect_uri.startswith("http://") or actual_redirect_uri.startswith("https://")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid redirect_uri '{actual_redirect_uri}'. Must be an absolute HTTP or HTTPS URL.",
        )

    state = generate_oauth_state()
    code_verifier, code_challenge = generate_pkce_pair()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    oauth_state = OAuthState(
        state=state,
        user_id=user.id,
        code_verifier=code_verifier,
        redirect_uri=actual_redirect_uri,
        expires_at=expires_at,
    )
    db.add(oauth_state)
    db.commit()

    scopes = list(REQUIRED_SCOPES)
    if include_analytics and YOUTUBE_ANALYTICS_SCOPE not in scopes:
        scopes.append(YOUTUBE_ANALYTICS_SCOPE)

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": actual_redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes),
        "access_type": "offline",
        "prompt": "consent",  # Ensures refresh token is provided
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    authorization_url = f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"
    return authorization_url, state


def exchange_code_for_tokens(
    code: str,
    code_verifier: str,
    redirect_uri: str,
) -> dict:
    """
    Exchanges authorization code and PKCE code_verifier for Google OAuth tokens.
    """
    settings = get_settings()
    validate_google_oauth_credentials(settings)

    data = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "code": code,
        "code_verifier": code_verifier,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(GOOGLE_TOKEN_URL, data=data)
            if resp.status_code != 200:
                logger.warning("Google token exchange returned status %s: %s", resp.status_code, resp.text)
                err_json = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                err_msg = err_json.get("error_description") or err_json.get("error") or "Failed to exchange token with Google"
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Token exchange failed: {err_msg}",
                )
            return resp.json()
    except httpx.RequestError as exc:
        logger.error("Network error during Google token exchange: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to reach Google OAuth token service.",
        ) from exc


def fetch_youtube_channel_profile(access_token: str) -> dict:
    """
    Calls the official YouTube Data API v3 channels.list endpoint with part=snippet,contentDetails,statistics&mine=true.
    """
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
    params = {"part": "snippet,contentDetails,statistics", "mine": "true"}

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(YOUTUBE_CHANNELS_URL, headers=headers, params=params)
            if resp.status_code != 200:
                logger.warning("YouTube Data API returned status %s: %s", resp.status_code, resp.text)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to retrieve channel data from YouTube Data API.",
                )
            data = resp.json()
            items = data.get("items", [])
            if not items:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No YouTube channel found associated with this Google account.",
                )
            return items[0]
    except httpx.RequestError as exc:
        logger.error("Network error fetching YouTube channel: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to reach YouTube Data API.",
        ) from exc


def process_oauth_callback(
    db: Session,
    code: str,
    state: str,
    current_user_id: Optional[str] = None,
) -> ConnectedChannel:
    """
    Validates state and PKCE verifier, exchanges authorization code,
    fetches YouTube channel profile, checks multi-user uniqueness,
    encrypts credentials at rest, and saves/updates ConnectedChannel.
    """
    oauth_state = db.query(OAuthState).filter(OAuthState.state == state).first()
    if not oauth_state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OAuth state parameter.",
        )

    now = datetime.now(timezone.utc)
    # Ensure timezone-aware comparison
    expires_at = oauth_state.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < now:
        db.delete(oauth_state)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OAuth state has expired. Please initiate connection again.",
        )

    user_id = oauth_state.user_id
    code_verifier = oauth_state.code_verifier
    redirect_uri = oauth_state.redirect_uri

    # Consume state immediately (one-time use)
    db.delete(oauth_state)
    db.commit()

    # If current_user_id was explicitly provided, verify ownership of state
    if current_user_id and current_user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="State mismatch with authenticated user.",
        )

    # 1. Exchange code for Google tokens
    token_data = exchange_code_for_tokens(
        code=code,
        code_verifier=code_verifier,
        redirect_uri=redirect_uri,
    )
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 3600)
    scope = token_data.get("scope")
    token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google token response did not include an access token.",
        )

    # 2. Fetch YouTube Channel Profile
    channel_data = fetch_youtube_channel_profile(access_token)
    yt_channel_id = channel_data["id"]
    snippet = channel_data.get("snippet", {})
    stats = channel_data.get("statistics", {})

    title = snippet.get("title", "YouTube Channel")
    custom_url = snippet.get("customUrl")
    thumbnails = snippet.get("thumbnails", {})
    thumbnail_url = (
        thumbnails.get("medium", {}).get("url")
        or thumbnails.get("default", {}).get("url")
        or thumbnails.get("high", {}).get("url")
    )

    try:
        subscriber_count = int(stats.get("subscriberCount", 0) or 0)
    except (ValueError, TypeError):
        subscriber_count = 0

    try:
        video_count = int(stats.get("videoCount", 0) or 0)
    except (ValueError, TypeError):
        video_count = 0

    try:
        view_count = int(stats.get("viewCount", 0) or 0)
    except (ValueError, TypeError):
        view_count = 0

    # 3. Check Channel Uniqueness & Multi-user isolation
    # Rule: One external YouTube channel can belong to only one active application user.
    existing = (
        db.query(ConnectedChannel)
        .filter(ConnectedChannel.channel_id == yt_channel_id)
        .first()
    )

    encrypted_access = encrypt_token(access_token)
    encrypted_refresh = encrypt_token(refresh_token) if refresh_token else None

    if existing:
        if existing.user_id != user_id and existing.status == "connected":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="CHANNEL_ALREADY_CONNECTED",
            )

        # Update channel record
        existing.user_id = user_id
        existing.title = title
        existing.custom_url = custom_url
        existing.thumbnail_url = thumbnail_url
        existing.subscriber_count = subscriber_count
        existing.video_count = video_count
        existing.view_count = view_count
        existing.status = "connected"
        existing.encrypted_access_token = encrypted_access
        if encrypted_refresh:
            existing.encrypted_refresh_token = encrypted_refresh
        existing.token_expires_at = token_expires_at
        existing.scope = scope
        existing.last_synced_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(existing)
        target = existing
    else:
        # Create new ConnectedChannel
        new_channel = ConnectedChannel(
            user_id=user_id,
            platform="youtube",
            channel_id=yt_channel_id,
            title=title,
            custom_url=custom_url,
            thumbnail_url=thumbnail_url,
            subscriber_count=subscriber_count,
            video_count=video_count,
            view_count=view_count,
            encrypted_refresh_token=encrypted_refresh,
            encrypted_access_token=encrypted_access,
            token_expires_at=token_expires_at,
            scope=scope,
            status="connected",
            last_synced_at=datetime.now(timezone.utc),
        )
        db.add(new_channel)
        db.commit()
        db.refresh(new_channel)
        target = new_channel

    # Record initial snapshot
    record_channel_snapshot(
        db=db,
        channel_id=target.channel_id,
        subscriber_count=target.subscriber_count,
        video_count=target.video_count,
        view_count=target.view_count,
        sync_status="success",
    )

    # Sync initial recent videos
    try:
        sync_channel_videos_from_youtube(db=db, access_token=access_token, channel=target)
    except Exception as exc:
        logger.warning("Recent videos sync during OAuth callback error: %s", exc)

    return target


def refresh_access_token(db: Session, channel: ConnectedChannel) -> str:
    """
    Refreshes the YouTube access token using the encrypted refresh token stored at rest.
    Updates the database with the fresh encrypted access token and expiration.
    Handles invalid_grant, missing refresh tokens, decryption failures, and credential errors distinctly.
    """
    now = datetime.now(timezone.utc)
    if (
        channel.encrypted_access_token
        and channel.token_expires_at
        and (channel.token_expires_at.replace(tzinfo=timezone.utc) if channel.token_expires_at.tzinfo is None else channel.token_expires_at) > now + timedelta(minutes=2)
    ):
        try:
            return decrypt_token(channel.encrypted_access_token)
        except Exception as exc:
            logger.warning("Decryption of cached access token failed for channel %s: %s. Falling through to refresh.", channel.channel_id, exc)

    if not channel.encrypted_refresh_token:
        channel.status = "expired"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token available. Re-authentication required. Please reconnect your YouTube channel.",
        )

    try:
        refresh_token = decrypt_token(channel.encrypted_refresh_token)
    except Exception as exc:
        channel.status = "expired"
        db.commit()
        logger.error("Refresh token decryption failed for channel %s: %s", channel.channel_id, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Stored OAuth token could not be decrypted (encryption key mismatch). Re-authentication required. Please reconnect your YouTube channel.",
        )

    settings = get_settings()
    validate_google_oauth_credentials(settings)

    data = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(GOOGLE_TOKEN_URL, data=data)
            if resp.status_code != 200:
                channel.status = "expired"
                db.commit()
                err_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                err_code = err_data.get("error", "token_refresh_failed")
                err_desc = err_data.get("error_description", "")
                logger.warning(
                    "Token refresh failed for channel %s with status %s: error=%s, desc=%s",
                    channel.channel_id, resp.status_code, err_code, err_desc,
                )

                if err_code == "invalid_grant":
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="YouTube access has been revoked or the refresh token has expired (invalid_grant). Re-authentication required. Please reconnect your YouTube channel.",
                    )
                elif err_code == "invalid_client":
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Google OAuth client credentials rejected by Google (invalid_client). Please verify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env.",
                    )
                else:
                    detail_msg = f"OAuth token refresh failed ({err_code}: {err_desc}). Re-authentication required. Please reconnect your YouTube channel." if err_desc else "OAuth token refresh failed. Re-authentication required. Please reconnect your YouTube channel."
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail=detail_msg,
                    )

            token_data = resp.json()
            new_access_token = token_data.get("access_token")
            expires_in = token_data.get("expires_in", 3600)
            new_refresh_token = token_data.get("refresh_token")

            channel.encrypted_access_token = encrypt_token(new_access_token)
            channel.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
            if new_refresh_token:
                channel.encrypted_refresh_token = encrypt_token(new_refresh_token)
            if token_data.get("scope"):
                channel.scope = token_data.get("scope")
            channel.status = "connected"
            db.commit()
            db.refresh(channel)
            return new_access_token
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to reach Google OAuth service to refresh token.",
        ) from exc


get_valid_access_token = refresh_access_token


def disconnect_channel(db: Session, user: User) -> bool:
    """
    Disconnects the active YouTube channel for the user:
    - Revokes credentials with Google revoke endpoint where supported
    - Deletes stored encrypted credentials
    - Preserves historical channel metadata & metrics
    - Sets status to 'disconnected'
    """
    channel = (
        db.query(ConnectedChannel)
        .filter(ConnectedChannel.user_id == user.id, ConnectedChannel.status == "connected")
        .first()
    )
    if not channel:
        return True

    token_to_revoke = None
    if channel.encrypted_refresh_token:
        try:
            token_to_revoke = decrypt_token(channel.encrypted_refresh_token)
        except Exception:
            pass
    elif channel.encrypted_access_token:
        try:
            token_to_revoke = decrypt_token(channel.encrypted_access_token)
        except Exception:
            pass

    if token_to_revoke:
        try:
            with httpx.Client(timeout=10.0) as client:
                client.post(
                    GOOGLE_REVOKE_URL,
                    params={"token": token_to_revoke},
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
        except Exception as exc:
            logger.info("Google token revocation request error (ignored): %s", type(exc).__name__)

    # Wipe credentials while preserving historical metrics
    channel.encrypted_refresh_token = None
    channel.encrypted_access_token = None
    channel.token_expires_at = None
    channel.status = "disconnected"
    channel.last_synced_at = datetime.now(timezone.utc)
    db.commit()
    return True


def get_user_connected_channel(db: Session, user_id: str) -> Optional[ConnectedChannel]:
    """
    Retrieves the active connected channel for the given user.
    """
    return (
        db.query(ConnectedChannel)
        .filter(ConnectedChannel.user_id == user_id, ConnectedChannel.status == "connected")
        .first()
    )


def sync_channel_metrics(db: Session, user: User) -> ConnectedChannel:
    """
    Fetches latest subscriber count, video count, view count from YouTube Data API
    and updates the database record.
    """
    channel = get_user_connected_channel(db, user.id)
    if not channel:
        expired = (
            db.query(ConnectedChannel)
            .filter(ConnectedChannel.user_id == user.id, ConnectedChannel.status == "expired")
            .first()
        )
        if expired:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="YouTube channel authorization has expired. Re-authentication required. Please reconnect your YouTube channel.",
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No connected YouTube channel found.",
        )

    try:
        access_token = refresh_access_token(db, channel)
        channel_data = fetch_youtube_channel_profile(access_token)
    except Exception as exc:
        record_channel_snapshot(
            db=db,
            channel_id=channel.channel_id,
            subscriber_count=channel.subscriber_count,
            video_count=channel.video_count,
            view_count=channel.view_count,
            sync_status="failed",
            error_message=str(exc),
        )
        raise

    snippet = channel_data.get("snippet", {})
    stats = channel_data.get("statistics", {})

    channel.title = snippet.get("title", channel.title)
    channel.custom_url = snippet.get("customUrl", channel.custom_url)
    thumbnails = snippet.get("thumbnails", {})
    channel.thumbnail_url = (
        thumbnails.get("medium", {}).get("url")
        or thumbnails.get("default", {}).get("url")
        or channel.thumbnail_url
    )

    try:
        channel.subscriber_count = int(stats.get("subscriberCount", channel.subscriber_count))
    except (ValueError, TypeError):
        pass

    try:
        channel.video_count = int(stats.get("videoCount", channel.video_count))
    except (ValueError, TypeError):
        pass

    try:
        channel.view_count = int(stats.get("viewCount", channel.view_count))
    except (ValueError, TypeError):
        pass

    channel.last_synced_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(channel)

    # 1. Record historical channel snapshot with deduplication
    record_channel_snapshot(
        db=db,
        channel_id=channel.channel_id,
        subscriber_count=channel.subscriber_count,
        video_count=channel.video_count,
        view_count=channel.view_count,
        sync_status="success",
    )

    # 2. Sync recent video uploads from the channel uploads playlist
    try:
        sync_channel_videos_from_youtube(db=db, access_token=access_token, channel=channel)
    except Exception as exc:
        logger.warning("Recent videos sync failed for channel %s: %s", channel.channel_id, exc)

    return channel


def record_channel_snapshot(
    db: Session,
    channel_id: str,
    subscriber_count: int,
    video_count: int,
    view_count: int,
    sync_status: str = "success",
    error_message: Optional[str] = None,
    cooldown_minutes: int = 15,
) -> ChannelSnapshot:
    """
    Persists a historical telemetry snapshot for a channel.
    Deduplicates against the most recent snapshot if recorded within the cooldown window
    with identical metric counts.
    """
    now = datetime.now(timezone.utc)
    recent = (
        db.query(ChannelSnapshot)
        .filter(ChannelSnapshot.channel_id == channel_id)
        .order_by(ChannelSnapshot.snapshot_at.desc())
        .first()
    )

    if recent:
        cutoff = now - timedelta(minutes=cooldown_minutes)
        recent_tz = recent.snapshot_at if recent.snapshot_at.tzinfo else recent.snapshot_at.replace(tzinfo=timezone.utc)
        if (
            recent_tz >= cutoff
            and recent.view_count == view_count
            and recent.subscriber_count == subscriber_count
            and recent.video_count == video_count
            and recent.sync_status == sync_status
        ):
            # Identical metrics within cooldown window; skip creating redundant duplicate
            return recent

    snapshot = ChannelSnapshot(
        channel_id=channel_id,
        snapshot_at=now,
        subscriber_count=subscriber_count,
        video_count=video_count,
        view_count=view_count,
        sync_status=sync_status,
        error_message=error_message,
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


def sync_channel_videos_from_youtube(
    db: Session,
    access_token: str,
    channel: ConnectedChannel,
    max_results: int = 20,
) -> list[ChannelVideo]:
    """
    Discovers recent public uploads using the channel's uploads playlist
    and fetches video-level statistics from the official YouTube Data API.
    Upserts into the channel_videos table.
    """
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}

    # 1. Retrieve the uploads playlist ID
    uploads_playlist_id = None
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(
                YOUTUBE_CHANNELS_URL,
                headers=headers,
                params={"part": "contentDetails", "id": channel.channel_id},
            )
            if resp.status_code == 200:
                data = resp.json()
                items = data.get("items", [])
                if items:
                    uploads_playlist_id = (
                        items[0]
                        .get("contentDetails", {})
                        .get("relatedPlaylists", {})
                        .get("uploads")
                    )
    except Exception as exc:
        logger.warning("Could not fetch uploads playlist ID for %s: %s", channel.channel_id, type(exc).__name__)

    # Fallback to standard convention (replace 'UC' with 'UU') if API didn't return it
    if not uploads_playlist_id and channel.channel_id.startswith("UC"):
        uploads_playlist_id = "UU" + channel.channel_id[2:]

    if not uploads_playlist_id:
        logger.warning("No uploads playlist ID resolved for channel %s", channel.channel_id)
        return []

    # 2. Fetch playlist items (videos in playlist)
    video_snippets: dict[str, dict] = {}
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(
                YOUTUBE_PLAYLIST_ITEMS_URL,
                headers=headers,
                params={
                    "part": "snippet,contentDetails",
                    "playlistId": uploads_playlist_id,
                    "maxResults": min(max_results, 50),
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("items", []):
                    vid_id = (
                        item.get("contentDetails", {}).get("videoId")
                        or item.get("snippet", {}).get("resourceId", {}).get("videoId")
                    )
                    snippet = item.get("snippet", {})
                    title = snippet.get("title", "")
                    if not vid_id or title in ("Private video", "Deleted video"):
                        continue
                    pub_str = snippet.get("publishedAt")
                    thumbs = snippet.get("thumbnails", {})
                    thumb_url = (
                        thumbs.get("high", {}).get("url")
                        or thumbs.get("medium", {}).get("url")
                        or thumbs.get("default", {}).get("url")
                    )
                    video_snippets[vid_id] = {
                        "title": title,
                        "published_at": pub_str,
                        "thumbnail_url": thumb_url,
                    }
    except Exception as exc:
        logger.warning("Error fetching playlist items for %s: %s", uploads_playlist_id, type(exc).__name__)

    if not video_snippets:
        return []

    # 3. Batch fetch video statistics
    video_ids = list(video_snippets.keys())
    persisted_videos: list[ChannelVideo] = []
    now = datetime.now(timezone.utc)

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(
                YOUTUBE_VIDEOS_URL,
                headers=headers,
                params={
                    "part": "snippet,statistics",
                    "id": ",".join(video_ids),
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                for v_item in data.get("items", []):
                    vid_id = v_item.get("id")
                    if not vid_id or vid_id not in video_snippets:
                        continue

                    v_snippet = v_item.get("snippet", {})
                    v_stats = v_item.get("statistics", {})

                    title = v_snippet.get("title") or video_snippets[vid_id]["title"]
                    pub_raw = v_snippet.get("publishedAt") or video_snippets[vid_id]["published_at"]
                    try:
                        pub_dt = (
                            datetime.fromisoformat(pub_raw.replace("Z", "+00:00"))
                            if pub_raw
                            else now
                        )
                    except Exception:
                        pub_dt = now

                    thumbs = v_snippet.get("thumbnails", {})
                    thumb_url = (
                        thumbs.get("high", {}).get("url")
                        or thumbs.get("medium", {}).get("url")
                        or thumbs.get("default", {}).get("url")
                        or video_snippets[vid_id]["thumbnail_url"]
                    )

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

                    existing = (
                        db.query(ChannelVideo)
                        .filter(
                            ChannelVideo.channel_id == channel.channel_id,
                            ChannelVideo.video_id == vid_id,
                        )
                        .first()
                    )
                    if existing:
                        existing.title = title
                        existing.published_at = pub_dt
                        existing.thumbnail_url = thumb_url
                        existing.view_count = views
                        existing.like_count = likes
                        existing.comment_count = comments
                        existing.last_synced_at = now
                        persisted_videos.append(existing)
                    else:
                        new_vid = ChannelVideo(
                            channel_id=channel.channel_id,
                            video_id=vid_id,
                            title=title,
                            published_at=pub_dt,
                            thumbnail_url=thumb_url,
                            view_count=views,
                            like_count=likes,
                            comment_count=comments,
                            last_synced_at=now,
                        )
                        db.add(new_vid)
                        persisted_videos.append(new_vid)

                db.commit()
    except Exception as exc:
        logger.warning("Error fetching video statistics for channel %s: %s", channel.channel_id, type(exc).__name__)

    return persisted_videos


def get_channel_snapshots(
    db: Session,
    channel_id: str,
    days: int = 28,
) -> list[ChannelSnapshot]:
    """
    Returns channel telemetry snapshots ordered chronologically.
    Filters by the requested date range.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    return (
        db.query(ChannelSnapshot)
        .filter(
            ChannelSnapshot.channel_id == channel_id,
            ChannelSnapshot.snapshot_at >= cutoff,
        )
        .order_by(ChannelSnapshot.snapshot_at.asc())
        .all()
    )


def get_channel_videos(
    db: Session,
    channel_id: str,
    limit: int = 20,
) -> list[ChannelVideo]:
    """
    Returns recent channel videos ordered by published_at DESC.
    """
    return (
        db.query(ChannelVideo)
        .filter(ChannelVideo.channel_id == channel_id)
        .order_by(ChannelVideo.published_at.desc())
        .limit(limit)
        .all()
    )
