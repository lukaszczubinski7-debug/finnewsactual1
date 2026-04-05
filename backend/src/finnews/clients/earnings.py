"""Scrape WSE earnings calendar from strefainwestorow.pl.

One HTTP request returns all upcoming report dates for every listed company.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import TypedDict

import httpx
from bs4 import BeautifulSoup
from cachetools import TTLCache

from finnews.settings import settings

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.5",
}

# Map Polish report type names -> normalised labels
_REPORT_TYPE_MAP: dict[str, str] = {
    "raport roczny": "annual",
    "raport półroczny": "semi-annual",
    "raport za i kwartał": "Q1",
    "raport za ii kwartał": "Q2",
    "raport za iii kwartał": "Q3",
    "raport za iv kwartał": "Q4",
}


class EarningsRaw(TypedDict):
    ticker: str
    company_name: str
    report_date: date
    report_type: str | None
    source_url: str


# 6-hour cache
_cache: TTLCache = TTLCache(maxsize=4, ttl=6 * 3600)


def _normalise_report_type(raw: str) -> str | None:
    return _REPORT_TYPE_MAP.get(raw.strip().lower())


def _parse_date(text: str) -> date | None:
    """Parse date string in various formats."""
    text = text.strip().replace("/", "-")
    for fmt in ("%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d", "%d-%m-%y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _parse_table(html: str, source_url: str) -> list[EarningsRaw]:
    """Extract earnings rows from strefainwestorow.pl HTML table."""
    soup = BeautifulSoup(html, "html.parser")

    # Find the main data table (skip any nav/layout tables)
    tables = soup.find_all("table")
    if not tables:
        logger.warning("earnings scraper: no tables found in HTML (len=%d)", len(html))
        return []

    # Use the largest table (most rows)
    table = max(tables, key=lambda t: len(t.find_all("tr")))
    all_trs = table.find_all("tr")
    logger.info("earnings scraper: found %d tables, using one with %d rows", len(tables), len(all_trs))

    rows: list[EarningsRaw] = []
    skipped = 0

    for tr in all_trs:
        cells = tr.find_all("td")
        if len(cells) < 5:
            continue

        short_name = cells[0].get_text(strip=True)
        ticker = cells[1].get_text(strip=True)
        date_text = cells[3].get_text(strip=True)
        report_raw = cells[4].get_text(strip=True)

        report_date = _parse_date(date_text)
        if not report_date:
            skipped += 1
            if skipped <= 3:
                logger.warning("earnings scraper: could not parse date '%s' for %s", date_text, ticker)
            continue
        if not ticker:
            continue

        # Shift weekend dates to Friday
        wd = report_date.weekday()  # 5=Sat, 6=Sun
        if wd == 5:
            report_date = report_date - timedelta(days=1)
        elif wd == 6:
            report_date = report_date - timedelta(days=2)

        rows.append(
            EarningsRaw(
                ticker=f"{ticker}.WA",
                company_name=short_name,
                report_date=report_date,
                report_type=_normalise_report_type(report_raw) or report_raw,
                source_url=source_url,
            )
        )

    if skipped:
        logger.warning("earnings scraper: skipped %d rows (unparseable dates)", skipped)

    logger.info("earnings scraper: parsed %d rows total", len(rows))
    if rows:
        dates = sorted(set(r["report_date"] for r in rows))
        logger.info("earnings scraper: date range %s .. %s", dates[0], dates[-1])

    return rows


async def scrape_wse_earnings(days_ahead: int = 90) -> list[EarningsRaw]:
    """Fetch WSE earnings calendar. Returns all upcoming report dates.

    Uses strefainwestorow.pl which lists ALL companies in one HTML table.
    """
    cache_key = "wse_all"
    if cache_key in _cache:
        logger.debug("earnings scraper: returning cached data (%d rows)", len(_cache[cache_key]))
        return _cache[cache_key]

    url = "https://strefainwestorow.pl/dane/raporty/lista-publikacji-raportow-okresowych/all"

    try:
        async with httpx.AsyncClient(
            timeout=settings.earnings_scrape_timeout_s,
            follow_redirects=True,
            headers=_HEADERS,
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text
            logger.info("earnings scraper: fetched %d bytes, status=%d", len(html), resp.status_code)
    except Exception as exc:
        logger.error("earnings scraper: fetch error url=%s error=%s", url, exc)
        return []

    all_rows = _parse_table(html, source_url=url)

    # Filter to only future dates within the window
    today = date.today()
    cutoff = today + timedelta(days=days_ahead)
    rows = [r for r in all_rows if today <= r["report_date"] <= cutoff]

    logger.info(
        "earnings scraper: %d total -> %d in window (today=%s, cutoff=%s)",
        len(all_rows), len(rows), today, cutoff,
    )

    _cache[cache_key] = rows
    return rows
