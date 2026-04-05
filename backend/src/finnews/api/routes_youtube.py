from __future__ import annotations

import asyncio
import logging
import xml.etree.ElementTree as ET
from datetime import date as date_cls
from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from finnews.api.responses import utf8_json
from finnews.clients.youtube import extract_video_id
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


@router.get("/channel-videos")
async def get_channel_video_list(
    channel_id: str = Query(..., description="YouTube channel ID (UCxxxxxxxx)"),
    channel_name: str = Query("", description="Channel display name — improves Serper search"),
    date_from: str = Query("", description="Filter start date ISO (2026-03-16)"),
    date_to: str = Query("", description="Filter end date ISO (2026-03-20)"),
    max_videos: int = Query(20, ge=1, le=30),
) -> Any:
    """Fetch recent videos for a channel (RSS → Serper fallback). No auth required."""
    from finnews.settings import settings

    max_v = min(max_videos, 30)
    videos: list[dict] = []

    # Parse optional date range
    dt_from: date_cls | None = None
    dt_to: date_cls | None = None
    try:
        if date_from:
            dt_from = date_cls.fromisoformat(date_from)
        if date_to:
            dt_to = date_cls.fromisoformat(date_to)
    except ValueError:
        pass

    # Try YouTube RSS feed
    rss_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
    rss_ok = False
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(rss_url, headers={"User-Agent": "Mozilla/5.0"})
        if resp.status_code == 200:
            ns = {
                "atom": "http://www.w3.org/2005/Atom",
                "yt": "http://www.youtube.com/xml/schemas/2015",
            }
            root = ET.fromstring(resp.text)
            for entry in root.findall("atom:entry", ns):
                vid_id = entry.findtext("yt:videoId", default="", namespaces=ns) or ""
                title = entry.findtext("atom:title", default="", namespaces=ns) or ""
                published = entry.findtext("atom:published", default="", namespaces=ns) or ""
                pub_date = published[:10] if published else ""

                if pub_date and (dt_from or dt_to):
                    try:
                        d = date_cls.fromisoformat(pub_date)
                        if dt_from and d < dt_from:
                            continue
                        if dt_to and d > dt_to:
                            continue
                    except ValueError:
                        pass

                videos.append({
                    "title": title,
                    "url": f"https://www.youtube.com/watch?v={vid_id}",
                    "video_id": vid_id,
                    "published": pub_date,
                })
                if len(videos) >= max_v:
                    break
            rss_ok = bool(videos)
    except Exception as exc:
        logger.warning("channel-videos RSS error channel_id=%s: %s", channel_id, exc)

    # Serper fallback if RSS had no results
    if not rss_ok and getattr(settings, "serper_api_key", None):
        name_q = channel_name or channel_id
        search_q = f"{name_q} youtube site:youtube.com/watch"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.post(
                    "https://google.serper.dev/search",
                    json={"q": search_q, "num": max_v * 2},
                    headers={"X-API-KEY": settings.serper_api_key, "Content-Type": "application/json"},
                )
                r.raise_for_status()
                data = r.json()
            for item in (data.get("organic") or []):
                link = item.get("link", "")
                if "youtube.com/watch" in link or "youtu.be/" in link:
                    vid_id = extract_video_id(link) or ""
                    videos.append({
                        "title": item.get("title", ""),
                        "url": link,
                        "video_id": vid_id,
                        "published": item.get("date", ""),
                    })
                if len(videos) >= max_v:
                    break
        except Exception as exc:
            logger.warning("channel-videos Serper error: %s", exc)

    return utf8_json({"channel_id": channel_id, "channel_name": channel_name, "videos": videos})


@router.post("/channels/refresh")
async def refresh_channels(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    background_tasks.add_task(_svc.refresh_all_channels, db, current_user.id)
    return utf8_json({"status": "refreshing"})
