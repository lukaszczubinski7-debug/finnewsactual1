from __future__ import annotations

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from finnews.settings import settings

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _run_all_thread_refreshes() -> None:
    """Refresh all active threads for all users. Called by the scheduler."""
    # Import here to avoid circular imports at module load time
    from finnews.db.session import SessionLocal
    from finnews.models.thread import Thread
    from finnews.services.brief_service import BriefService, INTERNAL_SELECT_K
    from finnews.services.thread_service import ThreadService, REFRESH_WINDOW_HOURS

    ALL_CONTINENTS = ["NA", "EU", "AS", "ME", "SA", "AF", "OC"]
    thread_svc = ThreadService()
    brief_svc = BriefService()

    with SessionLocal() as db:
        threads = db.query(Thread).filter(Thread.status == "ready").all()

    if not threads:
        logger.info("scheduler: no active threads to refresh")
        return

    logger.info("scheduler: refreshing %d threads", len(threads))

    async def _fetch_sources(query: str, window_hours: int) -> list:
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
            logger.warning("scheduler: fetch_sources failed: %s", exc)
            return []

    sem = asyncio.Semaphore(3)

    async def _refresh_one(thread_id: int, name: str, extra_context: str | None, horizon_days: int) -> None:
        async with sem:
            query = name + (" " + extra_context if extra_context else "")
            window_hours = min(horizon_days * 24, 168)
            sources = await _fetch_sources(query, window_hours)
            with SessionLocal() as db:
                from finnews.models.thread import Thread as T
                thread = db.query(T).filter(T.id == thread_id).first()
                if thread:
                    try:
                        await thread_svc.refresh(db=db, thread=thread, brief_sources=sources)
                        logger.info("scheduler: refreshed thread_id=%d", thread_id)
                    except Exception as exc:
                        logger.warning("scheduler: thread_id=%d refresh failed: %s", thread_id, exc)

    tasks = [
        _refresh_one(t.id, t.name, t.extra_context, t.horizon_days)
        for t in threads
    ]
    await asyncio.gather(*tasks)
    logger.info("scheduler: done refreshing %d threads", len(threads))


def start_scheduler() -> None:
    global _scheduler
    if not settings.scheduler_enabled:
        logger.info("scheduler: disabled (SCHEDULER_ENABLED=false)")
        return

    _scheduler = AsyncIOScheduler()
    cron_parts = settings.scheduler_refresh_cron.split()
    if len(cron_parts) == 5:
        minute, hour, day, month, day_of_week = cron_parts
        trigger = CronTrigger(
            minute=minute, hour=hour, day=day, month=month, day_of_week=day_of_week
        )
    else:
        trigger = CronTrigger(hour=6, minute=0)  # fallback: 06:00 UTC daily

    _scheduler.add_job(_run_all_thread_refreshes, trigger=trigger, id="refresh_all_threads", replace_existing=True)
    _scheduler.start()
    logger.info("scheduler: started (cron=%s)", settings.scheduler_refresh_cron)


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("scheduler: stopped")
