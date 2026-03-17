from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from finnews.clients.llm import LLMClient
from finnews.models.thread import Thread

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts"
PROMPT_THREAD_INIT = "thread_init.md"
PROMPT_THREAD_REFRESH = "thread_refresh.md"
PROMPT_THREAD_SUGGEST = "thread_suggest.md"
PROMPT_THREAD_VERIFY = "thread_verify.md"

VALID_HORIZON_DAYS = {7, 30, 90}
MAX_THREADS_PER_USER = 20
REFRESH_WINDOW_HOURS = 72


def _load_prompt(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8")


def _sources_for_prompt(sources: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [
        {
            "title": str(s.get("title") or ""),
            "summary": str(s.get("summary") or ""),
            "publisher": str(s.get("provider") or s.get("publisher") or ""),
            "published_at": str(s.get("published_at") or s.get("pubDate") or ""),
            "url": str(s.get("url") or s.get("clickUrl") or ""),
        }
        for s in sources
        if s.get("title")
    ]


class ThreadService:
    def __init__(self) -> None:
        self.llm = LLMClient()

    async def initialize(
        self,
        *,
        db: Session,
        user_id: int,
        name: str,
        assets: str | None,
        horizon_days: int,
        extra_context: str | None,
        brief_sources: list[dict[str, Any]],
    ) -> Thread:
        """Create a new thread, run LLM init, save to DB."""
        if horizon_days not in VALID_HORIZON_DAYS:
            horizon_days = 30

        thread = Thread(
            user_id=user_id,
            name=name.strip(),
            assets=(assets or "").strip() or None,
            horizon_days=horizon_days,
            extra_context=(extra_context or "").strip() or None,
            status="initializing",
            new_events_count=0,
            context_snapshot=None,
            created_at=datetime.now(UTC),
        )
        db.add(thread)
        db.commit()
        db.refresh(thread)

        try:
            snapshot = await self._generate_init_snapshot(
                name=name,
                assets=assets,
                extra_context=extra_context,
                sources=brief_sources,
            )
            thread.context_snapshot = snapshot
            thread.status = "ready"
            thread.last_refreshed_at = datetime.now(UTC)
        except Exception as exc:
            logger.warning("Thread init LLM failed thread_id=%s error=%s", thread.id, exc)
            thread.status = "ready"
            thread.context_snapshot = {"error": "Nie udalo sie wygenerowac snapshotu. Sprobuj odswiezenia."}

        db.commit()
        db.refresh(thread)
        return thread

    async def refresh(self, *, db: Session, thread: Thread, brief_sources: list[dict[str, Any]]) -> Thread:
        """Update thread with new sources, run LLM diff, save."""
        thread.status = "refreshing"
        db.commit()

        try:
            new_snapshot = await self._generate_refresh_snapshot(
                existing_snapshot=thread.context_snapshot or {},
                thread_name=thread.name,
                new_sources=brief_sources,
            )
            new_events = len(new_snapshot.get("latest_developments", []))
            thread.context_snapshot = new_snapshot
            thread.new_events_count = new_events
            thread.last_refreshed_at = datetime.now(UTC)
            thread.status = "ready"
        except Exception as exc:
            logger.warning("Thread refresh LLM failed thread_id=%s error=%s", thread.id, exc)
            thread.status = "ready"

        db.commit()
        db.refresh(thread)
        return thread

    async def suggest(self, *, brief_result: dict[str, Any]) -> dict[str, Any] | None:
        """Return a thread suggestion from a brief result, or None."""
        summary = brief_result.get("summary") or {}
        sources = brief_result.get("sources") or []
        if not sources:
            return None

        prompt_sources = _sources_for_prompt(sources)[:8]
        payload = {
            "headline": summary.get("headline", ""),
            "items": summary.get("items", [])[:4],
            "sources": prompt_sources,
        }

        system = _load_prompt(PROMPT_THREAD_SUGGEST)
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ]
        try:
            raw = await self.llm.complete(messages, temperature=0.0)
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            result = json.loads(raw)
            if isinstance(result, dict) and result.get("suggest"):
                return result
            return None
        except Exception as exc:
            logger.warning("Thread suggest LLM failed: %s", exc)
            return None

    async def _verify_snapshot(self, snapshot: dict[str, Any]) -> dict[str, Any]:
        """Run a lightweight LLM quality-check pass on the snapshot.

        Uses gpt-4.1-mini for speed and cost. On any error, returns the
        original snapshot unchanged so the pipeline never hard-fails.
        """
        user_content = json.dumps(
            {
                "today": datetime.now(UTC).strftime("%Y-%m-%d"),
                "snapshot": snapshot,
            },
            ensure_ascii=False,
        )
        system = _load_prompt(PROMPT_THREAD_VERIFY)
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ]
        try:
            raw = await self.llm.complete(messages, temperature=0.0)
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            result = json.loads(raw)
            issues = result.get("issues_found", [])
            if issues:
                logger.info("Thread verify fixed %d issue(s): %s", len(issues), issues)
            return result.get("snapshot", snapshot)
        except Exception as exc:
            logger.warning("Thread verify failed (using original snapshot): %s", exc)
            return snapshot

    async def _generate_init_snapshot(
        self,
        *,
        name: str,
        assets: str | None,
        extra_context: str | None,
        sources: list[dict[str, Any]],
    ) -> dict[str, Any]:
        prompt_sources = _sources_for_prompt(sources)
        user_content = json.dumps(
            {
                "today": datetime.now(UTC).strftime("%Y-%m-%d"),
                "thread_name": name,
                "tracked_assets": assets or "",
                "user_context": extra_context or "",
                "sources": prompt_sources,
            },
            ensure_ascii=False,
        )
        system = _load_prompt(PROMPT_THREAD_INIT)
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ]
        raw = await self.llm.complete(messages, temperature=0.1)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        snapshot = json.loads(raw)
        return await self._verify_snapshot(snapshot)

    async def _generate_refresh_snapshot(
        self,
        *,
        existing_snapshot: dict[str, Any],
        thread_name: str,
        new_sources: list[dict[str, Any]],
    ) -> dict[str, Any]:
        prompt_sources = _sources_for_prompt(new_sources)
        user_content = json.dumps(
            {
                "today": datetime.now(UTC).strftime("%Y-%m-%d"),
                "thread_name": thread_name,
                "existing_snapshot": existing_snapshot,
                "new_sources": prompt_sources,
            },
            ensure_ascii=False,
        )
        system = _load_prompt(PROMPT_THREAD_REFRESH)
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ]
        raw = await self.llm.complete(messages, temperature=0.1)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        updated = json.loads(raw)
        # Ensure new_events_count is int
        updated["new_events_count"] = int(updated.get("new_events_count") or 0)
        return await self._verify_snapshot(updated)
