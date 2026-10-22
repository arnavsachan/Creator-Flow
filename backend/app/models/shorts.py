import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ShortsJob(Base):
    __tablename__ = "shorts_jobs"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    owner_id: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    stored_path: Mapped[str] = mapped_column(
        String(1024),
        nullable=False,
    )
    size_bytes: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )
    duration_seconds: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )
    width: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    height: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="uploaded",
    )
    error_code: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    clips: Mapped[list["ShortsClip"]] = relationship(
        "ShortsClip",
        back_populates="job",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ShortsClip.created_at.desc()",
    )


class ShortsClip(Base):
    __tablename__ = "shorts_clips"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    job_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("shorts_jobs.id", ondelete="CASCADE"),
        nullable=False,
    )
    start_seconds: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )
    end_seconds: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )
    aspect: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="original",
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="queued",
    )
    error_code: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
    )
    output_path: Mapped[Optional[str]] = mapped_column(
        String(1024),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    job: Mapped["ShortsJob"] = relationship(
        "ShortsJob",
        back_populates="clips",
    )
