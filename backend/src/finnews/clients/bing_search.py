from __future__ import annotations

import logging
from typing import Any

import httpx

from finnews.settings import settings

logger = logging.getLogger(__name__)

_MARKETS = {
    "NA": "en-US",
    "EU": "en-GB",
    "PL": "pl-PL",
    "ME": "ar-SA",
    "AS": "en-SG",
    "SA": "pt-BR",
    "AF": "en-ZA",
    "OC": "en-AU",
}


class BingSearchClient:
    """Bing News Search API v7 client.

    Disabled automatically when BING_SEARCH_API_KEY is not set.
    """

    @property
    def enabled(self) -> bool:
        return bool(settings.bing_search_api_key)

    async def search(
        self,
        query: str,
        *,
        count: int | None = None,
        market: str = "en-US",
        freshness: str = "Day",
    ) -> list[dict[str, Any]]:
        """Return raw Bing news articles for *query*.

        Returns [] if not enabled or on any error.
        """
        if not self.enabled:
            return []

        effective_count = count or settings.bing_search_results_per_query
        params: dict[str, Any] = {
            "q": query,
            "count": effective_count,
            "mkt": market,
            "freshness": freshness,
            "textFormat": "Raw",
            "safeSearch": "Off",
        }
        headers = {"Ocp-Apim-Subscription-Key": settings.bing_search_api_key}

        try:
            async with httpx.AsyncClient(timeout=settings.bing_search_timeout_s) as client:
                resp = await client.get(
                    settings.bing_search_endpoint,
                    params=params,
                    headers=headers,
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            logger.warning("bing_search query=%r error=%s", query, exc)
            return []

        articles = data.get("value") or []
        logger.info("bing_search query=%r market=%s returned=%d", query, market, len(articles))
        return articles
