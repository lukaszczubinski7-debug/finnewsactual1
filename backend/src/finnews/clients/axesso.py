from __future__ import annotations

import asyncio
from copy import deepcopy
import logging
from urllib.error import URLError

import httpx
from cachetools import TTLCache

from finnews.errors import UpstreamNewsProviderError
from finnews.settings import settings

logger = logging.getLogger(__name__)
_AXESSO_MAX_ATTEMPTS = 2
_AXESSO_RETRY_BACKOFF_S = 0.5
_DEFAULT_SNIPPET_COUNT = 50
_QUOTA_FALLBACK_SNIPPET_COUNTS = (25, 10)
_AXESSO_CACHE_TTL_S = 600
_AXESSO_LIST_CACHE_MAXSIZE = 128
_AXESSO_DETAILS_CACHE_MAXSIZE = 512


def mask_key(val: str) -> str:
    if not val:
        return "***"
    if len(val) <= 6:
        return "*" * len(val)
    return f"{val[:6]}***"


class AxessoClient:
    def __init__(self) -> None:
        self.base_url = settings.axesso_base_url.rstrip("/")
        self.timeout = settings.axesso_timeout_s
        self.auth_mode = self._resolve_auth_mode()
        self._list_cache: TTLCache[tuple[object, ...], dict] = TTLCache(
            maxsize=_AXESSO_LIST_CACHE_MAXSIZE,
            ttl=_AXESSO_CACHE_TTL_S,
        )
        self._details_cache: TTLCache[tuple[object, ...], dict] = TTLCache(
            maxsize=_AXESSO_DETAILS_CACHE_MAXSIZE,
            ttl=_AXESSO_CACHE_TTL_S,
        )

    def _resolve_auth_mode(self) -> str:
        configured_mode = (settings.axesso_auth_mode or "auto").strip().lower()
        if configured_mode == "rapidapi":
            return "rapidapi"
        if configured_mode == "direct":
            return "direct"
        if settings.axesso_rapidapi_host:
            return "rapidapi"
        return "direct"

    def _build_direct_auth_header(self) -> tuple[str, str] | None:
        if not settings.axesso_api_key:
            return None

        header_name = (settings.axesso_api_key_header or "axesso-api-key").strip() or "axesso-api-key"
        prefix = settings.axesso_api_key_prefix or ""

        if header_name.lower() == "authorization" and not prefix:
            prefix = "Bearer "

        return header_name, f"{prefix}{settings.axesso_api_key}"

    def _headers(self) -> tuple[dict[str, str], str | None]:
        headers: dict[str, str] = {"Cache-Control": "no-cache"}
        key_header_name: str | None = None

        if self.auth_mode == "rapidapi":
            key_header_name = "x-rapidapi-key"
            headers["x-rapidapi-key"] = settings.axesso_api_key
            headers["x-rapidapi-host"] = settings.axesso_rapidapi_host
            return headers, key_header_name

        headers["Content-Type"] = "text/plain"
        auth_header = self._build_direct_auth_header()
        if auth_header:
            header_name, header_value = auth_header
            key_header_name = header_name
            headers[header_name] = header_value
        return headers, key_header_name

    def _sanitize_url(self, request_url: httpx.URL) -> str:
        if "subscription-key" in request_url.params:
            return str(request_url.copy_set_param("subscription-key", "***"))
        return str(request_url)

    def _log_debug(
        self,
        *,
        request_url: httpx.URL,
        status_code: int | None,
        header_name: str | None,
        header_value: str | None,
    ) -> None:
        if not settings.axesso_debug:
            return

        logger.info(
            "Axesso request url=%s status_code=%s header_name=%s value_masked=%s",
            self._sanitize_url(request_url),
            status_code,
            header_name,
            mask_key(header_value or ""),
        )

    async def _request_json(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        header_name: str | None,
        params: dict[str, str | int],
        content: bytes | None = None,
    ) -> dict:
        response = await self._request_response(
            method=method,
            url=url,
            headers=headers,
            header_name=header_name,
            params=params,
            content=content,
        )
        return response.json()

    async def _request_response(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        header_name: str | None,
        params: dict[str, str | int],
        content: bytes | None = None,
    ) -> httpx.Response:
        header_value = headers.get(header_name) if header_name else None
        last_error: Exception | None = None

        for attempt in range(1, _AXESSO_MAX_ATTEMPTS + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.request(
                        method,
                        url,
                        params=params,
                        headers=headers,
                        content=content,
                    )
                    self._log_debug(
                        request_url=response.request.url,
                        status_code=response.status_code,
                        header_name=header_name,
                        header_value=header_value,
                    )
                    response.raise_for_status()
                    return response
            except httpx.HTTPStatusError as exc:
                last_error = exc
                status_code = exc.response.status_code
                should_retry = status_code == 429 or status_code >= 500
                if should_retry and attempt < _AXESSO_MAX_ATTEMPTS:
                    await asyncio.sleep(_AXESSO_RETRY_BACKOFF_S)
                    continue
                raise
            except (httpx.TimeoutException, httpx.RequestError, URLError) as exc:
                last_error = exc
                if attempt < _AXESSO_MAX_ATTEMPTS:
                    await asyncio.sleep(_AXESSO_RETRY_BACKOFF_S)
                    continue
                raise UpstreamNewsProviderError("Axesso request failed") from exc

        raise UpstreamNewsProviderError("Axesso request failed") from last_error

    def _snippet_count_candidates(self, snippet_count: int | None) -> list[int]:
        initial = _DEFAULT_SNIPPET_COUNT if snippet_count is None else max(1, min(int(snippet_count), _DEFAULT_SNIPPET_COUNT))
        candidates = [initial]
        for fallback in _QUOTA_FALLBACK_SNIPPET_COUNTS:
            if fallback < initial and fallback not in candidates:
                candidates.append(fallback)
        return candidates[:3]

    @staticmethod
    def _is_quota_exceeded_error(exc: httpx.HTTPStatusError) -> bool:
        if exc.response.status_code != 403:
            return False
        response_text = (exc.response.text or "").casefold()
        return "quota exceeded" in response_text

    @staticmethod
    def _cache_lookup(cache: TTLCache[tuple[object, ...], dict], key: tuple[object, ...]) -> dict | None:
        cached = cache.get(key)
        if cached is None:
            return None
        return deepcopy(cached)

    @staticmethod
    def _cache_store(cache: TTLCache[tuple[object, ...], dict], key: tuple[object, ...], payload: dict) -> dict:
        cache[key] = deepcopy(payload)
        return deepcopy(payload)

    async def list_news(
        self,
        *,
        s: str | None = None,
        region: str | None = None,
        snippet_count: int | None = None,
        subscription_key_param: str | None = None,
    ) -> dict:
        cache_key = ("list_news", s or "", region or "", int(snippet_count) if snippet_count is not None else None, subscription_key_param or "")
        cached = self._cache_lookup(self._list_cache, cache_key)
        if cached is not None:
            return cached

        url = f"{self.base_url}/news-v2-list"
        headers, header_name = self._headers()
        last_quota_error: httpx.HTTPStatusError | None = None

        for candidate_snippet_count in self._snippet_count_candidates(snippet_count):
            params: dict[str, str | int] = {}
            if s:
                params["s"] = s
            if region:
                params["region"] = region
            params["snippetCount"] = candidate_snippet_count
            if subscription_key_param is not None:
                params["subscription-key"] = subscription_key_param

            try:
                response = await self._request_response(
                    method="POST",
                    url=url,
                    headers=headers,
                    header_name=header_name,
                    params=params,
                    content=b"",
                )
                return self._cache_store(self._list_cache, cache_key, response.json())
            except httpx.HTTPStatusError as exc:
                if self._is_quota_exceeded_error(exc):
                    last_quota_error = exc
                    continue
                raise UpstreamNewsProviderError(
                    "Axesso HTTP error",
                    status_code=exc.response.status_code,
                ) from exc

        if last_quota_error is not None:
            raise UpstreamNewsProviderError(
                "Axesso quota exceeded",
                reason="quota_exceeded",
                status_code=403,
            ) from last_quota_error

        raise UpstreamNewsProviderError("Axesso request failed")

    async def list_news_with_headers(
        self,
        *,
        headers: dict[str, str],
        s: str | None = None,
        region: str | None = None,
        snippet_count: int | None = None,
        subscription_key_param: str | None = None,
    ) -> tuple[int, str, dict | None]:
        """
        Zwraca (status_code, response_text_trimmed_500).
        Nie rzuca wyjątku: NIE używaj raise_for_status().
        """
        url = f"{self.base_url}/news-v2-list"
        request_headers = {
            "Content-Type": "text/plain",
            "Cache-Control": "no-cache",
        }
        request_headers.update(headers)

        params = {}
        if s:
            params["s"] = s
        if region:
            params["region"] = region
        if snippet_count is not None:
            params["snippetCount"] = snippet_count
        if subscription_key_param is not None:
            params["subscription-key"] = subscription_key_param

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, params=params, headers=request_headers, content=b"")
            used_header_name = next(
                (k for k in headers.keys() if k.lower() not in {"cache-control", "content-type"}),
                None,
            )
            used_header_value = headers.get(used_header_name) if used_header_name else None
            self._log_debug(
                request_url=response.request.url,
                status_code=response.status_code,
                header_name=used_header_name,
                header_value=used_header_value,
            )
            parsed_json: dict | None
            try:
                loaded = response.json()
                parsed_json = loaded if isinstance(loaded, dict) else None
            except Exception:
                parsed_json = None
            return response.status_code, (response.text or "")[:500], parsed_json

    async def get_details(self, news_uuid: str) -> dict:
        cache_key = ("get_details", news_uuid)
        cached = self._cache_lookup(self._details_cache, cache_key)
        if cached is not None:
            return cached

        url = f"{self.base_url}/news-v2-get-details"
        params = {"uuid": news_uuid}
        headers, header_name = self._headers()

        payload = await self._request_json(
            method="GET",
            url=url,
            headers=headers,
            header_name=header_name,
            params=params,
        )
        return self._cache_store(self._details_cache, cache_key, payload)
