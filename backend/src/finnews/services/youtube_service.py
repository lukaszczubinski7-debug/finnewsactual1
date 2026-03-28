from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from finnews.clients.youtube import (
    extract_video_id,
    fetch_channel_videos,
    get_transcript,
    resolve_channel_id,
)
from finnews.models.youtube_channel import YoutubeChannel
from finnews.models.youtube_source import YoutubeSource
from finnews.settings import settings

logger = logging.getLogger(__name__)

_SUMMARY_PROMPT = """Poniżej transkrypcja wideo YouTube. Napisz po polsku:
1. Ogólne podsumowanie w 2-3 zdaniach.
2. Najważniejsze punkty jako lista bullet points (5-8 punktów, zaczynające się od "• ").
Bądź zwięzły i konkretny. Nie dodawaj wstępu ani zakończenia — tylko podsumowanie i punkty."""


class YoutubeService:
    def __init__(self) -> None:
        self._llm = AsyncOpenAI(api_key=settings.openai_api_key)
        self._model = settings.openai_model

    # ── Sources (individual videos) ──────────────────────────────────────────

    def get_sources(self, db: Session, user_id: int) -> list[YoutubeSource]:
        return (
            db.query(YoutubeSource)
            .filter(YoutubeSource.user_id == user_id)
            .order_by(YoutubeSource.created_at.desc())
            .all()
        )

    def get_source(self, db: Session, user_id: int, source_id: int) -> YoutubeSource | None:
        return db.query(YoutubeSource).filter(
            YoutubeSource.id == source_id,
            YoutubeSource.user_id == user_id,
        ).first()

    def add_source(
        self,
        db: Session,
        user_id: int,
        video_url: str,
        channel_db_id: int | None = None,
        title: str | None = None,
        channel_name: str | None = None,
    ) -> YoutubeSource:
        video_id = extract_video_id(video_url)
        if not video_id:
            raise ValueError("Nieprawidłowy URL YouTube.")

        # Check for duplicate
        existing = db.query(YoutubeSource).filter(
            YoutubeSource.user_id == user_id,
            YoutubeSource.video_id == video_id,
        ).first()
        if existing:
            return existing

        src = YoutubeSource(
            user_id=user_id,
            video_id=video_id,
            video_url=f"https://www.youtube.com/watch?v={video_id}",
            title=title,
            channel_name=channel_name,
            channel_db_id=channel_db_id,
            status="pending",
        )
        db.add(src)
        db.commit()
        db.refresh(src)
        return src

    def delete_source(self, db: Session, user_id: int, source_id: int) -> bool:
        src = self.get_source(db, user_id, source_id)
        if not src:
            return False
        db.delete(src)
        db.commit()
        return True

    async def process_source(self, db: Session, source_id: int) -> None:
        """Fetch transcript + LLM summary. Updates status in DB."""
        src = db.query(YoutubeSource).filter(YoutubeSource.id == source_id).first()
        if not src or src.status not in ("pending",):
            return

        src.status = "processing"
        db.commit()

        try:
            # Run transcript fetch in thread (sync library)
            loop = asyncio.get_event_loop()
            transcript_text, lang = await loop.run_in_executor(
                None, lambda: get_transcript(src.video_id)
            )
            src.transcript = transcript_text[:50_000]  # cap at 50k chars
            src.language = lang

            # LLM summary
            summary = await self._summarize(transcript_text)
            src.summary = summary
            src.status = "ready"
            src.processed_at = datetime.now(UTC)
            logger.info("youtube: processed video_id=%s lang=%s", src.video_id, lang)

        except ValueError as e:
            src.status = "error"
            src.error_msg = str(e)
            logger.warning("youtube: error video_id=%s err=%s", src.video_id, e)
        except Exception as e:
            src.status = "error"
            src.error_msg = f"Nieoczekiwany błąd: {e}"
            logger.error("youtube: unexpected error video_id=%s err=%s", src.video_id, e)
        finally:
            db.commit()

    async def _summarize(self, transcript: str) -> str:
        # Truncate transcript to ~12k tokens (roughly 48k chars)
        truncated = transcript[:48_000]
        resp = await self._llm.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": "Jesteś analitykiem. Odpowiadasz po polsku."},
                {"role": "user", "content": f"{_SUMMARY_PROMPT}\n\nTRANSKRYPCJA:\n{truncated}"},
            ],
            temperature=0.3,
            max_tokens=800,
        )
        return (resp.choices[0].message.content or "").strip()

    # ── Channels ─────────────────────────────────────────────────────────────

    def get_channels(self, db: Session, user_id: int) -> list[YoutubeChannel]:
        return (
            db.query(YoutubeChannel)
            .filter(YoutubeChannel.user_id == user_id)
            .order_by(YoutubeChannel.created_at.desc())
            .all()
        )

    async def add_channel(self, db: Session, user_id: int, channel_url: str) -> YoutubeChannel:
        channel_id, name = await resolve_channel_id(channel_url)
        if not channel_id:
            raise ValueError("Nie udało się rozpoznać kanału YouTube. Sprawdź URL.")

        # Check duplicate
        existing = db.query(YoutubeChannel).filter(
            YoutubeChannel.user_id == user_id,
            YoutubeChannel.channel_id == channel_id,
        ).first()
        if existing:
            return existing

        ch = YoutubeChannel(
            user_id=user_id,
            channel_id=channel_id,
            channel_url=channel_url,
            name=name,
        )
        db.add(ch)
        db.commit()
        db.refresh(ch)
        return ch

    def delete_channel(self, db: Session, user_id: int, channel_db_id: int) -> bool:
        ch = db.query(YoutubeChannel).filter(
            YoutubeChannel.id == channel_db_id,
            YoutubeChannel.user_id == user_id,
        ).first()
        if not ch:
            return False
        db.delete(ch)
        db.commit()
        return True

    async def refresh_channel(self, db: Session, channel: YoutubeChannel) -> int:
        """Fetch latest videos from channel RSS, add new ones. Returns count of new videos added."""
        videos = await fetch_channel_videos(channel.channel_id)
        new_count = 0
        for v in videos:
            video_id = v["video_id"]
            existing = db.query(YoutubeSource).filter(
                YoutubeSource.user_id == channel.user_id,
                YoutubeSource.video_id == video_id,
            ).first()
            if existing:
                continue
            src = self.add_source(
                db,
                user_id=channel.user_id,
                video_url=f"https://www.youtube.com/watch?v={video_id}",
                channel_db_id=channel.id,
                title=v.get("title"),
                channel_name=channel.name,
            )
            new_count += 1
            # Process async (fire and forget, but limit concurrency)
            asyncio.create_task(self.process_source(db, src.id))  # type: ignore[arg-type]

        channel.last_fetched_at = datetime.now(UTC)
        db.commit()
        return new_count

    async def refresh_all_channels(self, db: Session, user_id: int) -> int:
        channels = self.get_channels(db, user_id)
        total = 0
        for ch in channels:
            total += await self.refresh_channel(db, ch)
        return total
