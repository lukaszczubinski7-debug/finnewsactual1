from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from finnews.db.base import Base


class PreGeneratedBrief(Base):
    __tablename__ = "pregenerated_briefs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    context: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    response_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="ready")
