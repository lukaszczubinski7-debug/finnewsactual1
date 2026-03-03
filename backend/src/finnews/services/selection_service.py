from __future__ import annotations

from typing import Any

from finnews.clients.llm import LLMClient
from finnews.settings import settings


def _heuristic_pick(items: list[dict[str, Any]], k: int) -> list[dict[str, Any]]:
    # Prosta punktacja: tickery + metadane.
    def score(x: dict[str, Any]) -> int:
        s = 0
        s += 3 * len(x.get("tickers") or [])
        if x.get("provider"):
            s += 1
        if x.get("pubDate"):
            s += 1
        return s

    items_sorted = sorted(items, key=score, reverse=True)
    return items_sorted[: max(0, k)]


async def pick_top(items: list[dict[str, Any]], k: int, style: str = "krotko") -> list[dict[str, Any]]:
    # Fallback: bez klucza zawsze heurystyka.
    if not settings.openai_api_key:
        return _heuristic_pick(items, k)

    if not items:
        return []

    top_k = max(0, min(k, len(items)))
    if top_k == 0:
        return []

    # Do LLM trafiaja tylko znormalizowane dane z listy.
    llm_items = [
        {
            "id": x.get("id"),
            "title": x.get("title"),
            "provider": x.get("provider"),
            "pubDate": x.get("pubDate"),
            "tickers": x.get("tickers") or [],
            "isHosted": bool(x.get("isHosted")),
        }
        for x in items
        if x.get("id")
    ]
    if not llm_items:
        return _heuristic_pick(items, top_k)

    try:
        llm = LLMClient()
        selected_ids = await llm.pick_top_ids(llm_items, top_k)
    except Exception:
        return _heuristic_pick(items, top_k)

    by_id = {str(x.get("id")): x for x in items if x.get("id")}
    picked: list[dict[str, Any]] = []
    for news_id in selected_ids:
        item = by_id.get(str(news_id))
        if item and item not in picked:
            picked.append(item)
        if len(picked) >= top_k:
            break

    # Jeśli LLM zwroci puste/niepelne ID, domknij heurystyka.
    if len(picked) < top_k:
        fallback = _heuristic_pick(items, top_k)
        for item in fallback:
            if item not in picked:
                picked.append(item)
            if len(picked) >= top_k:
                break

    return picked[:top_k]
