from __future__ import annotations

import json
from typing import Any

from finnews.errors import NewsDataParsingError
from finnews.utils.text import normalize_text

PathPart = str | int

_LIST_PATHS: list[list[PathPart]] = [
    ["data", "main", "stream"],
    ["data", "contents"],
    ["data", "stream"],
    ["data", "items"],
    ["data", "result"],
    ["data", "news"],
    ["data", "articles"],
    ["data", "main", "results"],
    ["data", "response", "results"],
    ["data", "data"],
    ["data", "main", "data", "stream"],
    ["data", "main", "data", "contents"],
    ["data", "finance", "result"],
    ["data", "finance", "result", 0, "news"],
    ["data", "finance", "result", 0, "stream"],
    ["data", "finance", "result", 0, "articles"],
    ["data", "quoteResponse", "result"],
    ["data", "quoteResponse", "result", 0, "news"],
]
_SECRET_KEY_MARKERS = ("key", "token", "authorization")


def _is_secret_key(key: str) -> bool:
    lowered = key.lower()
    return any(marker in lowered for marker in _SECRET_KEY_MARKERS)


def _mask_secrets(value: Any) -> Any:
    if isinstance(value, dict):
        masked: dict[str, Any] = {}
        for key, nested in value.items():
            str_key = str(key)
            if _is_secret_key(str_key):
                masked[str_key] = "***"
                continue
            masked[str_key] = _mask_secrets(nested)
        return masked
    if isinstance(value, list):
        return [_mask_secrets(item) for item in value[:20]]
    return value


def _safe_json_prefix(value: Any, *, limit: int = 800) -> str:
    try:
        dumped = json.dumps(_mask_secrets(value), ensure_ascii=False, default=str)
    except Exception:
        dumped = str(value)
    return dumped[:limit]


def _node_keys(node: Any) -> list[str] | None:
    if isinstance(node, dict):
        return [str(key) for key in node.keys()]
    return None


def _resolve_path(node: Any, path: list[PathPart]) -> tuple[Any, bool]:
    current = node
    for part in path:
        if isinstance(part, str):
            if isinstance(current, dict) and part in current:
                current = current[part]
                continue
            return None, False
        if isinstance(part, int):
            if isinstance(current, list) and 0 <= part < len(current):
                current = current[part]
                continue
            return None, False
        return None, False
    return current, True


def _path_to_str(path: list[PathPart]) -> str:
    rendered: list[str] = []
    for part in path:
        if isinstance(part, int):
            rendered.append(f"[{part}]")
            continue
        if not rendered:
            rendered.append(part)
            continue
        rendered.append(f".{part}")
    return "".join(rendered)


def _looks_like_news_item(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    if isinstance(item.get("content"), dict):
        return True
    return any(key in item for key in ("title", "summary", "clickThroughUrl", "canonicalUrl"))


def _looks_like_news_list(node: list[Any]) -> bool:
    if not node:
        return False
    sample = node[:3]
    return any(_looks_like_news_item(item) for item in sample)


def find_first_list(data: dict[str, Any], paths: list[list[PathPart]]) -> tuple[list[Any] | None, str | None]:
    for path in paths:
        node, ok = _resolve_path(data, path)
        if ok and isinstance(node, list) and _looks_like_news_list(node):
            return node, _path_to_str(path)
    return None, None


def find_list_and_path(raw: Any) -> tuple[list[Any] | None, str | None, dict[str, Any]]:
    payload = raw if isinstance(raw, dict) else {}
    data = payload.get("data") if isinstance(payload, dict) else None
    sample_data_keys_deep: dict[str, list[str] | None] = {}

    for branch in (["data", "main"], ["data", "news"], ["data", "result"]):
        node, ok = _resolve_path(payload, branch)
        if ok:
            sample_data_keys_deep[_path_to_str(branch)] = _node_keys(node)

    items, used_path = find_first_list(payload, _LIST_PATHS)
    if items is None and isinstance(data, list):
        items = data
        used_path = "data(list)"

    meta_debug = {
        "top_level_keys": [str(key) for key in payload.keys()],
        "data_type": type(data).__name__,
        "data_keys": _node_keys(data),
        "sample_data_keys_deep": sample_data_keys_deep,
        "sample_json_prefix": _safe_json_prefix(payload),
    }
    return items, used_path, meta_debug


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


def normalize_items(items: list[Any], limit: int = 20) -> list[dict[str, Any]]:
    normalized_items = [_normalize_item((item or {}) if isinstance(item, dict) else {}) for item in items[: max(0, limit)]]
    return [item for item in normalized_items if item.get("id") and item.get("title")]


def normalize_list_with_debug(raw: dict[str, Any], limit: int = 20) -> dict[str, Any]:
    items, source_path, meta_debug = find_list_and_path(raw)
    if not items:
        raise NewsDataParsingError(
            "No news list found in upstream payload",
            detail_payload={
                "message": "No news list found in upstream payload",
                "debug": meta_debug,
            },
        )
    normalized_items = normalize_items(items, limit=limit)
    return {
        "items": normalized_items,
        "raw_count": len(items),
        "normalized_count": len(normalized_items),
        "source_path": source_path,
        "meta_debug": meta_debug,
    }


def normalize_list(raw: dict[str, Any], limit: int = 20) -> list[dict[str, Any]]:
    return normalize_list_with_debug(raw, limit=limit)["items"]
