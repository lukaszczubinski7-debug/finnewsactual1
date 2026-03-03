from __future__ import annotations
from typing import Any

from finnews.utils.text import normalize_text


def _extract_items(raw: dict[str, Any]) -> list[dict[str, Any]]:
    data = (raw or {}).get("data", {}) or {}
    stream = (data.get("main", {}) or {}).get("stream") or []
    if stream:
        return stream
    return data.get("contents") or []


def _extract_tickers(content: dict[str, Any]) -> list[str]:
    tickers: list[str] = []
    finance = content.get("finance", {}) or {}
    for ticker in finance.get("stockTickers") or []:
        symbol = (ticker or {}).get("symbol")
        if symbol:
            tickers.append(symbol)
    return tickers


def _normalize_item(item: dict[str, Any]) -> dict[str, Any]:
    content = (item or {}).get("content", {}) or {}
    provider = (content.get("provider") or {}).get("displayName") or ""
    click_url = (
        (content.get("clickThroughUrl") or {}).get("url")
        or (content.get("canonicalUrl") or {}).get("url")
    )

    return {
        "id": content.get("id") or item.get("id"),
        "title": normalize_text(content.get("title") or ""),
        "summary": normalize_text(content.get("summary") or ""),
        "provider": normalize_text(provider),
        "pubDate": content.get("pubDate"),
        "clickUrl": click_url,
        "tickers": _extract_tickers(content),
        "isHosted": bool(content.get("isHosted")),
    }


def normalize_list(raw: dict[str, Any], limit: int = 20) -> list[dict[str, Any]]:
    items = _extract_items(raw)

    out = [_normalize_item(item or {}) for item in items[: max(0, limit)]]

    # lekkie czyszczenie
    out = [x for x in out if x.get("id") and x.get("title")]
    return out
