from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from finnews.middleware.usage_limits import enforce_thread_refresh_limit
from finnews.api.responses import utf8_json
from finnews.api.schemas import (
    BriefResponse,
    ThreadCreateRequest,
    ThreadResponse,
    ThreadSuggestionResponse,
)
from finnews.db.dependencies import get_db
from finnews.models import Thread
from finnews.models.user import User
from finnews.security import get_current_user
from finnews.services.brief_service import BriefService, INTERNAL_SELECT_K
from finnews.services.thread_service import (
    ThreadService,
    MAX_THREADS_PER_USER,
    REFRESH_WINDOW_HOURS,
)

router = APIRouter(prefix="/threads", tags=["threads"])
thread_svc = ThreadService()
brief_svc = BriefService()
logger = logging.getLogger(__name__)

ALL_CONTINENTS = ["NA", "EU", "AS", "ME", "SA", "AF", "OC"]


def _thread_to_response(thread: Thread) -> dict[str, Any]:
    return {
        "id": thread.id,
        "name": thread.name,
        "assets": thread.assets,
        "horizon_days": thread.horizon_days,
        "extra_context": thread.extra_context,
        "status": thread.status,
        "new_events_count": thread.new_events_count,
        "context_snapshot": thread.context_snapshot,
        "created_at": thread.created_at.isoformat() if thread.created_at else None,
        "last_refreshed_at": thread.last_refreshed_at.isoformat() if thread.last_refreshed_at else None,
    }


async def _fetch_brief_sources(query: str, window_hours: int) -> list[dict[str, Any]]:
    try:
        result = await brief_svc.run(
            query=query,
            continents=ALL_CONTINENTS,
            window_hours=window_hours,
            style="mid",
            list_limit=30,
            select_k=INTERNAL_SELECT_K,
            summary_k=8,
        )
        return result.get("sources") or []
    except Exception as exc:
        logger.warning("Thread fetch_brief_sources failed: %s", exc)
        return []


@router.post("", response_model=ThreadResponse, status_code=status.HTTP_201_CREATED)
async def create_thread(
    req: ThreadCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    count = db.query(Thread).filter(Thread.user_id == current_user.id).count()
    if count >= MAX_THREADS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maksymalna liczba watkow ({MAX_THREADS_PER_USER}) osiagnieta.",
        )

    query = req.name + (" " + req.extra_context if req.extra_context else "")
    window_hours = min(req.horizon_days * 24, 168)
    sources = await _fetch_brief_sources(query, window_hours)

    thread = await thread_svc.initialize(
        db=db,
        user_id=current_user.id,
        name=req.name,
        assets=req.assets,
        horizon_days=req.horizon_days,
        extra_context=req.extra_context,
        brief_sources=sources,
    )
    return utf8_json(_thread_to_response(thread))


@router.get("", response_model=list[ThreadResponse])
def list_threads(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    threads = (
        db.query(Thread)
        .filter(Thread.user_id == current_user.id)
        .order_by(Thread.created_at.desc())
        .all()
    )
    return utf8_json([_thread_to_response(t) for t in threads])


@router.get("/{thread_id}", response_model=ThreadResponse)
def get_thread(
    thread_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    thread = db.query(Thread).filter(Thread.id == thread_id, Thread.user_id == current_user.id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Watek nie znaleziony.")
    return utf8_json(_thread_to_response(thread))


@router.post("/{thread_id}/refresh", response_model=ThreadResponse)
async def refresh_thread(
    thread_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    thread = db.query(Thread).filter(Thread.id == thread_id, Thread.user_id == current_user.id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Watek nie znaleziony.")

    enforce_thread_refresh_limit(db, current_user.id)

    query = thread.name + (" " + thread.extra_context if thread.extra_context else "")
    sources = await _fetch_brief_sources(query, REFRESH_WINDOW_HOURS)

    thread = await thread_svc.refresh(db=db, thread=thread, brief_sources=sources)
    return utf8_json(_thread_to_response(thread))


@router.post("/refresh-all")
async def refresh_all_threads(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    threads = db.query(Thread).filter(Thread.user_id == current_user.id).all()
    if not threads:
        return utf8_json({"refreshed": 0})

    async def _refresh_one(thread: Thread) -> None:
        query = thread.name + (" " + thread.extra_context if thread.extra_context else "")
        sources = await _fetch_brief_sources(query, REFRESH_WINDOW_HOURS)
        await thread_svc.refresh(db=db, thread=thread, brief_sources=sources)

    # Refresh up to 3 threads in parallel to avoid overloading APIs
    sem = asyncio.Semaphore(3)

    async def _guarded(thread: Thread) -> None:
        async with sem:
            try:
                await _refresh_one(thread)
            except Exception as exc:
                logger.warning("refresh_all: thread_id=%s failed: %s", thread.id, exc)

    await asyncio.gather(*[_guarded(t) for t in threads])
    return utf8_json({"refreshed": len(threads)})


@router.post("/suggest", response_model=ThreadSuggestionResponse)
async def suggest_thread(
    brief: BriefResponse,
    current_user: User = Depends(get_current_user),  # noqa: ARG001
) -> Any:
    result = await thread_svc.suggest(brief_result=brief.model_dump())
    if result:
        return utf8_json(
            {
                "suggest": True,
                "name": result.get("name"),
                "assets": result.get("assets"),
                "horizon_days": result.get("horizon_days", 30),
                "reason": result.get("reason"),
            }
        )
    return utf8_json({"suggest": False})


@router.delete("/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_thread(
    thread_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    thread = db.query(Thread).filter(Thread.id == thread_id, Thread.user_id == current_user.id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Watek nie znaleziony.")
    db.delete(thread)
    db.commit()
