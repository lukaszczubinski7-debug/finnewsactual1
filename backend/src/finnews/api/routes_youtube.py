from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from finnews.api.responses import utf8_json
from finnews.db.dependencies import get_db
from finnews.models.user import User
from finnews.schemas.youtube import (
    RefreshChannelsResponse,
    YoutubeChannelRequest,
    YoutubeChannelResponse,
    YoutubeSourceRequest,
    YoutubeSourceResponse,
)
from finnews.security import get_current_user
from finnews.services.youtube_service import YoutubeService

router = APIRouter(prefix="/youtube", tags=["youtube"])
logger = logging.getLogger(__name__)
_svc = YoutubeService()


def _source_to_resp(src: Any) -> dict:
    return {
        "id": src.id,
        "video_id": src.video_id,
        "video_url": src.video_url,
        "title": src.title,
        "channel_name": src.channel_name,
        "language": src.language,
        "summary": src.summary,
        "status": src.status,
        "error_msg": src.error_msg,
        "created_at": src.created_at.isoformat() if src.created_at else None,
        "processed_at": src.processed_at.isoformat() if src.processed_at else None,
        "channel_db_id": src.channel_db_id,
    }


def _channel_to_resp(ch: Any) -> dict:
    return {
        "id": ch.id,
        "channel_id": ch.channel_id,
        "channel_url": ch.channel_url,
        "name": ch.name,
        "last_fetched_at": ch.last_fetched_at.isoformat() if ch.last_fetched_at else None,
        "created_at": ch.created_at.isoformat() if ch.created_at else None,
    }


# ── Sources ──────────────────────────────────────────────────────────────────

@router.get("/sources")
async def list_sources(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    sources = _svc.get_sources(db, current_user.id)
    return utf8_json([_source_to_resp(s) for s in sources])


@router.post("/sources", status_code=status.HTTP_201_CREATED)
async def add_source(
    req: YoutubeSourceRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    try:
        src = _svc.add_source(db, current_user.id, req.video_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if src.status == "pending":
        background_tasks.add_task(_svc.process_source, db, src.id)

    return utf8_json(_source_to_resp(src), status_code=201)


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    deleted = _svc.delete_source(db, current_user.id, source_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Film nie znaleziony.")


# ── Channels ─────────────────────────────────────────────────────────────────

@router.get("/channels")
async def list_channels(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    channels = _svc.get_channels(db, current_user.id)
    return utf8_json([_channel_to_resp(c) for c in channels])


@router.post("/channels", status_code=status.HTTP_201_CREATED)
async def add_channel(
    req: YoutubeChannelRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    try:
        ch = await _svc.add_channel(db, current_user.id, req.channel_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Fetch latest videos in background
    background_tasks.add_task(_svc.refresh_channel, db, ch)
    return utf8_json(_channel_to_resp(ch), status_code=201)


@router.delete("/channels/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_channel(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    deleted = _svc.delete_channel(db, current_user.id, channel_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Kanał nie znaleziony.")


@router.post("/channels/refresh")
async def refresh_channels(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    background_tasks.add_task(_svc.refresh_all_channels, db, current_user.id)
    return utf8_json({"status": "refreshing"})
