from __future__ import annotations

from typing import Any

from bs4 import BeautifulSoup

from finnews.utils.text import normalize_text


def extract_text_from_markup(markup: str) -> str:
    if not markup:
        return ""

    soup = BeautifulSoup(markup, "html.parser")
    text = soup.get_text(separator="\n")
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def _limit_text(text: str, max_chars: int) -> str:
    if not max_chars or len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip()


def normalize_details(raw: dict[str, Any], max_body_chars: int = 4000) -> dict[str, Any]:
    contents = (raw.get("data", {}) or {}).get("contents") or []
    if not contents:
        return {}

    content = (contents[0] or {}).get("content", {}) or {}

    tickers = []
    fin = content.get("finance", {}) or {}
    for ticker in (fin.get("stockTickers") or []):
        symbol = (ticker or {}).get("symbol")
        if symbol:
            tickers.append(symbol)

    body = content.get("body") or {}
    markup = body.get("markup") or ""
    plain_body_text = _limit_text(normalize_text(extract_text_from_markup(markup)), max_body_chars)

    canonical = (content.get("canonicalUrl") or {}).get("url")
    click = (content.get("clickThroughUrl") or {}).get("url")

    return {
        "id": content.get("id"),
        "title": normalize_text(content.get("title") or ""),
        "provider": normalize_text((content.get("provider") or {}).get("displayName") or ""),
        "pubDate": content.get("pubDate"),
        "summary": normalize_text(content.get("summary") or ""),
        "tickers": tickers,
        "url": canonical or click,
        "bodyText": plain_body_text,
    }
