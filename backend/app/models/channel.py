import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.snapshot import ChannelSnapshot
    from app.models.user import User
    from app.models.video import ChannelVideo


def generate_uuid() -> str:
    return str(uuid.uuid4())


class ConnectedChannel(Base):
    __tablename__ = "connected_channels"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    platform: Mapped[str] = mapped_column(String(50), default="youtube", nullable=False)
    channel_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        unique=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    custom_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    subscriber_count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    video_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    view_count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    # Securely encrypted tokens at rest (AES-128-CBC/Fernet)
    encrypted_refresh_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    encrypted_access_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    scope: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    status: Mapped[str] = mapped_column(String(50), default="connected", nullable=False)

    @property
    def has_analytics_scope(self) -> bool:
        if not self.scope:
            return False
        return "yt-analytics.readonly" in self.scope or "yt-analytics.monetary.readonly" in self.scope

    @property
    def has_youtube_data_scope(self) -> bool:
        if not self.scope:
            return False
        return "youtube.readonly" in self.scope or "https://www.googleapis.com/auth/youtube" in self.scope
    connected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    last_synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="channels")
    snapshots: Mapped[list["ChannelSnapshot"]] = relationship(
        "ChannelSnapshot",
        back_populates="channel",
        cascade="all, delete-orphan",
        order_by="ChannelSnapshot.snapshot_at.desc()",
    )
    videos: Mapped[list["ChannelVideo"]] = relationship(
        "ChannelVideo",
        back_populates="channel",
        cascade="all, delete-orphan",
        order_by="ChannelVideo.published_at.desc()",
    )
