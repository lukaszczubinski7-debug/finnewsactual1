from __future__ import annotations

import logging
import re

import httpx
from bs4 import BeautifulSoup

from finnews.settings import settings

logger = logging.getLogger(__name__)

# Domains known to hard-block / paywall immediately — skip scraping, use snippet only
_PAYWALL_DOMAINS = frozenset(
    {
        "ft.com",
        "wsj.com",
        "bloomberg.com",
        "economist.com",
        "barrons.com",
        "seekingalpha.com",
        "morningstar.com",
    }
)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; FinNewsBot/1.0; +https://github.com/finnews)"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}


def _is_paywalled(url: str) -> bool:
    for domain in _PAYWALL_DOMAINS:
        if domain in url:
            return True
    return False


def _extract_text(html: str, max_chars: int) -> str:
    soup = BeautifulSoup(html, "html.parser")

    # Remove boilerplate
    for tag in soup(["script", "style", "nav", "header", "footer", "aside", "form"]):
        tag.decompose()

    # Prefer <article> body; fall back to all <p> tags
    article = soup.find("article")
    container = article if article else soup
    paragraphs = container.find_all("p")  # type: ignore[union-attr]
    text = " ".join(p.get_text(" ", strip=True) for p in paragraphs)

    # Collapse whitespace
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text[:max_chars]


async def scrape_article(url: str) -> str:
    """Fetch and extract plain text from *url*.

    Returns empty string on any error or if paywalled.
    """
    if _is_paywalled(url):
        logger.debug("scraper skip paywalled url=%s", url)
        return ""

    try:
        async with httpx.AsyncClient(
            timeout=settings.scraper_timeout_s,
            follow_redirects=True,
            headers=_HEADERS,
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text
    except Exception as exc:
        logger.debug("scraper fetch error url=%s error=%s", url, exc)
        return ""

    text = _extract_text(html, max_chars=settings.scraper_max_chars)
    logger.debug("scraper url=%s chars=%d", url, len(text))
    return text
