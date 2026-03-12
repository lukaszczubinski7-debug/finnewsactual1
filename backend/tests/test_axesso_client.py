from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from finnews import main as main_module
from finnews.api import routes as routes_module
from finnews.clients import axesso as axesso_module
from finnews.clients.axesso import AxessoClient
from finnews.errors import UpstreamNewsProviderError


@pytest.mark.anyio
async def test_list_news_retries_with_lower_snippet_count_after_quota_exceeded(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[int] = []
    payload = {"data": {"contents": [{"id": "news-1", "content": {"id": "news-1", "title": "Recovered"}}]}}

    class FakeAsyncClient:
        def __init__(self, *_: object, **__: object) -> None:
            pass

        async def __aenter__(self) -> FakeAsyncClient:
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def request(
            self,
            method: str,
            url: str,
            *,
            params: dict[str, str | int] | None = None,
            headers: dict[str, str] | None = None,
            content: bytes | None = None,
        ) -> httpx.Response:
            del headers, content
            request = httpx.Request(method, url, params=params)
            snippet_count = int((params or {})["snippetCount"])
            calls.append(snippet_count)
            if snippet_count == 50:
                return httpx.Response(403, request=request, text="Quota Exceeded")
            return httpx.Response(200, request=request, json=payload)

    monkeypatch.setattr(axesso_module.httpx, "AsyncClient", FakeAsyncClient)

    client = AxessoClient()
    result = await client.list_news(s="iran", region="US", snippet_count=400)

    assert calls == [50, 25]
    assert result == payload


@pytest.mark.anyio
async def test_list_news_uses_ttl_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[int] = []
    payload = {"data": {"contents": [{"id": "news-1"}]}}

    class FakeAsyncClient:
        def __init__(self, *_: object, **__: object) -> None:
            pass

        async def __aenter__(self) -> FakeAsyncClient:
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def request(
            self,
            method: str,
            url: str,
            *,
            params: dict[str, str | int] | None = None,
            headers: dict[str, str] | None = None,
            content: bytes | None = None,
        ) -> httpx.Response:
            del headers, content
            calls.append(1)
            request = httpx.Request(method, url, params=params)
            return httpx.Response(200, request=request, json=payload)

    monkeypatch.setattr(axesso_module.httpx, "AsyncClient", FakeAsyncClient)

    client = AxessoClient()
    first = await client.list_news(s="iran", region="US", snippet_count=10)
    second = await client.list_news(s="iran", region="US", snippet_count=10)

    assert calls == [1]
    assert first == second == payload


@pytest.mark.anyio
async def test_get_details_uses_ttl_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[int] = []
    payload = {"id": "news-1", "title": "Cached details"}

    class FakeAsyncClient:
        def __init__(self, *_: object, **__: object) -> None:
            pass

        async def __aenter__(self) -> FakeAsyncClient:
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def request(
            self,
            method: str,
            url: str,
            *,
            params: dict[str, str | int] | None = None,
            headers: dict[str, str] | None = None,
            content: bytes | None = None,
        ) -> httpx.Response:
            del headers, content
            calls.append(1)
            request = httpx.Request(method, url, params=params)
            return httpx.Response(200, request=request, json=payload)

    monkeypatch.setattr(axesso_module.httpx, "AsyncClient", FakeAsyncClient)

    client = AxessoClient()
    first = await client.get_details("news-1")
    second = await client.get_details("news-1")

    assert calls == [1]
    assert first == second == payload


def test_health_endpoint_returns_ok() -> None:
    client = TestClient(main_module.app)
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_brief_returns_429_for_quota_exceeded(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_run(**_: object) -> dict[str, object]:
        raise UpstreamNewsProviderError(
            "Axesso quota exceeded",
            reason="quota_exceeded",
            status_code=403,
        )

    monkeypatch.setattr(routes_module.svc, "run", fake_run)

    client = TestClient(main_module.app)
    response = client.post(
        "/brief",
        json={
            "region": "US",
            "tickers": [],
            "query": "iran",
            "context": "Geopolityka",
            "geo_focus": None,
            "window_hours": 72,
            "list_limit": 10,
            "summary_k": 3,
            "style": "krotko",
            "debug": False,
        },
    )

    assert response.status_code == 429
    assert response.json()["detail"]["error"] == "quota_exceeded"
    assert response.json()["detail"]["provider"] == "axesso"
    assert response.json()["detail"]["hint"] == "Lower snippetCount or wait for quota reset"
    assert response.json()["detail"]["request_id"]
