import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.channel import ConnectedChannel


def generate_uuid() -> str:
    return str(uuid.uuid4())


class ChannelSnapshot(Base):
    __tablename__ = "channel_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    channel_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("connected_channels.channel_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    subscriber_count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    video_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    view_count: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    sync_status: Mapped[str] = mapped_column(String(50), default="success", nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    channel: Mapped["ConnectedChannel"] = relationship("ConnectedChannel", back_populates="snapshots")
