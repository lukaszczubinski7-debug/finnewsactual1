from __future__ import annotations

import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from finnews.settings import settings

logger = logging.getLogger(__name__)

_SERPER_NEWS_URL = "https://google.serper.dev/news"

# Serper gl/hl params per query language tag
_LANG_TO_PARAMS: dict[str, dict[str, str]] = {
    "en-US": {"gl": "us", "hl": "en"},
    "en-GB": {"gl": "gb", "hl": "en"},
    "pl-PL": {"gl": "pl", "hl": "pl"},
    "de-DE": {"gl": "de", "hl": "de"},
    "fr-FR": {"gl": "fr", "hl": "fr"},
}

# tbs=qdr:d → past 24h; qdr:w → past week
_FRESHNESS_TBS = "qdr:d"

_RELATIVE_RE = re.compile(
    r"(\d+)\s+(second|minute|hour|day|week|month)s?\s+ago", re.IGNORECASE
)
_MONTH_NAMES = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _parse_serper_date(raw: str) -> str:
    """Convert Serper date string to ISO-8601 UTC string.

    Handles:
    - "2 hours ago", "1 day ago", "3 weeks ago"
    - "Mar 14, 2025", "14 Mar 2025"
    Returns empty string on failure.
    """
    if not raw:
        return ""
    now = datetime.now(UTC)

    # Try relative format first
    m = _RELATIVE_RE.search(raw)
    if m:
        value = int(m.group(1))
        unit = m.group(2).lower()
        delta_map = {
            "second": timedelta(seconds=value),
            "minute": timedelta(minutes=value),
            "hour": timedelta(hours=value),
            "day": timedelta(days=value),
            "week": timedelta(weeks=value),
            "month": timedelta(days=value * 30),
        }
        dt = now - delta_map.get(unit, timedelta(0))
        return dt.isoformat()

    # Try absolute: "Mar 14, 2025" or "14 Mar 2025"
    parts = re.split(r"[\s,]+", raw.strip())
    try:
        if len(parts) == 3:
            month_str = parts[0].lower()[:3]
            if month_str in _MONTH_NAMES:
                month, day, year = _MONTH_NAMES[month_str], int(parts[1]), int(parts[2])
            else:
                day, month_str2, year = int(parts[0]), parts[1].lower()[:3], int(parts[2])
                month = _MONTH_NAMES.get(month_str2, 0)
            if month:
                return datetime(year, month, day, tzinfo=UTC).isoformat()
    except (ValueError, KeyError):
        pass

    return ""


class SerperClient:
    """Google News via Serper.dev API.

    Disabled automatically when SERPER_API_KEY is not set.
    """

    @property
    def enabled(self) -> bool:
        return bool(settings.serper_api_key)

    async def search(
        self,
        query: str,
        *,
        count: int | None = None,
        lang: str = "en-US",
    ) -> list[dict[str, Any]]:
        """Return normalised Serper news articles for *query*.

        Each item has: title, link, snippet, date (ISO), source.
        Returns [] if not enabled or on any error.
        """
        if not self.enabled:
            return []

        effective_count = count or settings.serper_search_results_per_query
        lang_params = _LANG_TO_PARAMS.get(lang, {"gl": "us", "hl": "en"})

        payload: dict[str, Any] = {
            "q": query,
            "num": effective_count,
            "tbs": _FRESHNESS_TBS,
            **lang_params,
        }
        headers = {
            "X-API-KEY": settings.serper_api_key,
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=settings.serper_timeout_s) as client:
                resp = await client.post(_SERPER_NEWS_URL, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            logger.warning("serper query=%r error=%s", query, exc)
            return []

        raw_articles = data.get("news") or []
        articles = []
        for a in raw_articles:
            articles.append({
                "title": a.get("title") or "",
                "link": a.get("link") or "",
                "snippet": a.get("snippet") or "",
                "date": _parse_serper_date(a.get("date") or ""),
                "source": a.get("source") or "",
                "imageUrl": a.get("imageUrl") or "",
            })

        logger.info("serper query=%r lang=%s returned=%d", query, lang, len(articles))
        return articles
