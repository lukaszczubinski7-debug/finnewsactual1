from __future__ import annotations

import logging
from datetime import date, timedelta

from sqlalchemy.orm import Session

from finnews.clients.earnings import scrape_wse_earnings
from finnews.models.earnings_event import EarningsEvent

logger = logging.getLogger(__name__)


class EarningsService:

    async def refresh_wse(self, db: Session) -> int:
        """Scrape WSE earnings calendar and replace all DB data.

        Strategy: delete all → deduplicate → bulk insert.
        Simple, safe, works on both SQLite and PostgreSQL.
        """
        raw_events = await scrape_wse_earnings(days_ahead=90)
        if not raw_events:
            logger.warning("earnings_service: scraper returned 0 events")
            return 0

        # Deduplicate by (ticker, report_date) — keep first occurrence
        seen: set[tuple[str, date]] = set()
        unique: list[dict] = []
        for raw in raw_events:
            key = (raw["ticker"], raw["report_date"])
            if key not in seen:
                seen.add(key)
                unique.append(raw)

        if len(unique) < len(raw_events):
            logger.info("earnings_service: deduped %d -> %d", len(raw_events), len(unique))

        # Clear and re-insert
        deleted = db.query(EarningsEvent).delete()
        logger.info("earnings_service: cleared %d old records", deleted)

        for raw in unique:
            db.add(
                EarningsEvent(
                    ticker=raw["ticker"],
                    company_name=raw["company_name"],
                    market="WSE",
                    report_date=raw["report_date"],
                    report_type=raw["report_type"],
                    source="strefainwestorow",
                    source_url=raw["source_url"],
                )
            )

        db.commit()
        logger.info("earnings_service: inserted %d WSE events", len(unique))
        return len(unique)

    def get_upcoming(
        self,
        db: Session,
        market: str | None = None,
        days: int = 14,
    ) -> list[EarningsEvent]:
        """Return upcoming earnings events sorted by date."""
        today = date.today()
        cutoff = today + timedelta(days=days)

        q = db.query(EarningsEvent).filter(
            EarningsEvent.report_date >= today,
            EarningsEvent.report_date <= cutoff,
        )
        if market:
            q = q.filter(EarningsEvent.market == market)

        return q.order_by(EarningsEvent.report_date, EarningsEvent.company_name).all()
