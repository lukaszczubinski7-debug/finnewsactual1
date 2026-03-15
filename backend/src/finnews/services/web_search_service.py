from __future__ import annotations

"""Web search enrichment service.

Fetches news via Bing News Search API, optionally scrapes article text,
and normalises results to the same item dict format used by the Axesso pipeline.

Disabled automatically when BING_SEARCH_API_KEY is not configured.
"""

import asyncio
import hashlib
import logging
from typing import Any

from finnews.clients.bing_search import BingSearchClient
from finnews.clients.scraper import scrape_article
from finnews.settings import settings

logger = logging.getLogger(__name__)

# Maximum articles to scrape concurrently to avoid hammering remote servers
_SCRAPE_CONCURRENCY = 4

# Bing freshness values: Day | Week | Month
_DEFAULT_FRESHNESS = "Day"

# How many Bing queries to fire per brief request (one per language/angle)
_QUERIES_COUNT = 3


def _build_queries(query: str | None) -> list[tuple[str, str]]:
    """Return list of (search_query, bing_market) tuples.

    Generates a small set of complementary queries so the brief
    captures both English-language global news and regional angles.
    """
    if not query or not query.strip():
        # Generic financial news sweep when no specific query
        return [
            ("financial markets news today", "en-US"),
            ("geopolitical market risk today", "en-US"),
            ("global economy latest news", "en-GB"),
        ]

    q = query.strip()
    return [
        (q, "en-US"),
        (f"{q} news", "en-GB"),
        (f"{q} rynek finanse", "pl-PL"),
    ][:_QUERIES_COUNT]


def _bing_article_to_item(article: dict[str, Any], scraped_text: str) -> dict[str, Any]:
    """Convert a raw Bing article dict to the normalised item format."""
    url = article.get("url") or ""
    name = article.get("name") or ""
    description = article.get("description") or ""
    provider_list = article.get("provider") or []
    provider_name = provider_list[0].get("name", "") if provider_list else ""
    date_published = article.get("datePublished") or ""

    # Use scraped text as body when available, otherwise fall back to description
    body = scraped_text.strip() if scraped_text.strip() else description

    # Stable ID from URL
    item_id = hashlib.md5(url.encode()).hexdigest()[:16]  # noqa: S324

    return {
        "id": item_id,
        "title": name,
        "summary": body,
        "provider": provider_name,
        "pubDate": date_published,
        "clickUrl": url,
        "url": url,
        "_source": "bing",
    }


class WebSearchService:
    def __init__(self) -> None:
        self.client = BingSearchClient()

    @property
    def enabled(self) -> bool:
        return self.client.enabled

    async def fetch_items(self, query: str | None) -> list[dict[str, Any]]:
        """Return normalised news items from Bing + optional scraping.

        Returns [] when BING_SEARCH_API_KEY is not set.
        """
        if not self.enabled:
            return []

        queries = _build_queries(query)

        # Fire all Bing searches in parallel
        search_tasks = [
            self.client.search(
                q,
                count=settings.bing_search_results_per_query,
                market=market,
                freshness=_DEFAULT_FRESHNESS,
            )
            for q, market in queries
        ]
        results = await asyncio.gather(*search_tasks, return_exceptions=True)

        # Deduplicate by URL
        seen_urls: set[str] = set()
        unique_articles: list[dict[str, Any]] = []
        for result in results:
            if isinstance(result, Exception):
                logger.warning("web_search_service bing error: %s", result)
                continue
            for article in result:
                url = article.get("url") or ""
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    unique_articles.append(article)

        logger.info("web_search_service unique_articles=%d", len(unique_articles))

        # Scrape article text concurrently (limited concurrency)
        sem = asyncio.Semaphore(_SCRAPE_CONCURRENCY)

        async def _scrape(article: dict[str, Any]) -> tuple[dict[str, Any], str]:
            url = article.get("url") or ""
            async with sem:
                text = await scrape_article(url) if url else ""
            return article, text

        scrape_results = await asyncio.gather(
            *[_scrape(a) for a in unique_articles],
            return_exceptions=True,
        )

        items: list[dict[str, Any]] = []
        for res in scrape_results:
            if isinstance(res, Exception):
                continue
            article, scraped_text = res
            items.append(_bing_article_to_item(article, scraped_text))

        logger.info("web_search_service items_ready=%d", len(items))
        return items
