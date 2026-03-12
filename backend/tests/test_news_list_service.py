from __future__ import annotations

import pytest

from finnews.errors import NewsDataParsingError
from finnews.services.news_list_service import NewsListService


class _ClientStub:
    def __init__(self, payload: object) -> None:
        self.payload = payload

    async def list_news(self, **_: object) -> object:
        return self.payload


@pytest.mark.anyio
async def test_fetch_normalized_raises_with_upstream_error_fields_hint_when_empty() -> None:
    payload = {"message": "Unauthorized", "status": "401", "error": "invalid key"}
    service = NewsListService(_ClientStub(payload))  # type: ignore[arg-type]

    with pytest.raises(NewsDataParsingError) as exc_info:
        await service.fetch_normalized(s="war", region="US", limit=10)

    message = str(exc_info.value)
    assert "No news list found in upstream payload" in message
    detail_payload = exc_info.value.detail_payload or {}
    assert detail_payload.get("message") == "No news list found in upstream payload"
    debug = detail_payload.get("debug", {})
    assert "top_level_keys" in debug
    assert debug.get("top_level_keys") == ["message", "status", "error"]


@pytest.mark.anyio
async def test_fetch_normalized_raises_with_top_level_keys_hint_when_schema_unknown() -> None:
    payload = {"foo": {"nested": 1}, "bar": [1, 2], "ok": True}
    service = NewsListService(_ClientStub(payload))  # type: ignore[arg-type]

    with pytest.raises(NewsDataParsingError) as exc_info:
        await service.fetch_normalized(s=None, region="US", limit=5)

    message = str(exc_info.value)
    assert "No news list found in upstream payload" in message
    detail_payload = exc_info.value.detail_payload or {}
    debug = detail_payload.get("debug", {})
    assert debug.get("top_level_keys") == ["foo", "bar", "ok"]
