from __future__ import annotations

from types import SimpleNamespace

import pytest

from finnews.api.schemas import BriefRequest
from finnews.services import brief_service as brief_module
from finnews.services.brief_service import (
    BriefService,
    match_items_to_tickers,
    normalize_continents,
    normalize_query,
    normalize_style,
    _prompt_template_name_for_style,
)


def test_match_items_to_tickers_prefers_stock_tickers_metadata() -> None:
    items = [
        {"id": "1", "title": "LPP updates outlook", "tickers": ["LPP.WA"]},
        {"id": "2", "title": "WDC news", "tickers": ["WDC"]},
    ]

    result = match_items_to_tickers(items, ["LPP.WA"])

    assert result == [{"id": "1", "title": "LPP updates outlook", "tickers": ["LPP.WA"]}]


def test_match_items_to_tickers_falls_back_to_title_when_metadata_missing() -> None:
    items = [
        {"id": "1", "title": "LPP SA opens new distribution center", "summary": "", "tickers": []},
        {"id": "2", "title": "Retail market update", "summary": "", "tickers": []},
    ]

    result = match_items_to_tickers(items, ["LPP.WA"])

    assert result == [{"id": "1", "title": "LPP SA opens new distribution center", "summary": "", "tickers": []}]


def test_normalize_style_maps_polish_labels_to_structured_styles() -> None:
    assert normalize_style("krótko") == "short"
    assert normalize_style("normalnie") == "mid"
    assert normalize_style("długo") == "long"


def test_normalize_query_maps_wszystko_to_no_filter() -> None:
    assert normalize_query("Wszystko") is None


def test_normalize_continents_supports_legacy_region_and_defaults() -> None:
    assert normalize_continents(None, region="USA") == ["NA"]
    assert normalize_continents(["EU", "ME", "EU"]) == ["EU", "ME"]
    assert normalize_continents(None, region=None) == ["NA"]


def test_normalize_continents_trims_requests_to_three_entries() -> None:
    assert normalize_continents(["NA", "EU", "ME", "AS"]) == ["NA", "EU", "ME"]


def test_brief_request_defaults_and_legacy_continent_merge() -> None:
    request = BriefRequest()
    legacy = BriefRequest(continent="ME")

    assert request.continents == ["NA"]
    assert request.context == "Geopolityka"
    assert request.list_limit == 20
    assert request.summary_k == 5
    assert "select_k" not in request.model_dump()
    assert legacy.continents == ["ME"]


def test_prompt_template_selection_uses_short_or_long() -> None:
    assert _prompt_template_name_for_style("short").endswith("short.md")
    assert _prompt_template_name_for_style("mid").endswith("long.md")
    assert _prompt_template_name_for_style("long").endswith("long.md")


def _detail_from_item(item: dict[str, object]) -> dict[str, object]:
    return {
        "id": item["id"],
        "title": item["title"],
        "tickers": item.get("tickers", []),
        "provider": item.get("provider", ""),
        "summary": item.get("summary", ""),
        "bodyText": item.get("bodyText", ""),
        "url": item.get("clickUrl"),
        "pubDate": item.get("pubDate"),
    }


@pytest.mark.anyio
async def test_run_merges_continents_fetches_and_dedupes_by_url() -> None:
    service = BriefService()
    fetch_calls: list[dict[str, object]] = []
    list_items = {
        "US": [
            {
                "id": "na-1",
                "title": "Iran threatens shipping route",
                "summary": "Oil supply concerns rise.",
                "tickers": [],
                "provider": "Reuters",
                "pubDate": "2026-03-03T10:00:00Z",
                "clickUrl": "https://example.com/shared-story",
            }
        ],
        "AE": [
            {
                "id": "me-dup",
                "title": "Iran threatens shipping route",
                "summary": "Oil supply concerns rise after warning.",
                "tickers": [],
                "provider": "Reuters",
                "pubDate": "2026-03-03T10:05:00Z",
                "clickUrl": "https://example.com/shared-story",
            },
            {
                "id": "me-2",
                "title": "Israel raises regional readiness",
                "summary": "Sanctions debate intensifies.",
                "tickers": [],
                "provider": "Reuters",
                "pubDate": "2026-03-03T09:40:00Z",
                "clickUrl": "https://example.com/second-story",
            },
        ],
    }

    async def fetch_normalized(**kwargs: object) -> list[dict]:
        fetch_calls.append(dict(kwargs))
        return list_items[str(kwargs["region"])]

    async def fetch_normalized_many(ids: list[str]) -> list[dict]:
        all_items = list_items["US"] + list_items["AE"]
        return [_detail_from_item(item) for item in all_items if item["id"] in ids]

    service.list_service = SimpleNamespace(fetch_normalized=fetch_normalized)
    service.details_service = SimpleNamespace(fetch_normalized_many=fetch_normalized_many)

    result = await service.run(
        region=None,
        continents=["NA", "ME"],
        tickers=[],
        query="war",
        list_limit=20,
        select_k=10,
        summary_k=5,
        style="krótko",
        context="Geopolityka",
        geo_focus="Iran",
        window_hours=72,
    )

    assert fetch_calls == [
        {"s": "war", "region": "US", "limit": 60},
        {"s": "war", "region": "AE", "limit": 60},
    ]
    assert result["continents"] == ["NA", "ME"]
    assert len(result["picked"]) == 2
    assert len(result["sources"]) == 2


@pytest.mark.anyio
async def test_run_short_summary_has_required_keys() -> None:
    service = BriefService()
    list_items = [
        {
            "id": "geo-1",
            "title": "Iran warns of retaliation after missile attack",
            "summary": "Oil supply fears increase near the Strait of Hormuz.",
            "tickers": [],
            "provider": "Reuters",
            "pubDate": "2026-03-03T08:00:00Z",
            "clickUrl": "https://example.com/geo-1",
        },
        {
            "id": "geo-2",
            "title": "Israel steps up regional readiness",
            "summary": "Sanctions debate intensifies as tensions rise.",
            "tickers": [],
            "provider": "Reuters",
            "pubDate": "2026-03-03T07:30:00Z",
            "clickUrl": "https://example.com/geo-2",
        },
    ]

    async def fetch_normalized(**_: object) -> list[dict]:
        return list_items

    async def fetch_normalized_many(ids: list[str]) -> list[dict]:
        return [_detail_from_item(item) for item in list_items if item["id"] in ids]

    service.list_service = SimpleNamespace(fetch_normalized=fetch_normalized)
    service.details_service = SimpleNamespace(fetch_normalized_many=fetch_normalized_many)

    result = await service.run(
        region=None,
        continents=["ME"],
        tickers=[],
        query="war",
        list_limit=20,
        select_k=10,
        summary_k=5,
        style="krótko",
        context="Geopolityka",
        geo_focus="Iran/Israel",
        window_hours=72,
    )

    assert result["style"] == "short"
    assert set(result["summary"]) == {
        "co_sie_stalo",
        "najwazniejsza_reakcja",
        "bezposrednia_konsekwencja_rynkowa",
        "co_obserwowac",
        "sources",
    }
    assert all(result["summary"][key] for key in [
        "co_sie_stalo",
        "najwazniejsza_reakcja",
        "bezposrednia_konsekwencja_rynkowa",
        "co_obserwowac",
    ])
    assert result["sources"]


@pytest.mark.anyio
async def test_run_mid_summary_has_required_keys() -> None:
    service = BriefService()
    list_items = [
        {
            "id": "geo-1",
            "title": "Iran warns of retaliation after missile attack",
            "summary": "Oil supply fears increase near the Strait of Hormuz.",
            "tickers": [],
            "provider": "Reuters",
            "pubDate": "2026-03-03T08:00:00Z",
            "clickUrl": "https://example.com/geo-1",
        },
        {
            "id": "geo-2",
            "title": "US and EU discuss sanctions response",
            "summary": "Diplomatic coordination expands as tensions rise.",
            "tickers": [],
            "provider": "Bloomberg",
            "pubDate": "2026-03-03T07:40:00Z",
            "clickUrl": "https://example.com/geo-2",
        },
    ]

    async def fetch_normalized(**_: object) -> list[dict]:
        return list_items

    async def fetch_normalized_many(ids: list[str]) -> list[dict]:
        return [_detail_from_item(item) for item in list_items if item["id"] in ids]

    service.list_service = SimpleNamespace(fetch_normalized=fetch_normalized)
    service.details_service = SimpleNamespace(fetch_normalized_many=fetch_normalized_many)

    result = await service.run(
        region=None,
        continents=["NA", "ME"],
        tickers=[],
        query="war",
        list_limit=20,
        select_k=10,
        summary_k=5,
        style="normalnie",
        context="Geopolityka",
        geo_focus="Iran/Israel",
        window_hours=72,
    )

    assert result["style"] == "mid"
    assert set(result["summary"]) == {
        "co_sie_stalo",
        "najwazniejsza_reakcja",
        "bezposrednia_konsekwencja_rynkowa",
        "co_obserwowac",
        "sources",
    }
    assert all(result["summary"][key] for key in [
        "co_sie_stalo",
        "najwazniejsza_reakcja",
        "bezposrednia_konsekwencja_rynkowa",
        "co_obserwowac",
    ])


@pytest.mark.anyio
async def test_run_long_summary_has_required_keys() -> None:
    service = BriefService()
    list_items = [
        {
            "id": "geo-1",
            "title": "Iran warns of retaliation after missile attack",
            "summary": "Oil supply fears increase near the Strait of Hormuz.",
            "tickers": [],
            "provider": "Reuters",
            "pubDate": "2026-03-03T08:00:00Z",
            "clickUrl": "https://example.com/geo-1",
        },
        {
            "id": "geo-2",
            "title": "Israel steps up regional readiness",
            "summary": "Sanctions debate intensifies as tensions rise.",
            "tickers": [],
            "provider": "Reuters",
            "pubDate": "2026-03-03T07:30:00Z",
            "clickUrl": "https://example.com/geo-2",
        },
    ]

    async def fetch_normalized(**_: object) -> list[dict]:
        return list_items

    async def fetch_normalized_many(ids: list[str]) -> list[dict]:
        return [_detail_from_item(item) for item in list_items if item["id"] in ids]

    service.list_service = SimpleNamespace(fetch_normalized=fetch_normalized)
    service.details_service = SimpleNamespace(fetch_normalized_many=fetch_normalized_many)

    result = await service.run(
        region=None,
        continents=["ME"],
        tickers=[],
        query="war",
        list_limit=20,
        select_k=10,
        summary_k=5,
        style="długo",
        context="Geopolityka",
        geo_focus="Iran/Israel",
        window_hours=72,
    )

    assert result["style"] == "long"
    assert set(result["summary"]) == {
        "co_sie_stalo",
        "najwazniejsza_reakcja",
        "bezposrednia_konsekwencja_rynkowa",
        "co_obserwowac",
        "sources",
    }
    assert all(result["summary"][key] for key in [
        "co_sie_stalo",
        "najwazniejsza_reakcja",
        "bezposrednia_konsekwencja_rynkowa",
        "co_obserwowac",
    ])


@pytest.mark.anyio
async def test_run_clamps_list_limit_to_hard_max_of_20() -> None:
    service = BriefService()
    fetch_calls: list[dict[str, object]] = []
    list_items = [
        {
            "id": f"story-{index}",
            "title": f"Top story {index}",
            "summary": "Geopolitical update",
            "tickers": [],
            "provider": "Reuters",
            "pubDate": "2026-03-03T10:00:00Z",
            "clickUrl": f"https://example.com/story-{index}",
        }
        for index in range(25)
    ]

    async def fetch_normalized(**kwargs: object) -> list[dict]:
        fetch_calls.append(dict(kwargs))
        return list_items

    async def fetch_normalized_many(ids: list[str]) -> list[dict]:
        return [_detail_from_item(item) for item in list_items if item["id"] in ids]

    service.list_service = SimpleNamespace(fetch_normalized=fetch_normalized)
    service.details_service = SimpleNamespace(fetch_normalized_many=fetch_normalized_many)

    result = await service.run(
        region=None,
        continents=["EU"],
        tickers=[],
        query="war",
        list_limit=50,
        select_k=30,
        summary_k=20,
        style="normalnie",
        context="Geopolityka",
        geo_focus=None,
        window_hours=72,
    )

    assert fetch_calls == [{"s": "war", "region": "GB", "limit": 60}]
    assert len(result["picked"]) == 20
    assert len(result["sources"]) == 20


@pytest.mark.anyio
async def test_run_filters_out_items_older_than_window_hours() -> None:
    service = BriefService()
    list_items = [
        {
            "id": "recent-1",
            "title": "Iran expands military posture",
            "summary": "Recent move",
            "tickers": [],
            "provider": "Reuters",
            "pubDate": "2026-03-03T10:00:00Z",
            "clickUrl": "https://example.com/recent-1",
        },
        {
            "id": "old-1",
            "title": "Older regional story",
            "summary": "Out of window",
            "tickers": [],
            "provider": "Reuters",
            "pubDate": "2026-02-26T08:00:00Z",
            "clickUrl": "https://example.com/old-1",
        },
    ]

    async def fetch_normalized(**_: object) -> list[dict]:
        return list_items

    async def fetch_normalized_many(ids: list[str]) -> list[dict]:
        return [_detail_from_item(item) for item in list_items if item["id"] in ids]

    service.list_service = SimpleNamespace(fetch_normalized=fetch_normalized)
    service.details_service = SimpleNamespace(fetch_normalized_many=fetch_normalized_many)

    original_utc_now = brief_module._utc_now
    brief_module._utc_now = lambda: brief_module.datetime(2026, 3, 3, 12, 0, tzinfo=brief_module.UTC)
    try:
        result = await service.run(
            region=None,
            continents=["ME"],
            tickers=[],
            query="war",
            list_limit=20,
            select_k=10,
            summary_k=5,
            style="normalnie",
            context="Geopolityka",
            geo_focus="Iran",
            window_hours=72,
        )
    finally:
        brief_module._utc_now = original_utc_now

    assert [item["id"] for item in result["picked"]] == ["recent-1"]


@pytest.mark.anyio
async def test_run_trims_continents_to_three_before_fetching() -> None:
    service = BriefService()
    fetch_calls: list[dict[str, object]] = []
    sample_item = {
        "id": "trim-1",
        "title": "Regional tensions continue",
        "summary": "Market participants monitor energy routes.",
        "tickers": [],
        "provider": "Reuters",
        "pubDate": "2026-03-03T10:00:00Z",
        "clickUrl": "https://example.com/trim-1",
    }

    async def fetch_normalized(**kwargs: object) -> list[dict]:
        fetch_calls.append(dict(kwargs))
        return [sample_item]

    async def fetch_normalized_many(ids: list[str]) -> list[dict]:
        if sample_item["id"] in ids:
            return [_detail_from_item(sample_item)]
        return []

    service.list_service = SimpleNamespace(fetch_normalized=fetch_normalized)
    service.details_service = SimpleNamespace(fetch_normalized_many=fetch_normalized_many)

    result = await service.run(
        region=None,
        continents=["NA", "EU", "ME", "AS", "AF"],
        tickers=[],
        query="war",
        list_limit=20,
        select_k=10,
        summary_k=5,
        style="normalnie",
        context="Geopolityka",
        geo_focus=None,
        window_hours=72,
    )

    assert result["continents"] == ["NA", "EU", "ME"]
    assert [call["region"] for call in fetch_calls] == ["US", "GB", "AE"]


@pytest.mark.anyio
async def test_run_returns_fallback_when_no_items_selected_and_exposes_debug_counts() -> None:
    service = BriefService()

    async def fetch_normalized(**_: object) -> list[dict]:
        return []

    async def fetch_normalized_many(ids: list[str]) -> list[dict]:
        return []

    service.list_service = SimpleNamespace(fetch_normalized=fetch_normalized)
    service.details_service = SimpleNamespace(fetch_normalized_many=fetch_normalized_many)

    result = await service.run(
        region=None,
        continents=["NA"],
        tickers=[],
        query="war",
        list_limit=20,
        select_k=10,
        summary_k=5,
        style="normalnie",
        context="Geopolityka",
        geo_focus=None,
        window_hours=72,
        debug=True,
    )

    assert result["status"] == "fallback"
    assert result["summary"]["co_sie_stalo"]
    assert result["summary"]["najwazniejsza_reakcja"]
    assert result["summary"]["bezposrednia_konsekwencja_rynkowa"]
    assert result["summary"]["co_obserwowac"]
    assert result["summary"]["sources"] == []
    assert result["debug"]["list_fetch_status"] == "ok"


@pytest.mark.anyio
async def test_run_returns_cached_response_without_second_upstream_call() -> None:
    service = BriefService()
    fetch_call_count = 0
    detail_call_count = 0
    list_items = [
        {
            "id": "cache-1",
            "title": "Iran signals shipping risks",
            "summary": "Oil market watches Strait of Hormuz.",
            "tickers": [],
            "provider": "Reuters",
            "pubDate": "2026-03-03T10:00:00Z",
            "clickUrl": "https://example.com/cache-1",
        }
    ]

    async def fetch_normalized(**_: object) -> list[dict]:
        nonlocal fetch_call_count
        fetch_call_count += 1
        return list_items

    async def fetch_normalized_many(ids: list[str]) -> list[dict]:
        nonlocal detail_call_count
        detail_call_count += 1
        return [_detail_from_item(item) for item in list_items if item["id"] in ids]

    service.list_service = SimpleNamespace(fetch_normalized=fetch_normalized)
    service.details_service = SimpleNamespace(fetch_normalized_many=fetch_normalized_many)

    first = await service.run(
        region=None,
        continents=["ME"],
        tickers=[],
        query="war",
        list_limit=20,
        select_k=10,
        summary_k=5,
        style="krotko",
        context="Geopolityka",
        geo_focus="Iran",
        window_hours=72,
    )
    second = await service.run(
        region=None,
        continents=["ME"],
        tickers=[],
        query="war",
        list_limit=20,
        select_k=10,
        summary_k=5,
        style="krotko",
        context="Geopolityka",
        geo_focus="Iran",
        window_hours=72,
    )

    assert second == first
    assert fetch_call_count == 1
    assert detail_call_count == 1
