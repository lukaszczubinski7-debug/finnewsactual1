from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


BriefContext = Literal[
    "Geopolityka",
    "Makro",
    "Wyniki spolek (earnings)",
    "Stopy / banki centralne",
    "Surowce / energia",
    "Crypto",
    "Polska / GPW",
    "Technologia",
]


class BriefRequest(BaseModel):
    continents: list[str] | None = None
    continent: str | None = None
    region: str | None = None
    tickers: list[str] | None = Field(default_factory=list)
    query: str | None = None
    context: BriefContext | None = "Geopolityka"
    geo_focus: str | None = None
    debug: bool = False
    window_hours: Literal[24, 72, 168] = 72
    list_limit: int | None = 20
    summary_k: int = Field(default=5, ge=3, le=10)
    style: str = "krótko"

    @model_validator(mode="before")
    @classmethod
    def _normalize_continent_inputs(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        raw_continents = data.get("continents")
        if isinstance(raw_continents, str):
            continents = [raw_continents]
        elif isinstance(raw_continents, list):
            continents = list(raw_continents)
        else:
            legacy_single = data.get("continent") or data.get("region")
            continents = [legacy_single] if legacy_single else ["NA"]

        data["continents"] = continents or ["NA"]
        if data.get("list_limit") is None:
            data["list_limit"] = 20
        if data.get("context") is None:
            data["context"] = "Geopolityka"
        return data


class NormalizedListItem(BaseModel):
    id: str
    title: str
    summary: str = ""
    provider: str | None = None
    pubDate: str | None = None
    clickUrl: str | None = None
    tickers: list[str] = Field(default_factory=list)
    isHosted: bool = False


class NormalizedDetailsItem(BaseModel):
    id: str
    title: str | None = None
    provider: str | None = None
    pubDate: str | None = None
    summary: str = ""
    tickers: list[str] = Field(default_factory=list)
    url: str | None = None
    bodyText: str = ""


class BriefFocus(BaseModel):
    geo_focus: str = ""
    custom_query: str = ""


class BriefSource(BaseModel):
    id: str
    title: str
    provider: str = ""
    published_at: str | None = None
    url: str | None = None


class BriefResponse(BaseModel):
    status: Literal["ok", "fallback"] = "ok"
    style: Literal["short", "mid", "long"]
    context: str
    window_hours: int
    continents: list[str] = Field(default_factory=list)
    focus: BriefFocus
    summary: dict[str, Any] = Field(default_factory=dict)
    sources: list[BriefSource] = Field(default_factory=list)


class ThreadCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    assets: str | None = Field(default=None, max_length=500)
    horizon_days: Literal[7, 30, 90] = 30
    extra_context: str | None = None


class ThreadResponse(BaseModel):
    id: int
    name: str
    assets: str | None
    horizon_days: int
    extra_context: str | None
    status: str
    new_events_count: int
    context_snapshot: dict[str, Any] | None
    created_at: str
    last_refreshed_at: str | None


class ThreadSuggestionResponse(BaseModel):
    suggest: bool
    name: str | None = None
    assets: str | None = None
    horizon_days: int | None = None
    reason: str | None = None
