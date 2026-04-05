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


async def _refresh_earnings_data() -> None:
    """Refresh earnings calendar data from strefainwestorow.pl."""
    from finnews.db.session import SessionLocal
    from finnews.services.earnings_service import EarningsService

    svc = EarningsService()
    try:
        with SessionLocal() as db:
            count = await svc.refresh_wse(db)
        logger.info("scheduler: refreshed %d earnings events", count)
    except Exception as exc:
        logger.error("scheduler: earnings refresh failed: %s", exc)


PREGEN_CONTEXTS = ["Technologia", "Makro", "Geopolityka"]


async def _generate_pregenerated_briefs() -> None:
    """Generate pre-computed briefs for all users (public, no auth)."""
    from finnews.db.session import SessionLocal
    from finnews.models.pregenerated_brief import PreGeneratedBrief
    from finnews.services.brief_service import BriefService

    svc = BriefService()

    for ctx in PREGEN_CONTEXTS:
        try:
            logger.info("scheduler: generating pre-gen brief context=%s", ctx)
            svc._brief_cache.clear()
            result = await svc.run(
                region=None,
                tickers=None,
                query=None,
                list_limit=30,
                summary_k=5,
                style="mid",
                continents=["NA", "EU", "AS", "ME", "SA", "AF", "OC"],
                context=ctx,
                window_hours=72,
                sources_trust_level=0.3,
            )

            with SessionLocal() as db:
                from datetime import datetime, timezone
                now = datetime.now(timezone.utc)
                existing = db.query(PreGeneratedBrief).filter_by(context=ctx).first()
                if existing:
                    existing.response_payload = result
                    existing.generated_at = now
                    existing.status = "ready"
                else:
                    db.add(PreGeneratedBrief(
                        context=ctx,
                        response_payload=result,
                        generated_at=now,
                        status="ready",
                    ))
                db.commit()
            logger.info("scheduler: pre-gen brief OK context=%s", ctx)
        except Exception as exc:
            logger.error("scheduler: pre-gen brief FAILED context=%s error=%s", ctx, exc)

    logger.info("scheduler: finished generating %d pre-gen briefs", len(PREGEN_CONTEXTS))


async def generate_pregenerated_if_empty() -> None:
    """Generate briefs on startup if DB is empty."""
    from finnews.db.session import SessionLocal
    from finnews.models.pregenerated_brief import PreGeneratedBrief

    with SessionLocal() as db:
        count = db.query(PreGeneratedBrief).count()

    if count < len(PREGEN_CONTEXTS):
        logger.info("scheduler: DB has %d pre-gen briefs, generating...", count)
        await _generate_pregenerated_briefs()
    else:
        logger.info("scheduler: %d pre-gen briefs already in DB, skipping startup gen", count)


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

    # Earnings calendar refresh (default: 07:00 UTC = 09:00 CET)
    earnings_parts = settings.earnings_refresh_cron.split()
    if len(earnings_parts) == 5:
        e_min, e_hour, e_day, e_month, e_dow = earnings_parts
        earnings_trigger = CronTrigger(
            minute=e_min, hour=e_hour, day=e_day, month=e_month, day_of_week=e_dow
        )
    else:
        earnings_trigger = CronTrigger(hour=7, minute=0)
    _scheduler.add_job(_refresh_earnings_data, trigger=earnings_trigger, id="refresh_earnings", replace_existing=True)

    # Pre-generated briefs refresh (default: every 4h)
    pregen_parts = settings.pregen_briefs_cron.split()
    if len(pregen_parts) == 5:
        p_min, p_hour, p_day, p_month, p_dow = pregen_parts
        pregen_trigger = CronTrigger(
            minute=p_min, hour=p_hour, day=p_day, month=p_month, day_of_week=p_dow
        )
    else:
        pregen_trigger = CronTrigger(hour="*/4", minute=15)
    _scheduler.add_job(_generate_pregenerated_briefs, trigger=pregen_trigger, id="gen_pregenerated_briefs", replace_existing=True)

    _scheduler.start()
    logger.info("scheduler: started (threads_cron=%s, earnings_cron=%s)", settings.scheduler_refresh_cron, settings.earnings_refresh_cron)


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("scheduler: stopped")
