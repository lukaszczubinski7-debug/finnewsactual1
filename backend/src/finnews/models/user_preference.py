from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from finnews.db.base import Base


class UserPreference(Base):
    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    search_profile_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_style: Mapped[str | None] = mapped_column(String(255), nullable=True)
    interested_assets: Mapped[list[str] | dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    interested_regions: Mapped[list[str] | dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    interested_topics: Mapped[list[str] | dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user = relationship("User", back_populates="preference")
