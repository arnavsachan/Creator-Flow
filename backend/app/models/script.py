import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


def generate_uuid() -> str:
    return str(uuid.uuid4())


class Script(Base):
    __tablename__ = "scripts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    topic: Mapped[str] = mapped_column(String(500), nullable=False)
    target_duration: Mapped[str] = mapped_column(String(50), default="8m 00s", nullable=False)
    tone: Mapped[str] = mapped_column(String(100), default="Conversational", nullable=False)
    audience_persona: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    hook_type: Mapped[str] = mapped_column(String(50), default="curiosity", nullable=False)
    hook_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    full_script: Mapped[str] = mapped_column(Text, nullable=False)
    estimated_retention_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pacing_breakdown: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", backref="scripts")
