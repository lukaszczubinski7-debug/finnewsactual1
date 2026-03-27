from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from finnews.models.usage_log import UsageLog
from finnews.settings import settings


def _count_today(db: Session, user_id: int, endpoint: str) -> int:
    start_of_day = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(UsageLog)
        .filter(
            UsageLog.user_id == user_id,
            UsageLog.endpoint == endpoint,
            UsageLog.created_at >= start_of_day,
        )
        .count()
    )


def _log_usage(db: Session, user_id: int, endpoint: str) -> None:
    db.add(UsageLog(user_id=user_id, endpoint=endpoint, created_at=datetime.now(UTC)))
    db.commit()


def _next_reset() -> str:
    return (
        (datetime.now(UTC) + timedelta(days=1))
        .replace(hour=0, minute=0, second=0, microsecond=0)
        .isoformat()
    )


def enforce_brief_limit(db: Session, user_id: int) -> None:
    """Call before generating a brief. Raises 429 when daily limit exceeded."""
    limit = settings.daily_brief_limit
    if limit <= 0:
        return
    count = _count_today(db, user_id, "brief")
    if count >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "daily_limit_exceeded",
                "endpoint": "brief",
                "limit": limit,
                "used": count,
                "resets_at": _next_reset(),
            },
        )
    _log_usage(db, user_id, "brief")


def enforce_thread_refresh_limit(db: Session, user_id: int) -> None:
    """Call before refreshing a thread. Raises 429 when daily limit exceeded."""
    limit = settings.daily_thread_refresh_limit
    if limit <= 0:
        return
    count = _count_today(db, user_id, "thread_refresh")
    if count >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "daily_limit_exceeded",
                "endpoint": "thread_refresh",
                "limit": limit,
                "used": count,
                "resets_at": _next_reset(),
            },
        )
    _log_usage(db, user_id, "thread_refresh")
